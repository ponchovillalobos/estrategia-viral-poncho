// FX enrichments opt-in que mutan el `project` antes del render. Cada función
// está envuelta en try/catch — si falla, project queda sin esa mejora pero el
// render sigue (semántica histórica: ningún FX opcional rompe el pipeline).
//
// Convocados desde el loop por-estilo en processJob:
//   - applyTracking      → trackPath para TrackedLayer (hype y similares).
//   - applyRemoveBg      → foregroundVideoId (broll_pip).
//   - applyVoiceover     → voiceoverUrl con Piper (C1) o XTTS clon (C2).
//   - applyTextBehind    → foregroundVideoId con texto detrás del sujeto (A3).
//   - applyTranslate     → captionTranslated en otro idioma (C3).

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  PYTHON_DIR,
  PYTHON_EXE,
  RAW_DIR,
  VOICEOVER_DIR,
  TRANSCRIPTS_DIR,
  DATA_ROOT,
} from "@/lib/paths";
import { runProcess, parseLastJsonLine } from "@/lib/run-process";
import { findRawVideo } from "./helpers";
import type { ResolvedProject } from "./types";

/**
 * Modo Gráficos & Motion (estilos graphics_*): genera gráficas animadas (contador/
 * barras/línea/dona) + titulares poderosos desde el transcript del short, con
 * generate_graphics.py, y los deja en project.dataViz / project.kineticHeadlines.
 * Las gráficas solo salen si el contenido menciona números (%, "3 veces", "de 23 a 78");
 * los titulares salen siempre. Si Ollama está offline, cae a heurística (no rompe).
 */
export async function applyGraphics(
  project: ResolvedProject,
  videoId: string
): Promise<void> {
  if (!project.graphics) return;
  try {
    const transcriptPath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);
    const hasTranscript = await fs.access(transcriptPath).then(() => true).catch(() => false);
    if (!hasTranscript) return;

    const outDir = path.join(DATA_ROOT, "graphics");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${videoId}.json`);

    const run = await runProcess(
      PYTHON_EXE,
      [
        path.join(PYTHON_DIR, "generate_graphics.py"),
        "--transcript", transcriptPath,
        "--out", outPath,
      ],
      PYTHON_DIR,
      undefined,
      120_000
    );
    if (!run.ok) return;

    const raw = await fs.readFile(outPath, "utf-8").catch(() => null);
    if (!raw) return;
    const g = JSON.parse(raw) as {
      dataViz?: unknown[];
      kineticHeadlines?: unknown[];
      iconStickers?: unknown[];
      editorialCards?: unknown[];
    };
    // EDITORIAL: las tarjetas tipográficas REEMPLAZAN charts/íconos (el lado
    // oscuro es de las tarjetas; mezclar saturaría). Solo si el estilo lo es.
    if (project.editorialLayout) {
      if (Array.isArray(g.editorialCards)) project.editorialCards = g.editorialCards;
      console.log(`[auto-build] editorial: ${g.editorialCards?.length ?? 0} tarjetas`);
      return;
    }
    if (Array.isArray(g.dataViz)) project.dataViz = g.dataViz;
    if (Array.isArray(g.kineticHeadlines)) project.kineticHeadlines = g.kineticHeadlines;
    // Íconos de concepto (visuales) — se suman a los que ya trae el estilo.
    if (Array.isArray(g.iconStickers) && g.iconStickers.length) {
      project.iconStickers = [...(project.iconStickers ?? []), ...g.iconStickers];
    }
    console.log(
      `[auto-build] gráficos: ${project.dataViz?.length ?? 0} charts · ${(project.iconStickers as unknown[] | undefined)?.length ?? 0} íconos`
    );
  } catch (err) {
    console.warn("[auto-build] gráficos falló:", err);
  }
}

/**
 * F1 — DIRECTOR EMOCIONAL: analiza CÓMO habla el speaker (no solo qué dice) con
 * emotion_director.py (librosa, 100% local) y dirige la edición con el resultado:
 *   1. musicVolumeCurve → auto-ducking: la música baja cuando hay voz y respira
 *      en pausas largas (lo que Wisecut cobra, acá gratis).
 *   2. reactionZooms en los PICOS emocionales (solo en estilos dinámicos — si el
 *      estilo no trae zooms, no se inventa ninguno).
 *   3. Volumen de cada SFX modulado por el arousal local (momento intenso → SFX
 *      presente; momento calmo → SFX sutil). Nada de SFX a volumen fijo.
 *   4. project.mood (hype/tension/inspirador/chill/epico) queda guardado para la
 *      selección de música y futuras decisiones.
 * Best-effort: si el análisis falla, el render sale exactamente como antes.
 */
export async function applyEmotionDirector(
  project: ResolvedProject,
  videoId: string
): Promise<void> {
  try {
    const rawVideo = await findRawVideo(videoId);
    if (!rawVideo) return;
    const outDir = path.join(DATA_ROOT, "emotion");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${videoId}.json`);
    const transcriptPath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);

    const run = await runProcess(
      PYTHON_EXE,
      [
        path.join(PYTHON_DIR, "emotion_director.py"),
        rawVideo,
        "--transcript", transcriptPath,
        "--out", outPath,
      ],
      PYTHON_DIR,
      undefined,
      180_000
    );
    if (!run.ok) return;
    const raw = await fs.readFile(outPath, "utf-8").catch(() => null);
    if (!raw) return;
    const e = JSON.parse(raw) as {
      ok?: boolean;
      mood?: string;
      peaks?: { t: number; score: number }[];
      ducking?: { t: number; v: number }[];
      arousal?: { t: number; a: number }[];
    };
    if (!e.ok) return;

    project.mood = e.mood;

    // 1) Auto-ducking — solo tiene sentido si el estilo trae música.
    if (project.musicTrack && Array.isArray(e.ducking) && e.ducking.length > 1) {
      project.musicVolumeCurve = e.ducking;
    }

    // 2) Zooms de reacción en picos emocionales — solo en estilos ya dinámicos.
    const existingZm = (project.zoomMarks ?? []) as { at: number }[];
    const existingRz = (project.reactionZooms ?? []) as { at: number }[];
    const isDynamic = existingZm.length > 0 || existingRz.length > 0;
    if (isDynamic && Array.isArray(e.peaks)) {
      const added = e.peaks
        .filter((p) => p.score >= 0.55)
        .filter((p) => !existingRz.some((z) => Math.abs(z.at - p.t) < 2.5))
        .slice(0, 3)
        .map((p) => ({ at: p.t, intensity: 1.35, duration: 0.25 }));
      if (added.length > 0) {
        project.reactionZooms = [...existingRz, ...added];
      }
      // 2b) MICRO PUNCH-INS (tendencia 2026): en los picos moderados, un zoom sutil
      // del 8% en vez de corte duro — se siente "premium" sin marear.
      const micro = e.peaks
        .filter((p) => p.score >= 0.35 && p.score < 0.55)
        .filter((p) => !existingZm.some((z) => Math.abs(z.at - p.t) < 2.0))
        .map((p) => ({ at: p.t, duration: 0.5, scale: 1.08 }));
      if (micro.length > 0) {
        project.zoomMarks = [...existingZm, ...micro];
      }
      // 2c) F3 — CHISPAS en el pico emocional MÁXIMO: el momento más intenso del
      // video recibe una explosión de partículas (1 sola — el exceso lo abarata).
      const top = [...e.peaks].sort((a, b) => b.score - a.score)[0];
      if (top && top.score >= 0.6) {
        project.particleBursts = [
          ...((project.particleBursts ?? []) as unknown[]),
          { at: top.t, duration: 1.6, kind: "sparks", count: 60 },
        ] as typeof project.particleBursts;
      }
    }

    // 3) Volumen de SFX según el arousal del momento (0.28 calmo → 0.58 intenso).
    const sfx = project.sfxMarks as { at: number; volume?: number }[] | undefined;
    if (Array.isArray(sfx) && Array.isArray(e.arousal) && e.arousal.length > 0) {
      const arousalAt = (t: number): number => {
        let best = e.arousal![0];
        for (const pt of e.arousal!) {
          if (Math.abs(pt.t - t) < Math.abs(best.t - t)) best = pt;
        }
        return best.a;
      };
      for (const m of sfx) {
        m.volume = Math.min(0.58, Math.max(0.25, +(0.28 + 0.3 * arousalAt(m.at)).toFixed(2)));
      }
    }

    console.log(
      `[auto-build] director emocional: mood=${e.mood} · ${e.peaks?.length ?? 0} picos · ducking=${e.ducking?.length ?? 0} pts`
    );
  } catch (err) {
    console.warn("[auto-build] director emocional falló:", err);
  }
}

/** Motion tracking: detecta cara en el raw, llena project.trackPath. */
export async function applyTracking(
  project: ResolvedProject,
  videoId: string
): Promise<void> {
  if (!project.tracking) return;
  try {
    const rawVideo = await findRawVideo(videoId);
    if (!rawVideo) return;
    const trackRun = await runProcess(
      PYTHON_EXE,
      [path.join(PYTHON_DIR, "track_subject.py"), rawVideo, "0.15"],
      PYTHON_DIR,
      undefined,
      180_000
    );
    if (!trackRun.ok) return;
    const line = trackRun.stdout
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("{"))
      .pop();
    const parsed = line ? (JSON.parse(line) as { points?: unknown[] }) : null;
    const pts = parsed?.points ?? [];
    project.trackPath = pts;
    // F2 — Subtítulos FUERA de la cara: si la cara vive en la zona baja del frame
    // (donde van los subtítulos), el texto se mueve arriba. Nunca tapa al speaker.
    const ys = (pts as { y?: number }[])
      .map((p) => p.y)
      .filter((y): y is number => typeof y === "number");
    if (ys.length > 3) {
      const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
      if (avgY > 0.62) {
        project.subtitlePosition = "top";
        console.log(`[auto-build] cara abajo (y=${avgY.toFixed(2)}) → subtítulos ARRIBA`);
      }
    }
    console.log(`[auto-build] motion tracking: ${pts.length} puntos de cara`);
  } catch (err) {
    console.warn("[auto-build] tracking falló:", err);
  }
}

/** Quitar fondo con IA: genera <videoId>_fg.mp4 y lo marca como foregroundVideoId. */
export async function applyRemoveBg(
  project: ResolvedProject,
  videoId: string
): Promise<void> {
  if (!project.removeBg) return;
  try {
    const rawVideo = await findRawVideo(videoId);
    if (!rawVideo) return;
    const fgId = `${videoId}_fg`;
    const fgPath = path.join(RAW_DIR, `${fgId}.mp4`);
    const bgRun = await runProcess(
      PYTHON_EXE,
      [path.join(PYTHON_DIR, "remove_background.py"), rawVideo, fgPath, "blur"],
      PYTHON_DIR,
      undefined,
      600_000 // 10 min — segmentación por frame puede tardar en videos largos
    );
    const parsedBg = bgRun.ok ? parseLastJsonLine<{ ok?: boolean }>(bgRun.stdout) : null;
    const okFlag = parsedBg?.ok === true;
    if (okFlag && (await fs.access(fgPath).then(() => true).catch(() => false))) {
      project.foregroundVideoId = fgId;
      console.log(`[auto-build] quitar fondo IA: ${fgId}.mp4 generado`);
    } else {
      console.warn("[auto-build] quitar fondo: no se generó el compuesto, sigo con el raw");
    }
  } catch (err) {
    console.warn("[auto-build] quitar fondo falló:", err);
  }
}

/**
 * Voz IA (C1/C2). Sintetiza desde project.voiceover.text.
 *   - Con speakerWav → C2 (XTTS-v2 clona tu voz, ~1.8GB modelo).
 *   - Sin speakerWav → C1 (Piper, voz ES default, ~63MB).
 * Setea project.voiceoverUrl/Volume/StartSec al éxito.
 */
export async function applyVoiceover(
  project: ResolvedProject,
  projectId: string
): Promise<void> {
  const vo = project.voiceover;
  if (!vo || !vo.text || vo.text.trim().length === 0) return;
  try {
    await fs.mkdir(VOICEOVER_DIR, { recursive: true });
    const voFile = `${projectId}.wav`;
    const voPath = path.join(VOICEOVER_DIR, voFile);
    const useXtts = Boolean(vo.speakerWav);
    const scriptArgs = useXtts
      ? [
          path.join(PYTHON_DIR, "xtts.py"),
          vo.text,
          voPath,
          "--speaker",
          vo.speakerWav!,
          "--lang",
          vo.lang ?? "es",
        ]
      : [path.join(PYTHON_DIR, "tts.py"), vo.text, voPath];
    // XTTS es CPU-intensivo + descarga el modelo la primera vez → timeout más amplio.
    const ttsTimeout = useXtts ? 900_000 : 180_000;
    const ttsRun = await runProcess(
      PYTHON_EXE,
      scriptArgs,
      PYTHON_DIR,
      undefined,
      ttsTimeout
    );
    const parsed = ttsRun.ok ? parseLastJsonLine<{ ok?: boolean }>(ttsRun.stdout) : null;
    if (parsed?.ok && (await fs.access(voPath).then(() => true).catch(() => false))) {
      const apiHost = process.env.VIRAL_API_HOST ?? "http://localhost:3000";
      project.voiceoverUrl = `${apiHost}/api/voiceover/stream?file=${encodeURIComponent(voFile)}`;
      project.voiceoverVolume = vo.volume ?? 0.7;
      project.voiceoverStartSec = vo.startSec ?? 0;
      console.log(`[auto-build] voz IA (${useXtts ? "XTTS clon" : "Piper"}): ${voFile}`);
    } else {
      console.warn("[auto-build] tts.py no generó WAV; render sin voz");
    }
  } catch (err) {
    console.warn("[auto-build] voz IA falló:", err);
  }
}

/** A3 — Texto detrás del sujeto: bake el efecto en un nuevo mp4 y marca foregroundVideoId. */
export async function applyTextBehind(
  project: ResolvedProject,
  videoId: string
): Promise<void> {
  const tb = project.textBehind;
  if (!tb || !tb.phrase) return;
  try {
    const rawVideo = await findRawVideo(videoId);
    if (!rawVideo) return;
    const tbId = `${videoId}_textbehind`;
    const tbPath = path.join(RAW_DIR, `${tbId}.mp4`);
    const tbRun = await runProcess(
      PYTHON_EXE,
      [
        path.join(PYTHON_DIR, "text_behind_subject.py"),
        rawVideo,
        tbPath,
        tb.phrase,
        "--color",
        tb.color || "ffffff",
      ],
      PYTHON_DIR,
      undefined,
      600_000 // 10 min — segmentación por frame
    );
    const parsedTb = tbRun.ok ? parseLastJsonLine<{ ok?: boolean }>(tbRun.stdout) : null;
    const okFlag = parsedTb?.ok === true;
    if (okFlag && (await fs.access(tbPath).then(() => true).catch(() => false))) {
      project.foregroundVideoId = tbId;
      console.log(`[auto-build] texto-detrás-del-sujeto: ${tbId}.mp4 generado`);
    } else {
      console.warn("[auto-build] texto-detrás: no se generó, sigo con el raw");
    }
  } catch (err) {
    console.warn("[auto-build] texto-detrás-del-sujeto falló:", err);
  }
}

/** C3 — Traducción de caption: setea project.captionTranslated. */
export async function applyTranslate(project: ResolvedProject): Promise<void> {
  const translateTo = project.translateTo;
  const captionToTranslate = project.caption;
  if (!translateTo || !captionToTranslate || captionToTranslate.trim().length === 0) return;
  try {
    const trRun = await runProcess(
      PYTHON_EXE,
      [path.join(PYTHON_DIR, "translate.py"), captionToTranslate, "--to", translateTo],
      PYTHON_DIR,
      undefined,
      60_000
    );
    const parsed = trRun.ok
      ? parseLastJsonLine<{ ok?: boolean; translated?: string }>(trRun.stdout)
      : null;
    if (parsed?.ok && parsed.translated) {
      project.captionTranslated = parsed.translated;
      console.log(`[auto-build] traducción es→${translateTo} OK`);
    } else {
      console.warn(`[auto-build] translate.py no devolvió texto (${trRun.stderr.slice(-200)})`);
    }
  } catch (err) {
    console.warn("[auto-build] traducción falló:", err);
  }
}
