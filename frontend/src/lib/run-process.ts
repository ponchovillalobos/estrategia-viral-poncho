/**
 * Helper genérico para spawnear procesos (Python, ffmpeg, node, npx) con timeouts
 * y captura de stdout/stderr. Centraliza un patrón que se duplicaba en varias rutas.
 *
 * Características:
 *   - `timeoutMs`     → tope de tiempo total (mata el proceso al expirar).
 *   - `idleTimeoutMs` → tope por INACTIVIDAD (mata si no emite NADA por N ms).
 *                      Ideal para procesos largos pero "habladores" (render Remotion,
 *                      pipelines Python): un render que avanza emite progreso, así que
 *                      sólo se mata si DE VERDAD se trabó — sin matar renders largos.
 *   - `onProgress`    → callback con cada chunk de stdout/stderr (para parsear progreso).
 *
 * Devuelve `{ ok, stdout, stderr }`. NUNCA rechaza la promesa; los errores de spawn o
 * timeout vienen como `ok:false` con detalle en `stderr` — más simple para callers.
 */
import { spawn } from "node:child_process";

export interface RunProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runProcess(
  cmd: string,
  args: string[],
  cwd?: string,
  onProgress?: (data: string) => void,
  timeoutMs?: number,
  idleTimeoutMs?: number
): Promise<RunProcessResult> {
  return new Promise((resolve) => {
    // Node 17+ rechaza .cmd/.bat con shell:false en Windows (CVE-2024-27980 → EINVAL).
    // npx.cmd y otros wrappers necesitan shell:true. Para .exe nativos mantenemos shell:false.
    const isWindowsScript = process.platform === "win32" && /\.(cmd|bat|ps1)$/i.test(cmd);
    // PYTHONIOENCODING/PYTHONUTF8: en Windows, Python hereda cp1252 y corrompe acentos
    // ("Año" → mojibake) en el JSON de stdout, rompiendo parseLastJsonLine. Forzamos UTF-8
    // para TODOS los subprocess (inofensivo para ffmpeg/node).
    const proc = spawn(cmd, args, {
      cwd,
      shell: isWindowsScript,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
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

/**
 * Parsea el ÚLTIMO JSON-object encontrado en el stdout de un script. Patrón estándar
 * en este proyecto: los scripts Python imprimen logs en stderr y un JSON final en stdout
 * (sometimes después de logs informativos en stdout también). Filtra líneas que empiecen
 * con `{` y devuelve la última. Si no hay JSON parseable, devuelve `null`.
 */
export function parseLastJsonLine<T = unknown>(stdout: string): T | null {
  const candidate = stdout
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith("{"))
    .pop();
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
