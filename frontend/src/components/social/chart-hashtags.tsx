"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { hashtagBreakdown } from "@/data/mock-metrics";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

interface ChartHashtagsProps {
  platform: PlatformKey;
}

const SHADES = [1, 0.78, 0.6, 0.42, 0.28];

function withAlpha(hex: string, alpha: number) {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function ChartHashtags({ platform }: ChartHashtagsProps) {
  const data = hashtagBreakdown(platform);
  const base = PLATFORMS[platform].color;
  const total = data.reduce((acc, d) => acc + d.views, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Hashtag performance</h3>
        <span className="font-mono-tab text-[10px] text-muted-foreground">
          top 5 · views
        </span>
      </div>
      <div className="flex flex-col items-center gap-4 md:flex-row">
        <div className="h-48 w-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v) => [Number(v).toLocaleString("es"), "views"]}
              />
              <Pie
                data={data}
                dataKey="views"
                nameKey="tag"
                innerRadius={45}
                outerRadius={75}
                strokeWidth={2}
                stroke="var(--card)"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={withAlpha(base, SHADES[i] ?? 0.2)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-2">
          {data.map((d, i) => {
            const pct = ((d.views / total) * 100).toFixed(0);
            return (
              <li key={d.tag} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: withAlpha(base, SHADES[i] ?? 0.2) }}
                  />
                  <span className="font-mono-tab text-xs">{d.tag}</span>
                </div>
                <span className="font-mono-tab text-xs text-muted-foreground">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
