/**
 * Build props.json para un clip del long_form.
 *
 * Diferencias con build-props.mjs:
 *  - Lee transcript desde long_form/transcripts/
 *  - Lee proyecto desde long_form/projects/
 *  - rawVideoUrl apunta a /api/long_form/stream?file=<clip>&source=clip
 *  - No aplica jump cuts (el clip ya viene del video CLEAN sin silencios)
 *
 * Uso:
 *   node build-clip-props.mjs <clip_id> [style_id] [out_file]
 *   - out_file (opcional): nombre del props file de salida (default "props.json").
 *     Lo usa el render PARALELO de largos: cada worker escribe su propio
 *     props_{clipId}_{styleId}.json para no pisarse entre sí.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { existsSync as _existsSync } from "node:fs";
function pickDataRoot() {
  const o = process.env.VIRAL_DATA_ROOT;
  if (o) return o;
  for (const c of ["C:\\viral-data\\videos", "C:\\hermes-data\\videos"]) {
    if (_existsSync(c)) return c;
  }
  return "C:\\viral-data\\videos";
}
const DATA_ROOT = pickDataRoot();
const LF = path.join(DATA_ROOT, "long_form");
const HOST = process.env.VIRAL_API_HOST ?? "http://localhost:3000";

const clipId = process.argv[2];
const styleId = process.argv[3] || null; // opcional — si falta intenta legacy {clipId}.json
const outName = process.argv[4] || "props.json"; // opcional — props file único (render paralelo)
if (!clipId) {
  console.error("Uso: node build-clip-props.mjs <clip_id> [style_id]");
  console.error("  style_id opcional. Si se pasa, lee {clipId}_{style_id}.json");
  console.error("  Si se omite, fallback orden: {clipId}.json → {clipId}_supreme.json");
  process.exit(1);
}

// Resolver path del project — soportar 3 layouts:
//   1. styleId explícito → {clipId}_{styleId}.json
//   2. legacy sin sufijo → {clipId}.json (compat con renders viejos)
//   3. fallback default → {clipId}_supreme.json
function resolveProjectPath() {
  if (styleId) {
    return path.join(LF, "projects", `${clipId}_${styleId}.json`);
  }
  const legacy = path.join(LF, "projects", `${clipId}.json`);
  if (_existsSync(legacy)) return legacy;
  return path.join(LF, "projects", `${clipId}_supreme.json`);
}

const projectPath = resolveProjectPath();
const transcriptPath = path.join(LF, "transcripts", `${clipId}.json`);

const project = JSON.parse(readFileSync(projectPath, "utf-8"));
const transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));

const words = (transcript.words || []).map((w) => ({
  word: w.word,
  start: w.start,
  end: w.end,
}));

const sfxMarks = (project.sfxMarks || []).map((m) => ({
  at: m.at,
  sound: m.sound,
  volume: m.volume ?? 0.4,
  url: `${HOST}/api/sfx/stream?file=${encodeURIComponent(m.sound)}`,
}));

// Subtítulos: si el estilo trae manualSubtitles, respetarlos; si no, los del transcript.
const subtitles =
  project.manualSubtitles && project.manualSubtitles.length > 0
    ? project.manualSubtitles
    : words;

const props = {
  rawVideoUrl: `${HOST}/api/long_form/stream?file=${encodeURIComponent(clipId)}&source=clip`,
  videoDurationSec: +transcript.duration.toFixed(3),
  words: subtitles,
  bRoll: (project.bRoll || []).map((c) => ({ start: c.start, end: c.end, url: c.url })),
  musicUrl: project.musicTrack
    ? `${HOST}/api/music/stream?file=${encodeURIComponent(project.musicTrack)}`
    : null,
  musicVolume: project.musicVolume ?? 0.15,
  // F1 — Director emocional: curva de ducking de la música (pass-through; los clips
  // de largos no hacen jump cuts, no hay remap).
  musicVolumeCurve: project.musicVolumeCurve || [],
  subtitleStyle: project.subtitleStyle ?? "anton",
  subtitleColor: project.subtitleColor ?? "#ffffff",
  subtitleHighlight: project.subtitleHighlight ?? "#34d399",
  subtitleFont: project.subtitleFont ?? "auto",
  // F2 — subtítulos fuera de la cara: "top" si el tracking detectó la cara abajo.
  subtitlePosition: project.subtitlePosition ?? "bottom",
  animations: project.animations || [],
  emphasisCards: project.emphasisCards || [],
  bRollMode: project.bRollMode ?? "pip",
  zoomMarks: project.zoomMarks || [],
  wordStickers: project.wordStickers || [],
  floatingEmojis: project.floatingEmojis || [],
  colorRotation: project.colorRotation || [],
  vignette: project.vignette ?? true,
  reactionZooms: project.reactionZooms || [],
  stutterMarks: project.stutterMarks || [],
  captionBounce: project.captionBounce ?? true,
  sfxMarks,
  // Dimensiones del composition. Default 1080×1920 (vertical 9:16).
  width: project.width ?? 1080,
  height: project.height ?? 1920,
  // ─── Paridad con build-props.mjs (shorts): FX que el estilo genera vía
  //     buildProjectForStyle pero que ANTES se descartaban en el render de largos.
  //     Los clips de largos NO hacen jump-cut (vienen del CLEAN sin silencios), así
  //     que no hay remap de timestamps — es pass-through directo. Defaults vacíos/none
  //     = render idéntico para un proyecto que no traiga el campo. ───
  sceneFx: project.sceneFx || [],
  proTransitions: project.proTransitions || [],
  kineticPreset: project.kineticPreset ?? "none",
  mirrorFx: project.mirrorFx || [],
  trackPath: project.trackPath || [],
  trackedItems: project.trackedItems || [],
  iconStickers: project.iconStickers || [],
  speedRamps: project.speedRamps || [],
  lottieStickers: project.lottieStickers || [],
  endScreen: project.endScreen ?? null,
  progressBar: project.progressBar ?? false,
  brandKit: project.brandKit ?? null,
  cameraMoves: Array.isArray(project.cameraMoves) ? project.cameraMoves : [],
  filmGrain: project.filmGrain ?? false,
  cinematicDensity: project.cinematicDensity ?? "medium",
  // Voz IA (largos no la cablea aún → null = sin voz). Pass-through por si un futuro
  // estilo/flag la setea en el project.
  voiceoverUrl: project.voiceoverUrl ?? null,
  voiceoverVolume: project.voiceoverVolume ?? 0.7,
  voiceoverStartSec: project.voiceoverStartSec ?? 0,
  // autoReframe sólo se activa si hay trackPath real (lo llena el pipeline con
  // track_subject.py sobre el clip). Sin puntos, reframear no tiene a qué seguir →
  // lo dejamos en false para no introducir un crop errático.
  autoReframe: Boolean(project.autoReframe) && (project.trackPath || []).length > 0,
  sourceAspect: project.sourceAspect ?? 16 / 9,
  // Modo Gráficos & Motion: charts + titulares poderosos. El project puede traerlos,
  // o el generador los deja en long_form/graphics/{clipId}.json (auto desde el transcript).
  dataViz: project.dataViz || [],
  kineticHeadlines: project.kineticHeadlines || [],
};

// Si existe un spec de gráficos generado por generate_graphics.py, lo mergeamos.
// (Sólo existe cuando el usuario eligió "Modo Gráficos" → si no, esto no hace nada.)
const graphicsPath = path.join(LF, "graphics", `${clipId}.json`);
if (_existsSync(graphicsPath)) {
  try {
    const g = JSON.parse(readFileSync(graphicsPath, "utf-8"));
    if (Array.isArray(g.dataViz) && g.dataViz.length) props.dataViz = g.dataViz;
    if (Array.isArray(g.kineticHeadlines) && g.kineticHeadlines.length) {
      props.kineticHeadlines = g.kineticHeadlines;
    }
    // Íconos de concepto (visuales) generados desde el transcript — se suman a los del estilo.
    if (Array.isArray(g.iconStickers) && g.iconStickers.length) {
      props.iconStickers = [...(props.iconStickers || []), ...g.iconStickers];
    }
    console.error(
      `[graphics] mergeado ${props.dataViz.length} charts · ${(props.iconStickers || []).length} íconos`,
    );
  } catch (e) {
    console.error(`[graphics] no pude leer ${graphicsPath}: ${e.message}`);
  }
}

const outFile = path.join(__dirname, path.basename(outName));
writeFileSync(outFile, JSON.stringify(props, null, 2), "utf-8");
console.log(
  `OK ${clipId} · subs:${props.words.length} · stickers:${props.wordStickers.length} · emphasis:${props.emphasisCards.length} · emojis:${props.floatingEmojis.length} · sfx:${props.sfxMarks.length} · duration:${props.videoDurationSec}s`
);
