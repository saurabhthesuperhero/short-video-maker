import React from "react";
import { Img, interpolate, useCurrentFrame } from "remotion";
import stoicFriendIcon from "../../../static/branding/stoicfriend-app-icon.png";

export const STOIC_FRIEND_BANNER_HEIGHT = 184;

export const StoicFriendBanner: React.FC<{ hidden?: boolean }> = ({
  hidden = false,
}) => {
  const frame = useCurrentFrame();
  const pulse = (Math.sin(frame / 18) + 1) / 2;
  const pulseScale = interpolate(pulse, [0, 1], [1, 1.012]);
  const pulseGlow = interpolate(pulse, [0, 1], [0.38, 0.5]);

  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        left: 30,
        right: 30,
        height: STOIC_FRIEND_BANNER_HEIGHT,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        borderRadius: 36,
        border: "1px solid rgba(212, 175, 55, 0.32)",
        background:
          "linear-gradient(135deg, rgba(9,9,9,0.92), rgba(29,23,12,0.80) 62%, rgba(58,44,17,0.66))",
        boxShadow:
          "0 26px 70px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.08)",
        overflow: "hidden",
        opacity: hidden ? 0 : 1,
        transition: "opacity 160ms ease-out",
        transform: `scale(${pulseScale})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 40%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          top: 0,
          height: 3,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(212,175,55,0.1), rgba(212,175,55,0.95), rgba(212,175,55,0.1))",
          opacity: pulseGlow,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          flex: 1,
          position: "relative",
        }}
      >
        <div
          style={{
            width: 98,
            height: 98,
            borderRadius: 30,
            padding: 7,
            background:
              "linear-gradient(180deg, rgba(212,175,55,0.30), rgba(212,175,55,0.10))",
            boxShadow:
              "inset 0 0 0 1px rgba(212,175,55,0.35), 0 12px 26px rgba(0,0,0,0.24)",
          }}
        >
          <Img
            src={stoicFriendIcon}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 20,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontFamily: "Georgia, Times New Roman, serif",
              fontSize: 45,
              fontWeight: 700,
              letterSpacing: 2.2,
              color: "#f3df92",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            Stoicfriend
          </div>
          <div
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 1.1,
              color: "rgba(255,255,255,0.96)",
              lineHeight: 1.05,
            }}
          >
            Start your Stoic journey
          </div>
          <div
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: 0.9,
              color: "rgba(255,255,255,0.66)",
              lineHeight: 1.1,
            }}
          >
            Daily wisdom, quotes, reflection
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 10,
          textAlign: "right",
          marginLeft: 24,
          position: "relative",
        }}
      >
        <div
          style={{
            padding: "10px 18px 11px 18px",
            borderRadius: 9999,
            background:
              "linear-gradient(180deg, rgba(244,213,105,1), rgba(212,175,55,1))",
            color: "#13110b",
            fontFamily: "Barlow Condensed, sans-serif",
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            boxShadow: "0 10px 24px rgba(212,175,55,0.28)",
          }}
        >
          Get the app
        </div>
        <div
          style={{
            fontFamily: "Barlow Condensed, sans-serif",
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: 0.9,
            color: "rgba(255,255,255,0.78)",
            lineHeight: 1.1,
          }}
        >
          Play Store link in bio
        </div>
      </div>
    </div>
  );
};
