import { NextRequest, NextResponse } from "next/server";
import { listResearch } from "@/lib/research-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const items = await listResearch();
  const url = req.nextUrl;
  const platform = url.searchParams.get("platform");
  const status = url.searchParams.get("status");
  const marked = url.searchParams.get("marked");
  const search = url.searchParams.get("q")?.toLowerCase().trim();

  let filtered = items;
  if (platform) filtered = filtered.filter((it) => it.platform === platform);
  if (status) filtered = filtered.filter((it) => it.status === status);
  if (marked) filtered = filtered.filter((it) => it.userMarked === marked);
  if (search) {
    filtered = filtered.filter((it) => {
      const hay = `${it.url} ${it.metadata?.author ?? ""} ${it.metadata?.caption ?? ""} ${it.metadata?.hashtags?.join(" ") ?? ""}`.toLowerCase();
      return hay.includes(search);
    });
  }

  return NextResponse.json(
    {
      items: filtered,
      total: items.length,
      filtered: filtered.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
