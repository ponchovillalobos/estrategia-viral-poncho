"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Montserrat,
  Poppins,
  Oswald,
  Bangers,
  Luckiest_Guy,
  Archivo_Black,
  Teko,
  Righteous,
  Bebas_Neue,
  Anton,
} from "next/font/google";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileVideo,
  FolderOpen,
  Loader2,
  Play,
  RefreshCcw,
  Scissors,
  Sparkles,
  XCircle,
  Music2,
  Camera,
  Briefcase,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StyleMiniDemo } from "@/components/editor/wizard/style-mini-demo";

// ─── Fuentes para el preview (mismas que el wizard de shorts; gratis, self-host) ──
const _mont = Montserrat({ subsets: ["latin"], weight: "800", display: "swap" });
const _pop = Poppins({ subsets: ["latin"], weight: "800", display: "swap" });
const _osw = Oswald({ subsets: ["latin"], weight: "700", display: "swap" });
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

// Color del TEXTO de los subtítulos ("auto" = el del estilo, normalmente blanco).
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

// ─── Tipos ────────────────────────────────────────────────────────────────

type StyleId =
  | "silent" | "punch" | "hype" | "hype_max" | "hype_max_sfx" | "supreme"
  | "graphics_pro" | "graphics_max"
  | "motion_pro" | "motion_beat" | "motion_grid";
type PlatformId = "tiktok" | "instagram" | "linkedin" | "facebook";

interface RawVideoEntry {
  videoId: string;
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
  hasTranscript: boolean;
  hasClean: boolean;
  hasProposals: boolean;
  clipsExtracted: number;
  rendersAvailable: number;
}

interface ListResponse {
  rawDir: string;
  videos: RawVideoEntry[];
  orphans: RawVideoEntry[];
}

interface JobStep {
  key: string;
  label: string;
  status: "pending" | "running" | "ok" | "fail" | "skipped";
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface JobState {
  id: string;
  videoId: string;
  videoPath: string;
  options: {
    model?: string;
    render: boolean;
    maxClips?: number;
    skipTranscribe?: boolean;
    useHeuristic?: boolean;
    styles?: string[];
    accentColor?: string;
    platforms?: string[];
  };
  startedAt: number;
  finishedAt?: number;
  status: "running" | "done" | "failed";
  overallProgress: number;
  steps: JobStep[];
  log: string[];
  clipsCount?: number;
}

interface ProposalClip {
  index?: number;
  slug?: string;
  title?: string;
  hook?: string;
  theme?: string;
  keywords?: string[];
  start: number;
  end: number;
  duration?: number;
  viralityScore?: number;
  viralityReasons?: string[];
}

interface ProposalsResponse {
  video_id?: string;
  clips: ProposalClip[];
  fallback_heuristic?: boolean;
}

// ─── Constantes (replica de wizard-client.tsx) ────────────────────────────

const STYLES: { id: StyleId; name: string; tagline: string; emoji: string }[] = [
  { id: "supreme", name: "Supreme", tagline: "Premium full-stack (default largos)", emoji: "👑" },
  { id: "silent", name: "Silent", tagline: "Limpio, sin distracciones", emoji: "🤍" },
  { id: "punch", name: "Punch", tagline: "Impacto en momentos clave", emoji: "🥊" },
  { id: "hype", name: "Hype", tagline: "Estilo MrBeast viral", emoji: "🔥" },
  { id: "hype_max", name: "Hype Max", tagline: "+ jump cuts + reaction zooms", emoji: "⚡" },
  { id: "hype_max_sfx", name: "Hype Max SFX", tagline: "Premium con sonidos", emoji: "🎵" },
  { id: "graphics_pro", name: "Gráficos & Motion", tagline: "Charts + íconos + karaoke", emoji: "📊" },
  { id: "graphics_max", name: "Gráficos Max", tagline: "Gráficos + la edición más intensa", emoji: "📈" },
  { id: "motion_pro", name: "Motion Pro", tagline: "Animación pura y limpia, sin emojis", emoji: "✨" },
  { id: "motion_beat", name: "Motion Beat", tagline: "El fondo late con la música", emoji: "🎧" },
  { id: "motion_grid", name: "Motion Grid", tagline: "Retro-tech: cuadrícula + gráficas", emoji: "🌐" },
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

const PLATFORMS_META: { id: PlatformId; label: string; icon: typeof Music2; color: string }[] = [
  { id: "instagram", label: "Instagram", icon: Camera, color: "#f59e0b" },
  { id: "linkedin", label: "LinkedIn", icon: Briefcase, color: "#38bdf8" },
];

const TOTAL_STEPS = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ─── Componente ───────────────────────────────────────────────────────────

export function LongFormWizard() {
  // ─── State del listado + job ────────────────────────────────────────────
  const [list, setList] = useState<ListResponse | null>(null);
  // Multi-select: el wizard de largos también acepta varios videos.
  // La cola serial procesa de a uno; el JobView muestra el primero activo.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingPath, setImportingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [proposals, setProposals] = useState<ProposalsResponse | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // ─── State del wizard (6 pasos) ─────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [useHeuristic, setUseHeuristic] = useState(false); // default: modo inteligente (encuentra lo viral)
  const [graphicsMode, setGraphicsMode] = useState(false); // Modo Gráficos & Motion (charts + titulares)
  const [maxClips, setMaxClips] = useState<string>("");
  const [ollamaModel, setOllamaModel] = useState<string>("");
  const [skipTranscribe, setSkipTranscribe] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<StyleId[]>(["supreme"]);
  const [accent, setAccent] = useState<string>("#fb7185");
  // Fuente + color del TEXTO de subtítulos (paridad con el wizard de shorts).
  const [subtitleFont, setSubtitleFont] = useState<string>("auto");
  const [subtitleColor, setSubtitleColor] = useState<string>("auto");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["tiktok", "instagram"]);
  const [doRender, setDoRender] = useState(true);
  // Aspect ratio. Para largos default 9:16 también (extract_clips hace center-crop si el source es 16:9).
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  // Face tracking: si el aspect cambia, ¿centrar el crop en la cara detectada?
  const [faceTracking, setFaceTracking] = useState<"off" | "single" | "per-frame">("single");

  const pollRef = useRef<number | null>(null);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/long_form/list");
      const data = (await r.json()) as ListResponse;
      setList(data);
      // Auto-seleccionar el primero si la lista está vacía (UX mejorada)
      if (selectedIds.size === 0 && data.videos.length > 0) {
        setSelectedIds(new Set([data.videos[0].videoId]));
      }
    } catch (err) {
      toast.error(`No se pudo cargar la lista: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoadingList(false);
    }
  }, [selectedIds.size]);

  function toggleVideo(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Límite práctico para subir por HTTP. Más que esto, el navegador buffea el archivo en
  // memoria y la subida se trunca (un curso de 80 min en HEVC pesa ~10 GB). Para esos,
  // mejor «importar por ruta» (copia/hardlink por filesystem, sin pasar por HTTP).
  const HTTP_UPLOAD_MAX = 1.5 * 1024 * 1024 * 1024; // 1.5 GB

  // Sube videos largos desde la compu del usuario (multipart) → /api/long_form/import → LF_RAW.
  async function importVideos(files: FileList | File[]) {
    const arr = Array.from(files);
    const tooBig = arr.find((f) => f.size > HTTP_UPLOAD_MAX);
    if (tooBig) {
      toast.error(
        `«${tooBig.name}» pesa ${(tooBig.size / 1024 / 1024 / 1024).toFixed(1)} GB — demasiado para subir por el navegador. ` +
          `Usá «Importar por ruta» abajo y pegá la ubicación del archivo.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setImporting(true);
    let ok = 0;
    try {
      for (const file of arr) {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/long_form/import", { method: "POST", body: form });
        if (r.ok) {
          ok++;
        } else {
          // Mostrar el motivo real (ej. «video incompleto/corrupto, resubilo»).
          const data = (await r.json().catch(() => ({}))) as { error?: string };
          toast.error(`${file.name}: ${data.error ?? "no se pudo subir"}`);
        }
      }
      if (ok > 0) toast.success(`${ok} video(s) subido(s) ✓`);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Importa un video grande YA en disco por su ruta (sin subir por HTTP).
  async function importByPath() {
    const p = pathInput.trim();
    if (!p) {
      toast.error("Pegá la ruta del archivo (clic derecho → «Copiar como ruta de acceso»).");
      return;
    }
    setImportingPath(true);
    try {
      const r = await fetch("/api/long_form/import-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; filename?: string };
      if (r.ok) {
        toast.success(`«${data.filename}» importado ✓`);
        setPathInput("");
        await refreshList();
      } else {
        toast.error(data.error ?? "no se pudo importar");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingPath(false);
    }
  }

  // Load on mount + tick cada 1s para "hace N segundos". Patrón válido.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshList();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [refreshList]);

  async function loadProposals(videoId: string) {
    try {
      const r = await fetch(`/api/long_form/proposals/${encodeURIComponent(videoId)}`);
      if (r.ok) {
        const data = (await r.json()) as ProposalsResponse;
        setProposals(data);
      }
    } catch {
      // ignore
    }
  }

  // Polling del job activo
  useEffect(() => {
    if (!activeJob || activeJob.status !== "running") {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/long_form/progress?jobId=${activeJob.id}`);
        if (!r.ok) return;
        const data = (await r.json()) as JobState;
        setActiveJob(data);
        if (data.status !== "running") {
          loadProposals(data.videoId);
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJob]);

  function toggleStyle(s: StyleId) {
    setSelectedStyles((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function togglePlatform(p: PlatformId) {
    setSelectedPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function startPipeline() {
    if (selectedIds.size === 0) {
      toast.error("Elegí al menos un video primero");
      return;
    }
    if (doRender && selectedStyles.length === 0) {
      toast.error("Elegí al menos un estilo para renderizar");
      return;
    }
    setSubmitting(true);
    setProposals(null);
    const videoIds = Array.from(selectedIds);
    try {
      const body: Record<string, unknown> = {
        videoIds,
        render: doRender,
        skipTranscribe,
        useHeuristic,
        graphicsMode,
        styles: selectedStyles,
        accentColor: accent,
        subtitleFont,
        subtitleColor,
        platforms: selectedPlatforms,
        aspectRatio,
        faceTracking,
      };
      if (maxClips.trim()) body.maxClips = parseInt(maxClips, 10);
      if (ollamaModel.trim()) body.model = ollamaModel.trim();

      const r = await fetch("/api/long_form/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "no se pudo arrancar");
      const jobIds: string[] = data.jobIds ?? (data.jobId ? [data.jobId] : []);
      if (jobIds.length === 0) throw new Error("no se encolaron jobs");
      if (jobIds.length > 1) {
        toast.success(`${jobIds.length} videos encolados — la cola los procesa de a uno`);
      } else {
        toast.success(`Pipeline arrancado · job ${jobIds[0].slice(-8)}`);
      }
      // Mostrar el primer job en el JobView; los demás se ven en QueuePanel global.
      const jobRes = await fetch(`/api/long_form/progress?jobId=${jobIds[0]}`);
      const jobData = (await jobRes.json()) as JobState;
      setActiveJob(jobData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function cancelView() {
    setActiveJob(null);
    setProposals(null);
    setStep(1);
    refreshList();
  }

  // Filtra los videos seleccionados; usamos el toggle "skipTranscribe" condicional
  // sólo cuando TODOS tienen transcript ya hecho.
  const selectedList = list?.videos.filter((v) => selectedIds.has(v.videoId)) ?? [];
  const allSelectedHaveTranscript = selectedList.length > 0 && selectedList.every((v) => v.hasTranscript);

  // ─── Render: si hay job activo, mostrar JobView (panel dedicado) ────────
  if (activeJob) {
    return (
      <div className="space-y-6">
        <WizardHeader />
        <JobView job={activeJob} now={now} proposals={proposals} onClose={cancelView} />
      </div>
    );
  }

  // ─── Render: wizard de 6 pasos ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <WizardHeader />

      {/* Stepper visual */}
      <div className="flex items-center gap-2 text-xs">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                step >= n
                  ? "border-violet-400 bg-violet-500/20 text-violet-300"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {step > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
            </div>
            {n < TOTAL_STEPS && (
              <div className={`h-px w-8 ${step > n ? "bg-violet-400" : "bg-border"}`} />
            )}
          </div>
        ))}
        <span className="ml-3 text-muted-foreground">
          Paso {step} de {TOTAL_STEPS}
        </span>
      </div>

      {/* STEP 1 — Videos (multi-select) */}
      {step === 1 && (
        <Card className="border-border bg-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">1. Elegí los videos largos</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-[10px] text-muted-foreground">
                {selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"} · podés elegir varios
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.mkv,.webm,.m4v,video/mp4,video/quicktime"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && e.target.files.length > 0 && importVideos(e.target.files)}
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                title="Subir uno o más videos largos desde tu computadora"
                className="bg-violet-500 text-white hover:bg-violet-400"
              >
                {importing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Subir desde mi compu
              </Button>
              <button
                type="button"
                onClick={refreshList}
                disabled={loadingList}
                className="flex items-center gap-1 rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {loadingList ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                refrescar
              </button>
            </div>
          </div>

          {/* Importar por ruta — para videos GRANDES (cursos largos de varios GB). El
              navegador no puede subir archivos así por HTTP; acá se importa directo del
              disco (la app corre en tu misma compu). */}
          <div className="mb-4 rounded-md border border-violet-500/25 bg-violet-500/5 p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-violet-200">¿Video grande (más de ~1.5 GB)?</span>{" "}
              No lo subas con el botón de arriba (se corta). En el Explorador hacé clic
              derecho sobre el archivo → «Copiar como ruta de acceso», pegala acá y se
              importa directo del disco.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") importByPath();
                }}
                placeholder="C:\Users\…\Downloads\clase.mp4"
                className="font-mono-tab text-xs"
              />
              <Button
                size="sm"
                onClick={importByPath}
                disabled={importingPath}
                className="shrink-0 bg-violet-500 text-white hover:bg-violet-400"
              >
                {importingPath ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                )}
                Importar por ruta
              </Button>
            </div>
          </div>

          {list && list.videos.length === 0 ? (
            <div className="space-y-3">
              <EmptyState
                icon={FolderOpen}
                tone="violet"
                title="Todavía no tenés videos largos"
                description="Subí un curso, charla o entrevista desde tu compu y el sistema lo recorta en clips virales."
                cta={{
                  label: importing ? "Subiendo…" : "Subir desde mi compu",
                  onClick: () => fileInputRef.current?.click(),
                }}
              />
              <details className="rounded-md border border-border bg-muted/20 p-3">
                <summary className="cursor-pointer font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                  ¿Preferís copiar el archivo a mano?
                </summary>
                <div className="mt-2">
                  <CopyableText label="Path para copiar tus videos" value={list.rawDir} />
                </div>
              </details>
            </div>
          ) : (
            <>
              {list && list.videos.length > 1 && (
                <div className="mb-3 flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(list.videos.map((v) => v.videoId)))}
                    className="rounded border border-border bg-muted/30 px-2 py-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    seleccionar todos ({list.videos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={selectedIds.size === 0}
                    className="rounded border border-border bg-muted/30 px-2 py-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    limpiar
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {list?.videos.map((v) => {
                  const sel = selectedIds.has(v.videoId);
                  return (
                    <button
                      key={v.videoId}
                      type="button"
                      onClick={() => toggleVideo(v.videoId)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                        sel
                          ? "border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-400/40"
                          : "border-border bg-muted/30 hover:bg-muted"
                      )}
                    >
                      {/* Miniatura real del video (frame al 35%, cacheada). Si falla,
                          queda el ícono de respaldo. */}
                      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/videos/${encodeURIComponent(v.videoId)}/thumbnail?source=long_form`}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <FileVideo
                          className={cn(
                            "absolute left-1/2 top-1/2 -z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2",
                            sel ? "text-violet-300" : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-mono-tab text-xs text-foreground">{v.filename}</p>
                        <p className="font-mono-tab text-[10px] text-muted-foreground">
                          {fmtBytes(v.sizeBytes)} · modificado{" "}
                          {new Date(v.modifiedAt).toLocaleString("es")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <StatusPill ok={v.hasTranscript} label="transcript" />
                          <StatusPill ok={v.hasClean} label="clean" />
                          <StatusPill ok={v.hasProposals} label="propuestas" />
                          <StatusPill ok={v.clipsExtracted > 0} label={`${v.clipsExtracted} clips`} />
                          {v.rendersAvailable > 0 && (
                            <StatusPill ok label={`${v.rendersAvailable} renders`} color="violet" />
                          )}
                        </div>
                      </div>
                      {sel && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {list && list.orphans.length > 0 && (
            <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-2 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                Largos procesados antes (raw eliminado pero clips disponibles)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {list.orphans.map((o) => (
                  <span
                    key={o.videoId}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono-tab text-[10px] text-muted-foreground"
                    title={`${o.clipsExtracted} clips · ${o.rendersAvailable} renders`}
                  >
                    {o.videoId} ({o.clipsExtracted}/{o.rendersAvailable})
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* STEP 2 — Modo de análisis */}
      {step === 2 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">2. ¿Cómo encontrar los clips icónicos?</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            El paso de análisis decide qué momentos del video se convierten en clips de 30-60 seg.
          </p>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => setUseHeuristic(true)}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                useHeuristic
                  ? "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-400/40"
                  : "border-border hover:border-foreground/30"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <span className="font-medium">Modo rápido — bloques parejos</span>
                {useHeuristic && <CheckCircle2 className="h-4 w-4 text-amber-400" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Corta bloques de ~50 segundos espaciados parejo por el video (minuto 0, 10, 20…).{" "}
                <strong className="text-foreground">~minutos</strong>. NO lee qué se dice — no elige por
                viralidad. Útil solo para tener material rápido.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUseHeuristic(false)}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                !useHeuristic
                  ? "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-400/40"
                  : "border-border hover:border-foreground/30"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">🧠</span>
                <span className="font-medium">Modo inteligente — encuentra lo más viral</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">RECOMENDADO</span>
                {!useHeuristic && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Transcribe el video en trozos (sin colgarse, aunque dure 90 min) y Ollama lee TODO para
                elegir los momentos más virales — <strong className="text-foreground">mínimo 15 clips, más si hay</strong> —
                con hook + caption + hashtags listos. <strong className="text-foreground">~30-50 min</strong> en segundo plano.
                Requiere Ollama corriendo (<code>ollama serve</code>).
              </p>
            </button>
          </div>

          {!useHeuristic && (
            <details className="mt-4 rounded-md border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                ⚙️ Avanzado (opcional — el default funciona solo)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Modelo de IA local <span className="text-muted-foreground">(Ollama)</span>
                  </Label>
                  <Input
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="default qwen3:1.7b"
                    className="font-mono-tab"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Cantidad máxima de clips
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={maxClips}
                    onChange={(e) => setMaxClips(e.target.value)}
                    placeholder="auto: mín 15, más si el video es largo"
                    className="font-mono-tab"
                  />
                </div>
              </div>
            </details>
          )}

          {allSelectedHaveTranscript && (
            <label className="mt-4 flex items-start gap-3 cursor-pointer rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
              <input
                type="checkbox"
                checked={skipTranscribe}
                onChange={(e) => setSkipTranscribe(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border bg-muted accent-sky-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-sky-200">
                  Saltear transcripción ({selectedIds.size === 1 ? "ya existe" : "todos los seleccionados ya la tienen"})
                </p>
                <p className="text-xs text-muted-foreground">Ahorra 3-10 min por video.</p>
              </div>
            </label>
          )}
        </Card>
      )}

      {/* STEP 3 — Estilos + Aspect ratio */}
      {step === 3 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">3. Estilo(s) de edición y formato</h2>

          {/* Modo Gráficos & Motion — opt-in, aditivo sobre el estilo elegido */}
          <button
            type="button"
            onClick={() => setGraphicsMode((v) => !v)}
            className={cn(
              "mb-5 w-full rounded-lg border p-4 text-left transition-all",
              graphicsMode
                ? "border-fuchsia-500/50 bg-fuchsia-500/5 ring-1 ring-fuchsia-400/40"
                : "border-border hover:border-foreground/30"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span className="font-medium">Modo Gráficos &amp; Motion</span>
              <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-medium text-fuchsia-300">
                NUEVO
              </span>
              {graphicsMode && <CheckCircle2 className="ml-auto h-4 w-4 text-fuchsia-400" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Suma gráficas animadas (contador, barras, línea, dona) y titulares poderosos
              (glitch, shimmer, draw-on…) generados <strong className="text-foreground">automáticamente</strong>{" "}
              desde lo que se dice en cada clip. Las gráficas solo aparecen cuando hay datos reales
              (%, &ldquo;3 veces&rdquo;, &ldquo;de 23 a 78&rdquo;). Se combina con el estilo que elijas abajo.
            </p>
          </button>

          {/* Aspect ratio toggle */}
          <div className="mb-5">
            <p className="mb-2 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
              Formato de salida (si el video source no coincide, se hace center-crop)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAspectRatio("9:16")}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 transition-all",
                  aspectRatio === "9:16"
                    ? "border-violet-400 ring-1 ring-violet-400 bg-violet-500/5"
                    : "border-border hover:border-foreground/30"
                )}
              >
                <div className="flex h-10 w-6 items-center justify-center rounded-sm border-2 border-current text-violet-300 shrink-0">
                  <span className="text-[8px]">9:16</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Vertical 9:16</p>
                  <p className="font-mono-tab text-[10px] text-muted-foreground">
                    TikTok · Reels · Stories
                  </p>
                </div>
                {aspectRatio === "9:16" && <CheckCircle2 className="ml-auto h-4 w-4 text-violet-400" />}
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio("16:9")}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 transition-all",
                  aspectRatio === "16:9"
                    ? "border-violet-400 ring-1 ring-violet-400 bg-violet-500/5"
                    : "border-border hover:border-foreground/30"
                )}
              >
                <div className="flex h-6 w-10 items-center justify-center rounded-sm border-2 border-current text-violet-300 shrink-0">
                  <span className="text-[8px]">16:9</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Horizontal 16:9</p>
                  <p className="font-mono-tab text-[10px] text-muted-foreground">
                    LinkedIn · YouTube · cursos
                  </p>
                </div>
                {aspectRatio === "16:9" && <CheckCircle2 className="ml-auto h-4 w-4 text-violet-400" />}
              </button>
            </div>

            {/* Face tracking — solo útil si el aspect cambia respecto al source */}
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 font-mono-tab text-[10px] uppercase tracking-wider text-amber-300">
                Reframe inteligente (face tracking)
              </p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Si el video source no coincide con el aspect ratio elegido, ¿centrar el crop en
                la cara detectada en vez de center-crop ciego?
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFaceTracking("off")}
                  className={cn(
                    "rounded-md border p-2 text-left transition-all",
                    faceTracking === "off"
                      ? "border-foreground/40 bg-foreground/5"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <p className="text-xs font-medium">Off</p>
                  <p className="font-mono-tab text-[9px] text-muted-foreground">center crop ciego</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFaceTracking("single")}
                  className={cn(
                    "rounded-md border p-2 text-left transition-all",
                    faceTracking === "single"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <p className="text-xs font-medium">Single (recomendado)</p>
                  <p className="font-mono-tab text-[9px] text-muted-foreground">~1s/clip · estático</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFaceTracking("per-frame")}
                  className={cn(
                    "rounded-md border p-2 text-left transition-all",
                    faceTracking === "per-frame"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <p className="text-xs font-medium">Per-frame</p>
                  <p className="font-mono-tab text-[9px] text-muted-foreground">~5-10s/clip · preciso</p>
                </button>
              </div>
            </div>
          </div>

          <p className="mb-4 text-xs text-muted-foreground">
            Cada estilo seleccionado genera un MP4 por clip. Si elegís 2 estilos y se extraen 5 clips,
            se renderizan 10 archivos.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STYLES.map((s) => {
              const sel = selectedStyles.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStyle(s.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-all",
                    sel
                      ? "border-violet-400 ring-1 ring-violet-400 bg-violet-500/5"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  {/* Mini-demo EN MOVIMIENTO del estilo: se entiende sin leer. */}
                  <StyleMiniDemo styleId={s.id} accent={accent} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {sel && <CheckCircle2 className="h-4 w-4 text-violet-400" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {selectedStyles.length === 0
              ? "Seleccioná al menos uno"
              : `${selectedStyles.length} estilo${selectedStyles.length === 1 ? "" : "s"} seleccionado${selectedStyles.length === 1 ? "" : "s"}`}
          </p>

          <label className="mt-4 flex items-start gap-3 cursor-pointer rounded-md border border-border bg-muted/20 p-3">
            <input
              type="checkbox"
              checked={doRender}
              onChange={(e) => setDoRender(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border bg-muted accent-emerald-500"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Renderizar después de extraer los clips</p>
              <p className="text-xs text-muted-foreground">
                Si lo apagás, solo se cortan los clips crudos (.mp4 raw). Podés renderizarlos manualmente
                después desde /produccion.
              </p>
            </div>
          </label>
        </Card>
      )}

      {/* STEP 4 — Color + tipografía de subtítulos */}
      {step === 4 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">4. Color principal</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Un solo color para todos los clips del lote (subtítulos highlight, stickers, vignette, border).
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PALETTE.map((c) => {
              const sel = accent === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setAccent(c.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 transition-all",
                    sel ? "border-foreground" : "border-border hover:border-foreground/30"
                  )}
                >
                  <div
                    className="h-12 w-12 rounded-full"
                    style={{
                      background: c.value,
                      boxShadow: sel ? `0 0 24px ${c.value}66` : "none",
                    }}
                  />
                  <span className="text-xs font-medium">{c.name}</span>
                  <span className="font-mono-tab text-[10px] text-muted-foreground">{c.mood}</span>
                </button>
              );
            })}
          </div>

          {/* Color del TEXTO de los subtítulos (paridad con el wizard de shorts) */}
          <h3 className="mb-2 mt-6 text-sm font-medium">Color del texto de los subtítulos</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            El color de las palabras (el resaltado usa el color principal de arriba).
            &quot;Automático&quot; usa el del estilo.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SUBTITLE_COLORS.map((c) => {
              const sel = subtitleColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSubtitleColor(c.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
                    sel
                      ? "border-foreground bg-muted/40 ring-1 ring-foreground/30"
                      : "border-border hover:border-foreground/30"
                  )}
                >
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

          {/* Preview en vivo: color + resaltado + fuente elegidos. */}
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
              clips
            </span>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-medium">Tipografía de los subtítulos</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            &quot;Automática&quot; usa la del estilo. La miniatura muestra cada fuente real.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {SUBTITLE_FONTS.map((f) => {
              const sel = subtitleFont === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSubtitleFont(f.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 transition-all",
                    sel
                      ? "border-foreground bg-muted/40 ring-1 ring-foreground/30"
                      : "border-border hover:border-foreground/30"
                  )}
                >
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

      {/* STEP 5 — Plataformas */}
      {step === 5 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-medium">5. Plataformas destino</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Se guarda en el project JSON de cada clip para que los botones TT/IG/LI de /produccion sepan
            dónde publicar.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PLATFORMS_META.map((p) => {
              const sel = selectedPlatforms.includes(p.id);
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                    sel
                      ? "border-violet-400 ring-1 ring-violet-400 bg-violet-500/5"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <Icon className="h-6 w-6" style={{ color: sel ? p.color : undefined }} />
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{p.label}</span>
                    {sel && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* STEP 6 — Confirmar + arrancar */}
      {step === 6 && (
        <Card className="border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-medium">6. Confirmar y arrancar</h2>

          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="mb-2 font-medium">Resumen</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                · Video{selectedIds.size === 1 ? "" : "s"} ({selectedIds.size}):{" "}
                <span className="font-mono-tab text-foreground">
                  {Array.from(selectedIds).slice(0, 3).join(", ")}
                  {selectedIds.size > 3 && ` +${selectedIds.size - 3} más`}
                </span>
              </li>
              <li>· Modo: <span className="text-foreground">{useHeuristic ? "Rápido (bloques parejos, sin IA)" : "Inteligente (Ollama encuentra lo viral, mín 15 clips)"}</span>
                {!useHeuristic && ollamaModel && <span className="text-muted-foreground"> · modelo {ollamaModel}</span>}
              </li>
              <li>· Renderizar: <span className="text-foreground">{doRender ? "sí" : "no (solo extracción)"}</span></li>
              {doRender && (
                <>
                  <li>· Estilo{selectedStyles.length === 1 ? "" : "s"}: <span className="text-foreground">{selectedStyles.join(", ")}</span></li>
                  <li>
                    · Formato:{" "}
                    <span className="text-foreground">
                      {aspectRatio === "9:16" ? "Vertical 9:16 (1080×1920)" : "Horizontal 16:9 (1920×1080)"}
                    </span>
                  </li>
                  <li>· Color: <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: accent }} />{" "}
                    <span className="font-mono-tab text-foreground">{accent}</span>
                  </li>
                  <li>
                    · Subtítulos:{" "}
                    <span className="text-foreground">
                      {SUBTITLE_FONTS.find((f) => f.id === subtitleFont)?.name ?? subtitleFont}
                      {subtitleColor !== "auto" && (
                        <>
                          {" · texto "}
                          <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: subtitleColor }} />{" "}
                          <span className="font-mono-tab">{subtitleColor}</span>
                        </>
                      )}
                    </span>
                  </li>
                </>
              )}
              <li>· Plataformas: <span className="text-foreground">{selectedPlatforms.join(", ") || "—"}</span></li>
              {maxClips && <li>· Max clips: <span className="text-foreground">{maxClips}</span></li>}
              {doRender && (
                <li className="text-amber-400">
                  Estimado: ~{Math.max(2, (parseInt(maxClips || "5", 10) * selectedStyles.length * 2))} min total
                  (depende del hardware)
                </li>
              )}
            </ul>
          </div>

          <Button
            onClick={startPipeline}
            disabled={
              submitting ||
              selectedIds.size === 0 ||
              (doRender && selectedStyles.length === 0)
            }
            className="mt-4 w-full bg-violet-500 hover:bg-violet-400 text-white"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {submitting ? "Arrancando…" : "Arrancar pipeline"}
          </Button>
        </Card>
      )}

      {/* Navegación */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1 || submitting}
        >
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          Atrás
        </Button>
        {step < TOTAL_STEPS && (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 1 && selectedIds.size === 0) ||
              (step === 3 && doRender && selectedStyles.length === 0) ||
              (step === 5 && selectedPlatforms.length === 0)
            }
          >
            Siguiente
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function WizardHeader() {
  return (
    <SectionHeader
      eyebrow="Videos largos → clips cortos"
      title="De un video largo a varios clips virales"
      description="Subí un video largo (un curso, charla o entrevista) y el sistema encuentra los 5 a 7 mejores momentos y los recorta en clips de 30 a 60 segundos, con el estilo que elijas."
      color={SECTION_COLORS.largos}
    />
  );
}

function StatusPill({
  ok,
  label,
  color,
}: {
  ok: boolean;
  label: string;
  color?: "emerald" | "violet";
}) {
  const colorClass = !ok
    ? "bg-muted text-muted-foreground"
    : color === "violet"
      ? "bg-violet-500/20 text-violet-300"
      : "bg-emerald-500/20 text-emerald-300";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider",
        colorClass
      )}
    >
      {ok ? "✓" : "·"} {label}
    </span>
  );
}

function CopyableText({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono-tab">
        {label}
      </Label>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
        <code className="flex-1 font-mono-tab text-xs text-foreground break-all">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copiado`);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-400"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function JobView({
  job,
  now,
  proposals,
  onClose,
}: {
  job: JobState;
  now: number;
  proposals: ProposalsResponse | null;
  onClose: () => void;
}) {
  const elapsed = (job.finishedAt ?? now) - job.startedAt;

  return (
    <Card className="border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">
            Procesando <span className="font-mono-tab text-violet-400">{job.videoId}</span>
          </h2>
          <p className="font-mono-tab text-[10px] text-muted-foreground">
            job {job.id.slice(-12)} · <Clock className="inline h-3 w-3" /> {fmtElapsed(elapsed)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.status === "running" && (
            <span className="flex items-center gap-1.5 rounded bg-amber-500/20 px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              en proceso
            </span>
          )}
          {job.status === "done" && (
            <span className="flex items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              completado
            </span>
          )}
          {job.status === "failed" && (
            <span className="flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider text-red-300">
              <XCircle className="h-3 w-3" />
              falló
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            cerrar y volver
          </button>
        </div>
      </div>

      <div className="mb-5 space-y-1">
        <div className="flex items-center justify-between font-mono-tab text-[10px] text-muted-foreground">
          <span>progreso global</span>
          <span>{job.overallProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-500",
              job.status === "failed"
                ? "bg-red-500"
                : job.status === "done"
                  ? "bg-emerald-500"
                  : "bg-amber-500"
            )}
            style={{ width: `${job.overallProgress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2.5">
        {job.steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3">
            <StepIcon status={step.status} index={i + 1} />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm",
                  step.status === "running" && "text-foreground font-medium",
                  step.status === "ok" && "text-foreground",
                  step.status === "skipped" && "text-muted-foreground italic",
                  step.status === "pending" && "text-muted-foreground",
                  step.status === "fail" && "text-red-300"
                )}
              >
                {step.label}
              </p>
              {step.message && (
                <p className="font-mono-tab text-[10px] text-muted-foreground">{step.message}</p>
              )}
              {step.startedAt && step.finishedAt && (
                <p className="font-mono-tab text-[10px] text-muted-foreground">
                  {fmtElapsed(step.finishedAt - step.startedAt)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {job.log.length > 0 && (
        <details className="mt-5 rounded-md border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
            Log del pipeline ({job.log.length} líneas)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono-tab text-[10px] text-foreground/70">
            {job.log.slice(-30).join("\n")}
          </pre>
        </details>
      )}

      {job.status === "done" && proposals && proposals.clips && (
        <div className="mt-5 space-y-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {proposals.clips.length} clips generados
              {job.clipsCount != null && ` (${job.clipsCount} extraídos OK)`}
              {proposals.fallback_heuristic && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] text-amber-300">
                  modo heurístico
                </span>
              )}
            </p>
            <p className="mt-1 font-mono-tab text-[10px] text-muted-foreground">
              {job.options?.render
                ? `Renders con estilo(s): ${(job.options.styles ?? []).join(", ")} — listos para publicar desde Producción.`
                : "Sin render — abrí Producción para renderizar cada uno manualmente."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {proposals.clips.slice(0, 12).map((c, i) => {
              const idx = c.index ?? i + 1;
              return (
              <div key={idx} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono-tab text-[10px] text-violet-300">
                    c{idx.toString().padStart(2, "0")}
                  </span>
                  {typeof c.viralityScore === "number" && (
                    <span
                      title={`Potencial viral: ${c.viralityScore}/100${c.viralityReasons?.length ? " — " + c.viralityReasons.join(" · ") : ""}`}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono-tab text-[10px] font-semibold"
                      style={{
                        background:
                          c.viralityScore >= 70 ? "#10b98122" : c.viralityScore >= 45 ? "#f59e0b22" : "#71717a22",
                        color:
                          c.viralityScore >= 70 ? "#34d399" : c.viralityScore >= 45 ? "#fbbf24" : "#a1a1aa",
                      }}
                    >
                      🔥 {c.viralityScore}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.title || c.slug || `Clip ${idx}`}
                    </p>
                    <p className="font-mono-tab text-[10px] text-muted-foreground">
                      {fmtTime(c.start)} → {fmtTime(c.end)}
                      {c.duration && ` · ${Math.round(c.duration)}s`}
                    </p>
                    {c.hook && (
                      <p className="mt-1 text-[11px] text-foreground/80">
                        <Sparkles className="mr-1 inline h-2.5 w-2.5 text-amber-400" />
                        {c.hook}
                      </p>
                    )}
                    {c.viralityReasons && c.viralityReasons.length > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {c.viralityReasons.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <Link
            href="/produccion"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-500 px-4 text-sm font-medium text-black hover:bg-emerald-400"
          >
            <Play className="h-3.5 w-3.5" />
            Abrir Producción para ver/publicar
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {job.status === "failed" && (
        <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red-200">
            <XCircle className="h-4 w-4" />
            El pipeline falló
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Revisá el log arriba. Causas comunes: Ollama no corriendo (<code>ollama serve</code>),
            modelo no descargado, transcript vacío o video corrupto.
          </p>
        </div>
      )}
    </Card>
  );
}

function StepIcon({ status, index }: { status: JobStep["status"]; index: number }) {
  if (status === "ok")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  if (status === "fail")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
        <XCircle className="h-3.5 w-3.5" />
      </span>
    );
  if (status === "running")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-black">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  if (status === "skipped")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground text-[10px]">
        <Scissors className="h-3 w-3" />
      </span>
    );
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground text-muted-foreground text-xs font-mono-tab">
      {index}
    </span>
  );
}
