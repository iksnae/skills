# familiar (prototype spine)

A lean, front-end-first **ambient-pet** prototype — and a deliberate scale-model of the
[ambisphere runtime](https://github.com/ambisphere/runtime) pipeline. It is the working
evidence for [ambisphere/runtime#10](https://github.com/ambisphere/runtime/issues/10).

```
emit (fact)  ->  ~/.familiar/events.ndjson   the log is the source of truth
  reduce     ->  ~/.familiar/state.json       a pure fold; derived + replayable
  render     ->  watch / statusline           renderer-agnostic; reads state only
```

A "pet" is just **one persona projection** of an ambient entity. The point is the pipeline.

## Try it (zero setup, zero deps)

```bash
node tools/familiar/familiar.mjs watch        # pane 1 — Pip animates for the current state
node tools/familiar/familiar.mjs demo         # pane 2 — emits a scripted session
```

Or drive it by hand:

```bash
node tools/familiar/familiar.mjs emit tool.start
node tools/familiar/familiar.mjs emit await.input   # Pip asks; attention -> interrupt
node tools/familiar/familiar.mjs state              # inspect the resolved state
```

## Wire it into Claude Code (dogfood)

```bash
node tools/familiar/familiar.mjs install claude-code            # dry run — prints the snippet
node tools/familiar/familiar.mjs install claude-code --write    # merges into ~/.claude/settings.json (backup kept)
```

Maps host hooks → canonical events: `SessionStart→session.start`, `UserPromptSubmit→prompt.submit`,
`PreToolUse→tool.start`, `PostToolUse→tool.end`, `Notification→await.input`, `Stop→turn.stop`,
`SessionEnd→session.end`. Restart Claude Code afterward. Emitters run async and always exit 0, so a
`PreToolUse` hook can never block a tool.

## Design notes (why it's shaped this way)

These mirror ambisphere's recorded **rejections**, so prototype findings transfer without rework:

- **Semantic states are the contract**, not frames. `idle · thinking · working · awaiting-human ·
  reviewing · succeeded · failed · errored · rate-limited · milestone · sleeping`. Presentational
  notions like `running-left`/`jumping` are renderer animations, never the API.
- **Manifest ≠ renderer bundle.** `pet.json` describes the entity + named states. ASCII art lives in
  a separate, swappable `ascii.json`; a sprite atlas would attach the same way. No `spritesheetPath`
  baked into the manifest.
- **Vendor-neutral home** (`~/.familiar`), never `~/.codex`.
- **Pure reducer.** The fold has no clock; transient "flash" states (a brief `succeeded`/`failed`
  overlay) carry an `until` value that the *renderer* compares against now — the fold stays
  deterministic and replayable.
- **Attention routing** is a first-class, minimal concern: each resolved state maps to
  `none | glance | interrupt`.

## Status

Spine only: `emit · reduce · state · watch · statusline · install claude-code` + one default ASCII
pet. Next: graphical renderer (kitty/iTerm2/sixel → ASCII ladder), `pet-hatch` authoring, the other
8 harness adapters, and a Codex-export adapter. See ambisphere/runtime#10 for the findings track.
