/**
 * Diagnóstico / telemetría.
 *   GET  /api/telemetry        → últimos eventos + info del sistema (vista Diagnóstico).
 *   POST /api/telemetry        → arma un reporte (log + sistema) y trata de subirlo a un
 *                                 servicio de pegado libre (paste.rs) para tener una URL
 *                                 que compartir; si no, devuelve el texto para descargar.
 */
import { NextResponse } from "next/server";
import { leerEventos, infoSistema } from "@/lib/telemetry";
import { APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const eventos = await leerEventos(300);
  return NextResponse.json({
    version: APP_VERSION,
    sistema: infoSistema(),
    errores: eventos.filter((e) => e.nivel === "error").length,
    eventos,
  });
}

export async function POST() {
  const eventos = await leerEventos(500);
  const sistema = infoSistema();
  const reporte =
    `# Reporte Viralito v${APP_VERSION}\n` +
    `# Fecha: ${new Date().toISOString()}\n` +
    `# Sistema: ${JSON.stringify(sistema)}\n` +
    `# Errores recientes: ${eventos.filter((e) => e.nivel === "error").length}\n\n` +
    eventos.map((e) => JSON.stringify(e)).join("\n");

  let url: string | null = null;
  try {
    // paste.rs: POST del texto → devuelve una URL pública (sin registro ni API key).
    const r = await fetch("https://paste.rs/", {
      method: "POST",
      body: reporte.slice(0, 1024 * 1024),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.startsWith("http")) url = t;
    }
  } catch {
    /* sin internet o el servicio caído: devolvemos el texto para descargar */
  }

  return NextResponse.json({ ok: true, url, reporte });
}
