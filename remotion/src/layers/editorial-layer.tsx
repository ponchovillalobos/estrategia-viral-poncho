import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { LineArtIcon, LineArtLucide, LINE_ART_KINDS, type LineArtKind } from "./line-art-icons";

/**
 * EDITORIAL — Tarjetas tipográficas estilo revista/documental (referencia: los
 * screenshots del dueño). El video vive en un panel lateral; el lado oscuro
 * muestra: kicker en mayúsculas espaciadas, titular serif GIGANTE con la palabra
 * acento en dorado-itálica, subtítulo gris, capítulos numerados (01 · 01/04),
 * stats enormes ($300 al día) e ilustraciones line-art animadas.
 */
const { fontFamily: PLAYFAIR } = loadPlayfair("normal", {
  weights: ["500", "700", "900"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: PLAYFAIR_IT } = loadPlayfair("italic", {
  weights: ["500", "700", "900"],
  subsets: ["latin", "latin-ext"],
});
// Temas tipográficos extra (todas Google Fonts gratis).
import { loadFont as loadDMSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadAbril } from "@remotion/google-fonts/AbrilFatface";
const { fontFamily: DMSERIF } = loadDMSerif("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
const { fontFamily: DMSERIF_IT } = loadDMSerif("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] });
const { fontFamily: LORA } = loadLora("normal", { weights: ["500", "700"], subsets: ["latin", "latin-ext"] });
const { fontFamily: LORA_IT } = loadLora("italic", { weights: ["500", "700"], subsets: ["latin", "latin-ext"] });
const { fontFamily: ABRIL } = loadAbril("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });

/** Familia (normal, itálica) por tema de fuente. Abril no tiene itálica → reusa. */
const FONT_THEMES: Record<string, [string, string]> = {
  playfair: [PLAYFAIR, PLAYFAIR_IT],
  dmserif: [DMSERIF, DMSERIF_IT],
  lora: [LORA, LORA_IT],
  abril: [ABRIL, ABRIL],
};

/** Colores de lienzo/texto por fondo. */
export const EDITORIAL_BG: Record<string, { bg: string; text: string; muted: string }> = {
  dark: { bg: "#0a0908", text: "#f3ede1", muted: "#9b958a" },
  ink: { bg: "#0a0f16", text: "#e9eef5", muted: "#8b95a3" },
  cream: { bg: "#f5efe3", text: "#1c1611", muted: "#7a7163" },
};

export const editorialCardSchema = z.object({
  at: z.number(),
  duration: z.number().default(5),
  /** Mini-etiqueta arriba del titular: "LA VERDAD", "HOY TE ENSEÑO · 01 / 04" */
  kicker: z.string().default(""),
  /** Titular serif. La palabra que coincida con `accent` va en dorado itálica. */
  title: z.string().default(""),
  accent: z.string().default(""),
  subtitle: z.string().default(""),
  /** Capítulo: "01" grande dorado (si viene). */
  number: z.string().default(""),
  /** Stat: valor enorme ("$300") + unidad itálica ("al día"). */
  statValue: z.string().default(""),
  statUnit: z.string().default(""),
  /** Ilustración line-art ("" = sin ícono). 18 dibujadas a mano (clock, funnel,
   *  faucet, gears, route…) o CUALQUIER nombre de ícono Lucide ("shield-check",
   *  "users", "map-pin"… 1,500+) animado genéricamente. */
  icon: z.string().default(""),
});
export type EditorialCard = z.infer<typeof editorialCardSchema>;

export const editorialLayoutSchema = z.object({
  /** Lado donde vive el PANEL DE VIDEO (el texto va al lado contrario). */
  panel: z.enum(["right", "left"]).default("right"),
  /** Ancho del panel de video como fracción del frame (0.3-0.5). */
  panelWidth: z.number().default(0.40),
  /** Color de acento del tema (reemplaza al dorado clásico): palabra itálica,
   *  números de capítulo y detalles de las ilustraciones line-art. */
  accent: z.string().default("#f0b429"),
  /** Fuente serif del tema. */
  font: z.enum(["playfair", "dmserif", "lora", "abril"]).default("playfair"),
  /** Fondo del lienzo: oscuro clásico, tinta azulada, o crema claro (texto invertido). */
  background: z.enum(["dark", "ink", "cream"]).default("dark"),
  /** ESCENAS del panel de video: cambia de tamaño/lugar a lo largo del video
   *  (derecha → izquierda → cuadrado → grande → FULLSCREEN al final) con
   *  transición suave. [] = panel estático (compat). */
  scenes: z
    .array(
      z.object({
        at: z.number(),
        mode: z.enum(["right", "left", "square_right", "square_left", "big", "full"]),
      })
    )
    .default([]),
});
export type EditorialLayout = z.infer<typeof editorialLayoutSchema>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ─── PANEL DINÁMICO: rect del video por escena, con transición suave. ─────────
export interface PanelRect {
  x: number; y: number; w: number; h: number; r: number;
  /** En "big"/"full" las tarjetas se ocultan: el video respira. */
  cardsHidden: boolean;
  /** Lado donde va el TEXTO (contrario al panel). */
  textSide: "left" | "right";
}

type PanelMode = "right" | "left" | "square_right" | "square_left" | "big" | "full";

function rectFor(
  mode: PanelMode,
  pw: number,
  W: number,
  H: number,
  sourceAspect?: number
): PanelRect {
  const tall = { w: pw * W, h: 0.88 * H, y: 0.06 * H, r: 18 };
  const s = Math.min(0.52 * H, 0.8 * W);
  switch (mode) {
    case "left":
      return { x: 36, ...tall, cardsHidden: false, textSide: "right" };
    case "square_right":
      return { x: W - 48 - s, y: (H - s) / 2, w: s, h: s, r: 24, cardsHidden: false, textSide: "left" };
    case "square_left":
      return { x: 48, y: (H - s) / 2, w: s, h: s, r: 24, cardsHidden: false, textSide: "right" };
    case "big": {
      const bw = 0.56 * W;
      const bh = 0.78 * H;
      return { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh, r: 22, cardsHidden: true, textSide: "left" };
    }
    case "full": {
      // FULLSCREEN solo si el aspecto del VIDEO ORIGINAL coincide con el del
      // output (±15%). Si no (ej: fuente 9:16 en salida 16:9), recortar a
      // pantalla completa destruiría el encuadre → escena de CIERRE: panel
      // grande que RESPETA el aspecto de la fuente + tarjeta final visible.
      const outAspect = W / H;
      const src = sourceAspect && sourceAspect > 0 ? sourceAspect : outAspect;
      const mismatch = Math.abs(src - outAspect) / outAspect > 0.15;
      if (!mismatch) {
        return { x: 0, y: 0, w: W, h: H, r: 0, cardsHidden: true, textSide: "left" };
      }
      const ch = 0.88 * H;
      const cw = Math.min(ch * src, 0.6 * W);
      return {
        x: W - 48 - cw,
        y: (H - ch) / 2,
        w: cw,
        h: cw / src,
        r: 20,
        cardsHidden: false,
        textSide: "left",
      };
    }
    default: // right
      return { x: W - 36 - pw * W, ...tall, cardsHidden: false, textSide: "left" };
  }
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Rect del panel en el tiempo t: interpola entre la escena anterior y la actual
 *  durante 0.8s (ease cúbico). Sin escenas → panel estático clásico. */
export function editorialPanelAt(
  layout: EditorialLayout,
  t: number,
  W: number,
  H: number,
  sourceAspect?: number
): PanelRect {
  const pw = layout.panelWidth ?? 0.4;
  const baseMode: PanelMode = (layout.panel ?? "right") as PanelMode;
  const scenes = (layout.scenes ?? []).filter((s) => typeof s?.at === "number");
  if (scenes.length === 0) return rectFor(baseMode, pw, W, H, sourceAspect);

  const sorted = [...scenes].sort((a, b) => a.at - b.at);
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].at <= t) idx = i;
    else break;
  }
  const prevMode: PanelMode = idx <= 0 ? (idx === 0 ? baseMode : baseMode) : (sorted[idx - 1].mode as PanelMode);
  const curMode: PanelMode = idx < 0 ? baseMode : (sorted[idx].mode as PanelMode);
  const from = rectFor(idx <= 0 ? baseMode : prevMode, pw, W, H, sourceAspect);
  const to = rectFor(curMode, pw, W, H, sourceAspect);
  const p = idx < 0 ? 1 : easeInOut(clamp01((t - sorted[idx].at) / 0.8));
  const lerp = (a: number, b: number) => a + (b - a) * p;
  return {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    w: lerp(from.w, to.w),
    h: lerp(from.h, to.h),
    r: lerp(from.r, to.r),
    cardsHidden: p > 0.4 ? to.cardsHidden : from.cardsHidden,
    textSide: p > 0.4 ? to.textSide : from.textSide,
  };
}

/** Entrada por líneas: slide-up con máscara (el look "editorial" clásico). */
const Reveal: React.FC<{ t: number; delay: number; children: React.ReactNode }> = ({
  t,
  delay,
  children,
}) => {
  const p = clamp01((t - delay) / 0.5);
  const ease = 1 - Math.pow(1 - p, 3);
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{ transform: `translateY(${(1 - ease) * 110}%)`, opacity: p > 0 ? 1 : 0 }}>
        {children}
      </div>
    </div>
  );
};

export const EditorialCardLayer: React.FC<{
  card: EditorialCard;
  currentTime: number;
  layout: EditorialLayout;
  width: number;
  height: number;
  /** Rect actual del panel dinámico (define lado del texto y ancho disponible). */
  panel?: PanelRect;
}> = ({ card, currentTime, layout, width, height, panel }) => {
  const GOLD = layout.accent ?? "#f0b429";
  const [FONT_N, FONT_I] = FONT_THEMES[layout.font ?? "playfair"] ?? FONT_THEMES.playfair;
  const theme = EDITORIAL_BG[layout.background ?? "dark"] ?? EDITORIAL_BG.dark;
  const TEXT = theme.text;
  const MUTED = theme.muted;
  const t = currentTime - card.at;
  const remaining = card.at + (card.duration ?? 5) - currentTime;
  if (t < 0 || remaining < 0) return null;
  const fadeOut = clamp01(remaining / 0.35);

  const textOnLeft =
    (panel?.textSide ?? ((layout.panel ?? "right") === "right" ? "left" : "right")) === "left";
  const zoneWidth = panel
    ? Math.max(width * 0.3, width - panel.w - 140)
    : width * (1 - (layout.panelWidth ?? 0.4)) - 90;
  const isStat = Boolean(card.statValue);
  const hasIcon = Boolean(card.icon);
  // Escala tipográfica relativa al alto del frame (sirve igual en 9:16 y 16:9).
  const titleSize = Math.min(zoneWidth * 0.135, height * 0.075);

  // Titular con la palabra acento en dorado-itálica (match por inclusión, sin caso).
  const accentLc = (card.accent ?? "").toLowerCase();
  const words = (card.title ?? "").split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: fadeOut }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [textOnLeft ? "left" : "right"]: 56,
          width: zoneWidth,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: height * 0.014,
        }}
      >
        {card.kicker ? (
          <Reveal t={t} delay={0.05}>
            <div
              style={{
                fontFamily: "Arial, sans-serif",
                fontSize: height * 0.0165,
                letterSpacing: "0.5em",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              {card.kicker}
            </div>
          </Reveal>
        ) : null}

        {card.number ? (
          <Reveal t={t} delay={0.18}>
            <div
              style={{
                fontFamily: FONT_N,
                fontWeight: 900,
                fontSize: titleSize * 1.05,
                lineHeight: 1,
                color: GOLD,
              }}
            >
              {card.number}
            </div>
          </Reveal>
        ) : null}

        {isStat ? (
          <Reveal t={t} delay={0.18}>
            <div style={{ lineHeight: 1.02 }}>
              <span
                style={{
                  fontFamily: FONT_N,
                  fontWeight: 900,
                  fontSize: titleSize * 1.5,
                  color: TEXT,
                }}
              >
                {card.statValue}
              </span>
              {card.statUnit ? (
                <span
                  style={{
                    fontFamily: FONT_I,
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: titleSize * 0.85,
                    color: TEXT,
                    marginLeft: 14,
                  }}
                >
                  {card.statUnit}
                </span>
              ) : null}
            </div>
          </Reveal>
        ) : null}

        {words.length > 0 && (
          <Reveal t={t} delay={isStat || card.number ? 0.32 : 0.18}>
            <div
              style={{
                fontFamily: FONT_N,
                fontWeight: 900,
                fontSize: titleSize,
                lineHeight: 1.06,
                color: TEXT,
              }}
            >
              {words.map((w, i) => {
                const isAccent =
                  accentLc.length > 1 &&
                  w.toLowerCase().replace(/[.,;:!?¿¡]/g, "").includes(accentLc);
                return (
                  <span
                    key={i}
                    style={
                      isAccent
                        ? { fontFamily: FONT_I, fontStyle: "italic", color: GOLD }
                        : undefined
                    }
                  >
                    {w}
                    {i < words.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </div>
          </Reveal>
        )}

        {card.subtitle ? (
          <Reveal t={t} delay={0.5}>
            <div
              style={{
                fontFamily: FONT_N,
                fontWeight: 500,
                fontSize: titleSize * 0.42,
                color: MUTED,
                lineHeight: 1.35,
                maxWidth: zoneWidth * 0.92,
              }}
            >
              {card.subtitle}
            </div>
          </Reveal>
        ) : null}

        {hasIcon ? (
          <div style={{ marginTop: height * 0.02, opacity: clamp01((t - 0.4) / 0.3) }}>
            {LINE_ART_KINDS.includes(card.icon as LineArtKind) ? (
              <LineArtIcon
                kind={card.icon as LineArtKind}
                elapsed={Math.max(0, t - 0.4)}
                size={Math.min(zoneWidth * 0.52, height * 0.3)}
                gold={GOLD}
              />
            ) : (
              // Cualquier ícono Lucide (1,500+) animado genéricamente.
              <LineArtLucide
                name={card.icon}
                elapsed={Math.max(0, t - 0.4)}
                size={Math.min(zoneWidth * 0.44, height * 0.26)}
                gold={GOLD}
              />
            )}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
