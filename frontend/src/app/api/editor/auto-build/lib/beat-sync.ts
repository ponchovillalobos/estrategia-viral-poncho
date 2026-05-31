// Beat-sync: "cortar al ritmo". Detecta beats del track de música con detect_beats.py
// y agrega zoomMarks + flashes (transitions) + reaction-zoom punches en los más fuertes.
//
// Pre-condiciones:
//   - project.beatSync === true
//   - project.musicTrack es una URL con ?file=<filename>
//   - el archivo de música existe en MUSIC_DIR
//   - el estilo NO tiene jump cuts (broll_*), para que los tiempos del beat no se
//     desfasen del remapeo de build-props.
//
// Mutación: agrega elementos a project.zoomMarks / proTransitions / reactionZooms.
// Si algo falla o no se cumple alguna pre-condición, sale sin tocar nada.

import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR, PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import { runProcess } from "@/lib/run-process";
import type { ResolvedProject } from "./types";

export async function applyBeatSync(
  project: ResolvedProject,
  transcriptDuration: number
): Promise<void> {
  const beatSyncOn = project.beatSync === true;
  const musicTrack = project.musicTrack;
  if (!beatSyncOn || !musicTrack || project.enableJumpCuts) return;

  try {
    const fileParam = new URL(musicTrack, "http://x").searchParams.get("file");
    const musicPath = fileParam ? path.join(MUSIC_DIR, fileParam) : null;
    const musicExists = musicPath
      ? await fs.access(musicPath).then(() => true).catch(() => false)
      : false;
    if (!musicPath || !musicExists) return;

    const beatRun = await runProcess(
      PYTHON_EXE,
      [path.join(PYTHON_DIR, "detect_beats.py"), musicPath],
      PYTHON_DIR,
      undefined,
      90_000
    );
    if (!beatRun.ok) return;

    const line = beatRun.stdout
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("{"))
      .pop();
    const parsed = line
      ? (JSON.parse(line) as { beats?: { t: number; strength: number }[] })
      : null;
    const beats = (parsed?.beats ?? []).filter(
      (b) => b.t > 0.5 && b.t < transcriptDuration - 0.3
    );
    const top = beats
      .slice()
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 12)
      .sort((a, b) => a.t - b.t);
    const beatZooms = top.map((b) => ({ at: +b.t.toFixed(2), duration: 0.4, scale: 1.12 }));
    const beatTrans = top
      .filter((_, i) => i % 2 === 0)
      .map((b) => ({
        at: +b.t.toFixed(2),
        kind: "flash" as const,
        durationFrames: 5,
        color: "#ffffff",
      }));
    // A7 — "cortar al ritmo": en los 5 beats MÁS fuertes, un reaction-zoom punch
    // (golpe rápido de cámara) para que se sienta un corte al beat, no solo brillo.
    const beatPunches = top
      .slice()
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((b) => ({ at: +b.t.toFixed(2), intensity: 1.18, duration: 0.22 }));
    project.zoomMarks = [...(project.zoomMarks ?? []), ...beatZooms];
    project.proTransitions = [...(project.proTransitions ?? []), ...beatTrans];
    project.reactionZooms = [...(project.reactionZooms ?? []), ...beatPunches];
    console.log(
      `[auto-build] beat-sync: ${top.length} beats → zooms+flashes+${beatPunches.length} punches`
    );
  } catch (err) {
    console.warn("[auto-build] beat-sync falló:", err);
  }
}
