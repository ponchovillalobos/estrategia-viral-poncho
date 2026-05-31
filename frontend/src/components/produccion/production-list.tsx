"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw, FileVideo, ExternalLink, Clock, Copy, Check, Sparkles, Loader2, Search, X, Upload, Play, Calendar, AlertCircle, Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScheduleDialog } from "@/components/produccion/schedule-dialog";
import { UploadHelperDialog } from "@/components/produccion/upload-helper-dialog";
import { InstagramHelperDialog } from "@/components/produccion/instagram-helper-dialog";
import { ScheduleStatusBadge } from "@/components/produccion/schedule-status-badge";
import { FilterChip } from "@/components/produccion/filter-chip";
import { ProjectPreviewDialog } from "@/components/produccion/project-preview-dialog";
import * as publishActions from "@/lib/produccion/publish-actions";
import * as scheduleHelpers from "@/lib/produccion/schedule-helpers";
import * as transcriptHelpers from "@/lib/produccion/transcript-helpers";
import {
  STATUS_COLOR,
  STATUS_OPTIONS,
  PLATFORM_OPTIONS,
  STYLE_LABEL,
  pickCaptionForPlatform,
  type StatusFilter,
  type PlatformFilter,
  type ProjectExt,
} from "@/components/produccion/produccion-types";

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

  const copyCaption = (p: ProjectExt) => publishActions.copyCaption(p, setCopiedId);
  const publishToLinkedIn = (p: ProjectExt) =>
    publishActions.publishToLinkedIn(p, setPublishingToLinkedin);
  const publishToInstagram = (p: ProjectExt) =>
    publishActions.publishToInstagram(p, setPublishingToInstagram);
  const postToTikTok = (p: ProjectExt) =>
    publishActions.postToTikTok(p, setPostingToTikTok, tiktokHandle);
  const regenerate = (p: ProjectExt, provider: string = "auto") =>
    publishActions.regenerate(p, setRegenerating, load, provider);

  // Carga el transcript del video. Cacheado por videoId.
  const loadTranscript = (videoId: string) =>
    transcriptHelpers.loadTranscript(
      videoId,
      transcriptByVideoId,
      setLoadingTranscript,
      setTranscriptByVideoId
    );
  const copyTranscript = (videoId: string) =>
    transcriptHelpers.copyTranscript(videoId, transcriptByVideoId, setTranscriptCopied);

  const loadSchedule = () => scheduleHelpers.loadSchedule(setScheduledByProjectId);

  // Load on mount: proyectos + schedules + settings. Patrón válido aunque el lint
  // quiere `use(promise)` (React 19); no migramos porque la pantalla tiene polling
  // y manejo de errores que mejor quedan aquí.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Cuando se abre el preview, cargá el transcript y reseteá el feedback de copiado.
  // Patrón store-and-compare en vez de useEffect+setState.
  const previewVideoId = previewProject?.videoId;
  const [prevPreviewVideoId, setPrevPreviewVideoId] = useState<string | undefined>(previewVideoId);
  if (prevPreviewVideoId !== previewVideoId) {
    setPrevPreviewVideoId(previewVideoId);
    setTranscriptCopied(false);
    if (previewVideoId) loadTranscript(previewVideoId);
  }

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

      <ProjectPreviewDialog
        project={previewProject}
        onClose={() => setPreviewProject(null)}
        tiktokHandle={tiktokHandle}
        transcriptByVideoId={transcriptByVideoId}
        loadingTranscript={loadingTranscript}
        transcriptCopied={transcriptCopied}
        onCopyTranscript={copyTranscript}
      />
    </div>
  );
}

