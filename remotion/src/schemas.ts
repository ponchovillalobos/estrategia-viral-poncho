/**
 * Schemas zod de ViralVideo, extraídos para que sean compartidos entre el componente
 * principal y las sub-capas (sin que ViralVideo cargue 130 líneas de schemas inline).
 *
 * Cada schema viene con su tipo inferido exportado, listo para usar en props de capas.
 */
import { z } from "zod";

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
export type Word = z.infer<typeof wordSchema>;

export const bRollSchema = z.object({
  start: z.number(),
  end: z.number(),
  url: z.string(),
});
export type BRollClip = z.infer<typeof bRollSchema>;

export const animationSchema = z.object({
  at: z.number(),
  type: z.enum(["zoom", "glow", "shake"]),
});
export type Animation = z.infer<typeof animationSchema>;

export const emphasisCardSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.9),
  word: z.string(),
  emoji: z.string(),
  bg: z.string().default("#09090b"),
  color: z.string().default("#fafafa"),
  accent: z.string().default("#34d399"),
});
export type EmphasisCard = z.infer<typeof emphasisCardSchema>;

export const zoomMarkSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.6),
  scale: z.number().default(1.15),
});
export type ZoomMark = z.infer<typeof zoomMarkSchema>;

export const wordStickerSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.1),
  word: z.string(),
  emoji: z.string(),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "top-center"])
    .default("top-right"),
  rotation: z.number().default(-5),
  bg: z.string().default("#fbbf24"),
  color: z.string().default("#0a0a0a"),
});
export type WordSticker = z.infer<typeof wordStickerSchema>;

export const floatingEmojiSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.2),
  emoji: z.string(),
  from: z.enum(["left", "right", "top", "bottom"]).default("left"),
  size: z.number().default(180),
  yOffset: z.number().default(0),
});
export type FloatingEmoji = z.infer<typeof floatingEmojiSchema>;

export const reactionZoomSchema = z.object({
  at: z.number(),
  intensity: z.number().default(1.4),
  duration: z.number().default(0.25),
});
export type ReactionZoom = z.infer<typeof reactionZoomSchema>;

export const stutterMarkSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.2),
});
export type StutterMark = z.infer<typeof stutterMarkSchema>;

export const sfxMarkSchema = z.object({
  at: z.number(),
  sound: z.string(),
  url: z.string().optional(),
  volume: z.number().default(0.4),
});
export type SfxMark = z.infer<typeof sfxMarkSchema>;

// A6 — End-screen / CTA: tarjeta animada en los últimos `durationSec` del video.
export const endScreenSchema = z.object({
  text: z.string().default("Seguime para más"),
  handle: z.string().default(""),
  emoji: z.string().default("🔥"),
  durationSec: z.number().default(2.5),
  bg: z.string().default("#0a0a0a"),
  accent: z.string().default("#34d399"),
});
export type EndScreen = z.infer<typeof endScreenSchema>;

// A4 — Speed ramp: ventana donde se overlay-ea el source playing a `rate` < 1 (slow-mo)
// o > 1 (acelerado). El video base sigue corriendo a 1x debajo; al terminar la ventana
// reaparece. La duración total del video NO cambia.
export const speedRampSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.5),
  rate: z.number().default(0.5),
});
export type SpeedRamp = z.infer<typeof speedRampSchema>;

// B5 — Icon sticker: aparece N segundos con un icono del ICON_MAP + bg circular opcional.
export const iconStickerSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.1),
  icon: z.string().default("sparkles"),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "top-center"])
    .default("top-right"),
  color: z.string().default("#0a0a0a"),
  bg: z.string().default("#fbbf24"),
  size: z.number().default(120),
  // Si true → "tarjeta de diseño" FULLSCREEN: la pantalla se oscurece y aparece el
  // ícono gigante animado + una palabra (label). Es el momento "motion graphic".
  fullscreen: z.boolean().default(false),
  label: z.string().default(""),
  // ILUSTRACIÓN ANIMADA (Lottie de Noto): si viene una URL, se renderiza la
  // animación de escena (dinero volando, reloj sonando, cohete…) EN LUGAR del
  // ícono estático. "" = ícono clásico (compat total con projects viejos).
  lottieSrc: z.string().default(""),
});
export type IconSticker = z.infer<typeof iconStickerSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// MODO GRÁFICOS & MOTION (opt-in, ADITIVO) — charts animados + texto poderoso.
// Defaults vacíos = render idéntico. Se animan 100% con useCurrentFrame() en SVG.
// ═══════════════════════════════════════════════════════════════════════════

// Un punto de dato para barras/línea/dona.
export const dataPointSchema = z.object({
  label: z.string().default(""),
  value: z.number(),
  color: z.string().optional(),
});
export type DataPoint = z.infer<typeof dataPointSchema>;

// Gráfica animada: contador, barras, línea o dona. Aparece en `at` por `duration` seg.
export const dataVizSchema = z.object({
  at: z.number(),
  duration: z.number().default(4),
  type: z
    .enum([
      "counter", "bar", "line", "donut",
      // Tipos visuales nuevos:
      "progress",    // gauge/barra que se llena a un %
      "comparison",  // dos paneles VS (izq vs der)
      "pictograph",  // X de Y representado con íconos/puntos
      "steps",       // lista numerada 1·2·3 animada
      "rating",      // estrellas (X de 5)
    ])
    .default("counter"),
  title: z.string().default(""),
  // counter: usa data[0].value. bar/line/donut: usa todos los puntos.
  data: z.array(dataPointSchema).default([]),
  prefix: z.string().default(""), // "$"
  suffix: z.string().default(""), // "%", "k", "M"
  accent: z.string().default("#34d399"),
  bg: z.string().default("#0a0a0aE6"),
  position: z.enum(["center", "top", "bottom"]).default("center"),
  fullscreen: z.boolean().default(true), // tarjeta fullscreen vs flotante
  total: z.number().optional(),  // pictograph: total de íconos (data[0].value = llenos)
  max: z.number().optional(),    // rating: máximo de estrellas (default 5)
});
export type DataViz = z.infer<typeof dataVizSchema>;

// Titular animado "poderoso" con un efecto. Aparece en `at` por `duration` seg.
export const kineticHeadlineSchema = z.object({
  at: z.number(),
  duration: z.number().default(2.5),
  text: z.string(),
  effect: z
    .enum([
      "split_letters", // letras entran escalonadas con spring
      "glitch", // copias RGB desalineadas (datamosh)
      "shimmer", // barrido de brillo sobre gradiente
      "draw_on", // contorno SVG que se dibuja
      "gradient_sweep", // gradiente que se desplaza
      "tracking_in", // expande letter-spacing + blur-in
    ])
    .default("split_letters"),
  color: z.string().default("#ffffff"),
  accent: z.string().default("#34d399"),
  position: z.enum(["center", "top", "bottom"]).default("center"),
  size: z.number().default(130),
});
export type KineticHeadline = z.infer<typeof kineticHeadlineSchema>;

// B6 — Brand kit / marca de agua: handle (y/o logo) sutil en una esquina, todo el video.
export const brandKitSchema = z.object({
  handle: z.string().default(""),
  logoUrl: z.string().default(""),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right"])
    .default("bottom-right"),
  opacity: z.number().default(0.55),
  color: z.string().default("#ffffff"),
});
export type BrandKit = z.infer<typeof brandKitSchema>;

// B4 — Sticker ANIMADO (Lottie). Animación vectorial que se mueve en loop (no un emoji
// estático). Aparece en `at` por `duration` seg. `name` selecciona una animación CC0
// propia bundleada en src/lottie/. `color` tiñe el glow (las formas base son blancas).
export const lottieStickerSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.6),
  name: z.enum(["pulse_ring", "sparkle", "arrow_down", "star5"]).default("sparkle"),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "top-center", "center"])
    .default("top-right"),
  size: z.number().default(220),
  color: z.string().default("#fbbf24"),
});
export type LottieSticker = z.infer<typeof lottieStickerSchema>;
