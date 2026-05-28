import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, LF_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const LF_PROJECTS_DIR = path.join(LF_ROOT, "projects");

async function readProjectsFromDir(dir: string, source: "short" | "long_form") {
  try {
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    const projects = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(dir, f), "utf-8");
            const data = JSON.parse(raw);
            // El nombre de archivo es la fuente de verdad del `id`: el endpoint
            // [id]/route.ts resuelve `${id}.json` y los renders se escriben como
            // `${id}.mp4`. Algunos JSON (renders test A/B/C) guardaron un `id`
            // interno sin el sufijo `_test_X`, lo que (a) colisionaba en React
            // como key duplicada, (b) rompía los lookups por-proyecto con 404, y
            // (c) hacía que el preview de B/C cayera por prefix-match al de A.
            // Derivar del filename garantiza un id único y consistente con disco.
            const id = path.basename(f, ".json");
            return { ...data, id, source };
          } catch {
            return null;
          }
        })
    );
    return projects.filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [shorts, longClips] = await Promise.all([
      readProjectsFromDir(PROJECTS_DIR, "short"),
      readProjectsFromDir(LF_PROJECTS_DIR, "long_form"),
    ]);
    const projects = [...shorts, ...longClips];
    projects.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
