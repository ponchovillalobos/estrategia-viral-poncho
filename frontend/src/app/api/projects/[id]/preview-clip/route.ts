/**
 * F4 — Preview EN MOVIMIENTO de un proyecto existente (editor manual):
 * POST {at} → renderiza 3 segundos REALES del proyecto (con todos sus FX) desde
 * ese punto, a scale 0.4, y devuelve la URL del mp4 (~30-90s). El PNG/mp4 se
 * sirve por GET /api/editor/style-preview?file= (mismo dir de previews).
 * Sin caché por tiempo: cada combinación (proyecto+mtime+segundo) es su propio file.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT, PROJECTS_DIR, REMOTION_DIR } from "@/lib/paths";
import { runProcess } from "@/lib/run-process";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PREVIEWS_DIR = path.join(DATA_ROOT, "previews");

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { at?: number };
    const at = Math.max(0, Number(body.at) || 0);

    const projectPath = path.join(PROJECTS_DIR, `${id}.json`);
    let project: { videoId?: string };
    let mtime = 0;
    try {
      const stat = await fs.stat(projectPath);
      mtime = Math.floor(stat.mtimeMs / 1000);
      project = JSON.parse(await fs.readFile(projectPath, "utf-8"));
    } catch {
      return NextResponse.json({ error: "proyecto no encontrado" }, { status: 404 });
    }
    const videoId = project.videoId || id;

    await fs.mkdir(PREVIEWS_DIR, { recursive: true });
    // El mtime en la key invalida el caché solo cuando el proyecto cambió.
    const cacheKey = safe(`clip_${id}_${mtime}_${Math.round(at)}`);
    const outMp4 = path.join(PREVIEWS_DIR, `${cacheKey}.mp4`);
    const url = `/api/editor/style-preview?file=${encodeURIComponent(`${cacheKey}.mp4`)}`;
    if (await fs.access(outMp4).then(() => true).catch(() => false)) {
      return NextResponse.json({ ok: true, url, cached: true });
    }

    const propsName = `props_preview_${cacheKey}.json`;
    const buildRun = await runProcess(
      "node",
      ["build-props.mjs", videoId, projectPath, propsName],
      REMOTION_DIR,
      undefined,
      120_000
    );
    if (!buildRun.ok) {
      return NextResponse.json(
        { error: `build-props: ${buildRun.stderr.slice(-300)}` },
        { status: 500 }
      );
    }

    const frame = Math.max(0, Math.floor(at * 30));
    const npxExe = process.platform === "win32" ? "npx.cmd" : "npx";
    const needsQuote = process.platform === "win32" && /\s/.test(outMp4);
    const outArg = needsQuote ? `"${outMp4}"` : outMp4;
    const renderRun = await runProcess(
      npxExe,
      [
        "remotion", "render", "src/index.ts", "ViralVideo",
        outArg, `--frames=${frame}-${frame + 89}`, `--props=${propsName}`,
        "--scale=0.4", "--concurrency=4", "--timeout=120000",
      ],
      REMOTION_DIR,
      undefined,
      280_000
    );
    await fs.rm(path.join(REMOTION_DIR, propsName), { force: true }).catch(() => {});

    const exists = await fs.access(outMp4).then(() => true).catch(() => false);
    if (!renderRun.ok || !exists) {
      return NextResponse.json(
        { error: `preview falló: ${renderRun.stderr.slice(-300)}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, url, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
