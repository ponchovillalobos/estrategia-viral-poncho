import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runPython } from "@/lib/run-python";
import { RAW_DIR, TRANSCRIPTS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { videoId?: string };
  const videoId = body.videoId;
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const files = await fs.readdir(RAW_DIR);
  const match = files.find(
    (f) => path.basename(f, path.extname(f)) === videoId
  );
  if (!match) {
    return NextResponse.json({ error: "video not found in raw/" }, { status: 404 });
  }

  const videoPath = path.join(RAW_DIR, match);
  const result = await runPython("transcribe.py", [videoPath]);

  if (!result.ok) {
    return NextResponse.json(
      { error: "transcribe failed", stderr: result.stderr.slice(-2000) },
      { status: 500 }
    );
  }

  const outPath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);
  let transcript: unknown = null;
  try {
    transcript = JSON.parse(await fs.readFile(outPath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "transcript file not written" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, videoId, transcript });
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }
  const outPath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);
  try {
    const data = JSON.parse(await fs.readFile(outPath, "utf-8"));
    return NextResponse.json({ ok: true, videoId, transcript: data });
  } catch {
    return NextResponse.json({ error: "transcript not found" }, { status: 404 });
  }
}
