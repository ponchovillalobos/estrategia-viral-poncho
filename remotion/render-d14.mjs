import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pickDataRoot() {
  const o = process.env.VIRAL_DATA_ROOT;
  if (o) return o;
  for (const c of ["C:\\viral-data\\videos", "C:\\hermes-data\\videos"]) {
    if (existsSync(c)) return c;
  }
  return "C:\\viral-data\\videos";
}

const DATA_ROOT = pickDataRoot();
const JOBS = [
  { videoId: "D14_C0013", project: "D14_C0013_punch" },
  { videoId: "D14_C0013", project: "D14_C0013_hype_max" },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: __dirname, shell: process.platform === "win32" });
    proc.stdout.on("data", (d) => process.stdout.write(d.toString()));
    proc.stderr.on("data", (d) => process.stderr.write(d.toString()));
    proc.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}`))));
    proc.on("error", reject);
  });
}

async function main() {
  const summary = [];
  for (const job of JOBS) {
    const projectPath = path.join(DATA_ROOT, "projects", `${job.project}.json`);
    const outPath = path.join(DATA_ROOT, "renders", `${job.project}.mp4`);
    console.log(`\n========== ${job.project} ==========`);
    const t0 = Date.now();
    try {
      await run("node", ["build-props.mjs", job.videoId, projectPath]);
      await run("npx.cmd", ["remotion", "render", "src/index.ts", "ViralVideo", outPath, "--props=props.json"]);
      summary.push({ project: job.project, status: "ok", elapsed: ((Date.now() - t0) / 1000).toFixed(1), out: outPath });
      console.log(`[ok] ${job.project}`);
    } catch (err) {
      summary.push({ project: job.project, status: "fail", error: String(err) });
      console.log(`[fail] ${job.project}: ${err}`);
    }
  }
  console.log("\n========== SUMMARY ==========");
  for (const s of summary) console.log(JSON.stringify(s));
}

main();
