import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { REMOTION_DIR, RENDERS_DIR, RAW_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

// Tope duro: si Remotion se cuelga, matamos el proceso a los 25 min en vez de bloquear
// el request (y el slot) para siempre.
const RENDER_TIMEOUT_MS = 25 * 60 * 1000;

interface RenderRequest {
  videoId: string;
  props: Record<string, unknown>;
  quality?: "preview" | "final";
}

export async function POST(req: NextRequest) {
  try {
    let body: RenderRequest;
    try {
      body = (await req.json()) as RenderRequest;
    } catch {
      return NextResponse.json({ error: "body JSON inválido" }, { status: 400 });
    }
    const { videoId, props, quality = "final" } = body;
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }

    await fs.mkdir(RENDERS_DIR, { recursive: true });
    const finalOut = path.join(RENDERS_DIR, `${videoId}.mp4`);
    // Render ATÓMICO: escribimos a un temporal y renombramos al final sólo si sale OK.
    // Evita dejar un .mp4 parcial en la ruta final si el render falla o lo matan.
    const outFile = path.join(RENDERS_DIR, `${videoId}.__rendering.mp4`);
    await fs.rm(outFile, { force: true }).catch(() => {});

    let files: string[];
    try {
      files = await fs.readdir(RAW_DIR);
    } catch {
      return NextResponse.json(
        { error: `no se pudo leer RAW_DIR: ${RAW_DIR}` },
        { status: 500 }
      );
    }
    const match = files.find((f) => path.basename(f, path.extname(f)) === videoId);
    if (!match) {
      return NextResponse.json({ error: "raw video not found" }, { status: 404 });
    }

    const apiHost = process.env.VIRAL_API_HOST ?? "http://localhost:3000";
    const rawUrl = `${apiHost}/api/videos/${encodeURIComponent(videoId)}/stream?source=raw`;
    const fullProps = { ...props, rawVideoUrl: rawUrl };

    const args = [
      "remotion",
      "render",
      "src/index.ts",
      "ViralVideo",
      outFile,
      "--props",
      JSON.stringify(fullProps),
    ];
    if (quality === "preview") {
      args.push("--scale", "0.5");
    }

    const npxExe = process.platform === "win32" ? "npx.cmd" : "npx";
    const proc = spawn(npxExe, args, {
      cwd: REMOTION_DIR,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, RENDER_TIMEOUT_MS);

    const code = await new Promise<number>((resolve) => {
      proc.on("close", (c) => resolve(c ?? 1));
      proc.on("error", () => resolve(1));
    });
    clearTimeout(timer);

    if (code !== 0 || timedOut) {
      await fs.rm(outFile, { force: true }).catch(() => {});
      return NextResponse.json(
        {
          error: timedOut ? "render timeout" : "render failed",
          stderr: stderr.slice(-3000),
          stdout: stdout.slice(-2000),
        },
        { status: 500 }
      );
    }

    // Render OK → publicar atómicamente el archivo final.
    await fs.rename(outFile, finalOut);

    return NextResponse.json({
      ok: true,
      videoId,
      outPath: finalOut,
      streamUrl: `/api/videos/${videoId}/stream?source=render`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
