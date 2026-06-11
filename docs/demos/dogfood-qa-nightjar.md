# Dogfood QA — nightjar

*Produced by the `dogfood-qa` skill against `demo/nightjar` (a fictional
terminal pastebin), 2026-06-11. Observation-only: findings were filed, not
fixed; step 5 (re-verify after fixes) is pending a remediation cycle.*

## 1 · Target and surfaces

Built from a clean tree: `go build -o /tmp/nj ./cmd/nj` (exit 0). All runs
used throwaway state via `NIGHTJAR_DIR` (`/tmp/nj-qa*`); the repo and the
real `~/.nightjar` were never touched. Server runs bound to
`127.0.0.1:8421–8423` with curl timeouts.

Surfaces discovered:

| Surface | What it exposes |
|---|---|
| CLI `nj` | `add <file\|->`, `list`, `get <id>`, `serve [--addr]` — plus `rm <id>` *promised by the README only* |
| HTTP API | `GET /api/pastes`, `POST /api/pastes` (JSON or raw), `GET /api/pastes/{id}` |
| Web | `GET /` index page (header count + paste table) |
| Durable state | `$NIGHTJAR_DIR/pastes.json` (single JSON array) |

## 2 · Workflow exercised

Followed the README top to bottom as a first-time user: build → `add` from
file → `add` from stdin → `list` → `get` → `rm` → `serve` → both documented
curl forms → web index. Then edge cases (missing id, fresh empty store,
empty content, no args, wrong method) and fault injection (corrupt
`pastes.json`, multi-byte content).

Representative transcript (CLI):

```
$ /tmp/nj add /tmp/nj-qa-notes.txt
z4dsn8
$ echo "hello" | /tmp/nj add -
lknwlo
$ /tmp/nj list
z4dsn8  11 Jun 26 13:50 EDT  meeting notes
lknwlo  11 Jun 26 13:50 EDT  hello
2 pastes
$ /tmp/nj get jtiblg
for-get-test a fairly long single line that should exceed forty characters easily
$ /tmp/nj rm jtiblg
nj: unknown command "rm"        # exit 2
$ /tmp/nj get zzzzzz
                                # no output at all; exit 1
```

**Verified working** (honest credit): build command; add from file and
stdin; content round-trips byte-exact through `get` (trailing newline
preserved); newest-first ordering (confirmed with distinct timestamps);
`serve --addr`; both documented `POST` forms (raw → `201 {"id":...}`,
JSON → `201`); `GET /api/pastes/{id}` on a populated store; 404 JSON for a
missing id on a populated store; 400 for empty JSON content; 405 for
`DELETE`; web empty state ("nothing here yet — try nj add");
`NIGHTJAR_DIR` respected; a corrupt store file is refused, not clobbered
(no data loss on `add`).

## 3 · Surface cross-check (load-bearing facts)

Taken with the server running, after two pastes were added via the API
(server started when the store held 6):

| Fact | CLI | API | Web | Disk |
|---|---|---|---|---|
| Paste count | `8 pastes` | `"count": 8` | header **"6 pastes"**, table renders **8 rows** | 8 entries |
| Missing id (populated store) | exit 1, **silent** | `404 {"error":"not found"}` | n/a | — |
| Missing id (fresh store, no file yet) | `open /tmp/nj-qa-empty/pastes.json: no such file or directory` | **500** `{"error":"open /tmp/nj-qa-empty/pastes.json: ..."}` | n/a | — |
| Snippet truncation | 40 chars + `...` | 64 chars, no ellipsis | 64 chars, no ellipsis | full content |
| Empty content allowed? | yes (paste created) | no (`400 content is required`) | renders blank row | empty entry stored |

The web header is the only surface that disagrees on count — including with
the table on the same page. The same logical condition ("id not found")
renders three different ways depending on surface and store age.

## 4 · Findings

### NJ-1 — [bug] README documents `nj rm <id>` but the command does not exist

- **Summary:** README Usage block promises `nj rm <id>  # delete a paste`.
  The binary rejects it, and no surface offers deletion at all
  (`DELETE /api/pastes/{id}` → 405). A user following the README hits a
  dead end at step five; pastes are permanent.
- **Surfaces:** CLI; corroborated on API.
- **Repro:** `ID=$(echo hi | nj add -); nj rm "$ID"` →
  `nj: unknown command "rm"`, exit 2.
- **Root cause:** `cmd/nj/main.go:23-35` — the command switch has no `rm`
  case; `internal/store/store.go` has no delete method. `README.md:19`
  documents a feature that was never built (the usage string at
  `main.go:39` honestly omits it, contradicting the README).
- **Fix direction:** either implement delete end-to-end (store method, CLI
  command, `DELETE` route) or strike the README line; the docs and binary
  must agree.
- **Regression-test gap:** a doc-conformance check that every command named
  in README Usage is accepted by the CLI dispatch.
- **Severity:** high — broken onboarding promise; capability missing on
  every surface. *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-2 — [bug] Web index header count is frozen at server start

- **Summary:** the `/` header reads "N pastes" where N is the store size
  when `serve` started; it never updates. Observed header "6 pastes" above
  a table of 8 rows after two API adds — the page disagrees with itself,
  with the API (`count: 8`), the CLI (`8 pastes`), and disk (8 entries).
- **Surface:** web index.
- **Repro:** start `nj serve`; `curl -X POST --data-binary 'x' .../api/pastes`
  twice; `curl .../` — header count lags by 2, table is current.
- **Root cause:** `internal/server/server.go:24-27` — `New` caches
  `indexCount` once ("primed once here"); `handleIndex` at
  `server.go:205` renders `s.indexCount` while the rows come from a fresh
  `store.Load()` (`server.go:179`). Two sources of truth in one handler.
- **Fix direction:** render `len(pastes)` from the same `Load()` that
  builds the rows; delete the cached field.
- **Regression-test gap:** handler test — add a paste after `New`, assert
  the rendered header count equals the row count.
- **Severity:** high — a live surface reports a stale load-bearing fact
  indefinitely. *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-3 — [bug] `nj get` with an unknown id fails silently

- **Summary:** `nj get zzzzzz` on a populated store prints nothing — no
  stderr, no hint — and exits 1. In a pipeline or by eye it is
  indistinguishable from an empty paste (which the CLI permits, see NJ-6).
- **Surface:** CLI.
- **Repro:** `nj get zzzzzz; echo $?` → blank, then `1`.
- **Root cause:** `cmd/nj/main.go:93-94` — the `errors.Is(err,
  store.ErrNotFound)` branch calls `os.Exit(1)` before the
  `fmt.Fprintln(os.Stderr, err)` that every other error path gets.
- **Fix direction:** print `nj: paste <id> not found` (or the error) to
  stderr before exiting.
- **Regression-test gap:** CLI-level test asserting stderr is non-empty on
  not-found.
- **Severity:** medium — silent failure; the API correctly says
  `{"error":"not found"}` for the same condition, so the surfaces also
  disagree. *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-4 — [bug] Lookup before the first paste leaks a raw filesystem error; API returns 500 instead of 404

- **Summary:** on a fresh store (no `pastes.json` yet), a missing id is an
  internal error, not a not-found: CLI prints
  `open /tmp/nj-qa-empty/pastes.json: no such file or directory`; the API
  returns **500** with the server's filesystem path in the body. The same
  request against a populated store correctly yields 404. One logical
  condition, three renderings (silent / raw os error / 500) depending on
  surface and store age.
- **Surfaces:** CLI and API.
- **Repro:** `NIGHTJAR_DIR=$(mktemp -d) nj get abc123`; or fresh-dir
  `nj serve` then `curl -w '%{http_code}' .../api/pastes/abc123` → 500.
- **Root cause:** `internal/store/store.go:94-97` — `Get` calls
  `os.ReadFile` directly instead of going through `Load`, which already
  maps a missing file to an empty store (`store.go:52-54`). The os error
  is not `ErrNotFound`, so `server.go:128-133` falls through to the 500
  branch and echoes it.
- **Fix direction:** make `Get` iterate `s.Load()` so a missing file
  degrades to `ErrNotFound`; never echo raw os errors (with server paths)
  to API clients.
- **Regression-test gap:** store test — `Get` on a store whose file does
  not exist must return `ErrNotFound`; handler test asserting 404, not 500.
- **Severity:** medium — broken first-run behavior plus internal-path
  disclosure. *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-5 — [bug] Snippet truncation splits UTF-8 mid-rune, printing mojibake

- **Summary:** snippets are truncated by byte index; multi-byte content cut
  at an odd boundary renders a replacement-garbage byte. Observed in
  `nj list` with a 1-ASCII + 30-`é` paste:
  `aééééééééééééééééééé\xc3...` — the line is invalid UTF-8 (confirmed:
  `UnicodeDecodeError ... position 68: invalid continuation byte`).
- **Surfaces:** CLI; same byte-slicing mechanism in API and web.
- **Repro:** `python3 -c "print('a'+'é'*30, end='')" | nj add -; nj list`.
- **Root cause:** `cmd/nj/main.go:78` (`snippet[:40]`),
  `internal/server/server.go:62-64` and `:193-195` (`snippet[:64]`) —
  byte slicing of a Go string, not rune-aware truncation.
- **Fix direction:** truncate on runes (`[]rune` or
  `utf8.DecodeRuneInString` walk), shared by all three call sites — the
  triplicated snippet logic is itself the maintenance hazard.
- **Regression-test gap:** snippet test with multi-byte content asserting
  `utf8.ValidString` on the output.
- **Severity:** low-medium — cosmetic corruption for any non-ASCII paste.
  *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-6 — [bug] Empty pastes: API rejects, CLI accepts

- **Summary:** validation drifts by surface. `POST /api/pastes` with empty
  content → `400 {"error":"content is required"}`; `printf '' | nj add -`
  → succeeds, prints an id, and an empty row then renders on `list`, the
  API, and the web table.
- **Surfaces:** CLI vs API.
- **Repro:** `printf '' | nj add -` (succeeds) vs
  `curl -X POST -H 'Content-Type: application/json' -d '{"content":""}'
  .../api/pastes` (400).
- **Root cause:** the emptiness check lives only in the HTTP handler
  (`internal/server/server.go:101-105`); `store.Add` (`store.go:80`) and
  `cmdAdd` (`main.go:42`) have no equivalent.
- **Fix direction:** move the rule into `store.Add` so every surface
  inherits one policy (whichever policy is intended).
- **Regression-test gap:** store test pinning the empty-content policy.
- **Severity:** low. *Found during dogfood QA of nightjar, 2026-06-11.*

### NJ-7 — [enhancement] Snippet length and ellipsis drift between surfaces

- **Summary:** the same paste previews differently everywhere: CLI cuts at
  40 chars and appends `...`; API and web cut at 64 with **no** truncation
  marker, so a clipped snippet is indistinguishable from complete content
  (observed: `"for-get-test a fairly long single line that should exceed
  forty "` ends mid-sentence with no indicator).
- **Repro:** add an 80-char single-line paste; compare `nj list`,
  `/api/pastes`, and `/`.
- **Root cause:** three independent copies of the snippet routine
  (`main.go:73-79`, `server.go:58-64`, `server.go:189-195`) with different
  constants and decoration.
- **Fix direction:** one shared snippet helper (also resolves NJ-5).
- **Severity:** low — cosmetic drift. *Found during dogfood QA of
  nightjar, 2026-06-11.*

### NJ-8 — [enhancement] Corrupt store file surfaces as a bare JSON decoder error

- **Summary:** fault injection (garbage written to `pastes.json`): every
  surface fails with `invalid character 'c' looking for beginning of
  object key string` — no file path on the CLI, no hint of what is broken
  or how to recover; the API 500 echoes the decoder internals. Credit
  where due: `nj add` against the corrupt file refuses rather than
  overwriting, so no data is lost.
- **Repro:** `echo '{ corrupted' > $NIGHTJAR_DIR/pastes.json; nj list`.
- **Root cause:** `internal/store/store.go:58-60` returns the raw
  `json.Unmarshal` error with no file context; callers print/echo it
  verbatim.
- **Fix direction:** wrap with the file path and a recovery hint
  (`pastes.json is corrupt; fix or remove it`).
- **Severity:** low — resilience held (no data loss); only the diagnosis
  experience is poor. *Found during dogfood QA of nightjar, 2026-06-11.*

## 5 · Friction log

- The README's fifth usage line (`nj rm`) is the first hard wall — a
  first-session user cannot complete the documented tour (NJ-1).
- `nj get` not-found required checking `$?` to even know it failed (NJ-3).
- First-run `nj get` before any `add` greets the user with a raw
  `open ... no such file or directory` (NJ-4).
- No other manual nudges were needed: build, add, list, get (happy path),
  serve, and both curl forms worked first try with zero intervention.

## 6 · Status

8 findings filed (2 high, 2 medium, 4 low/enhancement). No fixes landed
during this pass, so the re-verification step is open: each issue carries
its exact repro to run against a rebuilt binary.
