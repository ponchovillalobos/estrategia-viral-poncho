/**
 * Snapshot unificado de la cola: activos + pendientes con estado de cada job.
 * Consumido por el QueuePanel cliente con polling cada ~3s.
 */
import { NextResponse } from "next/server";
import { getJob as getEditorJob } from "@/lib/job-store";
import { getLongFormJob } from "@/lib/long-form-job-store";
import { getResearch } from "@/lib/research-store";
import { listQueue, forceUnstuck, cancelAllPending, type JobKind } from "@/lib/job-queue";
import { NextRequest } from "next/server";

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
        ? `estilo: ${job.currentStyle}`
        : `${job.styles.length} estilos`,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
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

  return NextResponse.json({
    maxConcurrent: snapshot.maxConcurrent,
    active: activeFiltered,
    pending: pendingFiltered,
    totalActive: activeFiltered.length,
    totalPending: pendingFiltered.length,
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
  return NextResponse.json(
    { error: "action=unstuck or action=cancel-all required" },
    { status: 400 }
  );
}
