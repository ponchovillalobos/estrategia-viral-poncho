/**
 * Índice UNIFICADO y CACHEADO de stickers (iconos SVG + ilustraciones Lottie).
 *
 * PROBLEMA QUE RESUELVE (Ola 1 — biblioteca FANTASMA): hay 6.605 iconos SVG
 * (Phosphor duotone + Tabler) y 609 ilustraciones Lottie (catálogo Noto) ya
 * descargados en disco, pero el usuario sólo "veía" un puñado curado. Esta
 * librería los destapa TODOS en un catálogo buscable.
 *
 * PATRÓN (igual que sfx-index.ts): escanear el disco UNA vez, construir el índice
 * y persistirlo en {DATA_ROOT}/cache/sticker-index.json. Los requests siguientes
 * leen el JSON cacheado — NO se re-escanean ~6.6k archivos por request.
 *
 * El índice se invalida si cambian los conteos en disco (se re-descargó un pack) o
 * si sube la versión del esquema (SCHEMA_VERSION) — así un cambio en el mapeo de
 * tags refresca el cache sin borrarlo a mano.
 *
 * LICENCIAS: Phosphor (MIT), Tabler (MIT), Noto emoji (Apache-2.0/CC-BY) — todo
 * gratis/offline, sin API keys.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

const ICONS_DIR = path.join(DATA_ROOT, "assets", "icons");
const PHOSPHOR_DIR = path.join(ICONS_DIR, "phosphor-duotone");
const TABLER_DIR = path.join(ICONS_DIR, "tabler");
// Packs de iconos NUEVOS (download_more_icons.py): Material Symbols (Apache-2.0) y
// Lucide (ISC). Viven en subcarpetas propias de assets/icons → se sirven por el
// mismo /api/icons/stream (que resuelve cualquier ruta bajo assets/icons).
const MATERIAL_DIR = path.join(ICONS_DIR, "material");
const LUCIDE_DIR = path.join(ICONS_DIR, "lucide");
const NOTO_DIR = path.join(DATA_ROOT, "assets", "lottie", "noto");
const NOTO_CATALOG_DIR = path.join(NOTO_DIR, "catalog");
const NOTO_INDEX = path.join(NOTO_DIR, "index.json");
// Ilustraciones de PERSONAS (download_illustrations.py): assets/illustrations/<set>/*.svg.
// Son MULTICOLOR (traen sus propios colores), a diferencia de los iconos currentColor.
const ILLUSTRATIONS_DIR = path.join(DATA_ROOT, "assets", "illustrations");
const CACHE_DIR = path.join(DATA_ROOT, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "sticker-index.json");

/** Subir esto fuerza la regeneración del cache aunque los conteos no cambien.
 *  v2: suma packs material/ + lucide/ y las ilustraciones multicolor. */
const SCHEMA_VERSION = 2;

export interface StickerEntry {
  /** Id estable que el render entiende: "ph:rocket" / "tb:rocket" / "noto:1f680" /
   *  "ms:rocket" (material) / "lu:rocket" (lucide) / "ill:open-peeps/peep_felix". */
  id: string;
  type: "icon" | "lottie" | "illustration";
  /** Nombre legible (en inglés del archivo; los tags llevan el español). */
  name: string;
  /** Categoría para los chips de filtro (en español). */
  category: string;
  /** Palabras de búsqueda (español + inglés) para Fuse.js. */
  tags: string[];
  /** URL para PREVISUALIZAR el sticker en la galería. */
  url: string;
  /** Las ilustraciones traen sus PROPIOS colores → NO se tiñen como los iconos
   *  currentColor; la galería/duotono usan esto para no aplicarles el acento. */
  multicolor?: boolean;
}

interface StickerIndexFile {
  schemaVersion: number;
  builtAt: number;
  counts: { icons: number; lottie: number; illustrations: number };
  stickers: StickerEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPA CURADO de tags en ESPAÑOL para los conceptos más buscados. La clave es un
// token que aparece en el nombre del archivo (en inglés); el valor son sinónimos
// en español que se agregan a los tags de búsqueda. No pretende ser exhaustivo —
// cubre lo que un creador de contenido busca a diario.
// ─────────────────────────────────────────────────────────────────────────────
const ES_TAGS: Record<string, string[]> = {
  money: ["dinero", "plata", "efectivo", "billete"],
  coin: ["moneda", "dinero", "plata"],
  coins: ["monedas", "dinero", "plata"],
  cash: ["efectivo", "dinero", "billete"],
  currency: ["dinero", "divisa", "plata"],
  dollar: ["dólar", "dinero", "plata"],
  wallet: ["billetera", "cartera", "dinero"],
  bank: ["banco", "dinero"],
  fire: ["fuego", "fueguito", "viral", "hot", "tendencia"],
  flame: ["fuego", "llama", "viral"],
  rocket: ["cohete", "lanzamiento", "despegue", "crecer"],
  heart: ["corazón", "amor", "me gusta", "like"],
  star: ["estrella", "favorito", "destacar"],
  bolt: ["rayo", "energía", "rápido", "poder"],
  zap: ["rayo", "energía", "rápido", "poder"],
  flash: ["rayo", "destello", "rápido"],
  brain: ["cerebro", "mente", "idea", "inteligencia"],
  bulb: ["idea", "foco", "bombilla", "tip"],
  lightbulb: ["idea", "foco", "bombilla", "tip"],
  idea: ["idea", "tip"],
  trophy: ["trofeo", "ganar", "premio", "campeón"],
  award: ["premio", "ganar", "reconocimiento"],
  medal: ["medalla", "premio", "ganar"],
  crown: ["corona", "rey", "líder", "premium"],
  gem: ["gema", "diamante", "valor", "joya"],
  diamond: ["diamante", "joya", "valor"],
  target: ["objetivo", "meta", "diana", "foco"],
  trending: ["tendencia", "subir", "viral", "crecer"],
  chart: ["gráfica", "estadística", "datos", "crecimiento"],
  graph: ["gráfica", "estadística", "datos"],
  growth: ["crecimiento", "subir", "ganancia"],
  eye: ["ojo", "ver", "atención", "mirar"],
  eyes: ["ojos", "ver", "atención", "mirar"],
  bell: ["campana", "notificación", "aviso", "alerta"],
  warning: ["advertencia", "cuidado", "alerta", "peligro"],
  alert: ["alerta", "aviso", "cuidado"],
  check: ["listo", "correcto", "ok", "verificado", "palomita"],
  star4: ["destello", "brillo", "estrella"],
  sparkle: ["destello", "brillo", "magia"],
  sparkles: ["destellos", "brillo", "magia"],
  clock: ["reloj", "tiempo", "hora"],
  time: ["tiempo", "reloj", "hora"],
  hourglass: ["reloj de arena", "tiempo", "espera"],
  calendar: ["calendario", "fecha", "agenda"],
  gift: ["regalo", "premio", "sorpresa"],
  music: ["música", "audio", "canción", "sonido"],
  camera: ["cámara", "foto", "grabar"],
  video: ["video", "grabar", "película"],
  film: ["película", "cine", "video"],
  phone: ["teléfono", "celular", "móvil"],
  mobile: ["celular", "móvil", "teléfono"],
  message: ["mensaje", "chat", "comentario"],
  chat: ["chat", "mensaje", "comentario"],
  speech: ["hablar", "mensaje", "burbuja", "voz"],
  like: ["me gusta", "like", "pulgar"],
  thumb: ["pulgar", "me gusta", "like"],
  thumbsup: ["me gusta", "like", "aprobar"],
  share: ["compartir", "enviar"],
  user: ["usuario", "persona", "perfil"],
  users: ["usuarios", "gente", "comunidad"],
  people: ["gente", "comunidad", "equipo"],
  handshake: ["acuerdo", "trato", "alianza", "saludo"],
  hand: ["mano", "saludo"],
  clap: ["aplauso", "felicidades"],
  muscle: ["músculo", "fuerza", "poder"],
  rocket2: ["cohete", "crecer"],
  world: ["mundo", "global", "planeta"],
  globe: ["mundo", "global", "planeta"],
  map: ["mapa", "ubicación", "lugar"],
  pin: ["pin", "ubicación", "lugar", "marcador"],
  location: ["ubicación", "lugar", "mapa"],
  lock: ["candado", "seguridad", "privado", "bloqueo"],
  key: ["llave", "acceso", "secreto"],
  shield: ["escudo", "protección", "seguridad"],
  cart: ["carrito", "compra", "tienda"],
  shop: ["tienda", "compra"],
  bag: ["bolsa", "compra"],
  tag: ["etiqueta", "precio", "oferta"],
  rocket3: ["cohete"],
  book: ["libro", "aprender", "leer"],
  books: ["libros", "aprender", "estudiar"],
  graduation: ["graduación", "estudiar", "aprender", "educación"],
  pencil: ["lápiz", "escribir", "editar"],
  edit: ["editar", "escribir"],
  search: ["buscar", "lupa", "investigar"],
  settings: ["ajustes", "configuración", "engranaje"],
  gear: ["engranaje", "ajustes", "configuración"],
  tools: ["herramientas", "arreglar"],
  wrench: ["llave", "herramienta", "arreglar"],
  robot: ["robot", "ia", "bot", "automatizar"],
  ai: ["ia", "inteligencia artificial", "robot"],
  party: ["fiesta", "celebrar", "confeti"],
  confetti: ["confeti", "fiesta", "celebrar"],
  boom: ["explosión", "boom", "impacto"],
  explosion: ["explosión", "boom"],
  hundred: ["cien", "100", "perfecto", "máximo"],
  megaphone: ["megáfono", "anuncio", "promoción"],
  mega: ["megáfono", "anuncio", "promoción"],
  sun: ["sol", "día", "brillo"],
  moon: ["luna", "noche"],
  cloud: ["nube", "clima"],
  coffee: ["café", "energía", "pausa"],
  rocket4: ["cohete"],
  flag: ["bandera", "meta", "país"],
  mail: ["correo", "email", "mensaje"],
  email: ["correo", "email", "mensaje"],
  link: ["enlace", "link", "url"],
  download: ["descargar", "bajar"],
  upload: ["subir", "cargar"],
  play: ["reproducir", "play", "video"],
  pause: ["pausa", "parar"],
  smile: ["sonrisa", "feliz", "cara"],
  laugh: ["risa", "reír", "jaja"],
  cry: ["llanto", "llorar", "triste"],
  angry: ["enojo", "enojado", "molesto"],
};

/** Categoría en español a partir de la categoría inglesa de Noto. */
const NOTO_CAT_ES: Record<string, string> = {
  "Smileys and emotions": "Emociones",
  "People": "Gente",
  "People and body": "Gente",
  "Animals and nature": "Animales y naturaleza",
  "Food and drink": "Comida y bebida",
  "Travel and places": "Viajes y lugares",
  "Activities and events": "Actividades",
  "Activities": "Actividades",
  "Objects": "Objetos",
  "Symbols": "Símbolos",
  "Flags": "Banderas",
};

/** Acumula tags en español según los tokens del nombre. */
function esTagsForName(rawName: string): string[] {
  const tokens = rawName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (const tok of tokens) {
    const es = ES_TAGS[tok];
    if (es) for (const t of es) out.add(t);
  }
  return [...out];
}

/** Categoría heurística para iconos SVG (Phosphor/Tabler) según palabras clave. */
function svgCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(money|coin|cash|dollar|wallet|bank|currency|credit|invoice|tax)/.test(n)) return "Dinero";
  if (/(chart|graph|trend|analytic|presentation|stats|growth)/.test(n)) return "Datos y gráficas";
  if (/(arrow|chevron|caret|direction|corner)/.test(n)) return "Flechas";
  if (/(heart|star|fire|flame|thumb|like|crown|trophy|award|medal|gem|diamond)/.test(n)) return "Reacciones";
  if (/(user|users|people|person|team|group|account|profile)/.test(n)) return "Gente";
  if (/(message|chat|comment|mail|email|bell|phone|call|share|send|notification)/.test(n)) return "Comunicación";
  if (/(camera|video|film|music|microphone|headphone|play|pause|movie|photo|image|picture)/.test(n)) return "Multimedia";
  if (/(cart|shop|store|bag|tag|gift|sale|discount|package|truck|delivery)/.test(n)) return "Compras";
  if (/(brain|bulb|idea|book|graduation|pencil|edit|rocket|target|flag|bookmark)/.test(n)) return "Ideas y metas";
  if (/(lock|key|shield|security|password|fingerprint|warning|alert|danger|check)/.test(n)) return "Seguridad";
  if (/(map|pin|location|globe|world|compass|navigation|route)/.test(n)) return "Lugares";
  if (/(settings|gear|tool|wrench|cog|filter|adjustment|slider)/.test(n)) return "Herramientas";
  if (/(calendar|clock|time|hourglass|alarm|date|watch)/.test(n)) return "Tiempo";
  if (/(cloud|sun|moon|weather|snow|rain|wind|temperature)/.test(n)) return "Clima";
  if (/(smile|laugh|cry|angry|emoji|face|mood)/.test(n)) return "Emociones";
  return "General";
}

async function listSvgs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith(".svg"));
  } catch {
    return [];
  }
}

async function countDir(dir: string, ext: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

/** Lista las ilustraciones SVG en assets/illustrations/<set>/*.svg (un nivel de
 *  subcarpeta por set). Devuelve {rel:"<set>/<file>", set, file}. */
async function listIllustrations(
  root: string
): Promise<{ rel: string; set: string; file: string }[]> {
  let sets: string[] = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    sets = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const out: { rel: string; set: string; file: string }[] = [];
  for (const set of sets) {
    const svgs = await listSvgs(path.join(root, set));
    for (const file of svgs) out.push({ rel: `${set}/${file}`, set, file });
  }
  return out;
}

/** Construye el índice escaneando el disco. Costoso → sólo se llama si el cache está frío. */
async function buildIndex(): Promise<StickerIndexFile> {
  const stickers: StickerEntry[] = [];

  // 1) Phosphor duotone (MIT). Archivo: "<nombre>-duotone.svg" → id "ph:<nombre>".
  const phosphor = await listSvgs(PHOSPHOR_DIR);
  for (const file of phosphor) {
    const base = file.replace(/-duotone\.svg$/, "").replace(/\.svg$/, "");
    const human = base.replace(/-/g, " ");
    stickers.push({
      id: `ph:${base}`,
      type: "icon",
      name: human,
      category: svgCategory(base),
      tags: [...base.split("-"), ...esTagsForName(base), "phosphor"],
      url: `/api/icons/stream?file=phosphor-duotone/${encodeURIComponent(file)}`,
    });
  }

  // 2) Tabler outline (MIT). Archivo: "<nombre>.svg" → id "tb:<nombre>".
  const tabler = await listSvgs(TABLER_DIR);
  for (const file of tabler) {
    const base = file.replace(/\.svg$/, "");
    const human = base.replace(/-/g, " ");
    stickers.push({
      id: `tb:${base}`,
      type: "icon",
      name: human,
      category: svgCategory(base),
      tags: [...base.split("-"), ...esTagsForName(base), "tabler"],
      url: `/api/icons/stream?file=tabler/${encodeURIComponent(file)}`,
    });
  }

  // 2b) Material Symbols (Apache-2.0). Archivo: "<nombre>.svg" → id "ms:<nombre>".
  //     currentColor → se pinta con el acento del tema (igual que phosphor/tabler).
  const material = await listSvgs(MATERIAL_DIR);
  for (const file of material) {
    const base = file.replace(/\.svg$/, "");
    const human = base.replace(/_/g, " ").replace(/-/g, " ");
    stickers.push({
      id: `ms:${base}`,
      type: "icon",
      name: human,
      category: svgCategory(base),
      tags: [...base.split(/[-_]/), ...esTagsForName(base), "material"],
      url: `/api/icons/stream?file=material/${encodeURIComponent(file)}`,
    });
  }

  // 2c) Lucide (ISC). Archivo: "<nombre>.svg" → id "lu:<nombre>".
  const lucide = await listSvgs(LUCIDE_DIR);
  for (const file of lucide) {
    const base = file.replace(/\.svg$/, "");
    const human = base.replace(/-/g, " ");
    stickers.push({
      id: `lu:${base}`,
      type: "icon",
      name: human,
      category: svgCategory(base),
      tags: [...base.split("-"), ...esTagsForName(base), "lucide"],
      url: `/api/icons/stream?file=lucide/${encodeURIComponent(file)}`,
    });
  }

  // 3) Ilustraciones Lottie del catálogo Noto (Apache-2.0). El manifest index.json
  //    aporta tags y categorías ricas por codepoint. id "noto:<code>".
  let notoMeta: { code: string; tags?: string[]; categories?: string[]; popularity?: number }[] = [];
  try {
    notoMeta = JSON.parse(await fs.readFile(NOTO_INDEX, "utf-8"));
  } catch {
    notoMeta = [];
  }
  const metaByCode = new Map(notoMeta.map((m) => [m.code, m]));
  const catalogFiles = await (async () => {
    try {
      return (await fs.readdir(NOTO_CATALOG_DIR)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
  })();
  // Ordenar por popularidad descendente (lo más buscado primero) — el manifest la trae.
  const ordered = catalogFiles
    .map((f) => ({ file: f, code: f.replace(/\.json$/, "") }))
    .sort((a, b) => (metaByCode.get(b.code)?.popularity ?? 0) - (metaByCode.get(a.code)?.popularity ?? 0));
  for (const { file, code } of ordered) {
    const meta = metaByCode.get(code);
    // tags de Noto vienen como ":nombre-cosa:" → limpiar a "nombre cosa".
    const cleanTags = (meta?.tags ?? []).map((t) => t.replace(/:/g, "").replace(/-/g, " ").trim()).filter(Boolean);
    const name = cleanTags[0] || code;
    const cat = meta?.categories?.[0] ?? "";
    const esTags = cleanTags.flatMap((t) => esTagsForName(t));
    stickers.push({
      id: `noto:${code}`,
      type: "lottie",
      name,
      category: NOTO_CAT_ES[cat] ?? (cat || "Ilustraciones"),
      tags: [...new Set([...cleanTags, ...esTags, "animado", "lottie"])],
      // El render y el preview consumen el mismo stream; el catálogo vive en catalog/.
      url: `/api/lottie/stream?file=catalog/${encodeURIComponent(file)}`,
    });
  }

  // 4) Ilustraciones de PERSONAS (open-doodles + open-peeps), MULTICOLOR. Viven en
  //    assets/illustrations/<set>/*.svg. id "ill:<set>/<archivo-sin-ext>". Se sirven
  //    por /api/illustrations/stream?file=<set>/<archivo> (mismo patrón que icons).
  const illustrations = await listIllustrations(ILLUSTRATIONS_DIR);
  for (const { rel, set, file } of illustrations) {
    const base = file.replace(/\.svg$/, "");
    const human = base.replace(/^peep[_-]/, "").replace(/[-_]/g, " ").trim();
    stickers.push({
      id: `ill:${set}/${base}`,
      type: "illustration",
      name: human || base,
      category: "Ilustraciones",
      tags: [
        ...base.split(/[-_]/).filter(Boolean),
        ...esTagsForName(base),
        "ilustración",
        "persona",
        "gente",
        set,
      ],
      url: `/api/illustrations/stream?file=${encodeURIComponent(rel)}`,
      // MULTICOLOR: trae sus propios colores → la galería/duotono NO la tiñen.
      multicolor: true,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    builtAt: Date.now(),
    counts: {
      icons: phosphor.length + tabler.length + material.length + lucide.length,
      lottie: ordered.length,
      illustrations: illustrations.length,
    },
    stickers,
  };
}

/** ¿El cache en disco sigue siendo válido para los conteos actuales? */
async function cacheIsFresh(cache: StickerIndexFile): Promise<boolean> {
  if (cache.schemaVersion !== SCHEMA_VERSION) return false;
  const [ph, tb, ms, lu, noto, illus] = await Promise.all([
    countDir(PHOSPHOR_DIR, ".svg"),
    countDir(TABLER_DIR, ".svg"),
    countDir(MATERIAL_DIR, ".svg"),
    countDir(LUCIDE_DIR, ".svg"),
    countDir(NOTO_CATALOG_DIR, ".json"),
    listIllustrations(ILLUSTRATIONS_DIR).then((l) => l.length),
  ]);
  return (
    cache.counts.icons === ph + tb + ms + lu &&
    cache.counts.lottie === noto &&
    cache.counts.illustrations === illus
  );
}

let mem: StickerIndexFile | null = null;
let building: Promise<StickerIndexFile> | null = null;

/**
 * Devuelve el índice unificado. Orden de resolución:
 *   1. memoria (mismo proceso) — instantáneo.
 *   2. {DATA_ROOT}/cache/sticker-index.json — si los conteos no cambiaron.
 *   3. escanear el disco UNA vez y persistir el JSON.
 * Coalesce de builds concurrentes (igual que sfx-index): un solo escaneo aunque
 * lleguen varios requests con el cache frío.
 */
export async function getStickerIndex(): Promise<StickerIndexFile> {
  if (mem) return mem;
  if (building) return building;
  building = (async () => {
    // 2) intentar leer el cache persistido
    try {
      const raw = await fs.readFile(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as StickerIndexFile;
      if (await cacheIsFresh(parsed)) {
        mem = parsed;
        return parsed;
      }
    } catch {
      // sin cache o corrupto → reconstruir
    }
    // 3) reconstruir y persistir
    const idx = await buildIndex();
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(idx), "utf-8");
    } catch {
      // si no se puede escribir el cache, igual servimos el índice en memoria
    }
    mem = idx;
    return idx;
  })().finally(() => {
    building = null;
  });
  return building;
}
