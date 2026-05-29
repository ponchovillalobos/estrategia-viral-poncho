import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  PROJECTS_DIR,
  RAW_DIR,
  TRANSCRIPTS_DIR,
  REMOTION_DIR,
  RENDERS_DIR,
  PYTHON_EXE,
  PYTHON_DIR,
  MUSIC_DIR,
} from "@/lib/paths";
import {
  buildProjectForStyle,
  type StyleId,
  type BuildContext,
} from "@/lib/style-templates";
import { createJob, updateStep, setCurrentStyle, type Job } from "@/lib/job-store";
import { enqueue } from "@/lib/job-queue";
import { autoMatchBroll, type BrollClip } from "@/lib/pexels";
import { writeJsonFileAtomic } from "@/lib/atomic-write";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

interface CinematicConfig {
  /** IDs de imageOverlays subidos a /api/overlays/upload */
  overlayIds: string[];
  filmGrain?: boolean;
  vignette?: boolean;
  /** Si true, usa subtitleStyle="cinematic" en lugar del default del estilo */
  subtitleCinematic?: boolean;
  /**
   * Perfil de densidad cinematográfica:
   *   low    → 3 camera moves, 4-8 SFX, 0 jump cuts (suave)
   *   medium → 6 camera moves, 6-12 SFX, 3 jump cuts (default)
   *   high   → 10 camera moves, 10-18 SFX, 6 jump cuts (intenso)
   * Usado en tests A/B/C.
   */
  density?: "low" | "medium" | "high";
}

interface AutoBuildRequest {
  /** Single-video (legacy). Si viene videoIds[] se ignora. */
  videoId?: string;
  /** Multi-video (preferido). Cada videoId crea un job propio. */
  videoIds?: string[];
  styles: StyleId[];
  accentColor: string;
  caption?: string;
  captionMeta?: Record<string, unknown>;
  platforms?: string[];
  day?: number;
  /** Aspecto del output. "9:16" → 1080×1920 (vertical, default). "16:9" → 1920×1080 (horizontal). */
  aspectRatio?: "9:16" | "16:9";
  /** Modo cinematográfico opt-in. Si undefined, render sale idéntico a antes. */
  cinematic?: CinematicConfig;
  /**
   * Sufijo opcional para el projectId — usado por test-ab para diferenciar
   * renders A/B/C del mismo video+estilo. Ej: "_test_A" → projectId = "Video Imagen_hype_max_sfx_test_A".
   */
  projectIdSuffix?: string;
}

function dimensionsFromAspect(ratio: AutoBuildRequest["aspectRatio"]): { width: number; height: number } {
  if (ratio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 }; // default 9:16
}

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  score?: number;
}

function runProcess(
  cmd: string,
  args: string[],
  cwd?: string,
  onProgress?: (data: string) => void,
  timeoutMs?: number,
  // Timeout por INACTIVIDAD: si el proceso no emite NADA por este tiempo, se considera
  // colgado y se mata. Ideal para procesos largos pero "habladores" (render de Remotion,
  // pipeline): un render que avanza emite progreso seguido, así que sólo se mata si de
  // verdad se trabó — sin matar renders largos legítimos.
  idleTimeoutMs?: number
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Node 17+ rechaza .cmd/.bat con shell:false en Windows (CVE-2024-27980 → EINVAL).
    // npx.cmd y otros wrappers necesitan shell:true. Para .exe nativos mantenemos shell:false.
    const isWindowsScript = process.platform === "win32" && /\.(cmd|bat|ps1)$/i.test(cmd);
    const proc = spawn(cmd, args, { cwd, shell: isWindowsScript });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stderr += `\n[runProcess] TIMEOUT ${timeoutMs}ms — killing\n`;
          try {
            proc.kill("SIGKILL");
          } catch {}
        }, timeoutMs)
      : null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdle = () => {
      if (!idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        stderr += `\n[runProcess] IDLE TIMEOUT ${idleTimeoutMs}ms sin salida — proceso colgado, killing\n`;
        try {
          proc.kill("SIGKILL");
        } catch {}
      }, idleTimeoutMs);
    };
    armIdle();
    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
    };
    proc.stdout.on("data", (d) => {
      armIdle();
      const s = d.toString();
      stdout += s;
      onProgress?.(s);
    });
    proc.stderr.on("data", (d) => {
      armIdle();
      const s = d.toString();
      stderr += s;
      onProgress?.(s);
    });
    proc.on("close", (code) => {
      clearTimers();
      resolve({ ok: !timedOut && code === 0, stdout, stderr });
    });
    proc.on("error", () => {
      clearTimers();
      resolve({ ok: false, stdout, stderr });
    });
  });
}

function pickTopKeywords(words: TranscriptWord[], count = 7): TranscriptWord[] {
  const filtered = words.filter((w) => {
    const clean = w.word.replace(/[^\wáéíóúñÁÉÍÓÚÑ]/g, "");
    return (
      clean.length >= 5 &&
      !/^(porque|cuando|donde|nuestro|nuestra|nuestros|nuestras|también|tambien|hacia|sobre|entre|durante|hasta|desde)$/i.test(clean)
    );
  });
  if (filtered.length <= count) return filtered;
  const slice = filtered.length / count;
  const picks: TranscriptWord[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(filtered[Math.floor(i * slice)]);
  }
  return picks;
}

// Etiqueta corta y legible del estilo, para el nombre del archivo de salida.
const STYLE_SHORT_LABEL: Record<StyleId, string> = {
  silent: "Limpio",
  punch: "Punch",
  hype: "Viral",
  hype_max: "ViralMax",
  hype_max_sfx: "ViralSFX",
  supreme: "Premium",
  cinematic_pro: "Cine",
  broll_full: "Broll",
  broll_pip: "BrollPIP",
};

const TITLE_STOPWORDS = new Set([
  "porque", "cuando", "donde", "nuestro", "nuestra", "nuestros", "nuestras", "tambien",
  "hacia", "sobre", "entre", "durante", "hasta", "desde", "para", "pero", "como", "esto",
  "esta", "este", "estos", "estas", "una", "unos", "unas", "con", "sin", "del", "sus",
  "mas", "muy", "los", "las", "que", "todo", "todos", "toda", "todas", "cada", "tiene",
  "tienen", "puede", "pueden", "vamos", "aqui", "asi", "ahora", "bien", "solo", "cosa",
  "cosas", "hace", "dice", "decir", "gente", "entonces", "siempre", "nunca", "porqué",
]);

/** Quita acentos para comparar/agrupar; conserva ñ. */
function normForFreq(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]/gi, "");
}

function titleCaseWord(w: string): string {
  return w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

/** Quita caracteres ilegales en nombres de archivo (Windows) y colapsa espacios. */
function sanitizeForFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Genera un título corto (1-2 palabras de contenido) a partir de lo que MÁS se dice en
 * el video — para que el archivo de salida sea identificable. Frecuencia de palabras
 * significativas (sin stopwords, ≥5 letras), conservando acentos para que se lea bien.
 */
function generateContentTitle(words: TranscriptWord[]): string {
  const freq = new Map<string, { count: number; display: string }>();
  for (const w of words) {
    const norm = normForFreq(w.word);
    if (norm.length < 5) continue;
    if (TITLE_STOPWORDS.has(norm)) continue;
    const display = w.word.replace(/[^\p{L}\p{N}ñÑ]/gu, "");
    if (!display) continue;
    const e = freq.get(norm) ?? { count: 0, display };
    e.count++;
    freq.set(norm, e);
  }
  const top = [...freq.values()].sort((a, b) => b.count - a.count).slice(0, 2);
  return top.map((t) => titleCaseWord(t.display)).join(" ").trim();
}

/**
 * Devuelve un projectId único basado en `${titulo} ${EstiloLabel}`. Si ya existe un proyecto
 * con ese id pero de OTRO video, agrega un número para no pisarlo. Si es el mismo video
 * (re-render del mismo estilo), reusa el id (sobrescribe a propósito).
 */
async function uniqueProjectId(base: string, videoId: string, suffix: string): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const id = (n === 0 ? base : `${base} ${n + 1}`) + suffix;
    const jsonPath = path.join(PROJECTS_DIR, `${id}.json`);
    try {
      const existing = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
      if (existing?.videoId === videoId) return id; // mismo video → reusar/sobrescribir
      // distinto video con ese id → probar el siguiente número
    } catch {
      return id; // no existe → libre
    }
  }
  return `${base} ${Date.now()}${suffix}`;
}

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
  const needsCuts = job.styles.some((s) => s === "hype_max" || s === "hype_max_sfx");
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

  // Cargar overlays del store si vienen IDs (modo cinematográfico)
  let imageOverlaysForCtx: BuildContext["imageOverlays"] = undefined;
  if (body.cinematic?.overlayIds && body.cinematic.overlayIds.length > 0) {
    const { getOverlay } = await import("@/lib/overlays-store");
    let overlays = await Promise.all(
      body.cinematic.overlayIds.map((id: string) => getOverlay(id))
    );

    // ───── MATCHER DETERMINÍSTICO + AUTO-ASAMBLEA ─────
    // Paso 1: matcher Python busca palabras de cada description en el transcript
    //   - matches exactos/fuzzy se aplican directo (rápido, confiable)
    //   - los sin match quedan en `needsAgent=true`
    // Paso 2: si quedaron muchos sin match, convocar asamblea LLM (lento pero capaz)
    // Paso 3: render normal
    const overlaysWithoutTimestamps = overlays.filter(
      (o) => o !== null && (o.startTime == null || o.endTime == null)
    );
    if (overlaysWithoutTimestamps.length > 0) {
      console.log(
        `[auto-build] ${overlaysWithoutTimestamps.length}/${overlays.length} overlays sin timestamps → matcher determinístico`
      );
      try {
        const { spawn: spawnAssembly } = await import("node:child_process");
        const osModule = await import("node:os");
        const fsPromises = (await import("node:fs")).promises;

        // ─── PASO 1: matcher determinístico (rápido, sin LLM) ───
        try {
          // Escribir overlays a tmp
          const matcherInput = overlays
            .filter((o): o is NonNullable<typeof o> => o !== null)
            .map((o) => ({
              id: o.id,
              description: o.description ?? "",
              filename: o.filename,
              userOrder: o.userOrder ?? null,
            }));
          const matcherTmpFile = path.join(
            osModule.tmpdir(),
            `matcher_${videoId}_${Date.now()}.json`
          );
          await fsPromises.writeFile(matcherTmpFile, JSON.stringify(matcherInput), "utf-8");

          const matcherResult = await new Promise<{
            matches: {
              overlayId: string;
              startTime: number | null;
              endTime: number | null;
              matchedWord?: string;
              matchedKeyword?: string;
              confidence: string;
              tier: string;
              reason?: string;
            }[];
            stats: Record<string, number>;
          } | null>((resolve) => {
            const args = [
              path.join(PYTHON_DIR, "match_overlays_to_transcript.py"),
              "--transcript-file", transcriptPath,
              "--overlays-file", matcherTmpFile,
            ];
            const proc = spawnAssembly(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
            proc.stderr.on("data", (c: Buffer) => {
              stderr += c.toString("utf-8");
              process.stdout.write(`[matcher] ${c.toString("utf-8")}`);
            });
            proc.on("close", async (code) => {
              await fsPromises.unlink(matcherTmpFile).catch(() => {});
              if (code !== 0) {
                console.error(`[matcher] exit=${code}: ${stderr.slice(-200)}`);
                resolve(null);
                return;
              }
              try {
                const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
                const lastJson = lines[lines.length - 1];
                if (!lastJson) throw new Error("no JSON");
                resolve(JSON.parse(lastJson));
              } catch (err) {
                console.error(`[matcher] parse: ${err}`);
                resolve(null);
              }
            });
            proc.on("error", () => resolve(null));
          });

          // Aplicar todos los matches (incluye fallback con orden respetado)
          if (matcherResult && matcherResult.matches) {
            const { updateOverlay } = await import("@/lib/overlays-store");
            for (const m of matcherResult.matches) {
              if (m.startTime == null || m.endTime == null) continue;
              await updateOverlay(m.overlayId, {
                startTime: m.startTime,
                endTime: m.endTime,
                effect: "memory_flash",
                motion: "ken_burns_in",
                transitionIn: "fade",
                transitionOut: "fade",
                position: "center",
                sizeRatio: 1.0,
              });
            }
            console.log(
              `[matcher] aplicó ${matcherResult.matches.length} matches: ` +
                `exact=${matcherResult.stats.exact ?? 0} ` +
                `fuzzy=${matcherResult.stats.fuzzy ?? 0} ` +
                `fallback=${matcherResult.stats.fallback ?? 0}`
            );
            // Recargar overlays con los timestamps recién aplicados
            overlays = await Promise.all(
              body.cinematic.overlayIds.map((id: string) => getOverlay(id))
            );
          }
        } catch (matcherErr) {
          console.error("[matcher] falló, intento asamblea LLM:", matcherErr);
        }

        // ─── PASO 2: chequear si todos los overlays ya tienen timestamps ───
        const stillMissing = overlays.filter(
          (o) => o !== null && (o.startTime == null || o.endTime == null)
        );
        if (stillMissing.length === 0) {
          console.log(
            `[auto-build] matcher cubrió los ${overlays.length} overlays — saltando asamblea LLM (ahorra ~3-5 min)`
          );
        } else {
          console.log(
            `[auto-build] ${stillMissing.length} overlays sin matchear → convocando asamblea LLM`
          );

        // ─── PASO 3: asamblea LLM solo si quedaron overlays sin match ───

        // Escribir overlays a archivo tmp para pasar al Python.
        // Ordenamos por userOrder ASC para que el agente VFX los procese en el
        // orden que el usuario quiere. Sin userOrder, gana matching semántico.
        const overlaysInput = overlays
          .filter((o): o is NonNullable<typeof o> => o !== null)
          .sort((a, b) => {
            const ao = a.userOrder ?? 999;
            const bo = b.userOrder ?? 999;
            return ao - bo;
          })
          .map((o) => ({
            id: o.id,
            description: o.description ?? "(sin descripción)",
            filename: o.filename,
            userOrder: o.userOrder ?? null,
          }));
        const tmpFile = path.join(osModule.tmpdir(), `assembly_${videoId}_${Date.now()}.json`);
        await fsPromises.writeFile(tmpFile, JSON.stringify(overlaysInput, null, 2), "utf-8");

        // Spawn cinematic_assembly.py
        await new Promise<void>((resolve, reject) => {
          const args = [
            path.join(PYTHON_DIR, "cinematic_assembly.py"),
            "--transcript-file", transcriptPath,
            "--duration", String(transcript.duration),
            "--overlays-file", tmpFile,
          ];
          const proc = spawnAssembly(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
          proc.stderr.on("data", (c: Buffer) => {
            stderr += c.toString("utf-8");
            // Log a la consola del server para que el dev vea progreso
            process.stdout.write(`[assembly auto] ${c.toString("utf-8")}`);
          });
          proc.on("close", async (code) => {
            await fsPromises.unlink(tmpFile).catch(() => {});
            if (code !== 0) {
              reject(new Error(`assembly exit=${code}: ${stderr.slice(-300)}`));
              return;
            }
            try {
              // Parsear el último JSON del stdout
              const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
              const lastJson = lines[lines.length - 1];
              if (!lastJson) throw new Error("no JSON output");
              const result = JSON.parse(lastJson);
              const vfxDecisions = result?.vfx?.vfxDecisions || [];
              const { updateOverlay } = await import("@/lib/overlays-store");
              // 1) Aplicar las decisiones que sí trajo el agente
              const decidedIds = new Set<string>();
              for (const dec of vfxDecisions) {
                decidedIds.add(dec.overlayId);
                await updateOverlay(dec.overlayId, {
                  startTime: dec.startTime,
                  endTime: dec.endTime,
                  effect: dec.effect,
                  motion: dec.motion,
                  transitionIn: dec.transitionIn,
                  transitionOut: dec.transitionOut,
                  position: dec.position,
                  sizeRatio: dec.sizeRatio,
                });
              }

              // 2) Si el agente VFX devolvió PARCIAL (procesó solo N de M),
              //    distribuir uniformemente los que quedaron sin timestamps
              //    respetando su userOrder.
              const missing = overlaysInput.filter((o) => !decidedIds.has(o.id));
              if (missing.length > 0) {
                console.log(
                  `[auto-build] asamblea procesó ${vfxDecisions.length}/${overlaysInput.length} overlays; fallback para los ${missing.length} restantes`
                );
                // Calcular slots libres entre los ya decididos
                const decidedSorted = vfxDecisions
                  .map((d: { startTime?: number; endTime?: number }) => ({
                    start: Number(d.startTime ?? 0),
                    end: Number(d.endTime ?? 0),
                  }))
                  .sort((a: { start: number }, b: { start: number }) => a.start - b.start);
                // Buscar gaps grandes en el timeline
                const dur = transcript.duration;
                let cursor = 1;
                const slots: number[] = [];
                for (const block of decidedSorted) {
                  if (block.start - cursor >= 5) {
                    slots.push((cursor + block.start) / 2);
                  }
                  cursor = Math.max(cursor, block.end + 0.5);
                }
                if (dur - cursor >= 5) slots.push((cursor + dur - 2) / 2);
                // Asignar cada missing a un slot, o repartir uniforme si no hay slots
                for (let i = 0; i < missing.length; i++) {
                  const m = missing[i];
                  const startTime =
                    slots[i] !== undefined
                      ? slots[i]
                      : Math.min(dur - 4, 5 + i * Math.max(4, (dur - 10) / missing.length));
                  const endTime = Math.min(startTime + 4, dur - 0.5);
                  await updateOverlay(m.id, {
                    startTime: +startTime.toFixed(1),
                    endTime: +endTime.toFixed(1),
                    effect: "memory_flash",
                    motion: "ken_burns_in",
                    transitionIn: "fade",
                    transitionOut: "fade",
                    position: "center",
                    sizeRatio: 1.0,
                  });
                }
              }

              console.log(
                `[auto-build] asamblea aplicó ${vfxDecisions.length}/${overlaysInput.length} decisiones VFX (resto: fallback uniforme)`
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          });
          proc.on("error", reject);
        });

        // Recargar los overlays con los timestamps actualizados
        overlays = await Promise.all(
          body.cinematic.overlayIds.map((id: string) => getOverlay(id))
        );
        } // cierre del else (stillMissing > 0)
      } catch (err) {
        console.error(`[auto-build] asamblea automática falló:`, err);
        // Fallback: distribuir uniformemente como red de seguridad
        const validOverlays = overlays.filter((o): o is NonNullable<typeof o> => o !== null);
        const slice = transcript.duration / Math.max(1, validOverlays.length);
        const { updateOverlay } = await import("@/lib/overlays-store");
        for (let i = 0; i < validOverlays.length; i++) {
          const o = validOverlays[i];
          if (o.startTime != null) continue;
          const startTime = +(i * slice + 1).toFixed(1);
          const endTime = +(Math.min(startTime + 4, transcript.duration - 1)).toFixed(1);
          await updateOverlay(o.id, { startTime, endTime });
        }
        overlays = await Promise.all(
          body.cinematic.overlayIds.map((id: string) => getOverlay(id))
        );
      }
    }

    imageOverlaysForCtx = overlays
      .filter((o): o is NonNullable<typeof o> => o !== null && o.startTime != null && o.endTime != null)
      .map((o) => ({
        id: o.id,
        url: `/api/overlays/${o.id}/image`,
        startTime: o.startTime as number,
        endTime: o.endTime as number,
        effect: o.effect,
        motion: o.motion,
        transitionIn: o.transitionIn,
        transitionOut: o.transitionOut,
        position: o.position,
        sizeRatio: o.sizeRatio,
      }));
  }

  // ─── Auto-enriquecimiento cinematográfico ──────────────────────────────────
  // Cuando hay imageOverlays, generar auto SFX + camera moves + jump cuts.
  // Densidad configurable (default medium). En tests A/B/C cambia entre low/medium/high.
  const cinematicDensity = (body.cinematic?.density as "low" | "medium" | "high") ?? "medium";
  let autoSfxMarks: { at: number; sound: string; volume: number; url?: string }[] | undefined;
  let autoCameraMoves: { at: number; duration: number; type: string; intensity: number }[] | undefined;
  let autoStutterMarks: { at: number; duration: number }[] | undefined;

  if (imageOverlaysForCtx && imageOverlaysForCtx.length > 0) {
    const { generateCameraMoves, generateJumpCuts } = await import("@/lib/style-templates");
    autoCameraMoves = generateCameraMoves(transcript.duration, cinematicDensity);
    autoStutterMarks = generateJumpCuts(transcript.words, cinematicDensity);

    // SFX matcher determinístico (rápido, sin LLM)
    try {
      const osMod = await import("node:os");
      const fsMod = (await import("node:fs")).promises;
      const tmpSfx = path.join(osMod.tmpdir(), `sfx_${videoId}_${Date.now()}.json`);
      const sfxResult = await new Promise<{ sfxMarks?: typeof autoSfxMarks } | null>((resolve) => {
        const args = [
          path.join(PYTHON_DIR, "match_sfx_to_transcript.py"),
          "--transcript-file", transcriptPath,
          "--duration", String(transcript.duration),
          "--density", cinematicDensity,
          "--out", tmpSfx,
        ];
        const proc = spawn(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });
        let stdout = "";
        proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        proc.stderr.on("data", (c: Buffer) =>
          process.stdout.write(`[sfx-matcher] ${c.toString("utf-8")}`)
        );
        proc.on("close", async () => {
          await fsMod.unlink(tmpSfx).catch(() => {});
          try {
            const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
            const last = lines[lines.length - 1];
            resolve(last ? JSON.parse(last) : null);
          } catch {
            resolve(null);
          }
        });
        proc.on("error", () => resolve(null));
      });
      if (sfxResult?.sfxMarks) {
        autoSfxMarks = sfxResult.sfxMarks;
        console.log(`[auto-build] SFX matcher: ${autoSfxMarks.length} marks density=${cinematicDensity}`);
      }
    } catch (err) {
      console.error("[auto-build] sfx matcher falló:", err);
    }
  }

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

      const project = {
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
        platforms: platforms ?? (baseProject as { platforms?: string[] }).platforms ?? [],
        captionMeta: captionMeta ?? (baseProject as { captionMeta?: unknown }).captionMeta ?? null,
      };

      // === Beat-sync: "cortar al ritmo" (solo si beatSync + música) ===
      // Detecta los beats del track con detect_beats.py y agrega zoomMarks + flashes
      // en los más fuertes. Si no hay música o falla, no agrega nada (no rompe).
      // Nota: solo en estilos SIN jump cuts (broll_*), para que los tiempos de beat
      // (en el timeline final) no se desfasen del remapeo de build-props.
      const beatSyncOn = (project as { beatSync?: boolean }).beatSync === true;
      const musicTrack = (project as { musicTrack?: string | null }).musicTrack;
      if (beatSyncOn && musicTrack && !(project as { enableJumpCuts?: boolean }).enableJumpCuts) {
        try {
          const fileParam = new URL(musicTrack, "http://x").searchParams.get("file");
          const musicPath = fileParam ? path.join(MUSIC_DIR, fileParam) : null;
          const musicExists = musicPath
            ? await fs.access(musicPath).then(() => true).catch(() => false)
            : false;
          if (musicPath && musicExists) {
            const beatRun = await runProcess(
              PYTHON_EXE,
              [path.join(PYTHON_DIR, "detect_beats.py"), musicPath],
              PYTHON_DIR,
              undefined,
              90_000
            );
            if (beatRun.ok) {
              const line = beatRun.stdout
                .split(/\r?\n/)
                .filter((l) => l.trim().startsWith("{"))
                .pop();
              const parsed = line
                ? (JSON.parse(line) as { beats?: { t: number; strength: number }[] })
                : null;
              const beats = (parsed?.beats ?? []).filter(
                (b) => b.t > 0.5 && b.t < transcript.duration - 0.3
              );
              const top = beats
                .slice()
                .sort((a, b) => b.strength - a.strength)
                .slice(0, 12)
                .sort((a, b) => a.t - b.t);
              const beatZooms = top.map((b) => ({ at: +b.t.toFixed(2), duration: 0.4, scale: 1.12 }));
              const beatTrans = top
                .filter((_, i) => i % 2 === 0)
                .map((b) => ({ at: +b.t.toFixed(2), kind: "flash" as const, durationFrames: 5, color: "#ffffff" }));
              const p = project as { zoomMarks?: unknown[]; proTransitions?: unknown[] };
              p.zoomMarks = [...(p.zoomMarks ?? []), ...beatZooms];
              p.proTransitions = [...(p.proTransitions ?? []), ...beatTrans];
              console.log(`[auto-build] beat-sync: ${top.length} beats → zooms+flashes`);
            }
          }
        } catch (err) {
          console.warn("[auto-build] beat-sync falló:", err);
        }
      }

      // === Motion tracking: correr track_subject.py si el estilo lo pide ===
      // Detecta la cara del sujeto en el raw y rellena trackPath → TrackedLayer pega
      // labels que la siguen. Solo estilos con tracking=true (ej. hype). Si falla o no
      // hay raw, queda vacío y el render sale sin tracking (no rompe).
      if ((project as { tracking?: boolean }).tracking) {
        try {
          let rawVideo = path.join(RAW_DIR, `${videoId}.mp4`);
          let rawExists = await fs.access(rawVideo).then(() => true).catch(() => false);
          if (!rawExists) {
            rawVideo = path.join(RAW_DIR, `${videoId}.mov`);
            rawExists = await fs.access(rawVideo).then(() => true).catch(() => false);
          }
          if (rawExists) {
            const trackRun = await runProcess(
              PYTHON_EXE,
              [path.join(PYTHON_DIR, "track_subject.py"), rawVideo, "0.15"],
              PYTHON_DIR,
              undefined,
              180_000
            );
            if (trackRun.ok) {
              const line = trackRun.stdout
                .split(/\r?\n/)
                .filter((l) => l.trim().startsWith("{"))
                .pop();
              const parsed = line ? (JSON.parse(line) as { points?: unknown[] }) : null;
              const pts = parsed?.points ?? [];
              (project as { trackPath?: unknown[] }).trackPath = pts;
              console.log(`[auto-build] motion tracking: ${pts.length} puntos de cara`);
            }
          }
        } catch (err) {
          console.warn("[auto-build] tracking falló:", err);
        }
      }

      // === Quitar fondo con IA (opt-in): compone la persona sobre fondo desenfocado ===
      // Genera {videoId}_fg.mp4 en RAW_DIR y lo marca como video base (build-props lo usa).
      // Pesado (segmentación por frame); solo estilos con removeBg=true (ej. broll_pip).
      if ((project as { removeBg?: boolean }).removeBg) {
        try {
          let rawVideo = path.join(RAW_DIR, `${videoId}.mp4`);
          let rawExists = await fs.access(rawVideo).then(() => true).catch(() => false);
          if (!rawExists) {
            rawVideo = path.join(RAW_DIR, `${videoId}.mov`);
            rawExists = await fs.access(rawVideo).then(() => true).catch(() => false);
          }
          if (rawExists) {
            const fgId = `${videoId}_fg`;
            const fgPath = path.join(RAW_DIR, `${fgId}.mp4`);
            const bgRun = await runProcess(
              PYTHON_EXE,
              [path.join(PYTHON_DIR, "remove_background.py"), rawVideo, fgPath, "blur"],
              PYTHON_DIR,
              undefined,
              600_000 // 10 min — segmentación por frame puede tardar en videos largos
            );
            const okLine = bgRun.ok
              ? bgRun.stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).pop()
              : null;
            const okFlag = okLine ? (JSON.parse(okLine) as { ok?: boolean }).ok : false;
            if (okFlag && (await fs.access(fgPath).then(() => true).catch(() => false))) {
              (project as { foregroundVideoId?: string }).foregroundVideoId = fgId;
              console.log(`[auto-build] quitar fondo IA: ${fgId}.mp4 generado`);
            } else {
              console.warn("[auto-build] quitar fondo: no se generó el compuesto, sigo con el raw");
            }
          }
        } catch (err) {
          console.warn("[auto-build] quitar fondo falló:", err);
        }
      }

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

      // F5 SUPREME — Audio mastering post-render con ffmpeg.
      // Aplica: acompressor (picos no saturan), alimiter (-0.5dB sin clipping),
      // highpass 80Hz (quita rumble), eq +2dB @ 3kHz (claridad de voz).
      // Si ffmpeg falla, se conserva el render sin master (no rompe el job).
      if (styleId === "cinematic_pro") {
        updateStep(job.id, styleId, { progress: 96 });
        try {
          const masteredPath = outPath.replace(/\.mp4$/, "_mastered.mp4");
          const audioFilter =
            "acompressor=threshold=-18dB:ratio=3:attack=20:release=200," +
            "alimiter=level_in=1:level_out=0.95:limit=0.95," +
            "highpass=f=80," +
            "equalizer=f=3000:t=q:w=1:g=2";
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
      const lutName = (project as { lut?: string | null }).lut;
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
