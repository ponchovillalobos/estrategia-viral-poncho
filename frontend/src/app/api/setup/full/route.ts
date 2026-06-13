/**
 * "Configurar todo": descarga de una sola vez TODO lo que la app necesita para
 * funcionar igual en cualquier PC — modelos de voz (crítico) + librerías de
 * assets (música, iconos, fuentes, efectos). Corre python/setup_all.py, que es
 * robusto (reanudable; reintentos por paso; las mejoras que fallan no abortan el
 * resto) y emite progreso en JSON línea por línea (un evento por paso).
 *
 *   POST /api/setup/full → arranca (idempotente: si ya corre, ok)
 *   GET  /api/setup/full → { running, done, ok, lastLine, stages }
 */
import { NextResponse } from "next/server";
import { runProcess } from "@/lib/run-process";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import path from "node:path";

export const dynamic = "force-dynamic";

interface StageEvent {
  stage: string;
  status: string; // start | ok | skip | fail | fail_final
  ms?: number;
  error?: string;
}

interface FullSetupState {
  running: boolean;
  done: boolean;
  ok: boolean;
  lastLine: string;
  startedAt: number;
  stages: StageEvent[];
}

const g = globalThis as unknown as { __setupFull?: FullSetupState };

export async function GET() {
  const s = g.__setupFull;
  if (!s)
    return NextResponse.json({ running: false, done: false, ok: false, lastLine: "", stages: [] });
  return NextResponse.json({
    running: s.running,
    done: s.done,
    ok: s.ok,
    lastLine: s.lastLine,
    stages: s.stages,
  });
}

/**
 * Acumula los eventos de progreso de un chunk de stdout:
 *   - actualiza lastLine con la última línea HUMANA (no-JSON), para la UI.
 *   - parsea cada línea JSON ({stage,status,...}) que emite setup_all._emit y la
 *     agrega a stages (manteniendo el orden de llegada).
 */
function ingest(state: FullSetupState, chunk: string) {
  const lines = chunk
    .split(/\r?\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);

  let lastHuman = "";
  for (const line of lines) {
    if (line.startsWith("{")) {
      try {
        const ev = JSON.parse(line) as Partial<StageEvent>;
        if (ev && typeof ev.stage === "string" && typeof ev.status === "string") {
          state.stages.push({
            stage: ev.stage,
            status: ev.status,
            ...(typeof ev.ms === "number" ? { ms: ev.ms } : {}),
            ...(typeof ev.error === "string" ? { error: ev.error } : {}),
          });
          continue;
        }
      } catch {
        // no era JSON válido: lo tratamos como línea humana
      }
    }
    lastHuman = line;
  }
  if (lastHuman) state.lastLine = lastHuman.replace(/^\[setup\]\s*/, "").slice(0, 160);
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
    stages: [],
  };
  g.__setupFull = state;

  // En background. Sin timeout total (puede tardar mucho: assets + torch CUDA de
  // ~2.5GB en GPU); el idle-timeout de 15 min detecta cuelgues reales sin matar
  // descargas/instalaciones lentas que quedan en silencio (pip CUDA tarda).
  void runProcess(
    PYTHON_EXE,
    [path.join(PYTHON_DIR, "setup_all.py")],
    PYTHON_DIR,
    (chunk) => ingest(state, chunk),
    undefined,
    15 * 60 * 1000
  ).then((r) => {
    state.running = false;
    state.done = true;
    state.ok = r.ok;
    if (!r.ok) state.lastLine = r.stderr.slice(-200) || "Algo falló — revisa tu conexión y reintenta.";
  });

  return NextResponse.json({ ok: true });
}
