/**
 * GET /api/sfx/list — lista SFX disponibles bajo assets/sfx.
 *
 * COMBINA `manifest.json` (si existe, generado por python/synth_sfx.py — aporta
 * `category`) CON el ÍNDICE CACHEADO de SFX (frontend/src/lib/sfx-index.ts), que
 * escanea assets/sfx UNA vez (recursivo, podando `.git`/ocultos y junk `._*`) y se
 * cachea con TTL. ANTES esta ruta hacía un scan recursivo de ~4992 archivos EN CADA
 * REQUEST (incluido el `.git` de la PC de dev) → se colgaba 40-90s.
 *
 * Dedup por RUTA RELATIVA ÚNICA (no por basename): hay colisiones de nombre entre
 * packs. La `url` que se emite para cada efecto es exactamente la que
 * /api/sfx/stream sabe resolver (consistencia list↔stream, igual que music).
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SFX_DIR } from "@/lib/paths";
import { getSfxIndex } from "@/lib/sfx-index";

export const dynamic = "force-dynamic";

interface SfxEntry {
  name: string;
  /** Ruta relativa única (POSIX) — clave de dedup y param del stream. */
  filename: string;
  category?: string;
  sizeBytes?: number;
  url: string;
}

export async function GET() {
  try {
    await fs.mkdir(SFX_DIR, { recursive: true });

    // Intentar leer manifest.json (más rico: incluye category y sizeBytes).
    let manifest: { name: string; category: string; sizeBytes: number }[] | null = null;
    try {
      const raw = await fs.readFile(path.join(SFX_DIR, "manifest.json"), "utf-8");
      manifest = JSON.parse(raw);
    } catch {
      manifest = null;
    }

    // La lista COMBINA dos fuentes, deduplicando por RUTA RELATIVA ÚNICA:
    //   1. manifest.json (si existe): más rico, trae `category` y `sizeBytes`.
    //      Sus `name` son basenames de SFX curated → su ruta relativa es
    //      "curated/<name>" (SFX_DIR = .../assets/sfx/curated).
    //   2. el ÍNDICE CACHEADO: todo audio real bajo assets/sfx (recursivo).
    // El manifest siembra el mapa primero (gana en metadata); el índice AGREGA todo
    // archivo real que el manifest no incluya. El stream resuelve por la misma clave.
    const byRel = new Map<string, SfxEntry>();

    if (manifest && Array.isArray(manifest)) {
      for (const m of manifest) {
        if (!m || !m.name) continue;
        const rel = `curated/${m.name}`;
        byRel.set(rel, {
          name: path.basename(m.name, path.extname(m.name)).replace(/[_-]/g, " "),
          filename: rel,
          category: m.category,
          sizeBytes: m.sizeBytes,
          url: `/api/sfx/stream?file=${encodeURIComponent(rel)}`,
        });
      }
    }

    const idx = await getSfxIndex();
    for (const entry of idx.byRel.values()) {
      if (byRel.has(entry.relPath)) continue; // el manifest ya lo cubre con mejor metadata
      // Categoría heurística: primer segmento de carpeta (pack/proveedor) o prefijo.
      const segs = entry.relPath.split("/");
      const category = segs.length > 1 ? segs[0] : entry.filename.split(/[-_]/)[0] || "other";
      byRel.set(entry.relPath, {
        name: path.basename(entry.filename, path.extname(entry.filename)).replace(/[_-]/g, " "),
        filename: entry.relPath,
        category,
        url: `/api/sfx/stream?file=${encodeURIComponent(entry.relPath)}`,
      });
    }

    const sfx: SfxEntry[] = [...byRel.values()].sort((a, b) =>
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
