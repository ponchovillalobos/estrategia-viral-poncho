/**
 * Licencia offline + prueba gratuita — 100% local, sin servidor.
 *
 * Modelo:
 *  - PRUEBA: arranca sola en el primer uso. Dura TRIAL_DAYS días o
 *    TRIAL_RENDERS videos generados (lo que pase primero). Durante la prueba
 *    todo funciona, pero los videos llevan una marca de agua discreta.
 *  - LICENCIA: una clave firmada offline con ed25519 (la firma el dueño con
 *    su llave privada, que NUNCA viaja con la app). Se pega en Configuración
 *    y se valida local con la llave pública embebida. Sin internet, sin DRM.
 *
 * Formato de clave:  EVP1.<base64url(payload JSON)>.<base64url(firma)>
 * Payload: { name, email?, tier: "personal"|"agencia", machines, updatesUntil: "YYYY-MM-DD", keyVersion }
 *
 * El estado vive en {dirname(DATA_ROOT)}\license.json con espejo en
 * %LOCALAPPDATA%\EstrategiaViral\license.json (borrar uno no resetea la
 * prueba: se reconcilia con el installedAt más viejo y el contador más alto).
 * Un técnico puede burlarlo editando archivos — aceptado por diseño: el
 * público objetivo no lo hará, y a cambio la app jamás "llama a casa".
 */

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const TRIAL_DAYS = 7;
export const TRIAL_RENDERS = 10;

/** Llave pública del firmante (la privada vive solo con el dueño). */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAguI/SrZ7dezw2C6N8iJ6AhzV5TL9fEKtVNy0138O7ys=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  name: string;
  email?: string;
  tier: "personal" | "agencia";
  machines: number;
  /** Hasta cuándo tiene derecho a actualizaciones (YYYY-MM-DD). La app nunca deja de funcionar. */
  updatesUntil: string;
  keyVersion: number;
}

interface LicenseFile {
  installedAt: number;
  rendersUsed: number;
  /** Clave activada (se re-verifica en cada lectura, por si editaron el archivo). */
  licenseKey?: string;
}

export type LicenseStatus =
  | {
      status: "active";
      name: string;
      tier: LicensePayload["tier"];
      machines: number;
      updatesUntil: string;
    }
  | { status: "trial"; daysLeft: number; rendersLeft: number }
  | { status: "trial_expired" };

const PRIMARY_FILE = path.join(path.dirname(DATA_ROOT), "license.json");
const MIRROR_FILE = path.join(
  process.env.LOCALAPPDATA ?? path.join(path.dirname(DATA_ROOT), ".appdata"),
  "EstrategiaViral",
  "license.json"
);

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Verifica la firma y devuelve el payload, o null si la clave no es válida. */
export function verifyLicenseKey(key: string): LicensePayload | null {
  try {
    const parts = key.trim().split(".");
    if (parts.length !== 3 || parts[0] !== "EVP1") return null;
    const payloadBuf = b64urlDecode(parts[1]);
    const sig = b64urlDecode(parts[2]);
    const ok = cryptoVerify(null, payloadBuf, createPublicKey(PUBLIC_KEY_PEM), sig);
    if (!ok) return null;
    const payload = JSON.parse(payloadBuf.toString("utf8")) as LicensePayload;
    if (!payload?.name || !payload?.tier || !payload?.updatesUntil) return null;
    return payload;
  } catch {
    return null;
  }
}

function readFileSafe(file: string): LicenseFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LicenseFile;
    if (typeof raw?.installedAt !== "number") return null;
    return { installedAt: raw.installedAt, rendersUsed: raw.rendersUsed ?? 0, licenseKey: raw.licenseKey };
  } catch {
    return null;
  }
}

function writeBoth(state: LicenseFile): void {
  for (const file of [PRIMARY_FILE, MIRROR_FILE]) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
    } catch {
      // El espejo puede fallar (permisos); con uno alcanza.
    }
  }
}

/** Lee y reconcilia ambos archivos; crea el estado en el primer uso. */
export function getLicenseState(): LicenseFile {
  const a = readFileSafe(PRIMARY_FILE);
  const b = readFileSafe(MIRROR_FILE);
  if (!a && !b) {
    const fresh: LicenseFile = { installedAt: Date.now(), rendersUsed: 0 };
    writeBoth(fresh);
    return fresh;
  }
  const merged: LicenseFile = {
    // Borrar un archivo no reinicia la prueba: gana el más viejo / el contador más alto.
    installedAt: Math.min(a?.installedAt ?? Infinity, b?.installedAt ?? Infinity),
    rendersUsed: Math.max(a?.rendersUsed ?? 0, b?.rendersUsed ?? 0),
    licenseKey: a?.licenseKey ?? b?.licenseKey,
  };
  if (!a || !b || a.installedAt !== merged.installedAt || a.rendersUsed !== merged.rendersUsed) {
    writeBoth(merged);
  }
  return merged;
}

export function getLicenseStatus(): LicenseStatus {
  const state = getLicenseState();
  if (state.licenseKey) {
    const payload = verifyLicenseKey(state.licenseKey);
    if (payload) {
      return {
        status: "active",
        name: payload.name,
        tier: payload.tier,
        machines: payload.machines ?? 1,
        updatesUntil: payload.updatesUntil,
      };
    }
  }
  const daysUsed = (Date.now() - state.installedAt) / (24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysUsed));
  const rendersLeft = Math.max(0, TRIAL_RENDERS - state.rendersUsed);
  if (daysLeft <= 0 || rendersLeft <= 0) return { status: "trial_expired" };
  return { status: "trial", daysLeft, rendersLeft };
}

/** Activa una clave pegada por el usuario. Devuelve el estado o un error humano. */
export function activateLicense(key: string): { ok: true; status: LicenseStatus } | { ok: false; error: string } {
  const payload = verifyLicenseKey(key);
  if (!payload) {
    return {
      ok: false,
      error: "Esa clave no es válida. Revisa que la hayas copiado completa (empieza con EVP1.) e intenta de nuevo.",
    };
  }
  const state = getLicenseState();
  state.licenseKey = key.trim();
  writeBoth(state);
  return { ok: true, status: getLicenseStatus() };
}

/** Cuenta un video generado (solo afecta la prueba; con licencia no hay tope). */
export function registerRender(): void {
  const state = getLicenseState();
  if (state.licenseKey && verifyLicenseKey(state.licenseKey)) return;
  state.rendersUsed += 1;
  writeBoth(state);
}

/** ¿Puede generar videos? (activa, o prueba con días Y videos restantes) */
export function canRender(): { allowed: true; watermark: boolean } | { allowed: false; reason: string } {
  const status = getLicenseStatus();
  if (status.status === "active") return { allowed: true, watermark: false };
  if (status.status === "trial") return { allowed: true, watermark: true };
  return {
    allowed: false,
    reason: `Tu prueba gratuita terminó (${TRIAL_DAYS} días o ${TRIAL_RENDERS} videos). Activa tu licencia en Configuración → Licencia para seguir creando sin límites.`,
  };
}
