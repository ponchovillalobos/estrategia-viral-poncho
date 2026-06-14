/**
 * Auto B-roll CC0 / Dominio Público — SIN API key.
 *
 * Fuente alterna a Pexels para cuando NO hay PEXELS_API_KEY (o como fuente
 * adicional). Cumple la regla del dueño: cero registros, cero login, cero keys.
 * Solo material CC0 / dominio público de descarga directa.
 *
 * Fuentes:
 *   1. Internet Archive (VIDEO): advancedsearch.php (JSON, sin key). Filtramos
 *      mediatype:movies + licenseurl con *publicdomain* / cc0. La búsqueda de IA
 *      es difusa y a veces cuela licencias NC/ND, así que RE-FILTRAMOS cada doc
 *      por su `licenseurl` antes de aceptarlo. El mp4 sale de la metadata API.
 *   2. Openverse (FOTO, fallback): api.openverse.org/v1/images con
 *      license=cc0,pdm. Sin key, pero el anónimo tiene ~200 req/DÍA → cacheamos
 *      AGRESIVO en disco (DATA_ROOT/assets/broll/.cc0-cache) con TTL largo.
 *
 * Devuelve el MISMO shape que pexels.ts (`BrollClip`: start/end/url/thumbnail),
 * así que entra directo en `project.bRoll` sin tocar el render. Las URLs de IA
 * (mp4) y Openverse (jpg) se sirven remotas igual que Pexels (OffthreadVideo /
 * Img siguen redirects 302 de la CDN de archive.org).
 *
 * Server-only (lee/escribe DATA_ROOT). Si la red falla devuelve [] → sin b-roll,
 * nunca rompe el flujo.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { BROLL_DIR } from "@/lib/paths";

// Reutilizamos el contrato de pexels.ts para que sea intercambiable 1:1.
import type { BrollClip } from "@/lib/pexels";
export type { BrollClip };

interface Keyword {
  word: string;
  start: number;
  end: number;
}

const CACHE_DIR = path.join(BROLL_DIR, ".cc0-cache");
// Openverse: límite ~200/día anónimo → cacheamos 30 días.
const OPENVERSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Internet Archive: sin límite duro, pero cacheamos 7 días para no repegar.
const IA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const IA_SEARCH = "https://archive.org/advancedsearch.php";
const IA_METADATA = "https://archive.org/metadata";
const OPENVERSE_IMAGES = "https://api.openverse.org/v1/images/";

const VIDEO_EXTS = [".mp4", ".webm", ".ogv", ".mov", ".m4v"];
// Preferimos mp4 "ligeros" derivados por IA (p.ej. *_512kb.mp4) → arrancan rápido.
const PREFERRED_MP4_HINT = "512kb.mp4";

// ---------------------------------------------------------------------------
// Caché en disco (JSON). Clave = hash(fuente + query).
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  ts: number;
  data: T;
}

function cacheKey(source: string, query: string): string {
  const h = crypto.createHash("sha1").update(`${source}::${query}`).digest("hex").slice(0, 16);
  // query slug legible para depurar a ojo dentro de la carpeta.
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${source}_${slug}_${h}.json`;
}

async function readCache<T>(file: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, file), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(file: string, data: T): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const entry: CacheEntry<T> = { ts: Date.now(), data };
    await fs.writeFile(path.join(CACHE_DIR, file), JSON.stringify(entry), "utf8");
  } catch {
    // cache best-effort: si no se puede escribir, seguimos sin cachear.
  }
}

// ---------------------------------------------------------------------------
// Utilidades de licencia.
// ---------------------------------------------------------------------------

/** True solo si la URL de licencia es CC0 o dominio público (no NC/ND/BY-SA). */
function isPublicDomainOrCC0(licenseurl: string | undefined): boolean {
  if (!licenseurl) return false;
  const u = licenseurl.toLowerCase();
  // Aceptamos: publicdomain/zero (CC0), publicdomain/mark (PDM),
  // licenses/publicdomain (forma vieja de IA). Rechazamos by/nc/nd/sa.
  return u.includes("publicdomain") || u.includes("/zero/");
}

function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" }).finally(() =>
    clearTimeout(t)
  );
}

// ---------------------------------------------------------------------------
// Internet Archive — VIDEO CC0 / dominio público.
// ---------------------------------------------------------------------------

interface IADoc {
  identifier: string;
  title?: string;
  licenseurl?: string;
}

/**
 * Busca en IA items de video con licencia PD/CC0 para `keyword`.
 * Scope de licencia en la query + RE-FILTRO por doc (IA cuela NC/ND a veces).
 * Devuelve identifiers candidatos (no resuelve el mp4 todavía).
 */
async function searchIAIdentifiers(keyword: string, rows = 8): Promise<IADoc[]> {
  const cf = cacheKey("ia-search", keyword);
  const cached = await readCache<IADoc[]>(cf, IA_TTL_MS);
  if (cached) return cached;

  // q: keyword AND mediatype:movies AND (licenseurl:*publicdomain* OR *zero*)
  const q =
    `${keyword} AND mediatype:movies AND ` +
    `(licenseurl:*publicdomain* OR licenseurl:*zero*)`;
  const params = new URLSearchParams();
  params.set("q", q);
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "licenseurl");
  params.set("rows", String(rows));
  params.set("output", "json");

  let docs: IADoc[] = [];
  try {
    const res = await fetchWithTimeout(`${IA_SEARCH}?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { response?: { docs?: IADoc[] } };
      docs = (data.response?.docs ?? []).filter((d) =>
        isPublicDomainOrCC0(d.licenseurl)
      );
    }
  } catch {
    docs = [];
  }
  await writeCache(cf, docs);
  return docs;
}

/** Resuelve un mp4 (u otro video) descargable directo de un item de IA. */
async function resolveIAVideoUrl(identifier: string): Promise<string | null> {
  const cf = cacheKey("ia-meta", identifier);
  const cached = await readCache<string | null>(cf, IA_TTL_MS);
  if (cached !== null) return cached || null;

  let url: string | null = null;
  try {
    const res = await fetchWithTimeout(`${IA_METADATA}/${encodeURIComponent(identifier)}`);
    if (res.ok) {
      const data = (await res.json()) as { files?: Array<{ name?: string }> };
      const files = (data.files ?? [])
        .map((f) => f.name ?? "")
        .filter((n) => VIDEO_EXTS.some((ext) => n.toLowerCase().endsWith(ext)));
      // Preferimos el mp4 ligero; si no, cualquier mp4; si no, el primer video.
      const pick =
        files.find((n) => n.toLowerCase().endsWith(PREFERRED_MP4_HINT)) ??
        files.find((n) => n.toLowerCase().endsWith(".mp4")) ??
        files[0];
      if (pick) {
        url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pick)}`;
      }
    }
  } catch {
    url = null;
  }
  // Cacheamos también el "no encontrado" (string vacío) para no repegar.
  await writeCache(cf, url ?? "");
  return url;
}

/** Devuelve la primera URL de video CC0/PD de IA para una keyword, o null. */
export async function iaVideoForKeyword(keyword: string): Promise<string | null> {
  const docs = await searchIAIdentifiers(keyword);
  for (const d of docs) {
    const url = await resolveIAVideoUrl(d.identifier);
    if (url) return url;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Openverse — FOTO CC0 / PDM (fallback). Caché AGRESIVO por límite diario.
// ---------------------------------------------------------------------------

interface OpenverseResult {
  url?: string;
  thumbnail?: string;
  license?: string;
}

/** Devuelve la primera URL de foto CC0/PDM de Openverse para una keyword, o null. */
export async function openversePhotoForKeyword(
  keyword: string
): Promise<{ url: string; thumbnail?: string } | null> {
  const cf = cacheKey("openverse", keyword);
  const cached = await readCache<OpenverseResult[]>(cf, OPENVERSE_TTL_MS);

  let results: OpenverseResult[];
  if (cached) {
    results = cached;
  } else {
    const params = new URLSearchParams();
    params.set("q", keyword);
    params.set("license", "cc0,pdm");
    params.set("page_size", "5");
    try {
      const res = await fetchWithTimeout(`${OPENVERSE_IMAGES}?${params.toString()}`);
      if (!res.ok) {
        // 429 (rate limit diario) u otro error → cacheamos vacío para frenar.
        await writeCache(cf, []);
        return null;
      }
      const data = (await res.json()) as { results?: OpenverseResult[] };
      results = (data.results ?? []).map((r) => ({
        url: r.url,
        thumbnail: r.thumbnail,
        license: r.license,
      }));
    } catch {
      results = [];
    }
    // Cacheamos SIEMPRE (incluso vacío) — límite diario manda.
    await writeCache(cf, results);
  }

  const hit = results.find((r) => r.url);
  return hit?.url ? { url: hit.url, thumbnail: hit.thumbnail } : null;
}

// ---------------------------------------------------------------------------
// Selección de keywords (espejo de pexels.ts para repartir a lo largo del video).
// ---------------------------------------------------------------------------

const ES_STOPWORDS = new Set([
  "que", "como", "para", "pero", "esto", "esta", "este", "estos", "estas", "los", "las",
  "una", "unos", "unas", "con", "por", "sin", "del", "sus", "mas", "muy", "ya", "les",
  "nos", "sea", "son", "fue", "han", "hay", "eso", "esa", "ese", "esos", "esas", "tu",
  "mi", "te", "se", "de", "la", "el", "en", "lo", "le", "su", "al", "un", "si", "no",
  "me", "ti", "entonces", "porque", "cuando", "tambien", "todo", "todos", "toda", "todas",
  "cada", "ser", "estar", "tiene", "tienen", "hacer", "puede", "pueden", "vamos", "aqui",
  "asi", "ahora", "bien", "solo", "cosa", "cosas", "hace", "dice", "decir", "gente",
]);

function cleanWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/gi, "")
    .trim();
}

function selectVisualKeywords(keywords: Keyword[], count: number): Keyword[] {
  const seen = new Set<string>();
  const candidates = keywords.filter((k) => {
    const norm = cleanWord(k.word);
    if (norm.length < 4) return false;
    if (ES_STOPWORDS.has(norm)) return false;
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
  if (candidates.length <= count) return candidates;
  const step = candidates.length / count;
  const picks: Keyword[] = [];
  for (let i = 0; i < count; i++) picks.push(candidates[Math.floor(i * step)]);
  return picks;
}

function dedupeOverlaps(clips: BrollClip[]): BrollClip[] {
  const out: BrollClip[] = [];
  let lastEnd = -1;
  for (const c of clips) {
    let start = c.start;
    if (start < lastEnd) start = lastEnd;
    const end = Math.max(start + 0.5, c.end);
    if (start >= end) continue;
    out.push({ ...c, start: +start.toFixed(2), end: +end.toFixed(2) });
    lastEnd = end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entrada principal — misma firma que autoMatchBroll de pexels.ts.
// ---------------------------------------------------------------------------

/**
 * Igual que `autoMatchBroll` (pexels.ts) pero con fuentes CC0 sin key.
 * Por keyword: intenta VIDEO de Internet Archive; si no hay, cae a FOTO de
 * Openverse. Devuelve clips temporizados listos para `project.bRoll`.
 *
 * Nota: las FOTOS de Openverse entran como `url` jpg. El render usa OffthreadVideo
 * para b-roll; una imagen estática en ese src no anima pero tampoco rompe. El
 * orden de preferencia (video primero) hace que la mayoría sean clips reales.
 */
export async function autoMatchBrollCC0(
  keywords: Keyword[],
  duration: number,
  opts: { count?: number; clipDur?: number } = {}
): Promise<BrollClip[]> {
  const count = opts.count ?? 5;
  const clipDur = opts.clipDur ?? 3;
  const picks = selectVisualKeywords(keywords, count);

  const clips: BrollClip[] = [];
  for (const kw of picks) {
    const q = cleanWord(kw.word);
    if (!q) continue;
    try {
      // 1) VIDEO CC0/PD de Internet Archive.
      let url = await iaVideoForKeyword(q);
      let thumbnail: string | undefined;
      // 2) Fallback FOTO CC0/PDM de Openverse.
      if (!url) {
        const photo = await openversePhotoForKeyword(q);
        if (photo) {
          url = photo.url;
          thumbnail = photo.thumbnail;
        }
      }
      if (!url) continue;
      clips.push({
        start: +kw.start.toFixed(2),
        end: +Math.min(kw.start + clipDur, duration).toFixed(2),
        url,
        thumbnail,
      });
    } catch {
      // saltear esta keyword
    }
  }
  clips.sort((a, b) => a.start - b.start);
  return dedupeOverlaps(clips);
}
