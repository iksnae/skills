#!/usr/bin/env python3
"""Toggle and speak short agent updates with native non-blocking TTS."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from shutil import which


DEFAULT_CONFIG = {
    "enabled": False,
    "provider": "native",
    "voice": None,
    "rate": None,
    "prefix": "",
    "redact": True,
    "max_chars": 500,
}

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\s]+"),
    re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]{16,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
]


def config_path(value: str | None) -> Path:
    if value:
        return Path(value).expanduser()
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".config"
    return root / "spoken-updates" / "config.json"


def state_path() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".cache"
    return root / "spoken-updates" / "pids.json"


def load_config(path: Path) -> dict:
    data = dict(DEFAULT_CONFIG)
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"invalid config JSON at {path}: {exc}") from exc
        if not isinstance(loaded, dict):
            raise SystemExit(f"invalid config at {path}: expected object")
        data.update(loaded)
    return data


def save_config(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def emit(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def redact(text: str) -> str:
    out = text
    for pattern in SECRET_PATTERNS:
        out = pattern.sub("[redacted]", out)
    return out


def clean_text(text: str, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if max_chars > 0 and len(text) > max_chars:
        return text[: max_chars - 1].rstrip() + "..."
    return text


def read_text(args: argparse.Namespace) -> str:
    if args.text_file:
        return Path(args.text_file).expanduser().read_text(encoding="utf-8")
    if args.text:
        return " ".join(args.text)
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise SystemExit("missing text: pass words, --text-file, or stdin")


def native_command(text: str, cfg: dict) -> list[str]:
    system = platform.system().lower()
    voice = cfg.get("voice")
    rate = cfg.get("rate")

    if system == "darwin":
        if not which("say"):
            raise SystemExit("native TTS unavailable: macOS 'say' command not found")
        cmd = ["say"]
        if voice:
            cmd += ["-v", str(voice)]
        if rate:
            cmd += ["-r", str(rate)]
        return cmd + [text]

    if system == "linux":
        if which("spd-say"):
            cmd = ["spd-say"]
            if rate:
                # speech-dispatcher uses -100..100; accept the user's value as-is.
                cmd += ["-r", str(rate)]
            return cmd + [text]
        espeak = which("espeak-ng") or which("espeak")
        if espeak:
            cmd = [espeak]
            if voice:
                cmd += ["-v", str(voice)]
            if rate:
                cmd += ["-s", str(rate)]
            return cmd + [text]
        raise SystemExit("native TTS unavailable: install speech-dispatcher or espeak")

    if system == "windows":
        escaped = text.replace("'", "''")
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        )
        if voice:
            safe_voice = str(voice).replace("'", "''")
            script += f"$s.SelectVoice('{safe_voice}'); "
        if rate:
            # System.Speech rate is -10..10.
            script += f"$s.Rate = [Math]::Max(-10, [Math]::Min(10, [int]{int(rate)})); "
        script += f"$s.Speak('{escaped}')"
        return ["powershell", "-NoProfile", "-Command", script]

    raise SystemExit(f"native TTS unsupported on {platform.system()}")


def active_pids(path: Path) -> list[int]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return [int(pid) for pid in data.get("pids", []) if isinstance(pid, int) or str(pid).isdigit()]


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def remember_pid(pid: int) -> None:
    path = state_path()
    pids = [p for p in active_pids(path) if pid_alive(p)]
    pids.append(pid)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"pids": pids}, indent=2) + "\n", encoding="utf-8")
    except OSError:
        # Speech must remain non-blocking even in harnesses that cannot write
        # user cache directories. stop/replace will only know about recorded PIDs.
        return


def stop_known() -> list[int]:
    path = state_path()
    stopped: list[int] = []
    for pid in active_pids(path):
        if not pid_alive(pid):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            stopped.append(pid)
        except OSError:
            pass
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"pids": []}, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass
    return stopped


def cmd_status(args: argparse.Namespace) -> int:
    path = config_path(args.config)
    cfg = load_config(path)
    emit({"config_path": str(path), "config": cfg, "active_pids": active_pids(state_path())})
    return 0


def cmd_config(args: argparse.Namespace) -> int:
    path = config_path(args.config)
    cfg = load_config(path)
    if args.enabled:
        cfg["enabled"] = True
    if args.disabled:
        cfg["enabled"] = False
    if args.provider:
        cfg["provider"] = args.provider
    if args.voice is not None:
        cfg["voice"] = args.voice or None
    if args.rate is not None:
        cfg["rate"] = args.rate
    if args.prefix is not None:
        cfg["prefix"] = args.prefix
    if args.max_chars is not None:
        cfg["max_chars"] = args.max_chars
    if args.redact:
        cfg["redact"] = True
    if args.no_redact:
        cfg["redact"] = False
    save_config(path, cfg)
    emit({"config_path": str(path), "config": cfg})
    return 0


def cmd_speak(args: argparse.Namespace) -> int:
    path = config_path(args.config)
    cfg = load_config(path)
    if not cfg.get("enabled") and not args.force:
        emit({"status": "skipped", "reason": "speech disabled", "config_path": str(path)})
        return 0

    provider = args.provider or cfg.get("provider", "native")
    if provider != "native":
        raise SystemExit(f"provider '{provider}' is not implemented; use provider 'native'")

    text = read_text(args)
    prefix = args.prefix if args.prefix is not None else cfg.get("prefix", "")
    if prefix:
        text = f"{prefix} {text}"
    max_chars = int(args.max_chars if args.max_chars is not None else cfg.get("max_chars", 500))
    text = clean_text(text, max_chars)
    if cfg.get("redact", True) and not args.no_redact:
        text = redact(text)
    if not text:
        emit({"status": "skipped", "reason": "empty text"})
        return 0

    if args.replace:
        stop_known()

    cmd = native_command(text, cfg)
    if args.emit_command:
        emit({
            "status": "command",
            "provider": provider,
            "command": cmd,
            "chars": len(text),
        })
        return 0

    started = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    remember_pid(proc.pid)
    if args.wait:
        code = proc.wait()
        emit({
            "status": "spoken" if code == 0 else "failed",
            "provider": provider,
            "pid": proc.pid,
            "exit_code": code,
            "wall_seconds": round(time.time() - started, 3),
            "chars": len(text),
        })
        return code
    emit({"status": "speaking", "provider": provider, "pid": proc.pid, "chars": len(text)})
    return 0


def cmd_stop(_args: argparse.Namespace) -> int:
    emit({"status": "stopped", "pids": stop_known()})
    return 0


def cmd_voices(_args: argparse.Namespace) -> int:
    system = platform.system().lower()
    if system == "darwin" and which("say"):
        subprocess.run(["say", "-v", "?"], check=False)
        return 0
    if system == "linux":
        espeak = which("espeak-ng") or which("espeak")
        if espeak:
            subprocess.run([espeak, "--voices"], check=False)
            return 0
    emit({"status": "unavailable", "reason": "voice listing is not supported on this platform"})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="config JSON path")
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status")
    status.set_defaults(func=cmd_status)

    config = sub.add_parser("config")
    group = config.add_mutually_exclusive_group()
    group.add_argument("--enabled", action="store_true")
    group.add_argument("--disabled", action="store_true")
    config.add_argument("--provider", choices=["native"])
    config.add_argument("--voice")
    config.add_argument("--rate", type=int)
    config.add_argument("--prefix")
    config.add_argument("--max-chars", type=int)
    redaction = config.add_mutually_exclusive_group()
    redaction.add_argument("--redact", action="store_true")
    redaction.add_argument("--no-redact", action="store_true")
    config.set_defaults(func=cmd_config)

    speak = sub.add_parser("speak")
    speak.add_argument("text", nargs="*")
    speak.add_argument("--provider", choices=["native"])
    speak.add_argument("--text-file")
    speak.add_argument("--force", action="store_true")
    speak.add_argument("--wait", action="store_true")
    speak.add_argument("--replace", action="store_true")
    speak.add_argument("--emit-command", action="store_true")
    speak.add_argument("--prefix")
    speak.add_argument("--max-chars", type=int)
    speak.add_argument("--no-redact", action="store_true")
    speak.set_defaults(func=cmd_speak)

    stop = sub.add_parser("stop")
    stop.set_defaults(func=cmd_stop)

    voices = sub.add_parser("voices")
    voices.set_defaults(func=cmd_voices)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
