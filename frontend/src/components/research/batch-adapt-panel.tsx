"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface BatchProgress {
  batchId?: string;
  total?: number;
  done?: number;
  success?: number;
  failed?: number;
  currentItemId?: string | null;
  status?: "running" | "done" | "failed" | "idle";
  startedAt?: number;
  finishedAt?: number;
  errors?: { itemId: string; error: string }[];
}

interface BatchAdaptPanelProps {
  /** Cuántos items ready están SIN adapt (para el CTA principal) */
  readyWithoutAdapt: number;
  /** Callback cuando termina el batch — refrescar items */
  onComplete?: () => void;
}

export function BatchAdaptPanel({ readyWithoutAdapt, onComplete }: BatchAdaptPanelProps) {
  const [progress, setProgress] = useState<BatchProgress>({ status: "idle" });
  const [starting, setStarting] = useState(false);
  const [lastNotifiedId, setLastNotifiedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/research/adapt-batch");
      const d = await r.json();
      setProgress(d);
    } catch {
      // ignore
    }
  }, []);

  // Polling cuando hay un batch activo
  useEffect(() => {
    refresh();
    const isActive = progress.status === "running";
    const interval = setInterval(refresh, isActive ? 2500 : 8000);
    return () => clearInterval(interval);
  }, [refresh, progress.status]);

  // Detectar cuando el batch termina y disparar onComplete. Patrón store-and-compare:
  // el batchId actúa como guard contra repetir el toast/onComplete; comparar+actualizar
  // en render evita el render-cascada del patrón useEffect+setState.
  if (
    progress.status === "done" &&
    progress.batchId &&
    progress.batchId !== lastNotifiedId
  ) {
    setLastNotifiedId(progress.batchId);
    toast.success(
      `Adaptación lista · ${progress.success}/${progress.total} guiones generados`
    );
    onComplete?.();
  }

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/research/adapt-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "no se pudo arrancar");
      toast.success(`Adaptando ${d.total} guiones...`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!confirm("¿Cancelar el batch? Los items ya adaptados quedan guardados.")) return;
    try {
      await fetch("/api/research/adapt-batch", { method: "DELETE" });
      toast("Cancelado");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const isRunning = progress.status === "running";
  const isDone = progress.status === "done";
  const isFailed = progress.status === "failed";
  const pct =
    progress.total && progress.total > 0
      ? Math.round(((progress.done ?? 0) / progress.total) * 100)
      : 0;

  // Si no hay items para adaptar y no hay batch corriendo, no mostramos nada (limpio)
  if (!isRunning && !isDone && !isFailed && readyWithoutAdapt === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-violet-500/40 bg-violet-500/5 p-3">
      {isRunning ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            <span className="text-sm font-medium text-violet-200">
              Adaptando guiones con Claude...
            </span>
            <button
              type="button"
              onClick={cancel}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono-tab text-[10px] text-muted-foreground">
            <span>
              {progress.done ?? 0}/{progress.total ?? 0} · {pct}%
            </span>
            <span>
              ✓ {progress.success ?? 0} {(progress.failed ?? 0) > 0 ? `· ✗ ${progress.failed}` : ""}
            </span>
          </div>
          {progress.currentItemId && (
            <p className="mt-1 font-mono-tab text-[9px] text-muted-foreground">
              procesando: {progress.currentItemId}
            </p>
          )}
        </>
      ) : isDone ? (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-200">
            Listo · <strong>{progress.success}/{progress.total}</strong> guiones adaptados
            {(progress.failed ?? 0) > 0 && (
              <span className="text-red-300"> · {progress.failed} fallaron</span>
            )}
          </span>
          {readyWithoutAdapt > 0 && (
            <Button
              onClick={start}
              disabled={starting}
              className="ml-auto bg-violet-500 hover:bg-violet-400 text-white"
              size="sm"
            >
              {starting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Adaptar {readyWithoutAdapt} más
            </Button>
          )}
        </div>
      ) : isFailed ? (
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm text-red-200">
            Batch interrumpido · {progress.success}/{progress.total} completos
          </span>
          {readyWithoutAdapt > 0 && (
            <Button onClick={start} disabled={starting} className="ml-auto" size="sm">
              Reintentar
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="text-sm">
            <strong>{readyWithoutAdapt}</strong> guiones listos para adaptar al nicho{" "}
            <span className="text-violet-300">comunicación · persuasión · ventas · no verbal</span>
          </span>
          <Button
            onClick={start}
            disabled={starting || readyWithoutAdapt === 0}
            className="ml-auto bg-violet-500 hover:bg-violet-400 text-white"
          >
            {starting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Adaptar TODOS
          </Button>
        </div>
      )}
    </div>
  );
}
