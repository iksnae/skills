import React from "react";
import { Composition } from "remotion";
import { NightjarTitleCard } from "./NightjarTitleCard";
import { NightjarLaunchCard } from "./NightjarLaunchCard";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="NightjarTitleCard"
        component={NightjarTitleCard}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="NightjarLaunchCard"
        component={NightjarLaunchCard}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
