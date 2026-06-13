import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SFX_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

// CORS: el visualizador de audio de Remotion (useWindowedAudioData) lee el track
// con fetch() desde el bundle del render (otro origen) — sin estos headers, el
// browser headless bloquea la request y el render con fondo audio-reactivo muere.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
  if (!filePath) return new Response("not found", { status: 404, headers: CORS_HEADERS });
  try {
    const stat = await fs.stat(filePath);
    const ext = path.extname(file).toLowerCase();
    const types: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
    };
    const contentType = types[ext] ?? "audio/wav";

    // Soporte REAL de Range (206): el <audio> del preview pide el SFX por ventanas
    // para poder bufferear/seekear sin descargar el archivo entero.
    const range = req.headers.get("range");
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          const stream = createReadStream(filePath, { start, end });
          return new Response(stream as unknown as ReadableStream, {
            status: 206,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": contentType,
              "Content-Length": String(end - start + 1),
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    }

    const stream = createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404, headers: CORS_HEADERS });
  }
}
