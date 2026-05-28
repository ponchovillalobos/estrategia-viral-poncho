"use client";

import { HelpCircle } from "lucide-react";

/**
 * Ayuda contextual: un ícono "?" que muestra una explicación breve al pasar el mouse
 * o al enfocarlo con el teclado. Sin dependencias (CSS puro), accesible. Pensado para
 * desarmar la jerga: poné un HelpHint al lado de términos como "estilo", "subtítulos",
 * "B-roll" con una frase simple en lenguaje de principiante.
 */
export function HelpHint({
  children,
  label = "Más información",
  width = "w-60",
}: {
  children: React.ReactNode;
  label?: string;
  width?: string;
}) {
  return (
    <span className="group/hh relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 ${width} -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/hh:opacity-100 group-focus-within/hh:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}
