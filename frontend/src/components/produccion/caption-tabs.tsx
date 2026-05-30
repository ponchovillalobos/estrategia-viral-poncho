"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  pickCaptionForPlatform,
  type CaptionPlatform,
  type ProjectExt,
} from "@/components/produccion/produccion-types";

const PLATFORM_TABS: { key: CaptionPlatform; label: string; color: string }[] = [
  { key: "tiktok", label: "TikTok", color: "text-pink-400" },
  { key: "linkedin", label: "LinkedIn", color: "text-sky-400" },
  { key: "instagram", label: "Instagram", color: "text-amber-400" },
];

/**
 * Bloque de captions multi-plataforma en cada card. Muestra tabs (TikTok/LinkedIn/Instagram),
 * el texto activo con su contador, y un botón de copiar con animación de check al éxito.
 *
 * Fallback: si el proyecto sólo tiene el `caption` legacy (un solo texto), se renderiza una
 * tarjeta plana en vez de los tabs — comportamiento histórico preservado.
 */
export function CaptionTabs({ project }: { project: ProjectExt }) {
  const [active, setActive] = useState<CaptionPlatform>("tiktok");
  const [copied, setCopied] = useState<CaptionPlatform | null>(null);

  // Sólo mostrar tabs si hay captions multi-plataforma; si no, fallback a un único bloque.
  const hasMulti = Boolean(
    project.captions?.tiktok?.caption ||
      project.captions?.linkedin?.caption ||
      project.captions?.instagram?.caption ||
      project.captionMeta?.captions?.tiktok?.caption
  );

  if (!hasMulti) {
    // Caption legacy (un solo texto). Mostrar como antes.
    return (
      <div className="border-t border-foreground/10 bg-muted/30 p-4">
        <h4 className="mb-1.5 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
          Caption viral generado (referencia)
        </h4>
        <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/90">
          {project.caption}
        </pre>
      </div>
    );
  }

  const activeText = pickCaptionForPlatform(project, active);
  const activeLen = activeText.length;
  // Límites aproximados por red para mostrar barra de uso.
  const limit = active === "tiktok" ? 2200 : active === "linkedin" ? 3000 : 2200;

  async function copy() {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(active);
      toast.success(`Caption ${PLATFORM_TABS.find((t) => t.key === active)?.label} copiado`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <div className="border-t border-foreground/10 bg-muted/30">
      <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-1.5">
        <div className="flex gap-0.5">
          {PLATFORM_TABS.map((tab) => {
            const hasVariant = pickCaptionForPlatform(project, tab.key) !== (project.caption ?? "")
              || tab.key === "tiktok"; // tiktok siempre es el default mostrable
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className={cn(
                  "rounded px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider transition-colors",
                  active === tab.key
                    ? `bg-foreground/10 ${tab.color}`
                    : "text-muted-foreground hover:text-foreground",
                  !hasVariant && "opacity-40"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-emerald-400"
        >
          {copied === active ? (
            <Check className="h-3 w-3 animate-in zoom-in-50 duration-200 text-primary" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          copiar
        </button>
      </div>
      <div className="max-h-[40vh] overflow-y-auto p-3">
        <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/90">
          {activeText || "(sin caption para esta plataforma)"}
        </pre>
      </div>
      <p className="border-t border-foreground/10 px-3 py-1 font-mono-tab text-[9px] text-muted-foreground">
        {activeLen} / {limit} chars
      </p>
    </div>
  );
}
