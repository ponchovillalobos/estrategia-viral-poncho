/**
 * POST /api/overlays/assembly { videoId, transcriptPath, duration }
 *
 * Convoca la asamblea cinematográfica: 8 agentes especialistas + closer.
 *  - Director, PacingEditor, Cinematographer, MotionDesigner, ColorGrader,
 *    SoundDesigner, VFXArtist, SubtitleEditor, Closer.
 *
 * Toma el transcript + overlays del videoId, llama python/cinematic_assembly.py
 * y devuelve el timeline consolidado listo para integrar a un project JSON
 * de Remotion.
 *
 * Tarda ~3-5 minutos (8-9 llamadas a Claude Opus en secuencia).
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import { listOverlays, updateOverlay } from "@/lib/overlays-store";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min — 8 agentes Claude opus

interface AssemblyBody {
  videoId: string;
  /** Path absoluto al transcript JSON (output de WhisperX) */
  transcriptPath: string;
  /** Duración del video en segundos */
  duration: number;
  /** Si true, aplica las decisiones VFX a los overlays (PATCH cada uno) */
  applyToOverlays?: boolean;
}

interface AssemblyResult {
  vision?: unknown;
  pacing?: unknown;
  cinematographer?: unknown;
  motion?: unknown;
  color?: unknown;
  sound?: unknown;
  vfx?: { vfxDecisions?: VfxDecision[] };
  subtitles?: unknown;
  timeline?: unknown;
  conflicts_resolved?: unknown;
  _elapsed_sec?: number;
}

interface VfxDecision {
  overlayId: string;
  startTime: number;
  endTime: number;
  effect?: string;
  motion?: string;
  transitionIn?: string;
  transitionOut?: string;
  position?: string;
  sizeRatio?: number;
}

async function runAssembly(
  transcriptPath: string,
  overlaysJsonPath: string | null,
  duration: number
): Promise<AssemblyResult> {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(PYTHON_DIR, "cinematic_assembly.py"),
      "--transcript-file", transcriptPath,
      "--duration", String(duration),
    ];
    if (overlaysJsonPath) {
      args.push("--overlays-file", overlaysJsonPath);
    }
    const proc = spawn(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
    proc.stderr.on("data", (c: Buffer) => {
      const text = c.toString("utf-8");
      stderr += text;
      // Log a la consola del server para que el dev vea progreso
      process.stdout.write(`[assembly] ${text}`);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`cinematic_assembly exit=${code} · stderr: ${stderr.slice(-400)}`));
        return;
      }
      try {
        // El script escribe varios JSON al stdout. Tomar el ÚLTIMO (el resultado completo).
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
        const lastJson = lines[lines.length - 1];
        if (!lastJson) throw new Error("no JSON en stdout");
        resolve(JSON.parse(lastJson) as AssemblyResult);
      } catch (err) {
        reject(new Error(`parse: ${err instanceof Error ? err.message : err}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AssemblyBody;
    if (!body.videoId || !body.transcriptPath || !body.duration) {
      return NextResponse.json(
        { error: "videoId, transcriptPath, duration requeridos" },
        { status: 400 }
      );
    }

    // Verificar transcript existe
    try {
      await fs.stat(body.transcriptPath);
    } catch {
      return NextResponse.json(
        { error: `transcript no encontrado: ${body.transcriptPath}` },
        { status: 404 }
      );
    }

    // Cargar overlays del videoId
    const overlays = await listOverlays(body.videoId);
    const overlaysInput = overlays.map((o) => ({
      id: o.id,
      description: o.description ?? "(sin descripción)",
      filename: o.filename,
    }));

    // Escribir overlays a archivo temporal para pasar al Python
    let overlaysJsonPath: string | null = null;
    if (overlaysInput.length > 0) {
      const tmpFile = path.join(os.tmpdir(), `overlays_${body.videoId}_${Date.now()}.json`);
      await fs.writeFile(tmpFile, JSON.stringify(overlaysInput, null, 2), "utf-8");
      overlaysJsonPath = tmpFile;
    }

    const result = await runAssembly(body.transcriptPath, overlaysJsonPath, body.duration);

    // Si applyToOverlays = true, hacer PATCH sobre cada overlay con las decisiones VFX
    if (body.applyToOverlays && result.vfx?.vfxDecisions) {
      for (const decision of result.vfx.vfxDecisions) {
        await updateOverlay(decision.overlayId, {
          startTime: decision.startTime,
          endTime: decision.endTime,
          effect: decision.effect as never,
          motion: decision.motion as never,
          transitionIn: decision.transitionIn as never,
          transitionOut: decision.transitionOut as never,
          position: decision.position as never,
          sizeRatio: decision.sizeRatio,
        });
      }
    }

    // Cleanup tmp
    if (overlaysJsonPath) {
      await fs.unlink(overlaysJsonPath).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
