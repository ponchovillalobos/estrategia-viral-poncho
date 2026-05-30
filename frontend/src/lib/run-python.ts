import { spawn } from "node:child_process";
import path from "node:path";
import { PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import { runProcess, parseLastJsonLine } from "@/lib/run-process";

export interface PythonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  parsed?: unknown;
}

/**
 * Versión moderna que se construye sobre `runProcess` y entiende el patrón "JSON al final
 * del stdout" típico de los scripts del proyecto. Soporta timeouts e idle-timeout. Para
 * adopción gradual desde auto-build/otras rutas.
 *
 * @param scriptFile  nombre del .py relativo a `PYTHON_DIR` (ej. "tts.py") o ruta absoluta.
 * @param args        argumentos al script.
 * @param opts        timeouts y callback de progreso opcionales.
 *
 * @returns `{ ok, parsed, stdout, stderr }` donde `parsed` es el último JSON del stdout
 *          o `null` si no había. `ok` queda en `true` solo si exit code 0 Y no hubo timeout.
 */
export async function runPythonJson<T = unknown>(
  scriptFile: string,
  args: string[] = [],
  opts: {
    timeoutMs?: number;
    idleTimeoutMs?: number;
    onProgress?: (data: string) => void;
  } = {}
): Promise<{ ok: boolean; parsed: T | null; stdout: string; stderr: string }> {
  const scriptPath = path.isAbsolute(scriptFile)
    ? scriptFile
    : path.join(PYTHON_DIR, scriptFile);
  const r = await runProcess(
    PYTHON_EXE,
    [scriptPath, ...args],
    PYTHON_DIR,
    opts.onProgress,
    opts.timeoutMs,
    opts.idleTimeoutMs
  );
  const parsed = parseLastJsonLine<T>(r.stdout);
  return { ok: r.ok, parsed, stdout: r.stdout, stderr: r.stderr };
}

// ─── Legacy (no tocar; se mantiene por compatibilidad con callers viejos) ───

export function runPython(script: string, args: string[] = []): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [script, ...args], {
      cwd: PYTHON_DIR,
      shell: false,
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", reject);
    proc.on("close", (code) => {
      let parsed: unknown = undefined;
      try {
        const lastLine = stdout.trim().split("\n").pop() ?? "";
        parsed = JSON.parse(lastLine);
      } catch {
        // not JSON
      }
      resolve({ ok: code === 0, stdout, stderr, parsed });
    });

    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGTERM");
    }, 10 * 60 * 1000);
  });
}
