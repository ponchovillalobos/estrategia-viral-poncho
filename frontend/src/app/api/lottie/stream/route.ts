/**
 * Sirve las ILUSTRACIONES ANIMADAS Lottie (Noto de Google, descargadas por
 * download_animated_icons.py a {DATA_ROOT}/assets/lottie/noto). Con CORS:
 * el render de Remotion las carga con fetch() desde otro origen.
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const LOTTIE_DIR = path.join(DATA_ROOT, "assets", "lottie", "noto");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!/^[a-z0-9_-]+\.json$/.test(file)) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }
  try {
    const buf = await fs.readFile(path.join(LOTTIE_DIR, file));
    return new Response(new Uint8Array(buf), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404, headers: CORS_HEADERS });
  }
}
