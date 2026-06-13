/**
 * GET /api/doctor — "Verificar instalación": diagnostica el entorno y devuelve
 * qué está bien y qué falta, EN ESPAÑOL, para que el usuario (o el onboarding)
 * sepa exactamente qué reparar. Sin esto, un venv roto o un ffmpeg ausente eran
 * fallas silenciosas con stderr vacío.
 *
 *   ?deep=1 → además ejecuta el test real de imports de Python (whisperx etc.,
 *             tarda 10-40s la primera vez; cacheado 30 min).
 */
import { NextRequest, NextResponse } from "next/server";
import { existsSync, readdirSync, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  PYTHON_EXE,
  PYTHON_DIR,
  REMOTION_DIR,
  FFMPEG_EXE,
  FFPROBE_EXE,
  DATA_ROOT,
} from "@/lib/paths";
import { runProcess } from "@/lib/run-process";

export const dynamic = "force-dynamic";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  /** Si ok=false: qué hacer, en lenguaje simple. */
  fix?: string;
  detail?: string;
  /** true = su ausencia ROMPE la instalación (la UI muestra alarma). false =
   *  opcional/informativo (modelo de voz, IA local): nunca dispara la alarma.
   *  El front filtra por ESTA bandera, para no desincronizarse de aquí. */
  critical: boolean;
}

// Cache del import-test de Python (caro: ~10-40s importa torch). Sobrevive
// mientras viva el proceso del server.
const g = globalThis as unknown as { __doctorImports?: { at: number; ok: boolean; detail: string } };
const IMPORTS_TTL = 30 * 60 * 1000;

/** ¿El modelo Whisper ya está descargado? (cache de HuggingFace en el perfil).
 *  Si HF_HOME está seteado, manda ÉL (es donde whisperx va a buscar/descargar). */
function whisperModelReady(): boolean {
  // Transcribir necesita DOS modelos. Antes solo se chequeaba el de voz: si el de
  // alineación no se había descargado, el doctor decía "listo" y la transcripción
  // fallaba sin avisar. Ahora exigimos AMBOS.

  // 1) Modelo de voz (faster-whisper) — caché de HuggingFace.
  const hfRoots = process.env.HF_HOME
    ? [path.join(process.env.HF_HOME, "hub")]
    : [path.join(os.homedir(), ".cache", "huggingface", "hub")];
  let vozOk = false;
  for (const root of hfRoots) {
    try {
      if (!existsSync(root)) continue;
      if (readdirSync(root).some((e) => e.toLowerCase().includes("faster-whisper"))) {
        vozOk = true;
        break;
      }
    } catch {
      /* sigue */
    }
  }

  // 2) Modelo de alineación (wav2vec2/voxpopuli) — caché de torchaudio.
  const torchRoot = process.env.TORCH_HOME
    ? path.join(process.env.TORCH_HOME, "hub", "checkpoints")
    : path.join(os.homedir(), ".cache", "torch", "hub", "checkpoints");
  let alineacionOk = false;
  try {
    if (existsSync(torchRoot)) {
      alineacionOk = readdirSync(torchRoot).some(
        (e) => e.toLowerCase().includes("voxpopuli") || e.toLowerCase().includes("wav2vec2")
      );
    }
  } catch {
    /* sin caché torch */
  }

  return vozOk && alineacionOk;
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const checks: Check[] = [];

  // 1. Python
  const pythonOk = existsSync(PYTHON_EXE);
  checks.push({
    id: "python",
    label: "Motor de procesamiento (Python)",
    ok: pythonOk,
    critical: true,
    detail: PYTHON_EXE,
    fix: pythonOk ? undefined : "Reinstala la app (falta la carpeta python del paquete).",
  });

  // 2. Imports de Python (solo con ?deep=1 — tarda; cacheado 30 min)
  if (deep && pythonOk) {
    const cached = g.__doctorImports;
    if (cached && Date.now() - cached.at < IMPORTS_TTL) {
      checks.push({
        id: "python-imports",
        label: "Componentes de IA (WhisperX, MediaPipe, librosa)",
        ok: cached.ok,
        critical: false,
        detail: cached.detail,
        fix: cached.ok ? undefined : "Reinstala la app o corre bootstrap.ps1 para reparar los paquetes.",
      });
    } else {
      const r = await runProcess(
        PYTHON_EXE,
        ["-c", "import whisperx, librosa, mediapipe; print('ok')"],
        PYTHON_DIR,
        undefined,
        120_000
      );
      const ok = r.ok && r.stdout.includes("ok");
      const detail = ok ? "todos los componentes presentes" : r.stderr.slice(-300);
      g.__doctorImports = { at: Date.now(), ok, detail };
      checks.push({
        id: "python-imports",
        label: "Componentes de IA (WhisperX, MediaPipe, librosa)",
        ok,
        critical: false,
        detail,
        fix: ok ? undefined : "Reinstala la app o corre bootstrap.ps1 para reparar los paquetes.",
      });
    }
  }

  // 3. ffmpeg / ffprobe
  const ffmpegOk = path.isAbsolute(FFMPEG_EXE) && existsSync(FFMPEG_EXE);
  const ffprobeOk = path.isAbsolute(FFPROBE_EXE) && existsSync(FFPROBE_EXE);
  checks.push({
    id: "ffmpeg",
    label: "Procesador de video (ffmpeg)",
    ok: ffmpegOk && ffprobeOk,
    critical: true,
    detail: FFMPEG_EXE,
    fix: ffmpegOk && ffprobeOk ? undefined : "Reinstala la app (falta la carpeta tools/ffmpeg del paquete).",
  });

  // 4. Remotion (renderizador)
  const remotionOk = existsSync(path.join(REMOTION_DIR, "node_modules"));
  checks.push({
    id: "remotion",
    label: "Generador de videos (Remotion)",
    ok: remotionOk,
    critical: true,
    fix: remotionOk ? undefined : "Reinstala la app (la carpeta remotion del paquete está incompleta).",
  });

  // 5. Carpeta de datos escribible
  let dataOk = false;
  try {
    const probe = path.join(DATA_ROOT, `.write-test-${Date.now()}`);
    await fs.mkdir(DATA_ROOT, { recursive: true });
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    dataOk = true;
  } catch {
    dataOk = false;
  }
  checks.push({
    id: "data",
    label: "Carpeta de videos",
    ok: dataOk,
    critical: true,
    detail: DATA_ROOT,
    fix: dataOk ? undefined : "Windows no deja escribir en la carpeta de datos. Muévela a Documentos o a tu carpeta de usuario.",
  });

  // 6. Modelo de voz (descarga única ~1.5 GB en el primer uso)
  const modelReady = whisperModelReady();
  checks.push({
    id: "whisper-model",
    label: "Modelo de voz (transcripción)",
    ok: modelReady,
    critical: false, // tiene su propia UI (botón «Preparar la app»), no alarma
    fix: modelReady ? undefined : "Toca «Preparar la app»: descarga el modelo una sola vez (~1.5 GB).",
  });

  // 7. IA local (Ollama) — SIEMPRE informativo: es opcional y su ausencia jamás
  // bloquea ni marca la instalación como rota (queda fuera de `critical`).
  let ollamaOk = false;
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    ollamaOk = r.ok;
  } catch {
    ollamaOk = false;
  }
  checks.push({
    id: "ollama",
    label: "IA local (opcional)",
    ok: ollamaOk,
    critical: false, // OPCIONAL: su ausencia jamás bloquea ni marca como rota
    detail: ollamaOk
      ? "Ollama está activa. Solo se usa para el modo inteligente de videos largos."
      : "Solo se usa para el modo inteligente de videos largos. Sin ella, todo lo demás funciona.",
    fix: ollamaOk
      ? undefined
      : "Opcional: si quieres el modo inteligente de videos largos, la app te guía para activarla. Todo lo demás funciona sin ella.",
  });

  const critical = checks.filter(
    (c) => c.id !== "whisper-model" && c.id !== "python-imports" && c.id !== "ollama"
  );
  return NextResponse.json({
    ok: critical.every((c) => c.ok),
    modelReady,
    checks,
  });
}
