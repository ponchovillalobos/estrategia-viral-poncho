import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR } from "@/lib/paths";

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
  // Priorizar subcarpetas de proveedor (pixabay/freesound/github) sobre MUSIC_DIR raíz
  const candidates = [
    path.join(MUSIC_DIR, "pixabay", file),
    path.join(MUSIC_DIR, "freesound", file),
    path.join(MUSIC_DIR, "github", file),
    path.join(MUSIC_DIR, file),
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
    const contentType = types[ext] ?? "audio/mpeg";

    // Soporte REAL de Range (206): useWindowedAudioData pide el audio por ventanas.
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
      },
    });
  } catch {
    return new Response("not found", { status: 404, headers: CORS_HEADERS });
  }
}
