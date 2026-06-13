// requiere vitest (no configurado aún) — este archivo documenta el contrato del
// endpoint y los casos clave. NO se ejecuta en CI todavía; cuando se agregue
// vitest, basta con `vitest run`.
//
// Estrategia: mockeamos las fronteras del sistema (fs, child_process.spawn,
// fetch global) para forzar cada escenario sin tocar la máquina real. El route
// es resiliente por diseño: un check que falla no debe tumbar a los demás.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks de paths/version: valores deterministas, independientes del entorno ──
vi.mock("@/lib/paths", () => ({
  PYTHON_EXE: "/fake/python.exe",
  FFMPEG_EXE: "/fake/ffmpeg.exe",
  FFPROBE_EXE: "/fake/ffprobe.exe",
  DATA_ROOT: "/fake/data",
  PROJECT_ROOT: "/fake/project",
}));
vi.mock("@/lib/app-version", () => ({ APP_VERSION: "9.9.9" }));

// ── Controles globales que cada test ajusta ────────────────────────────────────
const state = {
  existing: new Set<string>(),
  fileSizes: new Map<string, number>(),
  dirEntries: new Map<string, { name: string; isDir: boolean }[]>(),
  dataWritable: true,
  ffmpegOk: true,
  nvenc: true,
  ffprobeOk: true,
  pythonOk: true,
  torchOk: true,
  ollamaStatus: 200 as number | "throw",
  ollamaModels: ["qwen3:1.7b"] as string[],
};

vi.mock("node:fs", () => {
  const Dirent = (name: string, isDir: boolean) => ({
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  });
  return {
    existsSync: (p: string) => state.existing.has(p),
    readdirSync: (p: string) =>
      (state.dirEntries.get(p) ?? []).map((e) => Dirent(e.name, e.isDir)),
    statSync: (p: string) => ({ size: state.fileSizes.get(p) ?? 0 }),
    promises: {
      mkdir: async () => undefined,
      writeFile: async () => {
        if (!state.dataWritable) throw new Error("EACCES");
      },
      rm: async () => undefined,
    },
  };
});

vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    // EventEmitter falso mínimo: dispara stdout y close en el próximo tick.
    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    const emit = (ev: string, ...a: unknown[]) => (handlers[ev] ?? []).forEach((h) => h(...a));
    const on = (ev: string, h: (...a: unknown[]) => void) => {
      (handlers[ev] ??= []).push(h);
      return api;
    };
    let stdout = "";
    let code = 0;
    if (cmd.includes("ffmpeg")) {
      if (args.includes("-version")) {
        stdout = "ffmpeg version 6.1 Copyright";
        code = state.ffmpegOk ? 0 : 1;
      } else {
        stdout = state.nvenc ? "h264_nvenc NVIDIA NVENC" : "libx264 only";
        code = state.ffmpegOk ? 0 : 1;
      }
    } else if (cmd.includes("ffprobe")) {
      stdout = "ffprobe version 6.1";
      code = state.ffprobeOk ? 0 : 1;
    } else if (cmd.includes("python")) {
      if (args.some((a) => a === "--version")) {
        stdout = "Python 3.11.5";
        code = state.pythonOk ? 0 : 1;
      } else {
        stdout = "2.1.0\nFalse\n";
        code = state.torchOk ? 0 : 1;
      }
    } else if (cmd.includes("nvidia-smi")) {
      stdout = "";
      code = 1;
    }
    const api = {
      stdout: { on: (_e: string, h: (d: Buffer) => void) => { (handlers.__so ??= []).push(h as never); } },
      stderr: { on: () => undefined },
      on,
      kill: () => undefined,
    };
    queueMicrotask(() => {
      (handlers.__so ?? []).forEach((h) => (h as (d: string) => void)(stdout));
      emit("close", code);
    });
    return api as never;
  },
}));

const realFetch = globalThis.fetch;
beforeEach(() => {
  // Reset a un mundo "todo OK".
  state.existing = new Set([
    "/fake/python.exe",
    "/fake/ffmpeg.exe",
    "/fake/ffprobe.exe",
    "/fake/data",
  ]);
  state.fileSizes = new Map();
  state.dirEntries = new Map();
  state.dataWritable = true;
  state.ffmpegOk = true;
  state.nvenc = true;
  state.ffprobeOk = true;
  state.pythonOk = true;
  state.torchOk = true;
  state.ollamaStatus = 200;
  state.ollamaModels = ["qwen3:1.7b"];

  globalThis.fetch = (async () => {
    if (state.ollamaStatus === "throw") throw new Error("ECONNREFUSED");
    return {
      ok: state.ollamaStatus === 200,
      status: state.ollamaStatus,
      json: async () => ({ models: state.ollamaModels.map((name) => ({ name })) }),
    };
  }) as never;
});

/** Punto de extensión: sembrar los paths exactos de caché HF/torch + conteos de
 *  assets para forzar el camino "todo OK" con ok raíz=true. Requiere conocer
 *  homedir/separador del runner; se deja como referencia del contrato. */
function seedModels() {
  /* no-op por ahora — ver comentario del caso "todo-OK" */
}

async function callRoute() {
  const mod = await import("./route");
  const res = await mod.GET();
  return res.json();
}

describe("GET /api/doctor/diagnose", () => {
  it("shape exacto: todas las keys presentes", async () => {
    const body = await callRoute();
    expect(body).toHaveProperty("ok");
    expect(typeof body.generatedAt).toBe("string");
    expect(body.versionApp).toBe("9.9.9");
    const c = body.checks;
    for (const k of ["dataRoot", "ffmpeg", "ffprobe", "python", "whisperModel", "alignmentModel", "ollama", "torch", "assets"]) {
      expect(c).toHaveProperty(k);
    }
    for (const k of ["music", "sfx", "lottie", "icons", "fonts", "luts"]) {
      expect(c.assets).toHaveProperty(k);
      expect(c.assets[k]).toHaveProperty("min");
    }
  });

  it("ollama caído → ollama.ok=false pero el resto no se afecta", async () => {
    state.ollamaStatus = "throw";
    const body = await callRoute();
    expect(body.checks.ollama.ok).toBe(false);
    expect(body.checks.ollama.reachable).toBe(false);
    // ffmpeg/ffprobe/python siguen evaluándose normalmente.
    expect(body.checks.ffmpeg.ok).toBe(true);
    expect(body.checks.python.ok).toBe(true);
    expect(body.ok).toBe(false); // ok raíz es AND de todo
  });

  it("asset count bajo → ese asset.ok=false con count<min", async () => {
    // Sin sembrar entradas de directorio, count=0 para todas las librerías.
    const body = await callRoute();
    expect(body.checks.assets.icons.ok).toBe(false);
    expect(body.checks.assets.icons.count).toBe(0);
    expect(body.checks.assets.icons.min).toBe(5000);
  });

  it("ffmpeg ausente → ffmpeg.ok=false con error, los demás siguen", async () => {
    state.existing.delete("/fake/ffmpeg.exe");
    const body = await callRoute();
    expect(body.checks.ffmpeg.ok).toBe(false);
    expect(body.checks.ffmpeg.error).toBeTruthy();
    expect(body.checks.ffprobe.ok).toBe(true); // independiente
  });

  it("todo-OK conceptual: con modelos+assets sembrados, ok raíz sería true", async () => {
    // Este caso documenta la condición de éxito. Sembrar los paths exactos de
    // caché HF/torch y los conteos de assets requiere conocer homedir/separador;
    // se deja como referencia del contrato (ver seedModels()).
    seedModels();
    const body = await callRoute();
    // Al menos los checks de proceso pasan en el mundo "todo OK" por defecto.
    expect(body.checks.ffmpeg.ok).toBe(true);
    expect(body.checks.ffmpeg.nvenc).toBe(true);
    expect(body.checks.ffprobe.ok).toBe(true);
    expect(body.checks.python.ok).toBe(true);
    expect(body.checks.torch.ok).toBe(true);
    expect(body.checks.ollama.ok).toBe(true);
  });
});

// Evita warning de import no usado si el runner es estricto.
void realFetch;
