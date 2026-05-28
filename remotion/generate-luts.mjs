/**
 * Generador de LUTs 3D (.cube) profesionales — recetas de color tipo CapCut/cine.
 *
 * Escribe archivos .cube en remotion/public/luts/. Son LUTs REALES (lookup 3D),
 * que ffmpeg aplica con el filtro `lut3d` en el paso post-render de auto-build.
 * Esto da un grade de color que las CSS filters no pueden (split-toning por luma,
 * mapeo por canal), manteniendo todo headless.
 *
 * Uso:  node generate-luts.mjs
 *
 * Extensible: cualquier .cube que dejes en public/luts (p.ej. packs comerciales
 * IWLTBAP) queda disponible automáticamente — el sistema referencia por filename.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "public", "luts");
const SIZE = 33; // estándar de la industria

// ───────────────────────── helpers de color ────────────────────────────────
const clamp = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Contraste S-curve suave centrado en 0.5. k>0 = más contraste. */
function sCurve(v, k) {
  if (k === 0) return clamp(v);
  return clamp(0.5 + (Math.tanh((v - 0.5) * k) / Math.tanh(k * 0.5)) * 0.5);
}

function saturate(rgb, s) {
  const l = luma(rgb[0], rgb[1], rgb[2]);
  return [clamp(l + (rgb[0] - l) * s), clamp(l + (rgb[1] - l) * s), clamp(l + (rgb[2] - l) * s)];
}

/** Split-toning: tinta sombras hacia shadowTint y luces hacia highTint según luma. */
function splitTone(rgb, shadowTint, highTint, strength) {
  const l = luma(rgb[0], rgb[1], rgb[2]);
  const sw = clamp(1 - l * 1.5); // peso de sombras
  const hw = clamp((l - 0.45) * 1.6); // peso de luces
  return [
    clamp(rgb[0] + (shadowTint[0] - 0.5) * strength * sw + (highTint[0] - 0.5) * strength * hw),
    clamp(rgb[1] + (shadowTint[1] - 0.5) * strength * sw + (highTint[1] - 0.5) * strength * hw),
    clamp(rgb[2] + (shadowTint[2] - 0.5) * strength * sw + (highTint[2] - 0.5) * strength * hw),
  ];
}

function liftGammaGain(v, lift, gain) {
  return clamp(Math.pow(clamp(v * gain + lift), 1));
}

// ───────────────────────── recetas (grades) ────────────────────────────────
const GRADES = {
  // Hollywood blockbuster: sombras teal, luces naranja, contraste alto.
  teal_orange: (r, g, b) => {
    let c = [sCurve(r, 1.3), sCurve(g, 1.3), sCurve(b, 1.3)];
    c = splitTone(c, [0.0, 0.5, 0.55], [1.0, 0.62, 0.18], 0.16);
    return saturate(c, 1.12);
  },
  // Kodak cálido: piel dorada, negros con algo de calor, saturación suave.
  kodak_warm: (r, g, b) => {
    let c = [sCurve(r, 0.9), sCurve(g, 0.85), sCurve(b, 0.8)];
    c = splitTone(c, [0.55, 0.5, 0.42], [1.0, 0.92, 0.7], 0.12);
    c = [liftGammaGain(c[0], 0.02, 1.02), liftGammaGain(c[1], 0.01, 1.0), liftGammaGain(c[2], -0.01, 0.97)];
    return saturate(c, 1.05);
  },
  // Bleach bypass: alto contraste, casi desaturado, frío (thriller).
  bleach_bypass: (r, g, b) => {
    let c = [sCurve(r, 1.7), sCurve(g, 1.7), sCurve(b, 1.75)];
    c = splitTone(c, [0.45, 0.5, 0.6], [0.9, 0.95, 1.0], 0.08);
    return saturate(c, 0.45);
  },
  // Cyberpunk: magenta/cian, saturación alta, negros aplastados.
  cyberpunk: (r, g, b) => {
    let c = [sCurve(r, 1.4), sCurve(g, 1.2), sCurve(b, 1.5)];
    c = splitTone(c, [0.35, 0.4, 0.75], [1.0, 0.45, 0.95], 0.2);
    c = [liftGammaGain(c[0], -0.02, 1.05), liftGammaGain(c[1], -0.03, 1.0), liftGammaGain(c[2], 0.0, 1.05)];
    return saturate(c, 1.3);
  },
  // Vintage film: desvaído, negros levantados, cálido, contraste bajo.
  vintage_film: (r, g, b) => {
    let c = [sCurve(r, 0.7), sCurve(g, 0.7), sCurve(b, 0.65)];
    c = [liftGammaGain(c[0], 0.06, 0.92), liftGammaGain(c[1], 0.05, 0.92), liftGammaGain(c[2], 0.04, 0.9)];
    c = splitTone(c, [0.55, 0.5, 0.45], [0.95, 0.9, 0.78], 0.1);
    return saturate(c, 0.85);
  },
  // Noir: casi B&N con tinte azul frío en sombras.
  noir: (r, g, b) => {
    let c = [sCurve(r, 1.5), sCurve(g, 1.5), sCurve(b, 1.5)];
    const desat = saturate(c, 0.12);
    return splitTone(desat, [0.42, 0.46, 0.58], [0.95, 0.96, 1.0], 0.06);
  },
};

function buildCube(name, grade) {
  const lines = [];
  lines.push(`TITLE "${name}"`);
  lines.push(`LUT_3D_SIZE ${SIZE}`);
  lines.push("DOMAIN_MIN 0.0 0.0 0.0");
  lines.push("DOMAIN_MAX 1.0 1.0 1.0");
  // Orden .cube: el componente ROJO varía más rápido (loop interno).
  for (let bi = 0; bi < SIZE; bi++) {
    for (let gi = 0; gi < SIZE; gi++) {
      for (let ri = 0; ri < SIZE; ri++) {
        const r = ri / (SIZE - 1);
        const g = gi / (SIZE - 1);
        const b = bi / (SIZE - 1);
        const [R, G, B] = grade(r, g, b);
        lines.push(`${R.toFixed(6)} ${G.toFixed(6)} ${B.toFixed(6)}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const [name, grade] of Object.entries(GRADES)) {
    const content = buildCube(name, grade);
    const file = path.join(OUT_DIR, `${name}.cube`);
    await fs.writeFile(file, content, "utf-8");
    console.log(`✓ ${name}.cube (${SIZE}^3 = ${SIZE ** 3} entradas)`);
  }
  console.log(`\nListo. ${Object.keys(GRADES).length} LUTs en ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
