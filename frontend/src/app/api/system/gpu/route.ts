/**
 * GET /api/system/gpu — uso EN VIVO de la GPU NVIDIA (panel Rendimiento, H7).
 *
 * Corre `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total` una vez.
 * NUNCA inventa números: si no hay GPU NVIDIA / nvidia-smi no está / falla / da
 * timeout → { available:false }. Pensado para polleo ligero desde la UI.
 */
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";

/** Spawn con timeout propio. Nunca rechaza: timeout/ENOENT → ok:false. */
function spawnExe(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok, stdout, stderr });
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(cmd, args);
    } catch (e) {
      resolve({ ok: false, stdout: "", stderr: String(e) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      finish(false);
    }, timeoutMs);
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", () => finish(false));
    proc.on("close", (code) => finish(code === 0));
  });
}

export async function GET() {
  const r = await spawnExe(
    "nvidia-smi",
    ["--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
    4000
  );
  if (!r.ok || !r.stdout.trim()) {
    return NextResponse.json({ available: false });
  }
  // Primera GPU. Formato: "12, 1024, 8192"
  const line = r.stdout.trim().split(/\r?\n/)[0] ?? "";
  const parts = line.split(",").map((p) => p.trim());
  const gpuUtil = Number(parts[0]);
  const memUsedMb = Number(parts[1]);
  const memTotalMb = Number(parts[2]);
  if (!Number.isFinite(gpuUtil) || !Number.isFinite(memUsedMb)) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({
    available: true,
    gpuUtil,
    memUsedMb,
    memTotalMb: Number.isFinite(memTotalMb) ? memTotalMb : null,
  });
}
