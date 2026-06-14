/**
 * Test de PARIDAD de las PLANTILLAS DE HOOK entre shorts y largos.
 *
 * Las plantillas viven duplicadas (igual que los estilos):
 *   - .mjs (builders Remotion): remotion/hook-templates.mjs
 *   - .ts  (frontend/UI):       frontend/src/lib/hook-templates.ts
 *
 * Compara, por plantilla:
 *   1. que el id exista en ambos
 *   2. los campos load-bearing del render: headline.text, headline.effect,
 *      sticker.value, sfx (los que cambian lo que se ve/oye).
 *
 * Uso:  node check-hook-parity.mjs   → exit 0 si hay paridad, 1 si diverge.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_TEMPLATES } from "./hook-templates.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_PATH = path.join(__dirname, "..", "frontend", "src", "lib", "hook-templates.ts");
const ts = readFileSync(TS_PATH, "utf-8");

/** Extrae bloques `<id>: { ... },` balanceando llaves, desde el objeto HOOK_TEMPLATES. */
function extractTsBlocks(src) {
  // Recortar a partir de "HOOK_TEMPLATES: Record<...> = {" para no agarrar otros objetos.
  const startIdx = src.indexOf("HOOK_TEMPLATES");
  const region = startIdx >= 0 ? src.slice(startIdx) : src;
  const blocks = {};
  // EXACTAMENTE 2 espacios + no-espacio: agarra sólo las claves top-level de
  // HOOK_TEMPLATES (los campos anidados como `headline:` van a 4 espacios).
  const re = /^ {2}(?! )([a-z_][\w]*):\s*\{/gm;
  let m;
  while ((m = re.exec(region)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < region.length && depth > 0) {
      if (region[i] === "{") depth++;
      else if (region[i] === "}") depth--;
      i++;
    }
    const body = region.slice(re.lastIndex, i - 1);
    // Las plantillas reales abarcan VARIAS líneas; descartar bloques de una sola
    // línea (p.ej. el campo `headline: { ... }` de la interface HookTemplate).
    if (body.includes("\n")) blocks[m[1]] = body;
  }
  return blocks;
}

function field(body, key) {
  const m = body.match(new RegExp(`${key}:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

const tsBlocks = extractTsBlocks(ts);
const mjsIds = Object.keys(HOOK_TEMPLATES);
const tsIds = Object.keys(tsBlocks);

let problems = 0;
const report = [];

for (const id of mjsIds) {
  if (!tsBlocks[id]) {
    report.push(`  ✗ ${id}: existe en .mjs pero FALTA en .ts`);
    problems++;
  }
}
for (const id of tsIds) {
  if (!HOOK_TEMPLATES[id]) {
    report.push(`  ✗ ${id}: existe en .ts pero FALTA en .mjs`);
    problems++;
  }
}

for (const id of mjsIds) {
  if (!tsBlocks[id]) continue;
  const tpl = HOOK_TEMPLATES[id];
  const body = tsBlocks[id];
  const checks = [
    ["headline.text", tpl.headline.text, field(body, "text")],
    ["headline.effect", tpl.headline.effect, field(body, "effect")],
    ["sticker.value", tpl.sticker?.value ?? null, field(body, "value")],
    ["sfx", tpl.sfx ?? null, field(body, "sfx")],
  ];
  for (const [name, mjsVal, tsVal] of checks) {
    if (mjsVal !== tsVal) {
      report.push(`  ✗ ${id}: ${name} difiere → .mjs="${mjsVal}" vs .ts="${tsVal}"`);
      problems++;
    }
  }
}

console.log(`Paridad de plantillas de hook shorts(.ts) ↔ largos(.mjs)`);
console.log(`  hooks .mjs: ${mjsIds.length} · .ts: ${tsIds.length}`);
for (const line of report) console.log(line);

if (problems > 0) {
  console.error(`\n✗ ${problems} divergencia(s). Sincronizá hook-templates.mjs ↔ hook-templates.ts.`);
  process.exit(1);
}
console.log(`\n✓ Paridad de hooks OK (${mjsIds.length} plantillas).`);
