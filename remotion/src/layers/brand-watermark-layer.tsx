import { AbsoluteFill } from "remotion";
import type { BrandKit } from "../schemas";

/**
 * B6 — Marca de agua: handle (y/o logo) fijo en una esquina con opacidad sutil. Se
 * monta sobre TODO el video; auto-build rellena el `handle` desde user-settings si el
 * estilo activó `brandKit`. Si `handle` y `logoUrl` están vacíos, ViralVideo no la monta.
 */
export const BrandWatermarkLayer: React.FC<{
  config: BrandKit;
  fontFamily: string;
}> = ({ config, fontFamily }) => {
  const isTop = config.position.startsWith("top");
  const isLeft = config.position.endsWith("left");
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: isTop ? "flex-start" : "flex-end",
        alignItems: isLeft ? "flex-start" : "flex-end",
        padding: 48,
        opacity: config.opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {config.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logoUrl} alt="" style={{ height: 56, width: "auto" }} />
        ) : null}
        {config.handle ? (
          <span
            style={{
              fontFamily,
              fontSize: 36,
              fontWeight: 700,
              color: config.color,
              letterSpacing: "0.04em",
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
            }}
          >
            {config.handle.startsWith("@") ? config.handle : `@${config.handle}`}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
