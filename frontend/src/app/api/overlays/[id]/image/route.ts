/**
 * GET /api/overlays/[id]/image — sirve la imagen del overlay.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getOverlay } from "@/lib/overlays-store";

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
      return "application/octet-stream";
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const overlay = await getOverlay(id);
  if (!overlay || !overlay.imagePath) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const buf = await fs.readFile(overlay.imagePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentTypeFor(path.extname(overlay.imagePath)),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
