import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Empty state reusable y "preciosa": tarjeta con borde sutil + radial-halo emerald
 * detrás del icono, mensaje y CTA opcional. Ideal para "no hay X todavía", el
 * primer onboarding al entrar a una sección vacía.
 *
 * Si pasas `cta`, puedes especificar `href` (Link) o `onClick` (button); prefiere
 * href cuando la acción es "ir a otra pantalla".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  className,
  tone = "emerald",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  className?: string;
  /** Color del halo y del CTA. Default emerald. */
  tone?: "emerald" | "amber" | "sky" | "violet" | "muted";
}) {
  // Halo radial detrás del icono. Usamos arbitrary value para no depender de
  // un plugin de gradient-radial; el rgba lo da el color del tone.
  const haloByTone: Record<string, string> = {
    emerald:
      "bg-[radial-gradient(circle,rgba(16,185,129,0.22)_0%,rgba(16,185,129,0.06)_55%,transparent_80%)]",
    amber:
      "bg-[radial-gradient(circle,rgba(245,158,11,0.22)_0%,rgba(245,158,11,0.06)_55%,transparent_80%)]",
    sky: "bg-[radial-gradient(circle,rgba(14,165,233,0.22)_0%,rgba(14,165,233,0.06)_55%,transparent_80%)]",
    violet:
      "bg-[radial-gradient(circle,rgba(139,92,246,0.22)_0%,rgba(139,92,246,0.06)_55%,transparent_80%)]",
    muted:
      "bg-[radial-gradient(circle,rgba(148,163,184,0.18)_0%,rgba(148,163,184,0.05)_55%,transparent_80%)]",
  };
  const iconRingByTone: Record<string, string> = {
    emerald: "ring-emerald-500/25 text-emerald-300",
    amber: "ring-amber-500/25 text-amber-300",
    sky: "ring-sky-500/25 text-sky-300",
    violet: "ring-violet-500/25 text-violet-300",
    muted: "ring-foreground/15 text-muted-foreground",
  };
  const ctaByTone: Record<string, string> = {
    emerald:
      "bg-primary text-primary-foreground hover:bg-primary/90 shadow-emerald-500/20",
    amber: "bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-amber-500/20",
    sky: "bg-sky-500 text-sky-950 hover:bg-sky-400 shadow-sky-500/20",
    violet: "bg-violet-500 text-white hover:bg-violet-400 shadow-violet-500/20",
    muted: "bg-foreground text-background hover:bg-foreground/90",
  };

  const ctaClass = cn(
    "mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-5 text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-primary",
    ctaByTone[tone]
  );

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-dashed border-border/60 bg-card p-10 text-center",
        className
      )}
    >
      {/* Halo radial detrás del icono */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-12 h-40 w-40 -translate-x-1/2 rounded-full blur-2xl",
          haloByTone[tone]
        )}
        aria-hidden
      />

      <div className="relative">
        <div
          className={cn(
            "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-card/90 ring-2 ring-inset backdrop-blur",
            iconRingByTone[tone]
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>

        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}

        {cta &&
          (cta.href ? (
            <Link href={cta.href} className={ctaClass}>
              {cta.label}
            </Link>
          ) : (
            <button type="button" onClick={cta.onClick} className={ctaClass}>
              {cta.label}
            </button>
          ))}
      </div>
    </Card>
  );
}
