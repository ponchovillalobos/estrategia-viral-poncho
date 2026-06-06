import { AbsoluteFill, interpolate, spring } from "remotion";
import type { DataViz, DataPoint } from "../schemas";

/**
 * MODO GRÁFICOS & MOTION — Gráfica animada (counter · bar · line · donut).
 * Todo SVG/CSS animado por currentTime. Aparece en [at, at+duration].
 * Aditivo: sin dataViz no renderiza nada y el render queda idéntico.
 */
export const DataVizLayer: React.FC<{
  config: DataViz;
  currentTime: number;
  fps: number;
  fontFamily: string;
}> = ({ config, currentTime, fps, fontFamily }) => {
  if (currentTime < config.at || currentTime > config.at + config.duration) {
    return null;
  }
  // Guarda: una gráfica sin datos no debe romper el render (defensivo ante specs
  // malformados; el generador siempre emite `data`, pero esto evita un crash global).
  if (!Array.isArray(config.data) || config.data.length === 0) {
    return null;
  }
  const elapsed = currentTime - config.at;
  const frame = elapsed * fps;
  const fadeIn = Math.min(1, elapsed / 0.25);
  const fadeOut = Math.min(1, (config.duration - elapsed) / 0.35);
  const envelope = Math.max(0, Math.min(fadeIn, fadeOut));

  // Progreso de animación de la gráfica (entrada), independiente del fade.
  const enter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 0.8 },
  });

  const justify =
    config.position === "top"
      ? "flex-start"
      : config.position === "bottom"
        ? "flex-end"
        : "center";

  const card: React.CSSProperties = config.fullscreen
    ? {
        background: config.bg,
        backdropFilter: "blur(14px)",
        justifyContent: "center",
        alignItems: "center",
      }
    : { justifyContent: justify, alignItems: "center" };

  return (
    <AbsoluteFill style={{ ...card, pointerEvents: "none", opacity: envelope }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 36,
          padding: config.fullscreen ? 0 : "80px 0",
          transform: `scale(${0.86 + enter * 0.14})`,
          width: "84%",
        }}
      >
        {config.title ? (
          <div
            style={{
              fontFamily,
              fontSize: 64,
              fontWeight: 900,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              textAlign: "center",
              lineHeight: 1.05,
              textShadow: `0 0 50px ${config.accent}55`,
            }}
          >
            {config.title}
          </div>
        ) : null}
        {config.type === "counter" && (
          <Counter config={config} enter={enter} fontFamily={fontFamily} />
        )}
        {config.type === "bar" && (
          <BarChart config={config} frame={frame} fps={fps} fontFamily={fontFamily} />
        )}
        {config.type === "line" && (
          <LineChart config={config} frame={frame} fps={fps} fontFamily={fontFamily} />
        )}
        {config.type === "donut" && (
          <Donut config={config} enter={enter} fontFamily={fontFamily} />
        )}
      </div>
    </AbsoluteFill>
  );
};

const fmt = (n: number): string => new Intl.NumberFormat("es-MX").format(Math.round(n));

const palette = (accent: string, i: number): string => {
  const fallback = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa", "#fb7185"];
  return i === 0 ? accent : fallback[i % fallback.length];
};

const Counter: React.FC<{ config: DataViz; enter: number; fontFamily: string }> = ({
  config,
  enter,
  fontFamily,
}) => {
  const target = config.data[0]?.value ?? 0;
  const value = target * enter;
  return (
    <div
      style={{
        fontFamily,
        fontSize: 300,
        fontWeight: 900,
        color: config.accent,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        textShadow: `0 0 90px ${config.accent}88`,
      }}
    >
      {config.prefix}
      {fmt(value)}
      {config.suffix}
    </div>
  );
};

const BarChart: React.FC<{
  config: DataViz;
  frame: number;
  fps: number;
  fontFamily: string;
}> = ({ config, frame, fps, fontFamily }) => {
  const data = config.data.slice(0, 6);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 900;
  const H = 620;
  const gap = 36;
  const barW = (W - gap * (data.length - 1)) / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 120}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const grow = spring({
          frame: frame - i * 4,
          fps,
          config: { damping: 16, stiffness: 110, mass: 0.7 },
        });
        const fullH = (d.value / max) * H;
        const h = fullH * grow;
        const x = i * (barW + gap);
        const y = H - h;
        const c = d.color || palette(config.accent, i);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={14} fill={c} opacity={0.95} />
            <text
              x={x + barW / 2}
              y={y - 16}
              textAnchor="middle"
              fill="#ffffff"
              style={{ fontFamily, fontSize: 46, fontWeight: 900 }}
              opacity={grow}
            >
              {config.prefix}
              {fmt(d.value * grow)}
              {config.suffix}
            </text>
            <text
              x={x + barW / 2}
              y={H + 64}
              textAnchor="middle"
              fill="#cbd5e1"
              style={{ fontFamily, fontSize: 38, fontWeight: 700 }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const LineChart: React.FC<{
  config: DataViz;
  frame: number;
  fps: number;
  fontFamily: string;
}> = ({ config, frame, fps, fontFamily }) => {
  const data = config.data.slice(0, 12);
  if (data.length < 2) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const W = 940;
  const H = 560;
  const pad = 40;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (d.value - min) / (max - min || 1)) * (H - pad * 2);
    return [x, y] as const;
  });
  const dPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  // Dibujado progresivo: pathLength=1 + dashoffset 1→0.
  const draw = interpolate(frame, [0, fps * 1.4], [1, 0], { extrapolateRight: "clamp" });
  const dotsShown = Math.floor(interpolate(frame, [0, fps * 1.4], [0, data.length], {
    extrapolateRight: "clamp",
  }));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 80}`} preserveAspectRatio="xMidYMid meet">
      <path
        d={dPath}
        fill="none"
        stroke={config.accent}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={draw}
        style={{ filter: `drop-shadow(0 0 18px ${config.accent}88)` }}
      />
      {pts.map((p, i) =>
        i <= dotsShown ? <circle key={i} cx={p[0]} cy={p[1]} r={12} fill={config.accent} /> : null,
      )}
      {data.map((d, i) => (
        <text
          key={`l${i}`}
          x={pts[i][0]}
          y={H + 50}
          textAnchor="middle"
          fill="#cbd5e1"
          style={{ fontFamily, fontSize: 32, fontWeight: 700 }}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
};

const Donut: React.FC<{ config: DataViz; enter: number; fontFamily: string }> = ({
  config,
  enter,
  fontFamily,
}) => {
  const data: DataPoint[] = config.data.slice(0, 6);
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));
  const R = 220;
  const stroke = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg width="100%" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(300,300) rotate(-90)">
        {data.map((d, i) => {
          const frac = (d.value / total) * enter;
          const len = frac * C;
          // El offset usa el acumulado ESCALADO (mismo factor `enter`) para que los
          // segmentos queden contiguos durante la animación (sin solapes/saltos).
          const off = -acc * C;
          acc += frac;
          const c = d.color || palette(config.accent, i);
          return (
            <circle
              key={i}
              r={R}
              fill="none"
              stroke={c}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={off}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
      <text
        x="300"
        y="315"
        textAnchor="middle"
        fill="#ffffff"
        style={{ fontFamily, fontSize: 120, fontWeight: 900 }}
      >
        {config.prefix}
        {fmt((data[0]?.value ?? 0) / total * 100 * enter)}
        {config.suffix || "%"}
      </text>
    </svg>
  );
};
