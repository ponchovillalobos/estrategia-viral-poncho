"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw, FileVideo, ExternalLink, Clock, Copy, Check, Sparkles, Loader2, Search, X, Upload, Play, Music2, Calendar, AlertCircle, Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleDialog } from "@/components/produccion/schedule-dialog";
import { UploadHelperDialog } from "@/components/produccion/upload-helper-dialog";
import { InstagramHelperDialog } from "@/components/produccion/instagram-helper-dialog";
import type { Project } from "@/components/editor/workspace";

const STATUS_COLOR: Record<Project["status"], string> = {
  borrador: "#fbbf24",
  aprobado: "#34d399",
  publicado: "#60a5fa",
};

const STATUS_OPTIONS = ["all", "borrador", "aprobado", "publicado"] as const;
const PLATFORM_OPTIONS = ["all", "instagram", "linkedin"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type PlatformFilter = (typeof PLATFORM_OPTIONS)[number];

interface CaptionVariant {
  caption: string;
  hashtags: string[];
}

// Etiqueta legible del estilo de edición (los proyectos guardan el codename en styleId).
const STYLE_LABEL: Record<string, string> = {
  silent: "Limpio",
  punch: "Punch",
  hype: "Viral",
  hype_max: "Viral intenso",
  hype_max_sfx: "Viral con sonidos",
  supreme: "Premium",
  cinematic_pro: "Cine",
  broll_full: "Con videos de apoyo",
  broll_pip: "Videos de apoyo (chico)",
};

interface ProjectExt extends Project {
  source?: "short" | "long_form";
  styleId?: string;
  /** Título corto basado en el contenido (lo arma auto-build para nombrar el archivo). */
  title?: string;
  /** Nuevo: 3 variantes por plataforma generadas en una corrida de generate_caption.py */
  captions?: {
    tiktok?: CaptionVariant;
    linkedin?: CaptionVariant;
    instagram?: CaptionVariant;
  };
  captionMeta?: {
    caption_short?: string;
    caption_long?: string;
    hashtags_tiktok?: string[];
    hashtags_instagram?: string[];
    hashtags_linkedin?: string[];
    hashtags_facebook?: string[];
    captions?: ProjectExt["captions"];
  };
}

type CaptionPlatform = "tiktok" | "linkedin" | "instagram";

/** Devuelve el caption combinado con hashtags para una plataforma — fallback al .caption legacy. */
function pickCaptionForPlatform(p: ProjectExt, platform: CaptionPlatform): string {
  const variant = p.captions?.[platform] ?? p.captionMeta?.captions?.[platform];
  if (variant?.caption) {
    const tags = (variant.hashtags ?? [])
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ");
    return tags ? `${variant.caption}\n\n${tags}` : variant.caption;
  }
  return p.caption ?? "";
}

export function ProductionList() {
  const [projects, setProjects] = useState<ProjectExt[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [postingToTikTok, setPostingToTikTok] = useState<string | null>(null);
  const [previewProject, setPreviewProject] = useState<ProjectExt | null>(null);
  const [uploadHelperTarget, setUploadHelperTarget] = useState<ProjectExt | null>(null);
  const [instagramHelperTarget, setInstagramHelperTarget] = useState<ProjectExt | null>(null);
  const [publishingToLinkedin, setPublishingToLinkedin] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ProjectExt | null>(null);
  const [tiktokHandle, setTiktokHandle] = useState<string>("");
  const [tiktokConnected, setTiktokConnected] = useState<boolean>(false);
  const [instagramHandle, setInstagramHandle] = useState<string>("");
  const [instagramConnected, setInstagramConnected] = useState<boolean>(false);
  const [publishingToInstagram, setPublishingToInstagram] = useState<string | null>(null);
  const [linkedinHandle, setLinkedinHandle] = useState<string>("");
  const [linkedinConnected, setLinkedinConnected] = useState<boolean>(false);
  const [scheduledByProjectId, setScheduledByProjectId] = useState<
    Record<string, Partial<Record<"tiktok" | "linkedin" | "instagram_bridge", { status: string; scheduledAt: number }>>>
  >({});
  const [transcriptByVideoId, setTranscriptByVideoId] = useState<Record<string, string>>({});
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterPlatform, setFilterPlatform] = useState<PlatformFilter>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterPlatform !== "all" && !(p.platforms?.includes(filterPlatform) ?? false)) return false;
      if (q) {
        const haystack = `${p.id} ${p.caption ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, filterStatus, filterPlatform]);

  const hasActiveFilters = search !== "" || filterStatus !== "all" || filterPlatform !== "all";

  function clearFilters() {
    setSearch("");
    setFilterStatus("all");
    setFilterPlatform("all");
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function copyCaption(p: ProjectExt) {
    try {
      await navigator.clipboard.writeText(p.caption ?? "");
      setCopiedId(p.id);
      toast.success("Caption copiado");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  /** Publica directamente a LinkedIn vía API (sin scheduling). Llama /api/linkedin/publish. */
  async function publishToLinkedIn(p: ProjectExt) {
    setPublishingToLinkedin(p.id);
    const toastId = toast.loading(`Subiendo ${p.id} a LinkedIn…`);
    try {
      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: p.id,
          source: p.source ?? "short",
          caption: pickCaptionForPlatform(p, "linkedin"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Publicado en LinkedIn ✓", { id: toastId });
    } catch (err) {
      toast.error(`LinkedIn falló: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
      });
    } finally {
      setPublishingToLinkedin(null);
    }
  }

  async function publishToInstagram(p: ProjectExt) {
    setPublishingToInstagram(p.id);
    const toastId = toast.loading(`Publicando ${p.id} en Instagram…`);
    try {
      const res = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: p.id,
          source: p.source ?? "short",
          caption: pickCaptionForPlatform(p, "instagram"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Publicado en Instagram ✓", { id: toastId });
    } catch (err) {
      toast.error(`Instagram falló: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
      });
    } finally {
      setPublishingToInstagram(null);
    }
  }

  /**
   * Bridge manual para subir a TikTok mientras esperamos approval del Content Posting API.
   *
   * Flujo:
   *   1. Copia el archivo de video (no texto, el binary) al portapapeles via PowerShell.
   *      TikTok acepta Ctrl+V en el file picker → video subido sin arrastrar.
   *   2. Abre Explorer con el archivo seleccionado por si preferís drag.
   *   3. Abre tiktok.com/upload en pestaña nueva.
   *   4. El caption queda esperando en el botón 📋 al lado del caption — lo copiás
   *      después de que cargue el video.
   */
  async function postToTikTok(p: ProjectExt) {
    if (!p.caption) {
      toast.error("Este proyecto no tiene caption. Generalo primero con ✨.");
      return;
    }
    setPostingToTikTok(p.id);
    try {
      // 1. Archivo de video al portapapeles (vía PowerShell Set-Clipboard -Path)
      const clipRes = await fetch(
        `/api/projects/${encodeURIComponent(p.id)}/copy-file-to-clipboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: p.source ?? "short" }),
        }
      );
      if (!clipRes.ok) {
        const data = await clipRes.json().catch(() => ({}));
        throw new Error(data.error ?? `clipboard HTTP ${clipRes.status}`);
      }

      // 2. Abrir Explorer con el render seleccionado (fallback si Ctrl+V no funciona)
      await fetch(
        `/api/projects/${encodeURIComponent(p.id)}/reveal-render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: p.source ?? "short" }),
        }
      );

      // 3. Abrir TikTok Upload
      window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");

      const asAccount = tiktokHandle ? ` como ${tiktokHandle}` : "";
      toast.success(
        `Video copiado${asAccount}. En TikTok: click "Seleccionar video" → Ctrl+V. Luego volvé acá y tocá 📋 para copiar el caption.`,
        { duration: 9000 }
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo preparar el upload"
      );
    } finally {
      setPostingToTikTok(null);
    }
  }

  async function regenerate(p: ProjectExt, provider: string = "auto") {
    setRegenerating(p.id);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(p.id)}/generate-caption?provider=${provider}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "regenerate failed");
      const usedProvider = data.copy?._provider ?? provider;
      const usedModel = data.copy?._model ?? "";
      toast.success(`Caption regenerado (${usedProvider} · ${usedModel})`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(null);
    }
  }

  // Carga el transcript del video. Cacheado por videoId.
  async function loadTranscript(videoId: string) {
    if (transcriptByVideoId[videoId] !== undefined) return; // ya cargado
    setLoadingTranscript(true);
    try {
      const res = await fetch(
        `/api/videos/transcribe?videoId=${encodeURIComponent(videoId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const words = data.transcript?.words ?? [];
      const text = words.map((w: { word: string }) => w.word).join(" ").trim();
      setTranscriptByVideoId((prev) => ({ ...prev, [videoId]: text }));
    } catch {
      setTranscriptByVideoId((prev) => ({ ...prev, [videoId]: "" }));
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function copyTranscript(videoId: string) {
    const t = transcriptByVideoId[videoId];
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setTranscriptCopied(true);
      toast.success("Transcript copiado");
      setTimeout(() => setTranscriptCopied(false), 1800);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function loadSchedule() {
    try {
      const r = await fetch("/api/tiktok/schedule");
      const d = await r.json();
      const map: Record<
        string,
        Partial<Record<"tiktok" | "linkedin" | "instagram_bridge", { status: string; scheduledAt: number }>>
      > = {};
      for (const u of d.uploads ?? []) {
        const platform = (u.platform ?? "tiktok") as "tiktok" | "linkedin" | "instagram_bridge";
        const entry = map[u.projectId] ?? {};
        // Si hay varios para el mismo projectId+platform, gana el último (lista ordenada asc por scheduledAt)
        entry[platform] = { status: u.status, scheduledAt: u.scheduledAt };
        map[u.projectId] = entry;
      }
      setScheduledByProjectId(map);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    loadSchedule();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setTiktokHandle(d.handles?.tiktok ?? "");
        setTiktokConnected(Boolean(d.tiktok?.hasAccessToken));
        setInstagramHandle(d.handles?.instagram ?? "");
        setInstagramConnected(Boolean(d.instagram?.hasAccessToken));
        setLinkedinHandle(d.handles?.linkedin ?? "");
        setLinkedinConnected(Boolean(d.linkedin?.hasAccessToken));
      })
      .catch(() => {});
  }, []);

  // Cuando se abre el preview, cargá el transcript correspondiente.
  useEffect(() => {
    if (previewProject?.videoId) {
      loadTranscript(previewProject.videoId);
    }
    setTranscriptCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProject?.videoId]);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o caption…"
              className="w-full rounded-md border border-border bg-card pl-8 pr-3 py-1.5 text-sm placeholder:text-foreground/55 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="font-mono-tab text-xs text-muted-foreground">
              {hasActiveFilters
                ? `${filtered.length} de ${projects.length}`
                : projects.length}{" "}
              proyecto{filtered.length === 1 ? "" : "s"}
            </span>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Recargar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground/70">
            estado:
          </span>
          {STATUS_OPTIONS.map((s) => (
            <FilterChip
              key={s}
              active={filterStatus === s}
              onClick={() => setFilterStatus(s)}
              label={s === "all" ? "todos" : s}
            />
          ))}

          <span className="ml-3 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground/70">
            plataforma:
          </span>
          {PLATFORM_OPTIONS.map((pl) => (
            <FilterChip
              key={pl}
              active={filterPlatform === pl}
              onClick={() => setFilterPlatform(pl)}
              label={pl === "all" ? "todas" : pl}
            />
          ))}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" /> limpiar
            </button>
          )}
        </div>
      </div>

      {projects.length === 0 && !loading && (
        <Card className="border-dashed border-border bg-card p-10 text-center">
          <FileVideo className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-60" />
          <p className="text-base font-medium text-foreground">Todavía no tenés videos generados</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Acá van a aparecer tus shorts ya editados, listos para publicar. Creá el primero
            eligiendo un video y un estilo.
          </p>
          <Link
            href="/editor"
            className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Crear mi primer video
          </Link>
        </Card>
      )}

      {projects.length > 0 && filtered.length === 0 && (
        <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>Sin coincidencias para los filtros actuales.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 font-mono-tab text-[10px] uppercase tracking-wider text-emerald-400 hover:underline"
          >
            Limpiar filtros
          </button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
        {filtered.map((p) => (
          <Card
            key={p.id}
            className="group overflow-hidden border-border bg-card p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
          >
            <div className="grid grid-cols-[140px_1fr] gap-0">
              <button
                type="button"
                onClick={() => setPreviewProject(p)}
                title="Click para reproducir"
                className="group relative aspect-[9/16] cursor-pointer bg-zinc-900 text-left focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <img
                  src={`/api/videos/${encodeURIComponent(p.videoId)}/thumbnail`}
                  alt={p.id}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Play overlay on hover */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-black text-black" />
                  </div>
                </div>
                <span
                  className="absolute right-1 top-1 rounded-md px-1.5 py-0.5 font-mono-tab text-[9px] uppercase"
                  style={{
                    background: `${STATUS_COLOR[p.status]}22`,
                    color: STATUS_COLOR[p.status],
                    border: `1px solid ${STATUS_COLOR[p.status]}55`,
                  }}
                >
                  {p.status}
                </span>
                {p.day && (
                  <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono-tab text-[9px]">
                    D{p.day.toString().padStart(2, "0")}
                  </span>
                )}
              </button>

              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-tight">{p.title ?? p.id}</h3>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {STYLE_LABEL[p.styleId ?? ""] ?? p.styleId ?? "—"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {p.platforms?.map((plat) => (
                    <span
                      key={plat}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize"
                    >
                      {plat}
                    </span>
                  ))}
                  {p.source === "long_form" && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">
                      Video largo
                    </span>
                  )}
                </div>

                {/* CAPTION VIRAL - destacado */}
                <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                      caption para publicar
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="group/regen relative">
                        <button
                          type="button"
                          onClick={() => regenerate(p, "auto")}
                          disabled={regenerating === p.id}
                          title="Regenerar caption (auto-detecta mejor LLM)"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          {regenerating === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                        </button>
                        {/* Menú flotante de providers OAuth (sin API keys) */}
                        <div className="invisible absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-border bg-card p-1 shadow-lg group-hover/regen:visible">
                          <button
                            type="button"
                            onClick={() => regenerate(p, "claude")}
                            className="block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-muted"
                            title="Usa tu suscripción Claude.ai vía OAuth"
                          >
                            Claude CLI (OAuth)
                          </button>
                          <button
                            type="button"
                            onClick={() => regenerate(p, "codex")}
                            className="block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-muted"
                            title="Usa tu suscripción ChatGPT Plus vía OAuth"
                          >
                            Codex CLI (OAuth)
                          </button>
                          <button
                            type="button"
                            onClick={() => regenerate(p, "ollama")}
                            className="block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-muted"
                          >
                            Ollama local
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyCaption(p)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-400"
                        title="Copiar caption completo"
                      >
                        {copiedId === p.id ? (
                          <Check className="h-3 w-3 animate-in zoom-in-50 duration-200 text-primary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  {p.caption ? (
                    <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/90">
                      {p.caption}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Todavía no tiene descripción. Tocá el botón ✨ Generar para crearla con IA.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground">
                  {/* Fila 1 — programar (multi-plataforma) + editor + updated */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/editor/${encodeURIComponent(p.videoId)}`}
                        className="flex items-center gap-1 hover:text-emerald-400"
                      >
                        <ExternalLink className="h-3 w-3" /> Editor
                      </Link>
                      <button
                        type="button"
                        onClick={() => setScheduleTarget(p)}
                        disabled={!p.caption}
                        title={
                          !p.caption
                            ? "Generá un caption primero con ✨"
                            : "Programar publicación en una o varias redes"
                        }
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono-tab uppercase tracking-wider hover:bg-muted hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Calendar className="h-3 w-3" />
                        programar
                      </button>
                    </div>
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("es") : "—"}
                    </span>
                  </div>
                  {/* Fila 2 — bridges manuales por plataforma + status badges del schedule */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
                      subir ahora:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        instagramConnected ? publishToInstagram(p) : setInstagramHelperTarget(p)
                      }
                      disabled={!p.caption || publishingToInstagram === p.id}
                      title={
                        !p.caption
                          ? "Generá un caption primero con ✨"
                          : instagramConnected
                            ? `Publicar AHORA en Instagram${instagramHandle ? ` (${instagramHandle})` : ""}`
                            : `Bridge manual Instagram${instagramHandle ? ` (${instagramHandle})` : ""} — conectá IG en Settings para publicar directo`
                      }
                      className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-amber-300 hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {publishingToInstagram === p.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Camera className="h-2.5 w-2.5" />
                      )}
                      Instagram
                      <ScheduleStatusBadge state={scheduledByProjectId[p.id]?.instagram_bridge} />
                    </button>
                    <button
                      type="button"
                      onClick={() => publishToLinkedIn(p)}
                      disabled={!p.caption || !linkedinConnected || publishingToLinkedin === p.id}
                      title={
                        !p.caption
                          ? "Generá un caption primero con ✨"
                          : !linkedinConnected
                            ? "Conectá LinkedIn en Settings primero"
                            : `Publicar AHORA en LinkedIn${linkedinHandle ? ` (${linkedinHandle})` : ""}`
                      }
                      className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/5 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-sky-300 hover:bg-sky-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {publishingToLinkedin === p.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-2.5 w-2.5" />
                      )}
                      LinkedIn
                      <ScheduleStatusBadge state={scheduledByProjectId[p.id]?.linkedin} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {uploadHelperTarget && (
        <UploadHelperDialog
          open={!!uploadHelperTarget}
          onOpenChange={(open) => !open && setUploadHelperTarget(null)}
          projectId={uploadHelperTarget.id}
          caption={pickCaptionForPlatform(uploadHelperTarget, "tiktok") || (uploadHelperTarget.caption ?? "")}
          tiktokHandle={tiktokHandle}
          source={uploadHelperTarget.source ?? "short"}
        />
      )}

      {instagramHelperTarget && (
        <InstagramHelperDialog
          open={!!instagramHelperTarget}
          onOpenChange={(open) => !open && setInstagramHelperTarget(null)}
          projectId={instagramHelperTarget.id}
          caption={pickCaptionForPlatform(instagramHelperTarget, "instagram") || (instagramHelperTarget.caption ?? "")}
          instagramHandle={instagramHandle}
          source={instagramHelperTarget.source ?? "short"}
        />
      )}

      {scheduleTarget && (
        <ScheduleDialog
          open={!!scheduleTarget}
          onOpenChange={(open) => !open && setScheduleTarget(null)}
          projectId={scheduleTarget.id}
          caption={pickCaptionForPlatform(scheduleTarget, "tiktok") || (scheduleTarget.caption ?? "")}
          captions={{
            tiktok: pickCaptionForPlatform(scheduleTarget, "tiktok"),
            linkedin: pickCaptionForPlatform(scheduleTarget, "linkedin"),
            instagram: pickCaptionForPlatform(scheduleTarget, "instagram"),
          }}
          source={scheduleTarget.source ?? "short"}
          onScheduled={() => {
            loadSchedule();
          }}
        />
      )}

      <Dialog
        open={!!previewProject}
        onOpenChange={(open) => !open && setPreviewProject(null)}
      >
        <DialogContent
          className="max-w-[95vw] p-0 bg-black sm:max-w-3xl md:max-w-4xl"
          showCloseButton
        >
          <DialogTitle className="sr-only">
            Preview {previewProject?.id ?? ""}
          </DialogTitle>
          {previewProject && (
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-0 max-h-[85vh]">
              {/* Video */}
              <div className="flex flex-col bg-black md:max-w-[360px]">
                <video
                  key={previewProject.id}
                  src={`/api/videos/${encodeURIComponent(previewProject.id)}/stream?source=render`}
                  controls
                  autoPlay
                  playsInline
                  className="aspect-[9/16] w-full bg-black md:max-w-[360px]"
                />
                <div className="space-y-1 border-t border-foreground/10 bg-card p-3 text-sm">
                  <p className="font-mono-tab text-xs text-foreground break-all">
                    {previewProject.id}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    {previewProject.styleId && (
                      <span className="font-mono-tab uppercase tracking-wider">
                        {previewProject.styleId}
                      </span>
                    )}
                    {(previewProject.platforms ?? []).map((plat) => (
                      <span
                        key={plat}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono-tab"
                      >
                        {plat}
                      </span>
                    ))}
                    {tiktokHandle && (previewProject.platforms ?? []).includes("tiktok") && (
                      <span className="flex items-center gap-1 font-mono-tab text-pink-400">
                        <Music2 className="h-2.5 w-2.5" />
                        {tiktokHandle}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Transcripción */}
              <div className="flex min-h-0 flex-col bg-card md:border-l md:border-foreground/10">
                <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-2.5">
                  <h3 className="flex items-center gap-1.5 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                    <FileVideo className="h-3 w-3" />
                    Transcripción completa
                  </h3>
                  {transcriptByVideoId[previewProject.videoId] && (
                    <button
                      type="button"
                      onClick={() => copyTranscript(previewProject.videoId)}
                      className="flex items-center gap-1 rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-emerald-400"
                      title="Copiar transcripción al portapapeles"
                    >
                      {transcriptCopied ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      copiar
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
                  {loadingTranscript && !transcriptByVideoId[previewProject.videoId] ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Cargando transcripción…
                    </div>
                  ) : transcriptByVideoId[previewProject.videoId] ? (
                    <p className="whitespace-pre-wrap text-foreground/90">
                      {transcriptByVideoId[previewProject.videoId]}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No hay transcripción disponible para este video
                      (probablemente sin habla detectada).
                    </p>
                  )}
                </div>

                {/* Captions por plataforma — tabs TikTok/LinkedIn/Instagram */}
                {(previewProject.captions || previewProject.caption) && (
                  <CaptionTabs project={previewProject} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

const PLATFORM_TABS: { key: CaptionPlatform; label: string; color: string }[] = [
  { key: "tiktok", label: "TikTok", color: "text-pink-400" },
  { key: "linkedin", label: "LinkedIn", color: "text-sky-400" },
  { key: "instagram", label: "Instagram", color: "text-amber-400" },
];

/**
 * Pílula de status para schedules — muestra el estado del último schedule en esa plataforma.
 * Se renderiza dentro de cada botón de bridge (TT/IG/LI).
 */
function ScheduleStatusBadge({
  state,
}: {
  state: { status: string; scheduledAt: number } | undefined;
}) {
  if (!state) return null;
  const { status, scheduledAt } = state;
  const dot =
    status === "published"
      ? "bg-emerald-400"
      : status === "failed"
        ? "bg-red-400"
        : status === "pending_manual"
          ? "bg-amber-400"
          : "bg-foreground/40";
  const short =
    status === "published"
      ? "✓"
      : status === "failed"
        ? "✗"
        : status === "pending_manual"
          ? "⌛"
          : status === "uploaded"
            ? "↑"
            : "•";
  const tooltip = `${status} · ${new Date(scheduledAt).toLocaleString("es")}`;
  return (
    <span
      title={tooltip}
      className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-foreground/10 text-[8px] text-foreground/80"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="sr-only">{short}</span>
    </span>
  );
}

function CaptionTabs({ project }: { project: ProjectExt }) {
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
