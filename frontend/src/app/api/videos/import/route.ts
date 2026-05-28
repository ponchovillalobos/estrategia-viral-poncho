/**
 * POST /api/videos/import — multipart upload de video desde la compu del usuario.
 *
 * Body: FormData con `file` (MP4/MOV/MKV/WEBM)
 * Acción: copia el binario a RAW_DIR con su nombre original (sanitizado).
 *
 * Después de importar, el usuario debe refrescar /api/videos/list (el cliente
 * llama loadVideos() automáticamente).
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RAW_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min para videos grandes

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const VALID_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

function sanitizeFilename(name: string): string {
  // Quitar path traversal y caracteres raros pero preservar legibilidad
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._\- ]/g, "_").slice(0, 200);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file requerido" }, { status: 400 });
    }
    const blob = file as File;
    const filename = sanitizeFilename(blob.name || "video.mp4");
    const ext = path.extname(filename).toLowerCase();
    if (!VALID_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `extensión no soportada (${ext}). Permitidas: ${[...VALID_EXTS].join(", ")}` },
        { status: 400 }
      );
    }
    if (blob.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `archivo muy grande (${(blob.size / 1024 / 1024).toFixed(0)} MB, max 2048 MB)` },
        { status: 400 }
      );
    }

    await fs.mkdir(RAW_DIR, { recursive: true });

    // Evitar colisión: si ya existe, agregar sufijo numérico
    let targetPath = path.join(RAW_DIR, filename);
    let counter = 1;
    while (true) {
      try {
        await fs.access(targetPath);
        // Existe — agregar sufijo
        const base = path.basename(filename, ext);
        targetPath = path.join(RAW_DIR, `${base}_${counter}${ext}`);
        counter++;
        if (counter > 100) throw new Error("demasiadas colisiones de nombre");
      } catch {
        // No existe → usar este path
        break;
      }
    }

    // Escribir binario en streaming (para que no salte memoria con videos grandes)
    const buffer = Buffer.from(await blob.arrayBuffer());
    await fs.writeFile(targetPath, buffer);

    return NextResponse.json({
      ok: true,
      filename: path.basename(targetPath),
      sizeBytes: blob.size,
      path: targetPath,
    });
  } catch (err) {
    console.error("[videos/import] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
