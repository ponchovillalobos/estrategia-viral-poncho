/**
 * Qué librerías de assets se están RE-DESCARGANDO ahora mismo. Lo determina
 * leyendo los lockfiles que escribe python/repair_assets.py en
 * {DATA_ROOT}/cache/repair-<lib>.lock — un lock reciente (< 15 min) = reparación
 * en curso. La UI puede mostrar "música re-descargándose…" sin spamear.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

// Mismo TTL que repair_assets.py (15 min): un lock más viejo se considera muerto.
const LOCK_TTL_MS = 15 * 60 * 1000;

export async function GET() {
  const cacheDir = path.join(DATA_ROOT, "cache");
  const repairing: string[] = [];
  try {
    const entries = await fs.readdir(cacheDir);
    const now = Date.now();
    for (const name of entries) {
      const m = /^repair-(.+)\.lock$/.exec(name);
      if (!m) continue;
      try {
        const stat = await fs.stat(path.join(cacheDir, name));
        if (now - stat.mtimeMs < LOCK_TTL_MS) repairing.push(m[1]);
      } catch {
        // lock borrado entre readdir y stat — ignorar
      }
    }
  } catch {
    // sin carpeta cache → nada reparándose
  }
  return NextResponse.json({ repairing });
}
