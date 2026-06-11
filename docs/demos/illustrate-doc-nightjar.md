# illustrate-doc decision record — nightjar README

*Provenance: applied the `illustrate-doc` skill (`skills/illustrate-doc/SKILL.md`)
to the target `demo/nightjar/README.md` on 2026-06-11. Methodology skill — no
artifact is produced; this record is the output.*

## Target

`demo/nightjar/README.md` — the usage README for nightjar, a tiny terminal
pastebin. Install block, a CLI command list, an HTTP API table, and a short
development section. About 250 words.

## Decision: no illustration

The README does not warrant an inline diagram or a generated image. Prose and
the existing tables carry it.

## Walking the decision tree

1. **Is the artifact a planning / synthesis / architecture doc?** No. It is a
   usage / reference README — install steps, a command list, an endpoint table.
   The skill's first branch routes reference prose to "no image. Prose is fine."

2. **Word count.** About 250 words, under the 400-word threshold the skill uses
   as a second gate. Short enough to read end-to-end without a visual anchor.

3. **Is there a single structural geometry the prose keeps reconstructing?** No.
   The CLI commands are a flat list. The HTTP API is already a method/path/
   description table — a comparison matrix with three axes, under the skill's
   ">4 axes" bar for escalating a matrix to a diagram. Neither leans on geometry
   that prose has to rebuild.

## Candidate considered and rejected

The one arguable candidate is a data-flow diagram for `nj serve`: CLI and web UI
reading and writing the same `~/.nightjar/pastes.json` through the HTTP API. That
is genuine structural geometry. It was rejected on three counts:

- The doc is a reference README, not an architecture doc — the wrong surface for
  an architecture diagram.
- It is under 400 words; the geometry is small enough that the endpoint table
  already conveys it.
- Adding it would be Mermaid-as-diagram-filler — visualizing the table's own
  rows rather than geometry the table cannot show. The skill names this as a
  failure mode to avoid.

If nightjar later grows an `ARCHITECTURE.md` that explains the serve-time data
flow as its load-bearing concept, that doc would clear the bar — and the tool
of choice there is a Mermaid `flowchart` fence (zero cost, renders in GitHub),
not `image-generate`. The README itself stays plain.
