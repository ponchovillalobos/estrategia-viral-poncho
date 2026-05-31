"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORMS, PLATFORM_ORDER } from "@/lib/platforms";
import { LayoutDashboard, Music2, Camera, Briefcase, Users, LineChart, Scissors, FolderKanban, Settings, Film, Telescope, Menu, X } from "lucide-react";
import { SettingsDialog } from "@/components/layout/settings-dialog";

const ICONS = {
  tiktok: Music2,
  instagram: Camera,
  linkedin: Briefcase,
  facebook: Users,
} as const;

export function TabNav() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar el menú móvil al navegar (store-and-compare para evitar setState-in-effect).
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  // Orden por el flujo real de un principiante: empezar → crear → ver lo creado → resultados,
  // y al final lo de referencia (videos largos, inspiración, planes por red).
  const links = [
    { href: "/", label: "Inicio", icon: LayoutDashboard, color: "var(--accent-emerald)" },
    { href: "/editor", label: "Crear video", icon: Scissors, color: "var(--accent-emerald)" },
    { href: "/produccion", label: "Mis videos", icon: FolderKanban, color: "var(--phase-amplificacion)" },
    { href: "/metricas", label: "Resultados", icon: LineChart, color: "var(--accent-emerald)" },
    { href: "/largos", label: "Videos largos", icon: Film, color: "var(--accent-violet, #a78bfa)" },
    { href: "/research", label: "Inspiración", icon: Telescope, color: "var(--accent-cyan, #06b6d4)" },
    ...PLATFORM_ORDER.map((p) => ({
      href: `/${p}`,
      label: PLATFORMS[p].label,
      icon: ICONS[p],
      color: PLATFORMS[p].color,
    })),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-7xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link href="/" className="group mr-2 flex items-center gap-2 sm:mr-4">
          <div className="h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.5)] transition-transform group-hover:scale-110" />
          <span className="text-sm font-semibold tracking-tight">Estrategia Viral</span>
        </Link>

        {/* Links inline (desktop) */}
        <div className="hidden items-center gap-0.5 lg:flex">
          {links.map(({ href, label, icon: Icon, color }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                <Icon className="h-4 w-4" style={{ color: active ? color : undefined }} />
                <span>{label}</span>
                {/* Underline animado al estilo "tab activo" — más fino y elegante que el bg pill. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[13px] left-3 right-3 h-[2px] rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 10px ${color}`,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md p-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            title="Configurar cuentas de redes sociales"
            aria-label="Configurar cuentas de redes sociales"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden lg:inline">Configuración</span>
          </button>
          {/* Hamburguesa (móvil/tablet) */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground lg:hidden"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Panel de navegación móvil */}
      {menuOpen && (
        <div className="border-t border-border bg-background lg:hidden">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-1 px-4 py-3 sm:grid-cols-3">
            {links.map(({ href, label, icon: Icon, color }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4" style={{ color: active ? color : undefined }} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
