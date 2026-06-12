/**
 * GET /api/system/paths — rutas reales de esta instalación.
 *
 * La UI NO debe hardcodear "C:\hermes-data": la carpeta de datos depende de la
 * máquina (viral-data, hermes-data o %USERPROFILE%\ViralStudio, según resuelve
 * lib/paths.ts). Cualquier pantalla que quiera mostrar "tus videos viven en X"
 * consulta este endpoint y muestra la ruta verdadera.
 */
import { NextResponse } from "next/server";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ dataRoot: DATA_ROOT });
}
