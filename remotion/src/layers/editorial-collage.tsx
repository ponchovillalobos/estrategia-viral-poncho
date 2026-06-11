import { AbsoluteFill, Img } from "remotion";
import { z } from "zod";
import { stepTime } from "./editorial-texture";
import { resolveEditorialLook } from "./editorial-themes";
import type { EditorialLayout, PanelRect } from "./editorial-layer";
import { editorialFontsFor } from "./editorial-layer";

/**
 * EDITORIAL — Tarjeta de COLLAGE (Ola 6): el sujeto recortado con rembg
 * (cutout_subject.py) como papel recortado:
 *   - borde blanco "de tijera" (drop-shadows apilados en 4 direcciones)
 *   - sombra dura desplazada (no blur: papel sobre papel)
 *   - rotación ±3° con jitter stop-motion a 12 fps
 *   - Ken Burns 2.5D sutil: el recorte respira (scale 1→1.06) sobre el lienzo
 *     estático — profundidad sin tocar el fondo.
 * Mientras está activa, las tarjetas normales se ocultan (anti-encime).
 */

export const editorialCutoutSchema = z.object({
  at: z.number(),
  duration: z.number().default(4.5),
  url: z.string(),
});
export type EditorialCutout = z.infer<typeof editorialCutoutSchema>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const EditorialCutoutLayer: React.FC<{
  cut: EditorialCutout;
  currentTime: number;
  layout: EditorialLayout;
  width: number;
  height: number;
  panel?: PanelRect | null;
}> = ({ cut, currentTime, layout, width, height, panel }) => {
  const look = resolveEditorialLook(layout);
  const GOLD = layout.accent ?? look.themeAccent ?? "#f0b429";
  const MUTED = look.canvas.muted;
  const [FONT_TITLE, FONT_KICKER] = editorialFontsFor(layout);
  const now = stepTime(currentTime, layout.fps12);
  const t = now - cut.at;
  const remaining = cut.at + (cut.duration ?? 4.5) - now;
  if (t < 0 || remaining < 0) return null;
  const fadeOut = clamp01(remaining / 0.35);
  const p = 1 - Math.pow(1 - clamp01(t / 0.7), 3);

  // Zona de texto (igual que tarjetas/charts).
  const textOnLeft = (panel?.textSide ?? "left") === "left";
  const textBelow = Boolean(panel?.textBelow);
  const zoneWidth = textBelow
    ? width - 112
    : panel
      ? Math.max(width * 0.3, width - panel.w - 140)
      : width * (1 - (layout.panelWidth ?? 0.4)) - 90;
  const zoneStyle: React.CSSProperties = textBelow && panel
    ? { position: "absolute", left: 56, right: 56, top: panel.y + panel.h + height * 0.03, bottom: height * 0.04, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: height * 0.014 }
    : { position: "absolute", top: 0, bottom: 0, [textOnLeft ? "left" : "right"]: 56, width: zoneWidth, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: height * 0.014 };

  // Jitter stop-motion (12 fps): rotación y posición tiemblan apenas.
  const step = Math.floor(now * 12);
  const rot = -3 + ((step % 3) - 1) * 0.9;
  const jx = ((step * 7) % 5) - 2;
  const jy = ((step * 11) % 5) - 2;
  // Ken Burns 2.5D: el recorte respira lento (LINEAL, nunca spring).
  const kb = 1 + 0.06 * clamp01(t / (cut.duration ?? 4.5));
  const imgH = textBelow ? height * 0.26 : Math.min(zoneWidth * 1.05, height * 0.34);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: fadeOut }}>
      <div style={zoneStyle}>
        <div style={{ fontFamily: FONT_KICKER, fontSize: height * 0.0165, letterSpacing: "0.5em", textTransform: "uppercase", color: MUTED, overflow: "hidden" }}>
          <div style={{ transform: `translateY(${(1 - p) * 110}%)` }}>EL MOMENTO</div>
        </div>
        <div
          style={{
            opacity: p,
            transform: `rotate(${rot.toFixed(1)}deg) translate(${jx}px, ${jy}px) scale(${(0.92 + 0.08 * p).toFixed(3)})`,
          }}
        >
          <Img
            src={cut.url}
            style={{
              height: imgH,
              width: "auto",
              transform: `scale(${kb.toFixed(4)})`,
              // borde de tijera (outline blanco) + sombra dura de papel.
              filter:
                "drop-shadow(3px 0 0 #fdfcf8) drop-shadow(-3px 0 0 #fdfcf8) drop-shadow(0 3px 0 #fdfcf8) drop-shadow(0 -3px 0 #fdfcf8) drop-shadow(12px 16px 0 rgba(0,0,0,0.22))",
            }}
          />
        </div>
        {/* pie de lámina: filete corto del acento */}
        <div style={{ width: zoneWidth * 0.16 * p, borderTop: `3px solid ${GOLD}` }} />
        <div style={{ fontFamily: FONT_TITLE, fontStyle: "italic", fontSize: height * 0.016, color: MUTED, opacity: 0.85 }}>
          — en vivo —
        </div>
      </div>
    </AbsoluteFill>
  );
};
