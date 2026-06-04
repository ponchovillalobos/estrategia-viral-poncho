/**
 * POST /api/long_form/import — multipart upload de un video largo desde la compu del usuario.
 *
 * Body: FormData con `file` (MP4/MOV/MKV/WEBM/M4V)
 * Acción: escribe + VALIDA el binario (ffprobe) y, si pasa, lo deja en LF_RAW.
 *
 * Gemelo de /api/videos/import pero apuntando a la carpeta de largos (LF_RAW).
 * La escritura + validación viven en lib/save-upload (rechaza uploads truncados/corruptos).
 */
import { NextRequest, NextResponse } from "next/server";
import { LF_RAW } from "@/lib/paths";
import { saveUploadedVideo, UploadError } from "@/lib/save-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min para videos largos (pueden ser grandes)

const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB — un curso/charla largo pesa más que un short

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file requerido" }, { status: 400 });
    }

    const saved = await saveUploadedVideo(file as File, LF_RAW, MAX_BYTES);
    return NextResponse.json({ ok: true, ...saved });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[long_form/import] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
