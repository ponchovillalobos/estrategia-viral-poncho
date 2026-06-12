"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Copy,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Camera,
  ArrowRight,
  Hand,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";

interface InstagramHelperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  caption: string;
  instagramHandle?: string;
  source: "short" | "long_form";
}

export function InstagramHelperDialog({
  open,
  onOpenChange,
  projectId,
  caption,
  instagramHandle,
  source,
}: InstagramHelperDialogProps) {
  const [renderPath, setRenderPath] = useState<string>("");
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [busy, setBusy] = useState<"start" | "openInsta" | "copyPath" | "copyCaption" | null>(
    null
  );

  // Reset on open: patrón store-and-compare en vez de useEffect+setState.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setStep1Done(false);
      setStep2Done(false);
      setBusy(null);
    }
  }

  async function startUpload() {
    setBusy("start");
    try {
      const revealRes = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/reveal-render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        }
      );
      const revealData = await revealRes.json();
      if (!revealRes.ok) throw new Error(revealData.error ?? `HTTP ${revealRes.status}`);
      setRenderPath(revealData.path ?? "");

      // También copiamos el archivo al clipboard (fallback útil si arrastrar no funciona)
      await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/copy-file-to-clipboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        }
      );

      setStep1Done(true);
      toast.success("Explorer abierto con el video. Arrástralo a Instagram →");
    } catch (err) {
      toastError(err, "No se pudo preparar el video");
    } finally {
      setBusy(null);
    }
  }

  function openInstagram() {
    setBusy("openInsta");
    // /create/reel es el flujo oficial; si no, /create/select sirve como fallback
    window.open("https://www.instagram.com/create/reel/", "_blank", "noopener,noreferrer");
    setTimeout(() => setBusy(null), 600);
  }

  async function copyPath() {
    setBusy("copyPath");
    try {
      await navigator.clipboard.writeText(renderPath);
      toast.success("Ruta copiada (úsala en el selector de archivos de IG si no puedes arrastrar)");
    } catch (err) {
      toastError(err, "No se pudo copiar la ruta");
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    setBusy("copyCaption");
    try {
      await navigator.clipboard.writeText(caption);
      setStep2Done(true);
      toast.success("Descripción de Instagram en el portapapeles. Ctrl+V en el campo de descripción.");
    } catch (err) {
      toastError(err, "No se pudo copiar la descripción");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-amber-400" />
            Subir a Instagram Reels{instagramHandle ? ` como ${instagramHandle}` : ""}
          </DialogTitle>
          <DialogDescription className="font-mono-tab text-[11px]">
            {projectId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Paso 1 — Explorer + Instagram */}
          <div
            className={`rounded-lg border p-3 ${
              step1Done
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                {step1Done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground text-[9px]">
                    1
                  </span>
                )}
                Paso 1 — Abrir Explorer + Instagram
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={startUpload}
                disabled={busy !== null}
                variant={step1Done ? "outline" : "default"}
                className="flex-col h-auto py-2"
              >
                {busy === "start" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                <span className="mt-1 text-[10px]">
                  {step1Done ? "Reabrir Explorer" : "Abrir Explorer"}
                </span>
              </Button>
              <Button
                onClick={openInstagram}
                disabled={busy !== null}
                variant="default"
                className="flex-col h-auto py-2 bg-amber-500 hover:bg-amber-400 text-white"
              >
                {busy === "openInsta" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                <span className="mt-1 text-[10px]">Abrir Instagram</span>
              </Button>
            </div>

            {step1Done && renderPath && (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-2">
                <div className="flex items-center gap-1.5 font-mono-tab text-[10px] text-muted-foreground">
                  <Hand className="h-3 w-3 text-amber-400" />
                  ARRASTRA el video del Explorer al área de subida de Instagram (o usa &quot;Subir desde computadora&quot;).
                </div>
                <div className="rounded bg-muted/30 px-2 py-1.5 font-mono-tab text-[10px] text-foreground/80 break-all">
                  {renderPath}
                </div>
                <button
                  type="button"
                  onClick={copyPath}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-1 rounded border border-border px-2 py-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {busy === "copyPath" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  copiar ruta (fallback)
                </button>
              </div>
            )}
          </div>

          {/* Paso 2 — caption */}
          <div
            className={`rounded-lg border p-3 ${
              step2Done
                ? "border-emerald-500/40 bg-emerald-500/5"
                : step1Done
                  ? "border-border bg-muted/30"
                  : "border-border bg-muted/10 opacity-60"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                {step2Done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground text-[9px]">
                    2
                  </span>
                )}
                Paso 2 — Pegar descripción
              </span>
            </div>

            <Button
              onClick={copyCaption}
              disabled={busy !== null || !step1Done || !caption}
              variant={step2Done ? "outline" : "default"}
              className="w-full"
            >
              {busy === "copyCaption" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {step2Done ? "Volver a copiar descripción IG" : "Copiar descripción Instagram"}
            </Button>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Cuando termine de cargar el Reel, da clic en este botón y pega (<strong>Ctrl+V</strong>)
              en el campo de descripción de IG.
            </p>
            {!caption && (
              <p className="mt-1 text-[10px] text-amber-400">
                Este proyecto no tiene descripción de Instagram — genérala con ✨ en la tarjeta.
              </p>
            )}
          </div>

          {/* Instrucciones rápidas */}
          <div className="rounded-md border border-foreground/10 bg-muted/20 p-3 text-[11px] text-foreground/80">
            <p className="mb-1 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
              Tips Instagram Reels
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">•</span>
              <span>IG acepta arrastrar desde el Explorer. Si falla, usa &quot;Subir desde computadora&quot;.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">•</span>
              <span>La descripción ya viene con hashtags al final — no los pongas en comentarios.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">•</span>
              <span>Antes de publicar, marca &quot;Compartir también en feed&quot; para doble alcance.</span>
            </div>
          </div>

          {step1Done && step2Done && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-200">
              ✓ Listo para publicar en Instagram. Da clic en &quot;Compartir&quot; cuando estés conforme.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground">
            <a
              href="https://www.instagram.com/create/reel/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-amber-400"
            >
              <ExternalLink className="h-3 w-3" />
              instagram.com/create/reel
            </a>
            <a
              href="https://business.instagram.com/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-amber-400"
              title="Si necesitás pasar a cuenta Business / Creator"
            >
              <ArrowRight className="h-3 w-3" />
              business setup
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
