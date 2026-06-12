import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RENDERS_DIR, LF_RENDERS } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Copia el archivo de video del render al portapapeles del SO.
 * En Windows usa `Set-Clipboard -Path` de PowerShell → TikTok lo recibe con Ctrl+V
 * directamente en el file picker o en la zona de drop. Mucho más rápido que arrastrar.
 *
 * En macOS/Linux: no implementado (fallback a 400).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let source: "short" | "long_form" = "short";
  try {
    const body = await req.json();
    if (body?.source === "long_form") source = "long_form";
  } catch {
    // no body
  }

  const baseDir = source === "long_form" ? LF_RENDERS : RENDERS_DIR;
  const filePath = path.join(baseDir, `${id}.mp4`);
  const resolved = path.resolve(filePath);
  const baseResolved = path.resolve(baseDir);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await fs.access(resolved);
  } catch {
    return NextResponse.json(
      { error: `El video generado ya no existe (${path.basename(resolved)}). Genéralo de nuevo.` },
      { status: 404 }
    );
  }

  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "Solo Windows soportado por ahora (usa Set-Clipboard de PowerShell)" },
      { status: 501 }
    );
  }

  // PowerShell command. Escapamos comillas dobles dentro del path por las dudas
  // (Windows en general no las permite en nombres de archivo).
  const psCmd = `Set-Clipboard -Path "${resolved.replace(/"/g, "")}"`;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", psCmd],
      { shell: false }
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell rc=${code}: ${stderr.slice(0, 400)}`));
    });
    proc.on("error", (err) => reject(err));
  });

  return NextResponse.json({ ok: true, path: resolved });
}
