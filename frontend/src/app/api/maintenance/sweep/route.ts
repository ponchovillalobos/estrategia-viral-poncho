import { NextResponse } from "next/server";
import { sweepLongFormOrphans, sweepShortOrphans } from "@/lib/orphan-sweep";

export const dynamic = "force-dynamic";

/**
 * Dispara la limpieza de huérfanos AHORA (largos + shorts), sin esperar al throttle de
 * 12h. Borra del disco los derivados (projects, renders, transcripts, cuts, clips…) de
 * videos que el usuario ya eliminó. Conservador: si no puede leer la carpeta de raws,
 * no borra nada. Devuelve cuántos archivos borró cada barrido.
 */
export async function POST() {
  try {
    const [long, short] = await Promise.all([
      sweepLongFormOrphans(),
      sweepShortOrphans(),
    ]);
    return NextResponse.json({
      ok: true,
      deleted: long.deleted + short.deleted,
      longForm: long,
      shorts: short,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
