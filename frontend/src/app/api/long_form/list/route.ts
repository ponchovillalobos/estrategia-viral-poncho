/**
 * Lista los videos largos disponibles en LF_RAW + indica qué pasos están hechos
 * para cada uno (transcribe, clean, proposals, clips) — útil para el wizard.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LF_RAW, LF_CLEAN, LF_CLIPS, LF_RENDERS } from "@/lib/paths";
import { LF_TRANSCRIPTS, LF_PROPOSALS } from "@/lib/paths-long-form";
import { maybeSweepOrphans } from "@/lib/orphan-sweep";

export const dynamic = "force-dynamic";

interface RawVideoEntry {
  videoId: string;
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
  hasTranscript: boolean;
  hasClean: boolean;
  hasProposals: boolean;
  clipsExtracted: number;
  rendersAvailable: number;
}

async function listFilesSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export async function GET() {
  await fs.mkdir(LF_RAW, { recursive: true });
  // Limpieza periódica (throttle 12h): poda derivados de videos que ya no existen.
  maybeSweepOrphans();

  const rawFiles = await listFilesSafe(LF_RAW);
  const videoExts = [".mp4", ".mov", ".mkv", ".webm", ".m4v"];
  const rawVideos = rawFiles.filter((f) => videoExts.includes(path.extname(f).toLowerCase()));

  const [transcripts, cleanFiles, proposals, clips, renders] = await Promise.all([
    listFilesSafe(LF_TRANSCRIPTS),
    listFilesSafe(LF_CLEAN),
    listFilesSafe(LF_PROPOSALS),
    listFilesSafe(LF_CLIPS),
    listFilesSafe(LF_RENDERS),
  ]);

  const entries: RawVideoEntry[] = await Promise.all(
    rawVideos.map(async (filename) => {
      const videoId = path.basename(filename, path.extname(filename));
      const stat = await fs.stat(path.join(LF_RAW, filename));
      return {
        videoId,
        filename,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        hasTranscript: transcripts.includes(`${videoId}.json`),
        hasClean: cleanFiles.some((f) => f.startsWith(`${videoId}_clean`)),
        hasProposals: proposals.includes(`${videoId}.json`),
        clipsExtracted: clips.filter((f) => f.startsWith(`${videoId}_c`)).length,
        rendersAvailable: renders.filter((f) => f.startsWith(`${videoId}_c`) && f.endsWith(".mp4")).length,
      };
    })
  );

  // Si el usuario borró el video de la carpeta, NO lo resucitamos: desaparece del
  // portal al instante. Los derivados huérfanos los limpia maybeSweepOrphans() arriba.
  return NextResponse.json({
    rawDir: LF_RAW,
    videos: entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    orphans: [],
  });
}
