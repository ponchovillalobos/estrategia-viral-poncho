import { NextRequest } from "next/server";
import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { RAW_DIR, RENDERS_DIR, LF_CLIPS, LF_RENDERS } from "@/lib/paths";

export const dynamic = "force-dynamic";

const CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB por chunk para playback fluido

function nodeToWeb(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array>;
}

function contentTypeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".m4v":
    case ".mp4":
      return "video/mp4";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "video/mp4";
  }
}

/**
 * Encuentra el video que coincide con `id` en una lista ordenada de directorios.
 * Para long-form renders, los archivos tienen sufijo `_styleId` (ej `_supreme.mp4`),
 * así que también probamos prefix match `id_*`.
 */
async function findVideo(
  dirs: string[],
  id: string,
  allowPrefix: boolean
): Promise<string | null> {
  for (const dir of dirs) {
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const exact = files.find((f) => path.basename(f, path.extname(f)) === id);
    if (exact) return path.join(dir, exact);
    if (allowPrefix) {
      const pref = files.find((f) => path.basename(f, path.extname(f)).startsWith(id + "_"));
      if (pref) return path.join(dir, pref);
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const source = req.nextUrl.searchParams.get("source") ?? "raw"; // raw | render

  // Construí la lista de directorios a buscar — short primero, long-form como fallback.
  // Long-form: el "raw" del proyecto vive en LF_CLIPS (los clips son los segmentos editables);
  // los renders editados viven en LF_RENDERS con sufijo _styleId.
  let dirs: string[];
  let allowPrefix = false;
  if (source === "render") {
    dirs = [RENDERS_DIR, LF_RENDERS];
    allowPrefix = true; // long-form renders tienen sufijo _styleId
  } else {
    dirs = [RAW_DIR, LF_CLIPS];
  }

  const filePath = await findVideo(dirs, id, allowPrefix);
  if (!filePath) {
    return new Response("not found", { status: 404 });
  }

  const stat = await fs.stat(filePath);
  const fileSize = stat.size;
  const contentType = contentTypeFor(path.extname(filePath));
  const range = req.headers.get("range");

  // HEAD: respondé sin body para que <video> conozca tamaño antes de pedir el primer rango
  if (req.method === "HEAD") {
    return new Response(null, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (!range) {
    return new Response(nodeToWeb(createReadStream(filePath)), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Soportar "bytes=START-", "bytes=START-END" y "bytes=-SUFFIX"
  const match2 = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match2) {
    return new Response("invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const [, startStr, endStr] = match2;
  let start: number;
  let end: number;
  if (startStr === "" && endStr !== "") {
    const suffix = parseInt(endStr, 10);
    start = Math.max(fileSize - suffix, 0);
    end = fileSize - 1;
  } else if (startStr !== "") {
    start = parseInt(startStr, 10);
    end = endStr ? parseInt(endStr, 10) : Math.min(start + CHUNK_BYTES - 1, fileSize - 1);
  } else {
    return new Response("invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  if (start >= fileSize || end >= fileSize || start > end) {
    return new Response("range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const chunkSize = end - start + 1;
  return new Response(nodeToWeb(createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return GET(req, ctx);
}
