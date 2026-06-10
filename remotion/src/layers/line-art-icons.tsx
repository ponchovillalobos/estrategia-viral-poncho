import React from "react";
import * as Lucide from "lucide-react";

/**
 * EDITORIAL — Ilustraciones LINE-ART animadas (trazo crema + acentos del color
 * elegido, con glow, estilo "grabado a mano"). Dos fases por ícono:
 *   1. DRAW-ON: el contorno se dibuja solo (strokeDashoffset 0→fin en ~1.2s).
 *   2. LOOP: vida infinita sutil (manecillas, partículas, pulsos, engranajes…).
 * 100% SVG procedural — cero assets. 18 ilustraciones.
 */
export type LineArtKind =
  | "clock" | "calendar" | "funnel" | "faucet" | "radar" | "chart"
  | "lightbulb" | "target" | "rocket" | "brain" | "lock" | "megaphone"
  | "scale" | "gears" | "trophy" | "route" | "fire" | "hourglass";

export const LINE_ART_KINDS: LineArtKind[] = [
  "clock", "calendar", "funnel", "faucet", "radar", "chart",
  "lightbulb", "target", "rocket", "brain", "lock", "megaphone",
  "scale", "gears", "trophy", "route", "fire", "hourglass",
];

const STROKE = "#e9e2d4"; // crema

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** kebab/lower → PascalCase de lucide ("trending-up" → "TrendingUp"). */
function toPascal(name: string): string {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

/**
 * LINE-ART GENÉRICO sobre los 1,500+ íconos de Lucide: cualquier ícono se vuelve
 * una ilustración editorial — trazo crema, draw-on aproximado (dash/offset por
 * CSS sobre todos los paths), flotación sutil y nodo de acento dorado latiendo.
 * Así el generador puede pedir CUALQUIER concepto sin dibujarlo a mano.
 */
export const LineArtLucide: React.FC<{
  name: string;
  elapsed: number;
  size?: number;
  gold?: string;
}> = ({ name, elapsed, size = 300, gold = "#f0b429" }) => {
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<{
    size?: number; color?: string; strokeWidth?: number; absoluteStrokeWidth?: boolean;
  }>>)[toPascal(name)];
  if (!Cmp) return null;
  const p = clamp01(elapsed / 1.2);
  const ease = 1 - Math.pow(1 - p, 3);
  // dasharray 130 cubre los paths de un viewBox 24x24; offset uniforme aproximado.
  const off = 130 * (1 - ease);
  const float = Math.sin(elapsed * 1.6) * (size * 0.012);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.6);
  const cls = `la-luc-${Math.abs(name.length * 7 + name.charCodeAt(0))}`;
  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `translateY(${float}px)`,
        filter: `drop-shadow(0 0 14px ${gold}55) drop-shadow(0 0 3px ${gold}33)`,
        position: "relative",
      }}
      className={cls}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `.${cls} svg * { stroke-dasharray: 130; stroke-dashoffset: ${off.toFixed(2)}; }`,
        }}
      />
      <Cmp size={size} color={STROKE} strokeWidth={1.4} />
      {/* nodo de acento que late (vida infinita, como los dibujados a mano) */}
      <div
        style={{
          position: "absolute",
          right: size * 0.1,
          top: size * 0.1,
          width: size * 0.07,
          height: size * 0.07,
          borderRadius: "50%",
          background: gold,
          opacity: clamp01((elapsed - 1.2) / 0.4) * (0.5 + pulse * 0.5),
          boxShadow: `0 0 ${size * 0.06}px ${gold}`,
        }}
      />
    </div>
  );
};

function drawProps(len: number, elapsed: number, delay = 0, drawIn = 1.1) {
  const p = clamp01((elapsed - delay) / drawIn);
  return { strokeDasharray: len, strokeDashoffset: len * (1 - p), opacity: p > 0 ? 1 : 0 };
}

export const LineArtIcon: React.FC<{
  kind: LineArtKind;
  elapsed: number;
  size?: number;
  /** Color de acento (default dorado clásico). */
  gold?: string;
}> = ({ kind, elapsed, size = 300, gold = "#f0b429" }) => {
  const GOLD = gold;
  const common: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 200 200",
    fill: "none",
    style: { filter: `drop-shadow(0 0 14px ${GOLD}55) drop-shadow(0 0 3px ${GOLD}33)` },
  };
  const base = { stroke: STROKE, strokeWidth: 2, strokeLinecap: "round" as const };
  const goldS = { stroke: GOLD, strokeWidth: 2.4, strokeLinecap: "round" as const };
  const appear = (d: number) => clamp01((elapsed - d) / 0.4);

  switch (kind) {
    case "clock": {
      const minDeg = (elapsed * 60) % 360;
      const hrDeg = (elapsed * 8) % 360;
      return (
        <svg {...common}>
          <circle cx="100" cy="108" r="58" {...base} {...drawProps(365, elapsed)} />
          <circle cx="100" cy="108" r="48" {...base} strokeWidth={1.4} {...drawProps(302, elapsed, 0.25)} />
          <path d="M92 46 q8 -14 16 0 M96 46 v-8 M104 46 v-8" {...base} {...drawProps(60, elapsed, 0.5)} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            return (
              <line key={i} x1={100 + Math.sin(a) * 42} y1={108 - Math.cos(a) * 42}
                x2={100 + Math.sin(a) * 46} y2={108 - Math.cos(a) * 46}
                {...base} strokeWidth={1.4} {...drawProps(6, elapsed, 0.7 + i * 0.04, 0.3)} />
            );
          })}
          <g opacity={appear(1.0)}>
            <line x1="100" y1="108" x2="100" y2="76" {...goldS} transform={`rotate(${hrDeg} 100 108)`} />
            <line x1="100" y1="108" x2="100" y2="68" {...goldS} strokeWidth={1.8} transform={`rotate(${minDeg} 100 108)`} />
            <circle cx="100" cy="108" r="3" fill={GOLD} />
          </g>
        </svg>
      );
    }
    case "calendar": {
      const pulse = 0.55 + 0.45 * Math.sin(elapsed * 2.4);
      return (
        <svg {...common}>
          <rect x="40" y="48" width="120" height="110" rx="4" {...base} {...drawProps(460, elapsed)} />
          <line x1="40" y1="64" x2="160" y2="64" {...base} strokeWidth={1.4} {...drawProps(120, elapsed, 0.3)} />
          {Array.from({ length: 5 }).map((_, r) =>
            Array.from({ length: 7 }).map((__, c) => {
              const hl = r === 2;
              return (
                <rect key={`${r}-${c}`} x={46 + c * 16} y={70 + r * 17} width={12} height={13} rx={1.5}
                  stroke={hl ? GOLD : STROKE} strokeWidth={hl ? 1.8 : 1}
                  opacity={hl ? pulse : clamp01((elapsed - 0.5 - (r * 7 + c) * 0.02) / 0.3) * 0.8}
                  fill={hl ? `${GOLD}22` : "none"} />
              );
            })
          )}
          <path d="M38 100 q-8 6 0 12 q-8 6 0 12" {...goldS} fill="none" opacity={pulse} />
          <path d="M162 100 q8 6 0 12 q8 6 0 12" {...goldS} fill="none" opacity={pulse} />
        </svg>
      );
    }
    case "funnel":
      return (
        <svg {...common}>
          <path d="M50 50 L150 50 L110 110 L110 140 L90 140 L90 110 Z" {...base} {...drawProps(420, elapsed)} />
          {Array.from({ length: 26 }).map((_, i) => {
            const seed = (i * 9301 + 49297) % 233280;
            const rx = (seed / 233280) * 88 + 56;
            const ry = (((seed * 7) % 100) / 100) * 16 + 56 + Math.sin(elapsed * 2 + i) * 2;
            return <circle key={i} cx={rx} cy={ry} r={1.8} fill={STROKE} opacity={clamp01((elapsed - 0.8 - i * 0.03) / 0.3) * 0.85} />;
          })}
          {Array.from({ length: 3 }).map((_, i) => {
            const t = (elapsed * 0.9 + i * 0.33) % 1;
            return <circle key={`d-${i}`} cx={100} cy={148 + t * 38} r={2.6} fill={GOLD} opacity={appear(1.2) * (1 - t)} />;
          })}
        </svg>
      );
    case "faucet":
      return (
        <svg {...common}>
          <path d="M70 48 h36 q14 0 14 14 v10" {...base} {...drawProps(120, elapsed)} />
          <path d="M64 42 h12 M70 36 v12" {...base} {...drawProps(40, elapsed, 0.3)} />
          <path d="M112 72 h16 v10 h-16 z" {...base} {...drawProps(60, elapsed, 0.45)} />
          <path d="M76 130 L84 168 L124 168 L132 130" {...base} {...drawProps(160, elapsed, 0.6)} />
          <ellipse cx="104" cy="130" rx="28" ry="6" {...base} {...drawProps(110, elapsed, 0.75)} />
          {Array.from({ length: 7 }).map((_, i) => {
            const t = (elapsed * 1.1 + i * 0.14) % 1;
            return <circle key={i} cx={120 + Math.sin(i * 2.4) * 5} cy={86 + t * 42} r={2.4} fill={GOLD} opacity={appear(1.0) * (0.95 - t * 0.4)} />;
          })}
          {Array.from({ length: 12 }).map((_, i) => (
            <circle key={`p-${i}`} cx={88 + (i % 5) * 8} cy={146 - Math.floor(i / 5) * 6 + Math.sin(elapsed * 3 + i) * 0.8}
              r={2.6} fill={GOLD} opacity={clamp01((elapsed - 1.3 - i * 0.05) / 0.3) * 0.9} />
          ))}
        </svg>
      );
    case "radar": {
      const pulseT = (elapsed * 0.7) % 1;
      return (
        <svg {...common}>
          {[28, 44, 60, 76].map((r, i) => (
            <circle key={r} cx="100" cy="100" r={r} {...base} strokeWidth={1.2} {...drawProps(2 * Math.PI * r, elapsed, i * 0.18)} />
          ))}
          <path d="M100 112 l-8 14 h16 z M100 112 v-22 M92 94 l8 -8 8 8" {...goldS} {...drawProps(110, elapsed, 0.7)} />
          <circle cx="100" cy="100" r={20 + pulseT * 60} stroke={GOLD} strokeWidth={1.6} opacity={(1 - pulseT) * 0.7 * appear(1.2)} fill="none" />
          {[{ a: 0.6, r: 60 }, { a: 2.4, r: 76 }, { a: 4.0, r: 44 }, { a: 5.2, r: 76 }].map((d, i) => {
            const ang = d.a + elapsed * 0.15;
            return <rect key={i} x={100 + Math.cos(ang) * d.r - 5} y={100 + Math.sin(ang) * d.r - 3.5} width={10} height={7} rx={1.5} {...base} strokeWidth={1.4} opacity={appear(1.0 + i * 0.1)} />;
          })}
        </svg>
      );
    }
    case "lightbulb": {
      const glow = 0.5 + 0.5 * Math.sin(elapsed * 2.6);
      return (
        <svg {...common}>
          <path d="M100 44 a36 36 0 0 1 18 67 q-4 3 -4 9 v6 h-28 v-6 q0 -6 -4 -9 a36 36 0 0 1 18 -67 z" {...base} {...drawProps(280, elapsed)} />
          <path d="M90 134 h20 M92 142 h16 M96 150 h8" {...base} strokeWidth={1.6} {...drawProps(60, elapsed, 0.5)} />
          <path d="M93 104 q7 -10 14 0 M100 109 v12" {...goldS} {...drawProps(50, elapsed, 0.8)} />
          {/* rayos que laten */}
          {Array.from({ length: 7 }).map((_, i) => {
            const a = ((i * 30 - 90) * Math.PI) / 180;
            return (
              <line key={i} x1={100 + Math.cos(a) * 48} y1={80 + Math.sin(a) * 48}
                x2={100 + Math.cos(a) * (58 + glow * 6)} y2={80 + Math.sin(a) * (58 + glow * 6)}
                {...goldS} strokeWidth={2} opacity={appear(1.2) * glow} />
            );
          })}
        </svg>
      );
    }
    case "target": {
      const hit = clamp01((elapsed - 1.3) / 0.25);
      const ringT = (elapsed * 0.8) % 1;
      return (
        <svg {...common}>
          {[58, 42, 26].map((r, i) => (
            <circle key={r} cx="100" cy="104" r={r} {...base} {...drawProps(2 * Math.PI * r, elapsed, i * 0.2)} />
          ))}
          <circle cx="100" cy="104" r="9" stroke={GOLD} strokeWidth={2} fill={`${GOLD}33`} opacity={appear(0.8)} />
          {/* flecha que llega */}
          <g opacity={appear(1.1)} transform={`translate(${(1 - hit) * 70} ${-(1 - hit) * 70})`}>
            <line x1="104" y1="100" x2="138" y2="66" {...goldS} />
            <path d="M138 66 l10 -2 -4 -8 z M134 78 l8 -8 M126 74 l8 -8" {...goldS} strokeWidth={1.8} />
          </g>
          <circle cx="100" cy="104" r={12 + ringT * 40} stroke={GOLD} strokeWidth={1.4} fill="none" opacity={hit * (1 - ringT) * 0.6} />
        </svg>
      );
    }
    case "rocket": {
      const wob = Math.sin(elapsed * 6) * 1.5;
      return (
        <svg {...common}>
          <g transform={`translate(0 ${wob})`}>
            <path d="M100 38 q22 26 12 70 l-24 0 q-10 -44 12 -70 z" {...base} {...drawProps(220, elapsed)} />
            <circle cx="100" cy="78" r="9" {...base} strokeWidth={1.6} {...drawProps(57, elapsed, 0.4)} />
            <path d="M88 96 q-16 8 -14 26 q10 -8 16 -8 M112 96 q16 8 14 26 q-10 -8 -16 -8" {...base} {...drawProps(120, elapsed, 0.6)} />
          </g>
          {/* llama que parpadea */}
          <path d={`M94 ${112 + wob} q6 ${14 + Math.sin(elapsed * 9) * 5} 6 ${20 + Math.sin(elapsed * 7) * 6} q6 -${8 + Math.sin(elapsed * 8) * 4} 6 -${20 + Math.sin(elapsed * 9) * 5}`}
            {...goldS} fill="none" opacity={appear(1.0) * (0.7 + 0.3 * Math.sin(elapsed * 11))} />
          {/* líneas de velocidad */}
          {[64, 136].map((x, i) => (
            <line key={x} x1={x} y1={120 + ((elapsed * 60 + i * 25) % 40)} x2={x} y2={132 + ((elapsed * 60 + i * 25) % 40)} {...base} strokeWidth={1.4} opacity={appear(1.2) * 0.6} />
          ))}
        </svg>
      );
    }
    case "brain": {
      const pulse = 0.6 + 0.4 * Math.sin(elapsed * 2.2);
      return (
        <svg {...common}>
          <path d="M96 52 q-26 -6 -30 18 q-18 6 -10 26 q-12 14 4 26 q0 20 22 18 q6 12 18 6 l0 -92 q-2 -2 -4 -2 z" {...base} {...drawProps(330, elapsed)} />
          <path d="M104 52 q26 -6 30 18 q18 6 10 26 q12 14 -4 26 q0 20 -22 18 q-6 12 -18 6 l0 -92 q2 -2 4 -2 z" {...base} {...drawProps(330, elapsed, 0.2)} />
          <line x1="100" y1="54" x2="100" y2="146" {...base} strokeWidth={1.4} {...drawProps(92, elapsed, 0.5)} />
          {/* sinapsis doradas que laten */}
          {[[82, 80], [78, 108], [88, 128], [118, 80], [122, 108], [112, 128]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.4 + pulse * 1.2} fill={GOLD} opacity={appear(1.0 + i * 0.08) * (0.5 + 0.5 * Math.sin(elapsed * 3 + i * 1.3))} />
          ))}
        </svg>
      );
    }
    case "lock": {
      const closeP = clamp01((elapsed - 1.2) / 0.3);
      return (
        <svg {...common}>
          <rect x="64" y="92" width="72" height="64" rx="6" {...base} {...drawProps(272, elapsed)} />
          {/* arco del candado: baja y se cierra */}
          <path d="M76 92 v-14 a24 24 0 0 1 48 0 v14" {...base} {...drawProps(110, elapsed, 0.4)}
            transform={`translate(0 ${-(1 - closeP) * 10})`} />
          <circle cx="100" cy="118" r="8" {...goldS} fill="none" opacity={appear(1.0)} />
          <line x1="100" y1="124" x2="100" y2="138" {...goldS} opacity={appear(1.1)} />
          {/* destello al cerrar */}
          <circle cx="100" cy="118" r={10 + ((elapsed * 0.9) % 1) * 26} stroke={GOLD} strokeWidth={1.2} fill="none" opacity={closeP * (1 - ((elapsed * 0.9) % 1)) * 0.5} />
        </svg>
      );
    }
    case "megaphone": {
      return (
        <svg {...common}>
          <path d="M56 92 v24 l14 0 36 22 v-68 l-36 22 z" {...base} {...drawProps(250, elapsed)} />
          <path d="M62 116 l6 26 h14 l-6 -26" {...base} {...drawProps(80, elapsed, 0.4)} />
          {/* ondas de sonido doradas en loop */}
          {[0, 1, 2].map((i) => {
            const t = (elapsed * 0.8 + i * 0.33) % 1;
            return <path key={i} d={`M${116 + t * 26} ${100 - 14 - t * 10} a ${18 + t * 22} ${18 + t * 22} 0 0 1 0 ${28 + t * 20}`} stroke={GOLD} strokeWidth={2} fill="none" opacity={appear(0.9) * (1 - t)} />;
          })}
        </svg>
      );
    }
    case "scale": {
      const tilt = Math.sin(elapsed * 1.4) * 5;
      return (
        <svg {...common}>
          <line x1="100" y1="52" x2="100" y2="150" {...base} {...drawProps(98, elapsed)} />
          <path d="M76 150 h48" {...base} {...drawProps(48, elapsed, 0.3)} />
          <g transform={`rotate(${tilt} 100 64)`} opacity={appear(0.6)}>
            <line x1="56" y1="64" x2="144" y2="64" {...base} />
            <path d="M56 64 l-12 26 h24 z" {...base} strokeWidth={1.6} />
            <path d="M144 64 l-12 26 h24 z" {...base} strokeWidth={1.6} />
            <circle cx="56" cy="64" r="2.4" fill={GOLD} />
            <circle cx="144" cy="64" r="2.4" fill={GOLD} />
          </g>
          <circle cx="100" cy="56" r="4" stroke={GOLD} strokeWidth={2} fill="none" opacity={appear(0.8)} />
        </svg>
      );
    }
    case "gears": {
      const rot = elapsed * 40;
      const tooth = (cx: number, cy: number, r: number, n: number, deg: number, golden: boolean) => (
        <g transform={`rotate(${deg} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} stroke={golden ? GOLD : STROKE} strokeWidth={2} fill="none" />
          {Array.from({ length: n }).map((_, i) => {
            const a = (i * (360 / n) * Math.PI) / 180;
            return <line key={i} x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r} x2={cx + Math.cos(a) * (r + 8)} y2={cy + Math.sin(a) * (r + 8)} stroke={golden ? GOLD : STROKE} strokeWidth={2.4} strokeLinecap="round" />;
          })}
          <circle cx={cx} cy={cy} r={r * 0.35} stroke={golden ? GOLD : STROKE} strokeWidth={1.6} fill="none" />
        </g>
      );
      return (
        <svg {...common}>
          <g opacity={appear(0.2)}>{tooth(82, 92, 28, 8, rot, false)}</g>
          <g opacity={appear(0.5)}>{tooth(130, 124, 18, 6, -rot * 1.5 + 14, true)}</g>
        </svg>
      );
    }
    case "trophy": {
      const shine = (elapsed * 0.6) % 1;
      return (
        <svg {...common}>
          <path d="M72 54 h56 v28 a28 28 0 0 1 -56 0 z" {...base} {...drawProps(190, elapsed)} />
          <path d="M72 60 h-14 a16 16 0 0 0 16 22 M128 60 h14 a16 16 0 0 1 -16 22" {...base} {...drawProps(110, elapsed, 0.3)} />
          <path d="M94 110 v14 h12 v-14 M82 138 h36 v8 h-36 z" {...base} {...drawProps(130, elapsed, 0.55)} />
          <path d="M92 66 l5 12 -10 0 z" fill={GOLD} opacity={appear(1.0)} transform={`translate(${shine * 26} 0)`} />
          <line x1={78 + shine * 40} y1="58" x2={86 + shine * 40} y2="84" stroke={GOLD} strokeWidth={3} opacity={(1 - shine) * 0.5 * appear(1.0)} />
        </svg>
      );
    }
    case "route": {
      const pinDrop = clamp01((elapsed - 1.5) / 0.35);
      const bounce = Math.sin(Math.min(1, pinDrop) * Math.PI) * 6;
      return (
        <svg {...common}>
          {/* ruta punteada: los guiones "marchan" en loop (dashoffset animado). */}
          <path
            d="M52 150 q30 -24 12 -44 q-16 -22 16 -34 q34 -10 30 -34"
            {...base}
            strokeWidth={2}
            strokeDasharray="7 7"
            strokeDashoffset={-elapsed * 14}
            opacity={clamp01(elapsed / 0.8)}
          />
          <circle cx="52" cy="150" r="6" {...goldS} fill={`${GOLD}33`} opacity={appear(0.3)} />
          {/* pin que cae y rebota */}
          <g opacity={appear(1.4)} transform={`translate(0 ${-(1 - pinDrop) * 40 - bounce})`}>
            <path d="M110 22 a16 16 0 0 1 16 16 q0 12 -16 28 q-16 -16 -16 -28 a16 16 0 0 1 16 -16 z" {...goldS} fill={`${GOLD}22`} />
            <circle cx="110" cy="38" r="5" {...goldS} fill="none" />
          </g>
        </svg>
      );
    }
    case "fire": {
      const f = (i: number) => Math.sin(elapsed * (7 + i * 2) + i * 2) * 4;
      return (
        <svg {...common}>
          <path d={`M100 ${44 + f(0)} q-34 36 -22 66 a34 34 0 0 0 44 0 q12 -30 -22 -66 z`} {...base} {...drawProps(240, elapsed)} />
          <path d={`M100 ${86 + f(1)} q-14 18 -8 30 a12 12 0 0 0 16 0 q6 -12 -8 -30 z`} {...goldS} fill={`${GOLD}22`} opacity={appear(0.8) * (0.75 + 0.25 * Math.sin(elapsed * 9))} />
          {Array.from({ length: 4 }).map((_, i) => {
            const t = (elapsed * 0.8 + i * 0.25) % 1;
            return <circle key={i} cx={88 + i * 9 + Math.sin(elapsed * 4 + i) * 3} cy={70 - t * 32} r={1.8} fill={GOLD} opacity={(1 - t) * 0.8 * appear(1.0)} />;
          })}
        </svg>
      );
    }
    case "hourglass": {
      const sandT = (elapsed * 0.5) % 1;
      return (
        <svg {...common}>
          <path d="M68 48 h64 M68 152 h64 M74 48 q0 34 26 52 q26 18 26 52 M126 48 q0 34 -26 52 q-26 18 -26 52" {...base} {...drawProps(330, elapsed)} />
          {/* arena cayendo */}
          {[0, 1, 2].map((i) => {
            const t = (elapsed * 1.4 + i * 0.33) % 1;
            return <circle key={i} cx={100} cy={100 + t * 38} r={1.6} fill={GOLD} opacity={appear(0.9) * (1 - t * 0.5)} />;
          })}
          {/* montículo de abajo crece */}
          <path d={`M${90 - sandT * 6} 148 q${10 + sandT * 6} -${8 + sandT * 8} ${20 + sandT * 12} 0 z`} fill={GOLD} opacity={appear(1.0) * 0.85} />
          <path d="M88 64 q12 10 24 0" stroke={GOLD} strokeWidth={2} fill="none" opacity={appear(0.8) * 0.8} />
        </svg>
      );
    }
    default: {
      // chart — línea que sube + punto dorado latiendo.
      const pulse = 0.6 + 0.4 * Math.sin(elapsed * 3);
      return (
        <svg {...common}>
          <path d="M44 156 v-104 M44 156 h116" {...base} {...drawProps(230, elapsed)} />
          <path d="M52 140 L78 118 L100 128 L126 88 L150 64" {...goldS} strokeWidth={2.6} fill="none" {...drawProps(150, elapsed, 0.5, 1.4)} />
          <circle cx="150" cy="64" r={4 * pulse + 2} fill={GOLD} opacity={appear(1.9)} />
          {[52, 78, 100, 126].map((x, i) => (
            <circle key={x} cx={x} cy={[140, 118, 128, 88][i]} r={2.2} fill={STROKE} opacity={clamp01((elapsed - 0.7 - i * 0.25) / 0.3)} />
          ))}
        </svg>
      );
    }
  }
};
