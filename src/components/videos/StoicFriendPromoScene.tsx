import React from "react";
import {
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import stoicFriendIcon from "../../../static/branding/stoicfriend-app-icon.png";

type StoicFriendPromoSceneProps = {
  promoText?: string;
  promoSubtext?: string;
  promoImages?: string[];
};

export const StoicFriendPromoScene: React.FC<StoicFriendPromoSceneProps> = ({
  promoText = "Start your Stoic journey with Stoic Friend",
  promoSubtext = "Play Store link in bio",
  promoImages = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const pop = spring({
    fps,
    frame,
    config: {
      damping: 14,
      stiffness: 180,
      mass: 0.9,
    },
  });

  const settle = spring({
    fps,
    frame: Math.max(0, frame - 10),
    config: {
      damping: 18,
      stiffness: 120,
      mass: 1,
    },
  });

  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [60, 82], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = fadeIn * fadeOut;

  const logoScale = interpolate(pop, [0, 1], [0.45, 1]);
  const logoRotate = interpolate(pop, [0, 1], [-12, 0]);
  const copyY = interpolate(settle, [0, 1], [40, 0]);

  const backgroundShift = interpolate(frame, [0, 84], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "180px 72px 180px",
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 35%, rgba(212,175,55,0.18), rgba(212,175,55,0.08) 18%, rgba(33,24,11,0.78) 52%, rgba(11,10,8,0.92) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(26,20,11,0.40), rgba(0,0,0,0) 40%, rgba(212,175,55,0.08) 100%)",
        }}
      />

      {promoImages.map((image, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(promoImages.length, 1);
        const orbitRadius = 220 + index * 42;
        const orbitPhase = angle + backgroundShift * Math.PI * 1.8;
        const x = Math.cos(orbitPhase) * orbitRadius;
        const y = Math.sin(orbitPhase) * (orbitRadius * 0.38);
        const imageScale = interpolate(pop, [0, 1], [0.88, 1.06]);
        const imageOpacity = interpolate(frame, [0, 10, 68, 84], [0, 0.22, 0.22, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const imageRotate = interpolate(frame, [0, 84], [index * -6, index * 7]);
        const imageSize = 270 - index * 24;

        return (
          <div
            key={`${image}-${index}`}
            style={{
              position: "absolute",
              left: width / 2 - imageSize / 2,
              top: height / 2 - imageSize / 2,
              width: imageSize,
              height: imageSize,
              borderRadius: "50%",
              overflow: "hidden",
              opacity: imageOpacity,
              transform: `translate(${x}px, ${y}px) scale(${imageScale}) rotate(${imageRotate}deg)`,
              boxShadow: "0 30px 70px rgba(0,0,0,0.36)",
              border: "2px solid rgba(212,175,55,0.18)",
            }}
          >
            <Img
              src={image}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "brightness(0.7) saturate(0.9)",
              }}
            />
          </div>
        );
      })}

      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: 76,
            padding: 18,
            background:
              "linear-gradient(180deg, rgba(244,213,105,0.92), rgba(212,175,55,0.62))",
            boxShadow:
              "0 30px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.34)",
            transform: `scale(${logoScale}) rotate(${logoRotate}deg)`,
            zIndex: 2,
          }}
        >
          <Img
            src={stoicFriendIcon}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 58,
            }}
          />
        </div>

        <div
          style={{
            transform: `translateY(${copyY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            textAlign: "center",
            maxWidth: 860,
          }}
        >
          <div
            style={{
              fontFamily: "Georgia, Times New Roman, serif",
              fontSize: 78,
              fontWeight: 700,
              letterSpacing: 2,
              lineHeight: 1,
              color: "#f5df91",
              textTransform: "uppercase",
              textShadow: "0 10px 30px rgba(0,0,0,0.35)",
              zIndex: 2,
            }}
          >
            Stoic Friend
          </div>
          <div
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: 0.8,
              lineHeight: 1.05,
              color: "white",
              textShadow: "0 10px 28px rgba(0,0,0,0.35)",
              zIndex: 2,
            }}
          >
            {promoText}
          </div>
          <div
            style={{
              padding: "12px 22px",
              borderRadius: 9999,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(212,175,55,0.34)",
              fontFamily: "Barlow Condensed, sans-serif",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 1.1,
              color: "rgba(255,255,255,0.9)",
              zIndex: 2,
            }}
          >
            {promoSubtext}
          </div>
        </div>
      </div>
    </div>
  );
};
