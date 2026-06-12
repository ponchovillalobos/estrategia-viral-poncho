"use client";

import { FileVideo, Check, Copy, Loader2, Music2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CaptionTabs } from "@/components/produccion/caption-tabs";
import { STYLE_LABEL, type ProjectExt } from "@/components/produccion/produccion-types";
import { toastError } from "@/lib/toast-error";

/**
 * Diálogo modal de preview de un proyecto: video 9:16 a la izquierda + transcripción
 * y captions multi-plataforma a la derecha (apilados en móvil).
 *
 * Toda la transcripción se carga "lazy" en el padre vía `loadTranscript` cuando el dialog
 * se abre; este componente sólo presenta los estados (cargando / con texto / sin texto).
 */
export function ProjectPreviewDialog({
  project,
  onClose,
  tiktokHandle,
  transcriptByVideoId,
  loadingTranscript,
  transcriptCopied,
  onCopyTranscript,
}: {
  project: ProjectExt | null;
  onClose: () => void;
  tiktokHandle: string;
  transcriptByVideoId: Record<string, string>;
  loadingTranscript: boolean;
  transcriptCopied: boolean;
  onCopyTranscript: (videoId: string) => void;
}) {
  // Abre la carpeta donde está el archivo del video, con el archivo seleccionado.
  async function revealRender(p: ProjectExt) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}/reveal-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: p.source ?? "short" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      toastError(err, "No se pudo abrir la carpeta");
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[95vw] p-0 bg-black sm:max-w-3xl md:max-w-4xl"
        showCloseButton
      >
        <DialogTitle className="sr-only">
          Vista previa de {project?.title ?? project?.id ?? ""}
        </DialogTitle>
        {project && (
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-0 max-h-[85vh]">
            {/* Video */}
            <div className="flex flex-col bg-black md:max-w-[360px]">
              <video
                key={project.id}
                src={`/api/videos/${encodeURIComponent(project.id)}/stream?source=render`}
                controls
                autoPlay
                playsInline
                className="aspect-[9/16] w-full bg-black md:max-w-[360px]"
              />
              <div className="space-y-1.5 border-t border-foreground/10 bg-card p-3 text-sm">
                <p className="text-sm font-semibold leading-tight text-foreground">
                  {project.title ?? project.id}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  {project.styleId && (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {STYLE_LABEL[project.styleId] ?? project.styleId}
                    </span>
                  )}
                  {(project.platforms ?? []).map((plat) => (
                    <span
                      key={plat}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono-tab"
                    >
                      {plat}
                    </span>
                  ))}
                  {tiktokHandle && (project.platforms ?? []).includes("tiktok") && (
                    <span className="flex items-center gap-1 font-mono-tab text-pink-400">
                      <Music2 className="h-2.5 w-2.5" />
                      {tiktokHandle}
                    </span>
                  )}
                </div>
                {/* Acciones del archivo — siempre disponibles bajo el player. */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <a
                    href={`/api/videos/${encodeURIComponent(project.id)}/stream?source=render&download=1`}
                    download
                    title="Descargar el MP4 a tu compu"
                    className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15"
                  >
                    💾 Guardar video
                  </a>
                  <button
                    type="button"
                    onClick={() => revealRender(project)}
                    title="Abrir la carpeta donde está el archivo del video"
                    className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground hover:border-emerald-400/50 hover:text-emerald-300"
                  >
                    📂 Abrir carpeta
                  </button>
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
                {transcriptByVideoId[project.videoId] && (
                  <button
                    type="button"
                    onClick={() => onCopyTranscript(project.videoId)}
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
                {loadingTranscript && !transcriptByVideoId[project.videoId] ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Cargando transcripción…
                  </div>
                ) : transcriptByVideoId[project.videoId] ? (
                  <p className="whitespace-pre-wrap text-foreground/90">
                    {transcriptByVideoId[project.videoId]}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No hay transcripción disponible para este video
                    (probablemente sin habla detectada).
                  </p>
                )}
              </div>

              {/* Captions por plataforma — tabs TikTok/LinkedIn/Instagram */}
              {(project.captions || project.caption) && (
                <CaptionTabs project={project} />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
