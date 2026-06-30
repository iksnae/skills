#!/usr/bin/env python3
"""pet-hatch pack — compose discrete per-state frames into one sprite sheet.

Reads a frames dir's anim.json, collects every frame it references, downscales
each to a square tile, and packs them into a single sheet.png plus a sheet.json
that maps each frame *name* to its {x,y,w,h} rect.

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
except ImportError:
    print("pack: Pillow required — pip install Pillow", file=sys.stderr)
    sys.exit(2)

GREEN = (0, 177, 64)  # #00b140 — matches the renderer's chroma key


def referenced_frames(anim: dict) -> list[str]:
    """Every distinct frame file the manifest references, in stable order."""
    seen: dict[str, None] = {}
    for st in anim.get("states", {}).values():
        for f in st.get("frames", []):
            seen.setdefault(f, None)
    return sorted(seen)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pack per-state frames into a sprite sheet + atlas.")
    ap.add_argument("--frames-dir", required=True, type=Path,
                    help="dir holding anim.json + the discrete <state>*.png frames")
    ap.add_argument("--tile", type=int, default=256, help="square tile size in the sheet (px)")
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
        x, y = (i % cols) * tile, (i // cols) * tile
        img = Image.open(p).convert("RGB").resize((tile, tile), Image.LANCZOS)
        sheet.paste(img, (x, y))
        atlas[name] = {"x": x, "y": y, "w": tile, "h": tile}

    sheet_path = fdir / args.sheet
    sheet.save(sheet_path)
    (fdir / args.atlas).write_text(json.dumps({"tile": tile, "frames": atlas}, indent=2))
    print(f"pack: wrote {sheet_path} ({cols}x{rows} grid, {tile}px tiles, "
          f"{len(atlas)} frames{f', {missing} missing' if missing else ''})")
    print(f"pack: wrote {fdir / args.atlas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
