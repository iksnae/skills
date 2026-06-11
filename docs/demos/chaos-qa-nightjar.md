# GameDay — chaos-qa vs nightjar

*Provenance: skill `chaos-qa` (`skills/chaos-qa/SKILL.md`), target `demo/nightjar`
(the `nj` terminal pastebin — `add`/`list`/`get`/`serve`, HTTP API + web index,
state in a single JSON file under `NIGHTJAR_DIR`). Run 2026-06-11. All
experiments ran against a binary built to `/tmp/nj` with `NIGHTJAR_DIR` pointed at
throwaway dirs under `/tmp`; the developer's `~/.nightjar` and the repo were never
touched. macOS has no `timeout(1)`, so every command was wrapped in a perl
`alarm`-based timeout shim (`/tmp/to N cmd…`, exits 124 on timeout) — a hang is a
finding.*

## Dependency surface (mapped from source)

`nj` has no network upstreams and no external services. Its entire dependency
surface is **the local filesystem** plus **concurrent access to one file**:

- `internal/store/store.go` — all state is a single `pastes.json`, read/written
  as **one JSON document**. `Load()`/`Get()` do a whole-file `json.Unmarshal`;
  `Save()` does `os.WriteFile` (truncate + single write, **non-atomic**, no temp
  file + rename, no fsync). `Add()` is an **unlocked read-modify-write**
  (`Load()` → append → `Save()`) — no flock, no mutex across processes.
- `internal/server/server.go` — HTTP server with `ReadTimeout: 5s` but **no
  `WriteTimeout` and no `IdleTimeout`**; index header count (`indexCount`) is
  **cached once at startup** in `New()`.

So the fault vectors are: data-file corruption / torn writes, missing file,
concurrent writers, and slow HTTP clients. There is no upstream-API or
remote-down vector to inject (no such dependency exists).

## Steady state (baseline)

Clean store: `add` returns an id (exit 0), `list` shows newest-first + a count,
`get` on a present id prints content, `get` on an absent id exits 1 silently.
All confirmed against `/tmp/nj-baseline`. Everything below is a deviation from
this.

---

## Experiments

### E1 — Data-store corruption: whole file is garbage

**Hypothesis:** a corrupt store fails *loud* (never silently-wrong); ideally
read paths degrade rather than brick.

**Injection:** `printf 'this is not json at all {{{' > pastes.json` on a store
that had one valid paste.

```
== list ==   invalid character 'h' in literal true (expecting 'r')   exit=1
== get  ==   invalid character 'h' in literal true (expecting 'r')   exit=1
== add  ==   invalid character 'h' in literal true (expecting 'r')   exit=1
```

**Observed:** every path fails loud (exit 1, error on stderr) — **not**
silently-wrong, good. But the error is a cryptic Go-internal `json` message, and
`add` *also* fails (it `Load()`s first), so **a corrupt file bricks writes too** —
there is no recovery, repair, or backup path. The store is permanently wedged
until a human hand-edits the file. (Feeds F2.)

### E2 — Torn trailing write: one incomplete record at the tail

**Hypothesis (skill's canonical vector):** tolerate a torn *trailing* record;
never brick read paths on one bad line.

**Injection:** 3 valid pastes, then truncate the last 12 bytes (simulating a
crash / disk-full mid-`Save`).

```
== valid list ==          3 pastes
>> chop last 12 bytes
== list after torn write ==   unexpected end of JSON input   exit=1
```

**Observed: BROKE.** The torn tail makes **all 3 pastes unreadable — including
the 2 fully intact records before it.** Because the store is one JSON document,
there is zero torn-trailing tolerance: a single truncated write destroys access
to the entire history. (F2.)

### E3 — HTTP server against a corrupt store + stale index count

**Hypothesis:** server fails loud per-request and stays up; surfaces agree.

**Injection:** start `serve` on a valid 2-paste store, corrupt `pastes.json`
underneath it, then shrink it to 1 paste.

```
GET /            (valid)     <h1>nightjar <span>2 pastes</span></h1> + 2 rows
GET /api/pastes  (valid)     {"count":2, …}
>> corrupt store
GET /            (corrupt)   http=500
GET /api/pastes  (corrupt)   {"error":"invalid character 'g'…"}  http=500
>> shrink store to 1 paste
GET /            header:     <h1>nightjar <span>2 pastes</span></h1>   (rows=1)
```

**Observed:** corruption handling **held** — clean 500s, server did not crash
and recovered when the file was fixed. But the index **header count is stale**:
it stays at the startup-cached `2` while the table now renders 1 row. (F3.)

### E4 — Concurrency: N parallel `nj add` (the headline)

**Hypothesis:** concurrent writes stay valid with zero interleaving; all writes
that report success persist.

**Injection:** 40–50 concurrent `nj add` processes against one store.

```
50 writers → list reports: 44 pastes        (6 lost, valid JSON)
40 writers, capturing reported ids:
   writers that reported success (exit 0, printed id): … 
   on disk: Extra data: line 32 column 2 (char 478)   ← FILE CORRUPTED
frequency over 20×40-writer runs:
   corrupted runs: 1/20  (~5%)
   total lost updates across the 19 valid runs: 145   (~7.6 lost/run, ~19%)
```

**Observed: BROKE, two ways.**
1. **Silent lost updates, every run.** ~19% of concurrent adds vanish. The lost
   writers **still print an id and exit 0** — they report success while their
   write is clobbered by a racing read-modify-write. Silently-wrong.
2. **Intermittent total corruption (~5% of runs).** Two `os.WriteFile`s
   interleave (each truncates to 0 then writes its own buffer); the longer
   writer's tail survives past the shorter writer's content, yielding
   `Extra data` trailing-byte corruption. That corrupt file then bricks **every**
   read path per E1/E2. Root cause: no inter-process lock + non-atomic write.

### E5 — Interrupted save (SIGKILL mid-write)

**Hypothesis:** an interrupted write leaves the store readable (atomic write).

**Injection:** seeded a ~2 MB valid store, launched `nj add` and `kill -9`'d it.

**Observed (honest):** the kill landed during Go runtime startup, before the
write syscall, so the store stayed valid this run — I did **not** reproduce a
torn write via signal timing. `os.WriteFile` is a single `write()` so
signal-timed tearing on local fs is rare. The *non-atomic-write* failure domain
this vector targets is nonetheless real and was demonstrated via E4's
interleaved-write corruption. No atomic temp-file-and-rename, no fsync.

### E6 — Slow / abusive HTTP clients

**Hypothesis:** slow clients are bounded (no hang); server stays available.

**Injections:** (A) open a TCP connection and send nothing; (B) slowloris —
drip request bytes at 0.5 s each; (C) a normal request afterward.

```
A idle conn:   read returned 0 after 5.00s (server closed)   ← ReadTimeout held
C normal GET:  http=200  time=0.0007s                         ← server alive
```

**Observed: HELD.** `ReadTimeout` (5 s) cleanly bounded the idle/slow-header
connection — no hang. Server stayed responsive. Minor hardening gap: with no
`WriteTimeout`/`IdleTimeout`, a slow *reader* (full request, drains the response
byte-by-byte) isn't bounded by `ReadTimeout`; impact is small here because
responses are tiny. (F4.)

---

## Findings

### F1 — Concurrent `nj add` silently loses ~19% of writes and reports success [High]

Root cause: `store.Add()` is an unlocked `Load → append → Save` across
processes. Every losing writer still prints its id and exits 0, so callers
(scripts, the API's POST path, a user firing several adds) believe writes
landed when they were clobbered. Consistent on every multi-writer run.

**Repro:**
```sh
go build -o /tmp/nj ./cmd/nj
d=/tmp/nj-race; rm -rf $d; mkdir -p $d
for i in $(seq 1 40); do echo "p-$i" | NIGHTJAR_DIR=$d /tmp/nj add - >/dev/null & done; wait
python3 -c "import json;print(len(json.load(open('$d/pastes.json'))),'of 40')"   # ~33
```
**Fix direction:** serialize writes with an OS file lock (`flock`) around the
read-modify-write, or move to append-only records / per-paste files.

### F2 — A single corrupt or torn byte bricks the entire store, reads and writes [High]

One bad/truncated byte anywhere in `pastes.json` makes `list`, `get`, `serve`,
the web index, the API, **and** new `add`s all fail (whole-document
`Unmarshal`; `Add` reads before writing). No torn-trailing tolerance, no atomic
write (so a crash / disk-full mid-`Save`, or the E4 race, can produce this), no
backup, no repair. The 2 intact records in E2 were unrecoverable through the app.

**Repro:**
```sh
d=/tmp/nj-torn; rm -rf $d; mkdir -p $d
for i in 1 2 3; do echo "p$i" | NIGHTJAR_DIR=$d /tmp/nj add - >/dev/null; done
perl -e 'truncate($ARGV[0],(-s $ARGV[0])-12)' $d/pastes.json   # torn tail
NIGHTJAR_DIR=$d /tmp/nj list                                   # → "unexpected end of JSON input", exit 1
```
**Fix direction:** write atomically (temp file + `rename` + fsync) so a partial
write can never be observed; consider keeping the last-good copy as a fallback.

### F3 — Web index header paste-count is cached at startup and goes stale [Low]

`server.New()` caches `len(pastes)` into `indexCount` once; the header renders
that forever while the row list reflects live data. After the store changed
under a running server, the header showed `2 pastes` over 1 row. Surfaces
disagree. **Fix:** compute the count from the same `Load()` that builds the rows.

### F4 — `nj get` on a missing store leaks a raw FS error and the absolute path [Low]

`list` treats a missing file as an empty store (exit 0, "0 pastes"), but `Get()`
bypasses that handling and returns the raw error:
`open /tmp/nj-missing/pastes.json: no such file or directory` (exit 1). Divergent
handling, and it leaks the store path. **Fix:** route `Get()` through `Load()`'s
`ErrNotExist`→empty handling and return `ErrNotFound`.

---

## Validated resilience (holds — guard against regression)

- **Corruption fails loud, never silently-wrong** (E1/E3): `list`/`get`/`add`
  exit 1 with an error; HTTP returns 500. The server **does not crash** on a
  corrupt store and **recovers** once the file is valid again.
- **No unbounded hangs anywhere** — every CLI command and HTTP request returned
  within its timeout; the `serve` `ReadTimeout` (5 s) cleanly closes idle /
  slow-header connections (E6).
- **`list` tolerates a missing store** as an empty store (E3b) — the graceful
  behavior F4 should be brought into line with.

## Severity tally

2 High (F1 silent lost-updates, F2 single-byte total brick), 2 Low (F3 stale
header count, F4 leaky missing-file `get`). Headline: **concurrent `nj add`
silently drops ~19% of writes while reporting success, and ~5% of concurrent
bursts corrupt the store outright — which then bricks every read path.**
