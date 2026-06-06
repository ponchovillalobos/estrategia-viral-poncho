import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, RENDERS_DIR, LF_ROOT, LF_RENDERS } from "@/lib/paths";

export const dynamic = "force-dynamic";

const LF_PROJECTS_DIR = path.join(LF_ROOT, "projects");

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

/**
 * Borra un proyecto de Producción ("Mis videos") por completo: su JSON (sea short o
 * largo) Y el video renderizado en disco. Así el short desaparece de la galería y no
 * deja el archivo colgado. No toca el video raw fuente (eso es el botón del editor).
 */
async function rmIfExists(p: string): Promise<boolean> {
  // OJO: fs.rm con force:true NO falla si el archivo no existe, así que no sirve para
  // detectar si borró algo. Verificamos existencia primero (stat) y reportamos si borró.
  try {
    await fs.stat(p);
  } catch {
    return false; // no existe
  }
  try {
    await fs.rm(p, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let removed = false;

  // 1) JSON del proyecto (short o largo).
  for (const dir of [PROJECTS_DIR, LF_PROJECTS_DIR]) {
    if (await rmIfExists(path.join(dir, `${id}.json`))) removed = true;
  }

  // 2) Render de short: renders/{id}.mp4.
  await rmIfExists(path.join(RENDERS_DIR, `${id}.mp4`));

  // 3) Render(s) de largo: long_form/renders/{id}*.mp4 (llevan sufijo de estilo).
  try {
    const lfRenders = await fs.readdir(LF_RENDERS);
    for (const f of lfRenders) {
      if (f === `${id}.mp4` || f.startsWith(`${id}_`) || f.startsWith(`${id}.`)) {
        await rmIfExists(path.join(LF_RENDERS, f));
      }
    }
  } catch {
    /* carpeta inexistente */
  }

  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
