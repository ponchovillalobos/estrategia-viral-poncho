import { AbsoluteFill } from "remotion";
import rough from "roughjs";
import { evolvePath } from "@remotion/paths";
import type { DataViz } from "../schemas";
import { stepTime } from "./editorial-texture";
import { resolveEditorialLook, type MotifId } from "./editorial-themes";
import type { EditorialLayout, PanelRect } from "./editorial-layer";

/**
 * EDITORIAL — Data-viz de periódico (Ola 5): renderiza las specs `dataViz` que
 * el generador YA produce (antes se descartaban en modo editorial) con dos
 * acabados según el tema:
 *   - "hairline": estilo Economist — líneas 1px, etiquetado directo sin
 *     leyendas, cifras tabular-nums, la barra clave en acento.
 *   - "sketchy": estilo NYT "a mano" — rough.js con seed determinista y
 *     "line boil" (el trazo re-tiembla a 4 fps).
 * Mientras un chart está activo, las tarjetas se ocultan (anti-encime).
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** Temas "de papel" → acabado sketchy; el resto → hairline. */
const SKETCHY_MOTIFS: MotifId[] = ["prensa", "grabado", "riso", "kinfolk", "bauhaus", "constructivista", "mincho"];

const gen = rough.generator();

/** Paths rough de un rect con relleno hachurado (seed + boil determinista). */
function roughRect(w: number, h: number, seed: number, color: string) {
  const d = gen.rectangle(1, 1, Math.max(2, w - 2), Math.max(2, h - 2), {
    seed,
    roughness: 1.6,
    bowing: 1.2,
    stroke: color,
    strokeWidth: 2,
    fill: color,
    fillStyle: "hachure",
    hachureGap: 7,
    fillWeight: 1.4,
  });
  return gen.toPaths(d);
}

const Num: React.FC<{ children: React.ReactNode; family: string; size: number; color: string }> = ({
  children, family, size, color,
}) => (
  <span style={{ fontFamily: family, fontWeight: 900, fontSize: size, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.04 }}>
    {children}
  </span>
);

export const EditorialChartLayer: React.FC<{
  viz: DataViz;
  currentTime: number;
  layout: EditorialLayout;
  width: number;
  height: number;
  panel?: PanelRect | null;
  /** Familias del tema resueltas por el card layer/ViralVideo. */
  fontTitle: string;
  fontKicker: string;
}> = ({ viz, currentTime, layout, width, height, panel, fontTitle, fontKicker }) => {
  const look = resolveEditorialLook(layout);
  const GOLD = layout.accent ?? look.themeAccent ?? "#f0b429";
  const TEXT = look.canvas.text;
  const MUTED = look.canvas.muted;
  const sketchy = SKETCHY_MOTIFS.includes(look.motif);
  const now = stepTime(currentTime, layout.fps12);
  const t = now - viz.at;
  const remaining = viz.at + (viz.duration ?? 4) - now;
  if (t < 0 || remaining < 0) return null;
  const fadeOut = clamp01(remaining / 0.35);
  const p = easeOut(clamp01(t / 0.9));
  // "line boil": el trazo sketchy re-tiembla a 4 fps (seed alterna).
  const boil = sketchy ? Math.floor(now * 4) % 3 : 0;
  const seedBase = 11 + Math.abs(Math.round(viz.at * 13));

  // Zona de texto (misma lógica que las tarjetas: lado contrario al panel,
  // o debajo del panel en 9:16 cuadrado/cierre).
  const textOnLeft = (panel?.textSide ?? "left") === "left";
  const textBelow = Boolean(panel?.textBelow);
  const zoneWidth = textBelow
    ? width - 112
    : panel
      ? Math.max(width * 0.3, width - panel.w - 140)
      : width * (1 - (layout.panelWidth ?? 0.4)) - 90;
  const zoneStyle: React.CSSProperties = textBelow && panel
    ? { position: "absolute", left: 56, right: 56, top: panel.y + panel.h + height * 0.03, bottom: height * 0.04, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: height * 0.016 }
    : { position: "absolute", top: 0, bottom: 0, [textOnLeft ? "left" : "right"]: 56, width: zoneWidth, display: "flex", flexDirection: "column", justifyContent: "center", gap: height * 0.016 };

  const titleSize = Math.min(zoneWidth * (textBelow ? 0.082 : 0.135), height * 0.075);
  const chartW = Math.min(zoneWidth * 0.94, width * 0.8);
  const data = viz.data ?? [];
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number, decimals = 0) =>
    `${viz.prefix ?? ""}${new Intl.NumberFormat("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)}${viz.suffix ?? ""}`;

  let body: React.ReactNode = null;

  if (viz.type === "counter") {
    const target = data[0]?.value ?? 0;
    const decimals = Number.isInteger(target) ? 0 : 1;
    body = <Num family={fontTitle} size={titleSize * 1.7} color={TEXT}>{fmt(target * p, decimals)}</Num>;
  } else if (viz.type === "progress" || viz.type === "pictograph") {
    const target = data[0]?.value ?? 0;
    const total = viz.total ?? (viz.type === "progress" ? 100 : Math.max(10, target));
    const frac = clamp01(target / Math.max(1, total));
    const barH = height * 0.03;
    body = (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <Num family={fontTitle} size={titleSize * 1.1} color={TEXT}>{fmt(Math.round(target * p))}</Num>
          <span style={{ fontFamily: fontKicker, fontSize: titleSize * 0.34, color: MUTED }}>de {fmt(total)}</span>
        </div>
        <div style={{ position: "relative", width: chartW, height: barH, border: sketchy ? "none" : `1px solid ${MUTED}88` }}>
          {sketchy ? (
            <svg width={chartW} height={barH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {roughRect(chartW, barH, seedBase + 1, MUTED).slice(0, 1).map((rp, i) => (
                <path key={`o-${i}`} d={rp.d} fill="none" stroke={MUTED} strokeWidth={1.4} />
              ))}
              <g style={{ clipPath: `inset(0 ${100 - frac * p * 100}% 0 0)` }}>
                {roughRect(chartW, barH, seedBase + 2 + boil, GOLD).map((rp, i) => (
                  <path key={i} d={rp.d} fill="none" stroke={rp.stroke} strokeWidth={rp.strokeWidth} />
                ))}
              </g>
            </svg>
          ) : (
            <div style={{ position: "absolute", inset: 2, width: `calc(${(frac * p * 100).toFixed(1)}% - 4px)`, background: GOLD }} />
          )}
        </div>
      </div>
    );
  } else if (viz.type === "bar") {
    const rows = data.slice(0, 4);
    const barH = Math.min(height * 0.028, 30);
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: barH * 0.55 }}>
        {rows.map((d, i) => {
          const rp = easeOut(clamp01((t - 0.15 * i) / 0.8));
          const w = Math.max(4, (d.value / maxV) * chartW * 0.72 * rp);
          const isKey = d.value === maxV;
          const color = d.color || (isKey ? GOLD : MUTED);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: rp > 0 ? 1 : 0 }}>
              <span style={{ fontFamily: fontKicker, fontSize: barH * 0.62, color: MUTED, width: chartW * 0.2, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.label}
              </span>
              {sketchy ? (
                <svg width={w} height={barH} style={{ overflow: "visible" }}>
                  {roughRect(w, barH, seedBase + i * 7 + boil, color).map((path, j) => (
                    <path key={j} d={path.d} fill="none" stroke={color} strokeWidth={path.strokeWidth} opacity={isKey ? 1 : 0.6} />
                  ))}
                </svg>
              ) : (
                <div style={{ width: w, height: barH, background: color, opacity: isKey ? 1 : 0.45 }} />
              )}
              <Num family={fontTitle} size={barH * 0.85} color={isKey ? TEXT : MUTED}>{fmt(d.value)}</Num>
            </div>
          );
        })}
      </div>
    );
  } else if (viz.type === "line") {
    const w = chartW;
    const h = Math.min(height * 0.16, w * 0.45);
    const pts = data.length >= 2 ? data : [{ label: "", value: 0 }, { label: "", value: 1 }];
    const xy = pts.map((d, i) => [
      (i / (pts.length - 1)) * (w - 16) + 8,
      h - 10 - (d.value / maxV) * (h - 24),
    ]);
    const dStr = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    // Sin useMemo (hook condicional prohibido); rough con pocos puntos es barato.
    const sketchD = sketchy
      ? gen
          .toPaths(
            gen.linearPath(xy.map(([x, y]) => [x, y] as [number, number]), {
              seed: seedBase + boil, roughness: 1.4, strokeWidth: 3, stroke: GOLD,
            })
          )
          .map((q) => q.d)
      : null;
    const ev = evolvePath(p, dStr);
    body = (
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <line x1={4} y1={h - 8} x2={w - 4} y2={h - 8} stroke={MUTED} strokeWidth={1} opacity={0.6} />
        {sketchy && sketchD ? (
          <g style={{ clipPath: `inset(0 ${100 - p * 100}% 0 0)` }}>
            {sketchD.map((dd, i) => (
              <path key={i} d={dd} fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
            ))}
          </g>
        ) : (
          <path d={dStr} fill="none" stroke={GOLD} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
        )}
        {xy.map(([x, y], i) => {
          const dotP = clamp01((p - i / xy.length) * 4);
          return dotP > 0 ? <circle key={i} cx={x} cy={y} r={4 * dotP} fill={GOLD} /> : null;
        })}
        {/* etiquetado directo: primer y último valor */}
        <text x={xy[0][0]} y={xy[0][1] - 12} fill={MUTED} fontFamily={fontKicker} fontSize={h * 0.12} textAnchor="start">{fmt(pts[0].value)}</text>
        {p > 0.85 ? (
          <text x={xy[xy.length - 1][0]} y={xy[xy.length - 1][1] - 12} fill={TEXT} fontFamily={fontTitle} fontWeight={900} fontSize={h * 0.16} textAnchor="end">{fmt(pts[pts.length - 1].value)}</text>
        ) : null}
      </svg>
    );
  } else if (viz.type === "donut") {
    const target = data[0]?.value ?? 0;
    const total = viz.total ?? Math.max(100, target);
    const frac = clamp01(target / Math.max(1, total));
    const R = Math.min(zoneWidth, height * 0.22) * (textBelow ? 0.32 : 0.42);
    const C = 2 * Math.PI * R;
    const S = R * 2 + 28;
    body = (
      <div style={{ position: "relative", width: S, height: S }}>
        <svg width={S} height={S} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke={MUTED} strokeWidth={sketchy ? 2 : 6} opacity={0.35} strokeDasharray={sketchy ? "3 7" : undefined} />
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke={GOLD} strokeWidth={sketchy ? 10 : 14} strokeLinecap="round" strokeDasharray={`${(C * frac * p).toFixed(1)} ${C.toFixed(1)}`} strokeDashoffset={sketchy ? boil * 1.5 : 0} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Num family={fontTitle} size={R * 0.62} color={TEXT}>{fmt(Math.round(target * p))}</Num>
        </div>
      </div>
    );
  } else if (viz.type === "comparison") {
    const a = data[0] ?? { label: "", value: 0 };
    const b = data[1] ?? { label: "", value: 0 };
    const win = a.value >= b.value;
    const col = (d: { label: string; value: number }, isWin: boolean, delay: number) => {
      const cp = easeOut(clamp01((t - delay) / 0.7));
      return (
        <div style={{ flex: 1, textAlign: "center", opacity: cp }}>
          <Num family={fontTitle} size={titleSize * 1.05} color={isWin ? GOLD : MUTED}>{fmt(Math.round(d.value * cp))}</Num>
          <div style={{ fontFamily: fontKicker, fontSize: titleSize * 0.3, color: MUTED, textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 6 }}>{d.label}</div>
        </div>
      );
    };
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: chartW }}>
        {col(a, win, 0.1)}
        <span style={{ fontFamily: fontTitle, fontStyle: "italic", fontSize: titleSize * 0.5, color: TEXT, opacity: 0.6 }}>vs</span>
        {col(b, !win, 0.3)}
      </div>
    );
  } else if (viz.type === "steps") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: height * 0.012 }}>
        {data.slice(0, 4).map((d, i) => {
          const sp = easeOut(clamp01((t - 0.25 * i) / 0.5));
          return (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, opacity: sp, transform: `translateY(${(1 - sp) * 12}px)` }}>
              <Num family={fontTitle} size={titleSize * 0.66} color={GOLD}>{String(i + 1).padStart(2, "0")}</Num>
              <span style={{ fontFamily: fontKicker, fontSize: titleSize * 0.42, color: TEXT }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    );
  } else if (viz.type === "rating") {
    const target = data[0]?.value ?? 0;
    const max = viz.max ?? 5;
    body = (
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: titleSize * 0.95, letterSpacing: "0.08em" }}>
          {Array.from({ length: max }).map((_, i) => {
            const sp = clamp01((p * max - i) * 1.6);
            return (
              <span key={i} style={{ color: i < Math.round(target) ? GOLD : MUTED, opacity: 0.25 + 0.75 * sp }}>★</span>
            );
          })}
        </span>
        <Num family={fontTitle} size={titleSize * 0.6} color={TEXT}>{fmt(target)}</Num>
      </div>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: fadeOut }}>
      <div style={zoneStyle}>
        {viz.title ? (
          <div style={{ fontFamily: fontKicker, fontSize: height * 0.0165, letterSpacing: "0.5em", textTransform: "uppercase", color: MUTED, overflow: "hidden" }}>
            <div style={{ transform: `translateY(${(1 - easeOut(clamp01(t / 0.4))) * 110}%)` }}>{viz.title}</div>
          </div>
        ) : null}
        {body}
        {/* filete corto de cierre, estilo nota de prensa */}
        <div style={{ width: chartW * 0.2 * p, borderTop: sketchy ? `2px dashed ${MUTED}` : `2px solid ${GOLD}`, marginTop: 4 }} />
      </div>
    </AbsoluteFill>
  );
};
