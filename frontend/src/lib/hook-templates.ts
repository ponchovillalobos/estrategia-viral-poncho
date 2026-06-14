/**
 * PLANTILLAS DE HOOK (el diferenciador OpusClip/Submagic) — versión TS para el frontend
 * (UI del wizard / preview / tipos compartidos).
 *
 * **PARIDAD**: este archivo es el espejo TS de remotion/hook-templates.mjs. NUNCA editar
 * uno sin el otro — la data de las plantillas (HOOK_TEMPLATES) debe ser IDÉNTICA en ambos.
 * Un test estático (remotion/check-hook-parity.mjs) compara los ids/campos.
 *
 * QUÉ ES: un hook template es un PRESET DE SISTEMA que orquesta capas que YA existen
 * (kineticHeadline + un sticker emoji/icono + un SFX whoosh + un zoom/flash al arranque)
 * para clavar el "gancho" en los primeros ~2.5s del video. No inventa capas nuevas: sólo
 * las compone con timing/colores curados.
 *
 * El builder de props (build-props.mjs / build-clip-props.mjs) es quien APLICA el hook al
 * render; este archivo provee el catálogo + tipos a la UI.
 */

export type HookEffect =
  | "split_letters"
  | "glitch"
  | "shimmer"
  | "draw_on"
  | "gradient_sweep"
  | "tracking_in";

export interface HookSticker {
  kind: "emoji" | "icon";
  value: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center";
}

export interface HookTemplate {
  label: string;
  headline: { text: string; effect: HookEffect; size?: number };
  sticker?: HookSticker;
  sfx?: string;
  zoom?: { scale: number };
  flash?: boolean;
  accent?: string;
}

export const HOOK_AT = 0.15;
export const HOOK_DUR = 2.4;

export const HOOK_TEMPLATES: Record<string, HookTemplate> = {
  espera_final: {
    label: "Espérate al final",
    headline: { text: "ESPÉRATE AL FINAL", effect: "tracking_in", size: 118 },
    sticker: { kind: "emoji", value: "👀", position: "top-right" },
    sfx: "swoosh.wav",
    zoom: { scale: 1.12 },
    flash: false,
    accent: "#fbbf24",
  },
  plot_twist: {
    label: "Plot twist",
    headline: { text: "PLOT TWIST", effect: "glitch", size: 150 },
    sticker: { kind: "emoji", value: "🤯", position: "top-center" },
    sfx: "swoosh_quick.wav",
    zoom: { scale: 1.16 },
    flash: true,
    accent: "#22d3ee",
  },
  nadie_te_dijo: {
    label: "Nadie te dijo esto",
    headline: { text: "NADIE TE DIJO ESTO", effect: "split_letters", size: 110 },
    sticker: { kind: "icon", value: "sparkles", position: "top-right" },
    sfx: "swoosh.wav",
    zoom: { scale: 1.1 },
    flash: false,
    accent: "#a78bfa",
  },
  pov: {
    label: "POV:",
    headline: { text: "POV:", effect: "tracking_in", size: 170 },
    sticker: { kind: "emoji", value: "😏", position: "top-left" },
    sfx: "pop.ogg",
    zoom: { scale: 1.08 },
    flash: false,
    accent: "#34d399",
  },
  tres_errores: {
    label: "3 errores que…",
    headline: { text: "3 ERRORES QUE TODOS COMETEN", effect: "split_letters", size: 96 },
    sticker: { kind: "emoji", value: "⚠️", position: "top-center" },
    sfx: "ding.ogg",
    zoom: { scale: 1.1 },
    flash: false,
    accent: "#f87171",
  },
  no_hagas_esto: {
    label: "No hagas esto",
    headline: { text: "NO HAGAS ESTO", effect: "glitch", size: 130 },
    sticker: { kind: "emoji", value: "🚫", position: "top-right" },
    sfx: "thud.wav",
    zoom: { scale: 1.14 },
    flash: true,
    accent: "#ef4444",
  },
  secreto: {
    label: "El secreto que…",
    headline: { text: "EL SECRETO QUE NADIE CUENTA", effect: "shimmer", size: 98 },
    sticker: { kind: "icon", value: "lock", position: "top-right" },
    sfx: "ding_bell.ogg",
    zoom: { scale: 1.1 },
    flash: false,
    accent: "#fbbf24",
  },
  esto_cambia_todo: {
    label: "Esto lo cambia todo",
    headline: { text: "ESTO LO CAMBIA TODO", effect: "gradient_sweep", size: 108 },
    sticker: { kind: "emoji", value: "💥", position: "top-center" },
    sfx: "swoosh.wav",
    zoom: { scale: 1.15 },
    flash: true,
    accent: "#22d3ee",
  },
  como_hacer: {
    label: "Cómo hacer…",
    headline: { text: "CÓMO LO HICE", effect: "draw_on", size: 120 },
    sticker: { kind: "icon", value: "rocket", position: "top-right" },
    sfx: "swoosh_quick.wav",
    zoom: { scale: 1.1 },
    flash: false,
    accent: "#34d399",
  },
  deja_de: {
    label: "Deja de hacer esto",
    headline: { text: "DEJA DE HACER ESTO", effect: "tracking_in", size: 112 },
    sticker: { kind: "emoji", value: "✋", position: "top-center" },
    sfx: "thud.wav",
    zoom: { scale: 1.12 },
    flash: false,
    accent: "#f87171",
  },
  te_apuesto: {
    label: "Te apuesto que no sabías",
    headline: { text: "TE APUESTO QUE NO SABÍAS", effect: "split_letters", size: 96 },
    sticker: { kind: "emoji", value: "🤔", position: "top-right" },
    sfx: "notification.ogg",
    zoom: { scale: 1.1 },
    flash: false,
    accent: "#a78bfa",
  },
  esto_es_ilegal: {
    label: "Esto debería ser ilegal",
    headline: { text: "ESTO DEBERÍA SER ILEGAL", effect: "glitch", size: 96 },
    sticker: { kind: "emoji", value: "🔥", position: "top-center" },
    sfx: "swoosh.wav",
    zoom: { scale: 1.16 },
    flash: true,
    accent: "#fbbf24",
  },
};

export const HOOK_TEMPLATE_IDS = Object.keys(HOOK_TEMPLATES);

/** Opciones {id, label} listas para un <select> en el wizard. */
export const HOOK_TEMPLATE_OPTIONS = HOOK_TEMPLATE_IDS.map((id) => ({
  id,
  label: HOOK_TEMPLATES[id].label,
}));
