import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROJECTS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface ProjectPayload {
  id: string;
  videoId: string;
  day?: number | null;
  platforms: string[];
  caption?: string;
  status: "borrador" | "aprobado" | "publicado";
  subtitleStyle?: "bebas" | "anton";
  subtitleColor?: string;
  subtitleHighlight?: string;
  musicTrack?: string | null;
  musicVolume?: number;
  bRoll?: Array<{ start: number; end: number; url: string; thumbnail?: string }>;
  animations?: Array<{ at: number; type: "zoom" | "glow" | "shake" }>;
  manualSubtitles?: Array<{ word: string; start: number; end: number }>;
  trim?: { start: number; end: number } | null;
  updatedAt?: string;
}

async function loadProject(id: string): Promise<ProjectPayload | null> {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as ProjectPayload;
  } catch {
    return null;
  }
}

async function saveProject(id: string, data: ProjectPayload): Promise<void> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  data.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(PROJECTS_DIR, `${id}.json`),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as Partial<ProjectPayload>;
  const existing = (await loadProject(id)) ?? {
    id,
    videoId: id,
    platforms: [],
    status: "borrador" as const,
  };
  const merged: ProjectPayload = { ...existing, ...body, id, videoId: existing.videoId };
  await saveProject(id, merged);
  return NextResponse.json(merged);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await fs.unlink(path.join(PROJECTS_DIR, `${id}.json`));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
