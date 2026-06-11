---
name: article-audio
description: >
  Generate a spoken-word audio.mp3 alongside a markdown article via
  OpenAI's gpt-4o-mini-tts, using the bundled
  scripts/generate_article_audio.py. Use when publishing a long-form
  article or documentation post that benefits from an audio reader on
  a site. Replaces the browser-native window.speechSynthesis fallback
  that cuts off long articles (~250 char limit in Chrome) and sounds
  noticeably worse than current generative TTS. Do NOT use this for
  short notes (≤150 words don't warrant the cost), for live realtime
  narration (use a streaming TTS), or for translation — the model
  reads the input language only.
---

# article-audio

The text-to-speech primitive behind a "listen to this article"
button. Reads a markdown article, strips formatting, chunks on
paragraph boundaries to stay within OpenAI's per-call limit,
calls `v1/audio/speech`, and concatenates the resulting MP3
bytes into a single `audio.mp3` next to the article.

Most static-site templates can prefer a sibling `audio.mp3` resource
over `speechSynthesis` when present (e.g. Hugo page bundles via
`.Resources.GetMatch "audio.mp3"`). All this skill has to do is land
the MP3 next to the article.

**The tool lives in this skill's directory** at
`scripts/generate_article_audio.py`. Plugin installs keep the relative
layout, so resolve the path relative to this SKILL.md's location.

## Purpose and boundaries

This skill commits to:

- Producing an `audio.mp3` from a markdown article in one
  deterministic call.
- Handling **long articles** by chunking on paragraph boundaries
  (then sentences, then hard splits as fallback). The default
  4000-char chunk size stays under OpenAI's 4096 per-call limit
  with headroom. MP3 byte-concatenation across chunks plays
  seamlessly in browsers — no audible seam.
- Writing a receipt JSON next to the audio with the char count,
  chunk count, voice, model, instructions, estimated cost, and
  SHA256 of the plain-text input.
- **Honest failure modes** (same retry shape as the image-generate
  tool): retry on 429 / 5xx / read-timeout / connect-timeout with
  10s → 30s backoff. 4xx errors fail fast with the API's error body
  in stderr.

It does NOT commit to:

- Voice cloning or custom voice training. Only the 11 OpenAI
  stock voices are available.
- Multi-voice / character narration. One voice per file.
- SSML, prosody markup, or per-section voice changes.
- Audio post-processing (loudness normalization, EQ, silence
  trimming between chunks). The raw concatenated MP3 ships as-is.

## Inputs

Required:

- **`--md <path.md>`** — the markdown article. Frontmatter is
  stripped automatically; only the body is read.
- **`OPENAI_API_KEY`** environment variable. Tool exits 2 with a
  clear message if missing. No other credentials are read or stored.

Optional:

- **`--out <path.mp3>`** — output path. Defaults to `audio.mp3`
  next to `--md`.
- **`--voice <id>`** — OpenAI voice. Default `echo` (neutral,
  technical). Alternatives: `onyx` (deep, authoritative),
  `sage` (measured), `alloy`, `ash`, `ballad`, `coral`, `fable`,
  `nova`, `shimmer`, `verse`.
- **`--model <id>`** — Default `gpt-4o-mini-tts`. Alternatives:
  `tts-1` (cheaper, less natural), `tts-1-hd` (better fidelity,
  no voice steering).
- **`--instructions "<text>"`** — voice steering prompt
  (gpt-4o-mini-tts only). Example: `"measured, slightly low
  cadence, technical tone, no theatrics, no exclamation"`. Keeps
  the read from drifting newsreader-bright on otherwise terse
  prose.
- **`--config <path.yaml>`** — optional YAML file with a
  `pronunciations:` mapping (literal → phonetic spelling) applied
  before the TTS call. Use this for brand or project names the
  model would otherwise mispronounce (e.g. `SQLite: "sequel-ite"`).
  No rules ship by default. If your project keeps a pronunciation
  table in a DESIGN.md/BRAND.md, mirror it into this config file.
- **`--no-pronunciations`** — skip the substitution layer entirely;
  useful when debugging raw model output.
- **`--max-chars-per-chunk <n>`** — default 4000.
- **`--speed <n>`** — playback speed 0.25–4.0. Default 1.0.

## Outputs

- `audio.mp3` at the resolved `--out` path. MPEG ADTS layer III,
  128 kbps, 24 kHz mono. Typical 1000-word article produces
  ~8 MB / 8 minutes of audio.
- `audio.mp3.receipt.json` with schema
  `article-audio-receipt-v1`. Fields:
  - `id`, `started_at`, `finished_at`, `wall_seconds`.
  - `md_path`, `out_path`, `out_size_bytes`.
  - `model`, `voice`, `format`, `speed`, `instructions`.
  - `char_count`, `chunk_count`, per-chunk metadata
    (`index`, `chars`, `bytes`, `duration_sec`).
  - `estimated_cost_usd` (back-of-envelope; receipts let
    operators reconcile against the OpenAI invoice).
  - `plain_sha256` — SHA256 of the stripped-plain-text input.
  - `pronunciations_applied` — counts per substitution rule.

## Workflow

### Step 1: Generate

```bash
python3 <skill-dir>/scripts/generate_article_audio.py \
  --md docs/<date>-<slug>.md \
  --out /tmp/sample.mp3 \
  --voice echo
```

Useful for sampling a voice before committing to a default. For
publishing, point `--out` at the article's page bundle so the site
template picks the mp3 up on the next build.

### Step 2: Verify

- The mp3 file exists at the resolved path and is non-trivial in
  size (typically 1MB per minute of speech at 128 kbps).
- The receipt's `estimated_cost_usd` matches expectations.
- For long articles: `chunk_count > 1` and the per-chunk durations
  are roughly proportional to char counts.
- Spot-listen the first chunk and a chunk boundary —
  concatenation should be inaudible.

## Cost shape

Per the OpenAI pricing page:

- `gpt-4o-mini-tts` — ~$12 per 1M input chars. A 1500-word post
  ≈ 8500 chars ≈ **$0.10 per article**.
- `tts-1` — ~$15/M chars.
- `tts-1-hd` — ~$30/M chars (better fidelity).

The receipt's `estimated_cost_usd` is a back-of-envelope; pull
the actual cost from the OpenAI invoice for periodic
reconciliation.

## Failure modes to avoid

- **Calling for short notes.** Short notes (≤150 words) don't
  warrant the cost or the listener's time. Reserve audio for
  long-form posts.
- **Running without `OPENAI_API_KEY` in scope.** The tool exits 2
  before any work; nothing partial is written.
- **Skipping voice steering for technical content.** Without
  `--instructions`, the default voice reads with a more
  enthusiastic prosody than terse technical prose tolerates. Pass
  steering prompts for any article with > 600 words of dense
  technical content.
- **Re-generating audio on every republish.** The receipt's
  `plain_sha256` is the stable identity. When republishing
  unchanged content, reuse the existing mp3 and skip the call to
  save ~$0.10 + wall-clock.
- **Long articles + tight timeouts.** Default timeout is 180s
  per call; a 6-chunk article therefore worst-cases at ~18min.
  Most posts finish in 2-3min. If a chunk times out
  persistently, the wrapper retries twice (10s → 30s backoff)
  then fails the whole run.

## Verification

The audio is ready to ship when:

- `audio.mp3` exists at the target path and the receipt shows
  `out_size_bytes > 100_000` (less than 100KB suggests the article
  was nearly empty after stripping).
- The receipt's `voice` and `model` match the project default
  (or an explicit override the operator intended).
- For multi-chunk audio: spot-check by listening to ~5s either
  side of a chunk boundary. If the seam is audible, the chunker
  split mid-sentence — investigate the input and re-chunk with a
  smaller `--max-chars-per-chunk`.
- The read doesn't drift theatrical or newsreader-bright; the
  `--instructions` flag is the lever.

## References

- Bundled tool: `scripts/generate_article_audio.py` (in this skill's
  directory).
- Receipt schema: `article-audio-receipt-v1`.
- OpenAI TTS docs: https://platform.openai.com/docs/guides/text-to-speech
