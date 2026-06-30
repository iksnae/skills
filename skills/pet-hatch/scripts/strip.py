#!/usr/bin/env python3
"""pet-hatch strip — generate per-state animations as coherent sprite strips,
then extract frames with Codex hatch-pet's proven pipeline (ported verbatim).

Generation (our part): draw all of a state's frames together in ONE horizontal
strip, conditioned on the state's pose keyframe (identity + style) plus a layout
guide (frame count + slot centering). One coherent image keeps the body planted.

Extraction (Codex's part, faithful): chroma-key the strip to transparent, group
each frame's sprite by connected components (the N largest blobs as seeds,
ordered left-to-right, with stray bits attached to the nearest seed), then
`fit_to_cell` each group — crop to its alpha bbox, scale to fit (never upscale),
and bbox-center it in a transparent cell. This is exactly what
~/.codex/skills/hatch-pet/scripts/extract_strip_frames.py does; we follow it as
our proven base before adding anything of our own.

Output frames are transparent (Codex's format); the renderer composites them.
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
    from scipy import ndimage
except ImportError as e:
    print(f"strip: requires Pillow + numpy + scipy ({e})", file=sys.stderr)
    sys.exit(2)

CHROMA = (0, 177, 64)          # #00b140 — the strip background we key out
KEY_THRESHOLD = 120.0          # euclidean RGB distance to the key (Codex default 96; widened for our green)
OUT_W, OUT_H = 1536, 1024      # generation canvas (a supported wide gpt-image size)
# Codex's atlas cell is 192x208; we keep that aspect at 2x for retina crispness.
CELL_W, CELL_H = 384, 416
SAFE = 20                      # Codex's 10px safe border, at 2x

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
    rectangle, and dashed center crosshairs (Codex's layout-guide construction).
    Layout signal only — the prompt forbids reproducing it. Same overall aspect
    as the generation canvas so slots map straight onto the output grid."""
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
        for y in range(my, OUT_H - my, 24):
            draw.line((cx, y, cx, min(y + 12, OUT_H - my)), fill="#bbbbbb", width=2)
        for x in range(left + mx, right - mx, 24):
            draw.line((x, cy, min(x + 12, right - mx), cy), fill="#bbbbbb", width=2)
    img.save(path)


# --- Codex extract_strip_frames.py, ported ---

def remove_chroma(arr: np.ndarray) -> np.ndarray:
    """RGB strip -> RGBA with the chroma green keyed transparent, by euclidean
    distance to the key (Codex `remove_chroma_background`)."""
    diff = arr.astype(np.int32) - np.array(CHROMA, dtype=np.int32)
    dist = np.sqrt((diff * diff).sum(axis=-1))
    alpha = np.where(dist <= KEY_THRESHOLD, 0, 255).astype(np.uint8)
    return np.dstack([arr.astype(np.uint8), alpha])


def fit_to_cell(sprite: Image.Image) -> Image.Image:
    """Codex `fit_to_cell`: crop to the alpha bbox, scale to fit the cell minus a
    safe border (never upscale), then bbox-center in a transparent cell."""
    bbox = sprite.getbbox()
    target = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    if bbox is None:
        return target
    sp = sprite.crop(bbox)
    scale = min((CELL_W - SAFE) / sp.width, (CELL_H - SAFE) / sp.height, 1.0)
    if scale != 1.0:
        sp = sp.resize((max(1, round(sp.width * scale)), max(1, round(sp.height * scale))), Image.LANCZOS)
    left = (CELL_W - sp.width) // 2
    top = (CELL_H - sp.height) // 2
    target.alpha_composite(sp, (left, top))
    return target


def group_image(rgba: np.ndarray, lbl: np.ndarray, ids: list[int], pad: int = 8) -> Image.Image:
    """Crop the union bbox of a component group (Codex `component_group_image`),
    keeping only the group's pixels (everything else transparent)."""
    gmask = np.isin(lbl, ids)
    ys, xs = np.where(gmask)
    l = max(0, int(xs.min()) - pad)
    t = max(0, int(ys.min()) - pad)
    r = min(rgba.shape[1], int(xs.max()) + 1 + pad)
    b = min(rgba.shape[0], int(ys.max()) + 1 + pad)
    sub = np.zeros((b - t, r - l, 4), dtype=np.uint8)
    gm = gmask[t:b, l:r]
    sub[gm] = rgba[t:b, l:r][gm]
    return Image.fromarray(sub, "RGBA")


def slice_strip(strip: Image.Image, frames: int) -> list[Image.Image]:
    """Faithful Codex extraction: chroma-key to transparent, group each frame by
    connected components (N largest as seeds left-to-right, strays attached to
    the nearest seed), then fit_to_cell each group. Falls back to equal slots if
    fewer than N blobs are found."""
    strip = strip.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
    rgba = remove_chroma(np.asarray(strip))
    src = Image.fromarray(rgba, "RGBA")
    fg = rgba[..., 3] > 16
    lbl, n = ndimage.label(fg)
    if n == 0:
        return [Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0)) for _ in range(frames)]

    counts = np.bincount(lbl.ravel())
    ids = list(range(1, n + 1))
    largest = int(counts[1:].max())
    cents = ndimage.center_of_mass(fg, lbl, ids)
    cx = {i: cents[k][1] for k, i in enumerate(ids)}

    seed_thr = max(120, largest * 0.20)
    seeds = [i for i in ids if counts[i] >= seed_thr]
    if len(seeds) < frames:
        seeds = sorted(ids, key=lambda i: -counts[i])[:frames]
    if len(seeds) < frames:                               # blobs merged — equal-slot fallback
        return [fit_to_cell(src.crop((round(i * OUT_W / frames), 0,
                                      round((i + 1) * OUT_W / frames), OUT_H)))
                for i in range(frames)]
    seeds = sorted(sorted(seeds, key=lambda i: -counts[i])[:frames], key=lambda i: cx[i])

    seed_set = set(seeds)
    groups = {s: [s] for s in seeds}
    noise = max(12, largest * 0.002)
    for i in ids:
        if i in seed_set or counts[i] < noise:
            continue
        j = min(seeds, key=lambda s: abs(cx[s] - cx[i]))
        groups[j].append(i)

    return [fit_to_cell(group_image(rgba, lbl, groups[s])) for s in seeds]


def write_frames(state: str, fdir: Path, strip_img: Image.Image, n: int) -> None:
    for i, im in enumerate(slice_strip(strip_img, n)):
        im.save(fdir / f"{state}.f{i}.png")


def run_state(state: str, fdir: Path, image_script: Path, quality: str,
              force: bool, reslice: bool) -> bool:
    rec = STATES[state]
    n = rec["frames"]
    raw_strip = fdir / f"{state}.strip.png"

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
