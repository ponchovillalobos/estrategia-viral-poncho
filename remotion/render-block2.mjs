import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// OffthreadVideo cache (PARTE B): ~35% de la RAM para evitar "cache pruned" con
// b-roll/mirror/clone. Flag exacto: --offthreadvideo-cache-size-in-bytes.
function offthreadCacheBytes() {
  const thirtyFive = Math.floor(os.totalmem() * 0.35);
  return Math.max(512 * 1024 * 1024, Math.min(thirtyFive, 6 * 1024 * 1024 * 1024));
}
const OFFTHREAD_CACHE_FLAG = `--offthreadvideo-cache-size-in-bytes=${offthreadCacheBytes()}`;

const JOBS = [
  "D06_vendedor_toxico",
  "D07_manipular_vs_persuadir",
  "D08_objetivo_reuniones",
  "D09_ia_que_te_rete",
  "D10_prospectar_diario",
  "D11_generar_prospectos",
  "D12_capacitacion_continua",
].map((vid) => ({ videoId: vid, project: `${vid}_hype_sfx` }));

import { existsSync as _existsSync } from "node:fs";
function pickDataRoot() {
  const o = process.env.VIRAL_DATA_ROOT;
  if (o) return o;
  for (const c of ["C:\\viral-data\\videos", "C:\\hermes-data\\videos"]) {
    if (_existsSync(c)) return c;
  }
  return "C:\\viral-data\\videos";
}
const DATA_ROOT = pickDataRoot();
const PROJECTS_DIR = path.join(DATA_ROOT, "projects");
const RENDERS_DIR = path.join(DATA_ROOT, "renders");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: __dirname, shell: process.platform === "win32", ...opts });
    proc.stdout.on("data", (d) => process.stdout.write(d.toString()));
    proc.stderr.on("data", (d) => process.stderr.write(d.toString()));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on("error", reject);
  });
}

async function main() {
  const summary = [];
  for (const job of JOBS) {
    const projectPath = path.join(PROJECTS_DIR, `${job.project}.json`);
    if (!existsSync(projectPath)) {
      console.log(`[skip] no existe ${projectPath}`);
      continue;
    }
    const outPath = path.join(RENDERS_DIR, `${job.project}.mp4`);
    console.log(`\n========== ${job.project} ==========`);
    const t0 = Date.now();
    try {
      await run("node", ["build-props.mjs", job.videoId, projectPath]);
      await run("npx.cmd", [
        "remotion",
        "render",
        "src/index.ts",
        "ViralVideo",
        outPath,
        "--props=props.json",
        OFFTHREAD_CACHE_FLAG,
      ]);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      summary.push({ project: job.project, status: "ok", elapsed });
      console.log(`[ok] ${job.project} en ${elapsed}s`);
    } catch (err) {
      summary.push({ project: job.project, status: "fail", error: String(err) });
      console.log(`[fail] ${job.project}: ${err}`);
    }
  }
  console.log("\n========== SUMMARY ==========");
  for (const s of summary) console.log(JSON.stringify(s));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
