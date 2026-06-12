/**
 * GET /api/ollama/status — semáforo de la IA local.
 *
 * Hace un fetch server-side a http://127.0.0.1:11434/api/tags con timeout de 2s.
 * Devuelve { running: boolean, models: string[] } — nunca falla con 500: si la IA
 * local está apagada o no responde a tiempo, responde { running: false, models: [] }.
 *
 * El wizard de largos lo usa para mostrar el pill verde/rojo del modo inteligente
 * y para bloquear el arranque ANTES de que el pipeline falle a los 10 minutos.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!r.ok) {
      return NextResponse.json({ running: false, models: [] });
    }
    const data = (await r.json().catch(() => ({}))) as {
      models?: { name?: string }[];
    };
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m?.name).filter((n): n is string => typeof n === "string" && n.length > 0)
      : [];
    return NextResponse.json({ running: true, models });
  } catch {
    // Apagada, puerto cerrado o timeout de 2s: el semáforo queda en rojo.
    return NextResponse.json({ running: false, models: [] });
  }
}
