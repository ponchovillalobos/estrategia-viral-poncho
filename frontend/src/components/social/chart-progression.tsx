"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useRealMetrics } from "@/hooks/use-real-metrics";
import { resolveMetrics } from "@/lib/metrics-resolver";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

interface ChartProgressionProps {
  platform: PlatformKey;
}

export function ChartProgression({ platform }: ChartProgressionProps) {
  const { store, hydrated } = useRealMetrics();
  const { data: source, isReal } = resolveMetrics(platform, store[platform]);
  const data = source.map((d) => ({
    day: `D${d.day.toString().padStart(2, "0")}`,
    views: d.views,
  }));
  const color = PLATFORMS[platform].color;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Progresión de views · 30 días</h3>
        <span
          className={`font-mono-tab text-[10px] uppercase tracking-wider ${
            hydrated && isReal ? "text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {hydrated && isReal ? "datos reales" : "mock data"}
        </span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : v)}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              cursor={{ stroke: "var(--border)" }}
              formatter={(v) => [Number(v).toLocaleString("es"), "views"]}
            />
            <Area
              type="monotone"
              dataKey="views"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${platform})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
