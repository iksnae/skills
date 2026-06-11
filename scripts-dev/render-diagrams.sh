#!/usr/bin/env bash
# Render docs/assets/src/*.mmd -> docs/assets/<name>.svg + .png
# Brand: #FFCC00 on #0a0a0a (see DESIGN.md). Theme: docs/assets/mermaid-theme.json
set -euo pipefail
cd "$(dirname "$0")/.."

THEME=docs/assets/mermaid-theme.json
for src in docs/assets/src/*.mmd; do
  name=$(basename "$src" .mmd)
  npx -y @mermaid-js/mermaid-cli -i "$src" -o "docs/assets/$name.svg" \
    -c "$THEME" -b '#0a0a0a' --quiet
  npx -y @mermaid-js/mermaid-cli -i "$src" -o "docs/assets/$name.png" \
    -c "$THEME" -b '#0a0a0a' -s 2 --quiet
  echo "rendered $name"
done
