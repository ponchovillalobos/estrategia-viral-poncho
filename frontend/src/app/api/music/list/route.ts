import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await fs.mkdir(MUSIC_DIR, { recursive: true });
    // Escanear MUSIC_DIR + subcarpetas de cada proveedor (pixabay, freesound, github)
    const folders = [
      MUSIC_DIR,
      path.join(MUSIC_DIR, "pixabay"),
      path.join(MUSIC_DIR, "freesound"),
      path.join(MUSIC_DIR, "github"),
    ];
    const tracks: { name: string; filename: string; url: string; source: string }[] = [];
    for (const folder of folders) {
      try {
        const files = await fs.readdir(folder);
        for (const f of files) {
          if (!/\.(mp3|wav|m4a|ogg)$/i.test(f)) continue;
          tracks.push({
            name: path.basename(f, path.extname(f)).replace(/[_-]/g, " "),
            filename: f,
            url: `/api/music/stream?file=${encodeURIComponent(f)}`,
            source: folder.includes("pixabay")
              ? "pixabay"
              : folder.includes("freesound")
                ? "freesound"
                : folder.includes("github")
                  ? "github"
                  : "curated",
          });
        }
      } catch {
        // carpeta inexistente
      }
    }
    return NextResponse.json({ tracks, count: tracks.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
