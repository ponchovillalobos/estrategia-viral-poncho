// Resuelve los datos de métricas reales (cargadas por el usuario en /metricas).
// Antes había un fallback a `MOCK_METRICS` para mostrar un dashboard de ejemplo
// cuando no había datos reales; eso se removió junto con los dashboards de redes
// porque mostraba números inventados que confundían al usuario.

import type { PlatformKey } from "@/lib/platforms";
import type { RealEntry } from "@/hooks/use-real-metrics";

export interface DayMetric {
  day: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface PlatformStats {
  views: number;
  er: number;
  follows: number;
  comments: number;
  saves?: number;
}

export interface WeekdayPoint {
  day: string;
  views: number;
  er: number;
}

/** Construye 30 días de datos a partir de los entries reales (cero para los días sin datos). */
export function resolveMetrics(
  _platform: PlatformKey,
  realEntries: RealEntry[]
): { data: DayMetric[]; isReal: boolean } {
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
    data.push(
      real
        ? {
            day,
            views: real.views,
            likes: real.likes,
            comments: real.comments,
            shares: real.shares,
          }
        : { day, views: 0, likes: 0, comments: 0, shares: 0 }
    );
  }
  return { data, isReal: realEntries.length > 0 };
}

/** Totales agregados de la plataforma. Si no hay entries reales, todo cero. */
export function resolveStats(
  platform: PlatformKey,
  realEntries: RealEntry[]
): { stats: PlatformStats; isReal: boolean } {
  if (realEntries.length === 0) {
    return { stats: { views: 0, er: 0, follows: 0, comments: 0 }, isReal: false };
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

  const er =
    totals.views > 0
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

/** Promedio por día de la semana, derivado de los entries reales. Vacío si no hay datos. */
export function resolveWeekday(
  _platform: PlatformKey,
  realEntries: RealEntry[]
): { data: WeekdayPoint[]; isReal: boolean } {
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  if (realEntries.length === 0) {
    return {
      data: labels.map((day) => ({ day, views: 0, er: 0 })),
      isReal: false,
    };
  }

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
    er:
      b.views > 0
        ? +(((b.likes + b.comments) / b.views) * 100).toFixed(1)
        : 0,
  }));

  return { data, isReal: true };
}
