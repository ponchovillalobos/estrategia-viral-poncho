import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RENDERS_DIR, LF_RENDERS, PROJECTS_DIR, LF_ROOT } from "@/lib/paths";
import { uploadVideoToTikTok, type PrivacyLevel } from "@/lib/tiktok-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const LF_PROJECTS_DIR = path.join(LF_ROOT, "projects");

interface UploadRequest {
  projectId: string;
  source?: "short" | "long_form";
  mode?: "direct" | "inbox";
  privacyLevel?: PrivacyLevel;
  /** Override del título. Si no se da, usa el caption del proyecto. */
  title?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as UploadRequest;
    const { projectId, source = "short", mode = "direct" } = body;
    if (!projectId) {
      return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
    }

    const rendersBase = source === "long_form" ? LF_RENDERS : RENDERS_DIR;
    const projectsBase = source === "long_form" ? LF_PROJECTS_DIR : PROJECTS_DIR;

    const filePath = path.join(rendersBase, `${projectId}.mp4`);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(rendersBase) + path.sep)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    try {
      await fs.access(resolved);
    } catch {
      return NextResponse.json({ error: `Render no existe: ${resolved}` }, { status: 404 });
    }

    // Tomar caption del proyecto (si no se override)
    let title = body.title ?? "";
    if (!title) {
      try {
        const proj = JSON.parse(
          await fs.readFile(path.join(projectsBase, `${projectId}.json`), "utf-8")
        );
        title = proj.caption ?? "";
      } catch {
        // sin caption — TikTok rechaza title vacío en Direct, dejamos cadena vacía y que el error sea explícito
      }
    }

    const result = await uploadVideoToTikTok({
      filePath: resolved,
      title,
      mode,
      privacyLevel: body.privacyLevel,
      disableComment: body.disableComment,
      disableDuet: body.disableDuet,
      disableStitch: body.disableStitch,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
