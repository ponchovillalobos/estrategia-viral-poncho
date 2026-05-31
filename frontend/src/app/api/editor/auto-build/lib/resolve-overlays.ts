// Resolver de imageOverlays: dado una lista de overlayIds (modo cinematográfico),
// carga los overlays del store y les asigna timestamps cuando faltan.
//
// Pipeline:
//   1) Matcher determinístico (Python, rápido, sin LLM) busca palabras del prompt
//      en el transcript y aplica timestamps a los matches exactos/fuzzy.
//   2) Si TODOS los overlays quedaron con timestamps tras el matcher → terminamos.
//   3) Si quedan sin matchear → convocar "asamblea LLM" (cinematic_assembly.py)
//      que decide timestamps + efectos + motion + transiciones para los faltantes.
//      Si la asamblea procesa parcial (N de M), distribuye los restantes en los
//      slots libres del timeline.
//   4) Si el bloque completo tira, fallback de seguridad: distribución uniforme.
//
// El bloque vivía inline en route.ts (~290 líneas). Misma semántica: preserva
// los inline spawns y la estrategia de fallback.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PYTHON_DIR, PYTHON_EXE } from "@/lib/paths";
import type { BuildContext } from "@/lib/style-templates";

export interface ResolveOverlaysArgs {
  overlayIds: string[];
  transcriptPath: string;
  transcriptDuration: number;
  videoId: string;
}

/**
 * Devuelve los overlays listos para el ctx (con timestamps), o undefined si la lista
 * de entrada era vacía/inválida.
 */
export async function resolveImageOverlays(
  args: ResolveOverlaysArgs
): Promise<BuildContext["imageOverlays"]> {
  const { overlayIds, transcriptPath, transcriptDuration, videoId } = args;
  if (!overlayIds || overlayIds.length === 0) return undefined;

  const { getOverlay, updateOverlay } = await import("@/lib/overlays-store");

  let overlays = await Promise.all(overlayIds.map((id: string) => getOverlay(id)));

  const overlaysWithoutTimestamps = overlays.filter(
    (o) => o !== null && (o.startTime == null || o.endTime == null)
  );

  if (overlaysWithoutTimestamps.length > 0) {
    console.log(
      `[auto-build] ${overlaysWithoutTimestamps.length}/${overlays.length} overlays sin timestamps → matcher determinístico`
    );
    try {
      // ─── PASO 1: matcher determinístico (rápido, sin LLM) ───
      try {
        const matcherInput = overlays
          .filter((o): o is NonNullable<typeof o> => o !== null)
          .map((o) => ({
            id: o.id,
            description: o.description ?? "",
            filename: o.filename,
            userOrder: o.userOrder ?? null,
          }));
        const matcherTmpFile = path.join(
          os.tmpdir(),
          `matcher_${videoId}_${Date.now()}.json`
        );
        await fs.writeFile(matcherTmpFile, JSON.stringify(matcherInput), "utf-8");

        const matcherResult = await new Promise<{
          matches: {
            overlayId: string;
            startTime: number | null;
            endTime: number | null;
            matchedWord?: string;
            matchedKeyword?: string;
            confidence: string;
            tier: string;
            reason?: string;
          }[];
          stats: Record<string, number>;
        } | null>((resolve) => {
          const procArgs = [
            path.join(PYTHON_DIR, "match_overlays_to_transcript.py"),
            "--transcript-file", transcriptPath,
            "--overlays-file", matcherTmpFile,
          ];
          const proc = spawn(PYTHON_EXE, procArgs, { cwd: PYTHON_DIR, shell: false });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
          proc.stderr.on("data", (c: Buffer) => {
            stderr += c.toString("utf-8");
            process.stdout.write(`[matcher] ${c.toString("utf-8")}`);
          });
          proc.on("close", async (code) => {
            await fs.unlink(matcherTmpFile).catch(() => {});
            if (code !== 0) {
              console.error(`[matcher] exit=${code}: ${stderr.slice(-200)}`);
              resolve(null);
              return;
            }
            try {
              const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
              const lastJson = lines[lines.length - 1];
              if (!lastJson) throw new Error("no JSON");
              resolve(JSON.parse(lastJson));
            } catch (err) {
              console.error(`[matcher] parse: ${err}`);
              resolve(null);
            }
          });
          proc.on("error", () => resolve(null));
        });

        if (matcherResult && matcherResult.matches) {
          for (const m of matcherResult.matches) {
            if (m.startTime == null || m.endTime == null) continue;
            await updateOverlay(m.overlayId, {
              startTime: m.startTime,
              endTime: m.endTime,
              effect: "memory_flash",
              motion: "ken_burns_in",
              transitionIn: "fade",
              transitionOut: "fade",
              position: "center",
              sizeRatio: 1.0,
            });
          }
          console.log(
            `[matcher] aplicó ${matcherResult.matches.length} matches: ` +
              `exact=${matcherResult.stats.exact ?? 0} ` +
              `fuzzy=${matcherResult.stats.fuzzy ?? 0} ` +
              `fallback=${matcherResult.stats.fallback ?? 0}`
          );
          overlays = await Promise.all(overlayIds.map((id: string) => getOverlay(id)));
        }
      } catch (matcherErr) {
        console.error("[matcher] falló, intento asamblea LLM:", matcherErr);
      }

      // ─── PASO 2: chequear si todos los overlays ya tienen timestamps ───
      const stillMissing = overlays.filter(
        (o) => o !== null && (o.startTime == null || o.endTime == null)
      );
      if (stillMissing.length === 0) {
        console.log(
          `[auto-build] matcher cubrió los ${overlays.length} overlays — saltando asamblea LLM (ahorra ~3-5 min)`
        );
      } else {
        console.log(
          `[auto-build] ${stillMissing.length} overlays sin matchear → convocando asamblea LLM`
        );

        // ─── PASO 3: asamblea LLM ───
        const overlaysInput = overlays
          .filter((o): o is NonNullable<typeof o> => o !== null)
          .sort((a, b) => {
            const ao = a.userOrder ?? 999;
            const bo = b.userOrder ?? 999;
            return ao - bo;
          })
          .map((o) => ({
            id: o.id,
            description: o.description ?? "(sin descripción)",
            filename: o.filename,
            userOrder: o.userOrder ?? null,
          }));
        const tmpFile = path.join(os.tmpdir(), `assembly_${videoId}_${Date.now()}.json`);
        await fs.writeFile(tmpFile, JSON.stringify(overlaysInput, null, 2), "utf-8");

        await new Promise<void>((resolve, reject) => {
          const procArgs = [
            path.join(PYTHON_DIR, "cinematic_assembly.py"),
            "--transcript-file", transcriptPath,
            "--duration", String(transcriptDuration),
            "--overlays-file", tmpFile,
          ];
          const proc = spawn(PYTHON_EXE, procArgs, { cwd: PYTHON_DIR, shell: false });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
          proc.stderr.on("data", (c: Buffer) => {
            stderr += c.toString("utf-8");
            process.stdout.write(`[assembly auto] ${c.toString("utf-8")}`);
          });
          proc.on("close", async (code) => {
            await fs.unlink(tmpFile).catch(() => {});
            if (code !== 0) {
              reject(new Error(`assembly exit=${code}: ${stderr.slice(-300)}`));
              return;
            }
            try {
              const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
              const lastJson = lines[lines.length - 1];
              if (!lastJson) throw new Error("no JSON output");
              const result = JSON.parse(lastJson);
              const vfxDecisions = result?.vfx?.vfxDecisions || [];
              // 1) Aplicar las decisiones que sí trajo el agente
              const decidedIds = new Set<string>();
              for (const dec of vfxDecisions) {
                decidedIds.add(dec.overlayId);
                await updateOverlay(dec.overlayId, {
                  startTime: dec.startTime,
                  endTime: dec.endTime,
                  effect: dec.effect,
                  motion: dec.motion,
                  transitionIn: dec.transitionIn,
                  transitionOut: dec.transitionOut,
                  position: dec.position,
                  sizeRatio: dec.sizeRatio,
                });
              }

              // 2) Si el agente VFX devolvió PARCIAL, distribuir uniformemente los
              //    que quedaron sin timestamps respetando su userOrder.
              const missing = overlaysInput.filter((o) => !decidedIds.has(o.id));
              if (missing.length > 0) {
                console.log(
                  `[auto-build] asamblea procesó ${vfxDecisions.length}/${overlaysInput.length} overlays; fallback para los ${missing.length} restantes`
                );
                const decidedSorted = vfxDecisions
                  .map((d: { startTime?: number; endTime?: number }) => ({
                    start: Number(d.startTime ?? 0),
                    end: Number(d.endTime ?? 0),
                  }))
                  .sort((a: { start: number }, b: { start: number }) => a.start - b.start);
                const dur = transcriptDuration;
                let cursor = 1;
                const slots: number[] = [];
                for (const block of decidedSorted) {
                  if (block.start - cursor >= 5) {
                    slots.push((cursor + block.start) / 2);
                  }
                  cursor = Math.max(cursor, block.end + 0.5);
                }
                if (dur - cursor >= 5) slots.push((cursor + dur - 2) / 2);
                for (let i = 0; i < missing.length; i++) {
                  const m = missing[i];
                  const startTime =
                    slots[i] !== undefined
                      ? slots[i]
                      : Math.min(dur - 4, 5 + i * Math.max(4, (dur - 10) / missing.length));
                  const endTime = Math.min(startTime + 4, dur - 0.5);
                  await updateOverlay(m.id, {
                    startTime: +startTime.toFixed(1),
                    endTime: +endTime.toFixed(1),
                    effect: "memory_flash",
                    motion: "ken_burns_in",
                    transitionIn: "fade",
                    transitionOut: "fade",
                    position: "center",
                    sizeRatio: 1.0,
                  });
                }
              }

              console.log(
                `[auto-build] asamblea aplicó ${vfxDecisions.length}/${overlaysInput.length} decisiones VFX (resto: fallback uniforme)`
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          });
          proc.on("error", reject);
        });

        // Recargar overlays con los timestamps actualizados
        overlays = await Promise.all(overlayIds.map((id: string) => getOverlay(id)));
      }
    } catch (err) {
      console.error(`[auto-build] asamblea automática falló:`, err);
      // Fallback de red de seguridad: distribución uniforme.
      const validOverlays = overlays.filter((o): o is NonNullable<typeof o> => o !== null);
      const slice = transcriptDuration / Math.max(1, validOverlays.length);
      for (let i = 0; i < validOverlays.length; i++) {
        const o = validOverlays[i];
        if (o.startTime != null) continue;
        const startTime = +(i * slice + 1).toFixed(1);
        const endTime = +(Math.min(startTime + 4, transcriptDuration - 1)).toFixed(1);
        await updateOverlay(o.id, { startTime, endTime });
      }
      overlays = await Promise.all(overlayIds.map((id: string) => getOverlay(id)));
    }
  }

  return overlays
    .filter((o): o is NonNullable<typeof o> => o !== null && o.startTime != null && o.endTime != null)
    .map((o) => ({
      id: o.id,
      url: `/api/overlays/${o.id}/image`,
      startTime: o.startTime as number,
      endTime: o.endTime as number,
      effect: o.effect,
      motion: o.motion,
      transitionIn: o.transitionIn,
      transitionOut: o.transitionOut,
      position: o.position,
      sizeRatio: o.sizeRatio,
    }));
}
