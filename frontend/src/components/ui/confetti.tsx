"use client";

/**
 * Confetti emoji 100% CSS — sin dependencias. ~40 partículas que caen y rotan.
 * Pensado para pantallas de éxito (wizard step 6). Se monta una sola vez y la
 * animación dura ~3.5s; al terminar, no estorba (pointer-events:none).
 *
 * Uso: <Confetti /> dentro del bloque que se renderiza al éxito.
 */
import { useMemo } from "react";

const EMOJIS = ["🎉", "✨", "🔥", "🚀", "💥", "🎊", "⭐", "💫"];

interface Particle {
  emoji: string;
  left: number;        // %
  delay: number;       // s
  duration: number;    // s
  rotate: number;      // deg final
  size: number;        // px
  swayX: number;       // px (vaivén horizontal)
}

export function Confetti({ count = 40 }: { count?: number }) {
  // Determinista por mount: no re-randomiza en re-render.
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      emoji: EMOJIS[i % EMOJIS.length],
      left: Math.round(Math.random() * 100),
      delay: +(Math.random() * 0.6).toFixed(2),
      duration: +(2.4 + Math.random() * 1.6).toFixed(2),
      rotate: Math.round((Math.random() - 0.5) * 720),
      size: Math.round(20 + Math.random() * 22),
      swayX: Math.round((Math.random() - 0.5) * 120),
    }));
  }, [count]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate3d(var(--sx, 0px), 110vh, 0) rotate(var(--rot, 360deg)); opacity: 0; }
        }
      `}</style>
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            fontSize: p.size,
            ["--sx" as string]: `${p.swayX}px`,
            ["--rot" as string]: `${p.rotate}deg`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            willChange: "transform, opacity",
            userSelect: "none",
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
