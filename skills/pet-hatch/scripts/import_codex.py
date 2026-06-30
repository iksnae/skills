#!/usr/bin/env python3
"""Import a Codex pet atlas (8x9, 192x208 cells) into a familiar bundle.

Codex ships 9 presentational rows (idle, running-right/left, waving, jumping,
failed, waiting, running, review). familiar uses semantic states. This maps the
rows we can cover, upscales each cell to our cell size (nearest-neighbor, to keep
the pixel-art crisp), writes <state>.f<i>.png frames + anim.json (with Codex's
per-frame durations), and extracts a base.png (the idle rest pose) so the caller
can OPTIONALLY generate the states Codex doesn't provide (e.g. sleeping).

Prints JSON: {ok, base, missing:[...], generatable:[...], states:[...]}.
The caller decides whether to generate the missing states — never automatic.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    print(json.dumps({"ok": False, "error": f"Pillow required ({e})"}))
    sys.exit(2)

CW, CH = 192, 208                      # Codex cell
SCALE = 2                              # -> 384x416, matching strip.py cells

# Codex row index + frame count + per-frame durations (animation-rows.md).
ROWS = {
    "idle":          (0, 6, [280, 110, 110, 140, 140, 320]),
    "running-right": (1, 8, [120] * 7 + [220]),
    "running-left":  (2, 8, [120] * 7 + [220]),
    "waving":        (3, 4, [140, 140, 140, 280]),
    "jumping":       (4, 5, [140, 140, 140, 140, 280]),
    "failed":        (5, 8, [140] * 7 + [240]),
    "waiting":       (6, 6, [150, 150, 150, 150, 150, 260]),
    "running":       (7, 6, [120, 120, 120, 120, 120, 220]),
    "review":        (8, 6, [150, 150, 150, 150, 150, 280]),
}

# semantic state -> Codex row to source it from (None = no Codex coverage).
MAP = {
    "idle": "idle", "working": "running", "reviewing": "review",
    "awaiting-human": "waiting", "milestone": "jumping", "succeeded": "waving",
    "failed": "failed", "thinking": "review", "errored": "failed",
    "rate-limited": "waiting", "sleeping": None,
}
# Which missing states this skill can generate strips for (strip.py STATES).
GENERATABLE = {"sleeping", "thinking", "idle", "working", "reviewing",
               "awaiting-human", "milestone", "failed"}


def upscaled_cell(sheet: Image.Image, row: int, col: int) -> Image.Image:
    box = (col * CW, row * CH, col * CW + CW, row * CH + CH)
    cell = sheet.crop(box)
    return cell.resize((CW * SCALE, CH * SCALE), Image.NEAREST)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Import a Codex pet atlas into a familiar bundle.")
    ap.add_argument("--sheet", required=True, type=Path, help="Codex spritesheet (webp/png), 1536x1872")
    ap.add_argument("--frames-dir", required=True, type=Path, help="output frames dir")
    ap.add_argument("--base-out", type=Path, default=None, help="where to write the extracted base.png")
    args = ap.parse_args(argv)

    if not args.sheet.exists():
        print(json.dumps({"ok": False, "error": f"sheet not found: {args.sheet}"}))
        return 2
    sheet = Image.open(args.sheet).convert("RGBA")
    if sheet.size != (CW * 8, CH * 9):
        print(json.dumps({"ok": False, "error": f"unexpected sheet size {sheet.size}; expected {(CW*8, CH*9)}"}))
        return 2

    fdir: Path = args.frames_dir
    fdir.mkdir(parents=True, exist_ok=True)

    anim = {"frameMs": 180, "states": {}}
    missing: list[str] = []
    for state, rowname in MAP.items():
        if rowname is None:
            missing.append(state)
            continue
        row, n, durs = ROWS[rowname]
        names = []
        for i in range(n):
            cell = upscaled_cell(sheet, row, i)
            fn = f"{state}.f{i}.png"
            cell.save(fdir / fn)
            names.append(fn)
        anim["states"][state] = {"frames": names, "frameMs": durs[0], "durations": durs, "mode": "loop"}

    # Alias each missing state to idle (slowed) so the pet is complete even if
    # the caller chooses not to generate. Generation will overwrite these.
    if "idle" in anim["states"]:
        idle = anim["states"]["idle"]
        for state in missing:
            anim["states"][state] = {
                "frames": idle["frames"],
                "frameMs": idle["frameMs"] * 2,
                "durations": [d * 2 for d in idle["durations"]],
                "mode": "loop",
            }

    (fdir / "anim.json").write_text(json.dumps(anim, indent=2))

    # Extract the idle rest pose as a base for optional generation (on green,
    # so strip.py's chroma key works — composite the transparent cell onto green).
    base_path = args.base_out or (fdir.parent / "base.png")
    base_cell = upscaled_cell(sheet, 0, 0)
    green = Image.new("RGBA", base_cell.size, (0, 177, 64, 255))
    green.alpha_composite(base_cell)
    green.convert("RGB").save(base_path)

    print(json.dumps({
        "ok": True,
        "base": str(base_path),
        "missing": missing,
        "generatable": [s for s in missing if s in GENERATABLE],
        "states": list(anim["states"]),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
