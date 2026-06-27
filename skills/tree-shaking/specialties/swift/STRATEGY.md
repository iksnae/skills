# Swift specialty — tree-shaking

> Specialty of the **[tree-shaking](../../SKILL.md)** skill. The router holds the
> cross-language playbook (the one idea, the measure→diagnose→fix→verify loop);
> this file is the Swift-specific lever order, flags, and checks. The mechanism
> deep-dive (SIL passes, the compilation pipeline, LLVM optimizations, ABI
> tradeoffs) lives in the companion **[GUIDE.md](GUIDE.md)**.

Swift has no single "tree shaking" switch. Size comes off through a *stack* of
compiler, linker, and architectural levers — and the biggest wins are
architectural, not flag-level. This is the playbook for **which lever to pull, in
what order, and how to prove it worked.**

## The one idea (Swift)

> Code that the linker can *prove* is unreachable gets removed. Every lever below
> exists to either (a) make more code provably unreachable, or (b) stop forcing the
> compiler to preserve code it would otherwise drop.

Reach for architecture and visibility first (they unlock the most), flags second,
micro-attributes last.

## Lever order (highest leverage first)

1. **Module granularity.** Small, focused, statically-linked packages let unused
   capabilities never get linked at all. One giant `KhaosKit` defeats every
   downstream optimization. Split by capability so a CLI can import `KhaosCore` +
   `KhaosWorkflow` and omit `KhaosVision` entirely. → GUIDE: *Swift Packages*,
   *Package Design*, *Khaos Machine Recommendations*.
2. **Static over dynamic linking.** Static libraries dead-strip per-symbol; dynamic
   frameworks load whole and keep unused APIs. Prefer static packages unless you
   need runtime pluggability or share a framework across processes. → GUIDE:
   *Static Libraries*, *Dynamic Frameworks*.
3. **Visibility discipline.** `internal` by default; `public`/`open` only at real
   module boundaries. Every public symbol is a contract the compiler must preserve,
   blocking dead-code elimination and specialization. → GUIDE: *API Visibility*.
4. **`final` by default.** `final class` (or `struct`) enables devirtualization,
   inlining, and stronger DCE. Reserve open inheritance for where it's required.
   → GUIDE: *Final Classes*.
5. **Release flags: WMO + dead-strip + the right `-O`.** Cross-file inlining and
   link-time stripping. See the build-settings block below. → GUIDE: *WMO*,
   *Link-Time Dead Stripping*, *Optimization Levels*.
6. **Conditional compilation / feature flags.** Compile whole subsystems out of
   builds that don't need them (`#if ENABLE_SPEECH`, `#if DEBUG`). The surest
   removal there is — the code never reaches the linker. → GUIDE: *Conditional
   Compilation*.
7. **Library Evolution OFF** unless shipping a binary/ABI-stable SDK. It forces ABI
   preservation and disables many optimizations. → GUIDE: *Library Evolution*.
8. **Micro-attributes last.** `@inlinable`, `@inline(__always)`, generic
   specialization tuning — real but small, and `@inlinable` *grows* binaries while
   speeding call sites. Use selectively, never as the opening move. → GUIDE:
   *Inlining*, *@inlinable*, *Generic Specialization*.

## Workflow — the router loop, instantiated for Swift

Follow the universal measure→diagnose→fix→verify loop from the router, with these
Swift commands:

1. **Baseline.** `swift build -c release` then `size .build/release/<product>`, or
   for an app inspect the linked binary. Keep the number.
2. **Diagnose where the bytes are.** Generate a link map (`Write Link Map File =
   YES`, or `-Xlinker -map -Xlinker out.map`) and read which objects/symbols
   dominate. `nm`, `otool`, `llvm-size`, `swift-demangle` to attribute symbols.
   → GUIDE: *Measuring Binary Size*.
3. **Pick the lever** that matches the dominant cost (a fat dynamic framework → go
   static; a monolith pulling everything → split the package; a public API surface
   blocking strip → tighten visibility).
4. **Apply one change** — one lever at a time so the delta is attributable.
5. **Re-measure** with the same `size` command; state the delta in bytes/%, not
   "should be smaller."
6. **Repeat** down the lever list until win-per-effort drops off.

## Release build settings (the reliable baseline)

```
Optimization Level (SWIFT_OPTIMIZATION_LEVEL)   -O   (or -Osize for tools/daemons)
Whole Module Optimization                        YES
Dead Code Stripping (DEAD_CODE_STRIPPING)        YES   # or OTHER_LDFLAGS = -dead_strip
Strip Linked Product                             YES
Strip Debug Symbols During Copy                  YES
Library Evolution (BUILD_LIBRARY_FOR_DISTRIBUTION) NO  # unless shipping a binary SDK
Build Active Architecture Only (release)         NO
```

Choose `-Osize` over `-O` for CLIs, helper daemons, watchOS, and embedded utilities
where size beats peak throughput; keep `-O` for performance-critical apps. → GUIDE:
*Optimization Levels*, *Recommended Build Settings*.

## Anti-patterns to catch (the usual size leaks)

- **Giant monolithic module** (`KhaosEverything`) — splits unlock omission; merge
  defeats it.
- **Reflexive `public`** — implementation details exposed past their module pin the
  optimizer's hands. Demote to `internal`.
- **Dynamic framework overuse** — slower launch *and* worse dead-stripping; justify
  every dynamic boundary.
- **Reflection everywhere** — heavy runtime reflection blinds the compiler; prefer
  static typing.
- **Global singletons** — drag unrelated code graphs into the live set; prefer
  dependency injection.
→ GUIDE: *Common Mistakes*.

## Designing a tree-shakeable framework

When building (not just trimming), bias toward: small focused packages · static
linking · internal-by-default implementations · minimal public API · feature flags ·
lazy initialization · explicit dependencies · limited reflection · pure functions ·
clear ownership boundaries. → GUIDE: *Designing Tree-Shakeable Frameworks*, and the
Khaos package-graph example in *Khaos Machine Recommendations* (each app depends only
on the capabilities it needs).

## Pre-ship checklist

- [ ] Baseline and post-change sizes recorded; deltas stated in real numbers.
- [ ] Release flags set: `-O`/`-Osize`, WMO YES, dead-strip YES, strip YES, Library
      Evolution NO (unless an ABI-stable SDK).
- [ ] No monolithic catch-all module; capabilities are separately importable.
- [ ] Static linking preferred; every dynamic framework boundary is justified.
- [ ] `public`/`open` only at real module seams; rest is `internal`/`private`.
- [ ] Classes are `final` unless subclassing is required.
- [ ] Optional subsystems gated behind `#if` flags and verified absent from the
      stripped binary (check the link map).
- [ ] Win confirmed against the recorded baseline, not assumed.
