#!/usr/bin/env python3
"""pet-hatch pack — compose the per-state frames into one sprite sheet + atlas.

Reads a frames dir's anim.json, collects every frame it references, and grid-
packs them into a single transparent sheet.png plus a sheet.json mapping each
frame name to its {x,y,w,h} rect. Frames come from strip.py already framed by
Codex's fit_to_cell (uniform transparent cells), so packing just lays them out
at native size — no resampling, no recentering.

The manifest (anim.json) stays the semantic source of truth; the sheet + atlas
are a derived, swappable renderer bundle (one decode, portable/Codex-exportable).
A renderer that finds sheet.json crops from the sheet; one that doesn't loads
the discrete PNGs.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    print(f"pack: requires Pillow ({e})", file=sys.stderr)
    sys.exit(2)


def referenced_frames(anim: dict) -> list[str]:
    seen: dict[str, None] = {}
    for st in anim.get("states", {}).values():
        for f in st.get("frames", []):
            seen.setdefault(f, None)
    return sorted(seen)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pack per-state frames into a sprite sheet + atlas.")
    ap.add_argument("--frames-dir", required=True, type=Path,
                    help="dir holding anim.json + the discrete <state>.f*.png frames")
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

    imgs: dict[str, Image.Image] = {}
    for name in frames:
        p = fdir / name
        if p.exists():
            imgs[name] = Image.open(p).convert("RGBA")
    if not imgs:
        print("pack: no frame files found", file=sys.stderr)
        return 2

    tw = max(im.width for im in imgs.values())
    th = max(im.height for im in imgs.values())
    cols = math.ceil(math.sqrt(len(imgs)))
    rows = math.ceil(len(imgs) / cols)
    sheet = Image.new("RGBA", (cols * tw, rows * th), (0, 0, 0, 0))
    atlas: dict[str, dict] = {}

    for i, (name, im) in enumerate(imgs.items()):
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.alpha_composite(im, (x, y))
        atlas[name] = {"x": x, "y": y, "w": im.width, "h": im.height}

    sheet_path = fdir / args.sheet
    sheet.save(sheet_path)
    (fdir / args.atlas).write_text(json.dumps({"tile": [tw, th], "frames": atlas}, indent=2))
    print(f"pack: wrote {sheet_path} ({cols}x{rows} grid, {tw}x{th} transparent cells, {len(atlas)} frames)")
    print(f"pack: wrote {fdir / args.atlas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
