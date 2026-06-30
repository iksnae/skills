---
name: pet-hatch
description: >
  Turn per-state character keyframes into looping sprite animations for an
  ambient pet. Given one "target" still per semantic state (idle, working,
  awaiting-human, ...), generate K in-between frames by conditioning
  image-to-image generation on each state's keyframe, then emit an anim.json
  (ordered frames + per-state duration + loop mode) a renderer plays as loops.
  Grounded in OpenAI's hatch-pet but uses semantic states and exposes the
  animation timing Codex hardcodes.
---

# pet-hatch

Author looping animations for a character pet from per-state **keyframes**.

The keyframe for each semantic state is the *target pose*; hatch generates the
in-between frames around it, so every state becomes a small loop instead of a
static still. Identity stays locked because each in-between is generated
**image-to-image against that state's own keyframe** (the reference).

## Pipeline

```
<state>.png  (keyframe = the target/reference for the state)
     │  generate_image.py --reference <state>.png --prompt "<in-between motion>"
     ▼
<state>.m0.png, <state>.m1.png  (in-between frames; identity + bg preserved)
     ▼
anim.json   { states: { <state>: { frames:[...], frameMs, mode } } }   ← semantic truth
     │  pack.py  (downscale + grid-pack every referenced frame)
     ▼
sheet.png + sheet.json  (one decode; name → {x,y,w,h})   ← derived renderer bundle
     ▼
renderer plays the loop (e.g. tools/familiar/overlay) — crops the sheet if
present, else loads the discrete PNGs; anim.json stays the source of truth
```

## Grounding and divergence

Adapted from OpenAI's [`hatch-pet`](https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet):

- **Adopt** — a reference image anchors identity across generated frames; a
  deterministic pipeline (generate → assemble → manifest); flat chroma
  background keyed transparent by the renderer.
- **Diverge** — **semantic** states, not Codex's 9 presentational rows
  (`running-left` is a renderer concern); each state anchored by its **own**
  keyframe (not one global base), locking pose as well as identity; and an
  **anim.json that carries frame counts, per-state `frameMs`, and loop mode** —
  the timing Codex hardcodes in its app and [codex#20863](https://github.com/openai/codex/issues/20863)
  asks to expose.

## Prerequisites

- `OPENAI_API_KEY` in the environment (used by the bundled image tool).
- A `--reference`-capable `generate_image.py` (the `image-generate` skill).
- A frames dir already holding one `<state>.png` keyframe per state.

## Usage

```bash
python3 skills/pet-hatch/scripts/hatch.py \
  --frames-dir tools/familiar/pets/fox/frames_green \
  --workers 2

# subset, or just rewrite the manifest without generating:
python3 skills/pet-hatch/scripts/hatch.py --frames-dir <dir> --states working,milestone
python3 skills/pet-hatch/scripts/hatch.py --frames-dir <dir> --anim-only

# pack the discrete frames into a sprite sheet + atlas (re-run after hatching):
python3 skills/pet-hatch/scripts/pack.py --frames-dir <dir>             # 512px, registered
python3 skills/pet-hatch/scripts/pack.py --frames-dir <dir> --no-register
```

Per-state frame counts and motions live in `STATES` in `scripts/hatch.py`
(calm states get a 2-frame hold-then-blink loop; active states get a 3-frame
ping-pong). Idempotent and resumable: existing `<state>.m*.png` frames are
skipped unless `--force`, so an interrupted run resumes cleanly.

## Output

- `<state>.m{0,1}.png` in-between frames (flat green; renderer keys transparent).
- `anim.json` merged in place (preserves states it didn't regenerate).
- `sheet.png` + `sheet.json` (after `pack.py`): a packed atlas the renderer
  crops by frame name. **`anim.json` stays the source of truth** — the sheet is
  a *derived*, swappable bundle (a single decode, portable / Codex-exportable).

## Notes

- `images.edit` is slower than text generation (~1–2 min/frame). Run larger
  hatches in the background; the threadpool (`--workers`) overlaps calls.
- Re-run `pack.py` after any `hatch.py` change so the sheet matches the frames.
  By default it **center-registers** each frame (aligns content bbox centers)
  to kill the position drift that makes image-to-image frames jitter when
  cycled — `--no-register` keeps raw positions. Tiles default to 512px so the
  pet stays crisp on retina; the discrete PNGs remain the authoring source and
  the renderer's fallback, so a missing/stale sheet degrades gracefully.
