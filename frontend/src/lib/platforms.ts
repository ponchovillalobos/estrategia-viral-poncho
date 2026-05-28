export type PlatformKey = "tiktok" | "instagram" | "linkedin" | "facebook";

export interface Platform {
  key: PlatformKey;
  label: string;
  color: string;
  cssVar: string;
  primary: boolean;
  hashtagsPerPost: string;
  format: string;
  notes: string;
}

export const PLATFORMS: Record<PlatformKey, Platform> = {
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    color: "#ec4899",
    cssVar: "--platform-tiktok",
    primary: true,
    hashtagsPerPost: "5–8",
    format: "Video 9:16, 30–60s",
    notes: "Publicar nativo, no programado. Pico LatAm 19–21h lun–jue.",
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    color: "#f59e0b",
    cssVar: "--platform-instagram",
    primary: false,
    hashtagsPerPost: "15–20",
    format: "Reel o Carrusel 6–9 slides",
    notes: "Reels mejor 19–21h. Carruseles al mediodía.",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    color: "#38bdf8",
    cssVar: "--platform-linkedin",
    primary: false,
    hashtagsPerPost: "3–5",
    format: "Post 500–1200 chars",
    notes: "Antes de oficina (07:30) y post-almuerzo (12:30 / 17:30). No fin de semana.",
  },
  facebook: {
    key: "facebook",
    label: "Facebook",
    color: "#818cf8",
    cssVar: "--platform-facebook",
    primary: false,
    hashtagsPerPost: "5–10",
    format: "Repost del Reel IG + copy extendido",
    notes: "Audiencia +35. Pico 20–22h.",
  },
};

// El dashboard muestra solo las redes con publicación conectable: Instagram y LinkedIn.
// TikTok y Facebook quedan en el modelo de datos (tipo + calendario/hashtags/métricas) y,
// en el caso de TikTok, con todo su código OAuth/upload intacto pero oculto del UI
// (pendiente de la auditoría de TikTok). Re-agregar acá para volver a mostrarlos.
export const PLATFORM_ORDER: PlatformKey[] = ["instagram", "linkedin"];

export function isPlatformKey(value: string): value is PlatformKey {
  return value in PLATFORMS;
}
