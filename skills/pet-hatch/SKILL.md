---
name: pet-hatch
description: >
  Generate looping sprite animations for an ambient pet, one per semantic state
  (idle, working, awaiting-human, ...). The primary path generates each state as
  a single coherent horizontal strip (all its frames in one image, anchored to a
  layout guide) so the body stays planted and only the intended part moves, then
  slices the strip into frames and emits an anim.json (ordered frames + per-state
  duration + loop mode) a renderer plays as loops. Grounded in OpenAI's hatch-pet
  but keeps a semantic state vocabulary and a green-screen bundle.
---

# pet-hatch

Author looping animations for a character pet, one loop per **semantic state**.

## Why strips, and following Codex faithfully

The naive approach — generate each frame independently with image-to-image —
**drifts**: the model redraws the character at a slightly different position and
size every call, so cycling the frames jitters.

The fix, from Codex's hatch-pet, is to draw all of a state's frames **together
in one horizontal strip**, conditioned on a *layout guide* image that fixes the
frame count, slot spacing, and centering. One coherent image keeps the body
planted; only the intended part moves.

For extraction we follow **Codex's proven pipeline verbatim** (its
`extract_strip_frames.py`): chroma-key the strip to transparent, group each
frame's sprite by **connected components** (the N largest blobs as seeds,
ordered left-to-right, with stray bits attached to the nearest seed — so the
attached tail is never clipped and neighbor-bleed slivers are dropped), then
`fit_to_cell` each group: crop to its alpha bbox, scale to fit, **bbox-center**
in a transparent cell. We use Codex's cell aspect (192×208) at 2× for retina.
This is the base; we don't add our own alignment tricks on top of it until we
have a reason grounded in this working baseline.

## Pipeline (primary: `strip.py`)

```
<state>.png  (pose keyframe — identity + style + pose anchor)
     │  build a layout guide (N equal slots, safe area, center crosshairs)
     │  generate_image.py --reference <state>.png --reference <guide> --size 1536x1024
     ▼
<state>.strip.png  (all N frames in one coherent image; body planted)
     │  slice (Codex): chroma→transparent, connected-component groups, fit_to_cell
     ▼
<state>.f0..f{N-1}.png  (transparent cells, bbox-centered)
     ▼
anim.json   { states: { <state>: { frames:[...], frameMs, mode:"loop" } } }   ← semantic truth
     │  pack.py  (grid-pack every referenced frame, transparent sheet)
     ▼
sheet.png + sheet.json  (one decode; name → {x,y,w,h})   ← derived renderer bundle
     ▼
renderer plays the loop (e.g. tools/familiar/overlay) — crops the sheet if
present, else loads the discrete PNGs; anim.json stays the source of truth
```

## Prerequisites

- `OPENAI_API_KEY` in the environment (used by the bundled image tool).
- A multi-`--reference`-capable `generate_image.py` (the `image-generate` skill).
- A frames dir holding one `<state>.png` pose keyframe per state.
- Pillow + numpy (slicing + packing).

## Usage

```bash
# generate every state as a strip, slice, write frames + anim.json:
python3 skills/pet-hatch/scripts/strip.py \
  --frames-dir tools/familiar/pets/fox/frames_green --workers 3

# one state, or force-regenerate (re-calls the image model):
python3 skills/pet-hatch/scripts/strip.py --frames-dir <dir> --states working --force

# re-cut frames from the SAVED strips with no image generation (free) —
# use this to iterate on slicing/cropping:
python3 skills/pet-hatch/scripts/strip.py --frames-dir <dir> --reslice

# pack the frames into a sprite sheet + atlas (re-run after any frame change):
python3 skills/pet-hatch/scripts/pack.py --frames-dir <dir> --no-register
```

Per-state frame counts, timing, and the planted-motion requirements live in
`STATES` in `scripts/strip.py`. The raw `<state>.strip.png` is persisted so
slicing can be re-run for free (`--reslice`); only `--force` re-calls the model.

`pack.py --no-register` is correct here because `strip.py` already aligns the
frames; let `pack.py` register only for legacy per-frame bundles.

## Legacy: `hatch.py`

`scripts/hatch.py` is the original per-frame image-to-image approach (generate
K in-betweens around each keyframe). It's kept for reference but **drifts/slides**
as described above; prefer `strip.py`.

## Grounding and divergence

Adapted from OpenAI's [`hatch-pet`](https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet):

- **Adopt** — strip generation with a layout guide (registration by
  construction); a reference image anchors identity; deterministic
  slice → assemble → manifest; flat chroma background keyed by the renderer.
- **Diverge** — **semantic** states, not Codex's 9 presentational rows
  (`running-left` is a renderer concern); a **shared-window** slice instead of
  per-frame recentering (no sliding at our cell size); and an **anim.json that
  carries frame counts, per-state `frameMs`, and loop mode** — the timing Codex
  hardcodes and [codex#20863](https://github.com/openai/codex/issues/20863) asks
  to expose.

## Notes

- `images.edit` is slow (~1–2 min/strip). Run larger hatches in the background;
  the threadpool (`--workers`) overlaps calls.
- The sheet + atlas are a *derived, swappable* bundle; **`anim.json` stays the
  source of truth**. Re-run `pack.py` after any frame change. Tiles default to
  512px so the pet stays crisp on retina; the discrete PNGs remain the renderer
  fallback, so a missing/stale sheet degrades gracefully.
