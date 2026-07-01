# DESIGN — iksnae/skills visual system

Classic **#FFCC00 on black**. Terminal-native, quiet, monospace-first. This file
is both human reference and machine input: the bundled `image-generate` script
reads the [Image voice](#image-voice) section automatically when run from this
repo.

## Guiding light

**Sell the value, not the mechanism.** Every artifact — prose, diagram, image —
leads with what the skill is *worth* to the person using it, not a walkthrough of
how it works internally. These are tools we use daily and share with others; the
brand should feel human, lived-in, and inviting, never sterile or like a vendor
architecture slide. When in doubt, show the payoff, not the pipeline.

Two registers serve this:

- **Diagrams** (mermaid) carry structure when structure *is* the value — kept
  quiet and flat per the [diagram rules](#diagram-rules).
- **Imagery** carries meaning and personality per the [image voice](#image-voice)
  — warm, characterful, honest.

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

## Diagram rules

These govern **mermaid diagrams** — the structural register. Imagery has its own
latitude (see [Image voice](#image-voice)).

- Flat fills only. **No gradients, no shadows, no glow, no rounded corners** (2px max, rarely).
- Depth comes from hairline borders (`#2a2a2a`), not elevation effects.
- Monospace labels (JetBrains Mono or any ui-monospace), terse — under ~30 chars per line.
- One or two `#FFCC00` elements per diagram, not five. The accent is a signal, not a wash.
- Quiet terminal, not synthwave. 2am energy, no bloom.
- A diagram earns its place only when structure *is* the value. If it's just
  decoration or a how-it-works restatement, cut it — reach for imagery instead.

## Diagram theming (mermaid)

Sources live in `docs/assets/src/*.mmd`; render with `scripts-dev/render-diagrams.sh`.
Theme tokens are in `docs/assets/mermaid-theme.json`. Emphasize at most one path
per diagram with:

```
classDef accent stroke:#FFCC00,color:#FFCC00;
linkStyle <n> stroke:#FFCC00;
```

## Image voice

Brand imagery sells the **value** of a skill — what you get and why it's worth
having — never a diagram of how it works. Lead with meaning and feeling, not
mechanism. Editorial-illustration energy, warm and human, with a little wit.

**Personification.** Skills with a human-named persona are drawn as a **recurring
character** — one consistent, memorable figure that embodies the skill's value, so
people recognize them across the set. The canonical roster lives in
[Characters](#characters). Characters and scenes are welcome in imagery; they stay
out of the structural diagrams.

**Palette.** `#FFCC00` is the signature thread — keep it present in every image as
a warm keylight, garment, prop, or accent, never absent. Beyond that, imagery may
use a fuller, warmer range: lamplight, wood, deep teal night, real skin tones,
soft depth and grain. Near-black `#0a0a0a` still grounds most compositions, but the
light is warm, not clinical. This is a lit room at 2am, not a console readout.

**Honesty.** Never fabricate specifics. No invented metrics, fake filenames, fake
code, fake UI chrome, fake logs, or made-up product copy baked into the image. The
art is evocative and metaphorical, not a faked screenshot. If a number, label, or
line of code isn't real, it doesn't go in the picture — suggest it (a blurred
printout, an unreadable terminal glow), don't forge it.

**Composition.** Landscape by default (3:2) so heroes sit in a doc without breaking
the page. One clear subject, generous breathing room, deliberate light. No neon, no
synthwave, no gradient mush, no stock-render gloss. Stylized and crafted over
photoreal.

## Characters

Canonical descriptions for personified skills. Reference for art direction — kept
out of the auto-injected [Image voice](#image-voice) so each character's bio never
bleeds into another's generation. Draw them consistently across appearances.

- **Grumpy** (review) — a weathered senior developer, late 50s, salt-and-pepper
  stubble, reading glasses pushed up, arms crossed, one eyebrow raised at your
  code. Skeptical and seen-it-before, but secretly on your side. Lit by a warm
  amber desk lamp in a dim room.
- **Janitor** (cleanup) — a calm, unhurried custodian, sleeves rolled, leaning
  easily on a mop in a room he has just made orderly. Quiet competence, no drama;
  the satisfaction of a clean, safe space. Warm light from a doorway, amber accent
  on his keychain or bucket.
- **DocCtor** (Apple DocC documentation) — a warm, attentive physician for
  documentation: a doctor in a soft white coat, reading glasses, listening
  through a stethoscope to an open technical book or framework whose pages fan
  out like a healthy chart. Unhurried, reassuring, precise — the sense that your
  docs are in careful hands and will come out well-structured. Warm amber
  examination-lamp light in a calm study; the `#FFCC00` accent lives in the lamp
  glow, a bookmark ribbon, or the coat's trim.

When a new personified skill ships, add its character here before generating art.

## Voice (prose)

No exclamation marks. Banned: "AI-powered", "leverage", "seamlessly",
"next-generation", "cutting-edge", "we're excited". Section headers never named
"Introduction", "Conclusion", "TL;DR", "Key Takeaways".
