# Go specialty — tree-shaking

> Specialty of the **[tree-shaking](../../SKILL.md)** skill. The router holds the
> cross-language playbook (the one idea, the measure→diagnose→fix→verify loop);
> this file is the Go-specific lever order, flags, and checks. The mechanism
> deep-dive (the SSA pipeline, linker reachability, escape analysis, CGO tradeoffs)
> lives in the companion **[GUIDE.md](GUIDE.md)**.

Go has no "tree shaking" feature by name, but it gets the same outcome from a *stack*
of compiler, linker, and architectural levers — and the biggest wins are
architectural, not flag-level. This is the playbook for **which lever to pull, in
what order, and how to prove it worked.**

## The one idea (Go)

> The linker keeps the *reachable program graph* from `main.main` (plus `init`
> roots), not every function in every imported package. Every lever below either
> (a) shrinks the reachable graph, or (b) stops forcing code to stay reachable.

Reach for architecture and build tags first (they unlock the most), dependency
hygiene second, release flags last. The compiler's automatic passes (SSA DCE,
inlining, escape analysis) are free — you don't pull them, you just avoid blocking
them.

## Lever order (highest leverage first)

1. **Package granularity + explicit imports.** Small, focused packages under
   `internal/<capability>/...` mean unreachable capabilities are never linked. Import
   the concrete package you need (`providers/openai`), never a `providers/all`
   barrel. → GUIDE: *Package-Level Compilation*, *Prefer Explicit Imports*,
   *Designing Tree-Shakeable Go Packages*.
2. **Build tags / conditional files.** Go's cleanest feature gate — a `//go:build
   sqlite` file is excluded entirely without the tag, removing whole subsystems
   before they reach the linker. Pattern: `storage_sqlite.go` / `_postgres.go` /
   `_memory.go`, one tag each; ship per-feature binaries. → GUIDE: *Build Tags*,
   *Conditional Files*, *Use Build Tags for Features*.
3. **Kill global registries & heavy `init`.** A package-level `init()` that
   `Register(...)`s every provider drags them all into the live set. Prefer
   caller-driven `RegisterProviders(r)` so each binary opts in. Watch package-level
   `var x = setup()` and large `init()` — they're reachability roots. → GUIDE:
   *Package Init Roots*, *Avoid Global Registries*, *Blank Imports*.
4. **Dependency hygiene.** Fat deps (cloud SDKs, `database/sql` drivers,
   reflection-heavy frameworks) dominate size. `go mod why` a suspect, drop it or
   gate it, then `go mod tidy`. Prefer `CGO_ENABLED=0` unless a C binding is truly
   required. → GUIDE: *Dependency Hygiene*, *Common Binary Bloat Sources*, *CGO
   Considerations*.
5. **Limit reflection; narrow interfaces.** Dynamic `MethodByName`/type lookups force
   the linker to retain method metadata, defeating DCE. Prefer explicit registration
   and small interfaces (`io.Reader`, not God interfaces). → GUIDE: *Reflection
   Limits*, *Interfaces and Dynamic Dispatch*.
6. **Embed assets deliberately.** `//go:embed web/*` bakes every match into the
   binary. Fine for small UIs/configs; for models/media/video use external files or
   content-addressed storage. → GUIDE: *Embedding Assets*.
7. **Release flags last: `-trimpath -ldflags="-s -w"`.** Strip the symbol table
   (`-s`) and DWARF (`-w`); `-trimpath` removes local paths. Real, reliable size cut
   — but it's the finishing pass, not the strategy. → GUIDE: *Symbol Stripping*,
   *trimpath*, *Recommended Release Build*.

## Workflow — the router loop, instantiated for Go

Follow the universal measure→diagnose→fix→verify loop from the router, with these
Go commands:

1. **Baseline.** `go build -o bin/app ./cmd/app && ls -lh bin/app`. Keep it.
2. **Diagnose where the bytes are.** Largest symbols:
   `go tool nm -size bin/app | sort -nr | head -50`. What pulled a dep in:
   `go mod why <module>`; embedded module list: `go version -m bin/app`. Unreachable
   source: `deadcode ./...`. → GUIDE: *Measuring Binary Size*, *Finding Dead Code*.
3. **Pick the lever** that matches the dominant cost (a fat cloud SDK → gate or drop
   it; an `init`-time registry pulling every provider → make registration explicit;
   an optional subsystem → put it behind a build tag).
4. **Apply one change** — one lever at a time so the delta is attributable.
5. **Re-measure** with the same `ls -lh` / `nm -size`; state the delta in bytes/%,
   not "should be smaller." Diff two builds directly:
   `go build -o bin/app-debug ./cmd/app && go build -trimpath -ldflags="-s -w" -o bin/app-rel ./cmd/app && ls -lh bin/app-*`.
6. **Repeat** down the lever list until win-per-effort drops off.

## Release build commands (the reliable baseline)

```bash
# minimal release: strip symbols + DWARF, trim paths
go build -trimpath -ldflags="-s -w" -o bin/app ./cmd/app

# feature-gated product binary (only the tagged subsystems compile in)
go build -trimpath -tags "local sqlite ollama mlx" -ldflags="-s -w" \
  -o bin/khaosd-local ./cmd/khaosd

# pure-Go, easiest to distribute (no C toolchain, static binary)
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/app ./cmd/app
```

Prefer `CGO_ENABLED=0` for portable static binaries; enable CGO only when a C binding
(SQLite, GPU runtime, platform/audio lib) genuinely requires it. → GUIDE: *Recommended
Release Build*, *Khaos Machine Recommendations*.

## Anti-patterns to catch (the usual size leaks)

- **`import _ "app/providers/all"`** — a barrel blank-import forces every provider in.
  Import the concrete packages a binary actually uses.
- **Giant `init()` registries** — package-level registration of everything keeps it
  all reachable. Push the choice to the caller / composition root.
- **Reflection-heavy magic** (DI containers, generic serializers, ORMs) — retains
  method metadata and blocks DCE. Prefer explicit wiring when size matters.
- **Unused / fat deps** — stray cloud SDKs, extra DB drivers, leftover modules.
  `go mod why` then `go mod tidy`.
- **Blind `//go:embed`** of large media/models — bakes megabytes in; externalize.
- **Reflexive CGO** — bloats the binary and complicates deployment; default to
  `CGO_ENABLED=0`.
→ GUIDE: *Common Binary Bloat Sources*, *Best Practices Checklist*.

## Designing tree-shakeable Go packages

When building (not just trimming), bias toward: small `internal/<capability>`
packages · explicit imports over barrels · build tags for every optional subsystem ·
caller-driven registration (no global `init` registries) · minimal `init`/package
vars · narrow interfaces · limited reflection · pure Go where practical. Produce
focused per-feature binaries (`khaosd-local`, `khaosd-cloud`, `khaos-worker`) that
each compile in only what they need. → GUIDE: *Designing Tree-Shakeable Go Packages*,
*Suggested Project Layout*, *Khaos Machine Recommendations*.

## Pre-ship checklist

- [ ] Baseline and post-change sizes recorded; deltas stated in real numbers.
- [ ] Release flags set: `-trimpath -ldflags="-s -w"`; `CGO_ENABLED=0` unless C is
      required.
- [ ] No `providers/all` barrel or blank-import of everything; imports are explicit.
- [ ] Optional subsystems gated behind `//go:build` tags; per-feature binaries build.
- [ ] No `init`-time global registry pulling unrelated code; registration is
      caller-driven.
- [ ] Reflection and interface surface kept narrow; no dynamic method lookups where
      explicit wiring works.
- [ ] `go mod tidy` clean; every heavy dep justified via `go mod why`.
- [ ] Largest symbols reviewed (`go tool nm -size … | sort -nr`); win confirmed
      against the recorded baseline, not assumed.
