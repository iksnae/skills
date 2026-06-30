#!/usr/bin/env python3
"""pet-hatch pack — compose discrete per-state frames into one sprite sheet.

Reads a frames dir's anim.json, collects every frame it references, optionally
registers each frame to a common center (kills the position drift that makes
image-to-image frames jitter when cycled), downscales to a square tile, and
packs them into a single sheet.png plus a sheet.json mapping each frame *name*
to its {x,y,w,h} rect.

The manifest (anim.json) stays the semantic source of truth — it still lists
named frames per state; the sheet + atlas are a *derived* renderer bundle (a
single decode, GPU-friendly, portable/Codex-exportable). A renderer that finds
sheet.json crops from the sheet; one that doesn't falls back to the discrete
PNGs. Frames keep their flat chroma green; the renderer keys it transparent.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(f"pack: requires Pillow + numpy ({e})", file=sys.stderr)
    sys.exit(2)

GREEN = (0, 177, 64)  # #00b140 — matches the renderer's chroma key


def referenced_frames(anim: dict) -> list[str]:
    """Every distinct frame file the manifest references, in stable order."""
    seen: dict[str, None] = {}
    for st in anim.get("states", {}).values():
        for f in st.get("frames", []):
            seen.setdefault(f, None)
    return sorted(seen)


def content_center(img: Image.Image) -> tuple[int, int]:
    """Center of the non-green content's bounding box (image px, top-left origin)."""
    a = np.asarray(img, dtype=np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    is_green = (g > 90) & (g > r + 40) & (g > b + 40)
    ys, xs = np.where(~is_green)
    if xs.size == 0:
        return img.width // 2, img.height // 2
    return (int(xs.min()) + int(xs.max())) // 2, (int(ys.min()) + int(ys.max())) // 2


def register(img: Image.Image) -> Image.Image:
    """Translate the frame so its content bbox center sits at the image center,
    padding exposed edges with chroma green. Removes the per-frame position
    drift that reads as jitter; preserves each pose's natural scale."""
    cx, cy = content_center(img)
    dx, dy = img.width // 2 - cx, img.height // 2 - cy
    if dx == 0 and dy == 0:
        return img
    canvas = Image.new("RGB", img.size, GREEN)
    canvas.paste(img, (dx, dy))
    return canvas


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pack per-state frames into a sprite sheet + atlas.")
    ap.add_argument("--frames-dir", required=True, type=Path,
                    help="dir holding anim.json + the discrete <state>*.png frames")
    ap.add_argument("--tile", type=int, default=512,
                    help="square tile size in the sheet (px); 512 stays crisp on retina")
    ap.add_argument("--no-register", action="store_true",
                    help="skip center-registration (keep raw frame positions)")
    ap.add_argument("--sheet", default="sheet.png", help="output sheet filename (in frames-dir)")
    ap.add_argument("--atlas", default="sheet.json", help="output atlas filename (in frames-dir)")
    args = ap.parse_args(argv)

    fdir: Path = args.frames_dir
    anim_path = fdir / "anim.json"
    if not anim_path.exists():
        print(f"pack: no anim.json in {fdir}", file=sys.stderr)
        return 2
    anim = json.loads(anim_path.read_text())
    frames = referenced_frames(anim)
    if not frames:
        print("pack: anim.json references no frames", file=sys.stderr)
        return 2

    tile = args.tile
    cols = math.ceil(math.sqrt(len(frames)))
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGB", (cols * tile, rows * tile), GREEN)
    atlas: dict[str, dict] = {}

    missing = 0
    for i, name in enumerate(frames):
        p = fdir / name
        if not p.exists():
            print(f"pack: skip missing frame {name}", file=sys.stderr)
            missing += 1
            continue
        img = Image.open(p).convert("RGB")
        if not args.no_register:
            img = register(img)
        img = img.resize((tile, tile), Image.LANCZOS)
        x, y = (i % cols) * tile, (i // cols) * tile
        sheet.paste(img, (x, y))
        atlas[name] = {"x": x, "y": y, "w": tile, "h": tile}

    sheet_path = fdir / args.sheet
    sheet.save(sheet_path)
    (fdir / args.atlas).write_text(json.dumps({"tile": tile, "frames": atlas}, indent=2))
    reg = "registered" if not args.no_register else "raw"
    print(f"pack: wrote {sheet_path} ({cols}x{rows} grid, {tile}px {reg} tiles, "
          f"{len(atlas)} frames{f', {missing} missing' if missing else ''})")
    print(f"pack: wrote {fdir / args.atlas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
