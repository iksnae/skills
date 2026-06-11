// Design tokens from the repo DESIGN.md. The ONLY module allowed to
// carry hex literals (enforced by lint_remotion_spec.py --check-tokens).

export const BG = "#0a0a0a"; // page background — warm near-black
export const SURFACE = "#161616"; // panels, code blocks
export const TEXT = "#e8e8e8"; // primary labels
export const TEXT_DIM = "#a8a8a8"; // secondary labels, captions
export const TEXT_FAINT = "#727272"; // edges, dividers, tertiary
export const ACCENT = "#FFCC00"; // the brand signal — sparingly
export const RULE = "#2a2a2a"; // hairline borders

export const FONT_MONO =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// Motion presets — all timing via useCurrentFrame + interpolate + spring.
export const MOTION_GENTLE = { damping: 12, stiffness: 90 } as const;
export const MOTION_PUNCH = { damping: 18, stiffness: 200 } as const;
