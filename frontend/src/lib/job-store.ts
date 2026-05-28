/**
 * Job store del server para tracking de renders del wizard.
 *
 * En Next.js dev, este Map sobrevive entre requests (módulo se carga 1 vez). Además se
 * PERSISTE a disco (editor-jobs.json) y se RECONCILIA al arrancar: si el server se reinició
 * en medio de un render, los jobs "running"/"queued" se resuelven mirando si el .mp4 final
 * existe (→ ok) o no (→ fail "interrumpido"), en vez de quedar atorados para siempre.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { RENDERS_DIR } from "@/lib/paths";
import { loadSnapshot, scheduleSave, saveNow } from "@/lib/job-persistence";

const PERSIST_FILE = "editor-jobs.json";

export type StyleId =
  | "silent"
  | "punch"
  | "hype"
  | "hype_max"
  | "hype_max_sfx"
  | "supreme"
  | "cinematic_pro"
  | "broll_full"
  | "broll_pip";

export interface JobStep {
  styleId: StyleId;
  status: "pending" | "building" | "rendering" | "ok" | "fail";
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames?: number;
  output?: string;
  error?: string;
}

export interface Job {
  id: string;
  videoId: string;
  styles: StyleId[];
  accentColor: string;
  startedAt: number;
  finishedAt?: number;
  currentStyle?: StyleId;
  overallProgress: number; // 0-100 (avg de todos los steps)
  steps: JobStep[];
  /**
   * "queued"  → encolado, esperando slot libre (queuePosition >= 1)
   * "running" → el runner está procesando los steps
   * "done"    → todos los steps OK
   * "failed"  → al menos un step fail
   */
  status: "queued" | "running" | "done" | "failed";
  /** Posición en la cola (1-indexed). undefined cuando está running/done/failed. */
  queuePosition?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __viral_job_store__: Map<string, Job> | undefined;
}

const isFreshBoot = !globalThis.__viral_job_store__;
const STORE: Map<string, Job> =
  globalThis.__viral_job_store__ ?? (globalThis.__viral_job_store__ = new Map());

/** Snapshot del store a disco (debounced). */
function persist(): void {
  scheduleSave(PERSIST_FILE, () => Array.from(STORE.values()));
}

/** Recalcula overallProgress + status/finishedAt a partir de los steps. */
function recompute(job: Job): void {
  const total = job.steps.reduce((acc, s) => acc + s.progress, 0);
  job.overallProgress = job.steps.length ? Math.round(total / job.steps.length) : 0;
  if (job.steps.every((s) => s.status === "ok" || s.status === "fail")) {
    job.status = job.steps.every((s) => s.status === "ok") ? "done" : "failed";
    if (!job.finishedAt) job.finishedAt = Date.now();
  }
}

/**
 * Reconcilia un job que quedó a medias por un reinicio del server. Para cada step
 * no terminal: si el render final existe en disco → "ok"; si no → "fail". Así nunca
 * queda un job "running"/"queued" colgado tras un restart.
 */
function reconcileJob(job: Job): void {
  if (job.status !== "running" && job.status !== "queued") return;
  for (const step of job.steps) {
    if (step.status === "ok" || step.status === "fail") continue;
    const projectId = `${job.videoId}_${step.styleId}`;
    const outPath = step.output ?? path.join(RENDERS_DIR, `${projectId}.mp4`);
    let finished = false;
    try {
      finished = existsSync(outPath) && statSync(outPath).size > 100_000;
    } catch {
      finished = false;
    }
    if (finished) {
      step.status = "ok";
      step.progress = 100;
      step.output = outPath;
    } else {
      step.status = "fail";
      step.error = "Interrumpido por reinicio del servidor — volvé a renderizar.";
    }
  }
  job.queuePosition = undefined;
  recompute(job);
}

// Cargar + reconciliar desde disco SÓLO en arranque fresco del proceso (no en HMR,
// donde globalThis ya tiene el store vivo y no queremos pisarlo con el snapshot viejo).
if (isFreshBoot) {
  for (const job of loadSnapshot<Job>(PERSIST_FILE)) {
    reconcileJob(job);
    STORE.set(job.id, job);
  }
  // Persistir el resultado reconciliado de una.
  saveNow(PERSIST_FILE, Array.from(STORE.values()));
}

export function createJob(videoId: string, styles: StyleId[], accentColor: string): Job {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id,
    videoId,
    styles,
    accentColor,
    startedAt: Date.now(),
    overallProgress: 0,
    steps: styles.map((s) => ({ styleId: s, status: "pending", progress: 0 })),
    status: "running",
  };
  STORE.set(id, job);
  saveNow(PERSIST_FILE, Array.from(STORE.values()));
  return job;
}

export function getJob(id: string): Job | undefined {
  return STORE.get(id);
}

export function updateStep(
  jobId: string,
  styleId: StyleId,
  patch: Partial<JobStep>
): void {
  const job = STORE.get(jobId);
  if (!job) return;
  const step = job.steps.find((s) => s.styleId === styleId);
  if (!step) return;
  Object.assign(step, patch);

  const wasTerminal = job.status === "done" || job.status === "failed";
  recompute(job);
  const nowTerminal = job.status === "done" || job.status === "failed";

  // Guardado: en transición a terminal escribimos YA (no perder el resultado final si
  // el server muere enseguida); en updates de progreso, con debounce.
  if (nowTerminal && !wasTerminal) {
    saveNow(PERSIST_FILE, Array.from(STORE.values()));
  } else {
    persist();
  }
}

export function setCurrentStyle(jobId: string, styleId: StyleId): void {
  const job = STORE.get(jobId);
  if (!job) return;
  job.currentStyle = styleId;
  persist();
}

// Limpieza: borrar jobs > 1h de antigüedad
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  let changed = false;
  for (const [k, v] of STORE.entries()) {
    if (v.startedAt < cutoff) {
      STORE.delete(k);
      changed = true;
    }
  }
  if (changed) persist();
}, 5 * 60 * 1000);
