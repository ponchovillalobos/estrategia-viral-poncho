/**
 * GET /api/research/[id]/thumb — sirve la miniatura JPG/PNG/WEBP del item.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getResearch } from "@/lib/research-store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

function contentTypeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await getResearch(id);
  if (!item || !item.thumbnailPath) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const buf = await fs.readFile(item.thumbnailPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentTypeFor(path.extname(item.thumbnailPath)),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
