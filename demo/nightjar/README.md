# nightjar

A tiny terminal pastebin. One binary, no dependencies, pastes stored as
a JSON file on disk.

## Install

```sh
go build -o nj ./cmd/nj
```

## Usage

```sh
nj add notes.txt        # add a paste from a file, prints its id
echo "hello" | nj add - # add a paste from stdin
nj list                 # list all pastes, newest first
nj get <id>             # print a paste's content to stdout
nj rm <id>              # delete a paste
nj serve                # serve the web UI + API (default 127.0.0.1:8420)
nj serve --addr :9000   # serve on a custom address
```

Pastes live in `~/.nightjar/pastes.json`. Set `NIGHTJAR_DIR` to use a
different directory:

```sh
NIGHTJAR_DIR=/tmp/nj-demo nj add notes.txt
```

## HTTP API

Run `nj serve`, then:

| Method | Path               | Description                       |
| ------ | ------------------ | --------------------------------- |
| GET    | `/`                | Web index page (HTML)             |
| GET    | `/api/pastes`      | List all pastes (JSON)            |
| POST   | `/api/pastes`      | Create a paste, returns its id    |
| GET    | `/api/pastes/{id}` | Fetch a single paste              |

`POST /api/pastes` accepts either a JSON body (`{"content": "..."}`
with `Content-Type: application/json`) or a raw text body:

```sh
curl -s -X POST --data-binary @notes.txt http://127.0.0.1:8420/api/pastes
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"content":"hello from the api"}' http://127.0.0.1:8420/api/pastes
```

## Development

```sh
go test ./...
go vet ./...
```
