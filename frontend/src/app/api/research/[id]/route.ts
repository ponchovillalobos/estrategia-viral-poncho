import { NextRequest, NextResponse } from "next/server";
import { deleteResearch, getResearch, updateResearch, type ResearchItem } from "@/lib/research-store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await getResearch(id);
  if (!item) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const patch = (await req.json()) as Partial<ResearchItem>;
    // Solo permitimos editar estos campos por seguridad — el status lo maneja el runner.
    const allowed: Partial<ResearchItem> = {};
    if (patch.userMarked !== undefined) allowed.userMarked = patch.userMarked;
    if (patch.notes !== undefined) allowed.notes = patch.notes;
    if (patch.adaptedScript !== undefined) allowed.adaptedScript = patch.adaptedScript;
    if (patch.adaptedHook !== undefined) allowed.adaptedHook = patch.adaptedHook;
    if (patch.suggestedHashtags !== undefined) allowed.suggestedHashtags = patch.suggestedHashtags;

    const updated = await updateResearch(id, allowed);
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
  const ok = await deleteResearch(id);
  return NextResponse.json({ ok });
}
