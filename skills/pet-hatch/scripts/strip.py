#!/usr/bin/env python3
"""pet-hatch strip — generate per-state animations as coherent sprite strips.

This is the registration-by-construction approach Codex's hatch-pet uses, and
it fixes the jitter that independent per-frame image-to-image generation causes:
instead of generating each in-between frame on its own (so the character drifts
in position between frames), it asks the image model to draw ALL frames of a
state in ONE horizontal strip, anchored to a layout-guide image that fixes the
frame count, spacing, and centering. Because the whole strip is one coherent
image, the body stays planted across frames and only the intended part moves
(e.g. the eyes blink) — no post-hoc re-centering that would shove the body.

Per state it:
  1. builds a layout guide (N equal slots, safe-area + center crosshairs),
  2. calls generate_image.py with TWO inputs — the state's pose keyframe
     (identity + style + pose) and the guide (layout only) — at a wide size,
  3. slices the returned strip into N frames, cropping+centering each on its
     non-green bounding box (stable within a loop, so it doesn't move the body),
  4. writes <state>.f{i}.png frames (flat green, like the rest of the bundle)
     and updates anim.json.

Frames stay on flat chroma green; the renderer keys them transparent. Grounded
in ~/.codex/skills/hatch-pet (strip generation + layout guides) but keeps our
SEMANTIC state vocabulary and green-screen/anim.json bundle.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
    import numpy as np
except ImportError as e:
    print(f"strip: requires Pillow + numpy ({e})", file=sys.stderr)
    sys.exit(2)

GREEN = (0, 177, 64)           # #00b140 — the bundle's chroma key
OUT_W, OUT_H = 1536, 1024      # generation canvas (a supported wide gpt-image size)
CELL = 512                     # square output frame, crisp on retina
CELL_PAD = 18                  # safe border kept clear inside each frame

# Per-state recipe: frame count, loop timing, the animation "purpose" line, and
# state-specific requirements that keep the body PLANTED (only the intended part
# moves). Frames play in order and loop; each strip is authored as one cycle.
STATES: dict[str, dict] = {
    "idle": {"frames": 6, "frameMs": 200, "purpose": "calm idle breathing and blinking loop", "req": [
        "Keep the fox in the exact same seated pose, facing, and silhouette in every frame.",
        "Only subtle motion: gentle breathing and a tiny blink (eyes close on one or two middle frames), maybe a very slight head bob.",
        "Feet and body stay planted — do NOT shift the fox left/right or up/down between frames.",
        "The first and last frames look nearly identical so the loop does not pop."]},
    "thinking": {"frames": 5, "frameMs": 230, "purpose": "pondering loop", "req": [
        "The fox stays seated and planted; only the ears flick and the eyes glance up and around, one paw drifting near the chin.",
        "No travel; the body stays centered in place."]},
    "working": {"frames": 6, "frameMs": 130, "purpose": "busy working loop", "req": [
        "The fox stays planted and centered; the front paws move up and down as if busily working at something.",
        "No travel; the body does not move across the frame."]},
    "reviewing": {"frames": 5, "frameMs": 280, "purpose": "close inspecting and scrutinizing loop", "req": [
        "The fox stays planted; the head tilts side to side and one brow raises as it scrutinizes closely, a paw near the chin.",
        "No travel."]},
    "awaiting-human": {"frames": 4, "frameMs": 220, "purpose": "eager expectant waiting loop", "req": [
        "The fox stays planted, sitting up; the ears perk and the head tilts, eager and expectant.",
        "No travel."]},
    "milestone": {"frames": 5, "frameMs": 150, "purpose": "happy celebration loop", "req": [
        "The fox celebrates in place: paws raised, eyes bright, mouth open in a cheer, with a small joyful bounce.",
        "Stay roughly centered — a small bounce is fine but do not travel off-frame."]},
    "failed": {"frames": 5, "frameMs": 240, "purpose": "sad disappointed loop", "req": [
        "The fox stays planted, ears drooping; a small sniffle and a single teardrop that TOUCHES the face at one eye.",
        "No detached droplets and no travel."]},
    "sleeping": {"frames": 4, "frameMs": 340, "purpose": "peaceful sleeping loop", "req": [
        "The fox stays curled up asleep in place; only slow breathing — the body rises and falls a little.",
        "Eyes stay closed; no travel."]},
}

PROMPT = """Create a single horizontal sprite strip of the SAME fox character — the small amber cartoon fox in the attached reference image — in the "{state}" state.

Use the FIRST attached image as the canonical fox: identity, pose, palette, and art style. Use the SECOND attached image as a LAYOUT GUIDE ONLY — it shows {frames} equal frame slots; follow its slot count, even spacing, centering, and safe padding. Do NOT copy the guide's boxes, lines, crosshairs, colors, or background into the output.

Identity & style lock:
- Do not redesign the fox. Keep the exact same head shape, ears, snout, markings, amber/cream/brown palette, clean dark outline, flat cel shading, body proportions, and overall silhouette in every frame.
- It is the same individual fox in every frame, never a related variant.
- Flat cel-shaded cartoon style exactly like the reference: no pixel-art, no painterly rendering, no gradients, no texture, no new props.

Output exactly {frames} animation frames arranged left-to-right in one single row, evenly spread across the full width, one complete fox centered in each slot, none crossing into a neighbor.

Animation: {purpose}.
{requirements}

Background & cleanup:
- Use a perfectly flat pure chroma green (#00b140) background across the whole image — the same green as the reference.
- No shadows, reflections, glows, motion lines, speed lines, smears, dust, sparkles, or floating effects. No green or near-green anywhere on the fox itself.
- No visible grid, borders, labels, numbers, text, or scenery.
- Keep each frame self-contained with safe padding; never clip any body part at a slot edge.
- Clear readable poses, no motion blur. Preserve the same silhouette, face, proportions, and palette across every frame."""


def build_layout_guide(frames: int, path: Path) -> None:
    """A light guide: N equal slots, each with an outer box, an inset safe-area
    rectangle, and dashed center crosshairs. Layout signal only — the prompt
    forbids reproducing it. Same overall aspect as the generation canvas so the
    slots map straight onto the output grid."""
    img = Image.new("RGB", (OUT_W, OUT_H), "#f7f7f7")
    draw = ImageDraw.Draw(img)
    cw = OUT_W / frames
    mx, my = 36, 40
    for i in range(frames):
        left = round(i * cw)
        right = round((i + 1) * cw) - 1
        draw.rectangle((left, 0, right, OUT_H - 1), outline="#111111", width=3)
        draw.rectangle((left + mx, my, right - mx, OUT_H - 1 - my), outline="#2f80ed", width=3)
        cx = (left + right) // 2
        cy = OUT_H // 2
        for y in range(my, OUT_H - my, 24):           # dashed vertical centerline
            draw.line((cx, y, cx, min(y + 12, OUT_H - my)), fill="#bbbbbb", width=2)
        for x in range(left + mx, right - mx, 24):    # dashed horizontal centerline
            draw.line((x, cy, min(x + 12, right - mx), cy), fill="#bbbbbb", width=2)
    img.save(path)


def non_green_bbox(rgb: np.ndarray):
    """Bounding box (l, t, r, b) of the non-green (fox) pixels, or None."""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    is_green = (g > 90) & (g > r + 40) & (g > b + 40)
    ys, xs = np.where(~is_green)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def slice_strip(strip: Image.Image, frames: int) -> list[Image.Image]:
    """Split the strip into N equal columns and cut every frame with ONE shared
    crop window, scale, and paste offset — so cropping can never shift the body
    between frames. (Per-frame bbox-centering, as Codex's fit_to_cell does,
    slides the body whenever the silhouette extent changes — a tail flick or a
    raised paw moves the bbox center; in a large cell that re-centering reads as
    horizontal sliding. A shared window preserves exactly where the model drew
    each frame, which the coherent strip keeps planted.)

    The shared window is the UNION of every frame's non-green bbox in slot-local
    coordinates, so it contains the fox in every frame while trimming the common
    margin identically."""
    strip = strip.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
    arr = np.asarray(strip)
    # Inset each slot to drop any thin frame-divider line the model draws at a
    # slot boundary (it survives as a dark sliver otherwise — not green, so the
    # renderer's chroma key won't remove it). Safe padding keeps the fox clear.
    mx = max(10, round(OUT_W / frames * 0.05))
    my = 12
    slots = [arr[my:OUT_H - my, round(i * OUT_W / frames) + mx: round((i + 1) * OUT_W / frames) - mx, :]
             for i in range(frames)]

    # Shared crop window = union of every frame's non-green bbox (slot-local).
    union = None
    for s in slots:
        bb = non_green_bbox(s)
        if bb is None:
            continue
        union = bb if union is None else (
            min(union[0], bb[0]), min(union[1], bb[1]),
            max(union[2], bb[2]), max(union[3], bb[3]))
    if union is None:
        return [Image.new("RGB", (CELL, CELL), GREEN) for _ in slots]

    l, t, r, b = union
    cw, ch = r - l, b - t
    avail = CELL - 2 * CELL_PAD
    scale = min(avail / cw, avail / ch, 1.0)
    w, h = max(1, round(cw * scale)), max(1, round(ch * scale))
    off = ((CELL - w) // 2, (CELL - h) // 2)            # one offset for every frame

    out: list[Image.Image] = []
    for s in slots:
        crop = Image.fromarray(s[t:b, l:r, :])           # identical window every frame
        sprite = crop.resize((w, h), Image.LANCZOS)
        cell = Image.new("RGB", (CELL, CELL), GREEN)
        cell.paste(sprite, off)
        out.append(cell)
    return out


def write_frames(state: str, fdir: Path, strip_img: Image.Image, n: int) -> None:
    for i, im in enumerate(slice_strip(strip_img, n)):
        im.save(fdir / f"{state}.f{i}.png")


def run_state(state: str, fdir: Path, image_script: Path, quality: str,
              force: bool, reslice: bool) -> bool:
    rec = STATES[state]
    n = rec["frames"]
    raw_strip = fdir / f"{state}.strip.png"

    # Re-slice an already-generated strip (free; no image call).
    if reslice:
        if not raw_strip.exists():
            print(f"strip: {state} — no saved strip to reslice ({raw_strip})", file=sys.stderr)
            return False
        write_frames(state, fdir, Image.open(raw_strip), n)
        print(f"strip: {state} resliced — {n} frames")
        return True

    pose_ref = fdir / f"{state}.png"
    if not pose_ref.exists():
        print(f"strip: skip {state} — no pose keyframe {pose_ref}", file=sys.stderr)
        return False
    if raw_strip.exists() and not force:
        print(f"strip: {state} already generated; reslicing (use --force to regenerate)")
        write_frames(state, fdir, Image.open(raw_strip), n)
        return True

    with tempfile.TemporaryDirectory(prefix="strip-") as td:
        guide = Path(td) / f"{state}-guide.png"
        strip_out = Path(td) / f"{state}-strip.png"
        build_layout_guide(n, guide)
        prompt = PROMPT.format(
            state=state, frames=n, purpose=rec["purpose"],
            requirements="\n".join("- " + r for r in rec["req"]),
        )
        cmd = [sys.executable, str(image_script), "--no-style",
               "--reference", str(pose_ref), "--reference", str(guide),
               "--size", f"{OUT_W}x{OUT_H}", "--quality", quality,
               "--out", str(strip_out), "--prompt", prompt]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=420)
        except subprocess.TimeoutExpired:
            print(f"strip: {state} TIMEOUT", file=sys.stderr)
            return False
        if r.returncode != 0 or not strip_out.exists():
            print(f"strip: {state} FAIL\n{(r.stderr or '')[-500:]}", file=sys.stderr)
            return False
        # Persist the raw strip so future slicing changes need no regeneration.
        Image.open(strip_out).convert("RGB").save(raw_strip)

    write_frames(state, fdir, Image.open(raw_strip), n)
    print(f"strip: {state} ok — {n} frames")
    return True


def merge_anim(fdir: Path, states: list[str]) -> None:
    apath = fdir / "anim.json"
    anim = {"frameMs": 160, "states": {}}
    if apath.exists():
        try:
            anim = json.loads(apath.read_text())
        except json.JSONDecodeError:
            pass
    anim.setdefault("states", {})
    for st in states:
        rec = STATES[st]
        anim["states"][st] = {
            "frames": [f"{st}.f{i}.png" for i in range(rec["frames"])],
            "frameMs": rec["frameMs"],
            "mode": "loop",
        }
    apath.write_text(json.dumps(anim, indent=2))
    print(f"strip: wrote {apath} ({len(anim['states'])} states)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate per-state sprite strips and slice them into frames.")
    ap.add_argument("--frames-dir", required=True, type=Path)
    ap.add_argument("--image-script", type=Path, default=None)
    ap.add_argument("--states", default="all", help="comma list, or 'all'")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--quality", default="high")
    ap.add_argument("--force", action="store_true", help="regenerate strips even if saved")
    ap.add_argument("--reslice", action="store_true",
                    help="re-cut frames from saved <state>.strip.png (no image generation)")
    ap.add_argument("--anim-only", action="store_true", help="rewrite anim.json without generating")
    args = ap.parse_args(argv)

    fdir: Path = args.frames_dir
    script = args.image_script or (
        Path(__file__).resolve().parents[2] / "image-generate/scripts/generate_image.py"
    )
    if not script.exists():
        print(f"strip: generate_image.py not found at {script}", file=sys.stderr)
        return 2

    want = list(STATES) if args.states == "all" else [s.strip() for s in args.states.split(",")]
    want = [s for s in want if s in STATES]

    if not args.anim_only:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            list(ex.map(lambda st: run_state(st, fdir, script, args.quality,
                                             args.force, args.reslice), want))

    merge_anim(fdir, want)
    return 0


if __name__ == "__main__":
    sys.exit(main())
