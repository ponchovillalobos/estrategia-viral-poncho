/**
 * GET /api/overlays/[id]    — devuelve metadata del overlay
 * PATCH /api/overlays/[id]  — actualiza timestamps/effect/motion/transitions/etc.
 * DELETE /api/overlays/[id] — borra entry + archivo en disco
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteOverlay, getOverlay, updateOverlay, type ImageOverlay } from "@/lib/overlays-store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const overlay = await getOverlay(id);
  if (!overlay) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  return NextResponse.json(overlay);
}

const ALLOWED_PATCH_FIELDS: (keyof ImageOverlay)[] = [
  "description",
  "userOrder",
  "startTime",
  "endTime",
  "effect",
  "motion",
  "transitionIn",
  "transitionOut",
  "position",
  "sizeRatio",
  "sfxId",
];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const patch = (await req.json()) as Partial<ImageOverlay>;
    const allowed: Partial<ImageOverlay> = {};
    for (const k of ALLOWED_PATCH_FIELDS) {
      if (patch[k] !== undefined) {
        // @ts-expect-error – generic field assignment on partial
        allowed[k] = patch[k];
      }
    }
    const updated = await updateOverlay(id, allowed);
    if (!updated) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deleteOverlay(id);
  return NextResponse.json({ ok });
}
