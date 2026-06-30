package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/iksnae/skills/demo/nightjar/internal/store"
)

func newTestServer(t *testing.T) (*Server, *store.Store) {
	t.Helper()
	st := store.New(t.TempDir())
	return New(st), st
}

// TestSnippetFirstLineAndCap pins the preview behavior the API list and web
// index used to compute inline in two places. Characterizes current output so
// the extracted helper can never silently change it.
func TestSnippetFirstLineAndCap(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"short single line", "hello", "hello"},
		{"first line only", "first\nsecond", "first"},
		{"caps at width", strings.Repeat("x", 80), strings.Repeat("x", 64)},
		{"first line then cap", strings.Repeat("y", 80) + "\nrest", strings.Repeat("y", 64)},
		{"empty", "", ""},
	}
	for _, c := range cases {
		if got := snippet(c.in); got != c.want {
			t.Errorf("%s: snippet(%q) = %q, want %q", c.name, c.in, got, c.want)
		}
	}
}

func TestDeletePaste(t *testing.T) {
	srv, st := newTestServer(t)
	p, err := st.Add("doomed")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	req := httptest.NewRequest("DELETE", "/api/pastes/"+p.ID, nil)
	rec := httptest.NewRecorder()
	srv.handlePastes(rec, req)

	if rec.Code != 204 {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if _, err := st.Get(p.ID); err == nil {
		t.Error("paste still present after DELETE")
	}
}

func TestDeletePasteNotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	req := httptest.NewRequest("DELETE", "/api/pastes/zzzzzz", nil)
	rec := httptest.NewRecorder()
	srv.handlePastes(rec, req)

	if rec.Code != 404 {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestDeleteCollectionNotAllowed(t *testing.T) {
	srv, _ := newTestServer(t)

	req := httptest.NewRequest("DELETE", "/api/pastes", nil)
	rec := httptest.NewRecorder()
	srv.handlePastes(rec, req)

	if rec.Code != 405 {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}
