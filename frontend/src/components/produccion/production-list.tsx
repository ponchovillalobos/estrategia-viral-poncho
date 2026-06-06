"use client";

// Thumbnails dinámicos de /api/videos/[id]/thumbnail.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectCardSkeleton } from "@/components/ui/skeleton";
import { RefreshCcw, ExternalLink, Clock, Copy, Check, Sparkles, Loader2, Search, X, Play, Calendar, Camera, Trash2, CheckSquare } from "lucide-react";
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
  const [previewProject, setPreviewProject] = useState<ProjectExt | null>(null);
  const [uploadHelperTarget, setUploadHelperTarget] = useState<ProjectExt | null>(null);
  const [instagramHelperTarget, setInstagramHelperTarget] = useState<ProjectExt | null>(null);
  const [publishingToLinkedin, setPublishingToLinkedin] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ProjectExt | null>(null);
  const [tiktokHandle, setTiktokHandle] = useState<string>("");
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
  // Selección múltiple para borrar en lote.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }

  // Borra el short de Producción (su JSON + el video renderizado). No toca el video
  // raw fuente. Optimista: lo saco de la lista ya; si falla, recargo para restaurar.
  async function removeProject(p: ProjectExt) {
    if (
      !confirm(
        `¿Borrar el short "${p.title ?? p.id}"?\n\nSe elimina de "Mis videos" junto con su video renderizado. El video original NO se toca. Esto no se puede deshacer.`
      )
    )
      return;
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      load(); // restaurar si algo falló
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // Borra TODOS los shorts seleccionados (su JSON + render). No toca los videos raw.
  async function removeSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Borrar ${ids.length} short${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}?\n\nSe eliminan de "Mis videos" junto con sus videos renderizados. Los videos originales NO se tocan. Esto no se puede deshacer.`
      )
    )
      return;
    setDeleting(true);
    setProjects((prev) => prev.filter((x) => !selectedIds.has(x.id)));
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
        )
      );
    } finally {
      setDeleting(false);
      exitSelectMode();
      load(); // refrescar contra el estado real del disco
    }
  }

  const copyCaption = (p: ProjectExt) => publishActions.copyCaption(p, setCopiedId);
  const publishToLinkedIn = (p: ProjectExt) =>
    publishActions.publishToLinkedIn(p, setPublishingToLinkedin);
  const publishToInstagram = (p: ProjectExt) =>
    publishActions.publishToInstagram(p, setPublishingToInstagram);
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
            <Button
              variant={selectMode ? "default" : "ghost"}
              size="sm"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              disabled={loading || projects.length === 0}
            >
              <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
              {selectMode ? "Cancelar" : "Seleccionar"}
            </Button>
          </div>
        </div>

        {/* Barra de acciones del modo selección — borrar varios a la vez. */}
        {selectMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="font-mono-tab text-xs text-muted-foreground">
              {selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set(filtered.map((p) => p.id)))}
              disabled={filtered.length === 0}
            >
              Seleccionar todos ({filtered.length})
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Limpiar selección
              </Button>
            )}
            <div className="ml-auto">
              <Button
                size="sm"
                onClick={removeSelected}
                disabled={selectedIds.size === 0 || deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Borrar {selectedIds.size > 0 ? `(${selectedIds.size})` : "seleccionados"}
              </Button>
            </div>
          </div>
        )}

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

      {projects.length === 0 && loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      )}

      {projects.length === 0 && !loading && (
        <EmptyState
          icon={Sparkles}
          tone="emerald"
          title="Todavía no tenés videos generados"
          description="Acá van a aparecer tus shorts ya editados, listos para publicar. Creá el primero eligiendo un video y un estilo."
          cta={{ label: "Crear mi primer video", href: "/editor" }}
        />
      )}

      {projects.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          tone="muted"
          title="Sin coincidencias para los filtros actuales"
          description="Probá cambiar el término de búsqueda o el filtro de estado/plataforma."
          cta={{ label: "Limpiar filtros", onClick: clearFilters }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
        {filtered.map((p) => (
          <Card
            key={p.id}
            className={`group overflow-hidden bg-card p-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10 ${
              selectMode && selectedIds.has(p.id)
                ? "border-red-500 ring-2 ring-red-500/50"
                : "border-border hover:border-primary/40"
            }`}
          >
            <div className="grid grid-cols-[140px_1fr] gap-0">
              <button
                type="button"
                onClick={() => (selectMode ? toggleSelect(p.id) : setPreviewProject(p))}
                title={selectMode ? "Click para seleccionar" : "Click para reproducir"}
                className="group relative aspect-[9/16] cursor-pointer overflow-hidden bg-zinc-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* Casilla de selección (solo en modo selección). */}
                {selectMode && (
                  <span
                    className={`absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-md border-2 ${
                      selectedIds.has(p.id)
                        ? "border-red-500 bg-red-500 text-white"
                        : "border-white/80 bg-black/50 text-transparent"
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </span>
                )}
                <img
                  src={`/api/videos/${encodeURIComponent(p.videoId)}/thumbnail`}
                  alt={p.id}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Play overlay on hover: backdrop oscuro + botón con scale-in. */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-11 w-11 scale-75 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
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
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize transition-colors hover:bg-muted/80"
                    >
                      {plat}
                    </span>
                  ))}
                  {p.source === "long_form" && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/20">
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
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("es") : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeProject(p)}
                        title="Borrar este short (no toca el video original)"
                        className="flex items-center rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
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

