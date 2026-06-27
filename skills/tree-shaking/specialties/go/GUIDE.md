# Go Tree Shaking, Dead Code Elimination & Binary Size Optimization

> A comprehensive guide to reducing Go binary size through compiler optimization, linker dead-code elimination, build tags, package design, and dependency hygiene.

---

# Table of Contents

1. Introduction
2. Is There Tree Shaking in Go?
3. Go Compilation Pipeline
4. Package-Level Compilation
5. Linker Dead-Code Elimination
6. Compiler SSA Optimizations
7. Inlining
8. Escape Analysis
9. Build Tags
10. Conditional Files
11. Blank Imports
12. Reflection Limits
13. Interfaces and Dynamic Dispatch
14. Generics
15. Symbol Stripping
16. Debug Info Removal
17. `trimpath`
18. CGO Considerations
19. Measuring Binary Size
20. Finding Dead Code
21. Designing Tree-Shakeable Go Packages
22. Recommended Build Commands
23. Khaos Machine Recommendations
24. Summary

---

# Introduction

Go does not use the JavaScript term "tree shaking" as a primary concept.

However, Go performs many equivalent optimizations automatically:

- unused functions are removed
- unreachable code is removed
- unused package symbols are removed
- unused generic instantiations are avoided
- inlinable code may disappear into call sites
- stack-allocated values avoid runtime heap cost
- build tags can exclude whole files
- linker flags can strip symbols and debug data

The most important principle:

> Go binaries include the reachable program graph, not every function from every imported package.

---

# Is There Tree Shaking in Go?

In JavaScript:

```js
import { a, b, c } from "./lib"

a()
```

A bundler may remove `b` and `c`.

In Go:

```go
package main

import "example.com/lib"

func main() {
    lib.A()
}
```

The Go linker can remove unused symbols from `lib`, including unused functions, methods, and data that are not reachable from `main`.

So the Go equivalent of tree shaking is mostly:

```text
compiler optimization + linker dead-code elimination
```

---

# Go Compilation Pipeline

A simplified Go build looks like this:

```text
Go Source
   │
   ▼
Package Compilation
   │
   ▼
SSA Optimization
   │
   ▼
Object Files / Archives
   │
   ▼
Linker
   │
   ▼
Dead-Code Elimination
   │
   ▼
Executable
```

The compiler optimizes each package.

The linker then walks the reachable symbol graph starting from:

```go
main.main
```

and package initialization roots.

Anything unreachable can be omitted.

---

# Package-Level Compilation

Go compiles packages as units.

Example:

```text
cmd/app
  imports internal/core
  imports internal/api
  imports internal/storage
```

Only packages reachable from the import graph are compiled and linked.

Unused packages are not included.

Example:

```go
import "net/http"
```

does not mean all of the Go standard library is embedded.

But `net/http` may itself pull in a meaningful dependency tree.

---

# Linker Dead-Code Elimination

The linker removes unused symbols.

Example:

```go
package lib

func Used() string {
    return "used"
}

func Unused() string {
    return "unused"
}
```

```go
package main

import (
    "fmt"
    "example.com/lib"
)

func main() {
    fmt.Println(lib.Used())
}
```

`lib.Unused` may be removed from the final binary.

This is the closest Go equivalent to tree shaking.

---

# Package Init Roots

Package initialization matters.

This code can force things to stay:

```go
var Global = expensiveSetup()

func expensiveSetup() *Thing {
    return &Thing{}
}
```

Even if `Global` is never directly used, package initialization may keep it reachable.

Be careful with:

```go
var x = ...
```

and:

```go
func init() {
    ...
}
```

Large `init()` functions can pull in unexpected dependencies.

---

# Compiler SSA Optimizations

Go uses SSA-based compiler optimization.

Common optimizations include:

- dead code elimination
- constant folding
- bounds-check elimination
- nil-check elimination
- copy propagation
- branch elimination
- inlining
- escape analysis
- devirtualization in limited cases

Example:

```go
if false {
    expensive()
}
```

The compiler can remove the unreachable branch.

---

# Constant Folding

```go
const size = 2 + 3
```

becomes:

```go
const size = 5
```

at compile time.

---

# Dead Branch Elimination

```go
const debug = false

func logDebug() {
    if debug {
        println("debug")
    }
}
```

The debug branch can be removed.

This is useful for compile-time feature switches.

---

# Inlining

Go can inline small functions.

Example:

```go
func add(a, b int) int {
    return a + b
}

func main() {
    println(add(2, 3))
}
```

May become:

```go
println(2 + 3)
```

Inlining can enable further optimizations like:

- constant folding
- escape reduction
- dead branch removal

Inspect inlining decisions:

```bash
go build -gcflags="-m=2" ./...
```

---

# Escape Analysis

Escape analysis decides whether values can live on the stack instead of the heap.

Example:

```go
func value() int {
    x := 42
    return x
}
```

`x` stays on the stack.

But:

```go
func pointer() *int {
    x := 42
    return &x
}
```

`x` escapes to the heap.

Inspect escape analysis:

```bash
go build -gcflags="-m=2" ./...
```

Reducing heap escapes does not always shrink binaries, but it improves runtime performance and can remove allocation paths.

---

# Build Tags

Build tags are Go's explicit compile-time feature gates.

Example:

```go
//go:build sqlite

package storage

func NewStore() Store {
    return NewSQLiteStore()
}
```

Build with:

```bash
go build -tags sqlite ./cmd/app
```

Without the `sqlite` tag, that file is excluded entirely.

This is one of the cleanest ways to remove entire subsystems.

---

# Conditional Files

Common pattern:

```text
storage_sqlite.go
storage_postgres.go
storage_memory.go
```

Each file can have a build tag.

```go
//go:build postgres
```

```go
//go:build sqlite
```

```go
//go:build memory
```

Then build variants:

```bash
go build -tags postgres ./cmd/app
go build -tags sqlite ./cmd/app
go build -tags memory ./cmd/app
```

This is excellent for:

- CLIs
- agents
- local daemons
- embedded tools
- optional integrations

---

# OS and Architecture Tags

Go automatically supports platform-specific files.

Example:

```text
keychain_darwin.go
keychain_linux.go
keychain_windows.go
```

With tags:

```go
//go:build darwin
```

```go
//go:build linux
```

```go
//go:build windows
```

Only the matching file is compiled.

---

# Blank Imports

Blank imports intentionally keep package initialization.

Example:

```go
import _ "github.com/lib/pq"
```

This imports the package only for side effects.

That means its `init()` functions run.

Blank imports are useful for plugin registration, but they also force code into the binary.

Use carefully.

---

# Reflection Limits

Reflection can reduce dead-code elimination.

Example:

```go
reflect.TypeOf(x).MethodByName(name)
```

If method names are looked up dynamically, the linker may need to keep more method metadata.

Reflection-heavy packages often increase binary size.

Common examples:

- JSON serialization
- ORMs
- RPC frameworks
- dependency injection containers
- plugin registries

Prefer explicit registration when size matters.

---

# Interfaces and Dynamic Dispatch

Interfaces are not bad.

But they can make call graphs less obvious.

Example:

```go
type Runner interface {
    Run() error
}
```

If many types satisfy `Runner`, and reflection or dynamic registration is involved, more code may remain reachable.

Prefer narrow interfaces:

```go
type Reader interface {
    Read([]byte) (int, error)
}
```

Avoid giant capability interfaces.

---

# Generics

Go generics are generally efficient.

Example:

```go
func Map[T any](items []T, fn func(T) T) []T {
    out := make([]T, len(items))
    for i, v := range items {
        out[i] = fn(v)
    }
    return out
}
```

The compiler emits needed instantiations.

Unused generic functions are removed if unreachable.

Avoid huge generic utility packages that are imported everywhere if only tiny pieces are needed.

---

# Symbol Stripping

For smaller release binaries:

```bash
go build -ldflags="-s -w" ./cmd/app
```

Meaning:

```text
-s  omit symbol table
-w  omit DWARF debug info
```

This often significantly reduces binary size.

Tradeoff:

- smaller binaries
- less debugging information
- less useful stack traces in some tooling

---

# trimpath

Use:

```bash
go build -trimpath ./cmd/app
```

This removes local file system paths from the compiled binary.

Useful for:

- reproducible builds
- privacy
- smaller metadata
- cleaner release artifacts

---

# Recommended Release Build

Common release build:

```bash
go build \
  -trimpath \
  -ldflags="-s -w" \
  -o bin/app \
  ./cmd/app
```

With feature tags:

```bash
go build \
  -trimpath \
  -tags "sqlite local mlx" \
  -ldflags="-s -w" \
  -o bin/app \
  ./cmd/app
```

---

# CGO Considerations

CGO can increase binary size and deployment complexity.

With CGO:

```bash
CGO_ENABLED=1 go build ./cmd/app
```

Without CGO:

```bash
CGO_ENABLED=0 go build ./cmd/app
```

Pure Go binaries are usually easier to distribute.

Prefer:

```bash
CGO_ENABLED=0
```

when possible.

But CGO may be required for:

- SQLite C bindings
- system libraries
- GPU runtimes
- platform APIs
- audio/video libraries

---

# Measuring Binary Size

Basic size:

```bash
ls -lh bin/app
```

Inspect symbols:

```bash
go tool nm bin/app
```

Sort largest symbols:

```bash
go tool nm -size bin/app | sort -nr | head -50
```

Inspect build metadata:

```bash
go version -m bin/app
```

Compare builds:

```bash
go build -o bin/app-debug ./cmd/app

go build -trimpath -ldflags="-s -w" -o bin/app-release ./cmd/app

ls -lh bin/app-debug bin/app-release
```

---

# Finding Dead Code

Install:

```bash
go install golang.org/x/tools/cmd/deadcode@latest
```

Run:

```bash
deadcode ./...
```

This finds unreachable functions in your source tree.

This is not exactly the same as linker dead-code elimination, but it helps identify code that can be removed or refactored.

---

# Dependency Hygiene

Check dependencies:

```bash
go mod graph
```

Why a package is needed:

```bash
go mod why example.com/some/module
```

Clean unused module requirements:

```bash
go mod tidy
```

View module metadata in binary:

```bash
go version -m bin/app
```

---

# Common Binary Bloat Sources

## net/http

Useful, but pulls in meaningful dependency surface.

## crypto/tls

Often large but necessary for HTTPS.

## database/sql drivers

Drivers can pull in C libraries or large dependency trees.

## cloud SDKs

AWS, Google Cloud, Azure SDKs can be large.

## reflection-heavy frameworks

Serialization, DI, RPC, and ORMs can retain more metadata.

## embedded assets

Large files embedded with `embed` directly increase binary size.

---

# Embedding Assets

Example:

```go
//go:embed web/*
var assets embed.FS
```

Everything matched is embedded into the binary.

Good for:

- single-file distribution
- local admin UIs
- CLIs
- daemons

Bad for:

- very large media
- model files
- videos
- large frontend bundles

For large assets, consider:

- external files
- lazy downloads
- content-addressed storage
- optional bundles

---

# Designing Tree-Shakeable Go Packages

Prefer this:

```text
internal/core
internal/logging
internal/config
internal/inference/openai
internal/inference/ollama
internal/inference/mlx
internal/storage/sqlite
internal/storage/postgres
internal/storage/memory
internal/media/video
internal/media/audio
internal/workflow
```

Avoid this:

```text
internal/everything
```

Good package design improves dead-code elimination.

---

# Avoid Global Registries

This pattern can pull in everything:

```go
func init() {
    Register("provider-a", NewProviderA)
    Register("provider-b", NewProviderB)
    Register("provider-c", NewProviderC)
}
```

Better:

```go
func RegisterProviders(r *Registry) {
    providera.Register(r)
}
```

Then each app chooses what to include.

---

# Prefer Explicit Imports

Bad:

```go
import (
    _ "app/providers/all"
)
```

Good:

```go
import (
    "app/providers/openai"
    "app/providers/ollama"
)
```

This gives the linker less mandatory work.

---

# Use Build Tags for Features

Example:

```text
providers_openai.go
providers_ollama.go
providers_mlx.go
providers_bedrock.go
```

```go
//go:build openai
```

```go
//go:build ollama
```

```go
//go:build mlx
```

Build variants:

```bash
go build -tags "openai ollama" ./cmd/khaosd
go build -tags "local mlx" ./cmd/khaosd
go build -tags "cloud bedrock openai" ./cmd/khaosd
```

---

# Suggested Project Layout

```text
cmd/
  khaosd/
    main.go

internal/
  core/
  config/
  logging/
  registry/

  inference/
    openai/
    ollama/
    mlx/
    llama/
    bedrock/

  workflow/
  agents/
  media/
  storage/
  api/
  ui/

pkg/
  kspd/
  screenplay/
  graph/
```

Keep optional integrations out of core.

---

# Example Feature-Gated Provider

```go
// internal/inference/openai/provider.go

//go:build openai

package openai

import "app/internal/inference"

func Register(r *inference.Registry) {
    r.Register("openai", NewProvider)
}
```

```go
// cmd/khaosd/providers_openai.go

//go:build openai

package main

import (
    "app/internal/inference"
    "app/internal/inference/openai"
)

func registerOpenAI(r *inference.Registry) {
    openai.Register(r)
}
```

```go
// cmd/khaosd/providers_stub.go

//go:build !openai

package main

import "app/internal/inference"

func registerOpenAI(r *inference.Registry) {}
```

Now OpenAI support is only compiled when built with:

```bash
go build -tags openai ./cmd/khaosd
```

---

# Khaos Machine Recommendations

For Khaos Machine and LOSWFX-style services, use Go build tags to produce focused binaries.

Example binaries:

```text
khaosd-local
khaosd-cloud
khaosd-studio
khaosd-agent
khaosd-worker
khaos-cli
```

Each binary can include only the required features.

Example:

```bash
go build \
  -trimpath \
  -tags "local sqlite ollama mlx" \
  -ldflags="-s -w" \
  -o bin/khaosd-local \
  ./cmd/khaosd
```

```bash
go build \
  -trimpath \
  -tags "cloud postgres openai bedrock s3" \
  -ldflags="-s -w" \
  -o bin/khaosd-cloud \
  ./cmd/khaosd
```

```bash
go build \
  -trimpath \
  -tags "worker media s3 ffmpeg" \
  -ldflags="-s -w" \
  -o bin/khaos-worker \
  ./cmd/worker
```

This gives you practical tree shaking at the product level.

---

# Best Practices Checklist

Use:

```text
✓ small packages
✓ explicit dependencies
✓ build tags for optional systems
✓ no giant provider registries
✓ minimal init functions
✓ few blank imports
✓ narrow interfaces
✓ limited reflection
✓ pure Go where practical
✓ -trimpath for release builds
✓ -ldflags="-s -w" for smaller binaries
✓ deadcode tool for cleanup
✓ go mod tidy
✓ go mod why
✓ go tool nm -size
```

Avoid:

```text
✗ importing provider/all
✗ huge init-time registration
✗ reflection-heavy magic
✗ embedding large assets blindly
✗ global singletons that reference everything
✗ unnecessary cloud SDK imports
✗ unused database drivers
✗ CGO unless required
```

---

# Summary

Go has strong tree-shaking-like behavior, but it is not presented as a single feature.

The most important mechanisms are:

```text
1. linker dead-code elimination
2. compiler SSA optimization
3. inlining
4. escape analysis
5. build tags
6. conditional files
7. symbol/debug stripping
8. modular package architecture
```

For small and efficient Go binaries, architecture matters as much as compiler flags.

Design your system so optional capabilities live in separate packages, are imported explicitly, and can be excluded with build tags. Then use release flags like:

```bash
go build -trimpath -ldflags="-s -w" ./cmd/app
```

This gives Go a practical equivalent to tree shaking while preserving its simple static binary deployment model.