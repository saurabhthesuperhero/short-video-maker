// src/components/root/PortraitVideo.tsx
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
  getInputProps,
} from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils";

const { fontFamily } = loadFont(); // "Barlow Condensed"

export const PortraitVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
                                                                            scenes,
                                                                            music,
                                                                            config,
                                                                          }) => {
  const globalFrame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  /* ---------- caption helpers ---------- */
  const captionBg = config.captionBackgroundColor ?? "blue";
  const activeStyle: React.CSSProperties = {
    backgroundColor: captionBg,
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

        const sceneStart = currentFrameOffset;
        let sceneFrames = Math.round(audio.duration * fps);

        if (config.paddingBack && sceneIdx === scenes.length - 1) {
          sceneFrames += Math.round((config.paddingBack / 1000) * fps);
        }
        currentFrameOffset += sceneFrames;

        /* ---------- per-scene animation ---------- */
        const sceneFrame = globalFrame - sceneStart;
        const fadeIn = Math.round(0.25 * fps);
        const fadeOut = Math.round(0.25 * fps);

        const opacity = interpolate(
          sceneFrame,
          [0, fadeIn, sceneFrames - fadeOut, sceneFrames],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        const isStatic = visualUrl.includes("/api/static/images/");
        let transform = "none";

        if (isStatic) {
          /* Ken-Burns with scale overshoot */
          const zoomStart = 1.1;            // overshoot
          const zoomMid   = 1.0;            // settle baseline
          const zoomEnd   = 1.15;           // slow push-in
          const overshootFrames = Math.round(0.4 * fps);

          const baseZoom =
            sceneFrame < overshootFrames
              ? interpolate(
                sceneFrame,
                [0, overshootFrames],
                [zoomStart, zoomMid],
                { extrapolateRight: "clamp" },
              )
              : interpolate(
                sceneFrame,
                [overshootFrames, sceneFrames],
                [zoomMid, zoomEnd],
                { extrapolateRight: "clamp" },
              );

          const panX =
            ((sceneIdx % 2 === 0 ? 1 : -1) *
              interpolate(sceneFrame, [0, sceneFrames], [0, width * 0.06])) |
            0;
          const panY =
            interpolate(sceneFrame, [0, sceneFrames], [0, height * -0.04]) | 0;

          transform = `translate(${panX}px, ${panY}px) scale(${baseZoom})`;
        }

        return (
          <Sequence
            key={`scene-${sceneIdx}`}
            from={sceneStart}
            durationInFrames={sceneFrames}
          >
            {/* main visual layer */}
            <AbsoluteFill
              style={{
                opacity,
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
                    transform,
                  }}
                />
              ) : (
                <OffthreadVideo src={visualUrl} muted style={{ width: "100%", height: "100%" }} />
              )}
              {/* dark overlay for cinematic depth */}
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
                    <div
                      style={{
                        width: "90%",
                        textAlign: "center",
                      }}
                    >
                      {page.lines.map((line, lineIdx) => (
                        <p
                          key={`line-${lineIdx}`}
                          style={{
                            fontSize: "5em",
                            fontFamily,
                            fontWeight: "900",
                            color: "white",
                            WebkitTextStroke: "2px black",
                            textShadow: "0 0 10px black",
                            textTransform: "uppercase",
                            margin: "0.2em 0",
                            lineHeight: 1.1,
                          }}
                        >
                          {line.texts.map((txt, txtIdx) => {
                            const relStart = Math.round(
                              (txt.startMs / 1000) * fps,
                            );
                            const relEnd = Math.round(
                              (txt.endMs / 1000) * fps,
                            );
                            const localFrame = globalFrame - sceneStart;

                            const isActive =
                              localFrame >= relStart &&
                              localFrame <= relEnd;

                            return (
                              <>
                                <span
                                  key={`text-${txtIdx}`}
                                  style={{
                                    fontWeight: "bold",
                                    display: "inline-block",
                                    ...(isActive ? activeStyle : {}),
                                  }}
                                >
                                  {txt.text}
                                </span>
                                {txtIdx < line.texts.length - 1 ? " " : ""}
                              </>
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
