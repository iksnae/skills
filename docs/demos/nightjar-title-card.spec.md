---
composition: NightjarTitleCard
fps: 30
duration_frames: 150
scenes:
  - name: entrance
    duration_frames: 60
  - name: hold
    duration_frames: 60
  - name: settle
    duration_frames: 30
---

# Clip: nightjar title card

A five-second 1920x1080 title card for nightjar. Black canvas
`#0a0a0a`, monospace wordmark `#e8e8e8`, a single `#FFCC00` accent
rule. Flat color only — no shadows, no gradients, no rounded corners.
Entrance uses the MOTION_GENTLE preset (low-stiffness spring, no
overshoot).

## Source script

`n/a` (atomic spec)

## Components used

- `Wordmark`: the `nightjar` mark in monospace, props `{ frame, opacity }`
- `AccentRule`: 2px accent rule that draws left-to-right, props `{ frame, width }`

## Scene 1 — entrance (frames 0–60)

On the black canvas the wordmark fades up from zero using the
MOTION_GENTLE spring. It reaches full opacity by frame 36. Once the
mark is settled, the accent rule begins drawing from the left edge of
the wordmark and finishes its sweep at frame 54.

Render:

  <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }} />
  <Wordmark frame={frame} opacity={spring({ frame, fps, config: { damping: 18, stiffness: 60 } })} />
  <AccentRule frame={frame} width={interpolate(frame, [42, 54], [0, 480], { extrapolateRight: 'clamp' })} />

```typescript
const BEATS = {
  CANVAS_IN: 0,
  WORDMARK_FADE_START: 6,
  WORDMARK_FADE_MID: 22,
  WORDMARK_FADE_END: 36,
  ACCENT_RULE_START: 42,
  ACCENT_RULE_END: 54,
} as const;
```

## Scene 2 — hold (frames 60–120)

The composed title holds. The wordmark stays at full opacity and the
accent rule rests at full width. A near-imperceptible settle keeps the
frame from feeling frozen — nothing moves more than a pixel.

Render:

  <Wordmark frame={frame} opacity={1} />
  <AccentRule frame={frame} width={480} />

```typescript
const BEATS = {
  HOLD_START: 60,
  HOLD_BREATH_IN: 75,
  HOLD_MID: 90,
  HOLD_BREATH_OUT: 105,
  HOLD_STEADY: 114,
  HOLD_END: 119,
} as const;
```

## Scene 3 — settle (frames 120–150)

The title rests for the final second. The accent rule holds, the
wordmark holds, and the card ends on a quiet, static frame.

Render:

  <Wordmark frame={frame} opacity={1} />
  <AccentRule frame={frame} width={480} />

```typescript
const BEATS = {
  SETTLE_START: 120,
  SETTLE_MID: 134,
  SETTLE_END: 149,
} as const;
```
