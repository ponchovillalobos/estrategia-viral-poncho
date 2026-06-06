import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new Response("bad request", { status: 400 });
  }
  // Priorizar /pixabay/ y /freesound/ sobre MUSIC_DIR raíz
  const candidates = [
    path.join(MUSIC_DIR, "pixabay", file),
    path.join(MUSIC_DIR, "freesound", file),
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
        "Content-Type": types[ext] ?? "audio/mpeg",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
