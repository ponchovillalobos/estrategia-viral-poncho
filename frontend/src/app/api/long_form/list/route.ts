/**
 * Lista los videos largos disponibles en LF_RAW + indica qué pasos están hechos
 * para cada uno (transcribe, clean, proposals, clips) — útil para el wizard.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LF_RAW, LF_CLEAN, LF_CLIPS, LF_RENDERS } from "@/lib/paths";
import { LF_TRANSCRIPTS, LF_PROPOSALS } from "@/lib/paths-long-form";

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

  // Además, "videos que solo tienen clips/proposals pero no raw" (raw borrado tras procesar)
  // se incluyen como entries fantasma para que el usuario sepa que existen
  const orphanIds = new Set<string>();
  for (const c of clips) {
    const m = c.match(/^([A-Za-z0-9_-]+)_c\d+/);
    if (m && !rawVideos.some((rv) => rv.startsWith(m[1]))) {
      orphanIds.add(m[1]);
    }
  }
  const orphans: RawVideoEntry[] = Array.from(orphanIds).map((videoId) => ({
    videoId,
    filename: "(raw eliminado)",
    sizeBytes: 0,
    modifiedAt: "",
    hasTranscript: transcripts.includes(`${videoId}.json`),
    hasClean: cleanFiles.some((f) => f.startsWith(`${videoId}_clean`)),
    hasProposals: proposals.includes(`${videoId}.json`),
    clipsExtracted: clips.filter((f) => f.startsWith(`${videoId}_c`)).length,
    rendersAvailable: renders.filter((f) => f.startsWith(`${videoId}_c`) && f.endsWith(".mp4")).length,
  }));

  return NextResponse.json({
    rawDir: LF_RAW,
    videos: entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    orphans,
  });
}
