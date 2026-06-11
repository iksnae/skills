import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ACCENT,
  BG,
  FONT_MONO,
  MOTION_GENTLE,
  TEXT,
  TEXT_DIM,
} from "./brand";

// BEATS — launch card, 180 frames @ 30fps (6s).
// Scene 1: wordmark (0–60). Scene 2: hero reveal (60–140).
// Scene 3: closing tag (140–180).
const BEATS = {
  // Scene 1 — wordmark
  CANVAS_IN: 0,
  WORDMARK_FADE_START: 6,
  WORDMARK_FADE_END: 36,
  WORDMARK_RULE_START: 38,
  WORDMARK_RULE_END: 50,
  WORDMARK_EXIT_START: 52,
  WORDMARK_EXIT_END: 60,
  // Scene 2 — hero reveal
  HERO_IN_START: 60,
  HERO_FADE_END: 78,
  HERO_RULE_START: 92,
  HERO_RULE_END: 106,
  HERO_HOLD_END: 130,
  HERO_EXIT_END: 140,
  // Scene 3 — closing tag
  TAG_FADE_START: 144,
  TAG_FADE_END: 162,
  TAG_HOLD_END: 179,
} as const;

const RULE_FULL_WIDTH = 480;
const HERO_WIDTH = 1280;

export const NightjarLaunchCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene 1 — wordmark in (MOTION_GENTLE), rule draws, then exits.
  const wordmarkIn = spring({
    frame: frame - BEATS.WORDMARK_FADE_START,
    fps,
    config: MOTION_GENTLE,
  });
  const wordmarkExit = interpolate(
    frame,
    [BEATS.WORDMARK_EXIT_START, BEATS.WORDMARK_EXIT_END],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const wordmarkOpacity = wordmarkIn * wordmarkExit;
  const wordmarkRuleWidth =
    interpolate(
      frame,
      [BEATS.WORDMARK_RULE_START, BEATS.WORDMARK_RULE_END],
      [0, RULE_FULL_WIDTH],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    ) * wordmarkExit;

  // Scene 2 — hero still revealed with a gentle spring scale-in.
  const heroSpring = spring({
    frame: frame - BEATS.HERO_IN_START,
    fps,
    config: MOTION_GENTLE,
  });
  const heroScale = interpolate(heroSpring, [0, 1], [0.94, 1]);
  const heroFade = interpolate(
    frame,
    [BEATS.HERO_IN_START, BEATS.HERO_FADE_END],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const heroExit = interpolate(
    frame,
    [BEATS.HERO_HOLD_END, BEATS.HERO_EXIT_END],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const heroOpacity = heroFade * heroExit;
  const heroRuleWidth =
    interpolate(
      frame,
      [BEATS.HERO_RULE_START, BEATS.HERO_RULE_END],
      [0, HERO_WIDTH],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    ) * heroExit;

  // Scene 3 — closing tag.
  const tagOpacity = interpolate(
    frame,
    [BEATS.TAG_FADE_START, BEATS.TAG_FADE_END],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Scene 1 — wordmark */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            opacity: wordmarkOpacity,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 120,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: TEXT,
            }}
          >
            nightjar
          </div>
          <div
            style={{
              height: 2,
              width: wordmarkRuleWidth,
              backgroundColor: ACCENT,
              marginTop: 28,
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Scene 2 — hero still + accent rule */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: heroOpacity,
            transform: `scale(${heroScale})`,
          }}
        >
          <Img
            src={staticFile("hero-nightjar.png")}
            style={{
              width: HERO_WIDTH,
              display: "block",
            }}
          />
          <div
            style={{
              height: 2,
              width: heroRuleWidth,
              backgroundColor: ACCENT,
              marginTop: 24,
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Scene 3 — closing tag */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: tagOpacity,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 72,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: TEXT,
            }}
          >
            iksnae<span style={{ color: ACCENT }}>/</span>skills
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 28,
              marginTop: 20,
              color: TEXT_DIM,
            }}
          >
            media skills, dogfooded
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
