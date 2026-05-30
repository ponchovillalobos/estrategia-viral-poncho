import { AbsoluteFill, spring, interpolate } from "remotion";
import { ICON_MAP, FallbackIcon } from "../icon-map";
import type { IconSticker } from "../schemas";

/**
 * B5 — Icon sticker: render de un icono lucide (curado en ICON_MAP) sobre un círculo
 * de color, con entrada spring + flotación post-entrada (sutil). Se ubica por esquina
 * o "top-center" con padding seguro para no chocar con otras capas.
 */
export const IconStickerLayer: React.FC<{
  sticker: IconSticker;
  currentTime: number;
}> = ({ sticker, currentTime }) => {
  const elapsed = currentTime - sticker.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 10, stiffness: 260, mass: 0.5 },
  });
  const exitStart = sticker.duration - 0.2;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.2 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const Icon = ICON_MAP[sticker.icon.toLowerCase()] ?? FallbackIcon;
  const floatY = Math.sin(elapsed * 2.2) * 5;
  const wobbleRot = Math.sin(elapsed * 1.6) * 3;
  const pad = 80;
  const isTop = sticker.position.startsWith("top");
  const isLeft = sticker.position.endsWith("left");
  const isCenter = sticker.position === "top-center";
  const justify = isCenter ? "center" : isLeft ? "flex-start" : "flex-end";
  const align = isTop ? "flex-start" : "flex-end";
  const padTop = isCenter ? 160 : pad;
  const diameter = sticker.size + 36;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: align,
        alignItems: justify,
        padding: pad,
        paddingTop: padTop,
        opacity,
      }}
    >
      <div
        style={{
          width: diameter,
          height: diameter,
          borderRadius: "50%",
          background: sticker.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 16px 40px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,255,255,0.1) inset",
          transform: `translateY(${floatY}px) scale(${enter}) rotate(${wobbleRot}deg)`,
        }}
      >
        <Icon size={sticker.size} color={sticker.color} strokeWidth={2.4} />
      </div>
    </AbsoluteFill>
  );
};
