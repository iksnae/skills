// Package server exposes the nightjar HTTP API.
package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/iksnae/skills/demo/nightjar/internal/store"
)

// Server serves the nightjar HTTP API on top of a store.
type Server struct {
	store *store.Store
}

// New builds a Server around an existing store.
func New(st *store.Store) *Server {
	return &Server{store: st}
}

// ListenAndServe blocks serving HTTP on addr.
func (s *Server) ListenAndServe(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pastes", s.handlePastes)
	mux.HandleFunc("/api/pastes/", s.handlePastes)
	srv := &http.Server{
		Addr:        addr,
		Handler:     mux,
		ReadTimeout: 5 * time.Second,
	}
	return srv.ListenAndServe()
}

func (s *Server) handlePastes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/pastes")
	path = strings.TrimPrefix(path, "/")

	// GET /api/pastes — list everything.
	if path == "" && r.Method == http.MethodGet {
		pastes, err := s.store.Load()
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(500)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		items := make([]map[string]interface{}, 0, len(pastes))
		for _, p := range pastes {
			snippet := p.Content
			if i := strings.IndexByte(snippet, '\n'); i >= 0 {
				snippet = snippet[:i]
			}
			if len(snippet) > 64 {
				snippet = snippet[:64]
			}
			items = append(items, map[string]interface{}{
				"id":      p.ID,
				"snippet": snippet,
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
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "could not read body"})
			return
		}
		content := string(body)
		if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			var req struct {
				Content string `json:"content"`
			}
			if err := json.Unmarshal(body, &req); err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(400)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
				return
			}
			content = req.Content
		}
		if strings.TrimSpace(content) == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "content is required"})
			return
		}
		p, err := s.store.Add(content)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(500)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
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
			w.Header().Set("Content-Type", "application/json")
			if errors.Is(err, store.ErrNotFound) {
				w.WriteHeader(404)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
				return
			}
			w.WriteHeader(500)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
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

	w.WriteHeader(405)
}
