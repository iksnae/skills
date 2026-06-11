// Package store persists pastes as a single JSON file on disk.
package store

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// ErrNotFound is returned when no paste matches the requested id.
var ErrNotFound = errors.New("paste not found")

// Paste is a single stored snippet of text.
type Paste struct {
	ID      string `json:"id"`
	Content string `json:"content"`
	Created int64  `json:"created"`
}

// Store reads and writes pastes under a base directory.
type Store struct {
	dir string
}

// New returns a Store rooted at dir. If dir is empty it falls back to
// the NIGHTJAR_DIR environment variable, then ~/.nightjar.
func New(dir string) *Store {
	if dir == "" {
		dir = os.Getenv("NIGHTJAR_DIR")
	}
	if dir == "" {
		home, _ := os.UserHomeDir()
		dir = filepath.Join(home, ".nightjar")
	}
	return &Store{dir: dir}
}

func (s *Store) File() string {
	return filepath.Join(s.dir, "pastes.json")
}

// Load returns all pastes currently on disk, newest first. A missing
// file is treated as an empty store.
func (s *Store) Load() ([]Paste, error) {
	data, err := os.ReadFile(s.File())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var pastes []Paste
	if err := json.Unmarshal(data, &pastes); err != nil {
		return nil, err
	}
	sort.Slice(pastes, func(i, j int) bool {
		return pastes[i].Created > pastes[j].Created
	})
	return pastes, nil
}

// Save writes the full paste set to disk, creating the directory if needed.
func (s *Store) Save(pastes []Paste) error {
	if err := os.MkdirAll(s.dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(pastes, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.File(), data, 0644)
}

// Add appends a paste with a fresh id and returns it.
func (s *Store) Add(content string) (Paste, error) {
	pastes, err := s.Load()
	if err != nil {
		return Paste{}, err
	}
	p := Paste{ID: newID(), Content: content, Created: time.Now().Unix()}
	pastes = append(pastes, p)
	if err := s.Save(pastes); err != nil {
		return Paste{}, err
	}
	return p, nil
}

// Get returns the paste with the given id.
func (s *Store) Get(id string) (Paste, error) {
	data, err := os.ReadFile(s.File())
	if err != nil {
		return Paste{}, err
	}
	var pastes []Paste
	if err := json.Unmarshal(data, &pastes); err != nil {
		return Paste{}, err
	}
	for _, p := range pastes {
		if p.ID == id {
			return p, nil
		}
	}
	return Paste{}, ErrNotFound
}

// Remove deletes the paste with the given id, returning ErrNotFound
// if no paste matches.
func (s *Store) Remove(id string) error {
	pastes, err := s.Load()
	if err != nil {
		return err
	}
	kept := pastes[:0]
	for _, p := range pastes {
		if p.ID != id {
			kept = append(kept, p)
		}
	}
	if len(kept) == len(pastes) {
		return ErrNotFound
	}
	return s.Save(kept)
}

func newID() string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 6)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(36))
		b[i] = alphabet[n.Int64()]
	}
	return string(b)
}
