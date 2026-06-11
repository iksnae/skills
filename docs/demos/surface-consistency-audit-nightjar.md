# Surface Consistency Audit — nightjar

*Skill: [surface-consistency-audit](../../skills/surface-consistency-audit/SKILL.md). Target: `demo/nightjar` (a fictional terminal pastebin — `nj` CLI, HTTP JSON API, web index page). Date: 2026-06-11. Observations only; the repo was not modified.*

## Setup

```sh
go build -o /tmp/nj ./cmd/nj
export NIGHTJAR_DIR=/tmp/nj-demo.V8SS
# seeded through TWO surfaces:
printf 'short cli paste\n'                     | /tmp/nj add -   # gn2ha0  (CLI)
printf '<83-char line>\nsecond line\n'          | /tmp/nj add -   # v7jhcv  (CLI)
/tmp/nj serve --addr 127.0.0.1:8765 &                            # cached count primed here (2 pastes)
curl -X POST -H 'Content-Type: application/json' -d '{"content":"hello from the api..."}' .../api/pastes  # mqmqbu (API)
curl -X POST --data-binary 'raw api paste' .../api/pastes                                                  # krmc0g (API)
```

Two pastes were created via the CLI **before** the server started, two via the API **after**. Final ground truth on disk: **4 pastes**.

## Surfaces discovered

| Surface | Reads the fact via |
|---|---|
| **CLI** | `nj list` (count + rows), `nj get <id>` (content) |
| **API** | `GET /api/pastes` (`count` + `entries[]`), `GET /api/pastes/{id}` (`content`) |
| **Web UI** | `GET /` — HTML index: `<h1>` header count + table rows |
| **Ground truth** | `$NIGHTJAR_DIR/pastes.json` (the durable JSON store) |

## Per-fact comparison (real observed values)

### Fact 1 — Paste count

| Surface | Value |
|---|---|
| Ground truth (`pastes.json`) | **4** entries |
| CLI `nj list` footer | `4 pastes` |
| API `GET /api/pastes` | `"count":4` |
| Web index — table rows | **4** rows rendered |
| Web index — `<h1>` header | `nightjar` `2 pastes` |

The web header disagrees with **every other surface — including its own table directly below it.**

### Fact 2 — Date / created timestamp (same paste `mqmqbu`, `created=1781200225`)

| Surface | Value | Format |
|---|---|---|
| Ground truth | `1781200225` | Unix epoch (int) |
| API (`list` + `get`) | `"created":1781200225` | Unix epoch (int) |
| CLI `nj list` | `11 Jun 26 13:50 EDT` | `time.RFC822` |
| Web index | `2026-06-11` | `2006-01-02` (date only, no time) |

Three different human representations of one timestamp; no two presentation surfaces agree.

### Fact 3 — Snippet of paste `v7jhcv` (83-char first line)

| Surface | Value |
|---|---|
| CLI `nj list` | `this is a longer paste added through the...` (40 chars + `...`) |
| API `GET /api/pastes` | `this is a longer paste added through the cli that exceeds forty ` (64 chars, no ellipsis, trailing space) |
| Web index | `this is a longer paste added through the cli that exceeds forty ` (64 chars, no ellipsis, trailing space) |

The CLI shows a 40-char snippet with an ellipsis; the API and web show 64 chars with no ellipsis. The same paste reads as a different preview depending on the surface.

### Fact 4 — Terminology for the collection

| Surface | Word used |
|---|---|
| CLI | "pastes" (`4 pastes`) |
| Web UI | "pastes" (`2 pastes`) |
| README | "pastes" |
| API JSON | **`entries`** (top-level key alongside `count`) |

The API alone calls the items `entries`; everything else calls them `pastes`.

### Clean facts (all surfaces agree)

- **Paste content** — `nj get` and `GET /api/pastes/{id}` return identical full content (no truncation, byte-for-byte). Clean.
- **Paste IDs** — identical 6-char ids across CLI, API, web, and ground truth. Clean.
- **Ordering** — every read surface presents newest-first (all flow through `Store.Load`'s sort). Clean.

## Drift classification (per skill taxonomy)

### Finding 1 — Stale projection / count mismatch  ·  Web header "2 pastes" vs truth "4"
- **Fact:** total paste count.
- **Surfaces:** web `<h1>` says `2`; CLI, API, web table, and ground truth all say `4`.
- **Verdict:** the web header is wrong.
- **Source:** **Stale projection.** `server.New` caches the count once at startup (`indexCount: len(pastes)`, `server.go:19,26`) and the index template renders that cached value (`{{.Count}}`, line 166; `Count: s.indexCount`, line 205), while the table rows render a live `store.Load()`. Any paste created after the process starts — exactly the two API pastes here — never reaches the header. The projection (`indexCount`) is never rebuilt against the source's latest state. This is the textbook stale-projection drift, made unusually stark because the stale count sits inline above a fresh count from the same response.

### Finding 2 — Vocabulary drift  ·  collection named `entries` vs `pastes`
- **Fact:** the name of the item collection.
- **Surfaces:** API JSON key `entries`; CLI / web / README "pastes".
- **Verdict:** drift — no surface is "wrong", but there is no canonical label.
- **Source:** **Vocabulary drift.** No single source of truth for the term; the API handler hard-codes `"entries"` (`server.go:73`) while every human-facing surface says "pastes". Fix by pointing all surfaces at one canonical noun.

### Finding 3 — Representation drift (vocabulary-drift family)  ·  date rendered three ways
- **Fact:** `created` timestamp.
- **Surfaces:** epoch int (API + store), `RFC822` (CLI, `main.go:80`), `2006-01-02` (web, `server.go:198`).
- **Verdict:** drift — three formats, no canonical one.
- **Source:** **Vocabulary/representation drift.** Each surface formats the timestamp independently; there is no shared formatter. (The API arguably should not be faulted for emitting raw epoch — that is a defensible machine contract — but the CLI and web disagreeing with *each other* is true drift.)

### Finding 4 — Representation drift (vocabulary-drift family)  ·  snippet truncation 40+ellipsis vs 64+none
- **Fact:** the list-row snippet.
- **Surfaces:** CLI 40 chars + `...` (`main.go:77-79`); API and web 64 chars, no ellipsis (`server.go:62-64`, `192-194`).
- **Verdict:** drift — same paste previews differently per surface.
- **Source:** **Vocabulary/representation drift.** Two independent snippet routines with different limits and ellipsis policy; no shared snippet helper. (Note: API and web *do* agree with each other — they share the 64/no-ellipsis rule — so the odd surface out is the CLI.)

### Classifier disagreement — none found
nightjar exposes no health/readiness/status classification, so this taxonomy class is not applicable. No finding.

## Summary

| Class | Findings |
|---|---|
| Stale projection (count mismatch) | 1 — web header count |
| Vocabulary drift | 1 — `entries` vs `pastes` |
| Representation drift (vocabulary family) | 2 — date format, snippet truncation |
| Classifier disagreement | 0 (N/A) |

The single most user-corrosive drift is **Finding 1**: the web index renders `2 pastes` in its header directly above a four-row table — a self-contradicting page, caused by a count cached at server startup and never rebuilt.
