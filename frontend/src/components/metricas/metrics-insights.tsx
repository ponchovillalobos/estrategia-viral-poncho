"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, Music2, Briefcase, Camera, Users } from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

interface PlatformBenchmark {
  platform: PlatformKey;
  count: number;
  medianViews: number;
  medianRetention3s: number;
  medianCompletion: number;
  medianEngagementRate: number;
  medianViralRatio: number;
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

interface InsightsResponse {
  benchmarks: PlatformBenchmark[];
  hooksRanked: HookRanking[];
  captionsRanked: CaptionRanking[];
  totalEntries: number;
}

const PLATFORM_ICON: Record<PlatformKey, typeof Music2> = {
  tiktok: Music2,
  instagram: Camera,
  linkedin: Briefcase,
  facebook: Users,
};

const PLATFORM_COLOR: Record<PlatformKey, string> = {
  tiktok: "text-pink-400",
  instagram: "text-amber-400",
  linkedin: "text-sky-400",
  facebook: "text-indigo-400",
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function MetricsInsights() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/metrics/insights");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as InsightsResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("insights load falló:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Escuchar evento de actualización (cuando el form añade una entry)
    function onUpdate() {
      load();
    }
    window.addEventListener("viral-metrics-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("viral-metrics-updated", onUpdate);
    };
  }, []);

  if (loading && !data) {
    return (
      <Card className="border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> calculando insights…
        </div>
      </Card>
    );
  }

  if (!data || data.totalEntries === 0) {
    return (
      <Card className="border-dashed border-border bg-card/50 p-6">
        <p className="text-sm text-muted-foreground">
          Todavía no hay métricas. Cargá entradas abajo para ver KPIs comparativos,
          ranking de hooks ganadores y captions con mejor viral ratio.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI por plataforma ─────────────────────────── */}
      <section>
        <h2 className="mb-3 font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          KPIs por plataforma · {data.totalEntries} entradas totales
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {data.benchmarks
            .filter((b) => b.count > 0)
            .map((b) => {
              const Icon = PLATFORM_ICON[b.platform];
              return (
                <Card key={b.platform} className="border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${PLATFORM_COLOR[b.platform]}`} />
                      <span className="font-medium">{PLATFORMS[b.platform].label}</span>
                    </span>
                    <span className="font-mono-tab text-[10px] text-muted-foreground">
                      n={b.count}
                    </span>
                  </div>
                  <dl className="space-y-1 font-mono-tab text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Views (med)</dt>
                      <dd className="text-foreground">{fmtNum(b.medianViews)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Eng rate</dt>
                      <dd className="text-foreground">
                        {b.medianEngagementRate > 0 ? fmtPct(b.medianEngagementRate, 2) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Viral ratio</dt>
                      <dd className="text-foreground">
                        {b.medianViralRatio > 0 ? fmtPct(b.medianViralRatio, 2) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Completion</dt>
                      <dd className="text-foreground">
                        {b.medianCompletion > 0 ? fmtPct(b.medianCompletion) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Ret 3s</dt>
                      <dd className="text-foreground">
                        {b.medianRetention3s > 0 ? `${b.medianRetention3s.toFixed(0)}%` : "—"}
                      </dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
        </div>
        <p className="mt-2 font-mono-tab text-[10px] text-muted-foreground">
          Viral ratio = (shares + saves) / views. Es la métrica que TikTok prioriza más
          que likes según research 2026.
        </p>
      </section>

      {/* ── Hooks ganadores ─────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-1.5 font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3 w-3" /> Hooks ganadores (top 10 por completion + viral ratio)
        </h2>
        {data.hooksRanked.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">
              Necesitás cargar el <strong>Project ID</strong> y el <strong>avg watch time + duración</strong> en
              cada métrica para poder rankear hooks.
            </p>
          </Card>
        ) : (
          <Card className="border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    #
                  </th>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Hook
                  </th>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Red
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Completion
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Viral
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Views
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    n
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.hooksRanked.map((h, i) => {
                  const Icon = PLATFORM_ICON[h.platform];
                  return (
                    <tr key={`${h.platform}::${h.hook}`} className="border-t border-border">
                      <td className="px-3 py-2 font-mono-tab text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 max-w-md text-foreground">{h.hook}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <Icon className={`h-3 w-3 ${PLATFORM_COLOR[h.platform]}`} />
                          <span className="font-mono-tab text-[10px]">{h.platform}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab">
                        {h.avgCompletion > 0 ? fmtPct(h.avgCompletion) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab">
                        {h.avgViralRatio > 0 ? fmtPct(h.avgViralRatio, 2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab">
                        {fmtNum(h.avgViews)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab text-muted-foreground">
                        {h.samples}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── Captions top viral ratio ─────────────────────── */}
      <section>
        <h2 className="mb-3 font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          Captions top — ranking por viral ratio (shares + saves) / views
        </h2>
        {data.captionsRanked.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">
              Cargá el Project ID + shares + saves para ver qué captions performaron mejor.
            </p>
          </Card>
        ) : (
          <Card className="border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    #
                  </th>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Caption (preview)
                  </th>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Red
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Viral ratio
                  </th>
                  <th className="px-3 py-2 text-right font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Views
                  </th>
                  <th className="px-3 py-2 text-left font-mono-tab text-[10px] uppercase text-muted-foreground">
                    Project ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.captionsRanked.map((c, i) => {
                  const Icon = PLATFORM_ICON[c.platform];
                  return (
                    <tr key={`${c.projectId}-${c.platform}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2 font-mono-tab text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 max-w-md text-foreground">{c.captionPreview || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <Icon className={`h-3 w-3 ${PLATFORM_COLOR[c.platform]}`} />
                          <span className="font-mono-tab text-[10px]">{c.platform}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab text-emerald-400">
                        {fmtPct(c.viralRatio, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-tab">{fmtNum(c.views)}</td>
                      <td className="px-3 py-2 font-mono-tab text-[10px] text-muted-foreground">
                        {c.projectId}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
