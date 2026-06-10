"use client";

// Thumbnails dinámicos de videos raw (sizes flexibles).
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, ChevronLeft, ChevronRight, FileVideo, Mic, Sparkles, Music2, Camera, Briefcase, Send } from "lucide-react";
import { toast } from "sonner";
import { StyleMiniDemo } from "@/components/editor/wizard/style-mini-demo";
import { CinematicStep } from "@/components/editor/wizard/cinematic-step";
import { HelpHint } from "@/components/ui/help-hint";
import { Confetti } from "@/components/ui/confetti";
import {
  Montserrat, Poppins, Oswald, Bangers, Luckiest_Guy, Archivo_Black, Teko, Righteous,
  Bebas_Neue, Anton,
} from "next/font/google";

// Fuentes auto-hospedadas por Next (gratis, sin API key) SOLO para previsualizar cada
// tipografía en su propio estilo dentro del selector. El render real las carga aparte
// en Remotion. Así el usuario VE cómo se ve cada fuente, no solo el nombre.
const _mont = Montserrat({ subsets: ["latin"], weight: "700", display: "swap" });
const _pop = Poppins({ subsets: ["latin"], weight: "700", display: "swap" });
const _osw = Oswald({ subsets: ["latin"], weight: "600", display: "swap" });
const _ban = Bangers({ subsets: ["latin"], weight: "400", display: "swap" });
const _luck = Luckiest_Guy({ subsets: ["latin"], weight: "400", display: "swap" });
const _arch = Archivo_Black({ subsets: ["latin"], weight: "400", display: "swap" });
const _teko = Teko({ subsets: ["latin"], weight: "600", display: "swap" });
const _right = Righteous({ subsets: ["latin"], weight: "400", display: "swap" });
const _bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", display: "swap" });
const _anton = Anton({ subsets: ["latin"], weight: "400", display: "swap" });

const FONT_PREVIEW: Record<string, string> = {
  auto: "",
  bebas: _bebas.style.fontFamily,
  anton: _anton.style.fontFamily,
  montserrat: _mont.style.fontFamily,
  poppins: _pop.style.fontFamily,
  oswald: _osw.style.fontFamily,
  bangers: _ban.style.fontFamily,
  luckiest: _luck.style.fontFamily,
  archivo: _arch.style.fontFamily,
  teko: _teko.style.fontFamily,
  righteous: _right.style.fontFamily,
};

type StyleId = "silent" | "punch" | "hype" | "hype_max" | "hype_max_sfx" | "supreme" | "broll_full" | "broll_pip" | "text_behind" | "graphics_pro" | "graphics_max" | "motion_pro" | "motion_beat" | "motion_grid";
type PlatformId = "tiktok" | "instagram" | "linkedin" | "facebook";

interface VideoEntry {
  id: string;
  filename: string;
  sizeMb: number;
  durationSec: number | null;
  status: { transcribed: boolean; cuts: boolean; rendered: boolean };
}

interface CaptionMeta {
  caption_short?: string;
  caption_long?: string;
  hashtags_tiktok?: string[];
  hashtags_instagram?: string[];
  hashtags_linkedin?: string[];
  hashtags_facebook?: string[];
  _provider?: string;
  _model?: string;
}

const PLATFORMS_META: { id: PlatformId; label: string; icon: typeof Music2; color: string }[] = [
  { id: "instagram", label: "Instagram", icon: Camera, color: "#f59e0b" },
  { id: "linkedin", label: "LinkedIn", icon: Briefcase, color: "#38bdf8" },
];

const TOTAL_STEPS = 5;

// Nombres en lenguaje de principiante (no los codenames internos). `recommended` marca
// el más fácil/rápido para un primer video. Orden: el recomendado primero.
const STYLES: { id: StyleId; name: string; tagline: string; emoji: string; recommended?: boolean }[] = [
  { id: "hype", name: "Viral", tagline: "Subtítulos grandes y dinámicos, estilo videos de YouTube. La mejor opción para empezar.", emoji: "🔥", recommended: true },
  { id: "punch", name: "Impacto", tagline: "Resalta las frases clave en los momentos importantes.", emoji: "🥊" },
  { id: "hype_max", name: "Viral intenso", tagline: "Suma cortes rápidos y zooms de reacción. Más energía.", emoji: "⚡" },
  { id: "hype_max_sfx", name: "Viral con sonidos", tagline: "Lo más llamativo: agrega efectos de sonido en los momentos clave.", emoji: "🎵" },
  { id: "supreme", name: "Premium", tagline: "Todo activado, la máxima calidad. Tarda un poco más.", emoji: "👑" },
  { id: "silent", name: "Limpio", tagline: "Solo subtítulos, sin efectos. Sobrio y profesional.", emoji: "🤍" },
  { id: "broll_full", name: "Con videos de apoyo", tagline: "Agrega clips de archivo a pantalla completa según lo que decís.", emoji: "🎞️" },
  { id: "broll_pip", name: "Videos de apoyo (chico)", tagline: "Muestra clips de archivo en pequeño sobre tu video.", emoji: "🖼️" },
  { id: "text_behind", name: "Texto detrás de vos", tagline: "Efecto CapCut clásico: una palabra grande queda DETRÁS del sujeto.", emoji: "🧍" },
  { id: "graphics_pro", name: "Gráficos & Motion", tagline: "Suma gráficas animadas y titulares poderosos (de lo que decís) + zooms y transiciones.", emoji: "📊" },
  { id: "graphics_max", name: "Gráficos Max", tagline: "Gráficos al máximo: cortes rápidos, zooms de reacción y stutter. La más intensa.", emoji: "📈" },
  { id: "motion_pro", name: "Motion Pro", tagline: "Animación pura y LIMPIA: fondo aurora que pulsa con la música, gráficas, sin emojis.", emoji: "✨" },
  { id: "motion_beat", name: "Motion Beat", tagline: "El fondo late al ritmo de la música (gradiente vivo) + zooms al beat. Limpio y con energía.", emoji: "🎧" },
  { id: "motion_grid", name: "Motion Grid", tagline: "Look retro-tech futurista: cuadrícula en perspectiva + gráficas. Sin emojis.", emoji: "🌐" },
];

// Fuentes de subtítulo disponibles (Google Fonts gratis). "auto" = la del estilo.
const SUBTITLE_FONTS: { id: string; name: string }[] = [
  { id: "auto", name: "Automática" },
  { id: "bebas", name: "Bebas (clásica)" },
  { id: "anton", name: "Anton (peso)" },
  { id: "montserrat", name: "Montserrat (limpia)" },
  { id: "poppins", name: "Poppins (redonda)" },
  { id: "oswald", name: "Oswald (condensada)" },
  { id: "bangers", name: "Bangers (cómic)" },
  { id: "luckiest", name: "Luckiest Guy (divertida)" },
  { id: "archivo", name: "Archivo Black (sólida)" },
  { id: "teko", name: "Teko (fina alta)" },
  { id: "righteous", name: "Righteous (retro)" },
];

// Nombre humano de un estilo a partir de su id (acepta "videoId::style" del progreso).
function humanStyleName(rawId: string): string {
  const id = rawId.includes("::") ? rawId.split("::").pop()! : rawId;
  return STYLES.find((s) => s.id === id)?.name ?? id;
}

// Color del TEXTO de los subtítulos ("auto" = blanco / el del estilo). Colores
// brillantes pensados para leerse sobre video con sombra/borde oscuro.
const SUBTITLE_COLORS: { id: string; name: string; value: string }[] = [
  { id: "auto", name: "Automático", value: "#ffffff" },
  { id: "#ffffff", name: "Blanco", value: "#ffffff" },
  { id: "#fde047", name: "Amarillo", value: "#fde047" },
  { id: "#fbbf24", name: "Ámbar", value: "#fbbf24" },
  { id: "#6ee7b7", name: "Menta", value: "#6ee7b7" },
  { id: "#7dd3fc", name: "Celeste", value: "#7dd3fc" },
  { id: "#f9a8d4", name: "Rosa", value: "#f9a8d4" },
  { id: "#c4b5fd", name: "Lila", value: "#c4b5fd" },
  { id: "#fdba74", name: "Naranja", value: "#fdba74" },
  { id: "#a3e635", name: "Lima", value: "#a3e635" },
];

const PALETTE = [
  { name: "rosa coral", value: "#fb7185", mood: "urgencia" },
  { name: "violeta", value: "#a78bfa", mood: "autoridad" },
  { name: "amarillo", value: "#fbbf24", mood: "claridad" },
  { name: "emerald", value: "#34d399", mood: "crecimiento" },
  { name: "cyan", value: "#22d3ee", mood: "tech" },
  { name: "magenta", value: "#ec4899", mood: "intensidad" },
  { name: "naranja", value: "#fb923c", mood: "acción" },
  { name: "lime", value: "#a3e635", mood: "energía" },
  { name: "indigo", value: "#6366f1", mood: "IA" },
  { name: "violeta claro", value: "#c084fc", mood: "elegancia" },
];

export function WizardClient() {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [rawDir, setRawDir] = useState<string>("");
  const [step, setStep] = useState(1);
  // Multi-select: el wizard procesa N videos a la vez (todos con la misma config).
  // Si seleccionás 3 videos × 2 estilos, se encolan 3 jobs (cola serial: 1 a la vez).
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [selectedStyles, setSelectedStyles] = useState<StyleId[]>(["hype"]);
  const [accent, setAccent] = useState<string>("#fb7185");
  const [subtitleFont, setSubtitleFont] = useState<string>("auto");
  // Color del TEXTO de los subtítulos ("auto" = el del estilo, normalmente blanco).
  const [subtitleColor, setSubtitleColor] = useState<string>("auto");
  // F4 — Vista previa REAL: un frame (o clip de 3s) del video del user con el estilo.
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["instagram", "linkedin"]);
  // Aspect ratio del output. 9:16 vertical (TikTok/Reels) default, 16:9 horizontal (LinkedIn/YouTube).
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  // Plantillas guardables: combos favoritos (estilo+color+fuente+plataformas).
  type Template = { id: string; name: string; styles: string[]; accentColor: string; subtitleFont: string; subtitleColor?: string; platforms: string[]; aspectRatio: "9:16" | "16:9" };
  const [templates, setTemplates] = useState<Template[]>([]);
  const [day, setDay] = useState<string>("");
  const [caption, setCaption] = useState<string>("");
  const [captionMeta, setCaptionMeta] = useState<CaptionMeta | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [building, setBuilding] = useState(false);
  const [importing, setImporting] = useState(false);
  // Configuración del modo cinematográfico (opt-in). Cuando enabled=true, el sistema
  // sube imágenes, convoca asamblea de agentes IA, y aplica film grain + vignette +
  // subtítulos cinematográficos al render.
  const [cinematicConfig, setCinematicConfig] = useState<import("./cinematic-step").CinematicConfig>({
    enabled: false,
    overlayIds: [],
    filmGrain: false,
    vignette: false,
    subtitleStyleCinematic: false,
    assemblyResult: null,
  });
  // Con multi-video, styleId tiene formato "videoId::style" para distinguir el origen
  const [results, setResults] = useState<Array<{ styleId: string; ok: boolean; output?: string; error?: string }>>([]);
  const [jobProgress, setJobProgress] = useState<{
    overallProgress: number;
    currentStyle?: string;
    steps: Array<{
      styleId: string;
      status: string;
      progress: number;
      currentFrame?: number;
      totalFrames?: number;
    }>;
  } | null>(null);

  async function loadVideos() {
    const r = await fetch("/api/videos/list");
    const d = await r.json();
    setVideos(d.videos ?? []);
    if (d.rawDir) setRawDir(d.rawDir);
  }

  // Load on mount: lista de videos raw. Patrón válido aunque el lint quiera use(promise).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVideos();
  }, []);

  const selectedVideoList = videos.filter((v) => selectedVideos.has(v.id));
  const firstSelected = selectedVideoList[0];

  function toggleVideo(id: string) {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Importar videos desde la compu del usuario. Sube por multipart al endpoint
   * /api/videos/import que los copia a RAW_DIR. Después refresca la lista.
   */
  async function importVideos(files: FileList | File[]) {
    setImporting(true);
    let ok = 0, fail = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/videos/import", { method: "POST", body: form });
        if (r.ok) ok++; else fail++;
      }
      if (ok > 0) toast.success(`${ok} video(s) importado(s) ✓`);
      if (fail > 0) toast.error(`${fail} fallaron`);
      loadVideos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function loadTemplates() {
    try {
      const r = await fetch("/api/templates", { cache: "no-store" });
      const d = await r.json();
      setTemplates(Array.isArray(d.templates) ? d.templates : []);
    } catch {
      /* sin plantillas */
    }
  }
  useEffect(() => {
    loadTemplates();
  }, []);

  function applyTemplate(t: Template) {
    setSelectedStyles(t.styles as StyleId[]);
    setAccent(t.accentColor);
    setSubtitleFont(t.subtitleFont || "auto");
    setSubtitleColor(t.subtitleColor || "auto");
    setSelectedPlatforms(t.platforms as PlatformId[]);
    setAspectRatio(t.aspectRatio === "16:9" ? "16:9" : "9:16");
    toast.success(`Plantilla "${t.name}" aplicada`);
  }

  async function saveTemplate() {
    const name = window.prompt("Nombre de la plantilla (ej: Mi estilo viral):");
    if (!name || !name.trim()) return;
    try {
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          styles: selectedStyles,
          accentColor: accent,
          subtitleFont,
          subtitleColor,
          platforms: selectedPlatforms,
          aspectRatio,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "no se pudo guardar");
      toast.success(`Plantilla "${name.trim()}" guardada`);
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!window.confirm(`¿Borrar la plantilla "${name}"?`)) return;
    try {
      await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      loadTemplates();
    } catch {
      /* ignore */
    }
  }

  // F4 — Genera la vista previa real (still del 35% o clip de 3s EN MOVIMIENTO).
  async function generateStylePreview(motion = false) {
    if (!firstSelected || selectedStyles.length === 0) return;
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const r = await fetch("/api/editor/style-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: firstSelected.id,
          styleId: selectedStyles[0],
          accentColor: accent,
          subtitleFont,
          subtitleColor,
          motion,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error ?? "no se pudo generar la vista previa");
      setPreviewIsVideo(Boolean(d.motion));
      setPreviewUrl(`${d.url}&ts=${Date.now()}`);
      if (d.cached) toast.success("Vista previa lista (caché)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleStyle(s: StyleId) {
    setSelectedStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function togglePlatform(p: PlatformId) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  // Avanza al paso 2; transcribe en paralelo los videos no-transcritos del set.
  async function advanceFromStep1() {
    if (selectedVideos.size === 0) return;
    const needsTranscribe = selectedVideoList.filter((v) => !v.status.transcribed);
    if (needsTranscribe.length === 0) {
      setStep(2);
      return;
    }
    setTranscribing(true);
    try {
      const results = await Promise.allSettled(
        needsTranscribe.map((v) =>
          fetch("/api/videos/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: v.id }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(`${v.id}: ${data.error ?? "transcribe falló"}`);
            return { videoId: v.id, words: data.transcript?.words?.length ?? 0 };
          })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (failed.length > 0) {
        for (const f of failed) toast.error(String(f.reason));
      }
      if (ok > 0) toast.success(`${ok}/${needsTranscribe.length} transcripciones listas`);
      await loadVideos();
      if (failed.length === 0) setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscribing(false);
    }
  }

  // Elegí el caption correcto según la primera plataforma seleccionada.
  function captionForPlatforms(copy: CaptionMeta): string {
    const tagJoin = (arr?: string[]) => (arr && arr.length ? "\n\n" + arr.join(" ") : "");
    if (selectedPlatforms.includes("linkedin")) {
      return (copy.caption_long ?? "") + tagJoin(copy.hashtags_linkedin);
    }
    if (selectedPlatforms.includes("instagram")) {
      return (copy.caption_short ?? "") + tagJoin(copy.hashtags_instagram);
    }
    if (selectedPlatforms.includes("facebook")) {
      return (copy.caption_short ?? "") + tagJoin(copy.hashtags_facebook);
    }
    return (copy.caption_short ?? "") + tagJoin(copy.hashtags_tiktok);
  }

  async function generateCaptionAI() {
    // Generamos el caption del PRIMER video del set; los demás se autogeneran
    // por video en el processJob si no traen captionMeta.
    if (!firstSelected) return;
    setGeneratingCaption(true);
    try {
      const res = await fetch(
        `/api/videos/${encodeURIComponent(firstSelected.id)}/generate-caption?provider=auto`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.copy) throw new Error(data.error ?? "no se generó copy");
      const copy = data.copy as CaptionMeta;
      setCaptionMeta(copy);
      setCaption(captionForPlatforms(copy));
      const provider = copy._provider ?? "ia";
      const model = copy._model ?? "";
      toast.success(`Caption viral generado (${provider}${model ? " · " + model : ""})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingCaption(false);
    }
  }

  async function handleBuild() {
    if (selectedVideos.size === 0 || selectedStyles.length === 0) return;
    setBuilding(true);
    setResults([]);
    setJobProgress(null);
    const videoIds = Array.from(selectedVideos);
    try {
      const res = await fetch("/api/editor/auto-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoIds,
          styles: selectedStyles,
          accentColor: accent,
          subtitleFont,
          subtitleColor,
          platforms: selectedPlatforms,
          aspectRatio,
          day: day ? parseInt(day, 10) : undefined,
          caption: caption || undefined,
          captionMeta: captionMeta ?? undefined,
          // Modo cinematográfico (opt-in). Si enabled=false, el render sale idéntico a antes.
          cinematic: cinematicConfig.enabled
            ? {
                overlayIds: cinematicConfig.overlayIds,
                filmGrain: cinematicConfig.filmGrain,
                vignette: cinematicConfig.vignette,
                subtitleCinematic: cinematicConfig.subtitleStyleCinematic,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.jobIds || data.jobIds.length === 0) {
        toast.error(data.error ?? "build falló");
        setBuilding(false);
        return;
      }
      const jobIds: string[] = data.jobIds;
      if (jobIds.length > 1) {
        toast.success(`${jobIds.length} videos encolados — la cola los procesa de a uno`);
      }

      // Polling cada 2s del progreso AGREGADO de todos los jobs.
      // Para tracking individual de cada job, el usuario tiene el QueuePanel global (F2.4).
      const poll = async () => {
        try {
          const responses = await Promise.allSettled(
            jobIds.map((jid) => fetch(`/api/editor/progress?jobId=${jid}`).then((r) => r.json()))
          );
          const jobs = responses
            .filter((r): r is PromiseFulfilledResult<{ job: { status: string; overallProgress: number; currentStyle?: string; steps: { styleId: string; status: string; progress: number; currentFrame?: number; totalFrames?: number; output?: string; error?: string }[] } }> => r.status === "fulfilled" && Boolean(r.value?.job))
            .map((r) => r.value.job);

          if (jobs.length === 0) {
            setTimeout(poll, 3000);
            return;
          }

          // Promedio de overallProgress de todos los jobs
          const avgProgress = Math.round(
            jobs.reduce((acc, j) => acc + j.overallProgress, 0) / jobs.length
          );
          // El "currentStyle" es del primer job running (el otros están queued o ya terminaron)
          const runningJob = jobs.find((j) => j.status === "running");
          // Agregar todos los steps de todos los jobs en una sola lista (prefijando videoId)
          const aggregatedSteps = jobs.flatMap((j, i) =>
            j.steps.map((s) => ({ ...s, styleId: `${videoIds[i]}::${s.styleId}` }))
          );

          setJobProgress({
            overallProgress: avgProgress,
            currentStyle: runningJob?.currentStyle,
            steps: aggregatedSteps,
          });

          const allDone = jobs.every((j) => j.status === "done" || j.status === "failed");
          if (allDone) {
            const allResults = jobs.flatMap((j, i) =>
              j.steps.map((s) => ({
                styleId: `${videoIds[i]}::${s.styleId}`,
                ok: s.status === "ok",
                output: s.output,
                error: s.error,
              }))
            );
            setResults(allResults);
            const okCount = allResults.filter((r) => r.ok).length;
            toast.success(`${okCount}/${allResults.length} renders OK`);
            setBuilding(false);
            setStep(6);
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          setTimeout(poll, 4000);
        }
      };
      poll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBuilding(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper visual — muestra el recorrido completo para que el usuario sepa dónde está.
          Pasos hechos: check verde, paso actual: bg primary con glow, futuros: gris. */}
      <div className="flex items-start gap-1 text-xs sm:gap-2">
        {["Video", "Estilo", "Color", "Redes", "Generar"].map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const current = step === n;
          return (
            <div key={n} className="flex items-start gap-1 sm:gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300",
                    current && "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/40 scale-110",
                    done && "border-primary/60 bg-primary/15 text-primary",
                    !current && !done && "border-border bg-card text-muted-foreground"
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <span
                  className={cn(
                    "text-[10px] transition-colors",
                    current && "font-semibold text-foreground",
                    done && "font-medium text-foreground/80",
                    !current && !done && "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
              {n < TOTAL_STEPS && (
                <div
                  className={cn(
                    "mt-4 h-0.5 w-5 rounded-full transition-colors duration-300 sm:w-8",
                    done ? "bg-gradient-to-r from-primary to-primary/60" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* STEP 1: videos (multi-select) */}
      {step === 1 && (
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium">1. Elegí los videos</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-[10px] text-muted-foreground">
                {selectedVideos.size} de {videos.length} seleccionado{selectedVideos.size === 1 ? "" : "s"}
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">
                {importing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileVideo className="h-3 w-3" />
                )}
                {importing ? "importando…" : "importar desde mi compu"}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
                  multiple
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => e.target.files && importVideos(e.target.files)}
                />
              </label>
            </div>
          </div>

          {videos.length === 0 ? (
            <EmptyState
              icon={FileVideo}
              tone="amber"
              title="No hay videos en tu carpeta de grabaciones"
              description={`Usá «importar desde mi compu» arriba a la derecha o copiá MP4s a ${rawDir || "raw/"}.`}
            />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedVideos(new Set(videos.map((v) => v.id)))}
                  className="rounded border border-border bg-muted/30 px-2 py-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  seleccionar todos ({videos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedVideos(new Set())}
                  disabled={selectedVideos.size === 0}
                  className="rounded border border-border bg-muted/30 px-2 py-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  limpiar
                </button>
                <span className="ml-auto font-mono-tab text-[10px] text-muted-foreground">
                  ↕ scroll para ver más
                </span>
              </div>
              {/* Grid compacto + scroll. Más columnas = thumbs más chicos. */}
              <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border/50 bg-background/30 p-2">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {videos.map((v) => {
                    const sel = selectedVideos.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => toggleVideo(v.id)}
                        className={`group relative flex flex-col overflow-hidden rounded border bg-card text-left transition-all ${
                          sel
                            ? "border-emerald-400 ring-1 ring-emerald-400"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        {sel && (
                          <div className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-black shadow">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          </div>
                        )}
                        <div className="aspect-[9/16] overflow-hidden bg-zinc-900">
                          <img
                            src={`/api/videos/${encodeURIComponent(v.id)}/thumbnail`}
                            alt={v.filename}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="px-1.5 py-1">
                          <p className="line-clamp-1 text-[10px] font-medium" title={v.filename}>
                            {v.filename}
                          </p>
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-mono-tab text-[9px] text-muted-foreground">
                              {v.durationSec
                                ? `${Math.floor(v.durationSec / 60)}:${(Math.floor(v.durationSec % 60))
                                    .toString()
                                    .padStart(2, "0")}`
                                : "?"}
                            </p>
                            {v.status.transcribed ? (
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                            ) : (
                              <Mic className="h-2.5 w-2.5 text-amber-400" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* STEP 2: estilos + aspect ratio */}
      {step === 2 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">2. Elegí estilo(s) y formato</h2>

          {/* Plantillas guardables — aplicar un combo favorito con un click */}
          <div className="mb-5 rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                Mis plantillas
              </p>
              <button
                type="button"
                onClick={saveTemplate}
                className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted"
              >
                💾 Guardar configuración actual
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Guardá tu combo de estilo + color + tipografía + redes para reusarlo con un click.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <span
                    key={t.id}
                    className="group inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs"
                  >
                    <button type="button" onClick={() => applyTemplate(t)} className="hover:text-primary">
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(t.id, t.name)}
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      title="Borrar plantilla"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Aspect ratio toggle */}
          <div className="mb-5">
            <p className="mb-2 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
              Formato de salida
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAspectRatio("9:16")}
                className={`flex items-center gap-3 rounded-md border p-3 transition-all ${
                  aspectRatio === "9:16"
                    ? "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-500/5"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <div className="flex h-10 w-6 items-center justify-center rounded-sm border-2 border-current text-emerald-400 shrink-0">
                  <span className="text-[8px]">9:16</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Vertical 9:16</p>
                  <p className="font-mono-tab text-[10px] text-muted-foreground">
                    TikTok · Reels · Stories
                  </p>
                </div>
                {aspectRatio === "9:16" && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio("16:9")}
                className={`flex items-center gap-3 rounded-md border p-3 transition-all ${
                  aspectRatio === "16:9"
                    ? "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-500/5"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <div className="flex h-6 w-10 items-center justify-center rounded-sm border-2 border-current text-emerald-400 shrink-0">
                  <span className="text-[8px]">16:9</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Horizontal 16:9</p>
                  <p className="font-mono-tab text-[10px] text-muted-foreground">
                    LinkedIn · YouTube · Twitter
                  </p>
                </div>
                {aspectRatio === "16:9" && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" />}
              </button>
            </div>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            Para tu primer video, dejá el <strong className="text-foreground">Recomendado</strong>.
            Podés elegir varios para comparar — se genera uno por cada estilo (cada uno tarda unos minutos).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STYLES.map((s) => {
              const selected = selectedStyles.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStyle(s.id)}
                  className={`relative flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-all ${
                    selected
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {s.recommended && (
                    <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Recomendado
                    </span>
                  )}
                  {/* Mini-demo EN MOVIMIENTO del estilo: se entiende sin leer. */}
                  <StyleMiniDemo styleId={s.id} accent={accent} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {selectedStyles.length === 0
              ? "Elegí al menos un estilo"
              : `${selectedStyles.length} estilo${selectedStyles.length === 1 ? "" : "s"} elegido${selectedStyles.length === 1 ? "" : "s"}`}
          </p>
        </Card>
      )}

      {/* STEP 3: color */}
      {step === 3 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">3. Elegí el color principal</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Este color se usa en todo el video: el resaltado de los subtítulos, los stickers y
            los detalles. Elegí el que mejor vaya con tu marca o tu mensaje.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PALETTE.map((c) => {
              const selected = accent === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setAccent(c.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-all ${
                    selected ? "border-foreground" : "border-border hover:border-foreground/30"
                  }`}
                >
                  <div
                    className="h-12 w-12 rounded-full"
                    style={{ background: c.value, boxShadow: selected ? `0 0 24px ${c.value}66` : "none" }}
                  />
                  <span className="text-xs font-medium">{c.name}</span>
                  <span className="font-mono-tab text-[10px] text-muted-foreground">{c.mood}</span>
                </button>
              );
            })}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-medium">Color del texto de los subtítulos</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            El color de las palabras (el resaltado de la palabra activa usa el color principal de
            arriba). &quot;Automático&quot; usa el del estilo.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SUBTITLE_COLORS.map((c) => {
              const selected = subtitleColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSubtitleColor(c.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${
                    selected ? "border-foreground bg-muted/40 ring-1 ring-foreground/30" : "border-border hover:border-foreground/30"
                  }`}
                >
                  {/* Muestra del color sobre fondo oscuro, como se ve en el video. */}
                  <span
                    className="flex h-8 w-10 items-center justify-center rounded bg-zinc-950 text-sm font-black uppercase"
                    style={{ color: c.value, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                  >
                    {c.id === "auto" ? "Aa" : "Abc"}
                  </span>
                  <span className="text-xs font-medium">{c.name}</span>
                </button>
              );
            })}
          </div>

          {/* Preview en vivo: cómo se ven los subtítulos con color + resaltado + fuente. */}
          <div className="mt-4 flex items-center justify-center rounded-lg bg-zinc-950 px-4 py-5">
            <span
              className="text-3xl font-black uppercase tracking-wide"
              style={{
                color: subtitleColor === "auto" ? "#ffffff" : subtitleColor,
                fontFamily: FONT_PREVIEW[subtitleFont] || undefined,
                textShadow: "0 2px 8px rgba(0,0,0,0.9)",
              }}
            >
              Así se ven{" "}
              <span style={{ color: accent, textShadow: `0 0 18px ${accent}88` }}>tus</span>{" "}
              subtítulos
            </span>
          </div>

          {/* F4 — Vista previa REAL: un frame de TU video con el estilo + color + fuente. */}
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => generateStylePreview(false)}
                disabled={previewLoading || selectedStyles.length === 0}
                className="rounded-md bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/40 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {previewLoading ? "Generando…" : "🎬 Vista previa REAL (foto, ~30s)"}
              </button>
              <button
                type="button"
                onClick={() => generateStylePreview(true)}
                disabled={previewLoading || selectedStyles.length === 0}
                className="rounded-md bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-300 ring-1 ring-violet-500/40 transition hover:bg-violet-500/25 disabled:opacity-50"
              >
                {previewLoading ? "Generando…" : "▶ En MOVIMIENTO (3s, ~1-2 min)"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Tu video con el estilo &quot;{STYLES.find((s) => s.id === selectedStyles[0])?.name ?? "—"}&quot;, el color y la fuente elegidos. La segunda vez es instantánea (caché).
            </p>
            {previewUrl && previewIsVideo && (
              <video
                src={previewUrl}
                autoPlay
                loop
                muted
                playsInline
                className="mx-auto mt-3 max-h-[420px] rounded-lg border border-border shadow-lg"
              />
            )}
            {previewUrl && !previewIsVideo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vista previa del estilo sobre tu video"
                className="mx-auto mt-3 max-h-[420px] rounded-lg border border-border shadow-lg"
              />
            )}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-medium">Tipografía de los subtítulos</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            &quot;Automática&quot; usa la del estilo. O elegí una para darle otra personalidad.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {SUBTITLE_FONTS.map((f) => {
              const selected = subtitleFont === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSubtitleFont(f.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 transition-all ${
                    selected ? "border-foreground bg-muted/40 ring-1 ring-foreground/30" : "border-border hover:border-foreground/30"
                  }`}
                >
                  {/* Miniatura: muestra en la fuente real para que se vea cómo es. */}
                  <span
                    className="text-2xl leading-none"
                    style={{ fontFamily: FONT_PREVIEW[f.id] || undefined }}
                  >
                    {f.id === "auto" ? "Aa" : "Viral"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{f.name}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* STEP 4: plataformas destino */}
      {step === 4 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">4. ¿En qué redes lo vas a publicar?</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            La descripción se adapta a la primera red que elijas: en LinkedIn va una versión
            más larga, y en Instagram una más corta. Siempre podés editarla después.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PLATFORMS_META.map((p) => {
              const selected = selectedPlatforms.includes(p.id);
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                    selected
                      ? "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-500/5"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <Icon className="h-6 w-6" style={{ color: selected ? p.color : undefined }} />
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{p.label}</span>
                    {selected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {selectedPlatforms.length === 0
              ? "Seleccioná al menos una"
              : `${selectedPlatforms.length} plataforma${selectedPlatforms.length === 1 ? "" : "s"} seleccionada${selectedPlatforms.length === 1 ? "" : "s"}`}
          </p>
        </Card>
      )}

      {/* STEP 5: meta + confirmar + caption IA */}
      {step === 5 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-medium">5. Revisá y generá tu video</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Día del plan (opcional)
                  <HelpHint label="Para qué sirve el día del plan">
                    Si seguís el plan de 30 días, podés anotar a qué día corresponde este
                    video para organizarte. Es opcional: dejalo vacío si no lo usás.
                  </HelpHint>
                </Label>
                <Input type="number" min={1} max={30} value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Descripción para tus redes
                  <HelpHint label="Qué es la descripción">
                    Es el texto que acompaña al video cuando lo publicás (lo que la gente lee
                    arriba del video, con hashtags). Podés escribirlo o que la IA lo genere por vos.
                  </HelpHint>
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={generateCaptionAI}
                  disabled={generatingCaption || selectedVideos.size === 0}
                  title="Genera una descripción con hashtags a partir de lo que dice tu video, usando IA."
                >
                  {generatingCaption ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {generatingCaption ? "Generando…" : "✨ Generar con IA"}
                </Button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-border bg-muted/30 p-2 text-sm"
                placeholder="Tocá ✨ Generar con IA para crear la descripción a partir de tu video, o escribila a mano. Si la dejás vacía, se genera sola al crear el video."
              />
              {captionMeta?._provider && (
                <p className="font-mono-tab text-[10px] text-muted-foreground">
                  generado por {captionMeta._provider}
                  {captionMeta._model ? ` · ${captionMeta._model}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Modo cinematográfico = opción avanzada. Plegada por defecto para no abrumar
              a un principiante; quien la necesita la despliega. */}
          {firstSelected && (
            <details className="mt-6 rounded-md border border-border bg-muted/20">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                Opciones avanzadas (opcional) — modo cinematográfico
              </summary>
              <div className="border-t border-border p-4">
                <CinematicStep
                  videoId={firstSelected.id}
                  transcriptPath={
                    firstSelected.status.transcribed
                      ? `${rawDir.replace(/[/\\]raw[/\\]?$/, "")}/transcripts/${firstSelected.id}.json`
                      : null
                  }
                  videoDurationSec={firstSelected.durationSec ?? undefined}
                  value={cinematicConfig}
                  onChange={setCinematicConfig}
                />
              </div>
            </details>
          )}

          <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="mb-2 font-medium">Resumen</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                · Video{selectedVideos.size === 1 ? "" : "s"} ({selectedVideos.size}):{" "}
                <span className="font-mono-tab text-foreground">
                  {Array.from(selectedVideos).slice(0, 3).join(", ")}
                  {selectedVideos.size > 3 && ` +${selectedVideos.size - 3} más`}
                </span>
              </li>
              <li>
                · Estilo{selectedStyles.length === 1 ? "" : "s"}:{" "}
                <span className="text-foreground">{selectedStyles.map(humanStyleName).join(", ")}</span>
              </li>
              <li>
                · Formato:{" "}
                <span className="text-foreground">
                  {aspectRatio === "9:16" ? "Vertical 9:16 (1080×1920)" : "Horizontal 16:9 (1920×1080)"}
                </span>
              </li>
              <li>
                · Color: <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: accent }} />{" "}
                <span className="font-mono-tab text-foreground">{accent}</span>
              </li>
              <li>
                · Plataformas:{" "}
                <span className="text-foreground">{selectedPlatforms.join(", ") || "—"}</span>
              </li>
              <li>· Día: {day || "—"}</li>
              <li>
                · Vas a generar{" "}
                <span className="text-foreground">
                  {selectedVideos.size * selectedStyles.length} video
                  {selectedVideos.size * selectedStyles.length === 1 ? "" : "s"}
                </span>
                {selectedStyles.length > 1 &&
                  ` (${selectedVideos.size} video${selectedVideos.size === 1 ? "" : "s"} en ${selectedStyles.length} estilos)`}
              </li>
              <li className="text-amber-400">
                ⏱️ Va a tardar alrededor de {4 * selectedVideos.size * selectedStyles.length} minutos.
                Se generan de a uno — podés seguir usando la app mientras tanto.
              </li>
              {cinematicConfig.enabled && (
                <li className="text-violet-300">
                  · 🎬 Modo cinematográfico ACTIVO:{" "}
                  <span className="text-foreground">
                    {cinematicConfig.overlayIds.length} imagen(es)
                    {cinematicConfig.filmGrain ? " · film grain" : ""}
                    {cinematicConfig.vignette ? " · vignette" : ""}
                    {cinematicConfig.subtitleStyleCinematic ? " · subs cine" : ""}
                  </span>
                </li>
              )}
            </ul>
          </div>

          <Button onClick={handleBuild} disabled={building} className="mt-4 w-full">
            {building ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Renderizando…
              </>
            ) : (
              <>
                Generar y renderizar
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>

          {building && jobProgress && (
            <div className="mt-6 space-y-4">
              {/* Barra global */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Generando tus videos…
                  </span>
                  <span className="font-mono-tab text-primary">
                    {jobProgress.overallProgress}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 shadow-[0_0_18px_rgba(52,211,153,0.55)] transition-all duration-500"
                    style={{ width: `${jobProgress.overallProgress}%` }}
                  />
                </div>
              </div>

              {/* Por estilo */}
              <ul className="space-y-2">
                {jobProgress.steps.map((step) => (
                  <li key={step.styleId} className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {step.status === "ok" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : step.status === "fail" ? (
                          <span className="h-3.5 w-3.5 text-red-400">✗</span>
                        ) : step.status === "rendering" || step.status === "building" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground" />
                        )}
                        <span className="font-medium">{humanStyleName(step.styleId)}</span>
                        <span className="text-muted-foreground">
                          {step.status === "ok"
                            ? "· listo"
                            : step.status === "fail"
                              ? "· falló"
                              : step.status === "building"
                                ? "· preparando…"
                                : step.status === "rendering"
                                  ? "· generando…"
                                  : "· en espera"}
                        </span>
                      </div>
                      <span className="font-mono-tab text-muted-foreground">
                        {step.progress}%
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all duration-500 ${
                          step.status === "ok"
                            ? "bg-emerald-400"
                            : step.status === "fail"
                              ? "bg-red-400"
                              : "bg-emerald-400/60"
                        }`}
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* STEP 6: resultados — cierre celebratorio */}
      {step === 6 && (
        <Card className="border-border bg-card p-6">
          {results.some((r) => r.ok) && <Confetti />}
          {(() => {
            const okCount = results.filter((r) => r.ok).length;
            const allOk = okCount === results.length && okCount > 0;
            return (
              <div className="mb-5 px-2 text-center sm:px-0">
                <div className="mx-auto mb-2 text-3xl sm:text-5xl">
                  {allOk ? "🎉" : okCount > 0 ? "✅" : "⚠️"}
                </div>
                <h2 className="text-xl font-semibold sm:text-2xl">
                  {okCount === 0
                    ? "No se pudo generar el video"
                    : okCount === 1
                      ? "¡Tu video está listo!"
                      : `¡Listo! Se generaron ${okCount} videos`}
                </h2>
                {okCount > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ya podés verlo y publicarlo en tus redes.
                  </p>
                )}
              </div>
            );
          })()}
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-md border p-3 text-sm ${
                  r.ok ? "border-primary/40 bg-primary/5" : "border-red-500/40 bg-red-500/5"
                }`}
              >
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <span className="h-4 w-4 text-red-400">✗</span>
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {humanStyleName(r.styleId)} {r.ok ? "· listo" : "· falló"}
                  </p>
                  {r.error && <p className="text-[10px] text-red-400">{r.error.slice(0, 200)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/produccion"
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
              Ver mis videos y publicar
            </Link>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setStep(1);
                setResults([]);
                setSelectedVideos(new Set());
                setCaption("");
                setCaptionMeta(null);
                setSelectedPlatforms(["instagram", "linkedin"]);
                setJobProgress(null);
              }}
            >
              <FileVideo className="mr-1.5 h-4 w-4" />
              Crear otro video
            </Button>
          </div>
        </Card>
      )}

      {/* Navegación */}
      {step < 6 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || building || transcribing}
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Atrás
          </Button>
          {step < 5 && (
            <Button
              onClick={step === 1 ? advanceFromStep1 : () => setStep(step + 1)}
              disabled={
                transcribing ||
                (step === 1 && selectedVideos.size === 0) ||
                (step === 2 && selectedStyles.length === 0) ||
                (step === 4 && selectedPlatforms.length === 0)
              }
            >
              {step === 1 && transcribing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Transcribiendo…
                </>
              ) : (
                <>
                  Siguiente
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
