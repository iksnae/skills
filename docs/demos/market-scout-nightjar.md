---
date: 2026-06-11
subject: Embedded storage engine for nightjar v2 (tiny Go terminal pastebin)
skill: market-scout
status: demo
---

# Market-Scout Scorecard — nightjar v2 Storage Engine

_Provenance: produced by the **market-scout** skill (`skills/market-scout/SKILL.md`),
run directly against the operator brief — "nightjar, a tiny Go terminal pastebin
(single binary, stdlib-only today, JSON-file store), is outgrowing its flat-file
storage; evaluate flat JSON file, bbolt, SQLite via modernc.org/sqlite, and Pebble
for v2" — on **2026-06-11**. The bundled workflow script was not used; the
fan-out → fetch → adversarial-verify → score methodology was executed by hand with
live web search. Every load-bearing claim is cited inline._

## Subject

Which embedded storage engine should nightjar adopt for v2, ranked against a
weighted rubric. Candidates: **flat JSON file** (incumbent), **bbolt**
(`go.etcd.io/bbolt`), **SQLite via `modernc.org/sqlite`** (cgo-free), and
**Pebble** (`github.com/cockroachdb/pebble`).

## Rubric (operator-supplied weights)

| ID | Criterion | Weight |
|----|-----------|:---:|
| C1 | Zero-cgo single-binary deployment | 3 |
| C2 | Concurrent-write safety | 3 |
| C3 | Operational simplicity / file-format longevity | 2 |
| C4 | Go ecosystem maintenance health in 2026 | 2 |
| C5 | Small-dataset performance adequacy | 1 |

Scores are 1–5. Weighted total = Σ(score × weight); max possible = 55.

## Ranked scorecard

| Rank | Candidate | C1 ×3 | C2 ×3 | C3 ×2 | C4 ×2 | C5 ×1 | Weighted | % |
|:---:|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🥇 1 | **bbolt** (`go.etcd.io/bbolt`) | 5 | 5 | 4 | 4 | 5 | **51** | 92.7% |
| 🥈 2 | **modernc.org/sqlite** | 5 | 4 | 4 | 5 | 4 | **49** | 89.1% |
| 🥉 3 | **flat JSON file** (incumbent) | 5 | 2 | 5 | 5 | 4 | **45** | 81.8% |
| 4 | **Pebble** (`cockroachdb/pebble`) | 5 | 5 | 1 | 3 | 3 | **41** | 74.5% |

## Executive summary

**bbolt is the recommended v2 engine.** It is the only candidate that scores at or
near the top on both of the heaviest-weighted criteria (zero-cgo, concurrent-write
safety) without dragging operational baggage along with it. bbolt is pure Go (no
cgo), gives ACID transactions with a single serialized writer and unlimited
concurrent readers via lock-free MVCC, stores everything in one file with a *fixed*
on-disk format, and remains actively maintained under etcd-io (v1.4.3, Aug 2025).
For a single-binary pastebin holding a small dataset, its COW B+tree is plenty fast.
It is, in effect, an embedded ACID store with the same single-writer mental model
nightjar already has — minus the torn-tail failure mode of hand-rolled flat files.

**modernc.org/sqlite (89.1%) is a very close second** and the right pick if nightjar
expects to grow query complexity or wants the most durable, universally-inspectable
file format (SQLite is an archival-grade format with ubiquitous tooling). It is
genuinely cgo-free (a transpilation of C SQLite to pure Go, tracking SQLite 3.53.2,
v1.52.0 Jun 2026 — the most actively maintained candidate). It loses to bbolt only on
operational footguns: concurrent writes inherit SQLite's single-writer locking, so
you must set `SetMaxOpenConns(1)` (and ideally WAL + `busy_timeout`) to avoid
`SQLITE_BUSY` / "database is locked", and it carries WAL/SHM sidecar files plus a
larger dependency and per-platform build matrix.

**The incumbent flat JSON file (81.8%)** is unbeatable on simplicity, longevity, and
maintenance (it is just `encoding/json` + the filesystem), but it scores a 2 on the
weight-3 concurrent-write criterion — there is no transactional or crash-atomic write
path beyond a hand-rolled mutex plus temp-file-rename, and whole-file rewrites are
O(n) per put. That weak spot, multiplied by weight 3, is precisely why the brief says
nightjar is "outgrowing" it. Adequate, but capped.

**Pebble ranks last (74.5%)** despite top marks on cgo and raw concurrency, because it
is the wrong tool for this job by its maintainers' own description (see surprise
below): an LSM engine tuned for CockroachDB's large, write-heavy, distributed
workload, with multi-file SST/compaction operational complexity and a permanent,
one-way format-version model. It is over-engineered for a tiny pastebin.

## Per-criterion verification notes

**C1 — Zero-cgo single binary.** All four are cgo-free. JSON is stdlib. bbolt is
~99% Go with no C dependency [bbolt README]. modernc.org/sqlite is explicitly a
"CGo-free port of the C SQLite3 library" — a transpilation, not a wrapper
[pkg.go.dev]. Pebble is "written in Go" and was built specifically to "avoid the
challenges of traversing the Cgo boundary" [Cockroach Labs blog]. All score 5; this
criterion does not separate the field (note: modernc's dependency footprint is the
largest, but it remains a single static binary).

**C2 — Concurrent-write safety.** bbolt: "allows only one read-write transaction at a
time but allows as many read-only transactions as you want," fully serializable ACID
with lock-free MVCC — safe by construction, no config (5) [bbolt README/pkg.go.dev].
Pebble: crash-safe WAL, atomic batches, concurrency-oriented commit pipeline (5).
modernc.org/sqlite: SQLite is single-writer; the port "does not allow concurrent
writes" and the documented mitigation is `SetMaxOpenConns(1)`, which serializes all
access — safe, but only once you configure it correctly, hence the footgun deduction
(4). flat JSON: no built-in concurrency or transaction primitive; safety is entirely
on the application (mutex + atomic rename), with no partial-update or crash-atomic
guarantee — the weakest, weight-3 (2).

**C3 — Operational simplicity / file-format longevity.** flat JSON (5): human-readable,
trivially inspectable, no schema, the longest-lived format of the four. SQLite (4):
archival-grade, universally inspectable format — best-in-class longevity — but offset
by WAL/SHM sidecars and pragma tuning. bbolt (4): one file, fixed format, simple API;
opaque binary, and a known data-corruption caveat on Linux ext4 with fast-commit
enabled on certain kernels [bbolt README]. Pebble (1): multi-file LSM with compaction,
plus *permanent, irreversible* format-major-version upgrades and a "caveat emptor —
may silently corrupt data" warning [Pebble README] — the opposite of longevity for an
external adopter.

**C4 — Maintenance health 2026.** modernc.org/sqlite (5): most active — v1.52.0
published Jun 6 2026, tracking SQLite 3.53.2 [pkg.go.dev]. flat JSON (5): `encoding/json`
is Go stdlib, effectively eternal. bbolt (4): actively maintained etcd-io fork
("active maintenance and development target for Bolt"), v1.4.3 Aug 19 2025, but
deliberately stable/feature-frozen [bbolt README]. Pebble (3): very actively developed
(v2.1.6, May 27 2026) BUT offers no API/compatibility promise to non-CockroachDB
consumers — healthy upstream, unstable contract for an outside adopter.

**C5 — Small-dataset performance adequacy.** All adequate for a tiny pastebin. bbolt
(5): B+tree, fast point reads/writes at small scale. JSON (4): fine when small, but
full-file rewrite per put is O(n). SQLite (4): pure-Go transpile is slower than the
cgo build, immaterial at this scale. Pebble (3): LSM write-amplification and
compaction overhead are pure cost when the dataset never gets large.

## Most surprising verified fact

**Pebble's own maintainers say it is *not* a general-purpose key-value store and was
never meant to be one.** Cockroach Labs writes that Pebble "filters every feature
addition and performance improvement through the criteria of whether it will be useful
to CockroachDB, which is a harsh filter for a general purpose key-value storage engine,
but that is not Pebble's goal," and the README carries an explicit "Caveat emptor!"
data-corruption warning plus *permanent, one-way* format-major-version upgrades. A
naïve "1,000+ importers, used in production at scale" reading suggests Pebble is a safe
drop-in embedded DB; the primary sources refute that for an independent small-project
adopter.

## Refuted / downgraded claims (transparency)

- **"Pebble is a battle-tested general-purpose embedded KV store" — REFUTED.** Maintainers
  explicitly scope it to CockroachDB's needs and disclaim general-purpose use; "production
  ready" refers to use *within CockroachDB*, not as an external library with a stable
  contract. [Cockroach Labs blog; Pebble README]
- **"modernc.org/sqlite supports concurrent writes" — REFUTED / clarified.** It inherits
  SQLite's single-writer model; it does not enable concurrent writes. The working pattern
  is `SetMaxOpenConns(1)` to serialize access; WAL only adds reader/writer concurrency, not
  concurrent writers. [pkg.go.dev; SQLite docs; community guidance]
- **"bbolt is unmaintained/abandoned" — REFUTED.** The etcd-io fork exists specifically as
  an active maintenance target; latest release v1.4.3 was Aug 19 2025. It is *stable*
  (API and file format frozen), which is distinct from abandoned. [bbolt README/pkg.go.dev]
- **"A flat JSON file with a mutex is concurrency-safe enough" — DOWNGRADED.** A mutex
  serializes in-process writers but provides no transactional/crash-atomic guarantee for
  partial updates; whole-file rewrite plus rename is the only safe pattern and is O(n).
  Scored 2 on C2, consistent with the brief's "outgrowing flat-file storage" premise.

## Caveats / limitations

- Scores are reasoned judgments calibrated to nightjar's stated profile (tiny single-binary
  pastebin, small dataset, single-writer today). For a different scale (large data, multi-
  process writers, heavy write throughput) the LSM engines would re-rank upward.
- No benchmarks were run; C5 is an adequacy judgment, not a measured comparison. If a
  precise throughput figure matters, run a `testing.B` micro-benchmark on representative
  paste sizes before committing.
- "Concurrent-write safety" here is *in-process* (one binary). None of these embedded
  stores is designed for safe multi-process concurrent writes to the same file; if nightjar
  ever forks multiple writer processes, that is a separate architectural question.
- The bbolt ext4 fast-commit corruption issue is kernel/filesystem-specific; verify nightjar's
  deployment targets are unaffected, or prefer SQLite/JSON if exotic filesystems are in play.

## Sources

- bbolt README & package docs — concurrency model, fixed file format, maintenance, v1.4.3: <https://github.com/etcd-io/bbolt> · <https://pkg.go.dev/go.etcd.io/bbolt>
- modernc.org/sqlite package docs — CGo-free port, v1.52.0 (Jun 6 2026), SQLite 3.53.2, platform matrix: <https://pkg.go.dev/modernc.org/sqlite>
- modernc.org/sqlite usage / `SetMaxOpenConns(1)` single-writer guidance: <https://theitsolutions.io/blog/modernc.org-sqlite-with-go>
- SQLite locking & WAL behavior (single-writer, SQLITE_BUSY): <https://sqlite.org/lockingv3.html> · <https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/>
- Pebble README & package docs — CockroachDB-internal focus, "caveat emptor", permanent format-major versions, v2.1.6 (May 27 2026): <https://github.com/cockroachdb/pebble> · <https://pkg.go.dev/github.com/cockroachdb/pebble>
- Cockroach Labs — "Introducing Pebble" (Go-native, avoids cgo boundary; "not Pebble's goal" to be general-purpose): <https://www.cockroachlabs.com/blog/pebble-rocksdb-kv-store/>
