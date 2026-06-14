/**
 * GET /api/illustrations/stream?file=<set>/<name>.svg — sirve una ilustración de
 * personas CC0 (assets/illustrations/{open-doodles,open-peeps}) para previsualizarla
 * en la galería de stickers y consumirla en el render. A diferencia de los iconos
 * (currentColor), estas son MULTICOLOR → se sirven tal cual; el tinte duotono por
 * tema lo aplica la capa de Remotion, no acá.
 *
 * Igual que icons/sfx/lottie: ruta relativa con subcarpeta (set), bloqueando
 * traversal (".."); el resolve + check de containment garantiza no escapar del dir.
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const ILLUS_DIR = path.join(DATA_ROOT, "assets", "illustrations");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "";
  const norm = file.split("\\").join("/").replace(/^\/+/, "");
  if (!norm || norm.includes("..") || !/^[a-z0-9_/-]+\.(svg|png)$/i.test(norm)) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }
  const target = path.resolve(ILLUS_DIR, norm);
  if (target !== ILLUS_DIR && !target.startsWith(ILLUS_DIR + path.sep)) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }
  try {
    const buf = await fs.readFile(target);
    const type = norm.toLowerCase().endsWith(".png") ? "image/png" : "image/svg+xml";
    return new Response(new Uint8Array(buf), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return new Response("not found", { status: 404, headers: CORS_HEADERS });
  }
}
