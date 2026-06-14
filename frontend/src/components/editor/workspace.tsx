"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, ChevronLeft, Loader2, Mic, Pencil, Scissors, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { SubtitleEditor } from "@/components/editor/subtitle-editor";
import { BrollPicker } from "@/components/editor/broll-picker";
import { MusicPicker } from "@/components/editor/music-picker";
import { StickerPicker, type IconStickerInput } from "@/components/editor/sticker-picker";
import { AnimationsPanel } from "@/components/editor/animations-panel";
import { ExportPanel } from "@/components/editor/export-panel";
import { RenameDialog } from "@/components/editor/rename-dialog";
import { TimelineStrip, type TimelineData } from "@/components/editor/timeline-strip";

export interface Word {
  word: string;
  start: number;
  end: number;
  score?: number;
}

export interface BRollClip {
  start: number;
  end: number;
  url: string;
  thumbnail?: string;
}

export interface AnimationMark {
  at: number;
  type: "zoom" | "glow" | "shake";
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 500;
const SAVED_FLASH_MS = 1500;

export interface Project {
  id: string;
  videoId: string;
  day?: number | null;
  platforms: string[];
  caption?: string;
  status: "borrador" | "aprobado" | "publicado";
  subtitleStyle: "bebas" | "anton";
  subtitleColor: string;
  subtitleHighlight: string;
  musicTrack: string | null;
  musicVolume: number;
  bRoll: BRollClip[];
  animations: AnimationMark[];
  manualSubtitles: Word[];
  // Ola 1 — Stickers de la galería (iconos SVG + ilustraciones Lottie). El render
  // los consume como IconSticker (icon "ph:"/"tb:" o lottieSrc). Opt-in: ausente =
  // proyecto sin stickers (compat total con proyectos viejos).
  iconStickers?: IconStickerInput[];
  updatedAt?: string;
}

const DEFAULT_PROJECT = (id: string): Project => ({
  id,
  videoId: id,
  day: null,
  platforms: [],
  caption: "",
  status: "borrador",
  subtitleStyle: "bebas",
  subtitleColor: "#ffffff",
  subtitleHighlight: "#34d399",
  musicTrack: null,
  musicVolume: 0.35,
  bRoll: [],
  animations: [],
  manualSubtitles: [],
});

interface WorkspaceProps {
  projectId: string;
}

export function EditorWorkspace({ projectId }: WorkspaceProps) {
  const [project, setProject] = useState<Project>(DEFAULT_PROJECT(projectId));
  const [transcript, setTranscript] = useState<Word[] | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [detectingCuts, setDetectingCuts] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Duración real del video (para el timeline visual).
  const [videoDuration, setVideoDuration] = useState(0);
  // F4 — Preview en movimiento: 3s renderizados con TODOS los FX desde el punto actual.
  const [fxPreviewLoading, setFxPreviewLoading] = useState(false);
  const [fxPreviewUrl, setFxPreviewUrl] = useState<string | null>(null);

  async function generateFxPreview() {
    setFxPreviewLoading(true);
    setFxPreviewUrl(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/preview-clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at: currentTime }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error ?? "no se pudo generar la vista previa");
      setFxPreviewUrl(`${d.url}&ts=${Date.now()}`);
      if (d.cached) toast.success("Vista previa lista");
    } catch (e) {
      toastError(e, "No se pudo generar la vista previa");
    } finally {
      setFxPreviewLoading(false);
    }
  }
  const [renameOpen, setRenameOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProjectRef = useRef<Project | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (res.ok) {
          const data = (await res.json()) as Project;
          setProject({ ...DEFAULT_PROJECT(projectId), ...data });
        }
      } catch (err) {
        toast.error("No se pudo cargar el proyecto");
        console.error(err);
      }
      try {
        const res = await fetch(`/api/videos/transcribe?videoId=${encodeURIComponent(projectId)}`);
        if (res.ok) {
          const data = await res.json();
          setTranscript(data.transcript?.words ?? []);
        }
      } catch (err) {
        console.error("No se pudo cargar transcript:", err);
      }
    })();
  }, [projectId]);

  const flushSave = useCallback(async () => {
    const toSave = pendingProjectRef.current;
    if (!toSave) return;
    pendingProjectRef.current = null;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState((prev) => (pendingProjectRef.current ? prev : "saved"));
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, SAVED_FLASH_MS);
    } catch (err) {
      setSaveState("error");
      toastError(err, "No se pudo guardar");
    }
  }, [projectId]);

  const updateProject = useCallback(
    (patch: Partial<Project>) => {
      setProject((prev) => {
        const next = { ...prev, ...patch };
        pendingProjectRef.current = next;
        return next;
      });
      setSaveState("pending");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      if (pendingProjectRef.current) {
        // Best-effort flush al desmontar (navega a otra ruta, cierra pestaña, etc.)
        fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingProjectRef.current),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [projectId]);

  const onTranscribe = async () => {
    setTranscribing(true);
    try {
      const res = await fetch("/api/videos/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "transcribe failed");
      setTranscript(data.transcript.words);
      updateProject({ manualSubtitles: data.transcript.words });
      toast.success(`Transcripción lista — ${data.transcript.words.length} palabras`);
    } catch (err) {
      toastError(err, "No se pudo transcribir el video");
    } finally {
      setTranscribing(false);
    }
  };

  const onDetectCuts = async () => {
    setDetectingCuts(true);
    try {
      const res = await fetch("/api/videos/cuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "detect cuts failed");
      toast.success(`${data.cuts.silences.length} silencios detectados`);
    } catch (err) {
      toastError(err, "No se pudieron detectar los silencios");
    } finally {
      setDetectingCuts(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Link
          href="/editor"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Link>
        <span className="font-mono-tab text-xs text-muted-foreground">·</span>
        <h1 className="font-mono-tab text-base">{projectId}</h1>
        <span
          className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-sky-300"
          title="Aquí ajustas a mano un video ya generado. Para crear uno nuevo desde cero, usa «Crear automático» en la pantalla anterior."
        >
          edición manual
        </span>
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Renombrar archivo"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <SaveIndicator state={saveState} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onTranscribe} disabled={transcribing}>
            {transcribing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="mr-1.5 h-3.5 w-3.5" />
            )}
            Transcribir
          </Button>
          <Button size="sm" variant="outline" onClick={onDetectCuts} disabled={detectingCuts}>
            {detectingCuts ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Scissors className="mr-1.5 h-3.5 w-3.5" />
            )}
            Detectar silencios
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="overflow-hidden border-border bg-card p-0">
          <div className="aspect-[9/16] bg-black">
            <video
              ref={videoRef}
              src={`/api/videos/${encodeURIComponent(projectId)}/stream?source=raw`}
              controls
              className="h-full w-full"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
            />
          </div>
          <div className="border-t border-border p-3">
            <ActiveCaption words={transcript ?? project.manualSubtitles} time={currentTime} />
          </div>
          {/* F4 — Timeline visual: palabras + efectos sobre la línea de tiempo. */}
          <div className="border-t border-border p-3">
            <TimelineStrip
              duration={videoDuration}
              currentTime={currentTime}
              words={(project.manualSubtitles.length > 0 ? project.manualSubtitles : transcript ?? []).map(
                (w) => ({ word: w.word, start: w.start, end: w.end })
              )}
              data={project as unknown as TimelineData}
              onSeek={(t) => {
                if (videoRef.current) {
                  videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }
              }}
            />
            {/* Preview en movimiento: 3s reales con todos los FX desde el punto actual. */}
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={generateFxPreview}
                disabled={fxPreviewLoading}
                className="rounded-md bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-300 ring-1 ring-violet-500/40 transition hover:bg-violet-500/25 disabled:opacity-50"
              >
                {fxPreviewLoading
                  ? "Renderizando 3s con efectos (~1 min)…"
                  : `▶ Ver 3s CON EFECTOS desde ${currentTime.toFixed(1)}s`}
              </button>
              {fxPreviewUrl && (
                <video
                  src={fxPreviewUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="mx-auto mt-2 max-h-72 rounded-md border border-border shadow"
                />
              )}
            </div>
          </div>
        </Card>

        <Card className="border-border bg-card p-0">
          <Tabs defaultValue="subs" className="p-4">
            <TabsList className="w-full">
              <TabsTrigger value="meta" className="flex-1">
                Info
              </TabsTrigger>
              <TabsTrigger value="subs" className="flex-1">
                Subtítulos
              </TabsTrigger>
              <TabsTrigger value="broll" className="flex-1">
                Videos de apoyo
              </TabsTrigger>
              <TabsTrigger value="music" className="flex-1">
                Música
              </TabsTrigger>
              <TabsTrigger value="stickers" className="flex-1">
                Stickers
              </TabsTrigger>
              <TabsTrigger value="fx" className="flex-1">
                Efectos
              </TabsTrigger>
              <TabsTrigger value="export" className="flex-1" title="Generar el video final">
                <Wand2 className="mr-1 h-3.5 w-3.5" />
                Generar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="meta" className="mt-4 space-y-4">
              <MetaPanel project={project} update={updateProject} />
            </TabsContent>

            <TabsContent value="subs" className="mt-4">
              <SubtitleEditor
                words={project.manualSubtitles.length > 0 ? project.manualSubtitles : transcript ?? []}
                onChange={(words) => updateProject({ manualSubtitles: words })}
                currentTime={currentTime}
                style={project.subtitleStyle}
                color={project.subtitleColor}
                highlight={project.subtitleHighlight}
                onStyleChange={(s) => updateProject({ subtitleStyle: s })}
                onColorChange={(c) => updateProject({ subtitleColor: c })}
                onHighlightChange={(c) => updateProject({ subtitleHighlight: c })}
              />
            </TabsContent>

            <TabsContent value="broll" className="mt-4">
              <BrollPicker
                clips={project.bRoll}
                onChange={(clips) => updateProject({ bRoll: clips })}
                currentTime={currentTime}
              />
            </TabsContent>

            <TabsContent value="music" className="mt-4">
              <MusicPicker
                selected={project.musicTrack}
                volume={project.musicVolume}
                onSelect={(t) => updateProject({ musicTrack: t })}
                onVolumeChange={(v) => updateProject({ musicVolume: v })}
              />
            </TabsContent>

            <TabsContent value="stickers" className="mt-4">
              <StickerPicker
                currentTime={currentTime}
                selectedCount={project.iconStickers?.length ?? 0}
                onAdd={(s) =>
                  updateProject({ iconStickers: [...(project.iconStickers ?? []), s] })
                }
              />
            </TabsContent>

            <TabsContent value="fx" className="mt-4">
              <AnimationsPanel
                animations={project.animations}
                onChange={(a) => updateProject({ animations: a })}
                currentTime={currentTime}
              />
            </TabsContent>

            <TabsContent value="export" className="mt-4">
              <ExportPanel project={project} videoDurationSec={videoDuration} />
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <RenameDialog
        currentId={projectId}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        redirectAfterRename
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const config = {
    pending: {
      icon: <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />,
      text: "cambios sin guardar",
      className: "text-amber-400",
    },
    saving: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      text: "guardando…",
      className: "text-muted-foreground",
    },
    saved: {
      icon: <Check className="h-3 w-3" />,
      text: "guardado",
      className: "text-emerald-400",
    },
    error: {
      icon: <AlertCircle className="h-3 w-3" />,
      text: "error al guardar",
      className: "text-red-400",
    },
  }[state];
  return (
    <span className={`flex items-center gap-1.5 font-mono-tab text-[10px] uppercase tracking-wider ${config.className}`}>
      {config.icon}
      {config.text}
    </span>
  );
}

function ActiveCaption({ words, time }: { words: Word[]; time: number }) {
  if (words.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aún no hay transcripción. Da clic en «Transcribir».
      </p>
    );
  }
  const active = words.find((w) => time >= w.start && time <= w.end);
  const upcoming = words.filter((w) => w.start > time && w.start < time + 1.5).slice(0, 6);
  return (
    <p className="text-sm leading-relaxed">
      {active && (
        <span className="rounded bg-brand-pink/20 px-1 text-brand-pink">{active.word}</span>
      )}
      {active && " "}
      <span className="text-muted-foreground">
        {upcoming.map((w) => w.word).join(" ")}
      </span>
    </p>
  );
}

function MetaPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Día del calendario (1–30)</Label>
        <Input
          type="number"
          min={1}
          max={30}
          value={project.day ?? ""}
          onChange={(e) => update({ day: e.target.value ? parseInt(e.target.value, 10) : null })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Plataformas destino</Label>
        <div className="flex flex-wrap gap-2">
          {(["instagram", "linkedin"] as const).map((p) => {
            const selected = project.platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const next = selected
                    ? project.platforms.filter((x) => x !== p)
                    : [...project.platforms, p];
                  update({ platforms: next });
                }}
                className={`rounded-md border px-3 py-1 text-xs ${
                  selected
                    ? "border-foreground/40 bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <textarea
          value={project.caption ?? ""}
          onChange={(e) => update({ caption: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-border bg-muted/30 p-2 text-sm"
          placeholder="Texto que vas a pegar al publicar..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Estado</Label>
        <select
          value={project.status}
          onChange={(e) =>
            update({ status: e.target.value as Project["status"] })
          }
          className="w-full rounded-md border border-border bg-muted/30 p-2 text-sm"
        >
          <option value="borrador">borrador</option>
          <option value="aprobado">aprobado</option>
          <option value="publicado">publicado</option>
        </select>
      </div>
    </div>
  );
}
