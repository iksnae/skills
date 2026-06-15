---
name: spoken-updates
description: >
  Speak agent progress updates aloud in the background with configurable,
  toggleable text-to-speech. Use when a user wants Codex or another agent to
  narrate status updates, task progress, completion notices, or errors without
  blocking ongoing work. Starts with native OS TTS via the bundled
  scripts/speak_update.py helper; use references/provider-options.md when
  evaluating open-source or hosted TTS providers. Do not use for long-form
  article narration; use article-audio for publishable MP3 generation.
---

# spoken-updates

Runtime narration for agent work. The skill provides one small helper that can
toggle speech on/off, configure the voice/rate, and speak short updates in a
background process so the agent can continue working.

The tool lives in this skill's directory at `scripts/speak_update.py`. Resolve
that path relative to this SKILL.md after installation.

## Behavior

- Keep speech **opt-in**. The helper defaults to `enabled: false`; enable it
  once per machine or project before speaking routine updates.
- Speak short status lines, not full answers. A useful spoken update is usually
  one sentence under 180 characters.
- Run non-blocking by default. `speak` launches the platform TTS process and
  returns immediately with a JSON receipt containing the child PID.
- Redact likely secrets before speech. The helper masks common API keys,
  bearer tokens, private keys, and emails unless `--no-redact` is passed.
- Prefer native TTS first. On macOS this uses `say`; on Linux it tries
  `spd-say`, then `espeak`/`espeak-ng`; on Windows it uses PowerShell's
  `System.Speech`.

## Configure

Check current state:

```bash
python3 <skill-dir>/scripts/speak_update.py status
```

Enable native TTS and set a macOS voice/rate:

```bash
python3 <skill-dir>/scripts/speak_update.py config \
  --enabled \
  --provider native \
  --voice Samantha \
  --rate 185
```

Disable speech without losing other settings:

```bash
python3 <skill-dir>/scripts/speak_update.py config --disabled
```

The default config path is `${XDG_CONFIG_HOME}/spoken-updates/config.json`, or
`~/.config/spoken-updates/config.json` when `XDG_CONFIG_HOME` is unset. Use
`--config <path>` for project-local policy files.

## Speak

Speak a status update in the background:

```bash
python3 <skill-dir>/scripts/speak_update.py speak \
  "Tests are running. I will report the first failure if one appears."
```

Useful flags:

- `--force` speaks even when config is disabled.
- `--wait` blocks until the TTS command exits; use only for verification.
- `--replace` stops previously launched speech before speaking the new update.
- `--emit-command` prints the sanitized playback argv as JSON instead of
  launching it; use this when the host agent must run the playback command with
  elevated or GUI/audio permissions.
- `--prefix "<text>"` overrides any configured spoken prefix.
- `--text-file <path>` reads the update from a file instead of argv/stdin.
- `--no-redact` disables redaction when the caller has already sanitized text.

Stop speech launched by this helper:

```bash
python3 <skill-dir>/scripts/speak_update.py stop
```

List native voices when the platform supports it:

```bash
python3 <skill-dir>/scripts/speak_update.py voices
```

## Agent Usage

When speech is enabled and the user wants spoken progress, call `speak` at
natural transition points:

- Starting a long command or build.
- Moving from investigation to edits.
- Finding a failure that changes the plan.
- Finishing the requested work.

Do not speak every internal thought or every command. Keep spoken output
coarser than chat output so it remains useful instead of noisy.

For sensitive work, either avoid spoken updates or summarize without secrets,
personal data, credentials, filenames that encode private information, or exact
customer/user identifiers.

## macOS Sandbox Playback

Some managed agent sandboxes can run `say` and return exit 0 without producing
audible output, or fail file playback with `AudioQueueStart failed (-66680)`.
That means CoreAudio playback is blocked by the sandbox, not that speech
configuration is wrong.

In that case:

1. Use `speak --emit-command "<update>"` to get the sanitized argv.
2. Run the returned `say ...` command through the host's approved unsandboxed or
   GUI/audio execution path.
3. Keep normal `speak` as the default on machines where native playback works.

## Provider Expansion

Native TTS is the implemented provider. When the user asks to evaluate or add
other speech backends, read `references/provider-options.md` and choose one
provider path at a time. Keep the native provider as the zero-credential
fallback.

## Verification

The skill is ready when:

- `status` reports the expected config.
- `config --enabled` writes the config file.
- `speak --force --wait "speech test"` exits 0 on a machine with native TTS.
- `speak "disabled test"` returns a `skipped` receipt when config is disabled.
- `speak --force "background test"` returns immediately with a PID.
- `speak --emit-command "command test"` returns the sanitized native playback
  argv without launching audio.
