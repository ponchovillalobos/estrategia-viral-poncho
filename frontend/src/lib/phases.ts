export type PhaseKey = "validacion" | "doble_down" | "amplificacion" | "conversion";

export interface Phase {
  key: PhaseKey;
  label: string;
  week: 1 | 2 | 3 | 4;
  days: [number, number];
  color: string;
  cssVar: string;
  narrative: string;
}

export const PHASES: Record<PhaseKey, Phase> = {
  validacion: {
    key: "validacion",
    label: "Validación",
    week: 1,
    days: [1, 7],
    color: "#fbbf24",
    cssVar: "--phase-validacion",
    narrative: "Probar 7 hooks distintos. Detectar qué ángulo engancha.",
  },
  doble_down: {
    key: "doble_down",
    label: "Doble down",
    week: 2,
    days: [8, 14],
    color: "#a78bfa",
    cssVar: "--phase-doble-down",
    narrative: "Ampliar lo que funcionó en S1. Series + frameworks.",
  },
  amplificacion: {
    key: "amplificacion",
    label: "Amplificación",
    week: 3,
    days: [15, 21],
    color: "#34d399",
    cssVar: "--phase-amplificacion",
    narrative: "Colaboraciones + behind-the-scenes. Comunidad.",
  },
  conversion: {
    key: "conversion",
    label: "Conversión",
    week: 4,
    days: [22, 30],
    color: "#60a5fa",
    cssVar: "--phase-conversion",
    narrative: "Casos + testimonios + oferta.",
  },
};

export function phaseFromDay(day: number): Phase {
  if (day <= 7) return PHASES.validacion;
  if (day <= 14) return PHASES.doble_down;
  if (day <= 21) return PHASES.amplificacion;
  return PHASES.conversion;
}
