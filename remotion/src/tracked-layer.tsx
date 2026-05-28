/**
 * Motion tracking — pega un label (texto + emoji) que SIGUE la cara del sujeto.
 *
 * El path de la cara lo calcula `python/track_subject.py` (OpenCV) sobre el video
 * y lo inyecta auto-build en `trackPath`. Acá interpolamos la posición por tiempo y
 * posicionamos cada item activo arriba de la cabeza.
 *
 * 100% aditivo: ViralVideo solo monta TrackedLayer si trackPath e items traen datos.
 */
import { useVideoConfig } from "remotion";
import { z } from "zod";

export const trackPointSchema = z.object({
  t: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number().default(0.2),
  h: z.number().default(0.2),
});
export type TrackPoint = z.infer<typeof trackPointSchema>;

export const trackedItemSchema = z.object({
  at: z.number(),
  duration: z.number().default(2.5),
  text: z.string().default(""),
  emoji: z.string().default(""),
  color: z.string().default("#fbbf24"),
  /** Offset vertical en fracción de alto (negativo = arriba de la cara). */
  offsetY: z.number().default(-0.06),
});
export type TrackedItem = z.infer<typeof trackedItemSchema>;

/** Interpola el centro de la cara al tiempo `t` (clamp en los extremos). */
function sampleAt(path: TrackPoint[], t: number): { x: number; y: number; h: number } | null {
  if (path.length === 0) return null;
  if (t <= path[0].t) return { x: path[0].x, y: path[0].y, h: path[0].h };
  const last = path[path.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y, h: last.h };
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1];
      const b = path[i];
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f };
    }
  }
  return null;
}

interface TrackedLayerProps {
  trackPath: TrackPoint[];
  items: TrackedItem[];
  currentTime: number;
  fontFamily: string;
}

export const TrackedLayer: React.FC<TrackedLayerProps> = ({
  trackPath,
  items,
  currentTime,
  fontFamily,
}) => {
  const { width, height } = useVideoConfig();
  if (trackPath.length === 0) return null;
  const active = items.filter((it) => currentTime >= it.at && currentTime <= it.at + it.duration);
  if (active.length === 0) return null;
  const pos = sampleAt(trackPath, currentTime);
  if (!pos) return null;

  return (
    <>
      {active.map((it, i) => {
        const elapsed = currentTime - it.at;
        const remaining = it.at + it.duration - currentTime;
        const opacity = Math.max(0, Math.min(1, Math.min(elapsed / 0.15, remaining / 0.15)));
        const left = pos.x * width;
        const top = (pos.y - pos.h * 0.5 + it.offsetY) * height; // arriba de la cabeza
        return (
          <div
            key={`tk-${i}`}
            style={{
              position: "absolute",
              left,
              top,
              transform: "translate(-50%, -100%)",
              opacity,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(0,0,0,0.55)",
              padding: "10px 18px",
              borderRadius: 14,
              border: `3px solid ${it.color}`,
              boxShadow: `0 0 20px ${it.color}66`,
            }}
          >
            {it.emoji && <span style={{ fontSize: 44, lineHeight: 1 }}>{it.emoji}</span>}
            {it.text && (
              <span
                style={{
                  fontFamily,
                  fontSize: 40,
                  fontWeight: 800,
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                {it.text}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
};
