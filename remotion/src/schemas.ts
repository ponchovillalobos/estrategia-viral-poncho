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
});
export type IconSticker = z.infer<typeof iconStickerSchema>;

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
