import type { PlatformKey } from "@/lib/platforms";
import type { RealEntry } from "@/hooks/use-real-metrics";
import {
  MOCK_METRICS,
  computeStats,
  weekdayAverage,
  type DayMetric,
  type PlatformStats,
  type WeekdayPoint,
} from "@/data/mock-metrics";

export function resolveMetrics(
  platform: PlatformKey,
  realEntries: RealEntry[]
): { data: DayMetric[]; isReal: boolean } {
  if (realEntries.length === 0) {
    return { data: MOCK_METRICS[platform], isReal: false };
  }

  const byDay = new Map<number, RealEntry>();
  realEntries.forEach((e) => {
    const existing = byDay.get(e.day);
    if (!existing || new Date(e.createdAt) > new Date(existing.createdAt)) {
      byDay.set(e.day, e);
    }
  });

  const data: DayMetric[] = [];
  for (let day = 1; day <= 30; day++) {
    const real = byDay.get(day);
    if (real) {
      data.push({
        day,
        views: real.views,
        likes: real.likes,
        comments: real.comments,
        shares: real.shares,
      });
    } else {
      data.push({ day, views: 0, likes: 0, comments: 0, shares: 0 });
    }
  }
  return { data, isReal: true };
}

export function resolveStats(
  platform: PlatformKey,
  realEntries: RealEntry[]
): { stats: PlatformStats; isReal: boolean } {
  if (realEntries.length === 0) {
    return { stats: computeStats(platform), isReal: false };
  }

  const totals = realEntries.reduce(
    (acc, e) => ({
      views: acc.views + e.views,
      likes: acc.likes + e.likes,
      comments: acc.comments + e.comments,
      shares: acc.shares + e.shares,
      follows: acc.follows + (e.follows ?? 0),
      saves: acc.saves + (e.saves ?? 0),
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, follows: 0, saves: 0 }
  );

  const er = totals.views > 0
    ? +(((totals.likes + totals.comments) / totals.views) * 100).toFixed(1)
    : 0;

  return {
    stats: {
      views: totals.views,
      er,
      follows: totals.follows,
      comments: totals.comments,
      saves: platform === "instagram" ? totals.saves : undefined,
    },
    isReal: true,
  };
}

export function resolveWeekday(
  platform: PlatformKey,
  realEntries: RealEntry[]
): { data: WeekdayPoint[]; isReal: boolean } {
  if (realEntries.length === 0) {
    return { data: weekdayAverage(platform), isReal: false };
  }

  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const buckets = labels.map(() => ({ views: 0, likes: 0, comments: 0, count: 0 }));

  realEntries.forEach((e) => {
    const idx = (e.day - 1) % 7;
    buckets[idx].views += e.views;
    buckets[idx].likes += e.likes;
    buckets[idx].comments += e.comments;
    buckets[idx].count += 1;
  });

  const data = buckets.map((b, i) => ({
    day: labels[i],
    views: b.count > 0 ? Math.round(b.views / b.count) : 0,
    er: b.views > 0
      ? +(((b.likes + b.comments) / b.views) * 100).toFixed(1)
      : 0,
  }));

  return { data, isReal: true };
}
