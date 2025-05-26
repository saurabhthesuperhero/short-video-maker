import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  Img, // Import Img
  getInputProps, // To get any custom props for animation type
} from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils"; // Assuming this is the correct path

const { fontFamily } = loadFont(); // "Barlow Condensed"

// Define a type for your scene if you want to pass extra info like isStaticImage
// Or rely on URL checking. For this example, we'll use URL checking.

export const PortraitVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
                                                                            scenes,
                                                                            music,
                                                                            config,
                                                                          }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig(); // Added width and height for Img styling

  const captionBackgroundColor = config.captionBackgroundColor ?? "blue";

  const activeStyle = {
    backgroundColor: captionBackgroundColor,
    padding: "10px",
    marginLeft: "-10px",
    marginRight: "-10px",
    borderRadius: "10px",
  };

  const captionPosition = config.captionPosition ?? "center";
  let captionStyle = {};
  if (captionPosition === "top") {
    captionStyle = { top: 100 };
  }
  if (captionPosition === "center") {
    captionStyle = { top: "50%", transform: "translateY(-50%)" };
  }
  if (captionPosition === "bottom") {
    captionStyle = { bottom: 100 };
  }

  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  let currentFrameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      {music && music.url && ( // Check if music and music.url exist
        <Audio
          loop
          src={music.url}
          startFrom={music.start * fps}
          endAt={music.end * fps}
          volume={() => musicVolume}
          muted={musicMuted}
        />
      )}

      {scenes.map((scene, i) => {
        const { captions, audio, video: sceneVisualUrl } = scene; // Renamed for clarity
        const pages = createCaptionPages({
          captions,
          lineMaxLength: 20, // Adjust as needed
          lineCount: 1,      // Adjust as needed
          maxDistanceMs: 1000,
        });

        const sceneStartFrame = currentFrameOffset;
        let sceneDurationInFrames = Math.round(audio.duration * fps);

        // If it's the last scene and paddingBack is configured, add it to this scene's duration
        if (config.paddingBack && i === scenes.length - 1) {
          sceneDurationInFrames += Math.round((config.paddingBack / 1000) * fps);
        }

        currentFrameOffset += sceneDurationInFrames; // Update offset for the next scene

        // Determine if the sceneVisualUrl is for a static image
        const isStaticImage = sceneVisualUrl.includes('/api/static/images/');

        // ---- START: Basic Animation Logic for Images ----
        let imageTransform = 'scale(1)';
        if (isStaticImage) {
          // Create a "local" frame counter for the current scene sequence
          const sceneFrame = frame - sceneStartFrame;

          // Example: Ken Burns effect (slow zoom and pan)
          // This needs to be relative to the scene's duration, not the whole video
          const zoomStart = 1;
          const zoomEnd = 1.15; // Zoom in by 15%
          const panXStart = -((zoomEnd - 1) * width) / 4; // Pan slightly based on zoom
          const panXEnd = ((zoomEnd - 1) * width) / 4;
          const panYStart = -((zoomEnd - 1) * height) / 8;
          const panYEnd = ((zoomEnd - 1) * height) / 8;

          // Randomize direction for variety for each image scene
          const randomFactor = (i % 2 === 0) ? 1 : -1;


          const currentZoom = sceneFrame / sceneDurationInFrames * (zoomEnd - zoomStart) + zoomStart;
          const currentPanX = sceneFrame / sceneDurationInFrames * (panXEnd - panXStart) * randomFactor + (panXStart * randomFactor);
          const currentPanY = sceneFrame / sceneDurationInFrames * (panYEnd - panYStart) * randomFactor + (panYStart * randomFactor);


          imageTransform = `scale(${currentZoom}) translateX(${currentPanX}px) translateY(${currentPanY}px)`;
        }
        // ---- END: Basic Animation Logic for Images ----


        return (
          <Sequence
            from={sceneStartFrame}
            durationInFrames={sceneDurationInFrames}
            key={`scene-${i}`}
          >
            {isStaticImage ? (
              <AbsoluteFill style={{ overflow: 'hidden' }}>
                <Img
                  src={sceneVisualUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover', // Important for Ken Burns
                    transform: imageTransform,
                  }}
                />
              </AbsoluteFill>
            ) : (
              <OffthreadVideo src={sceneVisualUrl} muted />
            )}

            {audio && audio.url && <Audio src={audio.url} />}

            {pages.map((page, j) => {
              // Calculate page start relative to the scene's start, not absolute video start
              const pageStartInSceneFrames = Math.round((page.startMs / 1000) * fps);
              const pageDurationInFrames = Math.round(((page.endMs - page.startMs) / 1000) * fps);

              return (
                <Sequence
                  key={`scene-${i}-page-${j}`}
                  from={pageStartInSceneFrames} // Relative to parent Sequence
                  durationInFrames={pageDurationInFrames}
                >
                  <AbsoluteFill // Use AbsoluteFill for captions to overlay correctly
                    style={{
                      display: 'flex',
                      alignItems: captionPosition === 'top' ? 'flex-start' : captionPosition === 'bottom' ? 'flex-end' : 'center',
                      justifyContent: 'center',
                      padding: '0 20px', // Add some horizontal padding
                      ...(captionPosition === 'top' && { paddingTop: `${100/height * 100}%`}), // Adjust based on actual px
                      ...(captionPosition === 'bottom' && { paddingBottom: `${100/height*100}%`}),
                    }}
                  >
                    <div
                      style={{
                        // Removed absolute positioning, let flexbox handle it
                        width: "90%", // Max width for caption container
                        textAlign: 'center',
                      }}
                    >
                      {page.lines.map((line, k) => {
                        return (
                          <p
                            style={{
                              fontSize: "5em", // Slightly smaller for portrait
                              fontFamily: fontFamily,
                              fontWeight: "black",
                              color: "white",
                              WebkitTextStroke: "2px black",
                              WebkitTextFillColor: "white",
                              textShadow: "0px 0px 10px black",
                              textAlign: "center",
                              width: "100%",
                              textTransform: "uppercase",
                              margin: '0.2em 0', // Add some vertical margin between lines if multiple
                              lineHeight: '1.1',
                            }}
                            key={`scene-${i}-page-${j}-line-${k}`}
                          >
                            {line.texts.map((text, l) => {
                              // Active check needs to be relative to the current scene's frame timeline
                              const textStartInSceneFrames = Math.round((text.startMs / 1000) * fps);
                              const textEndInSceneFrames = Math.round((text.endMs / 1000) * fps);
                              const currentSceneFrame = frame - sceneStartFrame;

                              const active =
                                currentSceneFrame >= textStartInSceneFrames &&
                                currentSceneFrame <= textEndInSceneFrames;

                              return (
                                <>
                                  <span
                                    style={{
                                      fontWeight: "bold",
                                      ...(active ? activeStyle : {}),
                                      display: 'inline-block', // Helps with background on spaces
                                    }}
                                    key={`scene-${i}-page-${j}-line-${k}-text-${l}`}
                                  >
                                    {text.text}
                                  </span>
                                  {l < line.texts.length - 1 ? " " : ""}
                                </>
                              );
                            })}
                          </p>
                        );
                      })}
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
