/**
 * encoder.ts — codec de salida para Remotion según el perfil de HARDWARE (H3).
 *
 * Python (hw_profile.py) escribe <DATA_ROOT>/cache/hw_profile.json con un bloque
 * `recommend.video_encoder` ("h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264").
 * Acá lo leemos y lo traducimos al nombre de codec que entiende Remotion.
 *
 * IMPORTANTE (limitación de Remotion): el renderer de Remotion usa su PROPIO
 * compositor (FFmpeg embebido) y su CLI/`renderMedia` solo acepta codecs lógicos
 * ("h264", "h265", "vp8", "vp9", "prores", "gif"…). Remotion NO expone un encoder
 * NVENC/QSV/AMF: su "h264" siempre encodea en CPU (x264). Por eso:
 *   - `remotionCodec()` devuelve SIEMPRE un codec válido para Remotion ("h264").
 *   - `hardwareEncoder()` devuelve el encoder REAL recomendado por el hardware,
 *     útil para logging o para un post-encode propio vía ffmpeg si algún día se
 *     quiere acelerar (hoy: informativo).
 * Si en el futuro Remotion agrega `hardwareAcceleration`, este es el único lugar
 * a tocar.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function pickDataRoot(): string {
  const o = process.env.VIRAL_DATA_ROOT;
  if (o) return o;
  for (const c of ["C:\\viral-data\\videos", "C:\\hermes-data\\videos"]) {
    if (existsSync(c)) return c;
  }
  return "C:\\viral-data\\videos";
}

export type HardwareEncoder = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";
export type RemotionCodec = "h264" | "h265";

function readProfile(): Record<string, unknown> | null {
  try {
    const p = path.join(pickDataRoot(), "cache", "hw_profile.json");
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/** Encoder REAL recomendado por el hardware (lo que dice hw_profile.json). */
export function hardwareEncoder(): HardwareEncoder {
  const prof = readProfile();
  const rec = (prof?.recommend ?? {}) as Record<string, unknown>;
  const enc = String(rec.video_encoder ?? "libx264");
  if (enc === "h264_nvenc" || enc === "h264_qsv" || enc === "h264_amf") return enc;
  return "libx264";
}

/** ¿El hardware soporta encode NVENC funcional? (decisión rápida de UI/logs). */
export function hasNvenc(): boolean {
  return hardwareEncoder() === "h264_nvenc";
}

/**
 * Codec a pasarle a Remotion (`--codec` / renderMedia({codec})).
 * Remotion no expone NVENC, así que esto SIEMPRE es un codec lógico válido.
 * Se mapea h264_* → "h264"; cualquier otra cosa → "h264".
 */
export function remotionCodec(): RemotionCodec {
  // Hoy todos nuestros encoders recomendados son familia H.264.
  return "h264";
}

/** String legible para logs: qué encoder usaría el hardware vs qué hace Remotion. */
export function encoderSummary(): string {
  const hw = hardwareEncoder();
  const note =
    hw === "libx264"
      ? "CPU (x264)"
      : `${hw} disponible en HW, pero Remotion encodea en CPU (h264/x264)`;
  return `[encoder] recommend=${hw} → remotion codec=h264 (${note})`;
}
