/**
 * GET /api/presets/feed — feed de plantillas vivas del estudio.
 *
 * Baja presets/manifest.json del repo público en GitHub (raw, sin token) y
 * devuelve las plantillas curadas que el usuario AÚN NO tiene instaladas
 * (comparando feedId contra sus templates locales): { presets, newCount }.
 *
 * Diseño defensivo (mismo patrón que /api/update-check): si GitHub no
 * responde, el manifest no existe o viene inválido → { presets: [],
 * newCount: 0 }. Este feed JAMÁS debe romper la app ni mostrar errores.
 * Cacheamos el manifest en memoria 6 horas (globalThis sobrevive al
 * hot-reload) para no golpear el rate limit anónimo; la comparación contra
 * lo instalado sí se hace en cada request porque cambia al instalar.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/ponchovillalobos/viralito/main/presets/manifest.json";
// 6 horas: las plantillas curadas salen cada semanas; más frecuente es desperdicio.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Plantilla curada del feed (campos del manifest, ya saneados). */
interface FeedPreset {
  feedId: string;
  name: string;
  description: string;
  styles: string[];
  accentColor: string;
  subtitleFont: string;
  music: "auto" | "none" | { mood: string };
  editorialTheme?: { font?: string; background?: string; theme?: string };
  aspectRatio: "9:16" | "16:9";
  addedAt: string;
}

// Cache en globalThis para que sobreviva al hot-reload del dev server.
const g = globalThis as unknown as {
  __presetsFeed?: { at: number; presets: FeedPreset[] };
};

/** Valida y sanea el manifest crudo. Lo que no cumpla el shape se descarta. */
function sanitizeManifest(raw: unknown): FeedPreset[] {
  if (!raw || typeof raw !== "object") return [];
  const presets = (raw as { presets?: unknown }).presets;
  if (!Array.isArray(presets)) return [];
  const out: FeedPreset[] = [];
  for (const p of presets) {
    if (!p || typeof p !== "object") continue;
    const x = p as Record<string, unknown>;
    if (typeof x.feedId !== "string" || !x.feedId.trim()) continue;
    if (typeof x.name !== "string" || !x.name.trim()) continue;
    if (!Array.isArray(x.styles) || x.styles.length === 0) continue;
    const styles = x.styles.filter((s): s is string => typeof s === "string");
    if (styles.length === 0) continue;
    const music =
      x.music === "none" || x.music === "auto"
        ? x.music
        : x.music && typeof x.music === "object" && typeof (x.music as { mood?: unknown }).mood === "string"
          ? { mood: (x.music as { mood: string }).mood }
          : ("auto" as const);
    out.push({
      feedId: x.feedId.trim().slice(0, 60),
      name: x.name.trim().slice(0, 60),
      description: typeof x.description === "string" ? x.description.slice(0, 200) : "",
      styles,
      accentColor: typeof x.accentColor === "string" ? x.accentColor : "#fb7185",
      subtitleFont: typeof x.subtitleFont === "string" ? x.subtitleFont : "auto",
      music,
      editorialTheme:
        x.editorialTheme && typeof x.editorialTheme === "object"
          ? (x.editorialTheme as FeedPreset["editorialTheme"])
          : undefined,
      aspectRatio: x.aspectRatio === "16:9" ? "16:9" : "9:16",
      addedAt: typeof x.addedAt === "string" ? x.addedAt : "",
    });
  }
  return out;
}

/** feedIds de las plantillas que el usuario ya instaló (templates.json local). */
async function readInstalledFeedIds(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(DATA_ROOT, "templates.json"), "utf-8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr
        .map((t: { feedId?: unknown }) => (typeof t?.feedId === "string" ? t.feedId : ""))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

export async function GET() {
  let all: FeedPreset[];
  if (g.__presetsFeed && Date.now() - g.__presetsFeed.at < CACHE_TTL_MS) {
    all = g.__presetsFeed.presets;
  } else {
    try {
      const r = await fetch(MANIFEST_URL, {
        headers: { "User-Agent": "estrategia-viral-studio-presets-feed" },
        // El TTL lo manejamos nosotros; nada de cache de fetch de Next.
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
      all = sanitizeManifest(await r.json());
    } catch {
      // Sin red / 404 (manifest aún no publicado) / JSON inválido → feed vacío.
      all = [];
    }
    // Cacheamos también los fallos: si no hay internet, no insistimos 6 horas.
    g.__presetsFeed = { at: Date.now(), presets: all };
  }

  // Solo las que el usuario NO tiene: al instalar una, desaparece del feed.
  const installed = await readInstalledFeedIds();
  const presets = all.filter((p) => !installed.has(p.feedId));
  return NextResponse.json({ presets, newCount: presets.length }, noStore);
}
