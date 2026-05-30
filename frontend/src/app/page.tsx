import Link from "next/link";
import { Scissors, FolderKanban, Share2, ArrowRight, Upload, Wand2, Sparkles, Send, LineChart, Telescope, CalendarDays } from "lucide-react";
import { GettingStarted } from "@/components/home/getting-started";

export const dynamic = "force-dynamic";

const ACTIONS = [
  {
    href: "/editor",
    title: "Crear un video corto",
    desc: "Subí un video y convertilo en un short viral, paso a paso.",
    icon: Scissors,
    primary: true,
  },
  {
    href: "/produccion",
    title: "Ver mis videos",
    desc: "Tus shorts ya editados, listos para publicar.",
    icon: FolderKanban,
    primary: false,
  },
  {
    href: "/setup/linkedin",
    title: "Conectar mis redes",
    desc: "Conectá Instagram o LinkedIn para publicar con un clic.",
    icon: Share2,
    primary: false,
  },
] as const;

const FLOW = [
  { icon: Upload, label: "Subís tu video" },
  { icon: Wand2, label: "Elegís un estilo" },
  { icon: Sparkles, label: "Se genera solo" },
  { icon: Send, label: "Publicás en tus redes" },
] as const;

const SECONDARY = [
  { href: "/metricas", label: "Ver resultados", icon: LineChart },
  { href: "/research", label: "Buscar inspiración", icon: Telescope },
  { href: "/master", label: "Plan de 30 días", icon: CalendarDays },
] as const;

export default function Home() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <header className="relative space-y-3 pt-4">
        {/* Resplandor sutil detrás del título — eleva el "preciosa visualmente" sin distraer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-0 -z-10 h-64 w-[28rem] max-w-full rounded-full bg-primary/20 opacity-50 blur-3xl"
        />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Hola 👋 ¿Qué querés hacer hoy?
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Convertí tus videos en{" "}
          <strong className="bg-gradient-to-r from-primary via-emerald-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]">
            shorts virales
          </strong>{" "}
          y publicalos en tus redes — sin saber editar. Elegí una opción para empezar.
        </p>
      </header>

      {/* 3 acciones principales */}
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map(({ href, title, desc, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col gap-3 rounded-xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              primary
                ? "border-primary/40 bg-primary/10 hover:border-primary"
                : "border-border bg-card hover:border-foreground/30"
            }`}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
              Empezar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {/* Cómo funciona — 4 pasos */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Cómo funciona
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {FLOW.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex flex-1 items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {label}
                </span>
              </div>
              {i < FLOW.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 sm:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Primeros pasos (checklist que se tilda solo) */}
      <GettingStarted />

      {/* Accesos secundarios */}
      <div className="flex flex-wrap gap-2">
        {SECONDARY.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
