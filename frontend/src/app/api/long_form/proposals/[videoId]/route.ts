import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LF_PROPOSALS } from "@/lib/paths-long-form";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ videoId: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { videoId } = await ctx.params;
  const filePath = path.join(LF_PROPOSALS, `${videoId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "no hay propuestas", videoId }, { status: 404 });
  }
}
