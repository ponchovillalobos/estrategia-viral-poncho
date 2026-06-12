/**
 * POST/GET /api/ollama/setup — instalación y arranque de la IA local (Ollama) con 1 clic.
 *
 * POST { action: "auto", model?: string }  → arranca la reparación en background y
 *   responde de inmediato { started: true }. Si ya hay una corriendo, { started: false, already: true }.
 * GET → { phase: "idle"|"starting"|"installing"|"downloading_model"|"ready"|"error", pct?, detail? }.
 *   Nunca tira 500: si algo truena, responde phase "error" con detail humano.
 *
 * Flujo de "auto":
 *   1. ¿Ya responde http://127.0.0.1:11434/api/tags? → directo al modelo.
 *   2. ¿Existe el exe instalado? → "starting": spawn detached sin ventana y poll hasta 20s.
 *   3. ¿No existe? → "installing": winget silencioso, o descarga directa de ollama.com + /VERYSILENT.
 *   4. Modelo: si falta, "downloading_model" con pct del stream NDJSON de /api/pull → "ready".
 *
 * Estado en globalThis (sobrevive hot-reload, mismo patrón que doctor/prepare y job-queue).
 * Watchdog: si la corrida completa supera 15 min, se marca "error" para nunca dejar la UI colgada.
 */
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_BASE = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3:1.7b";
const WATCHDOG_MS = 15 * 60 * 1000; // 15 min para TODA la corrida
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min para winget / instalador
const START_WAIT_MS = 20_000; // hasta 20s esperando a que el server conteste

type Phase = "idle" | "starting" | "installing" | "downloading_model" | "ready" | "error";

interface SetupState {
  phase: Phase;
  pct?: number;
  detail?: string;
  /** true mientras la corrida en background sigue viva. */
  running: boolean;
  /** Identificador de la corrida: evita que una corrida vieja (o el watchdog) pise a una nueva. */
  runId: number;
  startedAt: number;
}

const g = globalThis as unknown as { __ollamaSetup?: SetupState };

/** Escribe fase/pct/detail SOLO si la corrida `runId` sigue siendo la activa. */
function setPhase(runId: number, phase: Phase, extra?: { pct?: number; detail?: string }) {
  const s = g.__ollamaSetup;
  if (!s || s.runId !== runId) return;
  // Una corrida que ya terminó (ready/error, p. ej. por watchdog) no se puede revivir.
  if (!s.running && (s.phase === "ready" || s.phase === "error")) return;
  s.phase = phase;
  s.pct = extra?.pct;
  s.detail = extra?.detail;
  if (phase === "ready" || phase === "error") s.running = false;
}

/* ----------------------------- helpers de red ----------------------------- */

/** ¿Responde el server local? Devuelve la lista de modelos instalados, o null si está caído. */
async function fetchTags(timeoutMs = 2000): Promise<string[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = (await r.json().catch(() => ({}))) as { models?: { name?: string }[] };
    return Array.isArray(data.models)
      ? data.models
          .map((m) => m?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
      : [];
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* --------------------------- helpers de procesos -------------------------- */

/** Corre un proceso (sin ventana) y resuelve con su exit code; rechaza en ENOENT o timeout. */
function runProcess(exe: string, args: string[], timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(exe, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ya muerto */
      }
      reject(new Error("timeout"));
    }, timeoutMs);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err); // típicamente ENOENT (el exe no existe)
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

/** Rutas candidatas donde el instalador deja ollama.exe. */
function findOllamaExe(): string | null {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, "Programs", "Ollama", "ollama.exe"),
    "C:\\Program Files\\Ollama\\ollama.exe",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* unidad inaccesible — seguir */
    }
  }
  return null;
}

/** Arranca Ollama detached y sin ventana. Prefiere "ollama app.exe" (la app de bandeja,
 *  que levanta el server y lo mantiene vivo); si no existe, `ollama.exe serve`. */
function spawnOllama(ollamaExe: string): void {
  const appExe = path.join(path.dirname(ollamaExe), "ollama app.exe");
  let exe = ollamaExe;
  let args: string[] = ["serve"];
  try {
    if (fs.existsSync(appExe)) {
      exe = appExe;
      args = [];
    }
  } catch {
    /* usar ollama.exe serve */
  }
  const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {
    /* el poll de /api/tags decide si arrancó o no */
  });
  child.unref();
}

/** Espera hasta `maxMs` a que /api/tags conteste (poll cada 1s). */
async function waitForServer(maxMs: number): Promise<string[] | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const tags = await fetchTags(1500);
    if (tags !== null) return tags;
    await sleep(1000);
  }
  return null;
}

/* ------------------------------- instalación ------------------------------ */

/** Instala Ollama: primero winget silencioso; si no hay winget o falla, descarga
 *  directa del instalador oficial y /VERYSILENT. Lanza Error si todo falla. */
async function installOllama(runId: number): Promise<void> {
  // Intento 1: winget (viene con Windows 10/11 moderno).
  try {
    const code = await runProcess(
      "winget",
      [
        "install",
        "-e",
        "--id",
        "Ollama.Ollama",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--silent",
      ],
      INSTALL_TIMEOUT_MS,
    );
    if (code === 0 && findOllamaExe()) return;
  } catch {
    // winget no existe o se colgó — caer a descarga directa.
  }
  if (findOllamaExe()) return; // winget pudo haber instalado aunque el code no fuera 0

  // Intento 2: descarga directa del instalador oficial.
  const installerPath = path.join(os.tmpdir(), "OllamaSetup.exe");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INSTALL_TIMEOUT_MS);
  try {
    const r = await fetch("https://ollama.com/download/OllamaSetup.exe", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok || !r.body) throw new Error(`descarga http ${r.status}`);

    const total = Number(r.headers.get("content-length") || 0);
    let received = 0;
    // Pasarela que cuenta bytes para reportar pct aproximado de la descarga.
    const counted = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (total > 0) {
          setPhase(runId, "installing", {
            pct: Math.min(99, Math.round((received / total) * 100)),
            detail: "Descargando el instalador de la IA local…",
          });
        }
        controller.enqueue(chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(r.body.pipeThrough(counted) as import("stream/web").ReadableStream),
      fs.createWriteStream(installerPath),
    );
  } finally {
    clearTimeout(timer);
  }

  setPhase(runId, "installing", { detail: "Instalando la IA local…" });
  // El instalador de Ollama es per-user (no pide admin); /VERYSILENT lo hace invisible.
  const code = await runProcess(installerPath, ["/VERYSILENT", "/NORESTART"], INSTALL_TIMEOUT_MS);
  if (code !== 0 && !findOllamaExe()) {
    throw new Error(`instalador exit ${code}`);
  }
  if (!findOllamaExe()) throw new Error("instalador terminó pero no se encontró ollama.exe");
}

/* ----------------------------- descarga modelo ---------------------------- */

/** Hace pull del modelo parseando el stream NDJSON para reportar pct. */
async function pullModel(runId: number, model: string): Promise<void> {
  const r = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    cache: "no-store",
  });
  if (!r.ok || !r.body) throw new Error(`pull http ${r.status}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let success = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt: { status?: string; error?: string; completed?: number; total?: number };
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.status === "success") success = true;
      if (typeof evt.completed === "number" && typeof evt.total === "number" && evt.total > 0) {
        setPhase(runId, "downloading_model", {
          pct: Math.min(100, Math.round((evt.completed / evt.total) * 100)),
          detail: `Descargando el modelo de IA (${model})…`,
        });
      }
    }
  }
  if (!success) throw new Error("el pull terminó sin status success");
}

/* ------------------------------ corrida "auto" ---------------------------- */

async function runAuto(runId: number, model: string): Promise<void> {
  // Watchdog: pase lo que pase, a los 15 min esto termina en error (nunca colgado).
  const watchdog = setTimeout(() => {
    setPhase(runId, "error", {
      detail: "La reparación tardó demasiado. Reinicia la app e intenta de nuevo.",
    });
  }, WATCHDOG_MS);

  try {
    // 1. ¿Ya está corriendo el server?
    let tags = await fetchTags(2000);

    if (tags === null) {
      // 2. ¿Está instalado el exe?
      let exe = findOllamaExe();

      if (!exe) {
        // 3. Instalar.
        setPhase(runId, "installing", { detail: "Instalando la IA local (Ollama)…" });
        try {
          await installOllama(runId);
        } catch {
          setPhase(runId, "error", {
            detail:
              "No se pudo instalar la IA local automáticamente. Descárgala gratis de ollama.com/download, instálala y vuelve a intentar.",
          });
          return;
        }
        exe = findOllamaExe();
        if (!exe) {
          setPhase(runId, "error", {
            detail:
              "No se pudo instalar la IA local automáticamente. Descárgala gratis de ollama.com/download, instálala y vuelve a intentar.",
          });
          return;
        }
      }

      // 2b. Arrancar y esperar hasta 20s.
      setPhase(runId, "starting", { detail: "Arrancando la IA local…" });
      spawnOllama(exe);
      tags = await waitForServer(START_WAIT_MS);
      if (tags === null) {
        setPhase(runId, "error", {
          detail:
            "La IA local está instalada pero no arrancó. Ábrela desde el menú Inicio (Ollama) y vuelve a intentar.",
        });
        return;
      }
    }

    // 4. Modelo: ¿ya está descargado?
    const hasModel = tags.some((n) => n === model || n === `${model}:latest`);
    if (!hasModel) {
      setPhase(runId, "downloading_model", {
        pct: 0,
        detail: `Descargando el modelo de IA (${model})…`,
      });
      try {
        await pullModel(runId, model);
      } catch {
        setPhase(runId, "error", {
          detail: "No se pudo descargar el modelo de IA. Revisa tu conexión e intenta de nuevo.",
        });
        return;
      }
    }

    setPhase(runId, "ready", { pct: 100, detail: "La IA local está lista." });
  } catch {
    setPhase(runId, "error", {
      detail: "Algo falló al preparar la IA local. Intenta de nuevo en unos segundos.",
    });
  } finally {
    clearTimeout(watchdog);
    // Cinturón extra: si por cualquier razón la corrida activa quedó sin cerrar, ciérrala.
    const s = g.__ollamaSetup;
    if (s && s.runId === runId && s.phase !== "ready" && s.phase !== "error") {
      setPhase(runId, "error", {
        detail: "Algo falló al preparar la IA local. Intenta de nuevo en unos segundos.",
      });
    }
  }
}

/* --------------------------------- handlers ------------------------------- */

export async function GET() {
  try {
    const s = g.__ollamaSetup;
    if (!s) return NextResponse.json({ phase: "idle" });
    const body: { phase: Phase; pct?: number; detail?: string } = { phase: s.phase };
    if (typeof s.pct === "number") body.pct = s.pct;
    if (typeof s.detail === "string" && s.detail) body.detail = s.detail;
    return NextResponse.json(body);
  } catch {
    // GET jamás tira 500.
    return NextResponse.json({ phase: "idle" });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; model?: string };
    if (body.action !== "auto") {
      return NextResponse.json(
        { started: false, detail: "Acción no soportada. Usa { action: \"auto\" }." },
        { status: 400 },
      );
    }
    const model =
      typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

    const existing = g.__ollamaSetup;
    if (existing?.running) {
      return NextResponse.json({ started: false, already: true });
    }

    const runId = Date.now();
    g.__ollamaSetup = {
      phase: "starting",
      detail: "Revisando la IA local…",
      running: true,
      runId,
      startedAt: Date.now(),
    };

    // Background: NO esperamos — el POST responde de inmediato y la UI pollea el GET.
    void runAuto(runId, model).catch(() => {
      setPhase(runId, "error", {
        detail: "Algo falló al preparar la IA local. Intenta de nuevo en unos segundos.",
      });
    });

    return NextResponse.json({ started: true });
  } catch {
    return NextResponse.json(
      { started: false, detail: "No se pudo iniciar la reparación. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
