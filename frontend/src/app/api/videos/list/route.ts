import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  RAW_DIR,
  FFPROBE_EXE,
  TRANSCRIPTS_DIR,
  CUTS_DIR,
  RENDERS_DIR,
  PROJECTS_DIR,
} from "@/lib/paths";

export const dynamic = "force-dynamic";

const USED_DIR = path.join(RAW_DIR, "used");

interface VideoEntry {
  id: string;
  filename: string;
  sizeMb: number;
  modified: string;
  durationSec: number | null;
  archived: boolean;
  status: {
    transcribed: boolean;
    cuts: boolean;
    rendered: boolean;
    projectExists: boolean;
  };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_EXE, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    let settled = false;
    const done = (v: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    // Sin timeout, un archivo corrupto/bloqueado que cuelga ffprobe colgaría TODA la
    // lista de videos (este probe se await-ea dentro de Promise.all). 10s es de sobra.
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      done(null);
    }, 10_000);
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => done(null));
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      done(Number.isFinite(n) ? +n.toFixed(2) : null);
    });
  });
}

async function entriesFromDir(dir: string, archived: boolean): Promise<VideoEntry[]> {
  try {
    await fs.access(dir);
  } catch {
    return [];
  }
  const files = await fs.readdir(dir);
  const mp4 = files.filter(
    (f) => /\.(mp4|mov|mkv|webm)$/i.test(f) && !f.endsWith("_cut.mp4")
  );

  return Promise.all(
    mp4.map(async (filename) => {
      const filePath = path.join(dir, filename);
      const stat = await fs.stat(filePath);
      const id = path.basename(filename, path.extname(filename));
      const durationSec = await probeDuration(filePath);

      const [transcribed, cuts, rendered, projectExists] = await Promise.all([
        exists(path.join(TRANSCRIPTS_DIR, `${id}.json`)),
        exists(path.join(CUTS_DIR, `${id}.json`)),
        exists(path.join(RENDERS_DIR, `${id}.mp4`)),
        exists(path.join(PROJECTS_DIR, `${id}.json`)),
      ]);

      return {
        id,
        filename,
        sizeMb: +(stat.size / (1024 * 1024)).toFixed(1),
        modified: stat.mtime.toISOString(),
        durationSec,
        archived,
        status: { transcribed, cuts, rendered, projectExists },
      };
    })
  );
}

export async function GET(req: NextRequest) {
  try {
    await fs.mkdir(RAW_DIR, { recursive: true });
    const includeArchived = req.nextUrl.searchParams.get("archived") === "true";

    const active = await entriesFromDir(RAW_DIR, false);
    const archived = includeArchived ? await entriesFromDir(USED_DIR, true) : [];

    const all = [...active, ...archived];
    all.sort((a, b) => b.modified.localeCompare(a.modified));
    return NextResponse.json(
      {
        videos: all,
        activeCount: active.length,
        archivedCount: archived.length,
        rawDir: RAW_DIR,
      },
      // Sin caché: el navegador SIEMPRE pide la lista fresca. Si no, podía mostrar
      // videos ya borrados hasta que venciera el caché heurístico del browser.
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
