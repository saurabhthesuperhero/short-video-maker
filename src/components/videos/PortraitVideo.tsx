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

export const PortraitVideo: React.FC<
  z.infer<typeof shortVideoSchema>
> = ({ scenes, music, config }) => {
  const globalFrame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  /* cross-fade / overlap length */
  const TRANSITION_FRAMES = Math.round(0.3 * fps);

  /* ---------- caption helpers ---------- */
  const captionBg = config.captionBackgroundColor ?? "#cda900";
  const activeStyle: React.CSSProperties = {
    backgroundColor: captionBg,
    color: "white",
    padding: "10px",
    marginLeft: "-10px",
    marginRight: "-10px",
    borderRadius: "10px",
  };
  const captionPosition = config.captionPosition ?? "center";
  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  /* ---------- scene build ---------- */
  let currentFrameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
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

      {scenes.map((scene, sceneIdx) => {
        const { captions, audio, video: visualUrl } = scene;
        const pages = createCaptionPages({
          captions,
          lineMaxLength: 20,
          lineCount: 1,
          maxDistanceMs: 1000,
        });

        /* duration logic */
        let sceneFrames = Math.round(audio.duration * fps);
        if (config.paddingBack && sceneIdx === scenes.length - 1) {
          sceneFrames += Math.round((config.paddingBack / 1000) * fps);
        }
        const isLastScene = sceneIdx === scenes.length - 1;

        const sceneStart =
          sceneIdx === 0
            ? currentFrameOffset
            : currentFrameOffset - TRANSITION_FRAMES;

        currentFrameOffset = isLastScene
          ? sceneStart + sceneFrames            // ⬅️ keep full length for last scene
          : sceneStart + sceneFrames - TRANSITION_FRAMES;


        /* ---------- animation values ---------- */
        const frame = globalFrame - sceneStart;
        const fade = TRANSITION_FRAMES;

        /* cross-fade opacity
           first scene starts fully visible, later scenes fade in */
        // const opacity =
        //   sceneIdx === 0
        //     ? interpolate(
        //       frame,
        //       [sceneFrames - fade, sceneFrames],
        //       [1, 0],
        //       { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        //     )
        //     : interpolate(
        //       frame,
        //       [0, fade, sceneFrames - fade, sceneFrames],
        //       [0, 1, 1, 0],
        //       { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        //     );

        const opacity =
          sceneIdx === 0
            ? interpolate(
              frame,
              [sceneFrames - fade, sceneFrames],
              [1, isLastScene ? 1 : 0],      // first scene never fades to black
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
            : interpolate(
              frame,
              [0, fade, sceneFrames - fade, sceneFrames],
              [0, 1, 1, isLastScene ? 1 : 0], // last scene stays visible
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

        /* dir alternates per slide */
        const dir = sceneIdx % 2 === 0 ? 1 : -1;

        /* spring helpers */
        const inSpring = spring({
          fps,
          frame: Math.max(0, frame),
          durationInFrames: fade,
          config: { damping: 200, mass: 1, stiffness: 120 },
        });
        // const outSpring = spring({
        //   fps,
        //   frame: Math.max(0, frame - (sceneFrames - fade)),
        //   durationInFrames: fade,
        //   config: { damping: 200, mass: 1, stiffness: 90 },
        // });

        const outSpringRaw = spring({
          fps,
          frame: Math.max(0, frame - (sceneFrames - fade)),
          durationInFrames: fade,
          config: { damping: 200, mass: 1, stiffness: 90 },
        });
        const outSpring = isLastScene ? 0 : outSpringRaw;
        const finalOpacity = isLastScene
          ? 1
          : interpolate(
            frame,
            [0, fade, sceneFrames - fade, sceneFrames],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );


        /* viral POP + SPIRAL entry */
        const popScale = interpolate(inSpring, [0, 0.3, 1], [0.8, 1.15, 1]);
        const popRotate = interpolate(inSpring, [0, 1], [dir * -10, 0]);

        // /* exit zoom / rotate */
        // const scaleOut = interpolate(outSpring, [0, 1], [1, 1.25]);
        // const rotateOut = interpolate(outSpring, [0, 1], [0, dir * 10]);
        const scaleOut = isLastScene
          ? 1
          : interpolate(outSpring, [0, 1], [1, 1.25]);

        const rotateOut = isLastScene
          ? 0
          : interpolate(outSpring, [0, 1], [0, dir * 10]);

        /* vertical slide (enter + exit) */
        const translateY =
          interpolate(inSpring, [0, 1], [dir * 80, 0]) +
          interpolate(outSpring, [0, 1], [0, -dir * 80]);

        /* Ken-Burns base for stills */
        const isStatic = visualUrl.includes("/api/static/images/");
        let transform = `translateY(${translateY}px) scale(${
          popScale * scaleOut
        }) rotate(${popRotate + rotateOut}deg)`;

        if (isStatic) {
          const overshootFrames = Math.round(0.4 * fps);
          const zoom =
            frame < overshootFrames
              ? interpolate(frame, [0, overshootFrames], [1.1, 1.0])
              : interpolate(frame, [overshootFrames, sceneFrames], [
                1.0,
                1.15,
              ]);
          const panX =
            (dir *
              interpolate(frame, [0, sceneFrames], [0, width * 0.06])) |
            0;
          const panY =
            interpolate(frame, [0, sceneFrames], [0, height * -0.04]) | 0;
          transform += ` translate(${panX}px, ${panY}px) scale(${zoom})`;
        }

        return (
          <Sequence
            key={`scene-${sceneIdx}`}
            from={sceneStart}
            durationInFrames={sceneFrames}
          >
            {/* visual layer */}
            <AbsoluteFill
              style={{
                opacity: finalOpacity,
                transform,
                overflow: "hidden",
              }}
            >
              {isStatic ? (
                <Img
                  src={visualUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <OffthreadVideo
                  src={visualUrl}
                  muted
                  style={{ width: "100%", height: "100%" }}
                />
              )}
              <AbsoluteFill
                style={{
                  background:
                    "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.35))",
                }}
              />
            </AbsoluteFill>

            {/* voice-over */}
            {audio?.url && <Audio src={audio.url} />}

            {/* captions */}
            {pages.map((page, pageIdx) => {
              const pageStart = Math.round((page.startMs / 1000) * fps);
              const pageFrames = Math.round(
                ((page.endMs - page.startMs) / 1000) * fps,
              );

              return (
                <Sequence
                  key={`scene-${sceneIdx}-page-${pageIdx}`}
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
                      padding: "0 20px",
                    }}
                  >
                    <div style={{ width: "90%", textAlign: "center" }}>
                      {page.lines.map((line, lIdx) => (
                        <p
                          key={`line-${lIdx}`}
                          style={{
                            fontSize: "5em",
                            fontFamily,
                            fontWeight: 900,
                            color: "white",
                            WebkitTextStroke: "2px black",
                            textShadow: "0 0 10px black",
                            textTransform: "uppercase",
                            margin: "0.2em 0",
                            lineHeight: 1.1,
                          }}
                        >
                          {line.texts.map((txt, tIdx) => {
                            const relStart = Math.round(
                              (txt.startMs / 1000) * fps,
                            );
                            const relEnd = Math.round(
                              (txt.endMs / 1000) * fps,
                            );
                            const localFrame = globalFrame - sceneStart;
                            const isActive =
                              localFrame >= relStart && localFrame <= relEnd;

                            return (
                              <React.Fragment key={`txt-${tIdx}`}>
                                <span
                                  style={{
                                    fontWeight: "bold",
                                    display: "inline-block",
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
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
