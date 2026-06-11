// Command nj is a tiny terminal pastebin.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/iksnae/skills/demo/nightjar/internal/server"
	"github.com/iksnae/skills/demo/nightjar/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	st := store.New("")
	switch os.Args[1] {
	case "add":
		cmdAdd(st, os.Args[2:])
	case "list":
		cmdList(st)
	case "get":
		cmdGet(st, os.Args[2:])
	case "rm":
		cmdRm(st, os.Args[2:])
	case "serve":
		cmdServe(st, os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "nj: unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: nj <add|list|get|rm|serve> [args]")
}

func cmdAdd(st *store.Store, args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: nj add <file|->")
		os.Exit(2)
	}
	var data []byte
	var err error
	if args[0] == "-" {
		data, err = io.ReadAll(os.Stdin)
	} else {
		data, err = os.ReadFile(args[0])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	p, err := st.Add(string(data))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(p.ID)
}

func cmdList(st *store.Store) {
	pastes, err := st.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for _, p := range pastes {
		snippet := p.Content
		if i := strings.IndexByte(snippet, '\n'); i >= 0 {
			snippet = snippet[:i]
		}
		if len(snippet) > 40 {
			snippet = snippet[:40] + "..."
		}
		when := time.Unix(p.Created, 0).Format(time.RFC822)
		fmt.Printf("%s  %s  %s\n", p.ID, when, snippet)
	}
	fmt.Printf("%d pastes\n", len(pastes))
}

func cmdGet(st *store.Store, args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: nj get <id>")
		os.Exit(2)
	}
	p, err := st.Get(args[0])
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Print(p.Content)
}

func cmdRm(st *store.Store, args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: nj rm <id>")
		os.Exit(2)
	}
	id := args[0]
	if err := st.Remove(id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fmt.Fprintf(os.Stderr, "nj: no paste with id %q\n", id)
		} else {
			fmt.Fprintln(os.Stderr, err)
		}
		os.Exit(1)
	}
	fmt.Printf("removed %s\n", id)
}

func cmdServe(st *store.Store, args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:8420", "listen address")
	_ = fs.Parse(args)
	srv := server.New(st)
	fmt.Printf("nightjar listening on http://%s\n", *addr)
	if err := srv.ListenAndServe(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
