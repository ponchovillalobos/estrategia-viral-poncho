/**
 * GET /api/overlays/list?videoId=X — lista todos los overlays de un video.
 * Si no se pasa videoId, devuelve TODOS los overlays.
 */
import { NextRequest, NextResponse } from "next/server";
import { listOverlays } from "@/lib/overlays-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId") ?? undefined;
  const overlays = await listOverlays(videoId);
  return NextResponse.json({ overlays, count: overlays.length });
}
