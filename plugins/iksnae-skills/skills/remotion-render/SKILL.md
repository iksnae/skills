---
name: remotion-render
description: >
  Render a Remotion composition to MP4/WebM/ProRes/PNG-sequence via the
  bundled scripts/render_remotion.py wrapper. Use when an agent has
  authored or modified Remotion code and needs to produce a real video
  artifact for review or shipping. Two required inputs: a Remotion
  project root with package.json + src/, and a composition ID
  registered in that project. Output is a video file at the requested
  path + a sibling receipt JSON capturing duration, size, exit code,
  codec, props hash. Also bundles scripts/lint_remotion_spec.py, the
  spec/token linter used by the remotion-author skill. Do NOT use this
  to author Remotion code (use the remotion-author skill), to preview
  interactively (use `npx remotion studio`), or in environments
  without Node 16+ on PATH.
---

# remotion-render

Thin invocation skill for the bundled Remotion render primitive.
Wraps `npx remotion render` with tier presets, composition-ID
pre-validation, props-as-tempfile (Windows-safe), and a structured
receipt JSON. Mirrors the `image-generate` shape — small primitive,
honest receipt.

**The tools live in this skill's directory**: `scripts/render_remotion.py`
(the render wrapper) and `scripts/lint_remotion_spec.py` (the spec +
brand-token linter — see [`remotion-author`](../remotion-author/SKILL.md)
for its usage). Plugin installs keep the relative layout, so resolve
paths relative to this SKILL.md's location.

For authoring philosophy (BEATS, specs-as-blueprints): see the sibling
[`remotion-author`](../remotion-author/SKILL.md) skill.

## Purpose and boundaries

This skill commits to:

- Invoking `npx remotion render` against a project root + composition
  ID, with the codec + concurrency + quality flags resolved from a
  named tier preset.
- Pre-validating the composition ID against `npx remotion compositions
  --quiet` so the failure mode "comp ID typo" is caught before the
  ~minute-scale render starts.
- Materializing `--props` as a tempfile per the Remotion docs (inline
  JSON strings aren't supported on Windows shells).
- Writing a receipt JSON alongside every render — schema
  `remotion-render-receipt-v1`. Captures the command, props
  sha256, duration, exit code, stderr tail.

It does NOT commit to:

- Authoring Remotion compositions, components, or specs. Different
  skill.
- Lambda / cloud rendering. The wrapper is local-only by design.
- Running `npm install` for the target project. The wrapper assumes
  the project is installable and that the operator has run
  `npm install` (or that node_modules is otherwise present).

## Inputs

Required:

- **`--project <dir>`** — path to the Remotion project root. Must
  contain `package.json`. Typically also contains `src/` and
  `remotion.config.ts`.
- **`--composition <id>`** — the composition ID as registered in
  `src/Root.tsx` (or wherever the entry file calls
  `<Composition id="..."  ...>`).
- **`--out <path>`** — output file path. Extension should match codec
  (`.mp4` for h264/h265, `.webm` for vp9, `.mov` for prores, `.png`
  for png sequences).

Optional:

- **`--props-file <path.json>`** — JSON object to inject as the
  composition's runtime props. Tool reads the file once, validates
  it's a JSON object, hashes it for the receipt, then passes
  `--props=<absolute path>` to `npx`.
- **`--tier preview|default|max|prores-4444-xq`** — quality/speed
  preset. Default: `default`.
  - `preview` — fast draft, h264 + jpeg-quality 70. For iteration.
  - `default` — balanced, h264 + jpeg-quality 85. Most ship paths.
  - `max` — h264 + jpeg-quality 100 + yuv420p. Larger files, slower.
  - `prores-4444-xq` — ProRes 4444 XQ for downstream editing.
    Output should be `.mov`.
- **`--codec`** — override the tier's codec (e.g. force vp9 on a
  preview tier).
- **`--concurrency N`** — parallel workers. Lower this if the render
  OOMs.
- **`--frames START-END`** — frame range. Default: full duration.
- **`--entry src/index.ts`** — composition entry path inside the
  project. Defaults to `src/index.ts`.
- **`--no-validate-comp-id`** — skip the pre-check. Faster on
  repeated renders against the same project; errors get less helpful.
- **`--retries N`** — retry transient failures (network/Chromium
  download/timeout) up to N extra times. Default 0.

Environment:

- **`npx` on PATH** — wraps Node's executable runner. The wrapper
  exits 2 with a clear message if missing.
- **No API keys.** Local render is free; nothing is sent off-machine.

## Outputs

- The rendered video file at `<--out>`.
- A sibling receipt at `<--out>.receipt.json` with schema
  `remotion-render-receipt-v1`. Fields:
  - `id` (uuid), `started_at` / `finished_at` (ISO 8601),
    `duration_sec`, `ok`, `error`, `exit_code`.
  - `tool.command` — the full `npx` argv that ran.
  - `project`, `entry`, `composition`, `tier`, `tier_doc`, `codec`,
    `concurrency`, `frames`.
  - `out`, `out_size_bytes`.
  - `props_file` + `props_sha256` when props were injected.
  - `stderr_tail` — last 1.2k of stderr on failure.

## Workflow

### Step 1: Confirm the project is installable

Before invoking the tool, ensure `node_modules/` is populated:

```bash
cd <project-dir>
npm install
```

The wrapper does not run this for you. If `node_modules/` is missing,
the comp-ID pre-check (which runs `npx remotion compositions`) will
fail.

### Step 2: Discover composition IDs (optional)

If the composition ID is unknown, list them first:

```bash
npx --yes remotion compositions <project-dir>/src/index.ts --quiet
# emits space-separated IDs
```

### Step 3: Render

```bash
python3 <skill-dir>/scripts/render_remotion.py \
  --project path/to/remotion-project \
  --composition MyIntro \
  --out renders/intro.mp4 \
  --tier default
```

On success the tool prints a single JSON line:

```json
{"ok": true, "out": "...", "receipt": "....receipt.json",
 "duration_sec": 12.4, "size_bytes": 481102, "tier": "default",
 "composition": "MyIntro"}
```

### Step 4: Verify

Inspect the receipt:

```bash
cat <out>.receipt.json | python3 -m json.tool | head
```

- `exit_code: 0` and `ok: true` mean the render finished cleanly.
- `out_size_bytes` should be sane for the duration + codec + tier.
  A 3-second h264 default-tier render at 1080p is usually 200–800 KB;
  if you see 1 KB, something rendered empty.
- `stderr_tail` carries the most informative error string on
  failure — read it first.

### Step 5: Promote

To ship a render in a deliverable, move it to your tracked assets
directory (e.g. `docs/assets/`) and update references. Keep the
receipt wherever your project stores audit artifacts.

## Failure modes to avoid

- **Running without `npm install`.** The comp-ID pre-check will fail
  with a confusing module-not-found message. Always install first.
- **Composition ID typo.** Without `--no-validate-comp-id` the pre-
  check catches this; with it, you'll burn the full render before
  Remotion complains.
- **Output extension mismatching codec.** Naming the output `.mp4`
  while passing `--codec=vp9` produces a malformed file. Match
  extension to codec.
- **`--frames` outside duration.** A composition registered with
  `durationInFrames=90` will fail on `--frames=0-200`. Read
  `Root.tsx` first.
- **OOM on long renders.** Default concurrency is high. Drop to
  `--concurrency=2` on machines with <16GB RAM, or render in slices
  via `--frames` and concatenate downstream.
- **First-run Chromium download.** Remotion bundles Chromium via
  Puppeteer; the first render after `npm install` downloads ~150MB.
  Allow the first render extra time + bandwidth, or pre-warm via
  `npx remotion versions`.

## Verification

The render produced a usable output when:

- The file at `<--out>` exists and is non-trivial in size
  (`out_size_bytes` in the receipt > 1KB for video, > 100B for a
  single PNG).
- The receipt's `ok: true` and `exit_code: 0`.
- For structural/spec-driven videos: every scene listed in your
  authoring spec made it into the rendered video. Spot-check with
  `--frames=<scene_start>-<scene_start+1>` if in doubt.
- The receipt is kept with your project's audit artifacts.

## References

- Bundled tools: `scripts/render_remotion.py` and
  `scripts/lint_remotion_spec.py` (in this skill's directory).
- Sister skill: [`remotion-author`](../remotion-author/SKILL.md) —
  authoring philosophy + spec linter usage.
- Remotion CLI: https://www.remotion.dev/docs/cli/render
- Tier presets are derived from the rendering guide in
  RinDig/Content-Agent-Routing-Promptbase.
