---
name: image-generate
description: >
  Produce supporting artwork or diagrams via the bundled
  scripts/generate_image.py (OpenAI image API, default model
  gpt-image-2). Use this when a deliverable benefits from a visual —
  architecture diagram, workflow illustration, hero image, design
  reference — and an ASCII or Mermaid rendering alone won't carry the
  meaning. Two modes: free-text --prompt for pictorial work, and
  --mermaid path.mmd for structurally accurate diagrams (kroki.io
  renders the baseline, the image model polishes it). Output is a PNG
  plus a sibling receipt JSON. Do NOT use this for code-flow diagrams
  that belong in markdown as raw Mermaid (use a .md doc instead), for
  screenshots of real UI, or when the API key is missing.
---

# Image Generate

Bridges prose deliverables to visual artifacts via a small,
deterministic tool primitive.

**The tool lives in this skill's directory** at
`scripts/generate_image.py`. Plugin installs keep the relative layout,
so resolve the path relative to this SKILL.md's location (e.g.
`<skill-dir>/scripts/generate_image.py`).

## Purpose and boundaries

This skill commits to:

- Producing a PNG image from a text prompt or a Mermaid source file.
- Writing a structured receipt JSON beside the PNG so the call is
  auditable (model, size, quality, prompt hash, cost estimate).
- Defaulting the output path to `generated-images/<slug>.png` in the
  working directory when `--out` is omitted.

It does NOT commit to:

- Editing an existing image (the API supports `images.edit`; the tool
  exposes this via `--mermaid`'s reference-image path, not as a
  standalone surface).
- Cost control beyond per-call estimates. Operators are responsible
  for batch budgets.

### Style brief (optional brand voice)

If a `DESIGN.md` or `BRAND.md` exists in the working directory, the
tool looks for a `## ` heading containing "image voice"
(case-insensitive) and prepends that section's content (the first
fenced code block, or the section text) to every prompt. Override the
file with `--style-file` and the heading match with `--style-section`.
No matching file or section → no injection, no error. Pass
`--no-style` to bypass explicitly on pure-technical diagrams where a
brand voice would distract.

## Inputs

Required (one of):

- **`--prompt "<text>"`** — free-text description. Best for pictorial,
  conceptual, or hero-image work where structural accuracy is not the
  primary value.
- **`--mermaid <path>`** — path to a `.mmd` file or a `.md` file
  containing a ```mermaid``` fence. Best for state machines, sequence
  diagrams, flowcharts. Kroki (or local `mmdc` if on PATH) renders a
  deterministic baseline; the baseline is passed to `images.edit` so
  the polish doesn't scramble the graph.

Optional:

- **`--out <path>`** — output PNG path. Defaults to
  `generated-images/<slug>.png` (slug derived from prompt or
  Mermaid title).
- **`--size 1024x1024|1536x1024|1024x1536`** — default 1536x1024.
- **`--quality high|medium|low`** — default high.
- **`--model <id>`** — OpenAI image model, default `gpt-image-2`.
- **`--no-style`** — bypass style-brief prefix injection.
- **`--style-file <md>` / `--style-section <text>`** — see above.
- **`--batch <manifest.yaml>`** — fan a list of images out across a
  threadpool; `--max-workers N` (default 3). Requires pyyaml.
- **`--kroki-url <url>`** — alternate Kroki endpoint for the Mermaid
  baseline (default `https://kroki.io`).
- **`--no-reference-image`** — skip the Mermaid baseline render
  (prompt-only generation).

Environment:

- **`OPENAI_API_KEY`** — required. Tool exits 2 with a clear message
  if missing. No other credentials are read or stored.

## Outputs

- `<--out path>` — the PNG file.
- A sibling receipt JSON (same path, `.json` extension) with schema
  `image-gen-receipt-v1`. Fields include `model`, `size`, `quality`,
  `prompt_raw`, `prompt_final`, `prompt_hash`, `style_injected`,
  `cost_estimate`, `mode` (`prompt` | `mermaid`), and for Mermaid mode
  the renderer used (`mmdc` | `kroki` | none).

Costs (gpt-image-2 launch pricing, indicative):

- 1024×1024 high: ~$0.04
- 1536×1024 high: ~$0.06
- low/medium discounts apply per `_COST_TABLE` in the script.

## Workflow

### Step 1: Decide the mode

If the artifact is **structural** (nodes, edges, layers, swim lanes,
state transitions), use `--mermaid`. The kroki baseline guarantees
the graph is correct before any LLM rewrites it.

If the artifact is **pictorial** (hero image, illustration, concept
art), use `--prompt`. Write the prompt with explicit composition
notes (camera angle, lighting, palette) — image models honor detail.

### Step 2: Author the source

For Mermaid: create the source as a `.mmd` file next to the deliverable
that needs the diagram. Keep node labels short (under ~30 chars per
line) — the polish step can truncate long text. **Never use
parentheses inside node labels** (see Failure modes below).

For prompt: write the prompt in one paragraph, leading with the
subject. Specify aspect ratio in words ("a 3:2 landscape") so the
tool's `--size` choice aligns with intent.

### Step 3: Run the tool

```bash
python3 <skill-dir>/scripts/generate_image.py --mermaid docs/diagrams/layers.mmd
# or
python3 <skill-dir>/scripts/generate_image.py --prompt "..." --size 1536x1024
```

Exit codes:
- 0 — image + receipt written.
- 1 — generation failed (API error). Read stderr for the OpenAI
  error message.
- 2 — operator error (missing key, bad args, write failure, missing
  Mermaid file).

### Step 4: Verify the output

Open the PNG. Check:

- The subject matches intent. Image gen still hallucinates — a
  diagram with `Layer 3` written as `Loyer 3` happens.
- For Mermaid: every node and edge from the source is present in the
  output. The receipt's `mermaid.renderer` field tells you whether
  the baseline render succeeded; if it shows null, the polish ran
  without a structural baseline and the graph is less trustworthy.
- **Inspect the receipt's `prompt_raw` for parser truncation.** If a
  label is cut short there, the parser dropped content before kroki
  even saw the source — the image cannot recover what the parser ate.
- The receipt's `cost_estimate` is what you expected.

### Step 5: Place the image

Default outputs land in `generated-images/` in the working directory.
For images referenced by a committed deliverable (docs, README), `mv`
the PNG to your tracked assets directory (e.g. `docs/assets/`) and
update references. Receipt JSONs are audit, not deliverable — keep or
discard per your project's conventions.

## External-dependency failure modes

The tool wraps two external services. Both can be transiently
unavailable; the tool retries some failures and surfaces others. Know
the shape:

| Failure | Detected by | Behavior |
|---|---|---|
| `OPENAI_API_KEY` missing or empty | wrapper preflight | exits 2 immediately, no API call |
| API responds 429 (rate-limited) | `HTTPError` | one retry after `x-ratelimit-reset-requests + 1s` |
| API responds 5xx | `HTTPError` | up to 2 retries with 10s, then 30s backoff |
| Connection / read timeout | `TimeoutError`, `socket.timeout`, URLError(timeout) | up to 2 retries with 10s, then 30s backoff |
| API responds 400 / 401 / 403 / 404 | `HTTPError` | no retry — exits 1 with body excerpt |
| API unreachable (DNS, refused) | `URLError` | no retry — exits 1 with reason |
| Mermaid baseline render (kroki.io) unreachable | `URLError`, `TimeoutError` | falls through to prompt-only mode; receipt marks the renderer null |
| Pyyaml not installed | `ImportError` (caught) | `--batch` exits 2; single-image mode unaffected |

**Operator checklist when a render fails:**

1. Read the receipt's `error` field. The wrapper writes a receipt even
   on failure when it can.
2. Look at `style_injected`. `true` means the style brief was applied;
   `false` means no style brief reached the model (no DESIGN.md/BRAND.md
   section found, or `--no-style`).
3. For Mermaid mode: check `mermaid.renderer`. If it's null, the
   baseline rendering failed and the pictorial result is unverified.
4. If the run shows transient retry attempts in stderr but ultimately
   fails, the OpenAI API was unhappy for a sustained window. Wait
   30+ seconds and retry once before escalating.

**Bash pipe gotcha worth naming:** `... | tail -3` collapses the
wrapper's exit code into `tail`'s (always 0 on input). Smoke-tests
of the wrapper should NOT pipe through `tail`; either drop the pipe
or check `$PIPESTATUS[0]` explicitly.

## Failure modes to avoid

- **Running without checking cost.** A batch of 20 high-quality
  images is ~$1. A batch of 200 isn't trivial. Use `--quality low`
  for drafts; promote to high only for the keeper.
- **Mermaid with too much text.** The polish step can mangle node
  labels longer than ~30 characters. Keep labels terse or accept
  that the polish step may break the text.
- **Parentheses inside Mermaid node labels.** The tool's parser
  truncates labels at the first `(` even when the label is quoted —
  `"Layer 0 (~800 tok)"` becomes `"Layer 0 (~800 tok"` and everything
  after is dropped before kroki renders. Use ` - ~800 tok` or
  `, ~800 tok` instead. Check the receipt's `prompt_raw` after every
  run.
- **Pictorial prompt where Mermaid would work.** Image gen is bad at
  precise graphs from prompt alone. If you find yourself writing
  "boxes labeled A, B, C with arrows from A to B and B to C" — stop
  and write Mermaid instead.
- **Forgetting `--no-style` for technical diagrams.** Once a style
  brief is auto-detected, the prefix is prepended by default. Pure
  technical diagrams don't want brand voice.

## Verification

The skill produced a usable output when:

- The PNG exists at the resolved `--out` path.
- The receipt JSON exists beside it with `schema: "image-gen-receipt-v1"`.
- For Mermaid mode: the receipt's `mermaid.renderer` is `mmdc` or
  `kroki` (not null — that means the baseline rendering failed and
  the output is unverified pictorially).
- The receipt's `prompt_raw` shows every intended label in full (no
  paren truncation, no unexpected cutoff).
- The visual inspection in Step 4 passed.
- If the image will land in a committed deliverable, it has been
  moved to a tracked location and references updated.
