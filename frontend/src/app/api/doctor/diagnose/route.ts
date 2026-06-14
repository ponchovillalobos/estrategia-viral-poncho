/**
 * GET /api/doctor/diagnose — "Diagnosticar todo": un chequeo en vivo, AHORA, de
 * que CADA pieza de la instalación está en su lugar. A diferencia de /api/doctor
 * (orientado a onboarding, en español, con `fix:`), este devuelve un objeto
 * estructurado por componente — pensado para una vista de diagnóstico técnica:
 * dataRoot, ffmpeg (+nvenc), ffprobe, python, modelos de voz/alineación, ollama,
 * torch (+cuda/gpu) y conteos de cada librería de assets contra su mínimo.
 *
 * Diseño: cada check es independiente, tiene su PROPIO timeout, y si tira excepción
 * cae en `{ ok:false, error }` sin tumbar a los demás. Los spawns corren en paralelo
 * (Promise.all) para mantener el total por debajo de ~10s.
 */
import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync, readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  PYTHON_EXE,
  FFMPEG_EXE,
  FFPROBE_EXE,
  DATA_ROOT,
  PROJECT_ROOT,
} from "@/lib/paths";
import { APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";

// ── Config (env-overridable, mismos nombres que python/config.py) ──────────────
const WHISPER_MODEL = process.env.VIRAL_WHISPER_MODEL || "small";
const OLLAMA_URL = process.env.VIRAL_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.VIRAL_OLLAMA_MODEL || "qwen3:1.7b";

const MIN_MODEL_BYTES = 100 * 1024 * 1024; // 100 MB: filtra archivos placeholder/incompletos

// ── Mínimos de cada librería de assets ─────────────────────────────────────────
interface AssetSpec {
  dir: string;
  ext: string[];
  min: number;
  recursive?: boolean;
  /** true = relativo a PROJECT_ROOT en vez de DATA_ROOT. */
  fromProjectRoot?: boolean;
}
const ASSET_MIN: Record<string, AssetSpec> = {
  // music/sfx caen en subcarpeta /github → conteo RECURSIVO.
  music: { dir: "assets/music", ext: [".mp3"], min: 50, recursive: true },
  sfx: { dir: "assets/sfx", ext: [".ogg", ".wav", ".mp3"], min: 200, recursive: true },
  lottie: { dir: "assets/lottie/noto", ext: [".json"], min: 30, recursive: true },
  icons: { dir: "assets/icons", ext: [".svg"], min: 5000, recursive: true },
  fonts: { dir: "remotion/public/fonts", ext: [".ttf", ".otf"], min: 6, fromProjectRoot: true },
  luts: { dir: "remotion/public/luts", ext: [".cube"], min: 4, fromProjectRoot: true },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Spawn ligero con timeout propio. NUNCA rechaza: timeout/ENOENT → ok:false. */
function spawnExe(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok, stdout, stderr });
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(cmd, args, {
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      });
    } catch (e) {
      resolve({ ok: false, stdout: "", stderr: String(e) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      stderr += `\n[timeout ${timeoutMs}ms]`;
      finish(false);
    }, timeoutMs);
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      stderr += `\n${String(err)}`;
      finish(false);
    });
    proc.on("close", (code) => finish(code === 0));
  });
}

/** Cuenta archivos con las extensiones dadas. Devuelve 0 si la carpeta no existe. */
function countFiles(dir: string, exts: string[], recursive: boolean): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) total += countFiles(full, exts, recursive);
    } else if (exts.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
      total++;
    }
  }
  return total;
}

/** El archivo de modelo más grande (en bytes) dentro de `dir` recursivo, o 0. */
function largestModelBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let max = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        max = Math.max(max, largestModelBytes(full));
      } else if (/\.(bin|safetensors)$/i.test(entry.name)) {
        max = Math.max(max, statSync(full).size);
      }
    } catch {
      /* link roto / permiso → ignora */
    }
  }
  return max;
}

const bytesToMb = (b: number) => Math.round(b / (1024 * 1024));

// ── Checks individuales (cada uno atrapa su propia excepción) ───────────────────

async function checkDataRoot() {
  try {
    await fs.mkdir(DATA_ROOT, { recursive: true });
    const probe = path.join(DATA_ROOT, `.diagnose-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    return { ok: true, path: DATA_ROOT, writable: true };
  } catch (e) {
    return { ok: false, path: DATA_ROOT, writable: false, error: String(e) };
  }
}

async function checkFfmpeg() {
  // `present` = el binario EXISTE en disco (existsSync). Se reporta aparte de `ok`
  // (que exige que `-version` corra) para que el gate distinga "falta el binario →
  // reinstalar" de "está pero no respondió → transitorio/ambiental, NO encerrar".
  const present = existsSync(FFMPEG_EXE);
  try {
    if (!present) {
      return { ok: false, present: false, path: FFMPEG_EXE, version: null, nvenc: false, error: "ffmpeg no encontrado" };
    }
    const [ver, enc] = await Promise.all([
      spawnExe(FFMPEG_EXE, ["-version"], 5000),
      spawnExe(FFMPEG_EXE, ["-hide_banner", "-encoders"], 5000),
    ]);
    const version = ver.ok
      ? (ver.stdout.match(/ffmpeg version (\S+)/)?.[1] ?? ver.stdout.split(/\r?\n/)[0] ?? null)
      : null;
    const nvenc = enc.ok && /h264_nvenc/.test(enc.stdout);
    return {
      ok: ver.ok,
      present: true,
      path: FFMPEG_EXE,
      version,
      nvenc,
      ...(ver.ok ? {} : { error: ver.stderr.slice(-300) || "ffmpeg -version falló" }),
    };
  } catch (e) {
    return { ok: false, present, path: FFMPEG_EXE, version: null, nvenc: false, error: String(e) };
  }
}

async function checkFfprobe() {
  const present = existsSync(FFPROBE_EXE);
  try {
    if (!present) {
      return { ok: false, present: false, path: FFPROBE_EXE, error: "ffprobe no encontrado" };
    }
    const r = await spawnExe(FFPROBE_EXE, ["-version"], 5000);
    return r.ok
      ? { ok: true, present: true, path: FFPROBE_EXE }
      : { ok: false, present: true, path: FFPROBE_EXE, error: r.stderr.slice(-300) || "ffprobe -version falló" };
  } catch (e) {
    return { ok: false, present, path: FFPROBE_EXE, error: String(e) };
  }
}

async function checkPython() {
  const present = existsSync(PYTHON_EXE);
  try {
    if (!present) {
      return { ok: false, present: false, version: null, error: "python no encontrado" };
    }
    const r = await spawnExe(PYTHON_EXE, ["--version"], 5000);
    const out = `${r.stdout}${r.stderr}`;
    const version = r.ok ? (out.match(/Python (\S+)/)?.[1] ?? null) : null;
    return r.ok
      ? { ok: true, present: true, version }
      : { ok: false, present: true, version: null, error: r.stderr.slice(-300) || "python --version falló" };
  } catch (e) {
    return { ok: false, present, version: null, error: String(e) };
  }
}

function checkWhisperModel() {
  try {
    // Caché de HuggingFace (respeta HF_HOME). Carpeta del modelo faster-whisper.
    const hubRoot = process.env.HF_HOME
      ? path.join(process.env.HF_HOME, "hub")
      : path.join(os.homedir(), ".cache", "huggingface", "hub");
    const modelDir = path.join(hubRoot, `models--Systran--faster-whisper-${WHISPER_MODEL}`);
    if (!existsSync(modelDir)) {
      return { ok: false, cached: false, sizeMb: null, error: `no descargado (${modelDir})` };
    }
    const bytes = largestModelBytes(modelDir);
    const ok = bytes >= MIN_MODEL_BYTES;
    return {
      ok,
      cached: ok,
      sizeMb: bytes > 0 ? bytesToMb(bytes) : null,
      ...(ok ? {} : { error: "modelo presente pero incompleto (<100MB)" }),
    };
  } catch (e) {
    return { ok: false, cached: false, sizeMb: null, error: String(e) };
  }
}

function checkAlignmentModel() {
  try {
    // Caché de torch (respeta TORCH_HOME). Checkpoint wav2vec2 voxpopuli ES.
    const ckptRoot = process.env.TORCH_HOME
      ? path.join(process.env.TORCH_HOME, "hub", "checkpoints")
      : path.join(os.homedir(), ".cache", "torch", "hub", "checkpoints");
    const file = path.join(ckptRoot, "wav2vec2_voxpopuli_base_10k_asr_es.pt");
    if (!existsSync(file)) {
      return { ok: false, cached: false, path: null, error: `no descargado (${file})` };
    }
    const bytes = statSync(file).size;
    const ok = bytes >= MIN_MODEL_BYTES;
    return {
      ok,
      cached: ok,
      path: file,
      ...(ok ? {} : { error: "checkpoint presente pero incompleto (<100MB)" }),
    };
  } catch (e) {
    return { ok: false, cached: false, path: null, error: String(e) };
  }
}

async function checkOllama() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      return { ok: false, url: OLLAMA_URL, model: null, reachable: false, error: `HTTP ${r.status}` };
    }
    const data = (await r.json()) as { models?: { name?: string }[] };
    const names = (data.models ?? []).map((m) => m.name ?? "");
    // Match exacto, o por prefijo cuando el tag trae cuantización extra
    // (p.ej. "qwen3:1.7b" lista como "qwen3:1.7b-q4_K_M").
    const ok = names.some((n) => n === OLLAMA_MODEL || n.startsWith(`${OLLAMA_MODEL}-`));
    return {
      ok,
      url: OLLAMA_URL,
      model: ok ? OLLAMA_MODEL : null,
      reachable: true,
      ...(ok ? {} : { error: `Ollama activo pero falta el modelo ${OLLAMA_MODEL}` }),
    };
  } catch (e) {
    return { ok: false, url: OLLAMA_URL, model: null, reachable: false, error: String(e) };
  }
}

async function checkTorch() {
  try {
    if (!existsSync(PYTHON_EXE)) {
      return { ok: false, version: null, cuda: false, gpu: null, error: "python no encontrado" };
    }
    const [t, smi] = await Promise.all([
      spawnExe(
        PYTHON_EXE,
        ["-c", "import torch;print(torch.__version__);print(torch.cuda.is_available())"],
        8000
      ),
      spawnExe("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], 5000),
    ]);
    if (!t.ok) {
      return { ok: false, version: null, cuda: false, gpu: null, error: t.stderr.slice(-300) || "import torch falló" };
    }
    const lines = t.stdout.trim().split(/\r?\n/);
    const version = lines[0]?.trim() || null;
    const cuda = /true/i.test(lines[1] ?? "");
    const gpu = smi.ok ? (smi.stdout.split(/\r?\n/)[0]?.trim() || null) : null;
    return { ok: true, version, cuda, gpu };
  } catch (e) {
    return { ok: false, version: null, cuda: false, gpu: null, error: String(e) };
  }
}

// ── NVENC / perfil de hardware (H6 + H7) ────────────────────────────────────────
// Lee <DATA_ROOT>/cache/hw_profile.json (lo escribe python/hw_profile.py). Expone:
//   - nvenc: informativo (¿el render usa GPU?, y si no, por qué). NUNCA baja el `ok`
//     raíz — es un aviso, igual que ollama queda fuera del AND.
//   - hardware + recommend: specs y la config que la app aplicó (panel Rendimiento).
// Si el json no existe → no molestar: nvenc.ok:true, applicable:false, hardware/recommend null.
function readHwProfile(): Record<string, unknown> | null {
  try {
    const file = path.join(DATA_ROOT, "cache", "hw_profile.json");
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function checkNvenc() {
  const prof = readHwProfile();
  if (!prof) {
    // Sin perfil aún (no se corrió hw_profile.py): no es un problema, no avisar.
    return { ok: true, applicable: false, unusableReason: null, fixUrl: null, gpuName: null };
  }
  const nv = (prof.gpu_nvidia as Record<string, unknown> | null) ?? null;
  const gpuName = nv && typeof nv.name === "string" ? nv.name : "";
  // Sin GPU NVIDIA (name vacío o sin bloque) → no aplica, no es problema.
  if (!nv || !gpuName) {
    return { ok: true, applicable: false, unusableReason: null, fixUrl: null, gpuName: null };
  }
  const usable = nv.nvenc_usable === true;
  const reason = typeof nv.nvenc_unusable_reason === "string" ? nv.nvenc_unusable_reason : null;
  return {
    ok: usable,
    applicable: true,
    unusableReason: usable ? null : reason,
    fixUrl: "https://www.nvidia.com/Download/index.aspx",
    gpuName,
  };
}

function checkAssets() {
  const out: Record<string, { ok: boolean; count: number; min: number; error?: string }> = {};
  for (const [key, spec] of Object.entries(ASSET_MIN)) {
    try {
      const base = spec.fromProjectRoot ? PROJECT_ROOT : DATA_ROOT;
      const dir = path.join(base, ...spec.dir.split("/"));
      const count = countFiles(dir, spec.ext, spec.recursive ?? false);
      out[key] = { ok: count >= spec.min, count, min: spec.min };
    } catch (e) {
      out[key] = { ok: false, count: 0, min: spec.min, error: String(e) };
    }
  }
  return out as {
    music: { ok: boolean; count: number; min: number };
    sfx: { ok: boolean; count: number; min: number };
    lottie: { ok: boolean; count: number; min: number };
    icons: { ok: boolean; count: number; min: number };
    fonts: { ok: boolean; count: number; min: number };
    luts: { ok: boolean; count: number; min: number };
  };
}

export async function GET() {
  const [dataRoot, ffmpeg, ffprobe, python, ollama, torch] = await Promise.all([
    checkDataRoot(),
    checkFfmpeg(),
    checkFfprobe(),
    checkPython(),
    checkOllama(),
    checkTorch(),
  ]);
  // Síncronos (filesystem) — baratos, no necesitan paralelizar.
  const whisperModel = checkWhisperModel();
  const alignmentModel = checkAlignmentModel();
  const assets = checkAssets();
  const nvenc = checkNvenc();

  const checks = {
    dataRoot,
    ffmpeg,
    ffprobe,
    python,
    whisperModel,
    alignmentModel,
    ollama,
    torch,
    nvenc,
    assets,
  };

  // Specs + config aplicada para el panel "Rendimiento" (H7). Derivado del mismo
  // perfil que nvenc; null si hw_profile.py no se ha corrido todavía.
  const prof = readHwProfile();
  const nvProf = (prof?.gpu_nvidia as Record<string, unknown> | null) ?? null;
  const hardware = prof
    ? {
        coresPhysical: typeof prof.cores_physical === "number" ? prof.cores_physical : null,
        coresLogical: typeof prof.cores_logical === "number" ? prof.cores_logical : null,
        ramGb: typeof prof.ram_gb === "number" ? prof.ram_gb : null,
        gpuName: nvProf && typeof nvProf.name === "string" && nvProf.name ? nvProf.name : null,
        driverVersion:
          nvProf && typeof nvProf.driver_version === "string" ? nvProf.driver_version : null,
        vramTotalMb: nvProf && typeof nvProf.vram_total_mb === "number" ? nvProf.vram_total_mb : null,
        vramFreeMb: nvProf && typeof nvProf.vram_free_mb === "number" ? nvProf.vram_free_mb : null,
      }
    : null;
  const rec = (prof?.recommend as Record<string, unknown> | null) ?? null;
  const recommend = rec
    ? {
        whisperModel: typeof rec.whisper_model === "string" ? rec.whisper_model : null,
        whisperDevice: typeof rec.whisper_device === "string" ? rec.whisper_device : null,
        whisperComputeType:
          typeof rec.whisper_compute_type === "string" ? rec.whisper_compute_type : null,
        videoEncoder: typeof rec.video_encoder === "string" ? rec.video_encoder : null,
        videoDecoderHwaccel:
          typeof rec.video_decoder_hwaccel === "string" ? rec.video_decoder_hwaccel : null,
        ollamaModel: typeof rec.ollama_model === "string" ? rec.ollama_model : null,
        remotionWorkers: typeof rec.remotion_workers === "number" ? rec.remotion_workers : null,
      }
    : null;

  // Ollama queda FUERA del `ok` raíz a propósito: es OPCIONAL (solo el modo
  // inteligente de videos largos lo usa) y setup_all.py NO lo instala — incluirlo
  // dejaría el gate bloqueado para siempre en cualquier PC sin Ollama. Se reporta
  // igual en checks.ollama. Consistente con /api/doctor (ollama = critical:false).
  const ok =
    dataRoot.ok &&
    ffmpeg.ok &&
    ffprobe.ok &&
    python.ok &&
    whisperModel.ok &&
    alignmentModel.ok &&
    torch.ok &&
    Object.values(assets).every((a) => a.ok);

  return NextResponse.json({
    ok,
    generatedAt: new Date().toISOString(),
    versionApp: APP_VERSION,
    checks,
    hardware,
    recommend,
  });
}
