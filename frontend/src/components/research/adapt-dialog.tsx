"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCcw, Copy, Check, X, Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AdaptedResult {
  adaptedScript: string;
  hook: string;
  suggestedHashtags: string[];
  beats?: { label: string; text: string }[];
}

interface AdaptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  originalTranscript: string;
  initialAdapted?: string;
  initialHook?: string;
  initialHashtags?: string[];
  onSaved?: (script: string) => void;
  /** Si pasado, se llama cuando el usuario hace "Marcar listo para grabar" */
  onMarkReady?: () => void;
}

export function AdaptDialog({
  open,
  onOpenChange,
  itemId,
  originalTranscript,
  initialAdapted,
  initialHook,
  initialHashtags,
  onSaved,
  onMarkReady,
}: AdaptDialogProps) {
  const [adapted, setAdapted] = useState(initialAdapted ?? "");
  const [hook, setHook] = useState(initialHook ?? "");
  const [hashtags, setHashtags] = useState<string[]>(initialHashtags ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset on open: patrón store-and-compare.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setAdapted(initialAdapted ?? "");
      setHook(initialHook ?? "");
      setHashtags(initialHashtags ?? []);
    }
  }

  async function generate(regenerate = false) {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/research/${encodeURIComponent(itemId)}/adapt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "no se pudo adaptar");
      setAdapted(d.adaptedScript ?? "");
      setHook(d.hook ?? "");
      setHashtags(d.suggestedHashtags ?? []);
      toast.success(regenerate ? "Guión regenerado" : "Adaptación lista");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!adapted.trim()) {
      toast.error("El guión adaptado está vacío");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/research/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adaptedScript: adapted,
          adaptedHook: hook,
          suggestedHashtags: hashtags,
        }),
      });
      if (!r.ok) throw new Error("save falló");
      toast.success("Guión guardado");
      onSaved?.(adapted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function copyAdapted() {
    try {
      await navigator.clipboard.writeText(adapted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Guión copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  // Si abre sin adaptación previa, generar automáticamente al abrir
  useEffect(() => {
    if (open && !initialAdapted && !loading && !adapted) {
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] p-0 sm:max-w-5xl md:max-w-6xl">
        <DialogTitle className="border-b border-foreground/10 px-4 py-3">
          <span className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-400" />
            Adaptar guión a tu estilo
          </span>
        </DialogTitle>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-2 max-h-[78vh]">
          {/* Original (izquierda) */}
          <div className="flex min-h-0 flex-col border-r border-foreground/10 bg-muted/20">
            <div className="border-b border-foreground/10 px-3 py-2">
              <p className="font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                Guión original (no editable)
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {originalTranscript || "(sin transcript)"}
              </p>
            </div>
          </div>

          {/* Adaptado (derecha) */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-2">
              <p className="font-mono-tab text-[10px] uppercase tracking-wider text-violet-300">
                Tu adaptación (editable)
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => generate(true)}
                  disabled={loading}
                  className="flex items-center gap-1 rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-violet-400 disabled:opacity-40"
                  title="Re-generar con Claude"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                  re-gen
                </button>
                <button
                  type="button"
                  onClick={copyAdapted}
                  disabled={!adapted.trim()}
                  className="flex items-center gap-1 rounded p-1 font-mono-tab text-[10px] text-muted-foreground hover:bg-muted hover:text-emerald-400 disabled:opacity-40"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  copiar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading && !adapted ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                  <p className="font-mono-tab text-xs">
                    Claude está reescribiendo tu guión (15-40 seg)…
                  </p>
                </div>
              ) : (
                <>
                  {hook && (
                    <div className="mb-3 rounded-md border border-violet-500/30 bg-violet-500/5 p-2">
                      <p className="font-mono-tab text-[10px] uppercase tracking-wider text-violet-300">
                        Hook (primeros 3s)
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">{hook}</p>
                    </div>
                  )}
                  <textarea
                    value={adapted}
                    onChange={(e) => setAdapted(e.target.value)}
                    rows={14}
                    placeholder="El guión adaptado va a aparecer aquí. También podés escribirlo a mano si no querés usar Claude."
                    className="w-full resize-none rounded-md border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground/90 focus:border-violet-500/40 focus:outline-none"
                  />
                  {hashtags.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                        Hashtags sugeridos
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {hashtags.map((h, i) => (
                          <span
                            key={i}
                            className="rounded bg-muted px-2 py-0.5 font-mono-tab text-xs text-foreground"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer acciones */}
        <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-muted/20 p-3">
          <Button
            onClick={save}
            disabled={saving || !adapted.trim()}
            className="bg-violet-500 hover:bg-violet-400 text-white"
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Guardar versión
          </Button>
          {onMarkReady && (
            <Button
              variant="outline"
              onClick={() => {
                onMarkReady();
                onOpenChange(false);
              }}
              disabled={!adapted.trim()}
              className={cn("border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10")}
            >
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              Marcar listo para grabar
            </Button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="mr-1 inline h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
