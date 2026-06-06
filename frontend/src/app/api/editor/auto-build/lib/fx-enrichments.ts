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
    };
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
