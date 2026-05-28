/**
 * GET /api/sfx/list — lista SFX disponibles en SFX_DIR.
 *
 * Si existe `manifest.json` (generado por python/synth_sfx.py), usa ese para
 * incluir categoría. Sino escanea el directorio.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SFX_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface SfxEntry {
  name: string;
  filename: string;
  category?: string;
  sizeBytes?: number;
  url: string;
}

export async function GET() {
  try {
    await fs.mkdir(SFX_DIR, { recursive: true });

    // Carpetas a escanear (priority orden): github > curated > pixabay
    // github tiene los 67 SFX reales descargados de rse/soundfx (CC0/CC-BY)
    // curated tiene los 28 sintéticos como fallback
    const GITHUB_DIR = path.join(SFX_DIR, "github");
    await fs.mkdir(GITHUB_DIR, { recursive: true });

    // Intentar leer manifest.json (más rico: incluye category)
    let manifest: { name: string; category: string; sizeBytes: number }[] | null = null;
    try {
      const raw = await fs.readFile(path.join(SFX_DIR, "manifest.json"), "utf-8");
      manifest = JSON.parse(raw);
    } catch {
      manifest = null;
    }

    if (manifest && Array.isArray(manifest)) {
      const sfx: SfxEntry[] = manifest.map((m) => ({
        name: path.basename(m.name, path.extname(m.name)).replace(/[_-]/g, " "),
        filename: m.name,
        category: m.category,
        sizeBytes: m.sizeBytes,
        url: `/api/sfx/stream?file=${encodeURIComponent(m.name)}`,
      }));
      return NextResponse.json({ sfx, count: sfx.length, source: "manifest" });
    }

    // Fallback: escanear
    const files = await fs.readdir(SFX_DIR);
    const sfx: SfxEntry[] = files
      .filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f))
      .sort()
      .map((f) => ({
        name: path.basename(f, path.extname(f)).replace(/[_-]/g, " "),
        filename: f,
        category: f.split("-")[0] || "other",
        url: `/api/sfx/stream?file=${encodeURIComponent(f)}`,
      }));
    return NextResponse.json({ sfx, count: sfx.length, source: "scan" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
