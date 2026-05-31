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
  Music2,
  ArrowRight,
  Hand,
} from "lucide-react";
import { toast } from "sonner";

interface UploadHelperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  caption: string;
  tiktokHandle?: string;
  source: "short" | "long_form";
}

export function UploadHelperDialog({
  open,
  onOpenChange,
  projectId,
  caption,
  tiktokHandle,
  source,
}: UploadHelperDialogProps) {
  const [renderPath, setRenderPath] = useState<string>("");
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [busy, setBusy] = useState<"start" | "openTiktok" | "copyPath" | "copyCaption" | null>(null);

  // Reset on open: patrón "store-and-compare" (recomendado por React docs) en
  // vez de useEffect+setState para evitar el render cascada.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setStep1Done(false);
      setStep2Done(false);
      setBusy(null);
    }
  }

  // Llama al endpoint que (a) copia el archivo al portapapeles, (b) abre Explorer
  // con el archivo seleccionado. Esto se hace en un solo click para que el usuario
  // sólo tenga que arrastrar.
  async function startUpload() {
    setBusy("start");
    try {
      // Abrir Explorer con el archivo seleccionado
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

      // También copiamos el archivo al portapapeles (sirve como fallback si querés
      // pegar en el cuadro de "abrir archivo" de Windows)
      await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/copy-file-to-clipboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        }
      );

      setStep1Done(true);
      toast.success("Explorer abierto con el video. Arrastralo a TikTok →");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function openTikTok() {
    setBusy("openTiktok");
    window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
    setTimeout(() => setBusy(null), 600);
  }

  async function copyPath() {
    setBusy("copyPath");
    try {
      await navigator.clipboard.writeText(renderPath);
      toast.success("Ruta copiada (Ctrl+V en el campo &quot;Nombre&quot; del file picker)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    setBusy("copyCaption");
    try {
      await navigator.clipboard.writeText(caption);
      setStep2Done(true);
      toast.success("Caption en el portapapeles. Pegalo en TikTok (Ctrl+V).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-pink-400" />
            Subir a TikTok{tiktokHandle ? ` como ${tiktokHandle}` : ""}
          </DialogTitle>
          <DialogDescription className="font-mono-tab text-[11px]">
            {projectId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* ── Step 1: abrir explorer y TikTok ───── */}
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
                Paso 1 — Abrir Explorer + TikTok
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
                onClick={openTikTok}
                disabled={busy !== null}
                variant="default"
                className="flex-col h-auto py-2 bg-pink-500 hover:bg-pink-400 text-white"
              >
                {busy === "openTiktok" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Music2 className="h-4 w-4" />
                )}
                <span className="mt-1 text-[10px]">Abrir TikTok</span>
              </Button>
            </div>

            {step1Done && renderPath && (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-2">
                <div className="flex items-center gap-1.5 font-mono-tab text-[10px] text-muted-foreground">
                  <Hand className="h-3 w-3 text-amber-400" />
                  ARRASTRÁ el video desde el Explorer (que se abrió) al área de
                  subida de TikTok.
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
                  copiar ruta (fallback si no podés arrastrar)
                </button>
              </div>
            )}
          </div>

          {/* ── Step 2: copiar caption ───── */}
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
                Paso 2 — Pegar la descripción
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
              {step2Done ? "Volver a copiar caption" : "Copiar caption viral"}
            </Button>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Cuando termine de cargar el video en TikTok, tocá este botón y pegá
              (<strong>Ctrl+V</strong>) en el campo de descripción.
            </p>
            {!caption && (
              <p className="mt-1 text-[10px] text-amber-400">
                Este proyecto no tiene caption — generalo con ✨ en la card.
              </p>
            )}
          </div>

          {/* ── Instrucciones rápidas siempre visibles ─── */}
          <div className="rounded-md border border-foreground/10 bg-muted/20 p-3 text-[11px] text-foreground/80">
            <p className="mb-1 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
              Cómo arrastrar en 5 segundos
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">1</span>
              <FolderOpen className="h-3.5 w-3.5 text-emerald-400" />
              <span>Explorer abre y el video queda &quot;seleccionado&quot; (resaltado)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">2</span>
              <Hand className="h-3.5 w-3.5 text-amber-400" />
              <span>
                Click sostenido sobre el video → arrastralo hacia la pestaña de TikTok
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tab text-foreground/70">3</span>
              <ArrowRight className="h-3.5 w-3.5 text-pink-400" />
              <span>Soltá el archivo en el área grande de TikTok que dice &quot;Select video&quot;</span>
            </div>
          </div>

          {step1Done && step2Done && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-200">
              ✓ Listo para publicar. Revisá la preview en TikTok y dale a
              &quot;Post&quot; cuando estés conforme.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground">
            <a
              href="https://www.tiktok.com/upload"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-pink-400"
            >
              <ExternalLink className="h-3 w-3" />
              tiktok.com/upload
            </a>
            <a
              href="https://www.tiktok.com/tiktokstudio/upload"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-pink-400"
              title="Versión nueva de Studio (a veces funciona mejor que /upload)"
            >
              <ExternalLink className="h-3 w-3" />
              tiktokstudio/upload
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
