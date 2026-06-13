/**
 * GET /api/sfx/list — lista SFX disponibles en SFX_DIR.
 *
 * COMBINA `manifest.json` (si existe, generado por python/synth_sfx.py — aporta
 * `category`) CON un scan recursivo de los archivos reales bajo assets/sfx
 * (curated/, github/, pixabay/). Dedup por nombre de archivo: el manifest gana en
 * metadata, el scan agrega cualquier SFX real que el manifest no liste (p.ej. los
 * descargados a /github después de generar el manifest).
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

    // La lista COMBINA dos fuentes (dedup por nombre de archivo):
    //   1. manifest.json (si existe): más rico, trae `category` y `sizeBytes`.
    //   2. scan RECURSIVO de archivos reales bajo .../assets/sfx/.
    // ANTES el branch del manifest hacía `return` temprano y TAPABA el scan: si
    // el manifest existía pero NO listaba los SFX de /github (descargados luego),
    // esos archivos reales no aparecían en la lista. Ahora el manifest siembra el
    // mapa primero (gana en metadata) y el scan AGREGA todo archivo real que el
    // manifest no incluya. El stream resuelve por nombre de archivo, así que la
    // clave de dedup es el filename.
    const byFilename = new Map<string, SfxEntry>();

    if (manifest && Array.isArray(manifest)) {
      for (const m of manifest) {
        if (!m || !m.name) continue;
        byFilename.set(m.name, {
          name: path.basename(m.name, path.extname(m.name)).replace(/[_-]/g, " "),
          filename: m.name,
          category: m.category,
          sizeBytes: m.sizeBytes,
          url: `/api/sfx/stream?file=${encodeURIComponent(m.name)}`,
        });
      }
    }

    // Escanear de forma RECURSIVA desde la RAÍZ de sfx (no SFX_DIR).
    // SFX_DIR apunta a .../assets/sfx/curated, pero los SFX descargados caen en
    // carpetas HERMANAS: .../assets/sfx/github/*.ogg, .../assets/sfx/pixabay/...
    // (igual que resuelve sfx/stream con SFX_BASE = dirname(SFX_DIR)). Escanear
    // solo SFX_DIR o su nivel raíz dejaría esos archivos invisibles.
    // withFileTypes + recursive recorre curated/, github/, pixabay/ y la raíz.
    const SFX_BASE = path.dirname(SFX_DIR); // .../assets/sfx/
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(SFX_BASE, { withFileTypes: true, recursive: true });
    } catch {
      entries = [];
    }
    for (const e of entries) {
      if (!e.isFile() || !/\.(mp3|wav|m4a|ogg)$/i.test(e.name)) continue;
      // El manifest ya lo cubre (con mejor metadata) → no lo pisamos.
      if (byFilename.has(e.name)) continue;
      byFilename.set(e.name, {
        name: path.basename(e.name, path.extname(e.name)).replace(/[_-]/g, " "),
        filename: e.name,
        category: e.name.split("-")[0] || "other",
        url: `/api/sfx/stream?file=${encodeURIComponent(e.name)}`,
      });
    }

    const sfx: SfxEntry[] = [...byFilename.values()].sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );
    const source = manifest && Array.isArray(manifest) ? "manifest+scan" : "scan";
    return NextResponse.json({ sfx, count: sfx.length, source });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
