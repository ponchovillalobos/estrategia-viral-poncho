import { NextRequest, NextResponse } from "next/server";
import { deleteScheduled, getScheduled } from "@/lib/scheduled-uploads";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const upload = await getScheduled(id);
  if (!upload) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(upload);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteScheduled(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
