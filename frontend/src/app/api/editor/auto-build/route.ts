import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  PROJECTS_DIR,
  RAW_DIR,
  TRANSCRIPTS_DIR,
  REMOTION_DIR,
  RENDERS_DIR,
  PYTHON_EXE,
  PYTHON_DIR,
} from "@/lib/paths";
import {
  buildProjectForStyle,
  type BuildContext,
} from "@/lib/style-templates";
import { createJob, updateStep, setCurrentStyle, type Job } from "@/lib/job-store";
import { enqueue } from "@/lib/job-queue";
import { autoMatchBroll, type BrollClip } from "@/lib/pexels";
import { writeJsonFileAtomic } from "@/lib/atomic-write";
import { readSettings } from "@/lib/user-settings";
import { runProcess } from "@/lib/run-process";
import {
  pickTopKeywords,
  sanitizeForFilename,
  generateContentTitle,
  type TranscriptWord,
} from "@/lib/content-title";
import {
  type AutoBuildRequest,
  type ResolvedProject,
} from "./lib/types";
import {
  STYLE_SHORT_LABEL,
  dimensionsFromAspect,
  uniqueProjectId,
} from "./lib/helpers";
import { enrichCinematic } from "./lib/enrich-cinematic";
import { resolveImageOverlays } from "./lib/resolve-overlays";
import { applyBeatSync } from "./lib/beat-sync";
import {
  applyTracking,
  applyRemoveBg,
  applyVoiceover,
  applyTextBehind,
  applyTranslate,
  applyGraphics,
} from "./lib/fx-enrichments";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

// CinematicConfig, AutoBuildRequest, ResolvedProject viven en ./lib/types.
// dimensionsFromAspect, findRawVideo, uniqueProjectId, STYLE_SHORT_LABEL viven en ./lib/helpers.
// TranscriptWord, pickTopKeywords, sanitizeForFilename, generateContentTitle viven en @/lib/content-title.
// runProcess + parseLastJsonLine viven en @/lib/run-process.

async function processJob(job: Job, body: AutoBuildRequest) {
  // Usar job.videoId (siempre string) en lugar de body.videoId (opcional ahora con batch)
  const videoId = job.videoId;
  const { accentColor, caption, captionMeta, platforms, day } = body;
  const hasWizardCopy = Boolean(captionMeta && caption);

  // 1. Verificar transcript
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);
  let transcript: { duration: number; words: TranscriptWord[] };
  try {
    transcript = JSON.parse(await fs.readFile(transcriptPath, "utf-8"));
  } catch {
    for (const s of job.styles) {
      updateStep(job.id, s, { status: "fail", error: "transcripción no existe" });
    }
    return;
  }

  // 2. Cuts si es necesario
  const needsCuts = job.styles.some(
    (s) => s === "hype_max" || s === "hype_max_sfx" || s === "graphics_max"
  );
  if (needsCuts) {
    const cutMp4 = path.join(RAW_DIR, `${videoId}_cut.mp4`);
    try {
      await fs.access(cutMp4);
    } catch {
      await runProcess(PYTHON_EXE, [path.join(PYTHON_DIR, "detect_silences.py"), `${videoId}.mp4`], PYTHON_DIR, undefined, 300_000);
      await runProcess(PYTHON_EXE, [path.join(PYTHON_DIR, "cut_silences.py"), `${videoId}.mp4`], PYTHON_DIR, undefined, 600_000);
    }
  }

  // 3. Contexto + aspect ratio + cinematic (opt-in)
  const keywords = pickTopKeywords(transcript.words, 7);
  const { width, height } = dimensionsFromAspect(body.aspectRatio);

  // Cargar overlays del store si vienen IDs (modo cinematográfico).
  // Resolver de timestamps (matcher determinístico → asamblea LLM si hace falta → fallback).
  const imageOverlaysForCtx: BuildContext["imageOverlays"] = await resolveImageOverlays({
    overlayIds: body.cinematic?.overlayIds ?? [],
    transcriptPath,
    transcriptDuration: transcript.duration,
    videoId,
  });

  // ─── Auto-enriquecimiento cinematográfico ──────────────────────────────────
  // Cuando hay imageOverlays, generar auto SFX + camera moves + jump cuts.
  // Densidad configurable (default medium). En tests A/B/C cambia entre low/medium/high.
  const cinematicDensity = (body.cinematic?.density as "low" | "medium" | "high") ?? "medium";
  const { autoSfxMarks, autoCameraMoves, autoStutterMarks } = await enrichCinematic({
    density: cinematicDensity,
    imageOverlays: imageOverlaysForCtx,
    transcript,
    transcriptPath,
    videoId,
  });

  const ctx: BuildContext = {
    videoId,
    duration: transcript.duration,
    keywords,
    accentColor,
    caption,
    day,
    width,
    height,
    imageOverlays: imageOverlaysForCtx,
    filmGrain: body.cinematic?.filmGrain ?? false,
    subtitleCinematic: body.cinematic?.subtitleCinematic ?? false,
    autoSfxMarks,
    autoCameraMoves,
    autoStutterMarks,
    cinematicDensity,
  };

  await fs.mkdir(PROJECTS_DIR, { recursive: true });

  // Título corto basado en el CONTENIDO del video (lo que más se dice), para que el archivo
  // de salida sea identificable: "<Título> <Estilo>.mp4". Cae al videoId si no hay nada útil.
  const contentTitle = sanitizeForFilename(generateContentTitle(transcript.words)) || videoId;

  // B6 — Handle para la marca de agua: prioridad instagram → linkedin → tiktok → facebook.
  // Si no hay ninguno configurado en settings, el watermark queda vacío y ViralVideo no lo
  // renderiza (render idéntico). Se lee una sola vez por job, no por estilo.
  let brandHandle = "";
  try {
    const s = await readSettings();
    brandHandle =
      s.handles?.instagram ||
      s.handles?.linkedin ||
      s.handles?.tiktok ||
      s.handles?.facebook ||
      "";
  } catch {
    /* sin settings → sin watermark, no rompe */
  }

  // 4. Procesar cada estilo
  for (const styleId of job.styles) {
    setCurrentStyle(job.id, styleId);
    updateStep(job.id, styleId, { status: "building", progress: 5 });

    // projectId = nombre del archivo de salida (.mp4 y .json). Declarado afuera del try
    // para poder limpiar el temporal en el catch. Se arma con el título + estilo legible.
    let projectId = `${videoId}_${styleId}${body.projectIdSuffix ?? ""}`;
    try {
      const baseProject = buildProjectForStyle(ctx, styleId);
      const styleLabel = STYLE_SHORT_LABEL[styleId] ?? styleId;
      projectId = await uniqueProjectId(
        sanitizeForFilename(`${contentTitle} ${styleLabel}`),
        videoId,
        body.projectIdSuffix ?? ""
      );

      // Auto B-roll desde Pexels por transcripción — SOLO estilos broll_*.
      // broll_full → fullscreen, broll_pip → pequeñito sobre el video. Si Pexels
      // falla o no hay key, queda [] y el render sale sin b-roll (no rompe).
      let autoBroll: BrollClip[] = [];
      if (styleId === "broll_full" || styleId === "broll_pip") {
        try {
          // Escalar la cantidad de clips con la DURACIÓN del video: ~1 clip cada 16s,
          // mínimo 5, máximo 40 (cada clip = 1 request a Pexels; 40 respeta el rate limit).
          // Antes era fijo en 5 → un video de 12 min recibía lo mismo que uno de 30s.
          const brollCount = Math.max(5, Math.min(40, Math.round(transcript.duration / 16)));
          // Pasamos TODAS las palabras del transcript (no solo las 7 keywords globales) para
          // que el matcher tenga candidatos repartidos a lo largo de todo el video.
          autoBroll = await autoMatchBroll(transcript.words, transcript.duration, {
            count: brollCount,
            clipDur: 3,
            orientation: "portrait",
          });
          console.log(
            `[auto-build] auto b-roll (${styleId}): ${autoBroll.length}/${brollCount} clips de Pexels ` +
              `(video ${Math.round(transcript.duration)}s)`
          );
        } catch (err) {
          console.warn("[auto-build] auto b-roll falló:", err);
        }
      }

      const project: ResolvedProject = {
        ...baseProject,
        ...(autoBroll.length ? { bRoll: autoBroll } : {}),
        // El `id` interno DEBE coincidir con el filename (`${projectId}.json`) y el
        // render (`${projectId}.mp4`). Sin esto, los renders test A/B/C heredaban el
        // `id` base sin sufijo de buildProjectForStyle → keys duplicadas en React y
        // lookups rotos. Ver nota en /api/projects/route.ts.
        id: projectId,
        // videoId real (fuente para raw/transcript/cut) y título legible — el projectId ya
        // NO contiene el videoId, así que los guardamos explícitos en el JSON.
        videoId,
        title: contentTitle,
        styleId,
        // B6 — Si el estilo activó brandKit y hay handle en settings, rellenarlo. Si el
        // estilo no lo activó (no hay brandKit en baseProject), esto no hace nada.
        ...(() => {
          const bk = (baseProject as { brandKit?: { handle?: string } }).brandKit;
          if (bk && !bk.handle && brandHandle) {
            return { brandKit: { ...bk, handle: brandHandle } };
          }
          return {};
        })(),
        platforms: platforms ?? (baseProject as { platforms?: string[] }).platforms ?? [],
        captionMeta: captionMeta ?? (baseProject as { captionMeta?: unknown }).captionMeta ?? null,
        // Fuente de subtítulos elegida en el wizard ("auto" = la del estilo).
        ...(body.subtitleFont && body.subtitleFont !== "auto"
          ? { subtitleFont: body.subtitleFont }
          : {}),
      };

      await applyBeatSync(project, transcript.duration);

      // FX enrichments opt-in: tracking, bg-removal, voz IA, texto-detrás, traducción.
      // Cada uno muta `project` si su flag está activo; ninguno rompe si falla.
      await applyTracking(project, videoId);
      await applyRemoveBg(project, videoId);
      await applyVoiceover(project, projectId);
      await applyTextBehind(project, videoId);
      await applyTranslate(project);
      await applyGraphics(project, videoId);

      const projectPath = path.join(PROJECTS_DIR, `${projectId}.json`);
      await writeJsonFileAtomic(projectPath, project);

      // build-props
      const buildProps = await runProcess(
        "node",
        ["build-props.mjs", videoId, projectPath],
        REMOTION_DIR,
        undefined,
        120_000
      );
      if (!buildProps.ok) {
        updateStep(job.id, styleId, {
          status: "fail",
          error: `build-props: ${buildProps.stderr.slice(-300)}`,
        });
        continue;
      }

      // Render ATÓMICO: renderizamos (y post-procesamos LUT/mastering) sobre un archivo
      // temporal `__rendering.mp4`; sólo al final lo renombramos al .mp4 definitivo. Así, si
      // el server muere a mitad del render, NO queda un .mp4 parcial en la ruta final que el
      // dashboard o la reconciliación de jobs tomarían por "terminado".
      const finalOut = path.join(RENDERS_DIR, `${projectId}.mp4`);
      const outPath = path.join(RENDERS_DIR, `${projectId}.__rendering.mp4`);
      // Guardamos `output` ya en "rendering": como el projectId ahora es el título (no
      // videoId_estilo), la reconciliación al reiniciar necesita esta ruta para detectar
      // si el render llegó a completarse.
      updateStep(job.id, styleId, { status: "rendering", progress: 10, output: finalOut });
      // Limpiar restos de un intento anterior interrumpido (best-effort).
      await fs.rm(outPath, { force: true }).catch(() => {});
      const npxExe = process.platform === "win32" ? "npx.cmd" : "npx";
      // BUG FIX: en Windows, spawn con shell:true (necesario para .cmd) concatena los args
      // con espacios SIN quoting. Si el outPath tiene espacios (ej: "Video Imagen_hype.mp4"),
      // Remotion lo recibe como dos args: "Video" y "Imagen_hype.mp4" — el render termina
      // en "Video.mp4" (truncado en el primer espacio). Solución: quote explícito.
      const needsQuote = process.platform === "win32" && /\s/.test(outPath);
      const outArg = needsQuote ? `"${outPath}"` : outPath;
      const renderRun = await runProcess(
        npxExe,
        ["remotion", "render", "src/index.ts", "ViralVideo", outArg, "--props=props.json"],
        REMOTION_DIR,
        (chunk) => {
          // Remotion emite MUCHAS líneas "Rendered X/Y" muy seguidas y el stream las
          // agrupa en un mismo chunk. Hay que tomar la ÚLTIMA (la más reciente), no la
          // primera: si no, la barra reporta un frame viejo y queda muy por detrás del
          // render real (peor cuanto más largo el video → más updates por chunk).
          const matches = [...chunk.matchAll(/Rendered (\d+)\/(\d+)/g)];
          if (matches.length > 0) {
            const last = matches[matches.length - 1];
            const current = parseInt(last[1], 10);
            const total = parseInt(last[2], 10);
            if (total > 0 && current <= total) {
              const progress = Math.min(95, 10 + Math.floor((current / total) * 85));
              updateStep(job.id, styleId, {
                progress,
                currentFrame: current,
                totalFrames: total,
              });
            }
          }
        },
        // timeoutMs = undefined: un render largo es válido, no hay tope de tiempo total.
        undefined,
        // idleTimeoutMs = 15 min: si Remotion deja de emitir progreso por 15 min está colgado
        // → se mata, el step falla y la cola sigue con el próximo. Nunca queda trabada.
        15 * 60 * 1000
      );

      if (!renderRun.ok) {
        await fs.rm(outPath, { force: true }).catch(() => {});
        updateStep(job.id, styleId, {
          status: "fail",
          error: `render: ${renderRun.stderr.slice(-300)}`,
        });
        continue;
      }

      // Audio mastering post-render con ffmpeg — para TODOS los estilos.
      // Base (todos): alimiter (sin clipping) + loudnorm a -14 LUFS (estándar de
      // TikTok/Reels/IG → loudness consistente = mejor retención y "se oye pro").
      // cinematic_pro suma su cadena rica: acompressor + highpass 80Hz (quita
      // rumble) + EQ +2dB @ 3kHz (claridad de voz). Si ffmpeg falla, se conserva
      // el render sin master (no rompe el job).
      {
        updateStep(job.id, styleId, { progress: 96 });
        try {
          const masteredPath = outPath.replace(/\.mp4$/, "_mastered.mp4");
          const loudness = "loudnorm=I=-14:TP=-1.5:LRA=11";
          const audioFilter =
            styleId === "cinematic_pro"
              ? "acompressor=threshold=-18dB:ratio=3:attack=20:release=200," +
                "highpass=f=80," +
                "equalizer=f=3000:t=q:w=1:g=2," +
                "alimiter=level_in=1:level_out=0.95:limit=0.95," +
                loudness
              : "alimiter=level_in=1:level_out=0.95:limit=0.95," + loudness;
          const masterRun = await runProcess(
            "ffmpeg",
            [
              "-y",
              "-i", outPath,
              "-af", audioFilter,
              "-c:v", "copy",
              "-c:a", "aac",
              "-b:a", "192k",
              masteredPath,
            ],
            REMOTION_DIR,
            undefined,
            120_000 // timeout 2 min — si ffmpeg se cuelga, abortamos y dejamos el raw
          );
          if (masterRun.ok) {
            // Reemplazar el original con el mastered
            await fs.rename(outPath, outPath.replace(/\.mp4$/, "_raw.mp4"));
            await fs.rename(masteredPath, outPath);
            await fs.unlink(outPath.replace(/\.mp4$/, "_raw.mp4")).catch(() => {});
            console.log(`[auto-build] audio mastered: ${path.basename(outPath)}`);
          } else {
            console.warn(`[auto-build] ffmpeg mastering falló, manteniendo raw render`);
          }
        } catch (err) {
          console.warn(`[auto-build] audio mastering skipped:`, err);
        }
      }

      // === CapCut Pro — LUT 3D color grade (opt-in, ADITIVO) ===
      // Si el project trae `lut` (nombre de .cube en remotion/public/luts), aplica
      // un grade profesional con ffmpeg lut3d. Independiente del mastering de audio
      // (que sigue solo para cinematic_pro). Si el .cube no existe o ffmpeg falla,
      // se conserva el render sin LUT (no rompe el job). Estilos existentes no setean
      // `lut` → este bloque no corre para ellos (render idéntico).
      const lutName = project.lut;
      if (lutName) {
        updateStep(job.id, styleId, { progress: 96 });
        try {
          const lutPath = path.join(REMOTION_DIR, "public", "luts", lutName);
          const lutExists = await fs
            .access(lutPath)
            .then(() => true)
            .catch(() => false);
          if (!lutExists) {
            console.warn(`[auto-build] LUT no encontrado, se salta: ${lutName}`);
          } else {
            const gradedPath = outPath.replace(/\.mp4$/, "_graded.mp4");
            // Ruta relativa con forward-slashes (cwd=REMOTION_DIR) para evitar el
            // escaping del ":" de la unidad de Windows dentro del filtergraph.
            const lutFilter = `lut3d=public/luts/${lutName}`;
            const lutRun = await runProcess(
              "ffmpeg",
              [
                "-y",
                "-i", outPath,
                "-vf", lutFilter,
                "-c:a", "copy",
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "medium",
                "-pix_fmt", "yuv420p",
                gradedPath,
              ],
              REMOTION_DIR,
              undefined,
              180_000 // 3 min — re-encode de video
            );
            if (lutRun.ok) {
              await fs.rename(outPath, outPath.replace(/\.mp4$/, "_nolut.mp4"));
              await fs.rename(gradedPath, outPath);
              await fs.unlink(outPath.replace(/\.mp4$/, "_nolut.mp4")).catch(() => {});
              console.log(`[auto-build] LUT aplicado (${lutName}): ${path.basename(outPath)}`);
            } else {
              console.warn(`[auto-build] ffmpeg lut3d falló, manteniendo render sin LUT`);
            }
          }
        } catch (err) {
          console.warn(`[auto-build] LUT skipped:`, err);
        }
      }

      // Auto-generar caption viral si el wizard no lo trajo ya hecho
      updateStep(job.id, styleId, { progress: 97 });
      if (!hasWizardCopy) {
        try {
          await runProcess(
            PYTHON_EXE,
            [
              path.join(PYTHON_DIR, "generate_caption.py"),
              videoId,
              "--project-id",
              projectId,
            ],
            PYTHON_DIR,
            undefined,
            120_000
          );
        } catch {
          // Ignorar: el caption se puede regenerar manualmente desde /produccion
        }
      }

      // Publicar atómicamente: el .mp4 final aparece de una sola pieza recién acá.
      await fs.rename(outPath, finalOut);
      updateStep(job.id, styleId, { status: "ok", progress: 100, output: finalOut });
    } catch (err) {
      // Si quedó un temporal a medias por la excepción, limpiarlo (projectId ya resuelto).
      await fs.rm(path.join(RENDERS_DIR, `${projectId}.__rendering.mp4`), { force: true }).catch(() => {});
      updateStep(job.id, styleId, { status: "fail", error: String(err) });
    }
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AutoBuildRequest;
  const { videoId, videoIds, styles, accentColor } = body;

  // Normalizar a array: si vino videoIds[] usar ese; si no, fallback a videoId singular
  const videoIdList: string[] = (videoIds && videoIds.length > 0)
    ? videoIds
    : videoId ? [videoId] : [];

  if (videoIdList.length === 0 || !Array.isArray(styles) || styles.length === 0) {
    return NextResponse.json(
      { error: "videoId (o videoIds[]) y styles[] son requeridos" },
      { status: 400 }
    );
  }

  // Crear un Job por cada videoId y encolar (la cola serial los corre 1 a la vez)
  const jobs: Job[] = [];
  for (const vid of videoIdList) {
    const job = createJob(vid, styles, accentColor);
    jobs.push(job);
    // El body que recibe processJob tiene que tener videoId del job — no el original
    const jobBody: AutoBuildRequest = { ...body, videoId: vid, videoIds: undefined };
    enqueue("editor", job.id, async () => {
      await processJob(job, jobBody);
    });
  }

  return NextResponse.json({
    ok: true,
    // Backwards-compat: si era 1 solo, devolvemos jobId singular también
    jobId: jobs.length === 1 ? jobs[0].id : undefined,
    jobIds: jobs.map((j) => j.id),
  });
}
