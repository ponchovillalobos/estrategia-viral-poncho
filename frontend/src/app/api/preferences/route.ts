import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";
import { writeJsonFileAtomic } from "@/lib/atomic-write";

export const dynamic = "force-dynamic";

/**
 * Preferencias globales por usuario (defaults de la app). Se guardan en
 * <DATA_ROOT>/preferences.json. Hoy solo guarda el volumen de música por
 * defecto, pero el esquema es abierto para sumar más defaults sin migrar.
 */
const PREFS_PATH = path.join(DATA_ROOT, "preferences.json");

interface Preferences {
  // Volumen base de la música (0..1). El editor lo usa como default cuando un
  // proyecto nuevo no trae musicVolume. El ducking automático baja SOBRE este base.
  musicVolume?: number;
}

const DEFAULTS: Preferences = {
  musicVolume: 0.35,
};

async function readPreferences(): Promise<Preferences> {
  try {
    const raw = await fs.readFile(PREFS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Preferences;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // Sin archivo aún o JSON corrupto → defaults.
    return { ...DEFAULTS };
  }
}

export async function GET() {
  const prefs = await readPreferences();
  return NextResponse.json(prefs);
}

export async function POST(req: NextRequest) {
  let body: Partial<Preferences> = {};
  try {
    body = (await req.json()) as Partial<Preferences>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const current = await readPreferences();
  const next: Preferences = { ...current };

  if (body.musicVolume !== undefined) {
    const v = Number(body.musicVolume);
    if (Number.isFinite(v)) {
      // Clamp 0..1 — la UI manda 0..1, nunca dejamos pasar basura.
      next.musicVolume = Math.min(1, Math.max(0, v));
    }
  }

  await writeJsonFileAtomic(PREFS_PATH, next);
  return NextResponse.json(next);
}
