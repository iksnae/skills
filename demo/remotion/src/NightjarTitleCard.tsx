import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ACCENT, BG, FONT_MONO, MOTION_GENTLE, TEXT } from "./brand";

// BEATS — lifted verbatim from docs/demos/nightjar-title-card.spec.md.
const BEATS = {
  // Scene 1 — entrance (frames 0–60)
  CANVAS_IN: 0,
  WORDMARK_FADE_START: 6,
  WORDMARK_FADE_MID: 22,
  WORDMARK_FADE_END: 36,
  ACCENT_RULE_START: 42,
  ACCENT_RULE_END: 54,
  // Scene 2 — hold (frames 60–120)
  HOLD_START: 60,
  HOLD_BREATH_IN: 75,
  HOLD_MID: 90,
  HOLD_BREATH_OUT: 105,
  HOLD_STEADY: 114,
  HOLD_END: 119,
  // Scene 3 — settle (frames 120–150)
  SETTLE_START: 120,
  SETTLE_MID: 134,
  SETTLE_END: 149,
} as const;

const RULE_FULL_WIDTH = 480;

type WordmarkProps = { frame: number; opacity: number };

const Wordmark: React.FC<WordmarkProps> = ({ opacity }) => (
  <div
    style={{
      fontFamily: FONT_MONO,
      fontSize: 120,
      fontWeight: 500,
      letterSpacing: "0.04em",
      color: TEXT,
      opacity,
    }}
  >
    nightjar
  </div>
);

type AccentRuleProps = { frame: number; width: number };

const AccentRule: React.FC<AccentRuleProps> = ({ width }) => (
  <div
    style={{
      height: 2,
      width,
      backgroundColor: ACCENT,
      alignSelf: "flex-start",
      marginTop: 28,
    }}
  />
);

export const NightjarTitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene 1 — entrance. MOTION_GENTLE spring fade; full opacity by ~frame 36.
  const wordmarkOpacity = spring({
    frame: frame - BEATS.WORDMARK_FADE_START,
    fps,
    config: MOTION_GENTLE,
  });

  // Accent rule draws left-to-right between frames 42 and 54, then rests.
  const ruleWidth = interpolate(
    frame,
    [BEATS.ACCENT_RULE_START, BEATS.ACCENT_RULE_END],
    [0, RULE_FULL_WIDTH],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Scene 2 — hold. A near-imperceptible settle: nothing moves more
  // than a pixel. Scene 3 — settle: static (breath clamps back to 0).
  const breathY = interpolate(
    frame,
    [
      BEATS.HOLD_START,
      BEATS.HOLD_BREATH_IN,
      BEATS.HOLD_MID,
      BEATS.HOLD_BREATH_OUT,
      BEATS.HOLD_STEADY,
    ],
    [0, -1, -1, 0, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            transform: `translateY(${breathY}px)`,
          }}
        >
          <Wordmark frame={frame} opacity={wordmarkOpacity} />
          <AccentRule frame={frame} width={ruleWidth} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
