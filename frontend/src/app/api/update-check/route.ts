/**
 * GET /api/update-check — ¿hay una versión nueva de la app?
 *
 * Consulta la última release pública del repo en GitHub (sin token: es un
 * repo público y no queremos pedirle keys al usuario) y compara contra la
 * versión local. Devuelve { current, latest, hasUpdate, url, notes }.
 *
 * Diseño defensivo: si GitHub no responde (sin internet, rate limit, etc.)
 * devolvemos hasUpdate:false — un chequeo de updates JAMÁS debe romper la
 * app ni mostrar errores al usuario. Cacheamos en memoria 6 horas para no
 * golpear el rate limit anónimo de GitHub (60 req/h por IP).
 */
import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";

const RELEASES_URL =
  "https://api.github.com/repos/ponchovillalobos/viralito/releases/latest";
// 1 hora: balance entre detectar versiones nuevas pronto y no abrumar a GitHub.
const CACHE_TTL_MS = 1 * 60 * 60 * 1000;

interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
  notes: string;
  /** Link DIRECTO al instalador (.exe) del release; si el release no trae
   *  un .exe entre sus assets, cae a la página del release (html_url). */
  downloadUrl: string;
}

// Cache en globalThis para que sobreviva al hot-reload del dev server
// (un módulo re-evaluado perdería una variable de módulo normal).
const g = globalThis as unknown as {
  __updateCheck?: { at: number; info: UpdateInfo };
};

/** Parsea "v0.1.0" / "0.1.0" → [0, 1, 0]. Partes faltantes o raras valen 0. */
function parseSemver(tag: string): [number, number, number] {
  const clean = tag.trim().replace(/^v/i, "");
  const parts = clean.split(".").map((p) => parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** ¿`latest` es estrictamente mayor que `current`? Comparación semver simple. */
function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** Respuesta segura cuando no pudimos consultar GitHub: la app sigue normal. */
function noUpdate(): UpdateInfo {
  return {
    current: APP_VERSION,
    latest: APP_VERSION,
    hasUpdate: false,
    url: "",
    notes: "",
    downloadUrl: "",
  };
}

export async function GET() {
  // Cache fresco → respondemos sin tocar la red.
  if (g.__updateCheck && Date.now() - g.__updateCheck.at < CACHE_TTL_MS) {
    return NextResponse.json(g.__updateCheck.info);
  }

  let info: UpdateInfo;
  try {
    const r = await fetch(RELEASES_URL, {
      headers: {
        // GitHub rechaza requests sin User-Agent.
        "User-Agent": "estrategia-viral-studio-update-check",
        Accept: "application/vnd.github+json",
      },
      // Evitamos el cache de fetch de Next: el TTL lo manejamos nosotros.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const release = (await r.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const latest = (release.tag_name ?? "").replace(/^v/i, "") || APP_VERSION;
    // Link directo al instalador: buscamos el .exe entre los assets del release
    // (preferimos el que diga "setup"). Si no hay, la página del release.
    const exes = (release.assets ?? []).filter(
      (a) => a.name?.toLowerCase().endsWith(".exe") && a.browser_download_url
    );
    const setupAsset =
      exes.find((a) => a.name!.toLowerCase().includes("setup")) ?? exes[0];
    info = {
      current: APP_VERSION,
      latest,
      hasUpdate: isNewer(latest, APP_VERSION),
      url: release.html_url ?? "",
      notes: release.body ?? "",
      downloadUrl: setupAsset?.browser_download_url ?? release.html_url ?? "",
    };
  } catch {
    // Sin red / rate limit / repo sin releases → silencio total, sin update.
    info = noUpdate();
  }

  // Cacheamos también los fallos: si no hay internet, no insistimos 6 horas.
  g.__updateCheck = { at: Date.now(), info };
  return NextResponse.json(info);
}
