"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORMS, PLATFORM_ORDER } from "@/lib/platforms";
import { LayoutDashboard, Music2, Camera, Briefcase, Users, LineChart, Scissors, FolderKanban, Settings, Film, Telescope } from "lucide-react";
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
  const [tiktokHandle, setTiktokHandle] = useState<string>("");

  // Cargar handle de TikTok para mostrarlo en la nav
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setTiktokHandle(d.handles?.tiktok ?? ""))
      .catch(() => {});
  }, []);

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
      <nav className="mx-auto flex w-full max-w-7xl items-center gap-1 px-6 py-3">
        <div className="mr-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-emerald-400" />
          <span className="font-mono-tab text-sm tracking-tight">estrategia.viral.poncho</span>
        </div>
        {links.map(({ href, label, icon: Icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
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

        <div className="ml-auto flex items-center gap-2">
          {tiktokHandle && (
            <span
              className="hidden items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono-tab text-[10px] text-muted-foreground sm:flex"
              title="Cuenta de TikTok conectada (configurable en ajustes)"
            >
              <Music2 className="h-3 w-3 text-pink-400" />
              {tiktokHandle}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            title="Configurar cuentas de redes sociales"
            aria-label="Configurar cuentas"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </nav>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={(h) => setTiktokHandle(h.tiktok)}
      />
    </header>
  );
}
