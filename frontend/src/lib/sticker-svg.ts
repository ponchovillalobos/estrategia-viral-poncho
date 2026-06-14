/**
 * Embebe el markup SVG de los icon-stickers "ph:<n>"/"tb:<n>" (Phosphor/Tabler) que
 * el usuario eligió de la GALERÍA (Ola 1). Espejo de remotion/editorial-icons.mjs
 * (resolveIconStickerSvg), para la ruta /api/videos/render que NO pasa por
 * build-props.mjs y por lo tanto no recibe el SVG ya embebido.
 *
 * El SVG va en `iconSvg`; IconStickerLayer lo dibuja con currentColor. Si el pack no
 * está descargado o el nombre no existe, se deja el sticker como vino → el render cae
 * al FallbackIcon de Lucide (nunca rompe).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";

const PACKS: Record<string, { dir: string; file: (n: string) => string }> = {
  "ph:": { dir: "phosphor-duotone", file: (n) => `${n}-duotone.svg` },
  "tb:": { dir: "tabler", file: (n) => `${n}.svg` },
};

async function readIconSvg(icon: string): Promise<string> {
  const prefix = icon.startsWith("ph:") ? "ph:" : icon.startsWith("tb:") ? "tb:" : null;
  if (!prefix) return "";
  const pack = PACKS[prefix];
  const p = path.join(DATA_ROOT, "assets", "icons", pack.dir, pack.file(icon.slice(prefix.length)));
  try {
    const raw = await fs.readFile(p, "utf-8");
    return raw
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<svg([^>]*?)>/, (_m, attrs: string) => {
        const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, "");
        return `<svg${cleaned} width="100%" height="100%">`;
      })
      .trim();
  } catch {
    return "";
  }
}

/** Devuelve una copia de los stickers con `iconSvg` embebido donde aplique. */
export async function embedIconStickerSvgs(stickers: unknown): Promise<unknown> {
  if (!Array.isArray(stickers)) return stickers;
  return Promise.all(
    stickers.map(async (s) => {
      const icon = (s && typeof s === "object" && "icon" in s ? String((s as { icon: unknown }).icon) : "") || "";
      if (!icon.startsWith("ph:") && !icon.startsWith("tb:")) return s;
      const svg = await readIconSvg(icon);
      return svg ? { ...(s as object), iconSvg: svg } : s;
    })
  );
}
