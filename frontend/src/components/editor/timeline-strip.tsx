"use client";

/**
 * F4 — TIMELINE VISUAL del proyecto (auditoría: "el editor edita listas de números
 * a ciegas"). Muestra EN UNA TIRA dónde cae cada cosa a lo largo del video:
 *   - carril 1: las palabras del subtítulo (bloques)
 *   - carriles 2+: los efectos (zooms, reacciones, sonidos, tarjetas, gráficos…)
 * y la línea de reproducción actual. Click en cualquier punto = seek del player.
 * Solo lectura (v1) — la edición sigue en las pestañas, pero ahora VES el video.
 */
import { useRef } from "react";

interface TimelineMark {
  at: number;
  duration?: number;
}

export interface TimelineData {
  zoomMarks?: TimelineMark[];
  reactionZooms?: TimelineMark[];
  sfxMarks?: { at: number; sound?: string; duration?: number }[];
  emphasisCards?: TimelineMark[];
  dataViz?: TimelineMark[];
  iconStickers?: (TimelineMark & { fullscreen?: boolean })[];
  particleBursts?: TimelineMark[];
  proTransitions?: { at: number; duration?: number }[];
}

const FX_LANES: { key: keyof TimelineData; label: string; color: string }[] = [
  { key: "zoomMarks", label: "Zoom", color: "#fbbf24" },
  { key: "reactionZooms", label: "Reacción", color: "#f87171" },
  { key: "proTransitions", label: "Transición", color: "#60a5fa" },
  { key: "sfxMarks", label: "Sonido", color: "#c084fc" },
  { key: "emphasisCards", label: "Tarjeta", color: "#22d3ee" },
  { key: "dataViz", label: "Gráfico", color: "#34d399" },
  { key: "iconStickers", label: "Ícono", color: "#f9a8d4" },
  { key: "particleBursts", label: "Partículas", color: "#fb923c" },
];

// Ancho del gutter de labels a la izquierda (px). Compartido por todos los
// carriles para que las posiciones temporales queden ALINEADAS verticalmente.
const GUTTER = 68;

export function TimelineStrip({
  duration,
  currentTime,
  words,
  data,
  onSeek,
}: {
  duration: number;
  currentTime: number;
  words: { word: string; start: number; end: number }[];
  data: TimelineData;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (!duration || duration <= 0) return null;

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    onSeek(Math.min(duration, Math.max(0, t)));
  }

  // Solo los carriles de FX que tienen al menos un elemento (no mostrar vacíos).
  const activeLanes = FX_LANES.filter(
    (l) => Array.isArray(data[l.key]) && (data[l.key] as TimelineMark[]).length > 0
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono-tab text-[10px] uppercase tracking-wider text-muted-foreground">
          Línea de tiempo — click para saltar a ese momento
        </span>
        <span className="font-mono-tab text-[10px] text-muted-foreground">
          {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>

      <div className="relative select-none rounded-md border border-border bg-zinc-950/80 py-1.5 pr-1.5">
        {/* Zona de tracks (todo lo temporal vive aquí, alineado por el gutter) */}
        <div
          ref={trackRef}
          onClick={handleClick}
          className="relative cursor-pointer"
          style={{ marginLeft: GUTTER }}
        >
          {/* Carril de palabras */}
          <div className="relative mb-1 h-5 overflow-hidden rounded bg-muted/20">
            {words.map((w, i) => (
              <span
                key={`${w.start}-${i}`}
                title={`"${w.word}" · ${w.start.toFixed(1)}s`}
                className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap rounded-sm bg-foreground/10 px-0.5 text-[8px] leading-none text-foreground/70"
                style={{
                  left: pct(w.start),
                  width: `${Math.max(0.3, ((w.end - w.start) / duration) * 100)}%`,
                }}
              >
                {w.word}
              </span>
            ))}
          </div>

          {/* Carriles de FX */}
          {activeLanes.map((lane) => (
            <div key={lane.key} className="relative mb-0.5 h-3 rounded bg-muted/10">
              {(data[lane.key] as TimelineMark[]).map((m, i) => (
                <span
                  key={`${m.at}-${i}`}
                  title={`${lane.label} en ${Number(m.at).toFixed(1)}s`}
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                  style={{
                    left: pct(m.at),
                    width: m.duration
                      ? `max(4px, ${(m.duration / duration) * 100}%)`
                      : "4px",
                    background: lane.color,
                    boxShadow: `0 0 4px ${lane.color}88`,
                  }}
                />
              ))}
            </div>
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-[2px] rounded bg-brand-pink shadow-[0_0_8px_rgba(250,60,141,0.9)]"
            style={{ left: pct(currentTime) }}
          />
        </div>

        {/* Labels del gutter (alineados con cada carril) */}
        <div className="pointer-events-none absolute left-0 top-1.5" style={{ width: GUTTER }}>
          <div className="flex h-5 items-center justify-end pr-1.5 mb-1">
            <span className="font-mono-tab text-[8px] leading-none text-muted-foreground">
              Palabras
            </span>
          </div>
          {activeLanes.map((lane) => (
            <div key={lane.key} className="mb-0.5 flex h-3 items-center justify-end pr-1.5">
              <span
                className="truncate font-mono-tab text-[8px] leading-none"
                style={{ color: lane.color }}
              >
                {lane.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
