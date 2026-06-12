/**
 * POST /api/long_form/import-path — importa un video YA presente en el disco del usuario
 * (ej. C:\Users\...\Downloads\clase.mp4) sin subirlo por HTTP.
 *
 * Por qué: la app corre localmente y los videos largos pueden pesar GIGAS (un curso de
 * 80 min en HEVC puede ser ~10 GB). Subir eso por multipart/`req.formData()` es inviable
 * (se buffea en memoria y se trunca). Como el archivo ya está en la misma máquina, lo
 * importamos por filesystem: validamos con ffprobe y lo enganchamos en LF_RAW con un
 * hardlink (instantáneo, sin duplicar bytes si está en el mismo volumen) o, si no se
 * puede, con una copia.
 *
 * Body JSON: { path: "C:\\...\\video.mp4" }
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LF_RAW } from "@/lib/paths";
import { validateVideo, UploadError } from "@/lib/save-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 min — el fallback de copia de un archivo de GIGAS tarda

const VALID_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: string };
    const srcRaw = (body.path ?? "").trim().replace(/^["']|["']$/g, ""); // sacar comillas pegadas
    if (!srcRaw) {
      return NextResponse.json({ error: "Pega la ruta del archivo en tu compu." }, { status: 400 });
    }

    // El archivo tiene que existir y ser un archivo (no carpeta).
    let stat;
    try {
      stat = await fs.stat(srcRaw);
    } catch {
      // Solo el nombre del archivo en el mensaje (sin rutas C:\ visibles).
      return NextResponse.json(
        { error: `No encontré el archivo «${path.basename(srcRaw)}» en esa ruta. Revisa la ruta (clic derecho → Copiar como ruta de acceso).` },
        { status: 404 }
      );
    }
    if (!stat.isFile()) {
      return NextResponse.json({ error: "La ruta no es un archivo." }, { status: 400 });
    }

    const ext = path.extname(srcRaw).toLowerCase();
    if (!VALID_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `extensión no soportada (${ext}). Permitidas: ${[...VALID_EXTS].join(", ")}` },
        { status: 400 }
      );
    }

    // Validar el ORIGINAL con ffprobe antes de copiar (no copiar 10 GB de basura).
    await validateVideo(srcRaw);

    await fs.mkdir(LF_RAW, { recursive: true });

    // Nombre destino sin colisión.
    const baseName = path.basename(srcRaw).replace(/[^a-zA-Z0-9._\- ]/g, "_");
    let destPath = path.join(LF_RAW, baseName);
    let counter = 1;
    while (
      await fs.access(destPath).then(() => true).catch(() => false)
    ) {
      const b = path.basename(baseName, ext);
      destPath = path.join(LF_RAW, `${b}_${counter}${ext}`);
      counter++;
      if (counter > 200) throw new Error("demasiadas colisiones de nombre");
    }

    // Hardlink (instantáneo, mismo volumen). Si falla (otro disco, EXDEV), copiar.
    let method = "hardlink";
    try {
      await fs.link(srcRaw, destPath);
    } catch {
      method = "copia";
      await fs.copyFile(srcRaw, destPath);
    }

    return NextResponse.json({
      ok: true,
      filename: path.basename(destPath),
      sizeBytes: stat.size,
      path: destPath,
      method,
    });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[long_form/import-path] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
