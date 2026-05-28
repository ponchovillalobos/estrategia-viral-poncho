import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { RAW_DIR, LF_CLIPS, LF_RENDERS, FFMPEG_EXE, DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const THUMB_DIR = path.join(DATA_ROOT, "assets", "thumbnails");

/**
 * Devuelve el archivo de video que coincide con `id` en `dir`.
 * Modo "exact": basename === id (default, usado para shorts).
 * Modo "prefix": archivo empieza con `id_` — soporta long-form renders con sufijo styleId
 *   (ej: `D13_..._diferenciadornegocios_supreme.mp4` para id `D13_..._diferenciadornegocios`).
 */
async function findVideoFile(
  dir: string,
  id: string,
  mode: "exact" | "prefix" = "exact"
): Promise<string | null> {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  if (mode === "prefix") {
    // Preferí exact match primero, después prefix con underscore
    const exact = files.find((f) => path.basename(f, path.extname(f)) === id);
    if (exact) return path.join(dir, exact);
    const pref = files.find((f) => {
      const base = path.basename(f, path.extname(f));
      return base === id || base.startsWith(id + "_");
    });
    return pref ? path.join(dir, pref) : null;
  }
  const match = files.find((f) => path.basename(f, path.extname(f)) === id);
  return match ? path.join(dir, match) : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await fs.mkdir(THUMB_DIR, { recursive: true });
  const thumbPath = path.join(THUMB_DIR, `${id}.jpg`);

  // Si ya hay cache, devolvela
  try {
    await fs.access(thumbPath);
    const buf = await fs.readFile(thumbPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    // no cacheada, generala
  }

  // Buscar el video fuente en orden: short raw → long_form clip → long_form render (último recurso).
  // Para long-form, los "clips" son los videos individuales (uno por proyecto), generados desde el video clean.
  const source = req.nextUrl.searchParams.get("source"); // opcional: "short" | "long_form"
  const tryShort = !source || source === "short";
  const tryLongForm = !source || source === "long_form";

  let videoPath: string | null = null;
  if (tryShort) {
    videoPath = await findVideoFile(RAW_DIR, id, "exact");
  }
  if (!videoPath && tryLongForm) {
    videoPath = await findVideoFile(LF_CLIPS, id, "exact");
  }
  if (!videoPath && tryLongForm) {
    // Last resort: extraer thumbnail del render (con sufijo _styleId)
    videoPath = await findVideoFile(LF_RENDERS, id, "prefix");
  }

  if (!videoPath) {
    return NextResponse.json({ error: "video not found", id }, { status: 404 });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_EXE, [
        "-y",
        "-ss", "00:00:01",
        "-i", videoPath,
        "-frames:v", "1",
        "-q:v", "4",
        "-vf", "scale=-1:480",
        thumbPath,
      ]);
      // Sin timeout, un ffmpeg colgado deja el request pendiente para siempre. 30s sobra
      // para extraer 1 frame.
      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        reject(new Error("ffmpeg timeout"));
      }, 30_000);
      proc.on("error", (e) => { clearTimeout(timer); reject(e); });
      proc.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error("ffmpeg failed"));
      });
    });

    const buf = await fs.readFile(thumbPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), id },
      { status: 500 }
    );
  }
}
