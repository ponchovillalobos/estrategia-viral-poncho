"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useRealMetrics } from "@/hooks/use-real-metrics";
import { resolveWeekday } from "@/lib/metrics-resolver";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

interface ChartWeekdayProps {
  platform: PlatformKey;
}

export function ChartWeekday({ platform }: ChartWeekdayProps) {
  const { store, hydrated } = useRealMetrics();
  const { data, isReal } = resolveWeekday(platform, store[platform]);
  const color = PLATFORMS[platform].color;
  const max = Math.max(...data.map((d) => d.views));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Promedio por día de la semana</h3>
        <span
          className={`font-mono-tab text-[10px] uppercase tracking-wider ${
            hydrated && isReal ? "text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {hydrated && isReal ? "datos reales" : "views promedio"}
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
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
              cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
              formatter={(v) => [Number(v).toLocaleString("es"), "views avg"]}
            />
            <Bar dataKey="views" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.views === max && max > 0 ? color : `${color}88`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
