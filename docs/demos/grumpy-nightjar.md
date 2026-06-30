*Produced by the `grumpy` skill (skeptical senior review) against `demo/nightjar` (a fictional terminal pastebin), 2026-06-30. Review-only: nothing was changed. The cleanup of one finding is carried out separately by the `janitor` skill — see [janitor-nightjar.md](janitor-nightjar.md).*

# Grumpy Review — nightjar

## Verdict

It builds, it vets, it tests green, and it will still lose your data. nightjar
is a tidy single-file-JSON pastebin whose whole correctness story rests on one
unspoken assumption: that only one writer ever touches the file at a time. The
HTTP server breaks that assumption on request one. The central risk is a
read-modify-write store with no concurrency control and no atomic write —
everything else here is paint on top of that. I've seen this exact shape lose
writes in production, and the chaos run already measured it doing so.

## Smell Inventory

### 1. [blocker] Concurrency — Store is a read-modify-write race

**Problem:** `Store.Add` does `Load()` → append → `Save()` with nothing holding
a lock between the read and the write (`internal/store/store.go:80`). `Remove`
has the same shape (`store.go:113`). The HTTP server handles requests
concurrently, and both `POST /api/pastes` and `DELETE /api/pastes/{id}` route
straight into these methods (`internal/server/server.go:107`, `:143`).

**Why it matters:** Two overlapping writers each load the same N pastes, each
append/drop their one, each rewrite the whole file. Last write wins; the other
write vanishes with no error returned to anyone. This isn't theoretical — the
chaos GameDay measured ~19% silent write loss under concurrent POSTs. A pastebin
whose one job is "keep the thing I pasted" silently drops one in five under load.

**Where:** `store.go:80` (`Add`), `store.go:113` (`Remove`), reached
concurrently via `server.go:107` and `server.go:143`.

**Fix:** Serialize writes. Minimum: a `sync.Mutex` on `Store` wrapping the
load-modify-save critical section. Better: an owning goroutine with a command
channel, or move to a store that does its own atomic appends. Whatever you pick,
the read and the write have to be one indivisible step.

### 2. [major] Durability — Save is not atomic; a crash corrupts the file

**Problem:** `Save` calls `os.WriteFile(s.File(), ...)`, which truncates the
file and then writes (`store.go:76`). There is no temp-file-plus-rename.

**Why it matters:** A crash, full disk, or signal mid-write leaves a truncated
`pastes.json`. The next `Load` hits `json.Unmarshal` on a half-written array
and returns an error (`store.go:58`), which now fails *every* command —
`list`, `get`, `add`, the web index — not just the unlucky one. One bad write
bricks the whole store. Combined with finding #1, two writers can also
interleave a truncate and a read.

**Where:** `store.go:68` (`Save`).

**Fix:** Write to `pastes.json.tmp`, `fsync`, then `os.Rename` over the target.
Rename is atomic on the same filesystem; readers see either the old file or the
new one, never a torn one.

### 3. [major] State management — The index paste count is frozen at startup

**Problem:** `Server.indexCount` is primed once in `New` from a single
`st.Load()` (`server.go:24-27`) and the web index header renders that cached
value forever (`server.go:214`, template `{{.Count}}` at `server.go:175`).
Meanwhile the table rows on the same page are built from a *live* `Load`
(`server.go:188`).

**Why it matters:** The header says "3 pastes" and the table shows 5. Every add
or remove after boot widens the gap. The header and the body of the same HTML
page disagree about reality — a surface-consistency defect baked directly into
the field, not a rendering accident. (The surface-consistency audit flagged this
from the outside; here it is at the source.)

**Where:** `server.go:19` (`indexCount` field), `server.go:26` (primed once),
`server.go:214` (rendered stale).

**Fix:** Drop the cached field and use `len(pastes)` from the same live `Load`
that builds the rows. If you genuinely want a cached count later, invalidate it
on write — but for this size, just count the rows you already have.

### 4. [major] Hidden coupling — Get reimplements Load and drifts from it

**Problem:** `Get` does its own `os.ReadFile` + `json.Unmarshal` instead of
calling `Load` (`store.go:94-109`). It is a second, slightly different copy of
the load path.

**Why it matters:** The copies have already drifted. `Load` treats a missing
file as an empty store (`store.go:51-53`); `Get` does not — a missing file
returns the raw `os.ErrNotExist`, which is *not* `ErrNotFound`. So the API maps
a missing store to **500** instead of 404 (`server.go:129`), and the CLI prints
a generic error instead of the clean "no paste with that id" path
(`cmd/nj/main.go:96-99`). Two functions that should answer "what's on disk?"
answer it differently, and the difference leaks all the way to HTTP status
codes. This is duplicated knowledge that will keep drifting.

**Where:** `store.go:94` (`Get`), diverging from `store.go:49` (`Load`).

**Fix:** Have `Get` call `Load` and scan the result, so missing-file →
`ErrNotFound` falls out for free and there is one unmarshal path. Note this is a
*behavior* change (500 → 404), so it belongs in a development-loop increment with
a test, not folded into a silent cleanup.

### 5. [minor] Readability — Raw HTTP status integers everywhere

**Problem:** `writeJSONError(w, 500, ...)`, `WriteHeader(201)`, `204`, `405`,
and the `1048576` body cap are bare literals (`server.go:59`, `:113`, `:151`,
`:155`, `:87`).

**Why it matters:** `500` reads as optimism and is harder to grep than
`http.StatusInternalServerError`. The `1048576` is a 1 MiB limit wearing no
label. None of this is a bug; all of it is friction for the next reader.

**Where:** throughout `server.go`.

**Fix:** Use the `http.Status*` constants and name the body cap
(`const maxBodyBytes = 1 << 20`).

### 6. [minor] API design — handlePastes hand-routes four verbs by string-trimming

**Problem:** One method dispatches GET-list / POST / GET-one / DELETE by trimming
the path prefix and switching on method with stacked `if` blocks
(`server.go:51-156`).

**Why it matters:** It works at this size, but `GET /api/pastes/` with a
trailing slash and empty id falls through every branch to a bare `405`
(`server.go:155`) rather than listing or 404-ing — a quietly wrong answer. The
hand-rolled routing is where the next verb will introduce the next edge case.

**Where:** `server.go:51`.

**Fix:** Not urgent. When it grows a fifth case, split list/create from
item-scoped handlers, or adopt method-aware routing. Until then, at least make
the trailing-slash case explicit.

### 7. [nit] Error handling — New swallows the load error at boot

**Problem:** `pastes, _ := st.Load()` in `New` discards the error
(`server.go:25`).

**Why it matters:** If the store is corrupt at startup (see #2), the server
boots happily and reports `0 pastes` in the header instead of refusing or
warning. A silent zero hides a real failure.

**Where:** `server.go:25`.

**Fix:** Log the error at least; consider failing fast if the store is
unreadable at boot.

## Pattern Violations

- **Atomicity / fail-safe writes** — `Save` is a non-atomic truncate-write (#2).
- **Single source of truth** — `Get` duplicates `Load` and they've drifted (#4);
  `indexCount` duplicates the live row count and they disagree (#3).
- **Command/query separation is fine, but the read-modify-write isn't guarded**
  — the store exposes mutating ops with no concurrency contract (#1).
- **Fail-fast** — boot-time load error is swallowed (#7).
- **Stable-interface / boring technology** — the JSON-file store is a reasonable
  boring choice; the problem is it's missing the two guarantees (locking, atomic
  write) that make the boring choice safe.

## Missing Failure Cases

- Two concurrent `add`/`POST` (race, #1).
- Crash or full disk mid-`Save` (torn file, #2).
- `Load`/`Get` against a `pastes.json` that exists but is corrupt JSON.
- `GET /api/pastes/` with a trailing slash and empty id (falls to 405).
- Store directory unwritable / `MkdirAll` denied at `Save` time.
- Boot against an unreadable store (swallowed, #7).

## Test Gaps

```txt
TestConcurrentAddsDoNotLoseWrites()      // N goroutines Add, expect N pastes
TestSaveIsAtomicAcrossInterruptedWrite() // torn file never observed by Load
TestGetOnMissingFileReturnsErrNotFound() // pins the #4 contract
TestLoadRejectsCorruptJSONClearly()      // corrupt file → clear error, not panic
TestIndexCountMatchesRowsAfterAdd()      // header vs body agree (#3)
TestTrailingSlashListPathIsNot405()      // GET /api/pastes/ behaves
```

## Refactor Recommendation

**Minimum fix:** Put a `sync.Mutex` on `Store` around the load-modify-save in
`Add` and `Remove`, and make `Save` write-temp-then-rename. Those two changes
retire the blocker and the corruption major with no API change.

**Better shape:** Single-writer store (owning goroutine + command channel) so the
critical section is structural rather than convention; fold `Get` into `Load`;
drop `indexCount` for a live count. Each is a small, independently reviewable
step.

**Do not do:** Reach for a real database, a write-ahead log, or an `sync.Map`
rewrite. The file store is the right size for this; it just needs a lock and an
atomic rename. Don't trade a 130-line store you understand for a dependency you
don't.

## Closing

The tests are green because they test one writer at a time — they're testing your
optimism, not the system the second user will actually hit.
