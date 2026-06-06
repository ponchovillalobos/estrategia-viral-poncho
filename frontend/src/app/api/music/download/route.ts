import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { MUSIC_DIR, SFX_DIR, PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import { runProcess } from "@/lib/run-process";

export const dynamic = "force-dynamic";

/**
 * Descarga un pack curado de música (y SFX) libre de costo. Dos fuentes:
 *
 *   - source="github" (DEFAULT, SIN API key): música CC0 de FreePD vía el repo
 *     SoundSafari/CC0-1.0-Music. Descarga directa de GitHub, no requiere registro.
 *   - source="freesound" (requiere key gratis de freesound.org/apiv2/apply): banco
 *     más grande de música + SFX. La key va en el body (o FREESOUND_API_KEY) y NO se
 *     persiste.
 *
 * Los archivos caen en {MUSIC_DIR}/<source> (o {SFX_DIR}/freesound), carpetas que el
 * portal y los estilos ya escanean.
 */
export async function POST(req: NextRequest) {
  let body: { apiKey?: string; type?: "music" | "sfx"; source?: "github" | "freesound"; limit?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const source = body.source === "freesound" ? "freesound" : "github";
  const type = body.type === "sfx" ? "sfx" : "music";

  // ── Fuente GitHub (sin API key) — sólo música ──
  if (source === "github") {
    const outDir = path.join(MUSIC_DIR, "github");
    await fs.mkdir(outDir, { recursive: true });
    const args = [path.join(PYTHON_DIR, "github_music.py"), "download", "--out-dir", outDir];
    if (body.limit && Number.isFinite(body.limit)) args.push("--limit", String(body.limit));
    const run = await runProcess(PYTHON_EXE, args, PYTHON_DIR, undefined, 240_000);
    const lastJson = run.stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).pop();
    let result: unknown = null;
    try {
      result = lastJson ? JSON.parse(lastJson) : null;
    } catch {
      result = null;
    }
    if (!run.ok || !result) {
      return NextResponse.json(
        { ok: false, error: run.stderr?.slice(-300) || "falló la descarga", result },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  }

  // ── Fuente Freesound (requiere API key) — música o SFX ──
  const apiKey = (body.apiKey || process.env.FREESOUND_API_KEY || "").trim();
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
