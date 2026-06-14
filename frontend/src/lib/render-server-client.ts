/**
 * Cliente del RENDER-SERVER (OLA 2 — edición ULTRA rápida).
 * ────────────────────────────────────────────────────────────────────────────
 * Mantiene VIVO un único proceso `remotion/render-server.mjs` (bundle webpack
 * una sola vez) y le manda pedidos de render por stdin (JSON-lines). Cada render
 * que pasa por acá se ahorra los 15-40s de re-bundle de `npx remotion render`.
 *
 * FALLBACK (no negociable): este módulo es una OPTIMIZACIÓN opt-in. Si el server
 * no arranca, no responde, da timeout o devuelve error, `renderWithServer()`
 * lanza/resuelve en `ok:false` y el caller DEBE caer al camino `npx remotion
 * render` que ya funciona. El camino viejo queda intacto como red de seguridad.
 *
 * Activación: por defecto ENCENDIDO. Se puede apagar con
 *   VIRAL_RENDER_SERVER=0  → siempre usa el camino viejo.
 *
 * El post-encode NVENC, el mastering de audio y el LUT los sigue aplicando el
 * caller sobre el .mp4 que devuelve este server (idéntico al de `npx remotion
 * render`): este módulo NO los toca.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import os from "node:os";
import readline from "node:readline";
import { REMOTION_DIR } from "@/lib/paths";

/** ¿Está habilitado el render-server? Default sí; `VIRAL_RENDER_SERVER=0` lo apaga. */
export function renderServerEnabled(): boolean {
  return process.env.VIRAL_RENDER_SERVER !== "0";
}

interface PendingRender {
  resolve: (out: string) => void;
  reject: (err: Error) => void;
  onProgress?: (rendered: number, total: number) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ServerMsg {
  type: "ready" | "result" | "progress" | "fatal" | "pong";
  id?: string;
  ok?: boolean;
  outPath?: string;
  error?: string;
  renderedFrames?: number;
  totalFrames?: number;
}

let proc: ChildProcessWithoutNullStreams | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<string, PendingRender>();

/** Mata el server (al apagar la app o ante un crash) y rechaza lo pendiente. */
function teardown(reason: string) {
  if (proc) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ya muerto */
    }
  }
  proc = null;
  readyPromise = null;
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(`render-server caído: ${reason}`));
  }
  pending.clear();
}

/**
 * Arranca el server si no está vivo y espera su `{"type":"ready"}` (bundle listo).
 * Cachea la promesa para no arrancar dos procesos en paralelo. Si el arranque o
 * el bundle inicial falla, rechaza → el caller hace fallback.
 */
function ensureServer(): Promise<void> {
  if (proc && readyPromise) return readyPromise;

  const npxNode = process.execPath; // el node que corre Next: garantizado en PATH
  const child = spawn(npxNode, ["render-server.mjs"], {
    cwd: REMOTION_DIR,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  }) as ChildProcessWithoutNullStreams;
  proc = child;

  // stderr del server → log del server Next (diagnóstico), sin contaminar stdout.
  child.stderr.on("data", (d) => {
    const s = d.toString().trimEnd();
    if (s) console.log(`[render-server] ${s}`);
  });

  readyPromise = new Promise<void>((resolve, reject) => {
    // Tope para el bundle inicial: si no está listo en 90s, asumimos que algo
    // falló y caemos al camino viejo.
    const readyTimer = setTimeout(() => {
      reject(new Error("render-server no quedó listo en 90s"));
      teardown("timeout de arranque");
    }, 90_000);

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(trimmed) as ServerMsg;
      } catch {
        return; // línea no-JSON: ignorar
      }
      if (msg.type === "ready") {
        clearTimeout(readyTimer);
        resolve();
        return;
      }
      if (msg.type === "fatal") {
        clearTimeout(readyTimer);
        reject(new Error(`render-server fatal: ${msg.error ?? "desconocido"}`));
        teardown("fatal al bundlear");
        return;
      }
      if (msg.type === "progress" && msg.id) {
        const p = pending.get(msg.id);
        p?.onProgress?.(msg.renderedFrames ?? 0, msg.totalFrames ?? 0);
        return;
      }
      if (msg.type === "result" && msg.id) {
        const p = pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(msg.id);
        if (msg.ok && msg.outPath) p.resolve(msg.outPath);
        else p.reject(new Error(msg.error ?? "render-server devolvió ok:false"));
      }
    });
  });

  child.on("exit", (code) => teardown(`el proceso salió (code=${code})`));
  child.on("error", (err) => teardown(`spawn error: ${String(err)}`));

  return readyPromise;
}

function defaultOffthreadCacheBytes(): number {
  const thirtyFive = Math.floor(os.totalmem() * 0.35);
  return Math.max(512 * 1024 * 1024, Math.min(thirtyFive, 6 * 1024 * 1024 * 1024));
}

export interface RenderServerOpts {
  /** Ruta absoluta al props.json ya construido por build-props.mjs. */
  propsPath: string;
  /** Ruta absoluta del .mp4 de salida (el temporal __rendering.mp4). */
  outPath: string;
  concurrency: number;
  /** delayRender timeout (ms) — paridad con --timeout del camino viejo. */
  timeoutMs: number;
  /** 0.5 para preview, 1 para final. */
  scale?: number;
  /** Tope DURO de todo el render por este server; si se excede, fallback. */
  hardTimeoutMs?: number;
  onProgress?: (rendered: number, total: number) => void;
}

/**
 * Intenta renderizar vía el server de larga vida. Resuelve con la ruta del .mp4
 * en éxito; RECHAZA ante cualquier problema (server no arranca, timeout, error
 * de render) para que el caller haga fallback al `npx remotion render`.
 */
export async function renderWithServer(opts: RenderServerOpts): Promise<string> {
  await ensureServer();
  const id = String(nextId++);
  const hardTimeout = opts.hardTimeoutMs ?? 25 * 60 * 1000;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      // Un render colgado puede haber dejado el server en mal estado: lo
      // reiniciamos para que el siguiente pedido empiece limpio.
      teardown("timeout de render");
      reject(new Error(`render-server: timeout (${hardTimeout}ms)`));
    }, hardTimeout);

    pending.set(id, { resolve, reject, onProgress: opts.onProgress, timer });

    const req = {
      id,
      propsPath: opts.propsPath,
      outPath: opts.outPath,
      concurrency: opts.concurrency,
      timeoutMs: opts.timeoutMs,
      scale: opts.scale ?? 1,
      offthreadCacheBytes: defaultOffthreadCacheBytes(),
    };
    try {
      proc!.stdin.write(JSON.stringify(req) + "\n");
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error(`no se pudo escribir al render-server: ${String(err)}`));
    }
  });
}
