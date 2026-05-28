/**
 * POST /api/editor/test-ab — dispara 3 renders comparativos del mismo video
 * con perfiles distintos de densidad cinematográfica.
 *
 * Body:
 *   videoId: string
 *   style:   StyleId (ej: "hype_max_sfx") — mismo estilo en los 3
 *   overlayIds: string[] (las mismas imágenes en los 3)
 *
 * Cada render se encola SERIAL (no paralelo, CPU pesado) con el sufijo
 * `_test_A.mp4`, `_test_B.mp4`, `_test_C.mp4`:
 *
 *   A (suave):  density="low"   → 3 camera moves, 4-8 SFX, 0 jumps
 *   B (medio):  density="medium" → 6 camera moves, 6-12 SFX, 3 jumps
 *   C (intenso): density="high" → 10 camera moves, 10-18 SFX, 6 jumps
 *
 * Devuelve los 3 jobIds + paths esperados. Total ~15-20 min en cola serial.
 *
 * GET /api/editor/test-ab — devuelve estado de los tests activos.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 min

interface TestAbBody {
  videoId: string;
  style: string;
  overlayIds: string[];
  /** Override opcional del aspect ratio. Default 9:16. */
  aspectRatio?: "9:16" | "16:9";
  /** Color de acento. Default rosa. */
  accentColor?: string;
}

interface TestProfile {
  label: "A" | "B" | "C";
  density: "low" | "medium" | "high";
  description: string;
}

const PROFILES: TestProfile[] = [
  { label: "A", density: "low", description: "Suave · 3 camera moves · 4-8 SFX · sin jumps" },
  { label: "B", density: "medium", description: "Medio · 6 camera moves · 6-12 SFX · 3 jumps" },
  { label: "C", density: "high", description: "Intenso · 10 camera moves · 10-18 SFX · 6 jumps" },
];

declare global {
  // eslint-disable-next-line no-var
  var __test_ab_runs__: TestAbBatch[] | undefined;
}

interface TestAbBatch {
  batchId: string;
  videoId: string;
  style: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "done" | "failed";
  results: { label: "A" | "B" | "C"; jobId: string; outputPath: string; ok?: boolean }[];
}

function getBatches(): TestAbBatch[] {
  if (!globalThis.__test_ab_runs__) globalThis.__test_ab_runs__ = [];
  return globalThis.__test_ab_runs__;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TestAbBody;
    if (!body.videoId || !body.style || !Array.isArray(body.overlayIds) || body.overlayIds.length === 0) {
      return NextResponse.json(
        { error: "videoId, style y overlayIds[] requeridos" },
        { status: 400 }
      );
    }

    const batchId = `tab_${Date.now().toString(36)}`;
    const batch: TestAbBatch = {
      batchId,
      videoId: body.videoId,
      style: body.style,
      startedAt: Date.now(),
      status: "running",
      results: [],
    };
    getBatches().push(batch);

    // Disparar las 3 corridas en secuencia (NO paralelo — CPU pesado)
    // En background con fire-and-forget. El user puede pollear /api/editor/test-ab para progreso.
    (async () => {
      for (const profile of PROFILES) {
        try {
          const res = await fetch("http://localhost:3000/api/editor/auto-build", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoIds: [body.videoId],
              styles: [body.style],
              accentColor: body.accentColor ?? "#fb7185",
              platforms: ["tiktok", "instagram"],
              aspectRatio: body.aspectRatio ?? "9:16",
              // Sufijo único por perfil → archivos _test_A.mp4 / _B.mp4 / _C.mp4
              projectIdSuffix: `_test_${profile.label}`,
              cinematic: {
                overlayIds: body.overlayIds,
                density: profile.density,
                filmGrain: true,
                vignette: true,
                subtitleCinematic: true,
              },
            }),
          });
          const data = await res.json();
          if (data.jobIds && data.jobIds.length > 0) {
            batch.results.push({
              label: profile.label,
              jobId: data.jobIds[0],
              outputPath: `${body.videoId}_${body.style}_test_${profile.label}.mp4`,
              ok: true,
            });
          } else {
            batch.results.push({
              label: profile.label,
              jobId: "",
              outputPath: "",
              ok: false,
            });
          }

          // Esperar a que ese job termine antes de arrancar el siguiente
          if (data.jobIds && data.jobIds[0]) {
            await waitForJob(data.jobIds[0]);
          }
        } catch (err) {
          console.error(`[test-ab] perfil ${profile.label} falló:`, err);
          batch.results.push({
            label: profile.label,
            jobId: "",
            outputPath: "",
            ok: false,
          });
        }
      }
      batch.status = "done";
      batch.finishedAt = Date.now();
    })();

    return NextResponse.json({
      ok: true,
      batchId,
      profiles: PROFILES,
      message: "3 renders encolados en serie. ~15-20 min total.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ batches: getBatches() });
}

async function waitForJob(jobId: string, maxWaitMs: number = 15 * 60 * 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await fetch(`http://localhost:3000/api/editor/progress?jobId=${jobId}`);
      const d = await r.json();
      // BUG FIX: el endpoint devuelve {job: {status}} (anidado), no {status} directo
      const status = d?.job?.status ?? d?.status;
      if (status === "done" || status === "failed") return;
    } catch {
      // sigue intentando
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
