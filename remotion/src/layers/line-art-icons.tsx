import React from "react";

/**
 * EDITORIAL — Ilustraciones LINE-ART animadas (trazo crema + acentos dorados con
 * glow, estilo "grabado a mano"). Dos fases por ícono:
 *   1. DRAW-ON: el contorno se dibuja solo (strokeDashoffset 0→fin en ~1.2s).
 *   2. LOOP: vida infinita sutil (manecillas que giran, partículas cayendo por el
 *      embudo, monedas del grifo, pulso del radar, semana del calendario latiendo).
 * 100% SVG procedural — cero assets.
 */
export type LineArtKind = "clock" | "calendar" | "funnel" | "faucet" | "radar" | "chart";

const STROKE = "#e9e2d4"; // crema
const GOLD = "#f0b429"; // dorado

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Trazo que se dibuja solo: dashoffset va de `len` a 0 durante `drawIn` seg. */
function drawProps(len: number, elapsed: number, delay = 0, drawIn = 1.1) {
  const p = clamp01((elapsed - delay) / drawIn);
  return {
    strokeDasharray: len,
    strokeDashoffset: len * (1 - p),
    opacity: p > 0 ? 1 : 0,
  };
}

export const LineArtIcon: React.FC<{
  kind: LineArtKind;
  elapsed: number; // segundos desde que apareció la tarjeta
  size?: number;
}> = ({ kind, elapsed, size = 300 }) => {
  const common: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 200 200",
    fill: "none",
    style: {
      filter: `drop-shadow(0 0 14px ${GOLD}55) drop-shadow(0 0 3px ${GOLD}33)`,
    },
  };
  const base = { stroke: STROKE, strokeWidth: 2, strokeLinecap: "round" as const };
  const gold = { stroke: GOLD, strokeWidth: 2.4, strokeLinecap: "round" as const };

  if (kind === "clock") {
    // Reloj de bolsillo: aro doble + corona; manecillas GIRAN en loop.
    const minDeg = (elapsed * 60) % 360; // minutero rápido (estético)
    const hrDeg = (elapsed * 8) % 360;
    return (
      <svg {...common}>
        <circle cx="100" cy="108" r="58" {...base} {...drawProps(365, elapsed, 0)} />
        <circle cx="100" cy="108" r="48" {...base} strokeWidth={1.4} {...drawProps(302, elapsed, 0.25)} />
        {/* corona */}
        <path d="M92 46 q8 -14 16 0 M96 46 v-8 M104 46 v-8" {...base} {...drawProps(60, elapsed, 0.5)} />
        {/* marcas */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={100 + Math.sin(a) * 42}
              y1={108 - Math.cos(a) * 42}
              x2={100 + Math.sin(a) * 46}
              y2={108 - Math.cos(a) * 46}
              {...base}
              strokeWidth={1.4}
              {...drawProps(6, elapsed, 0.7 + i * 0.04, 0.3)}
            />
          );
        })}
        {/* manecillas doradas girando */}
        <g opacity={clamp01((elapsed - 1.0) / 0.4)}>
          <line x1="100" y1="108" x2="100" y2="76" {...gold} transform={`rotate(${hrDeg} 100 108)`} />
          <line x1="100" y1="108" x2="100" y2="68" {...gold} strokeWidth={1.8} transform={`rotate(${minDeg} 100 108)`} />
          <circle cx="100" cy="108" r="3" fill={GOLD} />
        </g>
        {/* arcos de "vibración" */}
        <path d="M30 80 a75 75 0 0 1 10 -22" {...base} strokeWidth={1.2} opacity={0.35 + 0.3 * Math.sin(elapsed * 3)} />
        <path d="M170 80 a75 75 0 0 0 -10 -22" {...base} strokeWidth={1.2} opacity={0.35 + 0.3 * Math.sin(elapsed * 3 + 1)} />
      </svg>
    );
  }

  if (kind === "calendar") {
    // Calendario: grilla 7x5; una SEMANA resaltada late en dorado entre llaves {}.
    const pulse = 0.55 + 0.45 * Math.sin(elapsed * 2.4);
    return (
      <svg {...common}>
        <rect x="40" y="48" width="120" height="110" rx="4" {...base} {...drawProps(460, elapsed, 0)} />
        <line x1="40" y1="64" x2="160" y2="64" {...base} strokeWidth={1.4} {...drawProps(120, elapsed, 0.3)} />
        {Array.from({ length: 5 }).map((_, r) =>
          Array.from({ length: 7 }).map((__, c) => {
            const hl = r === 2; // semana resaltada
            return (
              <rect
                key={`${r}-${c}`}
                x={46 + c * 16}
                y={70 + r * 17}
                width={12}
                height={13}
                rx={1.5}
                stroke={hl ? GOLD : STROKE}
                strokeWidth={hl ? 1.8 : 1}
                opacity={hl ? pulse : clamp01((elapsed - 0.5 - (r * 7 + c) * 0.02) / 0.3) * 0.8}
                fill={hl ? `${GOLD}22` : "none"}
              />
            );
          })
        )}
        {/* llaves { } doradas alrededor de la semana */}
        <path d="M38 100 q-8 6 0 12 q-8 6 0 12" {...gold} fill="none" opacity={pulse} />
        <path d="M162 100 q8 6 0 12 q8 6 0 12" {...gold} fill="none" opacity={pulse} />
      </svg>
    );
  }

  if (kind === "funnel") {
    // Embudo: partículas crema entran arriba, gotas DORADAS salen abajo (loop).
    return (
      <svg {...common}>
        <path d="M50 50 L150 50 L110 110 L110 140 L90 140 L90 110 Z" {...base} {...drawProps(420, elapsed, 0)} />
        {/* partículas de arriba (nube) */}
        {Array.from({ length: 26 }).map((_, i) => {
          const seed = (i * 9301 + 49297) % 233280;
          const rx = (seed / 233280) * 88 + 56;
          const ry = ((seed * 7) % 100) / 100 * 16 + 56 + Math.sin(elapsed * 2 + i) * 2;
          return (
            <circle key={i} cx={rx} cy={ry} r={1.8} fill={STROKE} opacity={clamp01((elapsed - 0.8 - i * 0.03) / 0.3) * 0.85} />
          );
        })}
        {/* gotas doradas que CAEN del embudo en loop */}
        {Array.from({ length: 3 }).map((_, i) => {
          const t = (elapsed * 0.9 + i * 0.33) % 1;
          return (
            <circle
              key={`d-${i}`}
              cx={100}
              cy={148 + t * 38}
              r={2.6}
              fill={GOLD}
              opacity={clamp01((elapsed - 1.2) / 0.4) * (1 - t) }
            />
          );
        })}
      </svg>
    );
  }

  if (kind === "faucet") {
    // Grifo que vierte MONEDAS doradas a un balde (loop de caída + balde que brilla).
    return (
      <svg {...common}>
        {/* grifo */}
        <path d="M70 48 h36 q14 0 14 14 v10" {...base} {...drawProps(120, elapsed, 0)} />
        <path d="M64 42 h12 M70 36 v12" {...base} {...drawProps(40, elapsed, 0.3)} />
        <path d="M112 72 h16 v10 h-16 z" {...base} {...drawProps(60, elapsed, 0.45)} />
        {/* balde */}
        <path d="M76 130 L84 168 L124 168 L132 130" {...base} {...drawProps(160, elapsed, 0.6)} />
        <ellipse cx="104" cy="130" rx="28" ry="6" {...base} {...drawProps(110, elapsed, 0.75)} />
        {/* monedas cayendo (loop) */}
        {Array.from({ length: 7 }).map((_, i) => {
          const t = (elapsed * 1.1 + i * 0.14) % 1;
          const x = 120 + Math.sin(i * 2.4) * 5;
          return (
            <circle
              key={i}
              cx={x}
              cy={86 + t * 42}
              r={2.4}
              fill={GOLD}
              opacity={clamp01((elapsed - 1.0) / 0.4) * (0.95 - t * 0.4)}
            />
          );
        })}
        {/* pila de monedas en el balde, brillando */}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle
            key={`p-${i}`}
            cx={88 + (i % 5) * 8}
            cy={146 - Math.floor(i / 5) * 6 + Math.sin(elapsed * 3 + i) * 0.8}
            r={2.6}
            fill={GOLD}
            opacity={clamp01((elapsed - 1.3 - i * 0.05) / 0.3) * 0.9}
          />
        ))}
      </svg>
    );
  }

  if (kind === "radar") {
    // Antena central dorada + órbitas con dispositivos; anillo de PULSO en loop.
    const pulseT = (elapsed * 0.7) % 1;
    return (
      <svg {...common}>
        {[28, 44, 60, 76].map((r, i) => (
          <circle key={r} cx="100" cy="100" r={r} {...base} strokeWidth={1.2} {...drawProps(2 * Math.PI * r, elapsed, i * 0.18)} />
        ))}
        {/* antena central */}
        <path d="M100 112 l-8 14 h16 z M100 112 v-22 M92 94 l8 -8 8 8" {...gold} {...drawProps(110, elapsed, 0.7)} />
        {/* anillo de pulso */}
        <circle cx="100" cy="100" r={20 + pulseT * 60} stroke={GOLD} strokeWidth={1.6} opacity={(1 - pulseT) * 0.7 * clamp01((elapsed - 1.2) / 0.4)} fill="none" />
        {/* dispositivos en órbita */}
        {[
          { a: 0.6, r: 60, w: 10, h: 7 },
          { a: 2.4, r: 76, w: 12, h: 8 },
          { a: 4.0, r: 44, w: 8, h: 6 },
          { a: 5.2, r: 76, w: 10, h: 7 },
        ].map((d, i) => {
          const ang = d.a + elapsed * 0.15;
          const x = 100 + Math.cos(ang) * d.r;
          const y = 100 + Math.sin(ang) * d.r;
          return (
            <rect key={i} x={x - d.w / 2} y={y - d.h / 2} width={d.w} height={d.h} rx={1.5} {...base} strokeWidth={1.4} opacity={clamp01((elapsed - 1.0 - i * 0.1) / 0.4)} />
          );
        })}
      </svg>
    );
  }

  // chart — línea que sube dibujándose + punto final dorado latiendo.
  const pulse = 0.6 + 0.4 * Math.sin(elapsed * 3);
  return (
    <svg {...common}>
      <path d="M44 156 v-104 M44 156 h116" {...base} {...drawProps(230, elapsed, 0)} />
      <path d="M52 140 L78 118 L100 128 L126 88 L150 64" {...gold} strokeWidth={2.6} fill="none" {...drawProps(150, elapsed, 0.5, 1.4)} />
      <circle cx="150" cy="64" r={4 * pulse + 2} fill={GOLD} opacity={clamp01((elapsed - 1.9) / 0.4)} />
      {[52, 78, 100, 126].map((x, i) => (
        <circle key={x} cx={x} cy={[140, 118, 128, 88][i]} r={2.2} fill={STROKE} opacity={clamp01((elapsed - 0.7 - i * 0.25) / 0.3)} />
      ))}
    </svg>
  );
};
