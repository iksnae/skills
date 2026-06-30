#!/usr/bin/env python3
"""pet-hatch — turn per-state keyframes into looping animations.

Given a pet bundle whose keyframes were authored one-still-per-state (each the
"target" pose for a semantic state), hatch generates K in-between frames per
state by conditioning image-to-image generation on that state's keyframe (its
reference), then writes an anim.json the renderer plays as loops.

Grounded in OpenAI's hatch-pet (identity-anchor reference, per-state rows) but
diverges deliberately:
  - SEMANTIC states (idle/working/awaiting-human/...), not Codex's 9
    presentational rows (running-left is a renderer concern).
  - Each state is anchored by its OWN keyframe, so both identity AND the
    state's pose are locked — richer than a single canonical base.
  - anim.json carries frame counts + per-state durations + loop mode, the
    timing Codex hardcodes and openai/codex#20863 asks to expose.

Frames are authored on flat chroma green; the renderer keys them transparent.
Idempotent + resumable: existing in-between frames are skipped unless --force.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import subprocess
import sys
from pathlib import Path

# Per-state recipe: loop timing (frameMs), how long to hold the keyframe before
# the in-between (calm states linger), and the motion description for each
# in-between frame. 1 motion => 2-frame loop; 2 motions => 3-frame loop.
STATES: dict[str, dict] = {
    "idle":           {"frameMs": 160, "hold": 5, "motions": [
        "both eyes gently closed in a soft blink"]},
    "sleeping":       {"frameMs": 340, "hold": 3, "motions": [
        "the body risen mid-breath, slightly puffed up, still curled and fast asleep"]},
    "awaiting-human": {"frameMs": 220, "hold": 3, "motions": [
        "the head tilted a little further, ears perked higher, even more eager and expectant"]},
    "failed":         {"frameMs": 260, "hold": 3, "motions": [
        "a single small teardrop at one eye, the eyes squeezed slightly tighter, sniffling"]},
    "thinking":       {"frameMs": 240, "hold": 0, "motions": [
        "the ears flicked and the eyes glancing upward to the left, pondering",
        "the eyes glancing upward to the right and a front paw lifted near the chin"]},
    "working":        {"frameMs": 130, "hold": 0, "motions": [
        "both front paws lowered mid-motion, focused and busy",
        "both front paws raised mid-motion, focused and busy"]},
    "reviewing":      {"frameMs": 300, "hold": 0, "motions": [
        "the head tilted to the left, inspecting closely",
        "the head tilted to the right with one eyebrow raised, scrutinizing"]},
    "milestone":      {"frameMs": 140, "hold": 0, "motions": [
        "both front paws raised higher, eyes bright, mouth open mid-cheer",
        "a small joyful hop with paws up, beaming"]},
}

PROMPT = (
    "The EXACT same character in the identical pose, framing, size, colors and "
    "flat chroma green background as the reference image — but {motion}. Change "
    "ONLY that; keep everything else pixel-identical. Flat chroma green "
    "background (#00b140), no shadow, no reflection, no glow."
)


def build_anim(states: dict[str, dict]) -> dict:
    """Compose the anim.json frame lists. Calm states hold the keyframe then
    play a single quick in-between (e.g. a blink); active states ping-pong
    through their cycle (kf, a, b, a) for smoothness."""
    out: dict = {"frameMs": 160, "states": {}}
    for st, rec in states.items():
        kf = f"{st}.png"
        inbet = [f"{st}.m{i}.png" for i in range(len(rec["motions"]))]
        if rec["hold"] > 0:
            frames = [kf] * rec["hold"] + inbet
        else:
            frames = [kf] + inbet + inbet[-2::-1]  # kf, a, b, a
        out["states"][st] = {"frames": frames, "frameMs": rec["frameMs"], "mode": "loop"}
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Hatch per-state keyframes into looping animations.")
    ap.add_argument("--frames-dir", required=True, type=Path,
                    help="dir of <state>.png keyframes; in-betweens + anim.json are written here")
    ap.add_argument("--image-script", type=Path, default=None,
                    help="path to generate_image.py (default: resolve from repo layout)")
    ap.add_argument("--states", default="all", help="comma list, or 'all'")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--quality", default="high")
    ap.add_argument("--force", action="store_true", help="regenerate frames even if they exist")
    ap.add_argument("--anim-only", action="store_true", help="skip generation; just (re)write anim.json")
    args = ap.parse_args(argv)

    fdir: Path = args.frames_dir
    script = args.image_script or (
        Path(__file__).resolve().parents[2] / "image-generate/scripts/generate_image.py"
    )
    if not script.exists():
        print(f"hatch: generate_image.py not found at {script}", file=sys.stderr)
        return 2

    want = set(STATES) if args.states == "all" else {s.strip() for s in args.states.split(",")}
    states = {k: v for k, v in STATES.items() if k in want}

    jobs: list[tuple] = []
    if not args.anim_only:
        for st, rec in states.items():
            kf = fdir / f"{st}.png"
            if not kf.exists():
                print(f"hatch: skip {st} — no keyframe {kf}", file=sys.stderr)
                continue
            for i, motion in enumerate(rec["motions"]):
                out = fdir / f"{st}.m{i}.png"
                if out.exists() and not args.force:
                    continue
                jobs.append((st, i, kf, out, motion))

    def run(job: tuple) -> bool:
        st, i, kf, out, motion = job
        cmd = [sys.executable, str(script), "--no-style", "--reference", str(kf),
               "--size", "1024x1024", "--quality", args.quality, "--out", str(out),
               "--prompt", PROMPT.format(motion=motion)]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=360)
        except subprocess.TimeoutExpired:
            print(f"hatch: {st}.m{i} TIMEOUT", file=sys.stderr)
            return False
        ok = r.returncode == 0 and out.exists()
        print(f"hatch: {st}.m{i} {'ok' if ok else 'FAIL'}")
        if not ok:
            print((r.stderr or "")[-400:], file=sys.stderr)
        return ok

    if jobs:
        print(f"hatch: generating {len(jobs)} in-between frames ({args.workers} workers)...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            list(ex.map(run, jobs))

    anim = build_anim(states)
    apath = fdir / "anim.json"
    if apath.exists():
        try:
            cur = json.loads(apath.read_text())
            cur.setdefault("states", {}).update(anim["states"])
            cur.setdefault("frameMs", anim["frameMs"])
            anim = cur
        except json.JSONDecodeError:
            pass
    apath.write_text(json.dumps(anim, indent=2))
    print(f"hatch: wrote {apath} ({len(anim['states'])} states)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
