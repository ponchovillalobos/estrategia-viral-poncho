/**
 * POST /api/research/add { url }
 *
 * Valida la URL, crea un ResearchItem con status="queued", y encola un runner
 * que dispara python/research_download.py vía subprocess.
 *
 * El runner:
 *  - Marca status="downloading" al arrancar
 *  - Parsea headers ========== STEP N: ... ========== del stderr Python para mapear estados
 *  - Al terminar (exit 0): lee los JSON generados, persiste metadata + transcript, status="ready"
 *  - Si exit != 0: status="failed", lastError con últimas líneas del stderr
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PYTHON_EXE, PYTHON_DIR } from "@/lib/paths";
import {
  appendResearchLog,
  createResearch,
  RESEARCH_DIR,
  updateResearch,
  type ResearchItem,
  type ResearchPlatform,
} from "@/lib/research-store";
import { enqueue } from "@/lib/job-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min — Whisper en CPU puede tardar

interface AddBody {
  url: string;
}

function detectPlatform(url: string): ResearchPlatform | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}

/**
 * Distingue URL de POST específico vs URL de PERFIL.
 * yt-dlp NO puede descargar un perfil entero — necesita post individual.
 */
function urlKind(url: string): "post" | "profile" | "unknown" {
  const u = url.toLowerCase().replace(/\/+$/, "");
  if (u.includes("tiktok.com")) {
    return /\/(video|photo)\//.test(u) ? "post" : "profile";
  }
  if (u.includes("instagram.com")) {
    return /\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/i.test(u) ? "post" : "profile";
  }
  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return /youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/[A-Za-z0-9_-]+/i.test(u)
      ? "post"
      : "profile";
  }
  return "unknown";
}

async function processResearch(item: ResearchItem): Promise<void> {
  await updateResearch(item.id, { status: "downloading" });

  const itemDir = path.join(RESEARCH_DIR, item.id);
  await fs.mkdir(itemDir, { recursive: true });

  const args = [
    path.join(PYTHON_DIR, "research_download.py"),
    item.url,
    itemDir,
    item.id,
  ];

  return new Promise<void>((resolve) => {
    const proc = spawn(PYTHON_EXE, args, {
      cwd: PYTHON_DIR,
      shell: false,
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let finalStdout = "";
    let timedOut = false;

    // yt-dlp puede colgarse indefinidamente (red, geobloqueos, formatos raros). Sin tope,
    // bloquea el slot de la cola para siempre. 15 min es de sobra para un short/reel.
    const killTimer = setTimeout(() => {
      timedOut = true;
      try { proc.kill("SIGKILL"); } catch {}
    }, 15 * 60 * 1000);

    function handleLine(line: string) {
      // Capturar al log del item para debugging
      appendResearchLog(item.id, line).catch(() => {});

      // Detectar headers de step
      if (/STEP 1:\s*download/i.test(line)) {
        updateResearch(item.id, { status: "downloading" }).catch(() => {});
      } else if (/STEP 2:\s*transcribe/i.test(line)) {
        updateResearch(item.id, {
          status: "transcribing",
          downloadedAt: Date.now(),
        }).catch(() => {});
      } else if (/STEP 3:\s*index/i.test(line)) {
        // Solo marca cierre — el ready se setea en proc.close
      }
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stdoutBuf += text;
      finalStdout += text;
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stderrBuf += text;
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    proc.on("close", async (code) => {
      clearTimeout(killTimer);
      if (stdoutBuf.trim()) handleLine(stdoutBuf);
      if (stderrBuf.trim()) handleLine(stderrBuf);

      if (timedOut) {
        await updateResearch(item.id, {
          status: "failed",
          lastError: "Descarga abortada por timeout (15 min) — reintentá o revisá la URL.",
        });
        resolve();
        return;
      }

      if (code === 0) {
        try {
          // Parsear el JSON final del script
          const match = finalStdout.match(/\{[\s\S]*"videoPath"[\s\S]*\}/);
          if (!match) {
            throw new Error("script no emitió JSON final");
          }
          const final = JSON.parse(match[0]);

          // Leer metadata y transcript de los archivos generados
          const metadataRaw = await fs.readFile(final.metadataPath, "utf-8");
          const metadata = JSON.parse(metadataRaw);

          let transcript = null;
          try {
            const tRaw = await fs.readFile(final.transcriptPath, "utf-8");
            transcript = JSON.parse(tRaw);
          } catch {
            // sin transcript es OK — status seguirá siendo ready pero sin transcript
          }

          await updateResearch(item.id, {
            status: "ready",
            videoPath: final.videoPath,
            thumbnailPath: final.thumbnailPath || undefined,
            metadata,
            transcript: transcript ?? undefined,
            transcribedAt: Date.now(),
          });
        } catch (err) {
          await updateResearch(item.id, {
            status: "failed",
            lastError: `parse post-download: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } else {
        await updateResearch(item.id, {
          status: "failed",
          lastError: `proceso terminó con código ${code}`,
        });
      }
      resolve();
    });

    proc.on("error", async (err) => {
      clearTimeout(killTimer);
      await updateResearch(item.id, {
        status: "failed",
        lastError: `spawn error: ${err.message}`,
      });
      resolve();
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AddBody;
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "url requerida" }, { status: 400 });
    }

    const platform = detectPlatform(body.url);
    if (!platform) {
      return NextResponse.json(
        {
          error: "URL no reconocida — debe ser de TikTok, Instagram o YouTube",
        },
        { status: 400 }
      );
    }

    const kind = urlKind(body.url);
    if (kind !== "post") {
      return NextResponse.json(
        {
          error:
            "Esa URL es de un PERFIL, no de un post. Copiá la URL de un video/reel/short específico.\n" +
            "Ejemplos:\n" +
            "  · TikTok: https://www.tiktok.com/@user/video/123456...\n" +
            "  · Instagram: https://www.instagram.com/reel/Cabc.../\n" +
            "  · YouTube: https://www.youtube.com/shorts/xyz  o  https://youtu.be/xyz",
        },
        { status: 400 }
      );
    }

    const item = await createResearch({
      url: body.url,
      platform,
    });

    enqueue("research", item.id, async () => {
      await processResearch(item);
    });

    return NextResponse.json({ ok: true, itemId: item.id, item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
