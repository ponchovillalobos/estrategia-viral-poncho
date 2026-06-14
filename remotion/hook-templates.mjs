/**
 * PLANTILLAS DE HOOK (el diferenciador OpusClip/Submagic) — versión .mjs para los
 * builders de props de Remotion (build-props.mjs shorts / build-clip-props.mjs largos).
 *
 * **PARIDAD**: este archivo es el espejo JS de frontend/src/lib/hook-templates.ts.
 * NUNCA editar uno sin el otro — la data de las plantillas (HOOK_TEMPLATES) debe ser
 * IDÉNTICA en ambos. Un test estático (check-hook-parity.mjs) compara los ids/campos.
 *
 * QUÉ ES: un hook template es un PRESET DE SISTEMA que orquesta capas que YA existen
 * (kineticHeadline + un sticker emoji/icono + un SFX whoosh + un zoom/flash al arranque)
 * para clavar el "gancho" en los primeros ~2.5s del video — justo lo que hace que el
 * espectador no haga scroll. No inventa capas nuevas: sólo las compone con timing/colores
 * curados.
 *
 * CÓMO SE APLICA (ADITIVO): el builder llama applyHookTemplate(props, hookTemplateId).
 *   - Si hookTemplateId es falsy o desconocido → devuelve props SIN tocar (render idéntico).
 *   - Si existe → mergea (UNSHIFT, no reemplaza) los items del hook al ARRANQUE de las
 *     arrays existentes: kineticHeadlines, floatingEmojis/iconStickers, sfxMarks, zoomMarks,
 *     stutterMarks. El resto del video queda igual.
 *
 * OPT-IN: el campo vive en project.hookTemplate (string id) o project.hook (alias). Los
 * proyectos viejos no lo traen → applyHookTemplate es no-op.
 */

// ─── Catálogo de plantillas ────────────────────────────────────────────────
// Cada plantilla define:
//   headline: { text, effect, size?, accent? }  — titular poderoso (kinetic-headline-layer)
//   sticker:  { kind:"emoji"|"icon", value, position? } — emoji flotante o icon sticker
//   sfx:      nombre del whoosh (sfx-index resuelve por basename)
//   zoom:     { scale } — zoom punch al inicio (zoomMarks)
//   flash:    bool — micro-stutter/flash al frame 0 (stutterMarks, usa el flash cinematic)
//   accent:   color del titular/sticker (cae al accent del proyecto si se omite)
//
// El `effect` debe ser uno de los del kineticHeadlineSchema:
//   split_letters · glitch · shimmer · draw_on · gradient_sweep · tracking_in
//
// El timing es relativo al arranque del clip: el headline entra en HOOK_AT (0.15s),
// dura HOOK_DUR (2.4s). El sticker acompaña, el whoosh suena en 0.1s, el zoom en 0.0s.

export const HOOK_AT = 0.15;
export const HOOK_DUR = 2.4;

export const HOOK_TEMPLATES = {
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

/** Lista de ids para UIs/tests. */
export const HOOK_TEMPLATE_IDS = Object.keys(HOOK_TEMPLATES);

/**
 * Construye los ITEMS de capas (sin envolver) para una plantilla. Útil para previews
 * o para componer manualmente. `accent` del proyecto sobre-escribe el de la plantilla
 * sólo si la plantilla no trae uno propio (las plantillas SÍ traen color curado, así
 * que en la práctica gana el de la plantilla).
 */
export function buildHookItems(tpl, projectAccent) {
  const accent = tpl.accent || projectAccent || "#34d399";
  const headline = {
    at: HOOK_AT,
    duration: HOOK_DUR,
    text: tpl.headline.text,
    effect: tpl.headline.effect,
    color: "#ffffff",
    accent,
    position: "center",
    size: tpl.headline.size ?? 130,
  };

  // Sticker: emoji flotante (floatingEmojis) o icon sticker (iconStickers).
  let floatingEmoji = null;
  let iconSticker = null;
  if (tpl.sticker?.kind === "emoji") {
    const fromByPos = {
      "top-left": "left",
      "top-right": "right",
      "top-center": "top",
      "bottom-left": "left",
      "bottom-right": "right",
    };
    floatingEmoji = {
      at: HOOK_AT + 0.1,
      duration: HOOK_DUR - 0.3,
      emoji: tpl.sticker.value,
      from: fromByPos[tpl.sticker.position] ?? "top",
      size: 200,
      yOffset: 0,
    };
  } else if (tpl.sticker?.kind === "icon") {
    iconSticker = {
      at: HOOK_AT + 0.1,
      duration: HOOK_DUR - 0.3,
      icon: tpl.sticker.value,
      position: tpl.sticker.position ?? "top-right",
      color: "#0a0a0a",
      bg: accent,
      size: 130,
      fullscreen: false,
      label: "",
      lottieSrc: "",
      iconSvg: "",
    };
  }

  const sfxMark = tpl.sfx ? { at: 0.1, sound: tpl.sfx, volume: 0.4 } : null;
  const zoomMark = tpl.zoom ? { at: 0.0, duration: 0.55, scale: tpl.zoom.scale } : null;
  const stutterMark = tpl.flash ? { at: 0.0, duration: 0.18 } : null;

  return { headline, floatingEmoji, iconSticker, sfxMark, zoomMark, stutterMark };
}

/**
 * APLICA una plantilla de hook a un objeto de props YA construido (mutación inmutable:
 * devuelve un nuevo objeto). ADITIVO: hace UNSHIFT de los items del hook al arranque
 * de las arrays existentes, sin tocar el resto.
 *
 * @param props     props ya armados por el builder (tienen kineticHeadlines, sfxMarks…)
 * @param hookId    id de la plantilla (project.hookTemplate). Falsy/desconocido = no-op.
 * @param sfxUrlFor (opcional) fn(soundName) → url. Si se pasa, el sfxMark del hook sale
 *                  con `url` ya resuelta (igual que el resto de sfxMarks del builder).
 * @returns         props con el hook aplicado (o los mismos props si no aplica).
 */
export function applyHookTemplate(props, hookId, sfxUrlFor) {
  if (!hookId) return props;
  const tpl = HOOK_TEMPLATES[hookId];
  if (!tpl) return props;

  // El accent del proyecto: lo tomamos del subtitleHighlight de los props.
  const projectAccent = props.subtitleHighlight || "#34d399";
  const { headline, floatingEmoji, iconSticker, sfxMark, zoomMark, stutterMark } =
    buildHookItems(tpl, projectAccent);

  const out = { ...props };
  out.kineticHeadlines = [headline, ...(props.kineticHeadlines || [])];
  if (floatingEmoji) out.floatingEmojis = [floatingEmoji, ...(props.floatingEmojis || [])];
  if (iconSticker) out.iconStickers = [iconSticker, ...(props.iconStickers || [])];
  if (sfxMark) {
    const mark = sfxUrlFor
      ? { ...sfxMark, url: sfxUrlFor(sfxMark.sound) }
      : sfxMark;
    out.sfxMarks = [mark, ...(props.sfxMarks || [])];
  }
  if (zoomMark) out.zoomMarks = [zoomMark, ...(props.zoomMarks || [])];
  if (stutterMark) out.stutterMarks = [stutterMark, ...(props.stutterMarks || [])];

  return out;
}
