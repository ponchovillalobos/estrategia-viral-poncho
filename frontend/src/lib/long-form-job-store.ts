/**
 * Job store en memoria para el pipeline long-form.
 *
 * 7 pasos secuenciales:
 *   1. transcribe       → long_form/transcripts/{id}.json
 *   2. detect_silences  → long_form/cuts/{id}.json
 *   3. cut_silences     → long_form/clean/{id}_clean.mp4
 *   4. re_transcribe    → re-transcribe del clean (timestamps alineados)
 *   5. analyze          → long_form/proposals/{id}.json (Ollama propone clips)
 *   6. extract_clips    → long_form/clips/{id}_cNN_*.mp4
 *   7. render (opt.)    → long_form/renders/{id}_cNN_*_supreme.mp4
 *
 * En Next.js dev sobrevive entre requests (módulo se carga 1 vez). Además se PERSISTE a
 * disco (long-form-jobs.json) y se RECONCILIA al arrancar: un job "running"/"queued" que
 * quedó a medias por un reinicio del server se marca "failed" ("interrumpido") en vez de
 * mostrarse corriendo para siempre (el pipeline Python no se puede reanudar).
 */

import { loadSnapshot, scheduleSave, saveNow } from "@/lib/job-persistence";

const PERSIST_FILE = "long-form-jobs.json";

export type LongFormStepKey =
  | "transcribe"
  | "detect_silences"
  | "cut_silences"
  | "re_transcribe"
  | "analyze"
  | "extract_clips"
  | "render";

export interface LongFormStep {
  key: LongFormStepKey;
  label: string;
  status: "pending" | "running" | "ok" | "fail" | "skipped";
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface LongFormJob {
  id: string;
  videoId: string;
  videoPath: string;
  options: {
    model?: string;
    render: boolean;
    maxClips?: number;
    skipTranscribe?: boolean;
    useHeuristic?: boolean;
    styles?: string[];
    accentColor?: string;
    platforms?: string[];
  };
  startedAt: number;
  finishedAt?: number;
  /**
   * "queued"  → encolado por el job-queue, esperando slot
   * "running" → el pipeline Python está corriendo
   * "done"    → todos los steps OK
   * "failed"  → fallo en algún step
   */
  status: "queued" | "running" | "done" | "failed";
  /** Posición en cola (1-indexed); undefined cuando está running/done/failed */
  queuePosition?: number;
  /** 0-100 — derivado de los pasos completados */
  overallProgress: number;
  steps: LongFormStep[];
  /** Output del CLI capturado (últimas 100 líneas para no inflar la memoria) */
  log: string[];
  /** Cantidad de clips generados al final (poblado al terminar) */
  clipsCount?: number;
}

const DEFAULT_STEPS: { key: LongFormStepKey; label: string }[] = [
  { key: "transcribe", label: "Transcribir audio del video original" },
  { key: "detect_silences", label: "Detectar silencios" },
  { key: "cut_silences", label: "Cortar silencios → video clean" },
  { key: "re_transcribe", label: "Re-transcribir el clean (timestamps alineados)" },
  { key: "analyze", label: "Analizar con IA → proponer 5-7 clips icónicos" },
  { key: "extract_clips", label: "Recortar los clips (30-60s c/u)" },
  { key: "render", label: "Renderizar clips con estilo supreme" },
];

declare global {
   
  var __viral_lf_job_store__: Map<string, LongFormJob> | undefined;
}

const isFreshBoot = !globalThis.__viral_lf_job_store__;
const STORE: Map<string, LongFormJob> =
  globalThis.__viral_lf_job_store__ ?? (globalThis.__viral_lf_job_store__ = new Map());

/** Snapshot a disco (debounced). */
function persist(): void {
  scheduleSave(PERSIST_FILE, () => Array.from(STORE.values()));
}

/**
 * Reconcilia un job interrumpido por reinicio. El pipeline Python no se reanuda, así que
 * cualquier step no terminal pasa a "fail" y el job a "failed" con mensaje claro.
 */
function reconcileLongFormJob(job: LongFormJob): void {
  if (job.status !== "running" && job.status !== "queued") return;
  for (const step of job.steps) {
    if (step.status === "pending" || step.status === "running") {
      step.status = "fail";
      step.message = "Interrumpido por reinicio del servidor — volvé a correr el pipeline.";
      if (!step.finishedAt) step.finishedAt = Date.now();
    }
  }
  job.status = "failed";
  job.queuePosition = undefined;
  if (!job.finishedAt) job.finishedAt = Date.now();
}

if (isFreshBoot) {
  for (const job of loadSnapshot<LongFormJob>(PERSIST_FILE)) {
    reconcileLongFormJob(job);
    STORE.set(job.id, job);
  }
  saveNow(PERSIST_FILE, Array.from(STORE.values()));
}

export function createLongFormJob(
  videoId: string,
  videoPath: string,
  options: LongFormJob["options"]
): LongFormJob {
  const id = `lfjob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: LongFormJob = {
    id,
    videoId,
    videoPath,
    options,
    startedAt: Date.now(),
    status: "running",
    overallProgress: 0,
    steps: DEFAULT_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      status: "pending",
    })),
    log: [],
  };
  if (!options.render) {
    // El step de render se marca skipped desde el arranque
    const renderStep = job.steps.find((s) => s.key === "render");
    if (renderStep) renderStep.status = "skipped";
  }
  STORE.set(id, job);
  saveNow(PERSIST_FILE, Array.from(STORE.values()));
  return job;
}

export function getLongFormJob(id: string): LongFormJob | undefined {
  return STORE.get(id);
}

export function listLongFormJobs(): LongFormJob[] {
  return Array.from(STORE.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function updateLongFormStep(
  jobId: string,
  stepKey: LongFormStepKey,
  patch: Partial<Omit<LongFormStep, "key" | "label">>
): void {
  const job = STORE.get(jobId);
  if (!job) return;
  const step = job.steps.find((s) => s.key === stepKey);
  if (!step) return;

  if (patch.status === "running" && step.status === "pending") {
    step.startedAt = Date.now();
  }
  if ((patch.status === "ok" || patch.status === "fail") && !step.finishedAt) {
    step.finishedAt = Date.now();
  }
  Object.assign(step, patch);

  // Recalcular overall (cada paso pesa igual, "skipped" cuenta como completado)
  const total = job.steps.length;
  const done = job.steps.filter(
    (s) => s.status === "ok" || s.status === "skipped" || s.status === "fail"
  ).length;
  const running = job.steps.filter((s) => s.status === "running").length;
  // Cada paso done = 100/N, running = 50/N (mitad de progreso)
  job.overallProgress = Math.round(((done + running * 0.5) / total) * 100);

  // Terminal: un paso que falla cierra el job DE INMEDIATO. El pipeline Python
  // corta en el primer error (subprocess check=True), así que los pasos siguientes
  // quedan en "pending" para siempre — si esperáramos a que no haya pending, el job
  // se mostraría "running" eternamente (bug del job colgado). Por eso anyFail es
  // terminal aunque queden pendientes.
  const anyFail = job.steps.some((s) => s.status === "fail");
  const stillPending = job.steps.some(
    (s) => s.status === "pending" || s.status === "running"
  );
  let nowTerminal = false;
  if (anyFail || !stillPending) {
    job.status = anyFail ? "failed" : "done";
    job.finishedAt = Date.now();
    // 100% solo si TODO salió bien; en fallo dejamos el progreso real (honesto).
    if (!anyFail) job.overallProgress = 100;
    nowTerminal = true;
  }

  if (nowTerminal) {
    saveNow(PERSIST_FILE, Array.from(STORE.values()));
  } else {
    persist();
  }
}

export function appendLongFormLog(jobId: string, chunk: string): void {
  const job = STORE.get(jobId);
  if (!job) return;
  const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
  job.log.push(...lines);
  // Mantener solo las últimas 100 líneas (evitar OOM en pipelines largos)
  if (job.log.length > 100) job.log = job.log.slice(-100);
  persist();
}

export function setLongFormClipsCount(jobId: string, count: number): void {
  const job = STORE.get(jobId);
  if (!job) return;
  job.clipsCount = count;
  persist();
}

// Limpieza: borrar jobs > 4h de antigüedad (los pipelines de render pueden tardar mucho)
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  let changed = false;
  for (const [k, v] of STORE.entries()) {
    if (v.startedAt < cutoff) {
      STORE.delete(k);
      changed = true;
    }
  }
  if (changed) persist();
}, 10 * 60 * 1000);
