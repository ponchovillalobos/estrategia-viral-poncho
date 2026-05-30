import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { VOICEOVER_DIR } from "@/lib/paths";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

/**
 * Sirve un WAV generado por Piper (`tts.py`). Toma el filename del query `?file=`
 * y lo busca en `VOICEOVER_DIR`. Solo basename (sin paths) para evitar traversal.
 */
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) return new Response("file requerido", { status: 400 });
  const safe = path.basename(file);
  if (safe !== file) return new Response("file inválido", { status: 400 });
  const full = path.join(VOICEOVER_DIR, safe);
  try {
    const st = await stat(full);
    if (!st.isFile()) return new Response("no existe", { status: 404 });
    const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(st.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("no existe", { status: 404 });
  }
}
