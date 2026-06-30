# familiar

A universal, cross-harness **ambient desktop pet** for AI coding agents. Your
agent gets a familiar — a small creature that reacts to what it's doing: it
thinks while it reasons, works while it runs tools, celebrates a passing build,
and looks up at you when it needs a hand.

familiar is a deliberate **front-end prototype for the [ambisphere runtime](https://github.com/ambisphere/runtime)**
(spike: `ambisphere/runtime#10`). It models the same pipeline at small scale:

```
  emit (a fact)  →  ~/.familiar/events.ndjson   the append-only log is the source of truth
  reduce         →  ~/.familiar/state.json      a pure fold; derived + replayable
  render         →  overlay · watch · statusline renderer-agnostic; reads state only
```

The contract between agents and pets is a **semantic state vocabulary**, never
presentational frames. An agent says `working`; a renderer decides what that
looks like.

## Quick start

familiar ships from this repo (not the npm registry). Clone it and run the CLI:

```sh
git clone https://github.com/iksnae/skills && cd skills

# macOS — the floating desktop pet (builds once on first run, ~1 min)
node tools/familiar/familiar.mjs overlay

# anywhere Node runs — the terminal pet
node tools/familiar/familiar.mjs watch

# wire it to your agent so it reacts to real work, then restart the agent
node tools/familiar/familiar.mjs install claude-code --write
```

Prefer a short `familiar` command? Install it globally from the local path —
no registry, no login:

```sh
npm install -g ./tools/familiar    # then: familiar overlay
```

## Renderer tiers

One core, many surfaces — pick by platform and need:

| Tier | Command | Where | What |
|------|---------|-------|------|
| 1 | `familiar overlay` | **macOS** | floating always-on-top desktop pet (AppKit) |
| 2 | `familiar watch` | any OS | animated ASCII pet in the terminal |
| 3 | `familiar statusline` | any host | a one-line pet for a status bar |

The Node core and Tiers 2–3 run anywhere. Only the overlay is macOS-bound; on
other platforms `familiar overlay` points you to `familiar watch`. **That's the
cross-platform story — the terminal renderer is the parallel solution, no
separate build.**

## Wiring a harness

familiar reacts to whatever emits events. Two adapters ship today:

```sh
familiar install claude-code --write   # SessionStart/PreToolUse/Stop/… → events + speech
familiar install git --write           # post-commit/pre-push → milestones (works with any tool)
```

Both are reversible and non-destructive (they back up / append, never clobber).
Anything can drive the pet directly, too:

```sh
familiar emit working
familiar emit message "Refactoring the reducer…"
```

## The semantic vocabulary

The API is these states, not animations:

`idle` · `thinking` · `working` · `reviewing` · `awaiting-human` · `succeeded` ·
`failed` · `errored` · `rate-limited` · `milestone` · `sleeping`

Plus orthogonal channels a renderer may surface: a transient **message**
(speech bubble), a **tool** indicator (which tool is active), and **flash**
outcomes that decay on their own. Two interaction states — `held`, `poked` —
are renderer-local (you grab or poke the pet), never part of the agent API.

## Pets

A pet bundle is renderer assets (a sprite sheet + `anim.json`) plus a manifest
(`pet.json`) — swappable, separate from the state contract.

```sh
familiar pets                                          # list bundles
familiar hatch --name vix --prompt "a teal axolotl"    # generate a new pet *
familiar import-codex --path ~/.codex/pets/fox         # import a Codex atlas *
```

\* Pet authoring shells out to the `pet-hatch` + `image-generate` skills and an
image API key — both present in this repo. The runtime (overlay/watch/install/
emit) is standalone, and the default pet always works without them.

Overlay settings: a **Preferences** window (⌘,) manages the active pet, size,
animation calm, and lets you create or import pets with live progress.

## Requirements

- **Node ≥ 18** (the CLI is zero-dependency).
- **macOS overlay**: the Xcode Command Line Tools (`xcode-select --install`) for
  the one-time `swift build`. The binary is cached under `~/.familiar/overlay`,
  so it builds and runs the same whether launched from the clone or a global
  install. No code signing needed — it's built locally.

## How it stays honest to ambisphere

- The contract is **semantic state**, not frames — `running-left`, a tool glyph,
  a blink are renderer choices, never the API.
- Reducers are **pure**: no wall-clock in the fold. Time-based decay (flash,
  message, tool) resolves at *render* time, so the fold stays deterministic and
  replayable.
- State lives under a vendor-neutral home (`~/.familiar`).
- Renderers **subscribe**; they never drive the runtime.

---

Part of [iksnae/skills](https://github.com/iksnae/skills). License: MIT.
