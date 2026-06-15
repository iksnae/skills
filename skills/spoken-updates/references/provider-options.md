# TTS provider options

Use this reference when a user wants to move beyond native OS speech. Keep the
native provider installed as the zero-credential fallback.

## Selection criteria

- **Latency:** spoken agent updates should start in under one second. Avoid
  batch-only article pipelines for live updates.
- **Non-blocking shape:** the agent should launch speech and continue working.
  Streaming audio is acceptable if wrapped in a background process.
- **Privacy:** prefer local providers for private repositories, customer data,
  credentials-adjacent work, or highly sensitive status lines.
- **Operational weight:** avoid providers that require a GPU daemon unless the
  user explicitly wants higher quality and accepts setup overhead.
- **Control:** useful controls are voice, speed/rate, interruption/replacement,
  and a global enabled flag.

## Native OS TTS

Best first implementation. macOS `say`, Linux `speech-dispatcher`/`espeak`, and
Windows `System.Speech` require no API keys and can run fully offline.

Tradeoffs: quality varies by installed voices, pronunciation is limited, and
Linux availability depends on desktop packages.

## Open-source local models

Good candidates when the user wants better voice quality without hosted TTS:

- **Piper:** lightweight local neural TTS, practical on CPU, many voices, good
  for short status lines. Best next local provider to add.
- **Kokoro-style ONNX TTS:** stronger quality in small models when an ONNX
  runtime path is already acceptable.
- **Coqui XTTS / voice cloning stacks:** useful for custom voices, but heavier
  operationally and not the right default for simple progress updates.

Implementation pattern: write text to a temp WAV/MP3, launch the provider in a
background subprocess, then launch a platform audio player (`afplay`, `paplay`,
`ffplay`, or PowerShell media player). Record both PIDs so `stop` can interrupt
the current utterance.

## Hosted models

Use hosted TTS when voice quality, consistent voices across machines, or
realtime streaming matters more than credential-free operation.

Candidates:

- **OpenAI Speech API:** best hosted next step for this skill. Use
  `POST /v1/audio/speech` with `gpt-4o-mini-tts` for short text-to-speech
  status updates, defaulting to `response_format: "wav"` or `"pcm"` when
  startup latency matters. The endpoint also supports MP3/Opus/AAC/FLAC for
  file-oriented use, but live agent updates should prefer streamable formats.
  Use `marin` or `cedar` for highest quality; the full built-in voice set is
  `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`,
  `shimmer`, `verse`, `marin`, and `cedar`. Keep `OPENAI_API_KEY` in the
  environment, never in spoken-updates config.
- **OpenAI Realtime API:** use only when the feature becomes a true voice-agent
  surface: barge-in, low first-audio latency, natural turn taking, tool use
  inside a live session, WebRTC/WebSocket transport, or speech-to-speech. For
  one-way spoken status updates, Realtime is more operational machinery than
  needed.
- **ElevenLabs:** high-quality voices and voice control; useful for branded
  assistants, but adds vendor-specific credentials and cost.
- **Cloud provider TTS:** AWS Polly, Google Cloud TTS, and Azure Speech fit
  organizations that already run those credentials and compliance controls.

Implementation pattern for OpenAI Speech:

1. Redact and trim locally before sending text.
2. Call `/v1/audio/speech` with `model`, `voice`, `input`, optional
   `instructions`, `response_format`, and optional `speed`.
3. Stream the audio to a temp file or player process in the background.
4. Emit a receipt with provider/model/voice/format/character count and output
   path or playback PID, but not the full spoken text.
5. Fall back to native `say` when no API key is present or the network/API call
   fails.

OpenAI implementation notes:

- `instructions` works for `gpt-4o-mini-tts`; it does not work with `tts-1` or
  `tts-1-hd`.
- Supported output formats are `mp3`, `opus`, `aac`, `flac`, `wav`, and `pcm`.
- `speed` accepts `0.25` through `4.0`; default is `1.0`.
- `stream_format` may be `sse` or `audio`; SSE streaming is not supported for
  `tts-1` or `tts-1-hd`.
- Custom voices exist but are limited to eligible customers; do not make them a
  default path.

## What not to add first

- Long-form MP3 generation. This repo already has `article-audio` for that.
- Automatic speech for every assistant message. That creates noise and risks
  reading sensitive content aloud.
- Voice cloning as a default. Require explicit user intent and source-audio
  rights before adding custom voice workflows.
