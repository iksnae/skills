# media skills demo — nightjar

*Provenance: a dogfood run of the iksnae/skills MEDIA skills —
`image-generate`, `article-audio`, `remotion-author`, and
`remotion-render` — exercised against their bundled scripts on
2026-06-11. All four scripts were run for real (OpenAI image + TTS
spend, local lint); receipts are kept beside every output.*

This note records what ran, the exact commands, where outputs landed,
the cost/receipt info, and the lint result. The fictional subject
throughout is **nightjar**, a tiny terminal pastebin, used only as
demo content.

## 1. image-generate

Skill: `skills/image-generate/SKILL.md`. Tool:
`skills/image-generate/scripts/generate_image.py`. Run from the repo
root so the style brief auto-injected from `DESIGN.md` → `## Image
voice` (`#FFCC00` on `#0a0a0a`, flat, monospace, no gradients/glow).
Both receipts confirm `"style_injected": true`. Both at quality
`medium`, size `1536x1024`, model `gpt-image-2` (the script default).

### a. repo hero

```bash
python3 skills/image-generate/scripts/generate_image.py \
  --prompt "Repo hero image: an abstract terminal composition for a developer skills library. A grid of small dark skill tiles arranged like a terminal dashboard, flat surfaces with hairline borders, monospace feel, near-black background. Exactly one tile is accented in the signal yellow; all others are dark and quiet. A 3:2 landscape. No characters, no scenes, flat color only." \
  --out docs/assets/hero-iksnae-skills.png \
  --size 1536x1024 --quality medium
```

Output: `docs/assets/hero-iksnae-skills.png` (1.37 MB).
Receipt: `docs/assets/hero-iksnae-skills.json`
(`schema: image-gen-receipt-v1`, `style_injected: true`,
`cost_estimate: $0.03`). Visual check: grid of dark skill tiles with
exactly one tile (08 SYSTEM DESIGN) accented `#FFCC00` — on brief.

### b. demo hero

```bash
python3 skills/image-generate/scripts/generate_image.py \
  --prompt "Demo hero image: a tiny terminal pastebin application called nightjar shown as a dark CRT terminal window on a near-black background. A list of paste rows rendered in monospace, flat surfaces with hairline borders, quiet and terse. A single yellow accent on the wordmark 'nightjar' at the top; everything else dark and dim. A 3:2 landscape. No characters, no scenes, flat color only, no glow." \
  --out docs/assets/hero-nightjar.png \
  --size 1536x1024 --quality medium
```

Output: `docs/assets/hero-nightjar.png` (1.27 MB).
Receipt: `docs/assets/hero-nightjar.json`
(`style_injected: true`, `cost_estimate: $0.03`). Visual check: dark
pastebin window, monospace paste-row table, single `#FFCC00` accent on
the `nightjar` wordmark — on brief.

Both generations succeeded on the first attempt; no retries needed.
Combined image spend ≈ $0.06 (estimated).

## 2. article-audio

Skill: `skills/article-audio/SKILL.md`. Tool:
`skills/article-audio/scripts/generate_article_audio.py`. Wrote a
~150-word fictional launch note (plain prose, no exclamation marks) at
`docs/demos/nightjar-launch-note.md`, then generated speech with the
cheapest model the script offers (`gpt-4o-mini-tts`, ~$12/M chars) and
the default neutral `echo` voice.

```bash
python3 skills/article-audio/scripts/generate_article_audio.py \
  --md docs/demos/nightjar-launch-note.md \
  --out docs/demos/nightjar-launch-note.mp3 \
  --model gpt-4o-mini-tts --voice echo \
  --instructions "measured, slightly low cadence, technical tone, no theatrics, no exclamation"
```

Output: `docs/demos/nightjar-launch-note.mp3` (840 KB — under the
~2 MB target). Receipt:
`docs/demos/nightjar-launch-note.mp3.receipt.json`
(`schema: article-audio-receipt-v1`, 770 chars, 1 chunk,
`duration_sec: 10.0`, `estimated_cost_usd: $0.0092`). Single-chunk, so
no concatenation seam to worry about. Succeeded first attempt.

## 3. remotion-author + remotion-render

Skills: `skills/remotion-author/SKILL.md` (authoring) and
`skills/remotion-render/SKILL.md` (which bundles the linter). Authored
a minimal BEATS-style spec for a 5-second 1920x1080 nightjar title
card and a small component registry, then linted.

- Spec: `docs/demos/nightjar-title-card.spec.md` — `fps: 30`,
  `duration_frames: 150`, three scenes (entrance 60 / hold 60 /
  settle 30, summing to 150). Black `#0a0a0a` canvas, monospace
  wordmark, single `#FFCC00` accent rule, MOTION_GENTLE spring
  entrance; no shadows/gradients/rounded corners. Each scene carries a
  `const BEATS` block with frame stamps inside its scene window.
- Registry: `docs/demos/component-registry.md` — `Wordmark`,
  `AccentRule` (so `COMPONENTS_RESOLVE` passes alongside the builtin
  `AbsoluteFill`).

```bash
python3 skills/remotion-render/scripts/lint_remotion_spec.py \
  --spec docs/demos/nightjar-title-card.spec.md \
  --registry docs/demos/component-registry.md
```

Result: `lint_remotion_spec: nightjar-title-card.spec.md clean`
(exit 0). All structural invariants held — frontmatter keys present,
duration math matches (60+60+30=150), every scene has a BEATS block,
frames monotonic and within scene windows, density satisfied, all
components resolve.

Per the task, a full video render was **not** attempted — no Remotion
project scaffold (`package.json` + `src/`) exists in this repo, which
`render_remotion.py` requires. The clean lint pass is the demo receipt
for the remotion pair.

## Artifacts produced

| Path | Size |
|---|---|
| `docs/assets/hero-iksnae-skills.png` | 1.37 MB |
| `docs/assets/hero-iksnae-skills.json` (receipt) | 1.6 KB |
| `docs/assets/hero-nightjar.png` | 1.27 MB |
| `docs/assets/hero-nightjar.json` (receipt) | 1.7 KB |
| `docs/demos/nightjar-launch-note.md` | 820 B |
| `docs/demos/nightjar-launch-note.mp3` | 840 KB |
| `docs/demos/nightjar-launch-note.mp3.receipt.json` | 928 B |
| `docs/demos/nightjar-title-card.spec.md` | 2.4 KB |
| `docs/demos/component-registry.md` | 460 B |
| `docs/demos/media-skills-nightjar.md` | this file |

## Costs

- Images: 2 × ~$0.03 = ~$0.06 (estimated, gpt-image-2 medium).
- Audio: ~$0.0092 (estimated, gpt-4o-mini-tts, 770 chars).
- Remotion lint: free (local, no API).
- Total estimated spend ≈ $0.07. Reconcile against the OpenAI invoice
  for exact figures; receipt estimates are back-of-envelope.

## What failed

Nothing failed. All three image/audio generations succeeded on the
first attempt, no retries were needed, and the spec linted clean. The
only deliberate non-run is the full Remotion video render, omitted by
instruction because no project scaffold exists — the lint pass stands
in as that skill's receipt.
