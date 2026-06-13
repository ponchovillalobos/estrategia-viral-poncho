/**
 * Telemetría: registra TODO lo que pasa (errores, fallas, tiempos, eventos) en un
 * log local estructurado, para que dejemos de estar a ciegas con lo que le pasa al
 * usuario. Cada error de frontend, de ruta backend y de proceso Python queda acá.
 *
 * Archivo: <DATA_ROOT>/logs/viralito.jsonl (un evento JSON por línea, rotación a 20MB).
 * Se ve y se envía desde Configuración → Diagnóstico (/api/telemetry).
 *
 * Es BEST-EFFORT: nunca lanza ni bloquea — si no puede escribir, sigue de largo.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DATA_ROOT } from "./paths";

export type Nivel = "error" | "warning" | "info";

export interface Evento {
  ts: number;
  nivel: Nivel;
  tipo: string; // "python_error" | "api_error" | "frontend_error" | "render" | "evento" ...
  origen: string; // de dónde viene (ruta, script, componente)
  mensaje: string;
  detalle?: string; // stderr / stack / técnico
  ctx?: Record<string, unknown>;
}

const LOG_DIR = path.join(DATA_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "viralito.jsonl");
const MAX_BYTES = 20 * 1024 * 1024;

let cola: Promise<void> = Promise.resolve();

async function rotarSiHaceFalta(): Promise<void> {
  try {
    const st = await fs.stat(LOG_FILE).catch(() => null);
    if (st && st.size > MAX_BYTES) {
      await fs.rename(LOG_FILE, path.join(LOG_DIR, "viralito.1.jsonl")).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

/** Registra un evento (no lanza nunca). */
export function log(ev: Omit<Evento, "ts"> & { ts?: number }): void {
  const linea = JSON.stringify({ ts: Date.now(), ...ev }) + "\n";
  cola = cola.then(async () => {
    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
      await rotarSiHaceFalta();
      await fs.appendFile(LOG_FILE, linea, "utf-8");
    } catch {
      /* best-effort: nunca rompas el flujo por el log */
    }
  });
}

export function logError(origen: string, mensaje: string, err: unknown, ctx?: Record<string, unknown>): void {
  const detalle = err instanceof Error ? (err.stack ?? err.message) : String(err ?? "");
  log({ nivel: "error", tipo: "error", origen, mensaje, detalle: detalle.slice(0, 4000), ctx });
}

export function logProcesoPython(script: string, stderr: string, ctx?: Record<string, unknown>): void {
  log({
    nivel: "error",
    tipo: "python_error",
    origen: `python/${script}`,
    mensaje: `El proceso ${script} falló`,
    detalle: (stderr ?? "").slice(-2000),
    ctx,
  });
}

/** Lee los últimos N eventos del log (para la vista de Diagnóstico). */
export async function leerEventos(limite = 200): Promise<Evento[]> {
  try {
    const txt = await fs.readFile(LOG_FILE, "utf-8").catch(() => "");
    const lineas = txt.split("\n").filter((l) => l.trim());
    const ult = lineas.slice(-limite);
    const out: Evento[] = [];
    for (const l of ult) {
      try {
        out.push(JSON.parse(l) as Evento);
      } catch {
        /* línea corrupta, ignorar */
      }
    }
    return out.reverse(); // más recientes primero
  } catch {
    return [];
  }
}

/** Info del sistema para adjuntar al reporte (anónima). */
export function infoSistema(): Record<string, unknown> {
  return {
    os: `${os.platform()} ${os.release()}`,
    cpus: os.cpus()?.length ?? 0,
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
    arch: os.arch(),
    logPath: LOG_FILE,
  };
}

export const LOG_PATH = LOG_FILE;
