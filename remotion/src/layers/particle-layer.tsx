import { AbsoluteFill, random } from "remotion";
import { noise2D } from "@remotion/noise";
import { z } from "zod";

/**
 * F3 — Sistema de PARTÍCULAS procedural (auditoría: "sin confeti/chispas/humo").
 * 100% determinista (remotion `random` + noise2D por seed) — sin assets externos.
 *
 * Tipos:
 *  - confetti  → papelitos de colores que caen con gravedad + rotación + sway.
 *  - sparks    → chispas que explotan radialmente desde el centro-bajo y se apagan.
 *  - embers    → brasas que suben lento con drift orgánico (ambiente cálido).
 *  - emoji_rain→ lluvia del emoji indicado (celebración estilo TikTok).
 *
 * Cada burst aparece en `at` por `duration` seg. Sin bursts → render idéntico.
 */
export const particleBurstSchema = z.object({
  at: z.number(),
  duration: z.number().default(2.2),
  kind: z.enum(["confetti", "sparks", "embers", "emoji_rain"]).default("confetti"),
  count: z.number().default(45),
  // Paleta para confetti/sparks (embers usa naranjas fijos).
  colors: z.array(z.string()).default(["#fbbf24", "#34d399", "#fb7185", "#60a5fa", "#c084fc"]),
  emoji: z.string().default("🎉"),
});
export type ParticleBurst = z.infer<typeof particleBurstSchema>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const DEFAULT_COLORS = ["#fbbf24", "#34d399", "#fb7185", "#60a5fa", "#c084fc"];

export const ParticleLayer: React.FC<{
  burst: ParticleBurst;
  currentTime: number;
  width: number;
  height: number;
}> = ({ burst: rawBurst, currentTime, width, height }) => {
  // Defensivo: los props llegan CRUDOS (zod no aplica defaults en runtime) —
  // un burst {at, kind} de un project viejo no debe tirar el render.
  const burst = {
    at: rawBurst.at ?? 0,
    duration: rawBurst.duration ?? 2.2,
    kind: rawBurst.kind ?? "confetti",
    count: rawBurst.count ?? 45,
    colors: Array.isArray(rawBurst.colors) && rawBurst.colors.length > 0
      ? rawBurst.colors
      : DEFAULT_COLORS,
    emoji: rawBurst.emoji ?? "🎉",
  };
  const elapsed = currentTime - burst.at;
  if (elapsed < 0 || elapsed > burst.duration) return null;
  const life = elapsed / burst.duration; // 0→1
  const fadeOut = clamp01((1 - life) / 0.25); // último 25% se apaga
  const count = Math.min(120, Math.max(6, burst.count));
  const seedBase = `pb-${burst.at}-${burst.kind}`;

  const particles: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const r1 = random(`${seedBase}-a-${i}`);
    const r2 = random(`${seedBase}-b-${i}`);
    const r3 = random(`${seedBase}-c-${i}`);
    const r4 = random(`${seedBase}-d-${i}`);
    const color = burst.colors[i % burst.colors.length];

    if (burst.kind === "confetti" || burst.kind === "emoji_rain") {
      // Caída con gravedad suave + vaivén horizontal por noise.
      const x0 = r1 * width;
      const fall = elapsed * (height * (0.45 + r2 * 0.5)) * 0.55;
      const sway = noise2D(`${seedBase}-sw-${i}`, elapsed * 0.7, i) * 60;
      const y = -40 + fall;
      if (y > height + 60) continue;
      const rot = (r3 - 0.5) * 720 * elapsed + r4 * 360;
      if (burst.kind === "emoji_rain") {
        particles.push(
          <div
            key={i}
            style={{
              position: "absolute",
              left: x0 + sway,
              top: y,
              fontSize: 38 + r2 * 44,
              transform: `rotate(${rot * 0.25}deg)`,
              opacity: fadeOut,
            }}
          >
            {burst.emoji}
          </div>
        );
      } else {
        const w = 10 + r2 * 14;
        particles.push(
          <div
            key={i}
            style={{
              position: "absolute",
              left: x0 + sway,
              top: y,
              width: w,
              height: w * 0.45,
              background: color,
              borderRadius: 2,
              transform: `rotate(${rot}deg) skewX(${(r4 - 0.5) * 30}deg)`,
              opacity: fadeOut * 0.95,
              boxShadow: `0 0 6px ${color}55`,
            }}
          />
        );
      }
    } else if (burst.kind === "sparks") {
      // Explosión radial desde el centro-bajo, desaceleración + gravedad leve.
      const angle = r1 * Math.PI * 2;
      const speed = 0.35 + r2 * 0.65;
      const dist = (1 - Math.pow(1 - clamp01(elapsed / burst.duration), 2)) * speed;
      const cx = width / 2 + Math.cos(angle) * dist * width * 0.55;
      const cy =
        height * 0.62 + Math.sin(angle) * dist * height * 0.4 + elapsed * elapsed * 140;
      if (cy > height + 20) continue;
      const sparkLife = clamp01(1 - life - r3 * 0.3);
      if (sparkLife <= 0) continue;
      const size = 3 + r4 * 5;
      particles.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: cx,
            top: cy,
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            opacity: sparkLife * fadeOut,
            boxShadow: `0 0 ${8 + r2 * 10}px ${color}, 0 0 3px #ffffff`,
          }}
        />
      );
    } else {
      // embers — brasas subiendo con drift orgánico.
      const x0 = r1 * width;
      const rise = elapsed * (60 + r2 * 120);
      const y = height + 20 - rise;
      if (y < -30) continue;
      const drift = noise2D(`${seedBase}-em-${i}`, elapsed * 0.4, i * 3) * 50;
      const emberColor = i % 3 === 0 ? "#fbbf24" : i % 3 === 1 ? "#fb923c" : "#f87171";
      const size = 4 + r3 * 6;
      const twinkle = 0.5 + 0.5 * Math.sin(elapsed * (3 + r4 * 4) + i);
      particles.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: x0 + drift,
            top: y,
            width: size,
            height: size,
            borderRadius: "50%",
            background: emberColor,
            opacity: twinkle * fadeOut * 0.85,
            boxShadow: `0 0 ${10 + r2 * 8}px ${emberColor}`,
          }}
        />
      );
    }
  }

  return <AbsoluteFill style={{ pointerEvents: "none" }}>{particles}</AbsoluteFill>;
};
