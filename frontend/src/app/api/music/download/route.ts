import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { MUSIC_DIR, SFX_DIR, PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import { runProcess } from "@/lib/run-process";

export const dynamic = "force-dynamic";

/**
 * B2/B3 — Descarga un pack curado de música o SFX desde Freesound (CC0, uso comercial
 * sin atribución). La API key se pasa en el body (o vía FREESOUND_API_KEY) y NO se
 * persiste: se usa sólo para esta corrida. Los archivos caen en:
 *   - música → {MUSIC_DIR}/freesound   (el portal y los estilos ya los escanean)
 *   - sfx    → {SFX_DIR}/freesound
 *
 * Conseguí tu key gratis en https://freesound.org/apiv2/apply/.
 */
export async function POST(req: NextRequest) {
  let body: { apiKey?: string; type?: "music" | "sfx" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body inválido" }, { status: 400 });
  }

  const apiKey = (body.apiKey || process.env.FREESOUND_API_KEY || "").trim();
  const type = body.type === "sfx" ? "sfx" : "music";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Falta la API key de Freesound. Conseguila gratis en freesound.org/apiv2/apply" },
      { status: 400 }
    );
  }

  const outDir = type === "music" ? path.join(MUSIC_DIR, "freesound") : path.join(SFX_DIR, "freesound");
  await fs.mkdir(outDir, { recursive: true });

  // download-pack puede tardar (varias descargas) → 4 min de margen.
  const run = await runProcess(
    PYTHON_EXE,
    [
      path.join(PYTHON_DIR, "freesound_client.py"),
      "download-pack",
      "--key", apiKey,
      "--type", type,
      "--out-dir", outDir,
    ],
    PYTHON_DIR,
    undefined,
    240_000
  );

  const lastJson = run.stdout
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith("{"))
    .pop();
  let result: unknown = null;
  try {
    result = lastJson ? JSON.parse(lastJson) : null;
  } catch {
    result = null;
  }

  if (!run.ok || !result) {
    return NextResponse.json(
      { ok: false, error: run.stderr?.slice(-300) || "fallo la descarga", result },
      { status: 500 }
    );
  }
  return NextResponse.json(result);
}
