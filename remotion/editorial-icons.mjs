/**
 * Resolver de iconos editoriales EXTERNOS (Ola 4): los nombres con prefijo
 * "ph:" (Phosphor duotone, 1,512) o "tb:" (Tabler outline, 5,093) se resuelven
 * en BUILD-time leyendo el SVG de {DATA_ROOT}/assets/icons/ y embebiendo el
 * markup en card.iconSvg (los SVG usan currentColor → el render los pinta con
 * el acento del tema). Cero red en render; si el pack no está descargado
 * (python/download_editorial_icons.py), cae al ícono Lucide del pool.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function pickDataRoot() {
  const o = process.env.VIRAL_DATA_ROOT;
  if (o && existsSync(o)) return o;
  for (const c of ["C:\\viral-data\\videos", "C:\\hermes-data\\videos"]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const PACKS = {
  "ph:": { dir: "phosphor-duotone", file: (n) => `${n}-duotone.svg` },
  "tb:": { dir: "tabler", file: (n) => `${n}.svg` },
};

/** Muta las cards: agrega iconSvg a las que usan iconos externos. */
export function resolveEditorialCardIcons(cards) {
  if (!Array.isArray(cards)) return cards;
  const root = pickDataRoot();
  for (const card of cards) {
    const icon = (card && card.icon) || "";
    const prefix = icon.startsWith("ph:") ? "ph:" : icon.startsWith("tb:") ? "tb:" : null;
    if (!prefix) continue;
    const pack = PACKS[prefix];
    const p = root && path.join(root, "assets", "icons", pack.dir, pack.file(icon.slice(prefix.length)));
    try {
      let svg = readFileSync(p, "utf-8");
      svg = svg
        // comentario de metadata de Tabler fuera (peso muerto en props)
        .replace(/<!--[\s\S]*?-->/g, "")
        // el tag raíz se estira al contenedor (el render fija el tamaño)
        .replace(/<svg([^>]*?)>/, (m, attrs) => {
          const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, "");
          return `<svg${cleaned} width="100%" height="100%">`;
        })
        .trim();
      card.iconSvg = svg;
    } catch {
      // Pack no descargado o nombre inexistente → sin icono externo; el render
      // intentará Lucide y, si tampoco, la tarjeta sale sin ilustración.
      card.icon = "";
    }
  }
  return cards;
}
