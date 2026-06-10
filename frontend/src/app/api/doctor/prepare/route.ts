/**
 * Preparación de primera vez: descarga el modelo de voz (~1.5 GB) UNA sola vez,
 * con progreso visible — antes esto pasaba en silencio dentro de la primera
 * transcripción y un timeout de 10 min la mataba en conexiones lentas.
 *
 *   POST /api/doctor/prepare → arranca la descarga (idempotente: si ya corre, ok)
 *   GET  /api/doctor/prepare → { running, done, ok, lastLine }
 */
import { NextResponse } from "next/server";
import { runProcess } from "@/lib/run-process";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import path from "node:path";

export const dynamic = "force-dynamic";

interface PrepareState {
  running: boolean;
  done: boolean;
  ok: boolean;
  lastLine: string;
  startedAt: number;
}

const g = globalThis as unknown as { __doctorPrepare?: PrepareState };

export async function GET() {
  const s = g.__doctorPrepare;
  if (!s) return NextResponse.json({ running: false, done: false, ok: false, lastLine: "" });
  return NextResponse.json({ running: s.running, done: s.done, ok: s.ok, lastLine: s.lastLine });
}

export async function POST() {
  if (g.__doctorPrepare?.running) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }
  const state: PrepareState = {
    running: true,
    done: false,
    ok: false,
    lastLine: "Descargando el modelo de voz (~1.5 GB)… puede tardar varios minutos según tu conexión.",
    startedAt: Date.now(),
  };
  g.__doctorPrepare = state;

  // En background (no bloquea la response). Sin timeout total: una descarga de
  // 1.5 GB en conexión lenta puede tardar 30+ min; el idle-timeout de 5 min
  // detecta cuelgues reales (descarga viva = emite progreso).
  void runProcess(
    PYTHON_EXE,
    [path.join(PYTHON_DIR, "transcribe.py"), "--download-model", "small"],
    PYTHON_DIR,
    (chunk) => {
      const line = chunk
        .split(/\r?\n|\r/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (line) state.lastLine = line.slice(0, 160);
    },
    undefined,
    5 * 60 * 1000
  ).then((r) => {
    state.running = false;
    state.done = true;
    state.ok = r.ok;
    if (!r.ok) state.lastLine = r.stderr.slice(-200) || "La descarga falló — revisá tu conexión.";
  });

  return NextResponse.json({ ok: true });
}
