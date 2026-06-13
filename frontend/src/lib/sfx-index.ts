/**
 * Índice CACHEADO de SFX en memoria.
 *
 * PROBLEMA QUE RESUELVE (BUG P0 "los SFX no suenan"):
 *  - La librería real de SFX tiene ~4.8k audios ANIDADOS bajo subcarpetas
 *    (assets/sfx/github/*, assets/sfx/source/<pack>/..., curated/...). Resolver el
 *    stream SOLO en carpetas planas por basename devolvía 404 para casi todo.
 *  - list y stream escaneaban RECURSIVO ~4992 archivos EN CADA REQUEST (incluido un
 *    `.git` con miles de objetos y basura macOS `._*`) → los endpoints se colgaban
 *    40-90s.
 *
 * SOLUCIÓN: escanear assets/sfx UNA vez, construir un índice
 *   { rutaRelativaÚnica (POSIX) -> rutaAbsoluta }
 * y cachearlo con TTL. list y stream usan el índice (no re-escanean por request).
 *
 * RESOLUCIÓN POR RUTA RELATIVA, no por basename: hay colisiones de nombre entre
 * packs (p.ej. `metal_01.ogg` en varios packs de `source/`). La clave del índice
 * es la ruta relativa (POSIX, sin la carpeta raíz de sfx) para que list↔stream sean
 * consistentes. Igual mantenemos un mapa de basename->primeraRuta como FALLBACK,
 * porque el pipeline de render/los templates referencian SFX por basename plano
 * (ej. SFX_POOL = ["swoosh.wav", "pop.ogg", ...]).
 *
 * EXCLUSIONES: directorios ocultos / `.git` (artefacto de la PC de dev), archivos
 * `._*` (resource forks de macOS) y todo lo que no sea audio.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SFX_DIR } from "@/lib/paths";

/** Raíz real de la librería: .../assets/sfx (SFX_DIR apunta a .../sfx/curated). */
export const SFX_BASE = path.dirname(SFX_DIR);

const AUDIO_RE = /\.(mp3|wav|m4a|ogg)$/i;
const TTL_MS = 60_000;

export interface SfxIndexEntry {
  /** Ruta relativa a SFX_BASE, en formato POSIX (con "/"). Clave única y estable. */
  relPath: string;
  /** Ruta absoluta en disco. */
  absPath: string;
  /** Nombre de archivo (basename). */
  filename: string;
  /** Bytes (de Dirent no disponible; se llena lazy sólo si hace falta). */
  sizeBytes?: number;
}

interface SfxIndex {
  /** relPath (POSIX) -> entry */
  byRel: Map<string, SfxIndexEntry>;
  /** basename -> primer entry con ese basename (FALLBACK para refs por basename) */
  byBasename: Map<string, SfxIndexEntry>;
  /** total de audios indexados */
  count: number;
  builtAt: number;
}

let cached: SfxIndex | null = null;
let building: Promise<SfxIndex> | null = null;

/** ¿Es un directorio que hay que saltarse al escanear? (.git, ocultos) */
function isSkippableDir(name: string): boolean {
  return name === ".git" || name.startsWith(".");
}

/** ¿Es un archivo basura que NO debe entrar al índice? (junk macOS) */
function isJunkFile(name: string): boolean {
  return name.startsWith("._") || name === ".DS_Store";
}

/**
 * Escanea SFX_BASE recursivamente con un walk MANUAL (no `recursive:true`), para
 * poder PODAR directorios `.git`/ocultos enteros — sin esa poda, recorrer los miles
 * de objetos del `.git` es justo lo que colgaba el endpoint. Devuelve el índice.
 */
async function buildIndex(): Promise<SfxIndex> {
  const byRel = new Map<string, SfxIndexEntry>();
  const byBasename = new Map<string, SfxIndexEntry>();

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // carpeta inexistente o sin permisos: ignorar
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (isSkippableDir(e.name)) continue; // poda .git / ocultos
        await walk(path.join(dir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      if (isJunkFile(e.name)) continue; // ._* / .DS_Store
      if (!AUDIO_RE.test(e.name)) continue; // sólo audio

      const absPath = path.join(dir, e.name);
      const relPath = path.relative(SFX_BASE, absPath).split(path.sep).join("/");
      const entry: SfxIndexEntry = { relPath, absPath, filename: e.name };
      byRel.set(relPath, entry);
      // El primer pack que aporte un basename gana el fallback (orden de readdir).
      if (!byBasename.has(e.name)) byBasename.set(e.name, entry);
    }
  }

  await walk(SFX_BASE);

  return { byRel, byBasename, count: byRel.size, builtAt: Date.now() };
}

/**
 * Devuelve el índice cacheado, reconstruyéndolo si venció el TTL. Coalesce de
 * builds concurrentes: si dos requests llegan con el cache frío, se construye 1 sola
 * vez y ambos esperan la misma promesa.
 */
export async function getSfxIndex(): Promise<SfxIndex> {
  const now = Date.now();
  if (cached && now - cached.builtAt < TTL_MS) return cached;
  if (building) return building;
  building = buildIndex()
    .then((idx) => {
      cached = idx;
      return idx;
    })
    .finally(() => {
      building = null;
    });
  return building;
}

/** Invalida el cache (p.ej. tras descargar SFX nuevos). */
export function invalidateSfxIndex(): void {
  cached = null;
}

/**
 * Resuelve la ruta absoluta de un SFX a partir del `file` del query param.
 * Acepta:
 *   - Ruta relativa POSIX exacta (la que emite /api/sfx/list): match directo.
 *   - Basename plano (refs del pipeline de render / templates): fallback por nombre.
 *   - Tolera separador "\" y normaliza a "/" antes de buscar.
 * Devuelve null si no existe.
 */
export async function resolveSfx(file: string): Promise<string | null> {
  const idx = await getSfxIndex();
  const norm = file.split("\\").join("/").replace(/^\/+/, "");
  // 1) match exacto por ruta relativa única
  const direct = idx.byRel.get(norm);
  if (direct) return direct.absPath;
  // 2) si vino algo con carpetas pero no matcheó, probar por basename del final
  const base = norm.split("/").pop() ?? norm;
  const byName = idx.byBasename.get(base);
  if (byName) return byName.absPath;
  return null;
}
