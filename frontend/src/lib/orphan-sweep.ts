/**
 * Limpieza de huérfanos: cuando el usuario BORRA un video de la carpeta, sus
 * metadatos derivados (transcripts, clips, renders, proposals, projects, graphics…)
 * quedan colgados. Este módulo:
 *   1. `videoBackingExists()` — usado por los endpoints de listado para NO mostrar
 *      entradas cuyo video ya no existe (desaparición instantánea al borrar el raw).
 *   2. `sweepLongFormOrphans()` — borra del disco los derivados de largos cuyo raw
 *      ya no existe. Best-effort, conservador (no borra si no pudo leer LF_RAW).
 *   3. `maybeSweepOrphans()` — dispara el sweep a lo sumo ~2x/día (throttle 12h),
 *      llamado perezosamente desde los listados + una vez al boot.
 *
 * Diseño conservador: el auto-borrado solo toca LARGOS (naming limpio `{id}_cNN_…`).
 * Los shorts solo se FILTRAN del listado (no se auto-borran del disco) por seguridad.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  LF_RAW,
  LF_CLEAN,
  LF_CLIPS,
  LF_RENDERS,
  LF_ROOT,
  RAW_DIR,
  RENDERS_DIR,
} from "@/lib/paths";
import { LF_TRANSCRIPTS, LF_CUTS, LF_PROPOSALS, LF_PROJECTS_DIR } from "@/lib/paths-long-form";

const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm", ".m4v"];
const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h → ~2 barridos/día

const LF_GRAPHICS = path.join(LF_ROOT, "graphics");
const LF_FACE_TRACKS = path.join(LF_ROOT, "face_tracks");

async function listSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** Stems (nombre sin extensión) de los videos raw que existen en `dir`. */
async function rawStems(dir: string): Promise<Set<string>> {
  const files = await listSafe(dir);
  const stems = new Set<string>();
  for (const f of files) {
    if (VIDEO_EXTS.includes(path.extname(f).toLowerCase())) {
      stems.add(path.basename(f, path.extname(f)));
    }
  }
  return stems;
}

/** videoId dueño de un archivo derivado de largos a partir de su nombre. */
export function longFormOwner(filename: string): string {
  let stem = path.basename(filename, path.extname(filename));
  const clip = stem.match(/^(.+?)_c\d+/); // clips/renders/projects/graphics: {id}_cNN_…
  if (clip) return clip[1];
  if (stem.endsWith("_clean")) stem = stem.slice(0, -"_clean".length); // clean: {id}_clean
  return stem;
}

/**
 * ¿Existe el video de respaldo de un proyecto de producción? Se usa para filtrar
 * el listado: si NO existe ni el render producido ni el raw fuente, está huérfano.
 */
export async function buildBackingChecker(): Promise<
  (id: string, videoId: string | undefined, source: "short" | "long_form") => boolean
> {
  const [shortRaw, lfRaw, shortRenders, lfRenders, lfClips] = await Promise.all([
    rawStems(RAW_DIR),
    rawStems(LF_RAW),
    listSafe(RENDERS_DIR),
    listSafe(LF_RENDERS),
    listSafe(LF_CLIPS),
  ]);
  const shortRenderStems = new Set(shortRenders.map((f) => path.basename(f, path.extname(f))));
  const lfRenderStems = new Set(lfRenders.map((f) => path.basename(f, path.extname(f))));

  return (id, videoId, source) => {
    if (source === "long_form") {
      const owner = videoId || longFormOwner(id);
      if (lfRaw.has(owner)) return true; // raw fuente existe
      if (lfRenderStems.has(id)) return true; // render producido existe
      if (lfClips.some((c) => c === `${id}.mp4` || c.startsWith(`${owner}_c`))) return true;
      return false;
    }
    // shorts
    const owner = videoId || id;
    if (shortRaw.has(owner)) return true;
    if (shortRenderStems.has(id)) return true;
    return false;
  };
}

/**
 * Borra los derivados de LARGOS cuyo raw ya no existe. Conservador: si LF_RAW no
 * se pudo leer (set vacío), NO borra nada (evita nukear todo por un error de FS).
 */
export async function sweepLongFormOrphans(): Promise<{ deleted: number; orphans: string[] }> {
  const raw = await rawStems(LF_RAW);
  if (raw.size === 0) {
    // Sin raws (o error leyendo): no borrar. Podría ser FS temporalmente inaccesible.
    return { deleted: 0, orphans: [] };
  }
  const dirs = [
    LF_TRANSCRIPTS, LF_CUTS, LF_PROPOSALS, LF_CLIPS,
    LF_RENDERS, LF_CLEAN, LF_PROJECTS_DIR, LF_GRAPHICS, LF_FACE_TRACKS,
  ];
  const orphanIds = new Set<string>();
  let deleted = 0;
  for (const dir of dirs) {
    const files = await listSafe(dir);
    for (const f of files) {
      const owner = longFormOwner(f);
      if (!owner || raw.has(owner)) continue;
      orphanIds.add(owner);
      try {
        await fs.rm(path.join(dir, f), { force: true });
        deleted++;
      } catch {
        /* best-effort */
      }
    }
  }
  if (deleted > 0) {
    console.log(
      `[orphan-sweep] borrados ${deleted} derivados de ${orphanIds.size} video(s) eliminado(s): ${[...orphanIds].join(", ")}`,
    );
  }
  return { deleted, orphans: [...orphanIds] };
}

// Throttle en globalThis (sobrevive a hot-reload; se resetea al reiniciar el server,
// que de todas formas dispara un sweep de boot).
const g = globalThis as unknown as { __lastOrphanSweep?: number };

/** Dispara el sweep a lo sumo cada 12h, sin bloquear al caller. */
export function maybeSweepOrphans(): void {
  const now = Date.now();
  if (g.__lastOrphanSweep && now - g.__lastOrphanSweep < SWEEP_INTERVAL_MS) return;
  g.__lastOrphanSweep = now;
  // fire-and-forget: no bloqueamos la respuesta del listado
  void sweepLongFormOrphans().catch((e) =>
    console.warn(`[orphan-sweep] falló: ${e instanceof Error ? e.message : e}`),
  );
}
