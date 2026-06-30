# familiar

> A universal, cross-harness ambient desktop pet — your coding agent gets a familiar that thinks while it reasons, works while it runs tools, celebrates a passing build, and looks up when it needs you.

![familiar — a small fox-like familiar perched on a programmer's desk at night, watching over glowing code by warm lamplight](assets/familiar-hero.png)

## What it does

`familiar` gives an AI coding agent a *familiar*: a small creature that reacts, in real time, to what the agent is doing. It is a deliberate front-end prototype for the [ambisphere runtime](https://github.com/ambisphere/runtime) (`ambisphere/runtime#10`), modelling the same pipeline at small scale:

```
emit (a fact)  →  ~/.familiar/events.ndjson   append-only log, the source of truth
reduce         →  ~/.familiar/state.json      a pure fold; derived + replayable
render         →  overlay · watch · statusline renderer-agnostic; reads state only
```

The contract between agents and pets is a **semantic state vocabulary**, never presentational frames: `idle · thinking · working · reviewing · awaiting-human · succeeded · failed · errored · rate-limited · milestone · sleeping`. An agent says `working`; a renderer decides what that looks like. Orthogonal channels ride alongside — a transient speech **message** (the agent's running commentary), a **tool** badge (which tool is active), and **flash** outcomes — each decaying at *render* time so the fold stays pure and replayable.

## When to use it

- You want a desktop pet or companion that reacts to your agent during long runs.
- You want an ambient, glanceable status presence outside the terminal.
- You're installing, running, or wiring familiar, or adding a new harness adapter.

When NOT to use it: when a one-line status is all you need (point your harness's statusline at `familiar statusline` and skip the rest), or on a headless box with no terminal to watch — the pet wants somewhere to be seen.

## Install

familiar ships from this repo, not the npm registry. Clone it and run the CLI:

```
git clone https://github.com/iksnae/skills && cd skills

node tools/familiar/familiar.mjs overlay        # macOS — floating desktop pet
node tools/familiar/familiar.mjs watch          # anywhere — terminal pet
```

Prefer a short `familiar` command? Install it globally from the local path — no registry, no login: `npm install -g ./tools/familiar`. (The operator guide also lives as a skill — `skills/familiar/SKILL.md` — installable the usual way: `npx @iksnae/skills add familiar`.)

## How it runs

1. **emit** — a host hook, a git hook, or any tool appends a semantic *fact* to the append-only log (`familiar emit working`, or an installed adapter does it for you).
2. **reduce** — a pure fold over the log derives the current state: a sticky base, transient flash/message/tool channels (each carrying an `until`), and attention level. No wall-clock in the fold.
3. **render** — a renderer *subscribes* to state and draws it. The macOS overlay plays a sprite animation, floats a speech bubble, and shows a tool badge; `watch` does the same in ASCII; `statusline` collapses it to one line. Time-based decay resolves at render time.

Wire it to an agent so it reacts to real work, then restart the host:

```
familiar install claude-code --write   # lifecycle hooks → events + speech
familiar install git --write           # commits/pushes → milestones (any tool)
```

Both back up and append — they never clobber existing config.

## Renderer tiers

| Tier | Command | Platform | What |
|---|---|---|---|
| desktop overlay | `familiar overlay` | macOS | floating always-on-top pet (AppKit), drag/poke, speech, tool badge, preferences |
| terminal pet | `familiar watch` | any | animated ASCII pet — the cross-platform path |
| one-line | `familiar statusline` | any host | a single-line pet for a status bar |

Only the overlay is macOS-bound; everywhere else the terminal renderer is the parallel solution, no separate build.

## Pets

A pet is a swappable bundle of renderer assets (a sprite sheet + `anim.json`) plus a manifest — separate from the state contract. `familiar pets` lists them; `familiar hatch --name N --prompt "…"` generates a new one through the [pet-hatch](https://github.com/iksnae/skills/tree/main/skills/pet-hatch) + [image-generate](image-generate.md) pipeline; `familiar import-codex --path …` imports a local Codex atlas. The always-works default pet ships in the box; sprite pets are generated per-user.

**The online library.** [codex-pets.net](https://codex-pets.net) (source: [`portons/codex-pet-share`](https://github.com/portons/codex-pet-share)) is a community gallery of thousands of Codex pets. Its API serves each pet as the very atlas bundle the importer already slices, so it is just a remote source — never a new contract. `familiar browse --search fox --kind animal --sort popular` discovers; `familiar import-codex --id clawd` fetches and imports one (or `--top 10` to bulk-import). Imports preserve creator attribution, and `--host`/`FAMILIAR_LIBRARY`/`config.libraryUrl` point at any self-hosted fork. The overlay adds a **Library** Preferences tab: search the gallery and import with one click.

See [`tools/familiar/README.md`](https://github.com/iksnae/skills/tree/main/tools/familiar) for the full reference.
