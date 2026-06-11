# DESIGN — iksnae/skills visual system

Classic **#FFCC00 on black**. Terminal-native, quiet, monospace-first. This file
is both human reference and machine input: the bundled `image-generate` script
reads the [Image voice](#image-voice) section automatically when run from this
repo.

## Palette

| Token | Hex | Use |
|---|---|---|
| bg | `#0a0a0a` | page/diagram background — warm near-black, never pure `#000000` |
| surface | `#161616` | node fills, panels, code blocks |
| text | `#e8e8e8` | primary labels |
| text-dim | `#a8a8a8` | secondary labels, captions |
| text-faint | `#727272` | edges, dividers, tertiary |
| **accent** | **`#FFCC00`** | the brand. Active nodes, emphasized paths, the mark. ≤10% of pixel area. |
| rule | `#2a2a2a` | hairline borders |
| ok | `#7ec07e` | pass states |
| warn | `#e8c040` | caution states |
| err | `#c06060` | fail states |

## Rules

- Flat fills only. **No gradients, no shadows, no glow, no rounded corners** (2px max, rarely).
- Depth comes from hairline borders (`#2a2a2a`), not elevation effects.
- Monospace labels (JetBrains Mono or any ui-monospace), terse — under ~30 chars per line.
- One or two `#FFCC00` elements per diagram, not five. The accent is a signal, not a wash.
- Quiet terminal, not synthwave. 2am energy, no bloom.

## Diagram theming (mermaid)

Sources live in `docs/assets/src/*.mmd`; render with `scripts-dev/render-diagrams.sh`.
Theme tokens are in `docs/assets/mermaid-theme.json`. Emphasize at most one path
per diagram with:

```
classDef accent stroke:#FFCC00,color:#FFCC00;
linkStyle <n> stroke:#FFCC00;
```

## Image voice

Dark CRT terminal aesthetic on near-black `#0a0a0a`. Flat color only: surfaces
`#161616`, hairline strokes `#2a2a2a`, text `#e8e8e8`, single yellow accent
`#FFCC00` used sparingly. Monospace labels, terse. Diagrams and technical
compositions only — no characters, scenes, or illustrations. No gradients, no
shadows, no glow, no rounded corners, no neon or synthwave. Quiet terminal
aesthetic.

## Voice (prose)

No exclamation marks. Banned: "AI-powered", "leverage", "seamlessly",
"next-generation", "cutting-edge", "we're excited". Section headers never named
"Introduction", "Conclusion", "TL;DR", "Key Takeaways".
