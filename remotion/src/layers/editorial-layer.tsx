import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { LineArtIcon, type LineArtKind } from "./line-art-icons";

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
  /** Ilustración line-art ("" = sin ícono). */
  icon: z.enum(["", "clock", "calendar", "funnel", "faucet", "radar", "chart"]).default(""),
});
export type EditorialCard = z.infer<typeof editorialCardSchema>;

export const editorialLayoutSchema = z.object({
  /** Lado donde vive el PANEL DE VIDEO (el texto va al lado contrario). */
  panel: z.enum(["right", "left"]).default("right"),
  /** Ancho del panel de video como fracción del frame (0.3-0.5). */
  panelWidth: z.number().default(0.40),
});
export type EditorialLayout = z.infer<typeof editorialLayoutSchema>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const GOLD = "#f0b429";
const CREAM = "#f3ede1";
const GRAY = "#9b958a";

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
}> = ({ card, currentTime, layout, width, height }) => {
  const t = currentTime - card.at;
  const remaining = card.at + (card.duration ?? 5) - currentTime;
  if (t < 0 || remaining < 0) return null;
  const fadeOut = clamp01(remaining / 0.35);

  const textOnLeft = (layout.panel ?? "right") === "right";
  const zoneWidth = width * (1 - (layout.panelWidth ?? 0.4)) - 90;
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
                color: GRAY,
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
                fontFamily: PLAYFAIR,
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
                  fontFamily: PLAYFAIR,
                  fontWeight: 900,
                  fontSize: titleSize * 1.5,
                  color: CREAM,
                }}
              >
                {card.statValue}
              </span>
              {card.statUnit ? (
                <span
                  style={{
                    fontFamily: PLAYFAIR_IT,
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: titleSize * 0.85,
                    color: CREAM,
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
                fontFamily: PLAYFAIR,
                fontWeight: 900,
                fontSize: titleSize,
                lineHeight: 1.06,
                color: CREAM,
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
                        ? { fontFamily: PLAYFAIR_IT, fontStyle: "italic", color: GOLD }
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
                fontFamily: PLAYFAIR,
                fontWeight: 500,
                fontSize: titleSize * 0.42,
                color: GRAY,
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
            <LineArtIcon
              kind={card.icon as LineArtKind}
              elapsed={Math.max(0, t - 0.4)}
              size={Math.min(zoneWidth * 0.52, height * 0.3)}
            />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
