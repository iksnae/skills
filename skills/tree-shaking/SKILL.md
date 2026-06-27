---
name: tree-shaking
description: >
  Strategy and technique for shrinking compiled binaries and JS/TS bundles /
  reducing app size — dead-code elimination, link-time dead stripping or bundler
  tree-shaking, modular package design, visibility/feature gating, dependency
  hygiene, and the right release flags. Use when an operator asks to reduce binary,
  bundle, or app size, strip unused code, "tree shake" a target, audit why a build
  is large, choose static vs dynamic linking, code-split or lazy-load, gate optional
  subsystems, trim dependencies, or set release optimization flags. This is an
  APPLICATION skill — it decides which lever to pull and proves the win with real
  before/after numbers. The cross-language playbook lives here; pick the matching
  language SPECIALTY (Swift, Go, JavaScript/TypeScript today; extensible) for the
  concrete lever order, flags, and diagnostics, with a mechanism deep-dive in each
  specialty's GUIDE.md. Do NOT use it for runtime-speed-only tuning unrelated to size.
side: shadow
---

# tree-shaking

Most languages don't ship a single "tree shaking" switch. Size comes off through a
*stack* of compiler, linker, and **architectural** levers — and the biggest wins are
architectural, not flag-level. This skill is the playbook for **which lever to pull,
in what order, and how to prove it worked.**

This file is the language-agnostic strategy. The concrete lever order, build flags,
and diagnostic commands live in a per-language **specialty**; the underlying "why"
(compiler passes, linker reachability, ABI tradeoffs) lives in each specialty's
`GUIDE.md`.

## The one idea

> The toolchain keeps only the code it can reach (or is forced to preserve), and
> drops the rest. Every lever below either (a) shrinks the reachable / provably-used
> set, or (b) stops forcing the toolchain to keep code it would otherwise remove.

Reach for **architecture and gating first** (they unlock the most), **dependency and
visibility hygiene second**, **release flags and micro-attributes last**. The
toolchain's automatic passes (DCE, inlining, escape/ownership analysis) are free —
you don't pull them, you just avoid blocking them.

## Universal lever taxonomy

The specialties order these for their toolchain, but the categories are the same
everywhere — highest leverage first:

1. **Module / package granularity.** Small, focused, separately-importable units let
   unused capabilities never get linked at all. One catch-all module defeats every
   downstream optimization.
2. **Feature gating.** Compile whole subsystems out of builds that don't need them
   (build tags, `#if` flags, conditional files). The surest removal there is — the
   code never reaches the linker.
3. **Reachability hygiene.** Kill global registries, heavy init/static setup, and
   reflexive blank/barrel imports that drag unrelated graphs into the live set. Push
   the "what's included" choice to the caller / composition root.
4. **Visibility & dependency discipline.** Keep symbols private/internal by default;
   every exported symbol is a contract the optimizer must preserve. Justify and trim
   every heavy dependency.
5. **Limit reflection; narrow interfaces.** Dynamic lookups force the toolchain to
   retain metadata and defeat DCE. Prefer static typing and explicit wiring.
6. **Release flags last.** Strip symbols/debug info, enable cross-module optimization
   and dead-strip. Real and reliable — but the finishing pass, not the strategy.

## Workflow — measure, diagnose, fix, verify

Never optimize blind. Size work is a loop, identical across languages (the specialty
supplies the concrete commands for each step):

1. **Baseline.** Build a release artifact and record its size *before* touching
   anything. Keep the number.
2. **Diagnose where the bytes are.** Attribute the size — largest symbols, what
   pulled a dependency in, what's embedded, what's unreachable.
3. **Pick the lever** that matches the dominant cost (a fat dep → gate or drop it; a
   monolith pulling everything → split it; an init-time registry → make it explicit).
4. **Apply one change** — one lever at a time so the delta is attributable.
5. **Re-measure** with the same command; state the delta in **bytes/%**, not "should
   be smaller."
6. **Repeat** down the lever list until win-per-effort drops off.

Report results with real before/after numbers from step 5 — never claim a size win
you didn't measure.

## Specialties

Pick the language being built, read its `STRATEGY.md` for the lever order, flags, and
diagnostics, and open the co-located `GUIDE.md` when you need the mechanism.

| Language | When to use | Strategy | Mechanism |
|---|---|---|---|
| **Swift** | iOS/macOS apps, SwiftPM targets, CLIs, frameworks; static-vs-dynamic linking, WMO, `final`/visibility, Library Evolution. | [specialties/swift/STRATEGY.md](specialties/swift/STRATEGY.md) | [GUIDE.md](specialties/swift/GUIDE.md) |
| **Go** | Go binaries and daemons; build tags, dependency hygiene, `init`/registry roots, CGO, `-ldflags="-s -w"`. | [specialties/go/STRATEGY.md](specialties/go/STRATEGY.md) | [GUIDE.md](specialties/go/GUIDE.md) |
| **JavaScript / TypeScript** | Browser bundles, Node services, Lambda, libraries; ESM, bundler tree-shaking (Vite/Rollup/esbuild/tsup), `sideEffects`, code splitting, `exports` design. | [specialties/js/STRATEGY.md](specialties/js/STRATEGY.md) | [GUIDE.md](specialties/js/GUIDE.md) |

If the operator's language has **no specialty yet**, apply the universal taxonomy and
workflow above using that toolchain's equivalents (DCE/dead-strip, modular packaging,
feature gates, symbol stripping) — and consider adding a specialty (below).

## Adding a specialty (expansion contract)

The structure is built to grow. To add a language `<lang>`:

1. Create `specialties/<lang>/STRATEGY.md` — the application layer. Mirror the
   existing specialties: a one-line *one idea* specialized to the toolchain, a
   **lever order** (highest leverage first) mapping the universal taxonomy onto that
   language's real knobs, the **workflow** instantiated with concrete commands,
   **release flags/commands**, **anti-patterns**, a **designing tree-shakeable**
   section, and a **pre-ship checklist**.
2. Create `specialties/<lang>/GUIDE.md` — the mechanism reference (compilation
   pipeline, DCE/linker behavior, the levers explained, measuring size, examples).
   `STRATEGY.md` decides *which lever*; `GUIDE.md` explains *why it works*.
3. Add a row to the **Specialties** table above (language · when to use · strategy ·
   mechanism).
4. Keep the new files free of YAML frontmatter and **do not** name them `SKILL.md` —
   only this router registers as a skill, so specialties stay reference docs and the
   skill stays singular.

## Anti-patterns to catch (cross-language)

- **Giant catch-all module** — splits unlock omission; merge defeats it.
- **Global registries / heavy init / singletons** — pull unrelated code into the live
  set; prefer caller-driven registration and dependency injection.
- **Reflection everywhere** — blinds the toolchain and retains metadata; prefer
  static typing and explicit wiring.
- **Unused / fat dependencies** — justify every heavy dep; drop or gate the rest.
- **Blind asset embedding** — bakes megabytes in; externalize large media/models.
- **Claiming a win you didn't measure** — always cite the recorded baseline delta.

See the specialty's `STRATEGY.md` for the language-specific form of each, and its
`GUIDE.md` for the mechanism.
