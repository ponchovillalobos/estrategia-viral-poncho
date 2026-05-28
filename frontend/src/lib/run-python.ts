import { spawn } from "node:child_process";
import { PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";

export interface PythonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  parsed?: unknown;
}

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
