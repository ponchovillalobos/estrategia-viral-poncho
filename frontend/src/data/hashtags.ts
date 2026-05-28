import type { PlatformKey } from "@/lib/platforms";

export type WeekKey = "s1" | "s2" | "s3" | "s4";

export const HASHTAGS: Record<PlatformKey, Record<WeekKey, string[]>> = {
  tiktok: {
    s1: ["#ventas", "#ventasconia", "#chatgpt", "#ventasb2b", "#emprendedores", "#salestips"],
    s2: ["#ventas", "#ventasconia", "#claude", "#neuroventas", "#copywriting", "#cierredeventas"],
    s3: ["#ventas", "#ventasconia", "#vendedoresprofesionales", "#salesai", "#prospectos", "#chatgpt"],
    s4: ["#ventas", "#ventasconia", "#emprendedoresdigitales", "#crm", "#leadgen", "#salesai"],
  },
  instagram: {
    s1: [
      "#ventasconia", "#salesai", "#ventasb2b", "#copywriting", "#neuroventas",
      "#chatgpt", "#claude", "#ia", "#inteligenciaartificial", "#ventasprofesionales",
      "#consultordeventas", "#cierredeventas", "#emprendedoresdigitales", "#empresaspymes",
      "#prospeccion", "#salesenablement",
    ],
    s2: [
      "#ventasconia", "#salesai", "#ventasb2b", "#copywriting", "#neuroventas",
      "#chatgpt", "#claude", "#ia", "#inteligenciaartificial", "#frameworkventas",
      "#spin", "#cierredeventas", "#emprendedoresdigitales", "#freelance",
      "#prospeccion", "#discoverycall",
    ],
    s3: [
      "#ventasconia", "#salesai", "#ventasb2b", "#copywriting", "#colaboracion",
      "#chatgpt", "#claude", "#ia", "#inteligenciaartificial", "#followups",
      "#coldcall", "#cierredeventas", "#emprendedoresdigitales", "#vendedoresreales",
      "#prospeccion", "#salesenablement",
    ],
    s4: [
      "#ventasconia", "#salesai", "#ventasb2b", "#casosreales", "#testimonios",
      "#chatgpt", "#claude", "#ia", "#inteligenciaartificial", "#mentoria",
      "#roi", "#cierredeventas", "#emprendedoresdigitales", "#metricas",
      "#prospeccion", "#salesenablement",
    ],
  },
  linkedin: {
    s1: ["#VentasB2B", "#InteligenciaArtificial", "#LiderazgoComercial", "#SalesEnablement", "#ChatGPT"],
    s2: ["#VentasB2B", "#IAaplicada", "#NeuroVentas", "#SalesOps", "#TransformacionDigital"],
    s3: ["#VentasB2B", "#AIforSales", "#LiderazgoComercial", "#Productividad", "#Mentoria"],
    s4: ["#VentasB2B", "#CasoDeEstudio", "#ROI", "#ResultadosReales", "#WorkshopComercial"],
  },
  facebook: {
    s1: ["#ventas", "#emprendedores", "#chatgpt", "#ia", "#negocios", "#marketing"],
    s2: ["#ventas", "#emprendedores", "#claude", "#ia", "#freelance", "#prospeccion"],
    s3: ["#ventas", "#colaboraciones", "#emprendedores", "#ia", "#followup", "#coldcall"],
    s4: ["#ventas", "#casoreales", "#mentoria", "#ia", "#testimonios", "#cierre"],
  },
};

export function weekFromDay(day: number): WeekKey {
  if (day <= 7) return "s1";
  if (day <= 14) return "s2";
  if (day <= 21) return "s3";
  return "s4";
}
