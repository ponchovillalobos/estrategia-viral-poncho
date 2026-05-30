import { AbsoluteFill, spring, interpolate, useVideoConfig } from "remotion";
import type { EmphasisCard } from "../schemas";

/**
 * Tarjeta de énfasis fullscreen (estilo Hormozi/MrBeast): emoji grande arriba,
 * palabra clave con gradient + textShadow gigante, barra de carga abajo. Aparece
 * unos segundos sobre el video para puntuar una afirmación clave.
 */
export const EmphasisCardLayer: React.FC<{
  card: EmphasisCard;
  currentTime: number;
  fontFamily: string;
}> = ({ card, currentTime, fontFamily }) => {
  const elapsed = currentTime - card.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 14, stiffness: 220, mass: 0.5 },
  });
  const exitStart = card.duration - 0.18;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.18 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = 0.6 + enter * 0.4;
  const { width: compWidth } = useVideoConfig();
  const emojiSize = Math.floor(compWidth * 0.333);
  const availableWidth = compWidth - 120;
  const charFactor = 0.55;
  const maxByWidth = availableWidth / Math.max(1, card.word.length * charFactor);
  const wordSize = Math.min(
    Math.floor(compWidth * 0.204),
    Math.max(90, Math.floor(maxByWidth))
  );

  return (
    <AbsoluteFill
      style={{
        background: `${card.bg}f5`,
        backdropFilter: "blur(12px)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontSize: emojiSize,
            lineHeight: 1,
            filter: `drop-shadow(0 12px 60px ${card.accent}66)`,
          }}
        >
          {card.emoji}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: wordSize,
            fontWeight: 900,
            color: card.color,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            lineHeight: 1,
            textAlign: "center",
            padding: "0 60px",
            maxWidth: "100%",
            whiteSpace: "nowrap",
            textShadow: `0 0 80px ${card.accent}88`,
            background: `linear-gradient(180deg, ${card.color} 0%, ${card.accent} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {card.word}
        </div>
        <div
          style={{
            height: 8,
            width: 200 * enter,
            background: card.accent,
            borderRadius: 4,
            boxShadow: `0 0 30px ${card.accent}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
