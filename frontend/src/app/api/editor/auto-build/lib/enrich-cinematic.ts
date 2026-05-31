// Auto-enriquecimiento cinematográfico: cuando hay imageOverlays, genera SFX +
// camera moves + jump cuts en base a la densidad configurada (low/medium/high).
//
// - Camera moves y jump cuts: heurísticas puras en style-templates (sin I/O).
// - SFX: matcher Python determinístico (rápido, sin LLM) que lee el transcript JSON.
//
// El bloque vivía inline en route.ts; al extraerlo aquí, route.ts sólo llama
// `enrichCinematic(...)` y recibe los tres arrays opcionales.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import type { BuildContext } from "@/lib/style-templates";

export type CinematicDensity = "low" | "medium" | "high";

export interface EnrichCinematicArgs {
  density: CinematicDensity;
  imageOverlays: BuildContext["imageOverlays"];
  transcript: { duration: number; words: { word: string; start: number; end: number }[] };
  transcriptPath: string;
  videoId: string;
}

export interface EnrichCinematicResult {
  autoSfxMarks?: { at: number; sound: string; volume: number; url?: string }[];
  autoCameraMoves?: { at: number; duration: number; type: string; intensity: number }[];
  autoStutterMarks?: { at: number; duration: number }[];
}

export async function enrichCinematic(
  args: EnrichCinematicArgs
): Promise<EnrichCinematicResult> {
  const { density, imageOverlays, transcript, transcriptPath, videoId } = args;

  if (!imageOverlays || imageOverlays.length === 0) {
    return {};
  }

  const { generateCameraMoves, generateJumpCuts } = await import("@/lib/style-templates");
  const autoCameraMoves = generateCameraMoves(transcript.duration, density);
  const autoStutterMarks = generateJumpCuts(transcript.words, density);
  let autoSfxMarks: EnrichCinematicResult["autoSfxMarks"];

  // SFX matcher determinístico (rápido, sin LLM)
  try {
    const tmpSfx = path.join(os.tmpdir(), `sfx_${videoId}_${Date.now()}.json`);
    const sfxResult = await new Promise<{ sfxMarks?: typeof autoSfxMarks } | null>((resolve) => {
      const procArgs = [
        path.join(PYTHON_DIR, "match_sfx_to_transcript.py"),
        "--transcript-file", transcriptPath,
        "--duration", String(transcript.duration),
        "--density", density,
        "--out", tmpSfx,
      ];
      const proc = spawn(PYTHON_EXE, procArgs, { cwd: PYTHON_DIR, shell: false });
      let stdout = "";
      proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
      proc.stderr.on("data", (c: Buffer) =>
        process.stdout.write(`[sfx-matcher] ${c.toString("utf-8")}`)
      );
      proc.on("close", async () => {
        await fs.unlink(tmpSfx).catch(() => {});
        try {
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
          const last = lines[lines.length - 1];
          resolve(last ? JSON.parse(last) : null);
        } catch {
          resolve(null);
        }
      });
      proc.on("error", () => resolve(null));
    });
    if (sfxResult?.sfxMarks) {
      autoSfxMarks = sfxResult.sfxMarks;
      console.log(`[auto-build] SFX matcher: ${autoSfxMarks.length} marks density=${density}`);
    }
  } catch (err) {
    console.error("[auto-build] sfx matcher falló:", err);
  }

  return { autoSfxMarks, autoCameraMoves, autoStutterMarks };
}
