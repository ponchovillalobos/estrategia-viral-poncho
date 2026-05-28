import { notFound } from "next/navigation";
import { PLATFORMS, PLATFORM_ORDER, isPlatformKey } from "@/lib/platforms";
import { StatsCards } from "@/components/social/stats-cards";
import { ChartProgression } from "@/components/social/chart-progression";
import { ChartWeekday } from "@/components/social/chart-weekday";
import { ChartHashtags } from "@/components/social/chart-hashtags";
import { CalendarGrid } from "@/components/social/calendar-grid";
import { HashtagsRotativos } from "@/components/social/hashtags-rotativos";
import { HoursTable } from "@/components/social/hours-table";

export function generateStaticParams() {
  return PLATFORM_ORDER.map((platform) => ({ platform }));
}

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  if (!isPlatformKey(platform)) notFound();

  const p = PLATFORMS[platform];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: p.color }}
          />
          <h1 className="text-4xl font-semibold tracking-tight">{p.label}</h1>
          {p.primary && (
            <span
              className="rounded-md px-2 py-0.5 font-mono-tab text-[10px] uppercase tracking-wider"
              style={{
                background: `${p.color}22`,
                color: p.color,
                border: `1px solid ${p.color}55`,
              }}
            >
              red primaria
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{p.format}</span>
          <span>·</span>
          <span className="font-mono-tab">{p.hashtagsPerPost} tags/post</span>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{p.notes}</p>
      </header>

      <StatsCards platform={platform} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartProgression platform={platform} />
        <ChartWeekday platform={platform} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartHashtags platform={platform} />
        </div>
        <HoursTable platform={platform} />
      </div>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Calendario 30 días</h2>
          <span className="font-mono-tab text-[10px] text-muted-foreground">
            click en una card para guion + caption
          </span>
        </div>
        <CalendarGrid platform={platform} />
      </section>

      <HashtagsRotativos platform={platform} />
    </div>
  );
}
