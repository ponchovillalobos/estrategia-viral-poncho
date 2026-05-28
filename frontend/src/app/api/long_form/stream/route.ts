import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LF_CLEAN, LF_CLIPS, LF_RAW, LF_RENDERS } from "@/lib/paths";

export const dynamic = "force-dynamic";

const SOURCES: Record<string, string> = {
  raw: LF_RAW,
  clean: LF_CLEAN,
  clip: LF_CLIPS,
  render: LF_RENDERS,
};

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  const source = req.nextUrl.searchParams.get("source") ?? "clip";
  const dir = SOURCES[source];
  if (!dir || !file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new Response("bad request", { status: 400 });
  }
  // Aceptar nombre con o sin extensión
  let filePath = path.join(dir, file);
  if (!file.includes(".")) {
    const candidates = await fs.readdir(dir).catch(() => [] as string[]);
    const match = candidates.find((f) => path.basename(f, path.extname(f)) === file);
    if (!match) return new Response("not found", { status: 404 });
    filePath = path.join(dir, match);
  }

  try {
    const stat = await fs.stat(filePath);
    const range = req.headers.get("range");
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".mov" ? "video/quicktime" : ext === ".webm" ? "video/webm" : "video/mp4";

    if (!range) {
      const stream = createReadStream(filePath);
      return new Response(stream as unknown as ReadableStream, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stat.size),
          "Accept-Ranges": "bytes",
        },
      });
    }
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024, stat.size - 1);
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
