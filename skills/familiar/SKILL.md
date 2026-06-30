---
name: familiar
description: >
  Set up and run familiar — a universal, cross-harness ambient desktop pet that
  reacts to an AI coding agent's activity (thinking, working, awaiting input,
  succeeding, failing, reaching milestones). Use when the user wants a desktop
  companion or "pet" for their agent, an ambient at-a-glance status indicator
  outside the terminal, or asks to install, run, wire, or build the familiar
  overlay/watch renderer or add a harness adapter. Ships a native macOS desktop
  overlay plus a cross-platform terminal renderer.
---

# familiar — an ambient pet for your agent

familiar gives a coding agent a *familiar*: a small creature that reacts to what
the agent is doing — it thinks while reasoning, works while running tools,
celebrates a passing build, and looks up when it needs you. It is a deliberate
front-end for the [ambisphere runtime](https://github.com/ambisphere/runtime)
(`ambisphere/runtime#10`): a semantic event log → a pure reducer → renderer-
agnostic pets.

The implementation lives in `tools/familiar/` — see its README for the full
reference. This skill is the operator's guide: how to run it, wire it to a
harness, and reason about its model so changes stay faithful.

## When to use

- The user wants a desktop pet / companion / mascot that reacts to their agent.
- They want an ambient status indicator (glance, not read) during long runs.
- They ask to install, run, wire, or build familiar, or to add a harness adapter.

## Run it

macOS desktop overlay (builds once on first run, ~1 min, needs Xcode CLT):

```sh
npx @iksnae/familiar overlay        # or: node tools/familiar/familiar.mjs overlay
```

Anywhere Node runs — the terminal pet (the cross-platform path):

```sh
npx @iksnae/familiar watch
```

## Wire it to the agent

So the pet reacts to real work, install a harness adapter, then restart the host:

```sh
familiar install claude-code --write   # lifecycle hooks → events + speech
familiar install git --write           # commits/pushes → milestones (any tool)
```

Both back up / append — they never clobber existing config. Anything can drive
the pet directly: `familiar emit working`, `familiar emit message "…"`.

## The model (what to preserve when changing it)

- **Semantic state is the contract**, not frames: `idle · thinking · working ·
  reviewing · awaiting-human · succeeded · failed · errored · rate-limited ·
  milestone · sleeping`. How a state *looks* is the renderer's choice.
- **Pure reducer**: the fold has no clock. Transient channels — flash, message
  (speech), tool (badge) — carry an `until` the *renderer* compares against now.
- **Renderers subscribe**; they never drive the runtime. Add a renderer or a
  harness adapter without touching the core.
- **Vendor-neutral home**: `~/.familiar` (log, state, config, build cache).

## Renderer tiers

| Tier | Command | Platform |
|------|---------|----------|
| desktop overlay | `familiar overlay` | macOS (AppKit) |
| terminal pet | `familiar watch` | any |
| one-line | `familiar statusline` | any host status bar |

## Pets

Pet bundles are swappable renderer assets (a sprite sheet + `anim.json`) plus a
manifest. `familiar pets` lists them; `familiar hatch --name N --prompt "…"`
generates a new one; `familiar import-codex --path …` imports a Codex atlas.
Pet authoring shells out to the `pet-hatch` + `image-generate` skills and an
image API key — available from a clone of this repo, not the lean npm package,
which ships only the always-works default pet.
