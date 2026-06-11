# 📊 Certification Report Card — nightjar

*This report was produced by the `certify` skill (`skills/certify/SKILL.md`), executed by Claude Code against the Go demo project at `demo/nightjar` on 2026-06-11. All findings derive solely from direct inspection, `go build` / `go vet` / `go test` / `golangci-lint` runs, and git history of that directory. The repo was not modified.*

**Repository:** `demo/nightjar` (Go 1.24, module `github.com/iksnae/skills/demo/nightjar`)
**Generated:** 2026-06-11
**Overall Grade:** 🟢 **A− (91.2%)**
**Pass Rate:** 100% (20/20 units at grade B or above)
**Status mix:** 12 certified · 8 certified_with_observations · 0 probationary · 0 decertified

## Evidence Summary

| Source | Result |
|--------|--------|
| `go build ./...` | clean |
| `go vet ./...` | clean |
| `golangci-lint run ./...` | 0 issues |
| `go test -count=1 -cover ./...` | all pass; `internal/store` **77.1%**, `internal/server` **0.0%**, `cmd/nj` **0.0%** |
| git history | 6 commits, all on 2026-06-11, 1 contributor, repo age 0 days |

Change Risk is scored 0.70 uniformly: the code is brand new (all churn within 24h, single author, no stabilization history). This is a property of the demo's age, not its quality.

**Scoring judgment calls** (disclosed for honesty): `_ = json.NewEncoder(w).Encode(...)` on HTTP responses and `_ = fs.Parse` under `flag.ExitOnError` are idiomatic Go; each repeated pattern was penalized once per unit, not per occurrence. `os.Exit` in a `main`-package CLI is conventional but still scored per policy (it blocks testability), which is why the `cmd/nj` units sit in the B range.

## Per-Unit Scores

Dimensions: **Cor**rectness ·20, **Mnt** maintainability ·15, **Rdb** readability ·10, **Tst** testability ·15, **Sec**urity ·10, **Arc**h fitness ·10, **Ops** quality ·10, **Prf** performance ·05, **Rsk** change risk ·05.

| Unit | Cor | Mnt | Rdb | Tst | Sec | Arc | Ops | Prf | Rsk | Score | Grade | Status |
|------|----:|----:|----:|----:|----:|----:|----:|----:|----:|------:|:-----:|--------|
| `go://internal/store/store.go#Paste` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 98.5% | A | certified |
| `go://internal/store/store.go#Load` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 98.5% | A | certified |
| `go://internal/store/store.go#File` | 1.00 | 1.00 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 98.0% | A | certified |
| `go://internal/store/store.go#Store` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.85 | 1.00 | 1.00 | 0.70 | 97.0% | A | certified |
| `go://internal/store/store.go#New` | 0.90 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.90 | 1.00 | 0.70 | 95.5% | A | certified |
| `go://internal/store/store.go#Get` | 0.90 | 0.90 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 95.0% | A | certified |
| `go://cmd/nj/main.go#usage` | 1.00 | 1.00 | 1.00 | 0.70 | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 94.0% | A | certified |
| `go://internal/store/store.go#Save` | 0.90 | 1.00 | 1.00 | 1.00 | 0.90 | 1.00 | 0.80 | 1.00 | 0.70 | 93.5% | A | certified |
| `go://internal/store/store.go#Add` | 0.80 | 1.00 | 1.00 | 1.00 | 1.00 | 0.90 | 0.85 | 1.00 | 0.70 | 92.0% | A− | certified_with_observations |
| `go://internal/store/store.go#newID` | 0.80 | 1.00 | 1.00 | 1.00 | 0.90 | 1.00 | 0.85 | 1.00 | 0.70 | 92.0% | A− | certified_with_observations |
| `go://internal/server/server.go#ListenAndServe` | 1.00 | 1.00 | 1.00 | 0.70 | 0.90 | 1.00 | 0.85 | 1.00 | 0.70 | 91.5% | A− | certified_with_observations |
| `go://internal/server/server.go#Server` | 0.85 | 1.00 | 1.00 | 0.70 | 1.00 | 0.85 | 1.00 | 1.00 | 0.70 | 89.5% | B+ | certified_with_observations |
| `go://internal/server/server.go#New` | 0.85 | 1.00 | 1.00 | 0.70 | 1.00 | 0.85 | 0.90 | 1.00 | 0.70 | 88.5% | B+ | certified_with_observations |
| `go://cmd/nj/main.go#cmdServe` | 0.95 | 0.95 | 1.00 | 0.65 | 0.90 | 0.90 | 0.90 | 1.00 | 0.70 | 88.5% | B+ | certified |
| `go://cmd/nj/main.go#main` | 0.95 | 0.90 | 1.00 | 0.70 | 0.80 | 0.90 | 0.90 | 1.00 | 0.70 | 87.5% | B+ | certified |
| `go://cmd/nj/main.go#cmdList` | 0.90 | 0.95 | 1.00 | 0.65 | 0.90 | 0.90 | 0.90 | 1.00 | 0.70 | 87.5% | B+ | certified |
| `go://cmd/nj/main.go#cmdAdd` | 0.95 | 0.95 | 1.00 | 0.65 | 0.70 | 0.90 | 0.90 | 1.00 | 0.70 | 86.5% | B | certified |
| `go://cmd/nj/main.go#cmdGet` | 0.95 | 0.95 | 1.00 | 0.65 | 0.70 | 0.90 | 0.85 | 1.00 | 0.70 | 86.0% | B | certified |
| `go://internal/server/server.go#handlePastes` | 0.95 | 0.84 | 0.80 | 0.60 | 0.95 | 0.80 | 0.85 | 0.90 | 0.70 | 82.6% | B | certified_with_observations |
| `go://internal/server/server.go#handleIndex` | 0.75 | 0.90 | 0.95 | 0.60 | 0.95 | 0.85 | 0.90 | 0.90 | 0.70 | 82.0% | B | certified_with_observations |

## Grade Distribution

| Grade | Count | Percentage |
|-------|------:|-----------:|
| A     |     8 | 40% |
| A−    |     3 | 15% |
| B+    |     5 | 25% |
| B     |     4 | 20% |
| C     |     0 | 0% |
| D     |     0 | 0% |
| F     |     0 | 0% |

## By Package

| Package | Units | Avg Score | Test Coverage |
|---------|------:|----------:|--------------:|
| `internal/store` | 9 | 95.6% | 77.1% |
| `internal/server` | 5 | 86.8% | 0.0% |
| `cmd/nj` | 6 | 88.3% | 0.0% |

## Top Issues

| Unit | Grade | Score | Issue |
|------|:-----:|------:|-------|
| `server.go#handleIndex` | B | 82.0% | **Stale paste count bug:** header renders `s.indexCount` (cached once in `New`) while the table renders a fresh `Load()` — after any new paste the count is wrong. Snippet truncation `snippet[:64]` can split a multi-byte UTF-8 rune. |
| `server.go#handlePastes` | B | 82.6% | Cyclomatic complexity ≈ 18 (> 15, **error** violation `complexity_limit`); ~100 code lines (> 80, `func_length` warning); three routes hand-rolled in one function with duplicated error-response boilerplate (10×) and `map[string]interface{}` payloads. Zero test coverage. |
| `store.go#Add` | A− | 92.0% | **Unsynchronized read-modify-write:** `Load` → append → `Save` with no mutex/file lock. Safe for the CLI; under `nj serve`, concurrent POSTs can silently drop pastes. |
| `store.go#newID` | A− | 92.0% | `n, _ := rand.Int(...)` — if crypto/rand fails, `n` is nil and `n.Int64()` panics (latent nil deref). |
| `server.go#New` / `#Server` | B+ | 88.5/89.5% | `pastes, _ := st.Load()` swallows a corrupt-store error and silently primes count = 0; the cached-count design is the root cause of the `handleIndex` bug. |
| `store.go#Save` | A | 93.5% | Non-atomic write: a crash mid-`WriteFile` corrupts `pastes.json` (no temp-file + rename). File mode 0644 for potentially private paste data. |
| `cmd/nj` (all subcommands) | B/B+ | 86–88.5% | 10 `os.Exit` call sites across helpers make subcommands untestable; `cmdGet` exits silently (no message) on not-found; `cmdList` snippet `[:40]` can split UTF-8 runes. |

**Repo-level finding (not unit-scored):** `README.md` documents `nj rm <id>`, but no `rm` command exists in `main.go` — the README promises an unimplemented feature.

## Remediation Plan

No unit graded D or F, so no remediation is *required* for certification. The following prioritized plan addresses the observations above.

### Priority 1: Correctness bugs (effort S–M, impact: handleIndex B→A−, Add A−→A)

1. **Fix the stale index count** (root cause: cached state in `Server`). Delete `indexCount`; use `len(pastes)` from the fresh `Load()` in `handleIndex`. Also removes the swallowed error in `server.New`. *Effort: S.*
2. **Serialize store mutations.** Add a `sync.Mutex` to `Store` guarding `Add` (and `Save`), or document the store as single-writer. *Effort: S.*
3. **Handle the `rand.Int` error in `newID`** — return `(string, error)` or fall back safely; eliminates the latent nil-deref panic. *Effort: S.*
4. **Reconcile README with reality:** implement `nj rm <id>` or remove it from the docs. *Effort: S–M.*

### Priority 2: Test coverage (effort M, impact: server units +10–15 pts each, overall ≈ +2.5%)

5. **Add `httptest` coverage for `internal/server`** (currently 0%): list/create/fetch happy paths, 404, 405, empty-content 400, JSON vs raw body. This is the largest untested surface and would have caught the stale-count bug. *Effort: M.*
6. Extract `cmd/nj` subcommand bodies into functions returning `error` (single `os.Exit` in `main`) so they become testable. *Effort: M.*

### Priority 3: Structure & hardening (effort S–M, impact: handlePastes B→B+/A−)

7. **Split `handlePastes`** into `handleList` / `handleCreate` / `handleGetOne` with a shared `writeJSON(w, status, v)` helper — resolves the `complexity_limit` error violation and the 10× response boilerplate; replace `map[string]interface{}` with small response structs. *Effort: M.*
8. Rune-safe snippet truncation (shared helper used by `cmdList`, `handlePastes`, `handleIndex` — currently triplicated). *Effort: S.*
9. Atomic store writes (write temp file + `os.Rename`), consider 0600 file mode; add `WriteTimeout`/`IdleTimeout` to the `http.Server`; have `Get` reuse `Load` and map a missing file to `ErrNotFound`. *Effort: S.*

### Estimated Impact

- P1: overall **+1.5%** (≈ 92.7%, A−), and removes all three genuine bugs.
- P1+P2: overall **+4%** (≈ 95%, **A**), server package no longer dark.
- P1+P2+P3: all units ≥ A−, no outstanding policy violations.
