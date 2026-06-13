import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await fs.mkdir(MUSIC_DIR, { recursive: true });
    // Escanear MUSIC_DIR de forma RECURSIVA: los archivos descargados caen en
    // subcarpetas de proveedor (pixabay/freesound/github/...). withFileTypes +
    // recursive encuentra cualquier subcarpeta, no solo nombres hardcodeados.
    const tracks: { name: string; filename: string; url: string; source: string }[] = [];
    const seen = new Set<string>();
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(MUSIC_DIR, { withFileTypes: true, recursive: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const f = entry.name;
      if (!/\.(mp3|wav|m4a|ogg)$/i.test(f)) continue;
      // Carpeta que contiene el archivo (entry.parentPath en Node >=20, .path como fallback)
      const parent = (entry as unknown as { parentPath?: string; path?: string }).parentPath
        ?? (entry as unknown as { path?: string }).path
        ?? MUSIC_DIR;
      // El stream resuelve por nombre de archivo; evitar duplicados por mismo filename.
      if (seen.has(f)) continue;
      seen.add(f);
      const lower = parent.toLowerCase();
      tracks.push({
        name: path.basename(f, path.extname(f)).replace(/[_-]/g, " "),
        filename: f,
        url: `/api/music/stream?file=${encodeURIComponent(f)}`,
        source: lower.includes("pixabay")
          ? "pixabay"
          : lower.includes("freesound")
            ? "freesound"
            : lower.includes("github")
              ? "github"
              : "curated",
      });
    }
    return NextResponse.json({ tracks, count: tracks.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
