"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Film,
  Loader2,
  Scissors,
  XCircle,
  X,
} from "lucide-react";

/**
 * Panel global de cola de jobs. Polling 3s a /api/jobs/queue.
 * Se monta en layout.tsx para que sobreviva la navegación entre páginas.
 *
 * Se muestra como card fixed bottom-right SOLO cuando hay jobs activos o pendientes.
 * El usuario puede colapsar/cerrar el panel; si llegan jobs nuevos se vuelve a abrir.
 */

interface QueueEntryView {
  kind: "editor" | "long_form";
  jobId: string;
  videoId?: string;
  status: string;
  progress: number;
  position: number | null;
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface QueueResponse {
  maxConcurrent: number;
  active: QueueEntryView[];
  pending: QueueEntryView[];
  totalActive: number;
  totalPending: number;
}

const POLL_INTERVAL_MS = 3000;

export function QueuePanel() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Cuando llega un job nuevo, re-abrir el panel
  const [lastSeenJobIds, setLastSeenJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch("/api/jobs/queue");
        if (!r.ok) return;
        const d = (await r.json()) as QueueResponse;
        if (cancelled) return;
        setData(d);

        // Detectar jobs nuevos para des-colapsar el panel
        const currentIds = new Set([...d.active, ...d.pending].map((e) => e.jobId));
        const newIds = Array.from(currentIds).filter((id) => !lastSeenJobIds.has(id));
        if (newIds.length > 0) {
          setLastSeenJobIds(currentIds);
          setCollapsed(false);
        }
      } catch {
        // silencioso — corre cada 3s, no spamear errores
      }
    }

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lastSeenJobIds]);

  if (!data || (data.totalActive === 0 && data.totalPending === 0)) {
    // No mostrar nada cuando no hay jobs vivos.
    return null;
  }

  // Filtrar dismissed (jobs done/failed que el usuario marcó como "ya vi")
  const active = data.active.filter((e) => !dismissed.has(e.jobId));
  const pending = data.pending.filter((e) => !dismissed.has(e.jobId));

  if (active.length === 0 && pending.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-32px)]">
      <div className="rounded-lg border border-border bg-card shadow-xl backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80"
          >
            <Scissors className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              Cola ({active.length} activo{active.length === 1 ? "" : "s"} · {pending.length} esperando)
            </span>
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className="font-mono-tab text-[9px] text-muted-foreground">
            max {data.maxConcurrent} a la vez
          </span>
        </div>

        {!collapsed && (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {/* Activos */}
            {active.map((e) => (
              <QueueRow
                key={e.jobId}
                entry={e}
                onDismiss={() => setDismissed((d) => new Set([...d, e.jobId]))}
              />
            ))}
            {/* Pendientes */}
            {pending.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <p className="mb-1 px-1 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
                  En cola
                </p>
                {pending.map((e) => (
                  <QueueRow
                    key={e.jobId}
                    entry={e}
                    onDismiss={() => setDismissed((d) => new Set([...d, e.jobId]))}
                  />
                ))}
              </div>
            )}

            {/* Footer link */}
            <div className="mt-2 border-t border-border pt-2 text-center">
              <Link
                href="/produccion"
                className="font-mono-tab text-[10px] text-muted-foreground hover:text-emerald-400"
              >
                Ver renders en producción →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({ entry, onDismiss }: { entry: QueueEntryView; onDismiss: () => void }) {
  const KindIcon = entry.kind === "long_form" ? Film : Scissors;
  const kindColor = entry.kind === "long_form" ? "text-violet-400" : "text-emerald-400";
  const isFinal = entry.status === "done" || entry.status === "failed";

  return (
    <div
      className={cn(
        "mb-1.5 rounded-md border p-2 text-xs",
        entry.status === "running" && "border-amber-500/30 bg-amber-500/5",
        entry.status === "queued" && "border-border bg-muted/30",
        entry.status === "done" && "border-emerald-500/30 bg-emerald-500/5",
        entry.status === "failed" && "border-red-500/30 bg-red-500/5"
      )}
    >
      <div className="mb-1 flex items-start gap-2">
        <KindIcon className={cn("mt-0.5 h-3 w-3 shrink-0", kindColor)} />
        <div className="flex-1 min-w-0">
          <p className="truncate font-mono-tab text-[11px] text-foreground">
            {entry.videoId ?? entry.jobId.slice(-8)}
          </p>
          {entry.detail && (
            <p className="truncate font-mono-tab text-[9px] text-muted-foreground">{entry.detail}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={entry.status} position={entry.position} />
          {isFinal && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Cerrar"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {/* Progress bar (sólo si está running) */}
      {entry.status === "running" && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-amber-400 transition-all duration-500"
            style={{ width: `${entry.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, position }: { status: string; position: number | null }) {
  if (status === "queued" && position != null) {
    return (
      <span className="flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        #{position}
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-amber-300">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        run
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex items-center gap-0.5 rounded bg-emerald-500/20 px-1 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-emerald-300">
        <CheckCircle2 className="h-2.5 w-2.5" />
        ok
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-0.5 rounded bg-red-500/20 px-1 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-red-300">
        <XCircle className="h-2.5 w-2.5" />
        fail
      </span>
    );
  }
  return (
    <span className="rounded bg-muted px-1 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
      {status}
    </span>
  );
}
