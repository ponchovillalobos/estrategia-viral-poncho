/**
 * Sirve las ILUSTRACIONES ANIMADAS Lottie (Noto de Google, descargadas por
 * download_animated_icons.py a {DATA_ROOT}/assets/lottie/noto). Con CORS:
 * el render de Remotion las carga con fetch() desde otro origen.
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";
import { countFiles, fireRepair } from "@/lib/self-heal-assets";

export const dynamic = "force-dynamic";

const LOTTIE_DIR = path.join(DATA_ROOT, "assets", "lottie", "noto");

// Self-heal: si las ilustraciones Lottie quedaron por debajo del mínimo,
// re-descargar en background sin bloquear el request.
const LOTTIE_MIN_FILES = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "";
  // Acepta RUTAS RELATIVAS dentro de assets/lottie/noto (incluido el subdirectorio
  // `catalog/` donde viven las 609 ilustraciones del catálogo Noto) — igual que sfx,
  // que sirve audios anidados. Sólo bloqueamos traversal (".." o ruta absoluta);
  // el join + check de containment garantiza que no se escape de LOTTIE_DIR.
  //   ✓ "money.json"  ✓ "catalog/1f4b0.json"   ✗ "../secret.json"  ✗ "/etc/x.json"
  const normFile = file.split("\\").join("/").replace(/^\/+/, "");
  if (
    !normFile ||
    normFile.includes("..") ||
    !/^[a-z0-9_/-]+\.json$/i.test(normFile)
  ) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }
  // Self-heal: contar las ilustraciones (recursivo sobre noto/). Si está corta,
  // disparar repair en background sin bloquear.
  const lottieCount = await countFiles(LOTTIE_DIR, true);
  if (lottieCount < LOTTIE_MIN_FILES) fireRepair("lottie");
  // Defensa en profundidad: resolver y verificar que el resultado siga DENTRO de
  // LOTTIE_DIR (por si alguna combinación rara de separadores burlara el regex).
  const target = path.resolve(LOTTIE_DIR, normFile);
  if (target !== LOTTIE_DIR && !target.startsWith(LOTTIE_DIR + path.sep)) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }
  try {
    const buf = await fs.readFile(target);
    return new Response(new Uint8Array(buf), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    // No se pudo servir el archivo pedido. Si la carpeta está vacía, 503 + repair;
    // si hay otras ilustraciones, es un 404 honesto (archivo puntual no existe).
    if (lottieCount === 0) {
      fireRepair("lottie");
      return new Response(
        JSON.stringify({ ok: false, error: "Esta librería se está re-descargando — intentá en 1-2 minutos" }),
        { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404, headers: CORS_HEADERS });
  }
}
