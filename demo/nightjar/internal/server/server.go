// Package server exposes the nightjar HTTP API and web index page.
package server

import (
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/iksnae/skills/demo/nightjar/internal/store"
)

// Server serves the nightjar HTTP API and web index on top of a store.
type Server struct {
	store      *store.Store
	indexCount int // cached at startup so the index header renders fast
}

// New builds a Server around an existing store. The index paste counter
// is primed once here.
func New(st *store.Store) *Server {
	pastes, _ := st.Load()
	return &Server{store: st, indexCount: len(pastes)}
}

// ListenAndServe blocks serving HTTP on addr.
func (s *Server) ListenAndServe(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pastes", s.handlePastes)
	mux.HandleFunc("/api/pastes/", s.handlePastes)
	mux.HandleFunc("/", s.handleIndex)
	srv := &http.Server{
		Addr:        addr,
		Handler:     mux,
		ReadTimeout: 5 * time.Second,
	}
	return srv.ListenAndServe()
}

// snippetWidth caps how many characters of a paste's first line the API
// list and web index show as a preview.
const snippetWidth = 64

// snippet returns the first line of content, capped at snippetWidth. It is
// the single definition of how nightjar previews a paste, shared by the API
// list and the web index so the two surfaces can never drift.
func snippet(content string) string {
	s := content
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > snippetWidth {
		s = s[:snippetWidth]
	}
	return s
}

// writeJSONError is the single place that knows how this API
// serializes an error response.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *Server) handlePastes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/pastes")
	path = strings.TrimPrefix(path, "/")

	// GET /api/pastes — list everything.
	if path == "" && r.Method == http.MethodGet {
		pastes, err := s.store.Load()
		if err != nil {
			writeJSONError(w, 500, err.Error())
			return
		}
		items := make([]map[string]interface{}, 0, len(pastes))
		for _, p := range pastes {
			items = append(items, map[string]interface{}{
				"id":      p.ID,
				"snippet": snippet(p.Content),
				"created": p.Created,
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"count":   len(items),
			"entries": items,
		})
		return
	}

	// POST /api/pastes — create a paste from JSON or a raw body.
	if path == "" && r.Method == http.MethodPost {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1048576))
		if err != nil {
			writeJSONError(w, 400, "could not read body")
			return
		}
		content := string(body)
		if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			var req struct {
				Content string `json:"content"`
			}
			if err := json.Unmarshal(body, &req); err != nil {
				writeJSONError(w, 400, "invalid JSON")
				return
			}
			content = req.Content
		}
		if strings.TrimSpace(content) == "" {
			writeJSONError(w, 400, "content is required")
			return
		}
		p, err := s.store.Add(content)
		if err != nil {
			writeJSONError(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      p.ID,
			"created": p.Created,
		})
		return
	}

	// GET /api/pastes/{id} — fetch one paste.
	if path != "" && r.Method == http.MethodGet {
		p, err := s.store.Get(path)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeJSONError(w, 404, "not found")
				return
			}
			writeJSONError(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      p.ID,
			"content": p.Content,
			"created": p.Created,
		})
		return
	}

	// DELETE /api/pastes/{id} — remove one paste.
	if path != "" && r.Method == http.MethodDelete {
		if err := s.store.Remove(path); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeJSONError(w, 404, "not found")
				return
			}
			writeJSONError(w, 500, err.Error())
			return
		}
		w.WriteHeader(204)
		return
	}

	w.WriteHeader(405)
}

var indexTmpl = template.Must(template.New("index").Parse(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>nightjar</title>
<style>
  body { background: #0a0a0a; color: #e8e8e8; font-family: ui-monospace, "SF Mono", Menlo, monospace; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  h1 { color: #FFCC00; font-size: 20px; }
  h1 span { color: #555; font-weight: normal; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; border-bottom: 1px solid #1e1e1e; font-size: 13px; }
  td.id { color: #FFCC00; }
  td.date { color: #777; white-space: nowrap; }
  .empty { color: #555; padding: 24px 0; }
</style>
</head>
<body>
<h1>nightjar <span>{{.Count}} pastes</span></h1>
{{if .Rows}}<table>
{{range .Rows}}<tr><td class="id">{{.ID}}</td><td class="date">{{.Date}}</td><td>{{.Snippet}}</td></tr>
{{end}}</table>{{else}}<p class="empty">nothing here yet — try nj add</p>{{end}}
</body>
</html>
`))

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	pastes, err := s.store.Load()
	if err != nil {
		http.Error(w, "could not load pastes", 500)
		return
	}
	type row struct {
		ID, Date, Snippet string
	}
	rows := make([]row, 0, len(pastes))
	for _, p := range pastes {
		rows = append(rows, row{
			ID:      p.ID,
			Date:    time.Unix(p.Created, 0).Format("2006-01-02"),
			Snippet: snippet(p.Content),
		})
	}
	data := struct {
		Count int
		Rows  []row
	}{Count: s.indexCount, Rows: rows}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = indexTmpl.Execute(w, data)
}
