import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RENDERS_DIR, LF_RENDERS } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Abre el render del proyecto en el explorador de archivos del SO con el archivo seleccionado.
 * Sirve para el flujo "subir a TikTok manual" — el usuario arrastra el archivo a tiktok.com/upload.
 *
 * Body opcional: { source?: "short" | "long_form" }  (default: "short")
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
    // no body, default short
  }

  const baseDir = source === "long_form" ? LF_RENDERS : RENDERS_DIR;
  const filePath = path.join(baseDir, `${id}.mp4`);

  // Path traversal protection: el path resuelto debe estar dentro del dir base.
  const resolved = path.resolve(filePath);
  const baseResolved = path.resolve(baseDir);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await fs.access(resolved);
  } catch {
    return NextResponse.json(
      { error: `Render no existe: ${resolved}` },
      { status: 404 }
    );
  }

  // Abrir en el file manager nativo con el archivo seleccionado.
  // No await — es fire-and-forget; si falla, igual devolvemos OK con el path.
  if (process.platform === "win32") {
    // explorer /select,"path" → abre Explorer con el archivo highlighted
    exec(`explorer /select,"${resolved}"`, () => {});
  } else if (process.platform === "darwin") {
    exec(`open -R "${resolved}"`, () => {});
  } else {
    // Linux: no hay "reveal in file manager" estándar, abrimos la carpeta contenedora
    exec(`xdg-open "${path.dirname(resolved)}"`, () => {});
  }

  return NextResponse.json({ ok: true, path: resolved });
}
