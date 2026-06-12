import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { REMOTION_DIR, RENDERS_DIR, RAW_DIR } from "@/lib/paths";
import { humanizeError } from "@/lib/humanize-error";
import { canRender, registerRender } from "@/lib/license";
import {
  acquireRenderLock,
  releaseRenderLock,
  sweepOrphanLocks,
  remotionConcurrency,
  renameWithRetry,
  REMOTION_DELAY_TIMEOUT_MS,
} from "@/lib/render-utils";

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
    // PRUEBA GRATUITA — gate: si la prueba terminó y no hay licencia, no se
    // generan más videos. Esta ruta recibe props directos (no pasa por los
    // builders .mjs), así que la marca de agua también se inyecta aquí abajo.
    const lic = canRender();
    if (!lic.allowed) {
      return NextResponse.json({ error: lic.reason }, { status: 403 });
    }

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

    // Locks huérfanos de una sesión anterior (app cerrada a mitad de render):
    // se barren una vez por boot, antes del primer acquire.
    await sweepOrphanLocks();

    // Lock por video: dos renders simultáneos del mismo id corromperían el temporal.
    if (!(await acquireRenderLock(videoId))) {
      return NextResponse.json(
        {
          error:
            "Este video ya se está generando en este momento. Espera a que termine (mira el panel de tareas abajo a la derecha) y reintenta.",
        },
        { status: 409 }
      );
    }

    try {
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
          {
            error:
              "No se pudo abrir tu carpeta de videos. Revisa que exista y que Windows no la esté bloqueando.",
            technical: `no se pudo leer RAW_DIR: ${RAW_DIR}`,
          },
          { status: 500 }
        );
      }
      const match = files.find((f) => path.basename(f, path.extname(f)) === videoId);
      if (!match) {
        return NextResponse.json(
          {
            error:
              "No se encontró el video original. Puede que lo hayas movido o borrado de tu carpeta de videos; vuelve a subirlo e intenta de nuevo.",
            technical: `raw video not found: ${videoId} en ${RAW_DIR}`,
          },
          { status: 404 }
        );
      }

      const apiHost = process.env.VIRAL_API_HOST ?? "http://localhost:3000";
      const rawUrl = `${apiHost}/api/videos/${encodeURIComponent(videoId)}/stream?source=raw`;
      const fullProps: Record<string, unknown> = { ...props, rawVideoUrl: rawUrl };
      // La música llega como URL RELATIVA desde el editor (el cliente no sabe en
      // qué puerto corre el server: la app instalada usa 3100+, no 3000). Aquí la
      // absolutizamos con el mismo host que el video. Si llega absoluta (props
      // viejos / proyectos guardados), se respeta tal cual.
      if (typeof fullProps.musicUrl === "string" && fullProps.musicUrl.startsWith("/")) {
        fullProps.musicUrl = `${apiHost}${fullProps.musicUrl}`;
      }
      // PRUEBA GRATUITA — esta ruta no pasa por build-props.mjs, así que la
      // marca de agua se inyecta directo en los props del render.
      if (lic.watermark) {
        fullProps.trialWatermark = true;
      }

      const args = [
        "remotion",
        "render",
        "src/index.ts",
        "ViralVideo",
        outFile,
        "--concurrency",
        String(remotionConcurrency()),
        `--timeout=${REMOTION_DELAY_TIMEOUT_MS}`,
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
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
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
        // Nada de "render failed" crudo: el stderr pasa por humanizeError y el
        // usuario recibe un mensaje accionable; lo técnico va aparte.
        const raw = `${stderr}\n${stdout}`.trim();
        const human = humanizeError(
          timedOut ? `TIMEOUT: la generación superó el tope de 25 minutos.\n${raw}` : raw,
          timedOut
            ? "La generación tardó demasiado y se canceló. Intenta de nuevo, o prueba primero con calidad Preview."
            : "No se pudo generar el video. Intenta de nuevo; si vuelve a pasar, prueba con calidad Preview o reinicia la app."
        );
        return NextResponse.json(
          { error: human.message, technical: human.technical },
          { status: 500 }
        );
      }

      // Render OK → publicar atómicamente el archivo final (con retry ante locks
      // transitorios de OneDrive/antivirus sobre el archivo).
      await renameWithRetry(outFile, finalOut);

      // PRUEBA GRATUITA — contar 1 video generado con éxito (solo afecta el
      // tope de la prueba; con licencia activa no descuenta nada).
      registerRender();

      return NextResponse.json({
        ok: true,
        videoId,
        outPath: finalOut,
        streamUrl: `/api/videos/${videoId}/stream?source=render`,
      });
    } finally {
      await releaseRenderLock(videoId);
    }
  } catch (err) {
    const human = humanizeError(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: human.message, technical: human.technical },
      { status: 500 }
    );
  }
}
