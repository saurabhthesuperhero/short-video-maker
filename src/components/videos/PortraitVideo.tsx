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

  // =========================================================================
  // FIX: This is the correct architecture.
  // 1. Get ALL captions from ALL scenes into one master list. This works for
  //    both old and new workflows.
  // 2. Find the one voice-over audio track.
  // =========================================================================
  const allCaptions = scenes.flatMap(s => s.captions);
  const captionPages = createCaptionPages({
    captions: allCaptions,
    lineMaxLength: 20,
    lineCount: 1,
    maxDistanceMs: 1000,
  });

  const voiceOverAudio = scenes.find(s => s.audio.url)?.audio;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Background Music (Layer 1) */}
      {music?.url && (
        <Audio loop src={music.url} startFrom={music.start * fps} endAt={music.end * fps} volume={() => musicVolume} muted={musicMuted} />
      )}

      {/* Voice-over Audio (Layer 2 - plays once, continuously) */}
      {voiceOverAudio?.url && (
        <Audio src={voiceOverAudio.url} />
      )}

      {/* ========================================================================= */}
      {/* LAYER 3: VISUALS                                                          */}
      {/* This loop correctly sequences the changing images/videos one after another. */}
      {/* ========================================================================= */}
      {scenes.map((scene, sceneIdx) => {
        const { audio, video: visualUrl } = scene;
        const TRANSITION_FRAMES = Math.round(0.3 * fps);
        // Correctly calculate start time by summing durations of all previous scenes
        const sceneStart = scenes.slice(0, sceneIdx).reduce((acc, s) => acc + Math.round(s.audio.duration * fps), 0);
        let sceneFrames = Math.round(audio.duration * fps);

        // This padding logic is from your original code and is preserved.
        if (config.paddingBack && sceneIdx === scenes.length - 1) {
          sceneFrames += Math.round((config.paddingBack / 1000) * fps);
        }

        const frame = globalFrame - sceneStart;
        const isLastScene = sceneIdx === scenes.length - 1;
        const fade = TRANSITION_FRAMES;

        // Correct opacity interpolation that prevents the last scene from fading out
        const opacity = interpolate(
          frame,
          [0, fade, sceneFrames - fade, sceneFrames],
          [0, 1, 1, isLastScene ? 1 : 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const dir = sceneIdx % 2 === 0 ? 1 : -1;
        const inSpring = spring({ fps, frame: Math.max(0, frame), durationInFrames: fade, config: { damping: 200, mass: 1, stiffness: 120 }});
        const outSpring = isLastScene ? 0 : spring({ fps, frame: Math.max(0, frame - (sceneFrames - fade)), durationInFrames: fade, config: { damping: 200, mass: 1, stiffness: 90 }});
        const popScale = interpolate(inSpring, [0, 0.3, 1], [0.8, 1.15, 1]);
        const popRotate = interpolate(inSpring, [0, 1], [dir * -10, 0]);
        const scaleOut = interpolate(outSpring, [0, 1], [1, 1.25]);
        const rotateOut = interpolate(outSpring, [0, 1], [0, dir * 10]);
        const translateY = interpolate(inSpring, [0, 1], [dir * 80, 0]) + interpolate(outSpring, [0, 1], [0, -dir * 80]);
        const isStatic = visualUrl.includes("/api/static/images/");
        let transform = `translateY(${translateY}px) scale(${popScale * scaleOut}) rotate(${popRotate + rotateOut}deg)`;

        if (isStatic) {
          const zoom = interpolate(frame, [0, sceneFrames], [1.0, 1.15]);
          transform += ` scale(${zoom})`;
        }

        return (
          // Each visual is in its own sequence, timed correctly.
          <Sequence key={`scene-${sceneIdx}`} from={sceneStart} durationInFrames={Math.max(1, sceneFrames)}>
            <AbsoluteFill style={{ opacity, transform, overflow: "hidden" }}>
              {isStatic ? <Img src={visualUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OffthreadVideo src={visualUrl} muted style={{ width: "100%", height: "100%" }} />}
              <AbsoluteFill style={{ background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.35))" }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* ========================================================================= */}
      {/* LAYER 4: CAPTIONS                                                         */}
      {/* This loop is now completely independent and renders on top of everything, */}
      {/* timed against the GLOBAL frame. This fixes the sync issue.              */}
      {/* ========================================================================= */}
      {captionPages.map((page, pageIdx) => {
        const pageStart = Math.round((page.startMs / 1000) * fps);
        const pageFrames = Math.max(1, Math.round(((page.endMs - page.startMs) / 1000) * fps));
        return (
          <Sequence key={`caption-page-${pageIdx}`} from={pageStart} durationInFrames={pageFrames}>
            <AbsoluteFill style={{ display: "flex", alignItems: captionPosition === "top" ? "flex-start" : captionPosition === "bottom" ? "flex-end" : "center", justifyContent: "center", padding: "0 20px" }}>
              <div style={{ width: "90%", textAlign: "center" }}>
                {page.lines.map((line, lIdx) => (
                  <p key={`line-${lIdx}`} style={{ fontSize: "5em", fontFamily, fontWeight: 900, color: "white", WebkitTextStroke: "2px black", textShadow: "0 0 10px black", textTransform: "uppercase", margin: "0.2em 0", lineHeight: 1.1 }}>
                    {line.texts.map((txt, tIdx) => {
                      const captionStartFrame = Math.round((txt.startMs / 1000) * fps);
                      const captionEndFrame = Math.round((txt.endMs / 1000) * fps);
                      const isActive = globalFrame >= captionStartFrame && globalFrame <= captionEndFrame;
                      return (
                        <React.Fragment key={`txt-${tIdx}`}>
                          <span style={{ fontWeight: "bold", display: "inline-block", ...(isActive ? activeStyle : {}) }}>{txt.text}</span>
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
