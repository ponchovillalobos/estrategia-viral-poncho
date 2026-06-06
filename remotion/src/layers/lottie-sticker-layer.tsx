import { AbsoluteFill } from "remotion";
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import type { LottieSticker } from "../schemas";
import pulseRing from "../lottie/pulse-ring.json";
import sparkle from "../lottie/sparkle.json";
import arrowDown from "../lottie/arrow-down.json";
import star5 from "../lottie/star5.json";

/**
 * B4 — Sticker ANIMADO (Lottie). A diferencia de los emojis estáticos, esta capa monta
 * una animación vectorial en loop (pulse ring tipo radar, o un destello/sparkle). Las
 * formas base son blancas; se tiñen con un glow del color del estilo para integrarse.
 *
 * El padre (ViralVideo) ya filtra por ventana [at, at+duration]; acá sólo hacemos el
 * fade de entrada/salida y el posicionamiento en la esquina elegida.
 */
const ANIMATIONS: Record<LottieSticker["name"], LottieAnimationData> = {
  pulse_ring: pulseRing as LottieAnimationData,
  sparkle: sparkle as LottieAnimationData,
  arrow_down: arrowDown as LottieAnimationData,
  star5: star5 as LottieAnimationData,
};

const POSITIONS: Record<
  LottieSticker["position"],
  { justifyContent: "flex-start" | "center" | "flex-end"; alignItems: "flex-start" | "center" | "flex-end"; padding: string }
> = {
  "top-left": { justifyContent: "flex-start", alignItems: "flex-start", padding: "150px 0 0 60px" },
  "top-right": { justifyContent: "flex-start", alignItems: "flex-end", padding: "150px 60px 0 0" },
  "top-center": { justifyContent: "flex-start", alignItems: "center", padding: "150px 0 0 0" },
  "bottom-left": { justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 420px 60px" },
  "bottom-right": { justifyContent: "flex-end", alignItems: "flex-end", padding: "0 60px 420px 0" },
  center: { justifyContent: "center", alignItems: "center", padding: "0" },
};

export const LottieStickerLayer: React.FC<{
  sticker: LottieSticker;
  currentTime: number;
}> = ({ sticker, currentTime }) => {
  const elapsed = currentTime - sticker.at;
  const remaining = sticker.at + sticker.duration - currentTime;
  if (elapsed < -0.05 || remaining < 0) return null;

  // Fade + pop de entrada (0.18s) y fade de salida (0.2s).
  const fadeIn = Math.min(1, Math.max(0, elapsed / 0.18));
  const fadeOut = Math.min(1, Math.max(0, remaining / 0.2));
  const opacity = Math.min(fadeIn, fadeOut);
  const pop = 0.7 + 0.3 * fadeIn;

  const pos = POSITIONS[sticker.position];
  const data = ANIMATIONS[sticker.name];

  return (
    <AbsoluteFill style={{ ...pos, pointerEvents: "none" }}>
      <div
        style={{
          width: sticker.size,
          height: sticker.size,
          opacity,
          transform: `scale(${pop})`,
          // Las formas son blancas → un glow del color del estilo las integra al look.
          filter: `drop-shadow(0 0 16px ${sticker.color}) drop-shadow(0 0 6px ${sticker.color})`,
        }}
      >
        <Lottie animationData={data} loop />
      </div>
    </AbsoluteFill>
  );
};
