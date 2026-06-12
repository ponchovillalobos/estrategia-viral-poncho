/**
 * Snapshot unificado de la cola: activos + pendientes con estado de cada job.
 * Consumido por el QueuePanel cliente con polling cada ~3s.
 */
import { NextResponse } from "next/server";
import { getJob as getEditorJob, listJobs as listEditorJobs, jobTitle, type Job } from "@/lib/job-store";
import { getLongFormJob, listLongFormJobs, type LongFormJob } from "@/lib/long-form-job-store";
import { getResearch } from "@/lib/research-store";
import { listQueue, forceUnstuck, cancelAllPending, cancelPending, type JobKind } from "@/lib/job-queue";
import { NextRequest } from "next/server";
import { STYLE_LABEL } from "@/components/produccion/produccion-types";

export const dynamic = "force-dynamic";

interface QueueEntryView {
  kind: JobKind;
  jobId: string;
  videoId?: string;
  /** "queued" | "running" | "downloading" | "transcribing" | "ready" | "done" | "failed" */
  status: string;
  /** 0-100 */
  progress: number;
  /** Posición (1-indexed) si está queued; null si running/done */
  position: number | null;
  /** Para editor: estilos en proceso. Para long_form: paso actual. Para research: paso. */
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
  /** ETA en segundos para jobs running (estimado por velocidad de progreso). */
  etaSec?: number | null;
  /** Título humano del video (cuando se puede derivar del output). */
  title?: string;
  /** Motivo humano del fallo (sólo status failed). */
  error?: string;
  /** Params originales para reintentar vía POST /api/editor/auto-build (sólo editor). */
  params?: { videoId: string; styles: string[]; accentColor: string };
}

/** Texto humano del motivo de fallo: recorta la cola técnica "[detalle] …". */
function humanFailReason(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const visible = raw.split("\n[detalle]")[0].trim();
  return visible || undefined;
}

/** Entrada del panel para un job de editor ya terminado (done/failed). */
function finishedEditorEntry(job: Job): QueueEntryView {
  const failedStep = job.steps.find((s) => s.status === "fail" && s.error);
  return {
    kind: "editor",
    jobId: job.id,
    videoId: job.videoId,
    status: job.status,
    progress: job.overallProgress,
    position: null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    title: jobTitle(job),
    error: job.status === "failed" ? humanFailReason(failedStep?.error) : undefined,
    params: { videoId: job.videoId, styles: job.styles, accentColor: job.accentColor },
  };
}

/** Entrada del panel para un job de video largo ya terminado. */
function finishedLongFormEntry(job: LongFormJob): QueueEntryView {
  const failedStep = job.steps.find((s) => s.status === "fail" && s.message);
  return {
    kind: "long_form",
    jobId: job.id,
    videoId: job.videoId,
    status: job.status,
    progress: job.overallProgress,
    position: null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.status === "failed" ? humanFailReason(failedStep?.message) : undefined,
  };
}

/**
 * ETA honesto sin config: con el progreso (0-100) y el tiempo transcurrido,
 * extrapola lo que falta. Recién confiable con progreso > 5%.
 */
function progressEta(progress: number, startedAt?: number): number | null {
  if (!startedAt || progress <= 5 || progress >= 100) return null;
  const elapsedSec = (Date.now() - startedAt) / 1000;
  if (elapsedSec < 10) return null;
  return Math.round((elapsedSec * (100 - progress)) / progress);
}

async function buildEntryFromQueue(
  item: { kind: JobKind; jobId: string; position?: number }
): Promise<QueueEntryView | null> {
  if (item.kind === "editor") {
    const job = getEditorJob(item.jobId);
    if (!job) return null;
    return {
      kind: "editor",
      jobId: job.id,
      videoId: job.videoId,
      status: job.status,
      progress: job.overallProgress,
      position: typeof item.position === "number" ? item.position : null,
      detail: job.currentStyle
        ? `estilo: ${STYLE_LABEL[job.currentStyle] ?? job.currentStyle}`
        : `${job.styles.length} estilo${job.styles.length === 1 ? "" : "s"}`,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      etaSec: job.status === "running" ? progressEta(job.overallProgress, job.startedAt) : null,
      title: jobTitle(job),
      params: { videoId: job.videoId, styles: job.styles, accentColor: job.accentColor },
    };
  }
  if (item.kind === "long_form") {
    const job = getLongFormJob(item.jobId);
    if (!job) return null;
    const running = job.steps.find((s) => s.status === "running");
    return {
      kind: "long_form",
      jobId: job.id,
      videoId: job.videoId,
      status: job.status,
      progress: job.overallProgress,
      position: typeof item.position === "number" ? item.position : null,
      detail: running ? running.label : undefined,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      etaSec: job.status === "running" ? progressEta(job.overallProgress, job.startedAt) : null,
    };
  }
  // research
  const item_ = await getResearch(item.jobId);
  if (!item_) return null;
  // Map status → progress 0-100 (sin tracking granular)
  const progressMap: Record<string, number> = {
    queued: 0,
    downloading: 30,
    transcribing: 70,
    ready: 100,
    failed: 100,
  };
  return {
    kind: "research",
    jobId: item_.id,
    videoId: item_.metadata?.author ?? new URL(item_.url).hostname.replace("www.", ""),
    status: item_.status,
    progress: progressMap[item_.status] ?? 0,
    position: typeof item.position === "number" ? item.position : null,
    detail: item_.url.length > 60 ? item_.url.slice(0, 60) + "…" : item_.url,
    startedAt: item_.addedAt,
    finishedAt: item_.status === "ready" || item_.status === "failed" ? item_.updatedAt : undefined,
  };
}

export async function GET() {
  const snapshot = listQueue();
  const active = await Promise.all(
    snapshot.active.map((e) => buildEntryFromQueue({ ...e, position: undefined }))
  );
  const pending = await Promise.all(
    snapshot.pending.map((e) =>
      buildEntryFromQueue({ kind: e.kind, jobId: e.jobId, position: e.position })
    )
  );

  const activeFiltered = active.filter((e): e is QueueEntryView => e !== null);
  const pendingFiltered = pending.filter((e): e is QueueEntryView => e !== null);

  // Terminados de las últimas 24h (más recientes primero) — el panel los muestra
  // como "Listo ✓" / "Falló" con opción de reintentar, hasta que el usuario los cierre.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const liveIds = new Set([...activeFiltered, ...pendingFiltered].map((e) => e.jobId));
  const finished: QueueEntryView[] = [
    ...listEditorJobs()
      .filter((j) => (j.status === "done" || j.status === "failed") && (j.finishedAt ?? 0) > cutoff)
      .map(finishedEditorEntry),
    ...listLongFormJobs()
      .filter((j) => (j.status === "done" || j.status === "failed") && (j.finishedAt ?? 0) > cutoff)
      .map(finishedLongFormEntry),
  ]
    .filter((e) => !liveIds.has(e.jobId))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, 20);

  return NextResponse.json({
    maxConcurrent: snapshot.maxConcurrent,
    active: activeFiltered,
    pending: pendingFiltered,
    finished,
    totalActive: activeFiltered.length,
    totalPending: pendingFiltered.length,
    totalFinished: finished.length,
  });
}

/**
 * POST /api/jobs/queue?action=unstuck — recovery cuando un runner crashea
 * silenciosamente y deja active inconsistente. Limpia active y dispara tick.
 */
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "unstuck") {
    const result = forceUnstuck();
    return NextResponse.json({ ok: true, ...result });
  }
  if (action === "cancel-all") {
    const result = cancelAllPending();
    return NextResponse.json({ ok: true, ...result });
  }
  if (action === "cancel") {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) return NextResponse.json({ error: "falta jobId" }, { status: 400 });
    const cancelled = cancelPending(jobId);
    return NextResponse.json(
      cancelled
        ? { ok: true, jobId }
        : { ok: false, error: "no está en cola (¿ya arrancó?)" },
      { status: cancelled ? 200 : 404 }
    );
  }
  return NextResponse.json(
    { error: "action=unstuck | cancel-all | cancel (con jobId) required" },
    { status: 400 }
  );
}
