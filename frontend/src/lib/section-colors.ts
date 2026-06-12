// Paleta de colores por sección — match exacto con los colors del TabNav.
// Single source of truth para que un cambio aquí se refleje en nav + headers.

export const SECTION_COLORS = {
  inicio: "#34d399",      // emerald
  editor: "#06b6d4",      // cyan
  produccion: "#f59e0b",  // amber
  metricas: "#a78bfa",    // violet
  largos: "#ec4899",      // fuchsia
  research: "#fb7185",    // rose
} as const;

export type SectionKey = keyof typeof SECTION_COLORS;
