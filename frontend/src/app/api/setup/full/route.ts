/**
 * "Configurar todo": descarga de una sola vez TODO lo que la app necesita para
 * funcionar igual en cualquier PC — modelos de voz (crítico) + librerías de
 * assets (música, iconos, fuentes, efectos). Corre python/setup_all.py, que es
 * robusto (reintentos; las mejoras que fallan no abortan el resto).
 *
 *   POST /api/setup/full → arranca (idempotente: si ya corre, ok)
 *   GET  /api/setup/full → { running, done, ok, lastLine }
 */
import { NextResponse } from "next/server";
import { runProcess } from "@/lib/run-process";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import path from "node:path";

export const dynamic = "force-dynamic";

interface FullSetupState {
  running: boolean;
  done: boolean;
  ok: boolean;
  lastLine: string;
  startedAt: number;
}

const g = globalThis as unknown as { __setupFull?: FullSetupState };

export async function GET() {
  const s = g.__setupFull;
  if (!s) return NextResponse.json({ running: false, done: false, ok: false, lastLine: "" });
  return NextResponse.json({ running: s.running, done: s.done, ok: s.ok, lastLine: s.lastLine });
}

export async function POST() {
  if (g.__setupFull?.running) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }
  const state: FullSetupState = {
    running: true,
    done: false,
    ok: false,
    lastLine: "Configurando Viralito: modelos de IA y librerías de assets…",
    startedAt: Date.now(),
  };
  g.__setupFull = state;

  // En background. Sin timeout total (puede tardar mucho en conexión lenta); el
  // idle-timeout de 5 min detecta cuelgues reales (la descarga viva emite progreso).
  void runProcess(
    PYTHON_EXE,
    [path.join(PYTHON_DIR, "setup_all.py")],
    PYTHON_DIR,
    (chunk) => {
      const line = chunk
        .split(/\r?\n|\r/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (line) state.lastLine = line.replace(/^\[setup\]\s*/, "").slice(0, 160);
    },
    undefined,
    5 * 60 * 1000
  ).then((r) => {
    state.running = false;
    state.done = true;
    state.ok = r.ok;
    if (!r.ok) state.lastLine = r.stderr.slice(-200) || "Algo falló — revisa tu conexión y reintenta.";
  });

  return NextResponse.json({ ok: true });
}
