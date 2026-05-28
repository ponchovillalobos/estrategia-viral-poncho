/**
 * Insights endpoint — cruza metrics.json con projects/*.json para calcular:
 *   - Completion proxy promedio por plataforma
 *   - Top 5 hooks (primera línea del caption) por completion proxy
 *   - Top captions por viral ratio (shares+saves)/views
 *   - Benchmarks por plataforma: mediana de views, retention3s, engagement rate
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  listEntries,
  completionProxy,
  engagementRate,
  viralRatio,
  type MetricEntry,
  type PlatformKey,
} from "@/lib/metrics-store";
import { PROJECTS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface ProjectFile {
  id: string;
  caption?: string;
  captions?: {
    tiktok?: { caption?: string; hashtags?: string[] };
    linkedin?: { caption?: string; hashtags?: string[] };
    instagram?: { caption?: string; hashtags?: string[] };
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function firstLine(text: string | undefined | null): string {
  if (!text) return "";
  const line = text.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > 110 ? line.slice(0, 110) + "…" : line;
}

async function loadProjectsMap(): Promise<Map<string, ProjectFile>> {
  const map = new Map<string, ProjectFile>();
  try {
    const files = await fs.readdir(PROJECTS_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const data = JSON.parse(
              await fs.readFile(path.join(PROJECTS_DIR, f), "utf-8")
            ) as ProjectFile;
            if (data?.id) map.set(data.id, data);
          } catch {
            // skip corrupt
          }
        })
    );
  } catch {
    // PROJECTS_DIR no existe — devuelve mapa vacío
  }
  return map;
}

interface HookRanking {
  hook: string;
  platform: PlatformKey;
  samples: number;
  avgCompletion: number;
  avgViralRatio: number;
  avgViews: number;
  projectIds: string[];
}

interface CaptionRanking {
  projectId: string;
  platform: PlatformKey;
  captionPreview: string;
  viralRatio: number;
  views: number;
  shares: number;
  saves: number;
}

interface PlatformBenchmark {
  platform: PlatformKey;
  count: number;
  medianViews: number;
  medianRetention3s: number;
  medianCompletion: number;
  medianEngagementRate: number;
  medianViralRatio: number;
}

export async function GET() {
  const [entries, projects] = await Promise.all([listEntries(), loadProjectsMap()]);

  // Helper: pegar primera línea del caption del proyecto para esa plataforma
  function getHookForEntry(e: MetricEntry): string {
    if (!e.projectId) return "";
    const p = projects.get(e.projectId);
    if (!p) return "";
    const platformKey = e.platform === "facebook" ? "tiktok" : e.platform;
    const cap =
      (p.captions?.[platformKey as "tiktok" | "linkedin" | "instagram"]?.caption) ||
      p.caption ||
      "";
    return firstLine(cap);
  }

  // ──────────────────────────────────────────────────────────────
  // Benchmarks por plataforma
  // ──────────────────────────────────────────────────────────────
  const platforms: PlatformKey[] = ["tiktok", "instagram", "linkedin", "facebook"];
  const benchmarks: PlatformBenchmark[] = platforms.map((platform) => {
    const ents = entries.filter((e) => e.platform === platform);
    const views = ents.map((e) => e.views).filter((v) => v > 0);
    const ret3s = ents.map((e) => e.retention3s).filter((r): r is number => r != null && r > 0);
    const completions = ents
      .map((e) => completionProxy(e))
      .filter((c): c is number => c != null);
    const engs = ents.map((e) => engagementRate(e)).filter((c): c is number => c != null);
    const virals = ents.map((e) => viralRatio(e)).filter((c): c is number => c != null);
    return {
      platform,
      count: ents.length,
      medianViews: median(views),
      medianRetention3s: median(ret3s),
      medianCompletion: median(completions),
      medianEngagementRate: median(engs),
      medianViralRatio: median(virals),
    };
  });

  // ──────────────────────────────────────────────────────────────
  // Top hooks (agrupados por primera línea de caption)
  // ──────────────────────────────────────────────────────────────
  const hookBuckets = new Map<string, MetricEntry[]>();
  for (const e of entries) {
    const hook = getHookForEntry(e);
    if (!hook) continue;
    const key = `${e.platform}::${hook}`;
    const arr = hookBuckets.get(key) ?? [];
    arr.push(e);
    hookBuckets.set(key, arr);
  }
  const hooksRanked: HookRanking[] = Array.from(hookBuckets.entries())
    .map(([key, ents]) => {
      const [platform, hook] = key.split("::");
      const completions = ents
        .map((e) => completionProxy(e))
        .filter((c): c is number => c != null);
      const virals = ents.map((e) => viralRatio(e)).filter((c): c is number => c != null);
      const views = ents.map((e) => e.views).filter((v) => v > 0);
      return {
        hook,
        platform: platform as PlatformKey,
        samples: ents.length,
        avgCompletion:
          completions.length > 0
            ? completions.reduce((s, n) => s + n, 0) / completions.length
            : 0,
        avgViralRatio:
          virals.length > 0 ? virals.reduce((s, n) => s + n, 0) / virals.length : 0,
        avgViews: views.length > 0 ? views.reduce((s, n) => s + n, 0) / views.length : 0,
        projectIds: Array.from(new Set(ents.map((e) => e.projectId).filter(Boolean) as string[])),
      };
    })
    .filter((h) => h.samples >= 1) // mostramos desde 1 sample (con count) para que el dashboard no se vacíe
    .sort((a, b) => b.avgCompletion - a.avgCompletion || b.avgViralRatio - a.avgViralRatio)
    .slice(0, 10);

  // ──────────────────────────────────────────────────────────────
  // Top captions por viral ratio
  // ──────────────────────────────────────────────────────────────
  const captionsRanked: CaptionRanking[] = entries
    .map((e) => {
      const ratio = viralRatio(e);
      if (ratio == null || !e.projectId) return null;
      const project = projects.get(e.projectId);
      const platformKey = e.platform === "facebook" ? "tiktok" : e.platform;
      const cap =
        (project?.captions?.[platformKey as "tiktok" | "linkedin" | "instagram"]?.caption) ||
        project?.caption ||
        "";
      return {
        projectId: e.projectId,
        platform: e.platform,
        captionPreview: firstLine(cap),
        viralRatio: ratio,
        views: e.views,
        shares: e.shares ?? 0,
        saves: e.saves ?? 0,
      } as CaptionRanking;
    })
    .filter((r): r is CaptionRanking => r != null)
    .sort((a, b) => b.viralRatio - a.viralRatio)
    .slice(0, 10);

  return NextResponse.json({
    benchmarks,
    hooksRanked,
    captionsRanked,
    totalEntries: entries.length,
  });
}
