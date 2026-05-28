import { NextRequest, NextResponse } from "next/server";
import { bulkImport, createEntry, listEntries, type MetricEntry } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await listEntries();
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<MetricEntry> | { bulk: Partial<MetricEntry>[] };

    // Bulk import (usado por la migración one-shot desde localStorage)
    if ("bulk" in body && Array.isArray(body.bulk)) {
      const cleaned = body.bulk
        .filter((e) => e && e.platform && typeof e.day === "number")
        .map((e) => ({
          projectId: e.projectId,
          platform: e.platform!,
          day: e.day!,
          date: e.date,
          postedAt: e.postedAt,
          views: Number(e.views ?? 0),
          likes: Number(e.likes ?? 0),
          comments: Number(e.comments ?? 0),
          shares: Number(e.shares ?? 0),
          saves: e.saves != null ? Number(e.saves) : undefined,
          follows: e.follows != null ? Number(e.follows) : undefined,
          avgWatchTime: e.avgWatchTime != null ? Number(e.avgWatchTime) : undefined,
          duration: e.duration != null ? Number(e.duration) : undefined,
          retention3s: e.retention3s != null ? Number(e.retention3s) : undefined,
          notes: e.notes,
        }));
      const count = await bulkImport(cleaned);
      return NextResponse.json({ ok: true, imported: count });
    }

    // Single entry
    const e = body as Partial<MetricEntry>;
    if (!e.platform || typeof e.day !== "number") {
      return NextResponse.json(
        { error: "platform y day son requeridos" },
        { status: 400 }
      );
    }
    const entry = await createEntry({
      projectId: e.projectId,
      platform: e.platform,
      day: e.day,
      date: e.date,
      postedAt: e.postedAt,
      views: Number(e.views ?? 0),
      likes: Number(e.likes ?? 0),
      comments: Number(e.comments ?? 0),
      shares: Number(e.shares ?? 0),
      saves: e.saves != null ? Number(e.saves) : undefined,
      follows: e.follows != null ? Number(e.follows) : undefined,
      avgWatchTime: e.avgWatchTime != null ? Number(e.avgWatchTime) : undefined,
      duration: e.duration != null ? Number(e.duration) : undefined,
      retention3s: e.retention3s != null ? Number(e.retention3s) : undefined,
      notes: e.notes,
    });
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
