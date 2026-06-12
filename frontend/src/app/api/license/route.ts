/**
 * Estado y activación de la licencia — todo local, sin servidor externo.
 * GET  → estado actual (trial/active/trial_expired) para la UI de Configuración.
 * POST → { key } activa una clave firmada; valida offline con ed25519.
 */

import { NextRequest, NextResponse } from "next/server";
import { activateLicense, getLicenseStatus, TRIAL_DAYS, TRIAL_RENDERS } from "@/lib/license";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getLicenseStatus(),
    trialDays: TRIAL_DAYS,
    trialRenders: TRIAL_RENDERS,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "Pega tu clave de licencia primero." }, { status: 400 });
  }
  const result = activateLicense(key);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
