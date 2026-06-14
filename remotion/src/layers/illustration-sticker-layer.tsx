/**
 * IllustrationStickerLayer — ilustraciones CC0 MULTICOLOR (open-doodles / open-peeps)
 * como overlay/sticker de "personas", con duotono OPCIONAL a los colores del tema.
 *
 * Las 73 ilustraciones nuevas (assets/illustrations) son a todo color (no usan
 * currentColor), así que para que combinen con la estética del proyecto esta capa
 * puede teñirlas a duotono: primero las desatura (grayscale) y luego mapea
 * sombras → `duotoneShadow` y luces → `duotoneHighlight` con un filtro SVG
 * feComponentTransfer (interpolación lineal entre los dos colores por luminancia).
 * Con `duotone: 0` la ilustración se renderiza INTACTA (multicolor original).
 *
 * 100% ADITIVA y opt-in: ViralVideo solo monta esta capa si `illustrationStickers`
 * trae datos. Cada ilustración tiene su ventana [at, at+duration].
 *
 * El filtro duotono es DETERMINISTA (ids derivados del índice) y autocontenido en un
 * <svg width=0>, igual que ed-torn-edge en ViralVideo — no depende de assets externos.
 */
import { AbsoluteFill, interpolate } from "remotion";
import type { IllustrationSticker } from "../schemas";

/** 0..1 por canal a "RR" hex. */
function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

const POS_STYLE: Record<string, React.CSSProperties> = {
  "top-left": { top: "8%", left: "6%" },
  "top-right": { top: "8%", right: "6%" },
  "bottom-left": { bottom: "10%", left: "6%" },
  "bottom-right": { bottom: "10%", right: "6%" },
  "top-center": { top: "8%", left: "50%", transform: "translateX(-50%)" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  left: { top: "50%", left: "5%", transform: "translateY(-50%)" },
  right: { top: "50%", right: "5%", transform: "translateY(-50%)" },
};

export const IllustrationStickerLayer: React.FC<{
  sticker: IllustrationSticker;
  currentTime: number;
  index: number;
}> = ({ sticker, currentTime, index }) => {
  const elapsed = currentTime - sticker.at;
  const remaining = sticker.at + sticker.duration - currentTime;
  const fadeIn = Math.min(1, Math.max(0, elapsed / 0.18));
  const fadeOut = Math.min(1, Math.max(0, remaining / 0.18));
  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0.001) return null;

  // Pop de entrada sutil (sticker).
  const pop = interpolate(Math.min(1, elapsed / 0.3), [0, 1], [0.86, 1]);

  const duo = Math.min(1, Math.max(0, sticker.duotone));
  const filterId = `illus-duo-${index}`;
  const [sr, sg, sb] = hexChannels(sticker.duotoneShadow);
  const [hr, hg, hb] = hexChannels(sticker.duotoneHighlight);

  const base = POS_STYLE[sticker.position] ?? POS_STYLE["bottom-right"];
  // Combinar el transform de posición (centrado) con rotación + pop sin pisarse.
  const posTransform = (base.transform as string) ?? "";
  const transform =
    `${posTransform} rotate(${sticker.rotation}deg) scale(${pop})`.trim();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Filtro duotono determinista (solo se usa si duo > 0). */}
      {duo > 0 && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            {/* 1) a escala de grises (luminancia ITU-R 601). */}
            <feColorMatrix
              type="matrix"
              values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"
            />
            {/* 2) mapear gris→degradado sombra..luz (lineal por luminancia). */}
            <feComponentTransfer>
              <feFuncR type="table" tableValues={`${sr} ${hr}`} />
              <feFuncG type="table" tableValues={`${sg} ${hg}`} />
              <feFuncB type="table" tableValues={`${sb} ${hb}`} />
            </feComponentTransfer>
          </filter>
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          ...base,
          width: sticker.size,
          height: sticker.size,
          transform,
          opacity,
          filter: sticker.dropShadow
            ? "drop-shadow(8px 10px 0 rgba(0,0,0,0.28))"
            : undefined,
        }}
      >
        {/* Cuando duo > 0 mezclamos: capa original con opacidad (1-duo) + capa teñida
            con opacidad (duo), así valores intermedios funden multicolor↔duotono. */}
        {duo < 1 && (
          <img
            src={sticker.url}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: 1 - duo,
            }}
          />
        )}
        {duo > 0 && (
          <img
            src={sticker.url}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: duo,
              filter: `url(#${filterId})`,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
