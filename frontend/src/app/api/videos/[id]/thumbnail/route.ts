import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { RAW_DIR, LF_RAW, LF_CLIPS, LF_RENDERS, FFMPEG_EXE, FFPROBE_EXE, DATA_ROOT } from "@/lib/paths";

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

  // ?t=<segundos> opcional: frame en un instante exacto (ej. el inicio de un clip
  // propuesto en el wizard de largos). El cache key incluye t (redondeado) para no
  // pisar la miniatura default ni regenerar en cada hit.
  const tParam = req.nextUrl.searchParams.get("t");
  const tParsed = tParam != null ? parseFloat(tParam) : NaN;
  const tSec: number | null =
    Number.isFinite(tParsed) && tParsed >= 0 ? Math.round(tParsed) : null;
  const cacheKey = tSec != null ? `${id}_t${tSec}` : id;
  const thumbPath = path.join(THUMB_DIR, `${cacheKey}.jpg`);

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

  // NEGATIVE-CACHE: si este video ya falló (corrupto), no reintentar 8s de
  // ffprobe + 30s de ffmpeg en CADA carga de la galería — 404 instantáneo.
  // El marcador caduca a la hora (por si el archivo se reemplaza).
  const failedMark = path.join(THUMB_DIR, `${cacheKey}.failed`);
  try {
    const st = await fs.stat(failedMark);
    if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
      return NextResponse.json({ error: "thumbnail no disponible (video ilegible)", id }, { status: 404 });
    }
    await fs.rm(failedMark, { force: true });
  } catch {
    /* sin marcador: seguir normal */
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
    // Video LARGO crudo (el id del wizard de largos es el stem en LF_RAW). Antes no
    // se buscaba acá → la lista de largos no tenía miniaturas.
    videoPath = await findVideoFile(LF_RAW, id, "exact");
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

  // C4 — Auto-thumbnail mejorado: en vez del frame a 1s (suele ser logo/intro), tomar
  // ~35% de la duración (un frame representativo del contenido). Si ffprobe falla, 1s.
  // Con ?t= explícito se usa ese instante directo y se ahorra el ffprobe.
  const seekSec = tSec != null ? tSec : await new Promise<number>((resolve) => {
    const proc = spawn(FFPROBE_EXE, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    let out = "";
    let settled = false;
    const done = (v: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(v);
    };
    const t = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      done(1);
    }, 8_000);
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => done(1));
    proc.on("close", () => {
      const dur = parseFloat(out.trim());
      done(Number.isFinite(dur) && dur > 2 ? +(dur * 0.35).toFixed(2) : 1);
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_EXE, [
        "-y",
        "-ss", String(seekSec),
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
        if (code === 0) resolve();
        else reject(new Error("ffmpeg failed"));
      });
    });

    const buf = await fs.readFile(thumbPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    // Marcar el fallo para no re-pagar ffprobe+ffmpeg en cada render de la galería.
    await fs.writeFile(failedMark, String(err)).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), id },
      { status: 500 }
    );
  }
}
