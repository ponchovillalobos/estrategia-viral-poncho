import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RAW_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const USED_DIR = path.join(RAW_DIR, "used");

/**
 * POST mueve raw/{id}.mp4 + {id}_cut.mp4 (si existe) a raw/used/
 * DELETE devuelve archivado de used/ a raw/ (unarchive)
 */
async function findFiles(dir: string, videoId: string) {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  return files.filter((f) => {
    const base = path.basename(f, path.extname(f));
    return base === videoId || base === `${videoId}_cut`;
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await fs.mkdir(USED_DIR, { recursive: true });

  const matches = await findFiles(RAW_DIR, id);
  if (matches.length === 0) {
    return NextResponse.json({ error: "video no encontrado" }, { status: 404 });
  }

  const moved: string[] = [];
  for (const f of matches) {
    const src = path.join(RAW_DIR, f);
    const dst = path.join(USED_DIR, f);
    try {
      await fs.rename(src, dst);
      moved.push(f);
    } catch (err) {
      return NextResponse.json(
        { error: `error moviendo ${f}`, detail: String(err) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, archived: moved });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matches = await findFiles(USED_DIR, id);
  if (matches.length === 0) {
    return NextResponse.json({ error: "video no está archivado" }, { status: 404 });
  }
  const restored: string[] = [];
  for (const f of matches) {
    await fs.rename(path.join(USED_DIR, f), path.join(RAW_DIR, f));
    restored.push(f);
  }
  return NextResponse.json({ ok: true, restored });
}
