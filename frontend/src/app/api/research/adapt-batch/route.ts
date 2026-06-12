/**
 * POST /api/research/adapt-batch
 *   - body: { itemIds?: string[] }  (si vacío, toma todos los ready sin adapt)
 *   - Procesa items secuencialmente con adapt_script.py
 *   - Devuelve INMEDIATAMENTE con batchId; el procesamiento continúa en background
 *
 * GET /api/research/adapt-batch
 *   - Devuelve el estado actual del batch
 *
 * DELETE /api/research/adapt-batch
 *   - Cancela el batch activo (no mata el proc actual, pero detiene la cola)
 */
import { NextRequest, NextResponse } from "next/server";
import { getResearch, listResearch, updateResearch } from "@/lib/research-store";
import { runAdapt } from "@/app/api/research/[id]/adapt/route";
import {
  getBatch,
  setBatch,
  isBatchActive,
  type AdaptBatchProgress,
} from "@/lib/adapt-batch-store";

export const dynamic = "force-dynamic";

interface AdaptBatchBody {
  /** Si vacío o ausente, procesa TODOS los items ready sin adapt todavía */
  itemIds?: string[];
  /** Si true, vuelve a adaptar items que ya tienen adaptedScript (sobreescribe) */
  reAdaptExisting?: boolean;
}

async function processBatch(batchId: string, itemIds: string[]): Promise<void> {
  for (const itemId of itemIds) {
    const b = getBatch();
    if (!b || b.batchId !== batchId || b.status !== "running") {
      // batch cancelado o sobreescrito
      return;
    }
    b.currentItemId = itemId;
    setBatch({ ...b });

    try {
      const item = await getResearch(itemId);
      if (!item || item.status !== "ready") {
        const updated = getBatch();
        if (updated && updated.batchId === batchId) {
          updated.failed += 1;
          updated.done += 1;
          updated.errors.push({ itemId, error: "item no encontrado o sin transcript" });
          setBatch({ ...updated });
        }
        continue;
      }
      const transcript = (item.transcript?.words ?? []).map((w) => w.word).join(" ").trim();
      if (!transcript) {
        const updated = getBatch();
        if (updated && updated.batchId === batchId) {
          updated.failed += 1;
          updated.done += 1;
          updated.errors.push({ itemId, error: "sin transcript" });
          setBatch({ ...updated });
        }
        continue;
      }

      const result = await runAdapt(transcript);
      await updateResearch(itemId, {
        adaptedScript: result.adaptedScript,
        adaptedHook: result.hook,
        suggestedHashtags: result.suggestedHashtags,
        structureAnalysis: result.structureAnalysis,
        originalAngle: result.originalAngle,
        adaptedAngle: result.adaptedAngle,
        adaptedBeats: result.beats,
        adaptedSources: result.sources,
        adaptedAt: Date.now(),
      });

      const updated = getBatch();
      if (updated && updated.batchId === batchId) {
        updated.success += 1;
        updated.done += 1;
        setBatch({ ...updated });
      }
    } catch (err) {
      const updated = getBatch();
      if (updated && updated.batchId === batchId) {
        updated.failed += 1;
        updated.done += 1;
        updated.errors.push({
          itemId,
          error: err instanceof Error ? err.message : String(err),
        });
        setBatch({ ...updated });
      }
    }
  }

  // Cierre
  const final = getBatch();
  if (final && final.batchId === batchId) {
    final.currentItemId = null;
    final.status = "done";
    final.finishedAt = Date.now();
    setBatch({ ...final });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isBatchActive()) {
      return NextResponse.json(
        { error: "Ya hay una tarea en curso. Espera a que termine o cancélala." },
        { status: 409 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as AdaptBatchBody;
    const all = await listResearch();
    let candidates = all.filter((it) => it.status === "ready");
    if (body.itemIds && body.itemIds.length > 0) {
      const set = new Set(body.itemIds);
      candidates = candidates.filter((it) => set.has(it.id));
    } else if (!body.reAdaptExisting) {
      candidates = candidates.filter((it) => !it.adaptedScript);
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "no hay items para adaptar (todos ya tienen adapt o status != ready)" },
        { status: 400 }
      );
    }

    const batchId = `b_${Date.now().toString(36)}`;
    const progress: AdaptBatchProgress = {
      batchId,
      total: candidates.length,
      done: 0,
      success: 0,
      failed: 0,
      currentItemId: null,
      status: "running",
      startedAt: Date.now(),
      errors: [],
    };
    setBatch(progress);

    // Fire-and-forget — procesa en background
    processBatch(
      batchId,
      candidates.map((c) => c.id)
    ).catch((err) => {
      const cur = getBatch();
      if (cur && cur.batchId === batchId) {
        cur.status = "failed";
        cur.finishedAt = Date.now();
        cur.errors.push({ itemId: "batch", error: String(err) });
        setBatch({ ...cur });
      }
    });

    return NextResponse.json({ ok: true, batchId, total: candidates.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(getBatch() ?? { status: "idle" });
}

export async function DELETE() {
  const b = getBatch();
  if (!b) return NextResponse.json({ ok: false, error: "no batch" });
  b.status = "failed";
  b.finishedAt = Date.now();
  b.errors.push({ itemId: "batch", error: "cancelado por el usuario" });
  setBatch({ ...b });
  return NextResponse.json({ ok: true });
}
