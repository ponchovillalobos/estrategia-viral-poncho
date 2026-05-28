import Link from "next/link";
import { PHASES } from "@/lib/phases";
import { GLOBAL_KPIS } from "@/data/kpis";
import { CALENDAR } from "@/data/calendar";
import { PLATFORMS, PLATFORM_ORDER } from "@/lib/platforms";
import { Card } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";

export default function MasterPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          Estrategia Viral Poncho · 30 días
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Master Plan</h1>
        <p className="max-w-2xl text-muted-foreground">
          Plan viral de un mes para crecer una cuenta personal en el nicho
          comunicación + ventas + IA. Audiencia hispanohablante. Plataforma
          primaria: TikTok. Cuatro fases semanales.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {GLOBAL_KPIS.map((kpi) => (
          <Card key={kpi.label} className="border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-2 font-mono-tab text-3xl font-medium">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Fases del challenge</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.values(PHASES).map((phase) => {
            const daysInPhase = CALENDAR.filter((d) => d.phase === phase.key);
            return (
              <Card
                key={phase.key}
                className="border-border bg-card p-6"
                style={{ borderLeft: `4px solid ${phase.color}` }}
              >
                <div className="flex items-baseline justify-between">
                  <h3
                    className="text-xl font-semibold"
                    style={{ color: phase.color }}
                  >
                    Semana {phase.week} · {phase.label}
                  </h3>
                  <span className="font-mono-tab text-xs text-muted-foreground">
                    D{phase.days[0].toString().padStart(2, "0")} –
                    D{phase.days[1].toString().padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {phase.narrative}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {daysInPhase.slice(0, 3).map((d) => (
                    <li key={d.day} className="text-sm">
                      <span className="font-mono-tab text-muted-foreground">
                        D{d.day.toString().padStart(2, "0")}
                      </span>{" "}
                      · {d.theme}
                    </li>
                  ))}
                  {daysInPhase.length > 3 && (
                    <li className="text-xs text-muted-foreground">
                      …y {daysInPhase.length - 3} días más
                    </li>
                  )}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Plataformas</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_ORDER.map((key) => {
            const p = PLATFORMS[key];
            return (
              <Link
                key={key}
                href={`/${key}`}
                className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="text-lg font-medium">{p.label}</span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                {p.primary && (
                  <span className="mt-2 inline-block font-mono-tab text-[10px] uppercase tracking-wider text-emerald-400">
                    primaria
                  </span>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{p.format}</p>
                <p className="mt-1 font-mono-tab text-[10px] text-muted-foreground">
                  {p.hashtagsPerPost} tags/post
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
