import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SFX_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new Response("bad request", { status: 400 });
  }
  // Buscar el archivo en 3 carpetas hermanas:
  //   .../sfx/github/  → 67 SFX reales descargados de rse/soundfx (CC0/CC-BY)
  //   .../sfx/pixabay/ → si el user descarga del pack Pixabay
  //   .../sfx/curated/ → 28 SFX sintéticos legacy (SFX_DIR apunta aquí)
  const SFX_BASE = path.dirname(SFX_DIR); // .../sfx/
  const candidates = [
    path.join(SFX_BASE, "github", file),
    path.join(SFX_BASE, "pixabay", file),
    path.join(SFX_DIR, file),
    path.join(SFX_BASE, file), // fallback raíz
  ];
  let filePath: string | null = null;
  for (const c of candidates) {
    try {
      await fs.stat(c);
      filePath = c;
      break;
    } catch {
      // sigue
    }
  }
  if (!filePath) return new Response("not found", { status: 404 });
  try {
    const stat = await fs.stat(filePath);
    const stream = createReadStream(filePath);
    const ext = path.extname(file).toLowerCase();
    const types: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
    };
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": types[ext] ?? "audio/wav",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
