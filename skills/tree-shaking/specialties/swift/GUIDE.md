# Swift Tree Shaking, Dead Code Elimination & Binary Size Optimization

> A comprehensive guide to building minimal, highly optimized Swift applications and frameworks.

---

# Table of Contents

1. Introduction
2. Understanding "Tree Shaking" in Swift
3. Swift Compilation Pipeline
4. Dead Code Elimination
5. Link-Time Dead Stripping
6. Whole Module Optimization
7. Optimization Levels
8. Visibility & API Design
9. Library Evolution
10. Static vs Dynamic Libraries
11. Swift Packages
12. Generic Specialization
13. ARC Optimization
14. Inlining
15. Conditional Compilation
16. Runtime Plugin Architectures
17. Measuring Binary Size
18. Advanced LLVM Optimizations
19. Designing Tree-Shakeable Libraries
20. Khaos Machine Recommendations

---

# Introduction

Unlike JavaScript ecosystems (Rollup, Vite, Webpack, esbuild), Swift does not advertise "tree shaking" as a single feature.

Instead, Swift achieves many of the same outcomes through a collection of compiler, linker, and LLVM optimizations that collectively eliminate:

- unused functions
- unused types
- unused generic instantiations
- unreachable branches
- redundant ARC operations
- unnecessary allocations
- unused object files
- entire static libraries

When properly configured, Swift applications can become remarkably small while maintaining excellent runtime performance.

---

# What is Tree Shaking?

Tree shaking is the process of removing code that is never used.

Example:

```swift
func add() {}

func subtract() {}

func multiply() {}

func divide() {}

add()
```

Only:

```
add()
```

is referenced.

The compiler and linker may completely remove:

```
subtract()
multiply()
divide()
```

from the final executable.

---

# Swift Compilation Pipeline

Swift optimization happens in several stages.

```
Swift Source
      │
      ▼
Swift Frontend
      │
      ▼
Swift Intermediate Language (SIL)
      │
      ▼
SIL Optimization Passes
      │
      ▼
LLVM IR
      │
      ▼
LLVM Optimization
      │
      ▼
Machine Code
      │
      ▼
Linker
      │
      ▼
Dead Strip
      │
      ▼
Final Executable
```

Each stage removes more unnecessary code.

---

# SIL (Swift Intermediate Language)

SIL is where most Swift-specific optimizations occur.

Examples include:

- devirtualization
- ARC optimization
- specialization
- constant propagation
- ownership optimization
- dead function elimination
- stack promotion

Most developers never interact directly with SIL, but it is responsible for much of Swift's performance.

---

# Dead Code Elimination

Swift removes code proven to be unreachable.

Example:

```swift
func foo() {
    print("Hello")
}

func unused() {
    print("Never called")
}

foo()
```

`unused()` may never appear in the executable.

---

# Constant Folding

Example:

```swift
let x = 2 + 3
```

becomes

```swift
let x = 5
```

at compile time.

---

# Branch Elimination

```swift
if false {
    expensiveOperation()
}
```

becomes

```swift
// removed
```

---

# Dead Store Elimination

```swift
var x = 5
x = 10
print(x)
```

The initial assignment may disappear.

---

# Link-Time Dead Stripping

Perhaps the closest thing to JavaScript tree shaking.

Enable:

```
Dead Code Stripping = YES
```

or

```
OTHER_LDFLAGS = -dead_strip
```

The linker removes:

- unused object files
- unused functions
- unused symbols

This is extremely effective with static libraries.

---

# Whole Module Optimization (WMO)

Normally Swift compiles files independently.

```
File A
File B
File C
```

With WMO:

```
Entire Module
```

The compiler can:

- inline across files
- eliminate more code
- optimize generics
- remove redundant calls

Enable:

```
Whole Module Optimization = YES
```

or

```
-whole-module-optimization
```

---

# Optimization Levels

Swift offers several optimization modes.

## -Onone

Debugging.

No meaningful optimization.

---

## -O

Maximum runtime performance.

Most applications should ship with this.

---

## -Osize

Optimizes for binary size.

Often preferable for:

- command-line tools
- watchOS
- embedded utilities
- helper daemons

---

# API Visibility

Visibility dramatically affects optimization.

Best:

```swift
private
```

Then:

```swift
fileprivate
```

Then:

```swift
internal
```

Avoid making everything:

```swift
public
```

or

```swift
open
```

Public APIs become contractual.

The compiler must preserve them.

---

# Final Classes

Example:

```swift
final class Cache
```

Benefits:

- devirtualization
- better inlining
- faster dispatch
- improved dead code elimination

Prefer `final` unless subclassing is required.

---

# Library Evolution

Avoid enabling:

```
BUILD_LIBRARY_FOR_DISTRIBUTION = YES
```

unless shipping a binary SDK.

It prevents numerous optimizations because ABI compatibility must be maintained.

---

# Static Libraries

Static linking enables aggressive dead stripping.

```
Application
    │
    ├── Core
    ├── Speech
    ├── Vision
    └── ML
```

If only:

```
Core
Speech
```

are referenced:

```
Vision
ML
```

may never be linked.

---

# Dynamic Frameworks

Dynamic frameworks are loaded as complete binaries.

Unused APIs inside them cannot always be removed.

Therefore:

```
Static Packages
```

are generally more tree-shakeable.

---

# Swift Packages

Swift Package Manager naturally supports modular architectures.

Example:

```
Core

UI

Networking

Speech

Vision

Agents

Workflow
```

Applications import only what they require.

Unused packages are never linked.

---

# Package Design

Good:

```
KhaosCore

KhaosSpeech

KhaosVision

KhaosML

KhaosWorkflow
```

Poor:

```
KhaosEverything
```

Large monolithic packages reduce optimization opportunities.

---

# Generic Specialization

Swift generates concrete implementations.

Example:

```swift
func process<T>(_ value: T)
```

Only used with:

```swift
Int
String
```

The compiler emits:

```
process(Int)

process(String)
```

Unused specializations disappear.

---

# ARC Optimization

Swift aggressively removes unnecessary:

```
retain

release
```

operations.

Swift 6 significantly improved:

- ownership analysis
- move-only semantics
- borrow checking
- escape analysis

resulting in fewer heap allocations.

---

# Inlining

Functions may disappear entirely.

Example:

```swift
@inline(__always)
func square(_ x: Int) -> Int {
    x * x
}
```

becomes:

```
value * value
```

at the call site.

Use sparingly.

---

# @inlinable

Useful for libraries.

```swift
@inlinable
public func hash(...)
```

Allows downstream modules to optimize through the function body.

Tradeoff:

- faster
- larger binaries

Use selectively.

---

# Conditional Compilation

Entire features can disappear.

```swift
#if DEBUG
Logger.debug(...)
#endif
```

Release builds:

```
Logger removed entirely.
```

---

Feature flags:

```swift
#if ENABLE_SPEECH
...
#endif
```

can eliminate entire subsystems.

---

# Runtime Plugins

Instead of linking everything:

```
Editor

Speech

Vision

OCR

Translation

Agents
```

Load only required modules.

```
Core
    │
    ├── Plugin A
    ├── Plugin B
    └── Plugin C
```

Benefits:

- smaller startup
- modular deployment
- optional capabilities

---

# Measuring Binary Size

Useful tools:

```
size
```

```
nm
```

```
otool
```

```
swift-demangle
```

```
dwarfdump
```

```
llvm-size
```

```
llvm-objdump
```

```
xcrun dwarfdump
```

Xcode also includes:

```
Build Report

Link Map Files

Size Reports
```

Generate link maps:

```
Write Link Map File = YES
```

to inspect exactly what contributes to binary size.

---

# LLVM Optimizations

Swift ultimately benefits from LLVM.

Examples include:

- constant propagation
- loop unrolling
- dead store elimination
- common subexpression elimination
- instruction combining
- vectorization
- register allocation
- peephole optimization

---

# Common Mistakes

## Giant Modules

Bad:

```
KhaosKit
```

Good:

```
KhaosCore

KhaosSpeech

KhaosML

KhaosVideo

KhaosWorkflow
```

---

## Excessive Public APIs

Every public symbol limits optimization.

Keep implementation details internal.

---

## Dynamic Framework Overuse

Dynamic frameworks increase launch time and reduce dead stripping opportunities.

---

## Reflection Everywhere

Heavy runtime reflection limits compiler reasoning.

Prefer static typing.

---

## Global Singletons

Large singletons often force unrelated code into memory.

Prefer dependency injection.

---

# Designing Tree-Shakeable Frameworks

A highly optimizable framework should exhibit:

✓ Small focused packages

✓ Static linking

✓ Internal implementations

✓ Minimal public API

✓ Feature flags

✓ Lazy initialization

✓ Explicit dependencies

✓ Limited runtime reflection

✓ Pure functions where practical

✓ Clear ownership boundaries

---

# Recommended Build Settings

Release:

```
Optimization Level:
    -O

or

    -Osize
```

```
Whole Module Optimization
    YES
```

```
Dead Code Stripping
    YES
```

```
Strip Linked Product
    YES
```

```
Strip Debug Symbols
    YES
```

```
Library Evolution
    NO
```

```
Build Active Architecture Only
    NO
```

---

# Khaos Machine Architecture Recommendations

For a modular, local-first platform such as the Khaos Machine, organize functionality into narrowly scoped Swift Packages that can be statically linked and omitted entirely when unused. A possible package graph might look like:

```
KhaosCore
├── Foundation utilities
├── Logging
├── Configuration
└── Dependency injection

KhaosAgents
├── Agent runtime
├── Scheduling
└── Tool invocation

KhaosInference
├── OpenAI-compatible client
├── MLX
├── llama.cpp
└── Ollama adapters

KhaosSpeech
├── STT
├── TTS
└── Voice conversion

KhaosVision
├── OCR
├── Detection
├── Segmentation
└── CoreML Vision

KhaosMedia
├── Video
├── Audio
├── Image
└── Metadata

KhaosWorkflow
├── Jobs
├── Pipelines
├── State machines
└── Automation

KhaosUI
├── SwiftUI
├── Widgets
└── App Intents
```

Applications would depend only on the capabilities they need. A lightweight CLI might import only `KhaosCore` and `KhaosWorkflow`, while a desktop media application could add `KhaosVision`, `KhaosSpeech`, and `KhaosInference`. With static linking, Whole Module Optimization, and dead stripping enabled, unused packages and symbols are excluded from the final executable.

This modular design not only reduces binary size but also improves incremental builds, test isolation, dependency management, and long-term maintainability.

---

# Summary

Swift does not provide a single "tree shaking" feature analogous to JavaScript bundlers. Instead, it achieves equivalent or better results through the combined effects of SIL optimization, LLVM optimization, link-time dead stripping, Whole Module Optimization, generic specialization, ownership analysis, ARC optimization, and thoughtful package architecture.

The most effective strategy is architectural: design small, cohesive modules with minimal public APIs, prefer static linking, enable aggressive optimization for release builds, and use conditional compilation or feature flags to exclude optional capabilities. When combined, these practices produce fast, compact, and highly maintainable Swift applications.