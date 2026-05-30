"use client";

/**
 * Paso Cinematográfico del wizard (cortos y largos).
 *
 * UX:
 *   - Toggle "Activar modo cinematográfico"
 *   - Drag-drop / file picker para subir imágenes
 *   - Cada imagen muestra preview + input descripción
 *   - Botón "Convocar asamblea" → llama /api/overlays/assembly
 *   - Toggles film grain / vignette / subtítulos cinematic
 *
 * Output (vía props.onChange): { enabled, overlayIds[], filmGrain, vignette, subtitleStyleCinematic }
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  X,
  Loader2,
  Sparkles,
  Film,
  Camera,
  Type,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CinematicConfig {
  enabled: boolean;
  overlayIds: string[];
  filmGrain: boolean;
  vignette: boolean;
  subtitleStyleCinematic: boolean;
  assemblyResult?: AssemblyResult | null;
}

interface AssemblyResult {
  vision?: { visionStatement?: string; acts?: { name: string; emotionalTone: string }[] };
  timeline?: Record<string, unknown>;
  _elapsed_sec?: number;
}

interface OverlayPreview {
  id: string;
  filename: string;
  description?: string;
  userOrder?: number;
  startTime?: number | null;
  endTime?: number | null;
  effect?: string;
}

interface CinematicStepProps {
  /** ID del video al que se atan los overlays */
  videoId: string;
  /** Path absoluto al transcript JSON (output WhisperX) — null si no hay todavía */
  transcriptPath?: string | null;
  /** Duración del video en segundos (necesaria para la asamblea) */
  videoDurationSec?: number;
  value: CinematicConfig;
  onChange: (config: CinematicConfig) => void;
}

export function CinematicStep({
  videoId,
  transcriptPath,
  videoDurationSec,
  value,
  onChange,
}: CinematicStepProps) {
  const [overlays, setOverlays] = useState<OverlayPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [assemblyLoading, setAssemblyLoading] = useState(false);

  // Ref para tener siempre el value más reciente sin causar re-render del callback.
  // Evita el bug donde refresh() llamaba onChange con un closure viejo y reseteaba enabled.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/overlays/list?videoId=${encodeURIComponent(videoId)}`);
      const d = await r.json();
      const items: OverlayPreview[] = d.overlays ?? [];
      setOverlays(items);
      // Sincronizar overlayIds usando el VALUE MÁS RECIENTE (no el closure)
      const ids = items.map((o) => o.id);
      const current = valueRef.current;
      // Solo llamamos onChange si los IDs cambiaron (evita re-renders innecesarios)
      if (
        current.overlayIds.length !== ids.length ||
        current.overlayIds.some((id, i) => id !== ids[i])
      ) {
        onChange({ ...current, overlayIds: ids });
      }
    } catch {
      // ignore
    }
  }, [videoId, onChange]);

  useEffect(() => {
    if (value.enabled) refresh();
  }, [value.enabled, refresh]);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("videoId", videoId);
        form.append("file", file);
        const r = await fetch("/api/overlays/upload", { method: "POST", body: form });
        if (r.ok) okCount++;
        else failCount++;
      }
      if (okCount > 0) toast.success(`${okCount} imagen(es) subida(s)`);
      if (failCount > 0) toast.error(`${failCount} fallaron`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function updateDescription(id: string, description: string) {
    try {
      await fetch(`/api/overlays/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
    } catch {
      // silencioso
    }
  }

  /**
   * Asigna orden manual a un overlay. El agente VFX respeta este orden:
   * orden=1 aparece antes que orden=2, etc. Si dejás vacío, gana el matching
   * semántico del transcript.
   */
  async function updateOrder(id: string, orderRaw: string) {
    const n = parseInt(orderRaw, 10);
    const userOrder = isNaN(n) || n < 1 ? null : n;
    try {
      await fetch(`/api/overlays/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userOrder }),
      });
      // Refrescar para que se reordene visualmente
      refresh();
    } catch {
      // silencioso
    }
  }

  async function removeOverlay(id: string) {
    if (!confirm("¿Borrar esta imagen?")) return;
    try {
      await fetch(`/api/overlays/${encodeURIComponent(id)}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function convokeAssembly() {
    if (!transcriptPath || !videoDurationSec) {
      toast.error("Necesito transcript + duración del video para convocar la asamblea");
      return;
    }
    if (overlays.length === 0) {
      const ok = confirm(
        "No subiste imágenes. La asamblea decidirá pacing, camera moves, color, SFX y subtítulos pero NO ubicará overlays. ¿Continuar?"
      );
      if (!ok) return;
    }
    setAssemblyLoading(true);
    try {
      const r = await fetch("/api/overlays/assembly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          transcriptPath,
          duration: videoDurationSec,
          applyToOverlays: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "asamblea falló");
      onChange({ ...value, assemblyResult: d });
      toast.success(
        `Asamblea lista en ${d._elapsed_sec}s · ${overlays.length} overlays distribuidos`
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAssemblyLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-violet-500/40 bg-violet-500/5 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Film className="h-4 w-4 text-violet-400" />
            Modo cinematográfico
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Subí imágenes (memes, capturas, fotos) y una asamblea de agentes IA decidirá
            cuándo aparecen, con qué efecto (VHS, polaroid, memory flash), camera moves,
            SFX y subtítulos cinematográficos.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="h-4 w-4 accent-violet-500"
          />
          <span className="text-sm font-medium">
            {value.enabled ? "Activado" : "Activar"}
          </span>
        </label>
      </div>

      {value.enabled && (
        <>
          {/* Upload area */}
          <div
            className="rounded-lg border-2 border-dashed border-border bg-card/30 p-6"
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                Arrastrá tus imágenes acá o
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs hover:bg-muted">
                <Upload className="h-3 w-3" />
                Seleccionar archivos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                  disabled={uploading}
                />
              </label>
              <p className="mt-2 font-mono-tab text-[10px] text-muted-foreground">
                jpg / png / webp · máx 5 MB c/u
              </p>
            </div>
          </div>

          {/* Lista de overlays */}
          {overlays.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
                  {overlays.length} {overlays.length === 1 ? "imagen" : "imágenes"} subida(s)
                </p>
                <p className="font-mono-tab text-[9px] text-muted-foreground">
                  ↓ ordená 1,2,3… o dejá vacío y la IA decide
                </p>
              </div>

              {/* Tip importante para que el user sepa qué hace */}
              <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-[11px] text-sky-200">
                <strong>Cómo guiar la IA:</strong>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-sky-200/80">
                  <li>
                    <strong>Descripción</strong>: escribí palabras clave que estén en el guión hablado
                    (ej: «Carnegie», «HubSpot», «vendedor de seguros»). La IA busca esas palabras en
                    el transcript y muestra la imagen ahí.
                  </li>
                  <li>
                    <strong>Orden (#)</strong>: si querés forzar el orden manual (1, 2, 3…), poné el
                    número. La IA respeta ese orden por encima del matching.
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {overlays
                  .slice()
                  .sort((a, b) => {
                    // Ordenar por userOrder asc, después por id (estable)
                    const ao = a.userOrder ?? 999;
                    const bo = b.userOrder ?? 999;
                    if (ao !== bo) return ao - bo;
                    return a.id.localeCompare(b.id);
                  })
                  .map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                    >
                      <img
                        src={`/api/overlays/${encodeURIComponent(o.id)}/image`}
                        alt={o.filename}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            defaultValue={o.userOrder ?? ""}
                            placeholder="#"
                            className="h-6 w-10 px-1 text-center text-[11px] font-mono-tab"
                            title="Orden manual (1, 2, 3…). Dejá vacío para auto-match con IA."
                            onBlur={(e) => updateOrder(o.id, e.target.value)}
                          />
                          <p className="line-clamp-1 text-xs font-medium" title={o.filename}>
                            {o.filename}
                          </p>
                        </div>
                        <Input
                          type="text"
                          defaultValue={o.description ?? ""}
                          placeholder="palabras clave del guión (ej: HubSpot, Carnegie)…"
                          className="h-7 text-[11px]"
                          onBlur={(e) => updateDescription(o.id, e.target.value)}
                        />
                        {o.startTime !== undefined && o.startTime !== null && (
                          <p className="font-mono-tab text-[10px] text-emerald-400">
                            ✓ {o.startTime}s → {o.endTime}s · {o.effect}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOverlay(o.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Botón convocar asamblea */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={convokeAssembly}
              disabled={assemblyLoading || !transcriptPath}
              className="bg-violet-500 hover:bg-violet-400 text-white"
            >
              {assemblyLoading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-3.5 w-3.5" />
              )}
              {assemblyLoading
                ? "Asamblea trabajando (3-5 min)…"
                : "Convocar asamblea cinematográfica"}
            </Button>
            {!transcriptPath && (
              <span className="font-mono-tab text-[10px] text-amber-400">
                ⚠ falta transcript del video
              </span>
            )}
          </div>

          {/* Preview del resultado de la asamblea */}
          {value.assemblyResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Asamblea completada en {value.assemblyResult._elapsed_sec}s
              </p>
              {value.assemblyResult.vision?.visionStatement && (
                <p className="mb-2 text-xs italic text-emerald-200/80">
                  Visión: &quot;{value.assemblyResult.vision.visionStatement}&quot;
                </p>
              )}
              {value.assemblyResult.vision?.acts && (
                <div className="flex flex-wrap gap-1.5">
                  {value.assemblyResult.vision.acts.map((act, i) => (
                    <span
                      key={i}
                      className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono-tab text-[10px] text-emerald-200"
                    >
                      {act.name} · {act.emotionalTone}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toggles cinematic */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ToggleCard
              icon={Camera}
              label="Film grain"
              description="Textura de grano sutil (look de cine 35mm)"
              checked={value.filmGrain}
              onChange={(checked) => onChange({ ...value, filmGrain: checked })}
            />
            <ToggleCard
              icon={Film}
              label="Vignette"
              description="Bordes oscuros sutiles"
              checked={value.vignette}
              onChange={(checked) => onChange({ ...value, vignette: checked })}
            />
            <ToggleCard
              icon={Type}
              label="Subtítulos cine"
              description="Letter-spacing wide + glow"
              checked={value.subtitleStyleCinematic}
              onChange={(checked) =>
                onChange({ ...value, subtitleStyleCinematic: checked })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function ToggleCard({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: typeof Camera;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
        checked
          ? "border-violet-400 bg-violet-500/10"
          : "border-border bg-card hover:bg-muted/30"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <Icon className={cn("h-4 w-4", checked ? "text-violet-400" : "text-muted-foreground")} />
        <span
          className={cn(
            "rounded px-1 font-mono-tab text-[9px] uppercase tracking-wider",
            checked ? "bg-violet-500/30 text-violet-200" : "text-muted-foreground"
          )}
        >
          {checked ? "ON" : "OFF"}
        </span>
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-[10px] text-muted-foreground">{description}</p>
    </button>
  );
}
