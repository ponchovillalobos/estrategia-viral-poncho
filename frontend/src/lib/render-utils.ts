/**
 * Utilidades compartidas de render (F0 — auditoría suprema):
 *
 *  - `remotionConcurrency()` → cuántos workers pasar a `remotion render --concurrency`.
 *    Sin el flag, Remotion usa la mitad de los cores; con cores-1 el render es ~2x más
 *    rápido en máquinas sin GPU. Override con env `VIRAL_REMOTION_CONCURRENCY`.
 *
 *  - `acquireRenderLock()` / `releaseRenderLock()` → lock file por videoId para que dos
 *    renders del mismo video NUNCA escriban el mismo `__rendering.mp4` (pasaba si el
 *    server se reiniciaba con un job "running" y se relanzaba). El lock caduca solo
 *    (stale > 30 min) para no bloquear para siempre tras un crash.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RENDERS_DIR } from "@/lib/paths";

const STALE_LOCK_MS = 30 * 60 * 1000;

export function remotionConcurrency(): number {
  const fromEnv = Number(process.env.VIRAL_REMOTION_CONCURRENCY);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv);
  // Tope en 8: con más workers, todos piden frames del stream HTTP del dev server
  // a la vez y OffthreadVideo revienta el delayRender (timeout a los 28s). 8 da
  // ~2x sobre el default de Remotion sin ahogar al server que sirve el video.
  return Math.min(8, Math.max(1, os.cpus().length - 1));
}

/** Timeout de delayRender para `remotion render/still` (ms). El default de 28s se
 *  queda corto cuando el dev server sirve el video fuente bajo carga. */
export const REMOTION_DELAY_TIMEOUT_MS = 120_000;

function lockPath(videoId: string): string {
  return path.join(RENDERS_DIR, `${videoId}.__lock`);
}

/**
 * Intenta tomar el lock de render de un video. Devuelve `true` si lo tomó.
 * Si hay un lock vivo (otro render en curso, < 30 min), devuelve `false`.
 * Un lock viejo (crash previo) se considera stale y se roba.
 */
export async function acquireRenderLock(videoId: string): Promise<boolean> {
  const lock = lockPath(videoId);
  await fs.mkdir(RENDERS_DIR, { recursive: true }).catch(() => {});
  try {
    // "wx" = create exclusivo: falla si ya existe → atómico a nivel FS.
    await fs.writeFile(lock, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const stat = await fs.stat(lock);
      if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
        await fs.rm(lock, { force: true });
        await fs.writeFile(lock, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {
      /* carrera: otro proceso lo limpió/tomó entre medio */
    }
    return false;
  }
}

export async function releaseRenderLock(videoId: string): Promise<void> {
  await fs.rm(lockPath(videoId), { force: true }).catch(() => {});
}

/**
 * `fs.rename` con reintentos ante EBUSY/EPERM (típico cuando OneDrive o el antivirus
 * tienen el archivo abierto un instante). 5 intentos con backoff 200ms→3s.
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  let delay = 200;
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES")) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 3000);
    }
  }
}
