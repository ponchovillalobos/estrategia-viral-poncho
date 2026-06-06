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
        {config.type === "progress" && (
          <Progress config={config} enter={enter} fontFamily={fontFamily} />
        )}
        {config.type === "comparison" && (
          <Comparison config={config} enter={enter} fontFamily={fontFamily} />
        )}
        {config.type === "pictograph" && (
          <Pictograph config={config} frame={frame} fps={fps} fontFamily={fontFamily} />
        )}
        {config.type === "steps" && (
          <Steps config={config} frame={frame} fps={fps} fontFamily={fontFamily} />
        )}
        {config.type === "rating" && (
          <Rating config={config} enter={enter} fontFamily={fontFamily} />
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

// ── Progress / gauge: barra grande que se llena a un % ──
const Progress: React.FC<{ config: DataViz; enter: number; fontFamily: string }> = ({
  config,
  enter,
  fontFamily,
}) => {
  const pct = Math.max(0, Math.min(100, config.data[0]?.value ?? 0));
  const fill = pct * enter;
  return (
    <div style={{ width: "90%", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <div style={{ fontFamily, fontSize: 200, fontWeight: 900, color: config.accent, lineHeight: 1, textShadow: `0 0 80px ${config.accent}88` }}>
        {config.prefix}{fmt(fill)}{config.suffix || "%"}
      </div>
      <div style={{ width: "100%", height: 64, borderRadius: 999, background: "#ffffff22", overflow: "hidden" }}>
        <div style={{ width: `${fill}%`, height: "100%", borderRadius: 999, background: config.accent, boxShadow: `0 0 40px ${config.accent}` }} />
      </div>
      {config.data[0]?.label ? (
        <div style={{ fontFamily, fontSize: 40, fontWeight: 700, color: "#cbd5e1" }}>{config.data[0].label}</div>
      ) : null}
    </div>
  );
};

// ── Comparison: dos paneles VS (el mayor resaltado en accent) ──
const Comparison: React.FC<{ config: DataViz; enter: number; fontFamily: string }> = ({
  config,
  enter,
  fontFamily,
}) => {
  const a = config.data[0];
  const b = config.data[1] ?? { label: "", value: 0 };
  const aWins = (a?.value ?? 0) >= (b?.value ?? 0);
  const Panel = (d: DataPoint, win: boolean, delay: number) => {
    const e = Math.max(0, Math.min(1, enter * 1.3 - delay));
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: e, transform: `translateY(${(1 - e) * 30}px)` }}>
        <div style={{ fontFamily, fontSize: 150, fontWeight: 900, color: win ? config.accent : "#94a3b8", lineHeight: 1, textShadow: win ? `0 0 60px ${config.accent}88` : "none" }}>
          {config.prefix}{fmt(d.value * e)}{config.suffix}
        </div>
        <div style={{ fontFamily, fontSize: 42, fontWeight: 700, color: win ? "#ffffff" : "#94a3b8", textTransform: "uppercase", textAlign: "center" }}>
          {d.label}
        </div>
      </div>
    );
  };
  return (
    <div style={{ width: "94%", display: "flex", alignItems: "center", gap: 24 }}>
      {Panel(a, aWins, 0)}
      <div style={{ fontFamily, fontSize: 72, fontWeight: 900, color: "#ffffff", opacity: 0.5, transform: `scale(${0.5 + enter * 0.5})` }}>VS</div>
      {Panel(b, !aWins, 0.15)}
    </div>
  );
};

// ── Pictograph: X de Y representado con puntos/íconos que se llenan ──
const Pictograph: React.FC<{ config: DataViz; frame: number; fps: number; fontFamily: string }> = ({
  config,
  frame,
  fps,
  fontFamily,
}) => {
  const total = Math.max(1, Math.min(20, Math.round(config.total ?? 10)));
  const filled = Math.max(0, Math.min(total, Math.round(config.data[0]?.value ?? 0)));
  const shown = Math.floor(interpolate(frame, [0, fps * 1.2], [0, filled], { extrapolateRight: "clamp" }));
  const cols = total <= 10 ? 5 : 10;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 18, maxWidth: 760 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: 84, height: 84, borderRadius: 20,
            background: i < shown ? config.accent : "#ffffff22",
            boxShadow: i < shown ? `0 0 28px ${config.accent}aa` : "none",
            transition: "none",
          }} />
        ))}
      </div>
      <div style={{ fontFamily, fontSize: 88, fontWeight: 900, color: "#ffffff" }}>
        <span style={{ color: config.accent }}>{filled}</span> de {total}
      </div>
      {config.data[0]?.label ? (
        <div style={{ fontFamily, fontSize: 40, fontWeight: 700, color: "#cbd5e1", textAlign: "center" }}>{config.data[0].label}</div>
      ) : null}
    </div>
  );
};

// ── Steps: lista numerada 1·2·3 que entra en secuencia ──
const Steps: React.FC<{ config: DataViz; frame: number; fps: number; fontFamily: string }> = ({
  config,
  frame,
  fps,
  fontFamily,
}) => {
  const items = config.data.slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, width: "88%" }}>
      {items.map((d, i) => {
        const e = spring({ frame: frame - i * 8, fps, config: { damping: 16, stiffness: 120, mass: 0.7 } });
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 28, opacity: e, transform: `translateX(${(1 - e) * -60}px)` }}>
            <div style={{
              flexShrink: 0, width: 96, height: 96, borderRadius: 999, background: config.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily, fontSize: 56, fontWeight: 900, color: "#0a0a0a",
              boxShadow: `0 0 36px ${config.accent}aa`,
            }}>
              {i + 1}
            </div>
            <div style={{ fontFamily, fontSize: 52, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Rating: estrellas (X de max) que se llenan ──
const STAR_PATH =
  "M50 5 L61 38 L96 38 L68 59 L79 92 L50 71 L21 92 L32 59 L4 38 L39 38 Z";
const Rating: React.FC<{ config: DataViz; enter: number; fontFamily: string }> = ({
  config,
  enter,
  fontFamily,
}) => {
  const max = Math.max(1, Math.min(10, Math.round(config.max ?? 5)));
  const val = Math.max(0, Math.min(max, config.data[0]?.value ?? 0));
  const shown = val * enter;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", gap: 16 }}>
        {Array.from({ length: max }).map((_, i) => {
          const on = i < Math.round(shown);
          return (
            <svg key={i} width={120} height={120} viewBox="0 0 100 100" style={{ filter: on ? `drop-shadow(0 0 20px ${config.accent}aa)` : "none" }}>
              <path d={STAR_PATH} fill={on ? config.accent : "#ffffff22"} />
            </svg>
          );
        })}
      </div>
      {config.data[0]?.label ? (
        <div style={{ fontFamily, fontSize: 44, fontWeight: 800, color: "#ffffff", textAlign: "center" }}>{config.data[0].label}</div>
      ) : null}
    </div>
  );
};
