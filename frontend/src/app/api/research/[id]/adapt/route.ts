/**
 * POST /api/research/[id]/adapt
 *
 * Toma el transcript del item, lo pasa a python/adapt_script.py vía stdin,
 * captura el JSON output, y persiste { adaptedScript, adaptedHook, suggestedHashtags,
 * structureAnalysis, originalAngle, adaptedAngle, adaptedBeats } en el item.
 *
 * NO encolamos — la adaptación es síncrona (~15-40s con Claude Opus) y el usuario
 * espera el resultado en el modal. El job-queue serial sería overhead innecesario.
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import path from "node:path";
import { getResearch, updateResearch } from "@/lib/research-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max

interface AdaptBeat {
  label: string;
  function?: string;
  text: string;
  source?: string;
}

interface AdaptSource {
  claim: string;
  source: string;
  confidence: string;
}

interface AdaptedResult {
  adaptedScript: string;
  hook: string;
  suggestedHashtags: string[];
  beats?: AdaptBeat[];
  sources?: AdaptSource[];
  structureAnalysis?: string;
  originalAngle?: string;
  adaptedAngle?: string;
  _provider?: string;
  _model?: string;
}

interface Ctx {
  params: Promise<{ id: string }>;
}

function transcriptToText(item: { transcript?: { words?: { word: string }[] } }): string {
  const words = item.transcript?.words ?? [];
  return words.map((w) => w.word).join(" ").trim();
}

export async function runAdapt(transcript: string): Promise<AdaptedResult> {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(PYTHON_DIR, "adapt_script.py"),
      "--transcript-stdin",
      "--provider",
      "auto",
    ];
    const proc = spawn(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`adapt_script exit=${code} · ${stderr.slice(-400)}`));
        return;
      }
      try {
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
        const lastJsonLine = [...lines].reverse().find((l) => l.trim().startsWith("{"));
        if (!lastJsonLine) throw new Error("no JSON en stdout");
        const parsed = JSON.parse(lastJsonLine) as AdaptedResult;
        resolve(parsed);
      } catch (err) {
        reject(new Error(`parse adapt output: ${err instanceof Error ? err.message : err}`));
      }
    });

    proc.on("error", (err) => reject(err));
    proc.stdin.write(transcript, "utf-8");
    proc.stdin.end();
  });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const item = await getResearch(id);
    if (!item) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

    const transcript = transcriptToText(item);
    if (!transcript) {
      return NextResponse.json(
        { error: "el item no tiene transcript todavía (status: " + item.status + ")" },
        { status: 400 }
      );
    }

    const result = await runAdapt(transcript);
    await updateResearch(id, {
      adaptedScript: result.adaptedScript,
      adaptedHook: result.hook,
      suggestedHashtags: result.suggestedHashtags,
      structureAnalysis: result.structureAnalysis,
      originalAngle: result.originalAngle,
      adaptedAngle: result.adaptedAngle,
      adaptedBeats: result.beats,
      adaptedSources: result.sources,
      adaptedAt: Date.now(),
    });

    return NextResponse.json({
      ok: true,
      adaptedScript: result.adaptedScript,
      hook: result.hook,
      suggestedHashtags: result.suggestedHashtags,
      beats: result.beats ?? [],
      structureAnalysis: result.structureAnalysis,
      originalAngle: result.originalAngle,
      adaptedAngle: result.adaptedAngle,
      provider: result._provider,
      model: result._model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
