/**
 * GET /api/research/[id]/video — stream del .mp4 descargado, soporta Range.
 * Patrón copiado de frontend/src/app/api/videos/[id]/stream/route.ts.
 */
import { NextRequest } from "next/server";
import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getResearch } from "@/lib/research-store";

export const dynamic = "force-dynamic";

const CHUNK_BYTES = 4 * 1024 * 1024;

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

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await getResearch(id);
  if (!item || !item.videoPath) {
    return new Response("not found", { status: 404 });
  }

  let stat;
  try {
    stat = await fs.stat(item.videoPath);
  } catch {
    return new Response("video file missing on disk", { status: 404 });
  }
  const fileSize = stat.size;
  const contentType = contentTypeFor(path.extname(item.videoPath));
  const range = req.headers.get("range");

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
    return new Response(nodeToWeb(createReadStream(item.videoPath)), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) {
    return new Response("invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const [, startStr, endStr] = m;
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
  return new Response(nodeToWeb(createReadStream(item.videoPath, { start, end })), {
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

export async function HEAD(req: NextRequest, ctx: Ctx) {
  return GET(req, ctx);
}
