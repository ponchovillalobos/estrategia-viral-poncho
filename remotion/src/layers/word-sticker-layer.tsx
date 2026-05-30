import { spring, interpolate, useVideoConfig } from "remotion";
import type { WordSticker } from "../schemas";

/**
 * Sticker tipo "palabra clave + emoji" en la parte de arriba del frame. Entra con
 * spring + scale, oscila suave (drift Y + rotación), sale con fade. Su tipografía
 * escala con el ancho disponible.
 *
 * Forzamos top-center (ignoramos el `position` legacy de JSONs viejos) para no chocar
 * con b-roll/subtítulos que viven en la mitad inferior.
 */
export const WordStickerLayer: React.FC<{
  sticker: WordSticker;
  currentTime: number;
  fontFamily: string;
}> = ({ sticker, currentTime, fontFamily }) => {
  const elapsed = currentTime - sticker.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 10, stiffness: 280, mass: 0.5 },
  });
  const exitStart = sticker.duration - 0.2;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.2 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const { width: compWidth, height: compHeight } = useVideoConfig();
  const positionStyles: React.CSSProperties = {
    top: compHeight * 0.094,
    left: "50%",
    transform: "translateX(-50%)",
  };

  const availableWidth = compWidth * 0.667;
  const charFactor = 0.55;
  const sizeByWidth = availableWidth / Math.max(1, sticker.word.length * charFactor);
  const wordSize = Math.min(
    Math.floor(compWidth * 0.102),
    Math.max(56, Math.floor(sizeByWidth))
  );

  // A8 — animación post-entrada: drift Y + oscilación de rotación.
  const floatY = Math.sin(elapsed * 2.2) * 6;
  const wobbleRot = Math.sin(elapsed * 1.6) * 2;

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        opacity,
        transform: `${
          positionStyles.transform ?? ""
        } translateY(${floatY}px) scale(${enter}) rotate(${sticker.rotation + wobbleRot}deg)`,
        transformOrigin: "center",
      }}
    >
      <div
        style={{
          background: sticker.bg,
          color: sticker.color,
          padding: "18px 28px",
          borderRadius: 18,
          fontFamily,
          fontSize: wordSize,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          gap: 18,
          boxShadow:
            "0 16px 40px rgba(0,0,0,0.6), 0 0 0 4px rgba(255,255,255,0.08) inset",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: wordSize * 0.85 }}>{sticker.emoji}</span>
        <span>{sticker.word}</span>
      </div>
    </div>
  );
};
