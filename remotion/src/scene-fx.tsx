/**
 * CapCut Pro FX — capas NUEVAS y 100% ADITIVAS.
 *
 * Traen "recetas" de CapCut a Remotion de forma nativa y headless, SIN tocar
 * ninguna capa existente de ViralVideo/cinematic-layers:
 *   - SceneFxLayer        → light leaks / bokeh / glow / dust (overlays screen-blend)
 *   - ProTransitionLayer  → whip / zoom_punch / glitch / flash en los cortes
 *   - KineticSubtitleLayer → presets de tipografía cinética (pop/slide/type/bounce/glow)
 *
 * Todo es procedural (gradientes + remotion `random`/`noise2D`), así que NO depende
 * de assets externos: funciona en cualquier máquina sin descargar nada. Si en el
 * futuro se quieren overlays de video real, se pueden sumar como kind adicional.
 *
 * Opt-in estricto: ViralVideo solo monta estas capas si su array trae datos
 * (sceneFx/proTransitions con length>0) o si kineticPreset !== "none". Con los
 * defaults vacíos, el render sale IDÉNTICO al de hoy.
 */
import {
  AbsoluteFill,
  spring,
  interpolate,
  random,
} from "remotion";
import { noise2D } from "@remotion/noise";
import { z } from "zod";

// ───────────────────────────── Schemas ──────────────────────────────────────

export const sceneFxSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.2),
  kind: z.enum(["light_leak", "bokeh", "glow", "dust"]).default("light_leak"),
  color: z.string().default("#ff8a3d"),
  opacity: z.number().default(0.55),
  intensity: z.number().default(1),
  seed: z.number().default(1),
});
export type SceneFxProps = z.infer<typeof sceneFxSchema>;

export const proTransitionSchema = z.object({
  at: z.number(),
  kind: z
    .enum(["whip", "zoom_punch", "glitch", "flash", "reveal_lr", "reveal_ud"])
    .default("whip"),
  durationFrames: z.number().default(8),
  color: z.string().default("#ffffff"),
});
export type ProTransitionProps = z.infer<typeof proTransitionSchema>;

const KINETIC_PRESETS = [
  "none",
  "pop",
  "slide_up",
  "type_on",
  "bounce",
  "glow_pulse",
] as const;
export const kineticPresetSchema = z.enum(KINETIC_PRESETS).default("none");
export type KineticPreset = (typeof KINETIC_PRESETS)[number];

// ─────────────────────────── helpers ────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Fade-in en el primer `inFrac`, fade-out en el último `outFrac` del clip. */
function envelope(progress: number, inFrac = 0.22, outFrac = 0.28): number {
  const fin = clamp01(progress / inFrac);
  const fout = clamp01((1 - progress) / outFrac);
  return Math.min(fin, fout);
}

// ───────────────────────── SceneFxLayer ─────────────────────────────────────

interface SceneFxLayerProps {
  fx: SceneFxProps[];
  currentTime: number;
}

/**
 * Overlays atmosféricos compuestos con mixBlendMode:"screen" (el negro = transparente),
 * el mismo principio de los efectos de luz/film de CapCut. Solo renderiza los fx
 * activos en el frame actual.
 */
export const SceneFxLayer: React.FC<SceneFxLayerProps> = ({ fx, currentTime }) => {
  const active = fx.filter(
    (f) => currentTime >= f.at - 0.05 && currentTime <= f.at + f.duration
  );
  if (active.length === 0) return null;

  return (
    <>
      {active.map((f, i) => {
        const progress = clamp01((currentTime - f.at) / Math.max(0.001, f.duration));
        const env = envelope(progress);
        const baseOpacity = env * f.opacity;
        if (baseOpacity <= 0.001) return null;

        if (f.kind === "light_leak") {
          // Dos streaks cálidos que barren la pantalla en diagonal.
          const cx = interpolate(progress, [0, 1], [-10, 110]);
          const cx2 = interpolate(progress, [0, 1], [120, 30]);
          return (
            <AbsoluteFill
              key={`sfx-${i}`}
              style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: baseOpacity }}
            >
              <AbsoluteFill
                style={{
                  background: `radial-gradient(ellipse 55% 130% at ${cx}% 28%, ${f.color}, transparent 62%)`,
                }}
              />
              <AbsoluteFill
                style={{
                  background: `radial-gradient(ellipse 40% 110% at ${cx2}% 72%, ${f.color}aa, transparent 60%)`,
                  opacity: 0.7,
                }}
              />
            </AbsoluteFill>
          );
        }

        if (f.kind === "bokeh") {
          const count = Math.round(10 * f.intensity);
          return (
            <AbsoluteFill
              key={`sfx-${i}`}
              style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: baseOpacity }}
            >
              {Array.from({ length: count }).map((_, k) => {
                const rx = random(`bk-x-${f.seed}-${k}`) * 100;
                const ry0 = random(`bk-y-${f.seed}-${k}`) * 100;
                const size = 40 + random(`bk-s-${f.seed}-${k}`) * 140;
                const drift = progress * (10 + random(`bk-d-${f.seed}-${k}`) * 22);
                const ry = (ry0 - drift + 100) % 100;
                const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(currentTime * 2.4 + k));
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: `${rx}%`,
                      top: `${ry}%`,
                      width: size,
                      height: size,
                      borderRadius: "50%",
                      background: `radial-gradient(circle, ${f.color} 0%, ${f.color}55 35%, transparent 70%)`,
                      opacity: twinkle,
                      filter: "blur(2px)",
                    }}
                  />
                );
              })}
            </AbsoluteFill>
          );
        }

        if (f.kind === "glow") {
          const pulse = 0.6 + 0.4 * Math.sin(Math.PI * progress);
          return (
            <AbsoluteFill
              key={`sfx-${i}`}
              style={{
                pointerEvents: "none",
                mixBlendMode: "screen",
                opacity: baseOpacity * pulse,
                background: `radial-gradient(ellipse 90% 70% at 50% 45%, ${f.color}, transparent 70%)`,
              }}
            />
          );
        }

        // dust — partículas finas con ruido orgánico (noise2D) flotando.
        const count = Math.round(34 * f.intensity);
        return (
          <AbsoluteFill
            key={`sfx-${i}`}
            style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: baseOpacity }}
          >
            {Array.from({ length: count }).map((_, k) => {
              const baseX = random(`d-x-${f.seed}-${k}`) * 100;
              const baseY = random(`d-y-${f.seed}-${k}`) * 100;
              const nx = noise2D(`d-nx-${f.seed}`, k, currentTime * 0.5) * 4;
              const ny = noise2D(`d-ny-${f.seed}`, k, currentTime * 0.5) * 4;
              const drift = (progress * 8) % 100;
              const size = 2 + random(`d-s-${f.seed}-${k}`) * 4;
              const tw = 0.2 + 0.8 * Math.abs(Math.sin(currentTime * 3 + k));
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: `${(baseX + nx + 100) % 100}%`,
                    top: `${(baseY + ny - drift + 100) % 100}%`,
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: f.color,
                    opacity: tw,
                  }}
                />
              );
            })}
          </AbsoluteFill>
        );
      })}
    </>
  );
};

// ──────────────────────── ProTransitionLayer ────────────────────────────────

interface ProTransitionLayerProps {
  transitions: ProTransitionProps[];
  currentTime: number;
  fps: number;
}

/**
 * Transiciones estilo CapCut en los puntos de corte. Son overlays cortos
 * (6-12 frames) — no transforman el video base, así que no pisan la cámara/zoom
 * existentes. Pensadas para sincronizarse con un whoosh vía sfxMarks.
 */
export const ProTransitionLayer: React.FC<ProTransitionLayerProps> = ({
  transitions,
  currentTime,
  fps,
}) => {
  return (
    <>
      {transitions.map((tr, i) => {
        const dur = Math.max(2, tr.durationFrames);
        const elapsedFrames = (currentTime - tr.at) * fps;
        if (elapsedFrames < 0 || elapsedFrames > dur) return null;
        const t = clamp01(elapsedFrames / dur);

        if (tr.kind === "whip") {
          const slide = interpolate(t, [0, 1], [-120, 120]);
          return (
            <AbsoluteFill
              key={`tr-${i}`}
              style={{
                pointerEvents: "none",
                mixBlendMode: "screen",
                opacity: Math.sin(Math.PI * t) * 0.9,
                transform: `translateX(${slide}%)`,
                background: `linear-gradient(90deg, transparent 0%, ${tr.color} 50%, transparent 100%)`,
                filter: "blur(48px)",
              }}
            />
          );
        }

        if (tr.kind === "zoom_punch") {
          const r = interpolate(t, [0, 1], [0, 150]);
          return (
            <AbsoluteFill
              key={`tr-${i}`}
              style={{
                pointerEvents: "none",
                mixBlendMode: "screen",
                opacity: (1 - t) * 0.85,
                background: `radial-gradient(circle at 50% 50%, ${tr.color} 0%, transparent ${r}%)`,
              }}
            />
          );
        }

        if (tr.kind === "glitch") {
          // Bandas RGB horizontales que saltan — look datamosh, visible y aditivo.
          const mag = (1 - t) * 30;
          return (
            <AbsoluteFill key={`tr-${i}`} style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
              {Array.from({ length: 5 }).map((_, k) => {
                const y = random(`g-y-${tr.at}-${k}`) * 90;
                const h = 4 + random(`g-h-${tr.at}-${k}`) * 16;
                const dir = k % 2 === 0 ? 1 : -1;
                const colors = ["#ff0040", "#00ffe0", "#fffb00"];
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${y}%`,
                      height: `${h}%`,
                      transform: `translateX(${dir * mag}px)`,
                      background: colors[k % colors.length],
                      opacity: 0.5 * (1 - t),
                      filter: "blur(1px)",
                    }}
                  />
                );
              })}
            </AbsoluteFill>
          );
        }

        if (tr.kind === "reveal_lr") {
          // Wipe horizontal: panel de color que barre y "revela" (clip-path inset).
          const cut = interpolate(t, [0, 1], [0, 100]);
          return (
            <AbsoluteFill
              key={`tr-${i}`}
              style={{
                pointerEvents: "none",
                background: tr.color,
                clipPath: `inset(0 0 0 ${cut}%)`,
              }}
            />
          );
        }

        if (tr.kind === "reveal_ud") {
          const cut = interpolate(t, [0, 1], [0, 100]);
          return (
            <AbsoluteFill
              key={`tr-${i}`}
              style={{
                pointerEvents: "none",
                background: tr.color,
                clipPath: `inset(${cut}% 0 0 0)`,
              }}
            />
          );
        }

        // flash — destello blanco con decay rápido.
        return (
          <AbsoluteFill
            key={`tr-${i}`}
            style={{ pointerEvents: "none", background: tr.color, opacity: (1 - t) * 0.95 }}
          />
        );
      })}
    </>
  );
};

// ─────────────────────── KineticSubtitleLayer ───────────────────────────────

interface KineticSubtitleLayerProps {
  words: { word: string; start: number; end: number }[];
  currentTime: number;
  fps: number;
  preset: KineticPreset;
  fontFamily: string;
  color: string;
  highlight: string;
}

/**
 * Tipografía cinética estilo CapCut. Misma lógica de selección de palabra que
 * SubtitleLayer (palabra activa visible hasta que arranca la siguiente), pero con
 * presets de entrada animada. ViralVideo monta ESTA capa en lugar de SubtitleLayer
 * solo cuando preset !== "none" (ver ViralVideo.tsx); con "none" usa la original.
 */
export const KineticSubtitleLayer: React.FC<KineticSubtitleLayerProps> = ({
  words,
  currentTime,
  fps,
  preset,
  fontFamily,
  color,
  highlight,
}) => {
  let activeIndex = -1;
  for (let idx = 0; idx < words.length; idx++) {
    if (words[idx].start <= currentTime + 0.05) activeIndex = idx;
    else break;
  }
  if (activeIndex === -1) return null;

  const word = words[activeIndex];
  const next = words[activeIndex + 1];
  const startsAt = word.start;
  const endsAt = next ? next.start - 0.04 : word.end + 1.5;
  if (currentTime > endsAt + 0.1) return null;

  const elapsed = currentTime - startsAt;
  const remaining = endsAt - currentTime;
  const fadeIn = clamp01(elapsed / 0.08);
  const fadeOut = clamp01(remaining / 0.06);
  let opacity = Math.min(fadeIn, fadeOut);

  const entryFrame = elapsed * fps;
  const s = spring({ frame: entryFrame, fps, config: { damping: 12, stiffness: 130, mass: 0.6 } });

  let transform = "scale(1)";
  let filter: string | undefined = `drop-shadow(0 4px 22px rgba(0,0,0,0.95))`;
  let text = word.word;

  switch (preset) {
    case "pop": {
      const sc = interpolate(s, [0, 1], [0.4, 1]);
      transform = `scale(${sc})`;
      filter = `drop-shadow(0 0 26px ${highlight}) drop-shadow(0 4px 18px rgba(0,0,0,0.95))`;
      break;
    }
    case "slide_up": {
      const ty = (1 - s) * 80;
      transform = `translateY(${ty}px)`;
      break;
    }
    case "type_on": {
      const shown = Math.max(1, Math.round(clamp01(elapsed / 0.28) * word.word.length));
      text = word.word.slice(0, shown);
      break;
    }
    case "bounce": {
      const ty = (1 - s) * 70;
      const rot = (1 - s) * -8;
      transform = `translateY(${ty}px) rotate(${rot}deg)`;
      filter = `drop-shadow(0 0 22px ${highlight}) drop-shadow(0 6px 20px rgba(0,0,0,0.95))`;
      break;
    }
    case "glow_pulse": {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 8);
      const sc = interpolate(s, [0, 1], [0.85, 1]);
      transform = `scale(${sc})`;
      filter = `drop-shadow(0 0 ${20 + pulse * 30}px ${highlight}) drop-shadow(0 4px 18px rgba(0,0,0,0.95))`;
      break;
    }
    default:
      break;
  }

  // En type_on el cursor aún no terminó → mantener opacidad alta durante el typing.
  if (preset === "type_on") opacity = Math.min(1, Math.max(opacity, fadeOut));

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 320,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 112,
          fontWeight: 800,
          color: highlight || color,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          lineHeight: 1.0,
          textAlign: "center",
          maxWidth: 980,
          padding: "0 50px",
          whiteSpace: "nowrap",
          opacity,
          transform,
          transformOrigin: "center center",
          filter,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
