"use client";

import { Card } from "@/components/ui/card";
import { useRealMetrics } from "@/hooks/use-real-metrics";
import { resolveStats } from "@/lib/metrics-resolver";
import type { PlatformKey } from "@/lib/platforms";
import { KPIS } from "@/data/kpis";

interface StatsCardsProps {
  platform: PlatformKey;
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toString();
}

export function StatsCards({ platform }: StatsCardsProps) {
  const { store, hydrated } = useRealMetrics();
  const { stats, isReal } = resolveStats(platform, store[platform]);
  const meta = KPIS[platform].weeks[3];

  const cards = [
    {
      label: "Views acumuladas",
      value: formatNumber(stats.views),
      goal: formatNumber(meta.views || meta.impressions || 0),
      tone: "var(--accent-emerald)",
    },
    {
      label: "Engagement rate",
      value: `${stats.er}%`,
      goal: `${meta.er}%`,
      tone: "var(--phase-doble-down)",
    },
    {
      label: "Follows nuevos",
      value: `+${stats.follows}`,
      goal: `+${meta.follows}`,
      tone: "var(--phase-conversion)",
    },
    {
      label: stats.saves !== undefined ? "Saves totales" : "Comentarios",
      value: stats.saves !== undefined ? stats.saves.toString() : stats.comments.toString(),
      goal: stats.saves !== undefined
        ? meta.saves?.toString() ?? "—"
        : meta.comments.toString(),
      tone: "var(--phase-validacion)",
    },
  ];

  return (
    <div className="space-y-3">
      {!hydrated ? null : isReal ? (
        <div className="flex items-center justify-end">
          <span className="font-mono-tab text-[10px] uppercase tracking-wider text-emerald-400">
            ● datos reales
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span aria-hidden>⚠️</span>
          <span>
            <strong>Datos de ejemplo (demo).</strong> Estos números son inventados para mostrar
            el formato del dashboard — no son tus métricas reales. Cargalas a mano en{" "}
            <a href="/metricas" className="underline hover:text-amber-100">/metricas</a>.{" "}
            Conectar la cuenta sirve para <em>publicar</em>; LinkedIn/Instagram no exponen las
            analíticas de tus posts por API para apps de terceros.
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {c.label}
            </p>
            <p
              className="mt-2 font-mono-tab text-2xl font-medium"
              style={{ color: c.tone }}
            >
              {c.value}
            </p>
            <p className="mt-1 font-mono-tab text-[10px] text-muted-foreground">
              meta sem 4 · {c.goal}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
