import { AbsoluteFill, spring, interpolate } from "remotion";
import type { FloatingEmoji } from "../schemas";

/**
 * Emoji que entra desde un lado (left/right/top/bottom) con spring + wobble + rotación
 * sutil, y sale con fade. Sirve para puntuar momentos sin tapar la cara o los subs.
 */
export const FloatingEmojiLayer: React.FC<{
  emoji: FloatingEmoji;
  currentTime: number;
}> = ({ emoji, currentTime }) => {
  const elapsed = currentTime - emoji.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 12, stiffness: 180, mass: 0.6 },
  });
  const exitStart = emoji.duration - 0.25;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.25 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const offBlock = 200;
  let tx = 0;
  let ty = emoji.yOffset;
  if (emoji.from === "left") tx = -offBlock + enter * offBlock;
  else if (emoji.from === "right") tx = offBlock - enter * offBlock;
  else if (emoji.from === "top") ty = emoji.yOffset - offBlock + enter * offBlock;
  else ty = emoji.yOffset + offBlock - enter * offBlock;

  const wobble = Math.sin(elapsed * 6) * 8;

  // En flexDirection:row → justifyContent controla el eje X, alignItems el Y.
  const horizontalAlign =
    emoji.from === "left"
      ? "flex-start"
      : emoji.from === "right"
        ? "flex-end"
        : "center";

  return (
    <AbsoluteFill
      style={{
        justifyContent: horizontalAlign,
        alignItems: "center",
        flexDirection: "row",
        padding: "0 80px",
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: emoji.size,
          lineHeight: 1,
          transform: `translate(${tx}px, ${ty + wobble}px) rotate(${
            (Math.sin(elapsed * 4) - 0.5) * 8
          }deg)`,
          filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.55))",
        }}
      >
        {emoji.emoji}
      </div>
    </AbsoluteFill>
  );
};
