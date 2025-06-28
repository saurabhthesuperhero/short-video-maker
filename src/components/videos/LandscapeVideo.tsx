/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  Img,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";
import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils";

const { fontFamily } = loadFont(); // "Barlow Condensed"

export const LandscapeVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
                                                                             scenes,
                                                                             music,
                                                                             config,
                                                                           }) => {
  const globalFrame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const captionBg = config.captionBackgroundColor ?? "#cda900";
  const activeStyle: React.CSSProperties = {
    backgroundColor: captionBg,
    color: "white",
    padding: "10px 15px",
    marginLeft: "-15px",
    marginRight: "-15px",
    borderRadius: "10px",
    display: "inline-block",
  };
  const captionPosition = config.captionPosition ?? "center";
  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  // Get ALL captions from ALL scenes into one master list.
  const allCaptions = scenes.flatMap((s) => s.captions);
  const captionPages = createCaptionPages({
    captions: allCaptions,
    lineMaxLength: 40, // Increased for landscape
    lineCount: 2,
    maxDistanceMs: 1000,
  });

  // Find the one voice-over audio track.
  const voiceOverAudio = scenes.find((s) => s.audio.url)?.audio;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Layer 1: Background Music */}
      {music?.url && (
        <Audio
          loop
          src={music.url}
          startFrom={music.start * fps}
          endAt={music.end * fps}
          volume={() => musicVolume}
          muted={musicMuted}
        />
      )}

      {/* Layer 2: Voice-over Audio (plays once, continuously) */}
      {voiceOverAudio?.url && <Audio src={voiceOverAudio.url} />}

      {/* Layer 3: Visuals */}
      {scenes.map((scene, sceneIdx) => {
        const { audio, video: visualUrl } = scene;
        const TRANSITION_FRAMES = Math.round(0.3 * fps);

        // Correctly calculate start time by summing durations of all previous scenes
        const sceneStart = scenes
          .slice(0, sceneIdx)
          .reduce((acc, s) => acc + Math.round(s.audio.duration * fps), 0);
        let sceneFrames = Math.round(audio.duration * fps);

        if (config.paddingBack && sceneIdx === scenes.length - 1) {
          sceneFrames += Math.round((config.paddingBack / 1000) * fps);
        }

        const frame = globalFrame - sceneStart;
        const isLastScene = sceneIdx === scenes.length - 1;

        const opacity = interpolate(
          frame,
          [0, TRANSITION_FRAMES, sceneFrames - TRANSITION_FRAMES, sceneFrames],
          [0, 1, 1, isLastScene ? 1 : 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        // Animation logic for Ken Burns effect on static images
        const isStatic = !visualUrl.endsWith(".mp4");
        let transform = "";
        if (isStatic) {
          const zoomDirection = sceneIdx % 2 === 0 ? 1.0 : 1.15;
          const panDirection = sceneIdx % 4; // 0: left, 1: right, 2: up, 3: down
          const zoom = interpolate(
            frame,
            [0, sceneFrames],
            [zoomDirection, 1.15 / zoomDirection],
          );
          const xPan = panDirection === 0 ? -5 : panDirection === 1 ? 5 : 0;
          const yPan = panDirection === 2 ? -5 : panDirection === 3 ? 5 : 0;
          const translateX = interpolate(frame, [0, sceneFrames], [0, xPan]);
          const translateY = interpolate(frame, [0, sceneFrames], [0, yPan]);
          transform = `scale(${zoom}) translateX(${translateX}%) translateY(${translateY}%)`;
        }

        return (
          // Each visual is in its own sequence, timed correctly.
          <Sequence
            key={`scene-${sceneIdx}`}
            from={sceneStart}
            durationInFrames={Math.max(1, sceneFrames)}
          >
            <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
              {isStatic ? (
                <Img
                  src={visualUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform,
                  }}
                />
              ) : (
                <OffthreadVideo
                  src={visualUrl}
                  muted
                  style={{ width: "100%", height: "100%" }}
                />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Layer 4: Captions */}
      {captionPages.map((page, pageIdx) => {
        const pageStart = Math.round((page.startMs / 1000) * fps);
        const pageFrames = Math.max(
          1,
          Math.round(((page.endMs - page.startMs) / 1000) * fps),
        );
        return (
          <Sequence
            key={`caption-page-${pageIdx}`}
            from={pageStart}
            durationInFrames={pageFrames}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems:
                  captionPosition === "top"
                    ? "flex-start"
                    : captionPosition === "bottom"
                      ? "flex-end"
                      : "center",
                justifyContent: "center",
                padding: "0 40px",
              }}
            >
              <div style={{ width: "90%", textAlign: "center" }}>
                {page.lines.map((line, lIdx) => (
                  <p
                    key={`line-${lIdx}`}
                    style={{
                      fontSize: "6em",
                      fontFamily,
                      fontWeight: 900,
                      color: "white",
                      WebkitTextStroke: "2px black",
                      textShadow: "0 0 15px black",
                      textTransform: "uppercase",
                      margin: "0.2em 0",
                      lineHeight: 1.1,
                    }}
                  >
                    {line.texts.map((txt, tIdx) => {
                      const captionStartFrame = Math.round(
                        (txt.startMs / 1000) * fps,
                      );
                      const captionEndFrame = Math.round(
                        (txt.endMs / 1000) * fps,
                      );
                      const isActive =
                        globalFrame >= captionStartFrame &&
                        globalFrame <= captionEndFrame;
                      return (
                        <React.Fragment key={`txt-${tIdx}`}>
                          <span
                            style={{
                              fontWeight: "bold",
                              ...(isActive ? activeStyle : {}),
                            }}
                          >
                            {txt.text}
                          </span>
                          {tIdx < line.texts.length - 1 ? " " : ""}
                        </React.Fragment>
                      );
                    })}
                  </p>
                ))}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
