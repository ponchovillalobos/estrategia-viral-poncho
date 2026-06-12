/**
 * POST /api/long_form/cancel — cancela un proceso de video largo a pedido del usuario.
 *
 * Body JSON: { jobId: string }
 *
 * Dos escenarios:
 *   1. Todavía en fila → cancelPending() lo saca de la cola sin que llegue a arrancar.
 *   2. Ya corriendo    → taskkill /PID {pid} /T /F mata el árbol completo
 *                        (python + ffmpeg + remotion).
 *
 * En ambos casos el job queda con estado "cancelled" (no "failed") y mensaje
 * "Cancelado por ti". Se marca cancelado ANTES de matar el proceso para que el
 * handler de cierre del spawn no lo pise con un fallo.
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { cancelPending } from "@/lib/job-queue";
import {
  cancelLongFormJob,
  getLongFormJob,
  getLongFormPid,
  unregisterLongFormPid,
} from "@/lib/long-form-job-store";

export const dynamic = "force-dynamic";

function killTree(pid: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
      });
      killer.on("close", done);
      killer.on("error", done);
      // Por si taskkill se cuelga: no bloquear la respuesta más de 5s.
      setTimeout(done, 5000);
    } catch {
      done();
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { jobId?: string };
    const jobId = (body.jobId ?? "").trim();
    if (!jobId) {
      return NextResponse.json({ error: "Falta indicar qué proceso cancelar." }, { status: 400 });
    }

    const job = getLongFormJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "No encontré ese proceso. Quizá ya terminó y se limpió." },
        { status: 404 }
      );
    }
    if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      // Ya terminal: nada que matar; idempotente.
      return NextResponse.json({ ok: true, already: true, status: job.status });
    }

    // 1) Si está en fila, sacarlo de la cola (no llegó a spawnnear nada).
    const wasPending = cancelPending(jobId);

    // Marcar "cancelled" antes de matar: bloquea que el close-handler escriba "failed".
    cancelLongFormJob(jobId);

    // 2) Si ya corre, matar el árbol de procesos.
    if (!wasPending) {
      const pid = getLongFormPid(jobId);
      if (pid != null) {
        await killTree(pid);
        unregisterLongFormPid(jobId);
      }
    }

    return NextResponse.json({ ok: true, cancelled: true, status: "cancelled" });
  } catch (err) {
    console.error("[long_form/cancel] error:", err);
    return NextResponse.json(
      { error: "No se pudo cancelar el proceso. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
