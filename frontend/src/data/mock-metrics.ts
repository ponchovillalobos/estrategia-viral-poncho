import type { PlatformKey } from "@/lib/platforms";

export interface DayMetric {
  day: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

function buildCurve(weeklyTargets: number[], noiseAmp: number, seedOffset = 0): number[] {
  const out: number[] = [];
  for (let week = 0; week < 4; week++) {
    const weekTarget = weeklyTargets[week];
    const perDay = weekTarget / 7;
    for (let d = 0; d < 7; d++) {
      const idx = week * 7 + d + 1;
      if (idx > 30) break;
      const wobble = Math.sin((idx + seedOffset) * 1.7) * noiseAmp;
      const spike = idx % 5 === 0 ? perDay * 0.4 : 0;
      out.push(Math.max(0, Math.round(perDay + wobble * perDay + spike)));
    }
  }
  return out.slice(0, 30);
}

export const MOCK_METRICS: Record<PlatformKey, DayMetric[]> = {
  tiktok: buildMetrics(
    buildCurve([5000, 15000, 30000, 50000], 0.35),
    { likeRatio: 0.055, commentRatio: 0.003, shareRatio: 0.002 }
  ),
  instagram: buildMetrics(
    buildCurve([3000, 8000, 18000, 30000], 0.3, 1),
    { likeRatio: 0.05, commentRatio: 0.0025, shareRatio: 0.0015 }
  ),
  linkedin: buildMetrics(
    buildCurve([2000, 6000, 15000, 30000], 0.25, 2),
    { likeRatio: 0.08, commentRatio: 0.004, shareRatio: 0.003 }
  ),
  facebook: buildMetrics(
    buildCurve([1000, 3000, 7000, 12000], 0.28, 3),
    { likeRatio: 0.035, commentRatio: 0.002, shareRatio: 0.0015 }
  ),
};

function buildMetrics(
  views: number[],
  ratios: { likeRatio: number; commentRatio: number; shareRatio: number }
): DayMetric[] {
  return views.map((v, i) => ({
    day: i + 1,
    views: v,
    likes: Math.round(v * ratios.likeRatio),
    comments: Math.max(1, Math.round(v * ratios.commentRatio)),
    shares: Math.max(0, Math.round(v * ratios.shareRatio)),
  }));
}

export interface PlatformStats {
  views: number;
  er: number;
  follows: number;
  comments: number;
  saves?: number;
}

export function computeStats(platform: PlatformKey): PlatformStats {
  const data = MOCK_METRICS[platform];
  const totalViews = data.reduce((acc, d) => acc + d.views, 0);
  const totalLikes = data.reduce((acc, d) => acc + d.likes, 0);
  const totalComments = data.reduce((acc, d) => acc + d.comments, 0);
  const er = totalViews > 0 ? +(((totalLikes + totalComments) / totalViews) * 100).toFixed(1) : 0;
  const followsByPlatform: Record<PlatformKey, number> = {
    tiktok: 250,
    instagram: 180,
    linkedin: 130,
    facebook: 80,
  };
  return {
    views: totalViews,
    er,
    follows: followsByPlatform[platform],
    comments: totalComments,
    saves: platform === "instagram" ? 38 : undefined,
  };
}

export interface WeekdayPoint {
  day: string;
  views: number;
  er: number;
}

export function weekdayAverage(platform: PlatformKey): WeekdayPoint[] {
  const data = MOCK_METRICS[platform];
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const buckets = labels.map(() => ({ views: 0, likes: 0, comments: 0, count: 0 }));
  data.forEach((d, i) => {
    const weekday = (i + 0) % 7;
    buckets[weekday].views += d.views;
    buckets[weekday].likes += d.likes;
    buckets[weekday].comments += d.comments;
    buckets[weekday].count += 1;
  });
  return buckets.map((b, i) => ({
    day: labels[i],
    views: Math.round(b.views / Math.max(1, b.count)),
    er: b.views > 0
      ? +(((b.likes + b.comments) / b.views) * 100).toFixed(1)
      : 0,
  }));
}

export interface HashtagPoint {
  tag: string;
  views: number;
}

export function hashtagBreakdown(platform: PlatformKey): HashtagPoint[] {
  const samples: Record<PlatformKey, HashtagPoint[]> = {
    tiktok: [
      { tag: "#ventasconia", views: 18400 },
      { tag: "#chatgpt", views: 12300 },
      { tag: "#ventasb2b", views: 9800 },
      { tag: "#salestips", views: 5600 },
      { tag: "#emprendedores", views: 4100 },
    ],
    instagram: [
      { tag: "#ventasconia", views: 9800 },
      { tag: "#salesai", views: 7400 },
      { tag: "#copywriting", views: 5200 },
      { tag: "#neuroventas", views: 4100 },
      { tag: "#ia", views: 3500 },
    ],
    linkedin: [
      { tag: "#VentasB2B", views: 12100 },
      { tag: "#InteligenciaArtificial", views: 8400 },
      { tag: "#SalesEnablement", views: 5100 },
      { tag: "#ChatGPT", views: 3300 },
      { tag: "#NeuroVentas", views: 2100 },
    ],
    facebook: [
      { tag: "#ventas", views: 4200 },
      { tag: "#emprendedores", views: 3100 },
      { tag: "#chatgpt", views: 2400 },
      { tag: "#ia", views: 1500 },
      { tag: "#negocios", views: 800 },
    ],
  };
  return samples[platform];
}
