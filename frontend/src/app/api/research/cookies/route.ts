/**
 * Gestiona cookies.txt manuales para Instagram/TikTok (yt-dlp `--cookies <file>`).
 *
 * Storage: C:\hermes-data\cookies\{platform}.txt
 *
 * Por qué necesitamos esto: yt-dlp tiene 2 bugs conocidos en Windows con cookies
 * de browsers Chromium (Edge/Chrome/Brave):
 *   - DPAPI #10927: no puede desencriptar cookies cifradas
 *   - Lock #7271: si el browser está abierto, la DB de cookies está bloqueada
 *
 * El usuario exporta cookies con la extensión "Get cookies.txt LOCALLY" del browser,
 * las pega/sube aquí, y research_download.py las usa con `--cookies` (no falla por DPAPI).
 *
 * Endpoints:
 *   GET    /api/research/cookies              → status de cada plataforma
 *   POST   /api/research/cookies              → guardar { platform, content }
 *   DELETE /api/research/cookies?platform=X   → borrar cookies de una plataforma
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

const COOKIES_DIR = path.join(path.dirname(DATA_ROOT), "cookies");
const SUPPORTED_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

function isPlatform(p: string | null): p is SupportedPlatform {
  return p !== null && (SUPPORTED_PLATFORMS as readonly string[]).includes(p);
}

interface CookieStatus {
  platform: SupportedPlatform;
  configured: boolean;
  uploadedAt?: string;
  sizeBytes?: number;
  /** Línea típica del Netscape cookie format incluye "expiration" en epoch */
  estimatedExpiry?: string;
}

async function statusFor(platform: SupportedPlatform): Promise<CookieStatus> {
  const file = path.join(COOKIES_DIR, `${platform}.txt`);
  try {
    const stat = await fs.stat(file);
    // Intentar leer la última cookie y sacar el expiry más cercano para mostrar al usuario
    const content = await fs.readFile(file, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
    let minExpiry = Infinity;
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 5) {
        const exp = parseInt(parts[4], 10);
        if (exp > Date.now() / 1000 && exp < minExpiry) minExpiry = exp;
      }
    }
    return {
      platform,
      configured: true,
      uploadedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      estimatedExpiry:
        minExpiry !== Infinity ? new Date(minExpiry * 1000).toISOString() : undefined,
    };
  } catch {
    return { platform, configured: false };
  }
}

export async function GET() {
  const statuses = await Promise.all(SUPPORTED_PLATFORMS.map(statusFor));
  return NextResponse.json({
    cookiesDir: COOKIES_DIR,
    statuses,
  });
}

interface UploadBody {
  platform: SupportedPlatform;
  /** Contenido completo del cookies.txt (formato Netscape) */
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<UploadBody>;
    if (!body.platform || !isPlatform(body.platform)) {
      return NextResponse.json(
        { error: "platform requerido (instagram, tiktok, youtube)" },
        { status: 400 }
      );
    }
    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "content (texto del cookies.txt) requerido" }, { status: 400 });
    }
    // Validación mínima del formato Netscape
    const looksLikeNetscape =
      body.content.includes("# Netscape HTTP Cookie File") ||
      body.content.includes("# HTTP Cookie File") ||
      /^[a-z0-9._-]+\.\w+\s/im.test(body.content);
    if (!looksLikeNetscape) {
      return NextResponse.json(
        {
          error:
            "El contenido no parece un cookies.txt válido. Tiene que empezar con '# Netscape HTTP Cookie File' o líneas con dominio tab-separated.",
        },
        { status: 400 }
      );
    }

    await fs.mkdir(COOKIES_DIR, { recursive: true });
    const file = path.join(COOKIES_DIR, `${body.platform}.txt`);
    await fs.writeFile(file, body.content, "utf-8");

    const status = await statusFor(body.platform);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "platform requerido" }, { status: 400 });
  }
  const file = path.join(COOKIES_DIR, `${platform}.txt`);
  try {
    await fs.unlink(file);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "no existe" });
  }
}
