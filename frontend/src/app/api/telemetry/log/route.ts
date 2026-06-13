/**
 * POST /api/telemetry/log — el frontend reporta un error/evento para que quede en
 * el log local (telemetry.ts vive en server; el cliente no puede escribir el archivo).
 * Best-effort: si algo falla, responde ok igual (no romper el flujo del usuario).
 */
import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      nivel?: "error" | "warning" | "info";
      origen?: string;
      mensaje?: string;
      detalle?: string;
      ctx?: Record<string, unknown>;
    };
    log({
      nivel: b.nivel ?? "error",
      tipo: "frontend_error",
      origen: b.origen || "frontend",
      mensaje: (b.mensaje || "").slice(0, 300),
      detalle: (b.detalle || "").slice(0, 3000),
      ctx: b.ctx,
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}
