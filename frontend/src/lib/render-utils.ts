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
  // La rasterización de frames en CPU es EL cuello de botella del render. El tope
  // anterior de 8 dejaba ociosa la mayoría de la CPU en equipos de muchos núcleos
  // (20 núcleos → solo 8 usados = render lento). Era por miedo a que muchos workers
  // pidiendo frames a la vez reventaran OffthreadVideo (timeout 28s). Pero ahora el
  // render usa un cache grande de OffthreadVideo (--offthreadvideo-cache-size-in-bytes):
  // tras el primer decode los frames quedan cacheados y no se re-piden al stream. Por
  // eso subimos el tope a 16 para usar la CPU de verdad (20 núcleos: 8→16 ≈ 2x). El
  // timeout también subió a 120s. Override con VIRAL_REMOTION_CONCURRENCY si una PC se
  // queda corta de RAM o da timeouts.
  return Math.min(16, Math.max(1, os.cpus().length - 2));
}

/** Timeout de delayRender para `remotion render/still` (ms). El default de 28s se
 *  queda corto cuando el dev server sirve el video fuente bajo carga. */
export const REMOTION_DELAY_TIMEOUT_MS = 120_000;

/**
 * Flag de caché de OffthreadVideo (PARTE B — OLA 1). Remotion mantiene en memoria
 * los frames decodeados de los <OffthreadVideo> (b-roll, mirror, clone); con la caché
 * default chica, bajo presión los descarta ("cache pruned") y re-decodea, lo que frena
 * el render. Cuantos MÁS frames quepan en cache, menos re-decodes y más rápido va.
 *
 * ADAPTATIVO a la RAM LIBRE: el cache se dimensiona como el MAYOR entre el 35% de la
 * RAM TOTAL (piso histórico, sirve aunque el equipo esté presionado) y ~50% de la RAM
 * LIBRE actual (aprovecha la memoria ociosa cuando la hay para cachear más). Se acota
 * con piso 512 MB y tope 8 GB: el render corre con hasta 16 workers, así que se deja
 * aire para esos workers y el resto del SO (no tomamos toda la RAM libre). Esto NO
 * cambia la calidad — sólo evita re-decodes. Override fijo con env
 * VIRAL_OFFTHREAD_CACHE_MB (en MB) si alguien quiere clavar un valor.
 * OJO: el nombre EXACTO del flag es `--offthreadvideo-cache-size-in-bytes`
 * (sin guion interno en "offthreadvideo").
 */
export function offthreadCacheFlag(): string {
  const FLOOR = 512 * 1024 * 1024; // 512 MB
  const CEIL = 8 * 1024 * 1024 * 1024; // 8 GB (deja aire para 16 workers + SO)

  // Override manual: VIRAL_OFFTHREAD_CACHE_MB en megabytes.
  const fromEnvMb = Number(process.env.VIRAL_OFFTHREAD_CACHE_MB);
  if (Number.isFinite(fromEnvMb) && fromEnvMb >= 1) {
    const envBytes = Math.max(FLOOR, Math.min(Math.floor(fromEnvMb * 1024 * 1024), CEIL));
    return `--offthreadvideo-cache-size-in-bytes=${envBytes}`;
  }

  const thirtyFiveOfTotal = Math.floor(os.totalmem() * 0.35);
  const halfOfFree = Math.floor(os.freemem() * 0.5);
  // El MAYOR de ambos: nunca por debajo del 35% del total, pero subimos si hay RAM libre.
  const target = Math.max(thirtyFiveOfTotal, halfOfFree);
  const bytes = Math.max(FLOOR, Math.min(target, CEIL));
  return `--offthreadvideo-cache-size-in-bytes=${bytes}`;
}

function lockPath(videoId: string): string {
  return path.join(RENDERS_DIR, `${videoId}.__lock`);
}

/** ¿El proceso dueño del lock sigue vivo? (señal 0 = solo chequeo, no mata). */
function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH: el proceso murió (crash o cierre de la app)
  }
}

/**
 * Intenta tomar el lock de render de un video. Devuelve `true` si lo tomó.
 * Un lock se considera HUÉRFANO (y se roba al instante) si el PID que lo creó
 * ya no existe — cubre el caso real de cerrar la app a mitad de un render
 * (TerminateProcess no deja correr el finally que lo liberaba; antes el
 * usuario quedaba bloqueado con "409 ya hay un render en curso" hasta 30 min).
 * El mtime > 30 min queda como red de seguridad adicional.
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
      const [stat, owner] = await Promise.all([
        fs.stat(lock),
        fs.readFile(lock, "utf-8").catch(() => ""),
      ]);
      const ownerPid = parseInt(owner.trim(), 10);
      const orphan = Number.isFinite(ownerPid) && !pidAlive(ownerPid);
      const stale = Date.now() - stat.mtimeMs > STALE_LOCK_MS;
      if (orphan || stale) {
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

/**
 * Barre locks huérfanos al BOOT del server: cualquier `.__lock` cuyo PID ya no
 * exista es de una sesión anterior. Se llama una vez por proceso (lazy).
 */
let lockSweepDone = false;
export async function sweepOrphanLocks(): Promise<void> {
  if (lockSweepDone) return;
  lockSweepDone = true;
  try {
    const entries = await fs.readdir(RENDERS_DIR);
    for (const e of entries) {
      if (!e.endsWith(".__lock")) continue;
      const p = path.join(RENDERS_DIR, e);
      const owner = parseInt((await fs.readFile(p, "utf-8").catch(() => "")).trim(), 10);
      if (!Number.isFinite(owner) || !pidAlive(owner)) {
        await fs.rm(p, { force: true }).catch(() => {});
      }
    }
  } catch {
    /* RENDERS_DIR puede no existir aún */
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
