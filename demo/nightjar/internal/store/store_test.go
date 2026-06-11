package store

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAddAndGet(t *testing.T) {
	st := New(t.TempDir())
	p, err := st.Add("hello world")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if len(p.ID) != 6 {
		t.Errorf("id length = %d, want 6", len(p.ID))
	}
	if p.Created == 0 {
		t.Error("Created not set")
	}
	got, err := st.Get(p.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Content != "hello world" {
		t.Errorf("Content = %q, want %q", got.Content, "hello world")
	}
}

func TestLoadEmptyStore(t *testing.T) {
	st := New(t.TempDir())
	pastes, err := st.Load()
	if err != nil {
		t.Fatalf("Load on empty store: %v", err)
	}
	if len(pastes) != 0 {
		t.Errorf("got %d pastes, want 0", len(pastes))
	}
}

func TestGetNotFound(t *testing.T) {
	st := New(t.TempDir())
	if _, err := st.Add("something"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	_, err := st.Get("zzzzzz")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestAddPersistsAcrossInstances(t *testing.T) {
	dir := t.TempDir()
	st := New(dir)
	if _, err := st.Add("one"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := st.Add("two"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "pastes.json")); err != nil {
		t.Fatalf("pastes.json missing: %v", err)
	}
	st2 := New(dir)
	pastes, err := st2.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(pastes) != 2 {
		t.Errorf("got %d pastes, want 2", len(pastes))
	}
}

func TestNewIDCharset(t *testing.T) {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	for i := 0; i < 20; i++ {
		id := newID()
		if len(id) != 6 {
			t.Fatalf("len(%q) = %d, want 6", id, len(id))
		}
		for _, c := range id {
			if !strings.ContainsRune(alphabet, c) {
				t.Fatalf("id %q contains %q outside base36 alphabet", id, c)
			}
		}
	}
}
