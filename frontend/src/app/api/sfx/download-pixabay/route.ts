/**
 * POST /api/sfx/download-pixabay { kind: "sfx"|"music"|"both" }
 *
 * Llama python/pixabay_client.py download-pack con la API key del user
 * (guardada en user-settings.json). Descarga el pack pre-curado a:
 *   - SFX:    C:\hermes-data\videos\assets\sfx\curated\pixabay\
 *   - Música: C:\hermes-data\videos\assets\music\pixabay\
 *
 * Tarda ~30-60s para los dos packs (~28 archivos × 0.6s rate limit).
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { PYTHON_EXE, PYTHON_DIR, SFX_DIR, MUSIC_DIR } from "@/lib/paths";
import { readSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

interface DownloadBody {
  kind: "sfx" | "music" | "both";
}

interface PackResult {
  ok: boolean;
  kind: string;
  out_dir: string;
  downloaded: number;
  skipped: number;
  failed: number;
  error?: string;
}

async function downloadPack(apiKey: string, kind: "sfx" | "music"): Promise<PackResult> {
  const outDir =
    kind === "sfx"
      ? path.join(SFX_DIR, "pixabay")
      : path.join(MUSIC_DIR, "pixabay");

  return new Promise((resolve) => {
    const args = [
      path.join(PYTHON_DIR, "pixabay_client.py"),
      "download-pack",
      "--key", apiKey,
      "--type", kind,
      "--out-dir", outDir,
    ];
    const proc = spawn(PYTHON_EXE, args, { cwd: PYTHON_DIR, shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
    proc.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf-8");
      process.stdout.write(`[pixabay ${kind}] ${c.toString("utf-8")}`);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          kind,
          out_dir: outDir,
          downloaded: 0,
          skipped: 0,
          failed: 0,
          error: `exit ${code}: ${stderr.slice(-300)}`,
        });
        return;
      }
      try {
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
        const last = lines[lines.length - 1];
        if (!last) {
          resolve({
            ok: false,
            kind,
            out_dir: outDir,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            error: "no JSON output",
          });
          return;
        }
        const parsed = JSON.parse(last);
        resolve(parsed);
      } catch (err) {
        resolve({
          ok: false,
          kind,
          out_dir: outDir,
          downloaded: 0,
          skipped: 0,
          failed: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    proc.on("error", (err) => {
      resolve({
        ok: false,
        kind,
        out_dir: outDir,
        downloaded: 0,
        skipped: 0,
        failed: 0,
        error: err.message,
      });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const settings = await readSettings();
    const apiKey = settings.pixabay?.apiKey;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Pixabay API key no configurada. Ve a Configuración y pega tu key (gratis en pixabay.com).",
        },
        { status: 400 }
      );
    }

    const results: PackResult[] = [];
    const kindsToProcess =
      body.kind === "both" ? (["sfx", "music"] as const) : [body.kind];

    // Procesar en secuencia (no en paralelo, para respetar rate limit Pixabay)
    for (const kind of kindsToProcess) {
      const result = await downloadPack(apiKey, kind);
      results.push(result);
    }

    const totalDownloaded = results.reduce((acc, r) => acc + (r.downloaded || 0), 0);
    const totalFailed = results.reduce((acc, r) => acc + (r.failed || 0), 0);

    return NextResponse.json({
      ok: results.every((r) => r.ok),
      totalDownloaded,
      totalFailed,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
