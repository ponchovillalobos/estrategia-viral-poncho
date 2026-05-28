import type { PlatformKey } from "@/lib/platforms";

export interface WeekKPI {
  week: 1 | 2 | 3 | 4;
  views: number;
  er: number;
  follows: number;
  comments: number;
  saves?: number;
  impressions?: number;
}

export const KPIS: Record<PlatformKey, { primary: boolean; weeks: WeekKPI[] }> = {
  tiktok: {
    primary: true,
    weeks: [
      { week: 1, views: 5000, er: 4.0, follows: 30, comments: 10 },
      { week: 2, views: 15000, er: 5.0, follows: 80, comments: 18 },
      { week: 3, views: 30000, er: 5.5, follows: 150, comments: 25 },
      { week: 4, views: 50000, er: 6.0, follows: 250, comments: 35 },
    ],
  },
  instagram: {
    primary: false,
    weeks: [
      { week: 1, views: 3000, er: 3.5, follows: 20, comments: 6, saves: 3 },
      { week: 2, views: 8000, er: 4.0, follows: 50, comments: 12, saves: 8 },
      { week: 3, views: 18000, er: 4.5, follows: 100, comments: 18, saves: 12 },
      { week: 4, views: 30000, er: 5.0, follows: 180, comments: 25, saves: 15 },
    ],
  },
  linkedin: {
    primary: false,
    weeks: [
      { week: 1, views: 0, impressions: 2000, er: 5.0, follows: 15, comments: 5 },
      { week: 2, views: 0, impressions: 6000, er: 6.0, follows: 35, comments: 10 },
      { week: 3, views: 0, impressions: 15000, er: 7.0, follows: 70, comments: 18 },
      { week: 4, views: 0, impressions: 30000, er: 8.0, follows: 130, comments: 30 },
    ],
  },
  facebook: {
    primary: false,
    weeks: [
      { week: 1, views: 1000, er: 2.5, follows: 8, comments: 3 },
      { week: 2, views: 3000, er: 3.0, follows: 20, comments: 7 },
      { week: 3, views: 7000, er: 3.5, follows: 45, comments: 12 },
      { week: 4, views: 12000, er: 4.0, follows: 80, comments: 18 },
    ],
  },
};

export interface GlobalKPI {
  label: string;
  value: string;
  hint: string;
}

export const GLOBAL_KPIS: GlobalKPI[] = [
  { label: "Posts totales", value: "95", hint: "30 TT · 30 IG · 16 LI · 19 FB" },
  { label: "Views meta TT", value: "50K", hint: "acumuladas mes 1" },
  { label: "Follows meta TT", value: "+250", hint: "audiencia primaria" },
  { label: "Conversaciones DM", value: "5+", hint: "venta iniciada mes 1" },
];
