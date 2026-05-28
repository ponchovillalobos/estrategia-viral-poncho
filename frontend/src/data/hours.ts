import type { PlatformKey } from "@/lib/platforms";

export type Weekday = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

export interface Hours {
  schedule: Record<Weekday, string[]>;
  tip: string;
}

export const HOURS: Record<PlatformKey, Hours> = {
  tiktok: {
    schedule: {
      lun: ["19:00", "20:30"],
      mar: ["19:00", "20:30"],
      mie: ["19:30", "21:00"],
      jue: ["19:00", "21:00"],
      vie: ["18:00", "20:00"],
      sab: ["11:00", "13:00", "20:00"],
      dom: ["11:30", "13:00", "20:00"],
    },
    tip: "Hora pico LatAm: 19–21h lun–jue.",
  },
  instagram: {
    schedule: {
      lun: ["12:00", "19:30"],
      mar: ["12:00", "20:00"],
      mie: ["13:00", "19:30"],
      jue: ["12:00", "20:00"],
      vie: ["12:30", "18:30"],
      sab: ["10:30", "19:00"],
      dom: ["10:30", "19:00"],
    },
    tip: "Reels rinden mejor 19–21h. Carruseles al mediodía.",
  },
  linkedin: {
    schedule: {
      lun: ["07:30", "17:30"],
      mar: ["07:30", "12:30"],
      mie: ["08:00", "12:30"],
      jue: ["07:30", "17:30"],
      vie: ["08:00", "12:00"],
      sab: [],
      dom: [],
    },
    tip: "Antes de oficina y después del almuerzo. No publicar fin de semana.",
  },
  facebook: {
    schedule: {
      lun: ["20:00"],
      mar: ["20:00"],
      mie: ["20:30"],
      jue: ["20:00"],
      vie: ["19:30"],
      sab: ["11:00", "21:00"],
      dom: ["19:00"],
    },
    tip: "Audiencia mayor: 20–22h.",
  },
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  lun: "Lun",
  mar: "Mar",
  mie: "Mié",
  jue: "Jue",
  vie: "Vie",
  sab: "Sáb",
  dom: "Dom",
};
