/**
 * Auto B-roll desde Pexels en función de la transcripción.
 *
 * Elige keywords "visuales" del transcript (filtra stopwords/cortas), las busca en
 * Pexels Videos y devuelve clips temporizados listos para `project.bRoll`. Lo usa
 * auto-build para los estilos `broll_full` (fullscreen) y `broll_pip` (pequeñito).
 *
 * Server-only (usa PEXELS_API_KEY). Si no hay key o falla la red, devuelve [] →
 * el render sale sin b-roll (no rompe nada).
 */

const PEXELS_API = "https://api.pexels.com";

export interface BrollClip {
  start: number;
  end: number;
  url: string;
  thumbnail?: string;
}

interface Keyword {
  word: string;
  start: number;
  end: number;
}

interface PexelsVideoFile {
  link?: string;
  file_type?: string;
  width?: number;
  height?: number;
  quality?: string;
}

// Stopwords ES frecuentes — no sirven como búsqueda visual.
const ES_STOPWORDS = new Set([
  "que", "como", "para", "pero", "esto", "esta", "este", "estos", "estas", "los", "las",
  "una", "unos", "unas", "con", "por", "sin", "del", "sus", "mas", "muy", "ya", "les",
  "nos", "sea", "son", "fue", "han", "hay", "eso", "esa", "ese", "esos", "esas", "tu",
  "mi", "te", "se", "de", "la", "el", "en", "lo", "le", "su", "al", "un", "si", "no",
  "me", "ti", "entonces", "porque", "cuando", "tambien", "todo", "todos", "toda", "todas",
  "cada", "ser", "estar", "tiene", "tienen", "hacer", "puede", "pueden", "vamos", "aqui",
  "asi", "ahora", "bien", "solo", "cosa", "cosas", "hace", "dice", "decir", "gente",
]);

/** Quita acentos/puntuación y baja a minúsculas. */
function cleanWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/gi, "")
    .trim();
}

/** Elige `count` keywords visuales repartidas a lo largo del video. */
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

/** Elige un mp4 razonable (portrait, altura <= 1920) del set de Pexels. */
function pickVideoFile(files: PexelsVideoFile[] | undefined): PexelsVideoFile | null {
  if (!Array.isArray(files)) return null;
  const mp4 = files.filter((f) => f.file_type === "video/mp4" && f.link);
  if (mp4.length === 0) return null;
  const sorted = mp4.slice().sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return sorted.find((f) => (f.height ?? 0) <= 1920) ?? sorted[sorted.length - 1];
}

/** Evita que los clips se pisen: empuja el inicio tras el final del anterior. */
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

/**
 * Busca clips de Pexels para las keywords del transcript y los devuelve temporizados.
 * `count` clips, cada uno de `clipDur` segundos arrancando en el timestamp de su keyword.
 */
export async function autoMatchBroll(
  keywords: Keyword[],
  duration: number,
  opts: { count?: number; clipDur?: number; orientation?: "portrait" | "landscape" } = {}
): Promise<BrollClip[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.warn("[pexels] sin PEXELS_API_KEY → auto b-roll vacío");
    return [];
  }
  const count = opts.count ?? 5;
  const clipDur = opts.clipDur ?? 3;
  const orientation = opts.orientation ?? "portrait";
  const picks = selectVisualKeywords(keywords, count);

  const clips: BrollClip[] = [];
  for (const kw of picks) {
    const q = cleanWord(kw.word);
    if (!q) continue;
    try {
      const res = await fetch(
        `${PEXELS_API}/videos/search?query=${encodeURIComponent(q)}&per_page=3&orientation=${orientation}`,
        { headers: { Authorization: key } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { videos?: Array<{ video_files?: PexelsVideoFile[]; image?: string }> };
      const video = data.videos?.[0];
      if (!video) continue;
      const file = pickVideoFile(video.video_files);
      if (!file?.link) continue;
      clips.push({
        start: +kw.start.toFixed(2),
        end: +Math.min(kw.start + clipDur, duration).toFixed(2),
        url: file.link,
        thumbnail: video.image,
      });
    } catch {
      // saltear esta keyword
    }
  }
  clips.sort((a, b) => a.start - b.start);
  return dedupeOverlaps(clips);
}
