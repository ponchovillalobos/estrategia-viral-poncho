import { AbsoluteFill, spring } from "remotion";
import type { EndScreen } from "../schemas";

/**
 * A6 — End-screen / CTA: aparece en los últimos `durationSec` con entrada animada
 * (spring scale + fade-in). Cierre celebratorio del video con emoji, copy grande,
 * handle opcional y una barra que se llena. Activado por estilos premium.
 */
export const EndScreenLayer: React.FC<{
  config: EndScreen;
  currentTime: number;
  totalDuration: number;
  fps: number;
  fontFamily: string;
}> = ({ config, currentTime, totalDuration, fps, fontFamily }) => {
  const startAt = totalDuration - config.durationSec;
  if (currentTime < startAt) return null;
  const elapsed = currentTime - startAt;
  const enter = spring({
    frame: Math.max(0, elapsed * fps),
    fps,
    config: { damping: 16, stiffness: 140, mass: 0.7 },
  });
  const scale = 0.7 + enter * 0.3;
  return (
    <AbsoluteFill
      style={{
        background: `${config.bg}f2`,
        backdropFilter: "blur(14px)",
        justifyContent: "center",
        alignItems: "center",
        opacity: Math.min(1, elapsed / 0.25),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontSize: 200,
            lineHeight: 1,
            filter: `drop-shadow(0 12px 50px ${config.accent}66)`,
          }}
        >
          {config.emoji}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 120,
            fontWeight: 900,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            lineHeight: 1.0,
            textAlign: "center",
            padding: "0 60px",
            maxWidth: 980,
            textShadow: `0 0 70px ${config.accent}88`,
          }}
        >
          {config.text}
        </div>
        {config.handle ? (
          <div
            style={{
              fontFamily,
              fontSize: 56,
              fontWeight: 700,
              color: config.accent,
              letterSpacing: "0.04em",
            }}
          >
            {config.handle.startsWith("@") ? config.handle : `@${config.handle}`}
          </div>
        ) : null}
        <div
          style={{
            height: 8,
            width: 220 * enter,
            background: config.accent,
            borderRadius: 4,
            boxShadow: `0 0 30px ${config.accent}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
