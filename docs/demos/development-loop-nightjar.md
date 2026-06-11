# Demo: development-loop on nightjar — `nj rm <id>`

*Provenance: skill `development-loop` applied to `demo/nightjar`, 2026-06-11.
Driven by Claude Code; honest narration of an actual run.*

## Starting point

A QA pass flagged the top defect: `README.md:19` documents `nj rm <id>`,
but the command doesn't exist — the CLI rejects `rm` as unknown, and the
API answers `DELETE /api/pastes/{id}` with 405. The fix is a vertical
slice through all three layers: store, CLI, HTTP API.

## The plan (loop step 1)

- **Goal:** ship the documented-but-missing delete capability.
- **Definition of done:** `store.Remove(id)` test-driven with an
  `ErrNotFound` contract matching `Get`; CLI `rm` with clear messages
  and the project's exit-code conventions (0 ok / 1 error / 2 usage);
  `DELETE /api/pastes/{id}` returning 204/404/500; README API table
  updated; web index untouched; `go build && go vet && go test` green
  between every step.
- **Rollback:** each increment is its own commit touching only
  `demo/nightjar`; revert the commit.

## Increment 1 — store layer (commit `c34e073`)

Test-first. Added `TestRemove`, `TestRemoveNotFound`, and
`TestRemoveFromEmptyStore` before any implementation; the suite failed
red on `st.Remove undefined` (a compile-error red, which still counts —
the tests pin the contract). Implementation reused the existing
`Load`/`Save` seam and the shared `ErrNotFound` sentinel, filtering
in place and only saving when something was actually removed. Green on
first run.

## Increment 2 — CLI (commit `0555955`)

Added the `rm` case in `cmd/nj/main.go` following the conventions the
other commands already set: usage error → exit 2, runtime error →
exit 1, success → `removed <id>` on stdout and exit 0. One deliberate
divergence: the existing `get` exits silently on not-found; `rm` prints
`nj: no paste with id "..."` to stderr, since a destructive command
should say why it did nothing. Verified exit codes against the built
binary (not `go run`, which masks the program's exit status): 0/1/2 as
specified.

## Increment 3 — API + review/refactor (final commit — this report
rides in it, so its SHA can't be embedded here; see `git log -1 --
docs/demos/development-loop-nightjar.md`)

The server package had no tests at all, so this increment started by
adding `server_test.go` with three `httptest` cases: DELETE-by-id →
204 and the paste is gone, DELETE unknown id → 404, DELETE on the
collection → 405. Red confirmed (405 where 204/404 were expected), then
the DELETE branch was implemented in the style of the existing
branches. Green.

**What the review step caught:** running the skill's DRY gate over the
finished slice showed the JSON error-response idiom (`Set Content-Type`
→ `WriteHeader` → `Encode {"error": ...}`) repeated **eight times** in
`handlePastes` — and the new DELETE branch had just added copies seven
and eight. That is duplicated *knowledge* (how this API serializes an
error), not incidental duplicate code, so the gate's "extract only when
you can name the concept" test passes trivially.

**The refactor:** extracted `writeJSONError(w, status, msg)` as the
single place that knows the error wire format, and rewrote all eight
sites to use it — net minus ~30 lines from `server.go`. The new server
tests plus the store suite were the safety net; everything stayed green
(`go test ./... -count=1`).

Also in this increment: the README API table gained the
`DELETE /api/pastes/{id}` row, closing the docs/behavior gap from the
other side.

## End-to-end verification

Against a live `nj serve` on a throwaway `NIGHTJAR_DIR`:

```
created pgyn1u
DELETE 204
DELETE-again 404
index 200
```

Create → delete → delete-again behaves as specified, and the web index
still renders (untouched, as scoped).

## Close the loop

- **What changed:** `store.Remove` (tested), CLI `rm` (correct exit
  codes, clear messages), API DELETE (tested, 204/404/405), README row,
  one DRY refactor of the server's error writing.
- **Remaining risk:** `handlePastes` is still one long method routing
  four verbs by hand; fine at this size, but the next structural step
  would be splitting it per method/route. The store's load-modify-save
  is not safe under concurrent writers — pre-existing, out of scope.
- **Next smallest step:** a `rm` confirmation or `--all` flag is *not*
  needed; the genuinely next defect-shaped item is that `nj get`
  fails silently on not-found (exit 1, no message) — same fix shape as
  this one, one line.
