import { NextRequest, NextResponse } from "next/server";
import { deleteEntry, updateEntry, type MetricEntry } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const patch = (await req.json()) as Partial<MetricEntry>;
    const updated = await updateEntry(id, patch);
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
  const ok = await deleteEntry(id);
  return NextResponse.json({ ok });
}
