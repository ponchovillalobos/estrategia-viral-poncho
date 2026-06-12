/**
 * GET /api/jobs/history — los últimos 50 jobs TERMINADOS (done/failed) del editor,
 * más recientes primero. Para el historial del panel de cola y para reintentar:
 * cada entrada trae los params originales (videoId/styles/accentColor) con los que
 * se puede re-POSTear /api/editor/auto-build.
 */
import { NextResponse } from "next/server";
import { listJobs, jobTitle } from "@/lib/job-store";
import { humanizeError } from "@/lib/humanize-error";

export const dynamic = "force-dynamic";

/**
 * Convierte el error del step a texto humano. Los errores de auto-build ya vienen
 * humanizados con una cola "[detalle] …" técnica: la recortamos para mostrar.
 * Si el texto crudo matchea una regla conocida (disco lleno, ffmpeg, etc.) gana
 * esa; si no, mostramos el texto original (sin la cola técnica) como fallback.
 */
function humanReason(raw: string | undefined): string | null {
  if (!raw) return null;
  const visible = raw.split("\n[detalle]")[0].trim();
  return humanizeError(raw, visible || undefined).message;
}

export async function GET() {
  const finished = listJobs()
    .filter((j) => j.status === "done" || j.status === "failed")
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
    .slice(0, 50)
    .map((j) => {
      const failedStep = j.steps.find((s) => s.status === "fail" && s.error);
      return {
        jobId: j.id,
        status: j.status,
        title: jobTitle(j) ?? j.videoId,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt ?? null,
        error: j.status === "failed" ? humanReason(failedStep?.error) : null,
        // Params originales para reintentar el mismo trabajo vía /api/editor/auto-build.
        params: {
          videoId: j.videoId,
          styles: j.styles,
          accentColor: j.accentColor,
        },
      };
    });

  return NextResponse.json({ jobs: finished, total: finished.length });
}
