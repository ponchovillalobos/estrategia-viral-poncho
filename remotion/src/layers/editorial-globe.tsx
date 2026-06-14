import { AbsoluteFill } from "remotion";
import { useMemo } from "react";
import { geoOrthographic, geoPath, geoInterpolate, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import topology from "world-atlas/countries-110m.json";
import { stepTime } from "./editorial-texture";
import { resolveEditorialLook } from "./editorial-themes";
import type { EditorialLayout, PanelRect } from "./editorial-layer";
import { editorialFontsFor } from "./editorial-layer";

/**
 * EDITORIAL — Mapa GLOBO con zoom (Ola 7): cuando el transcript menciona un
 * lugar (gazetteer local en generate_graphics.py), el globo gira desde México
 * hasta el punto con slerp esférico (geoInterpolate) + zoom EXPONENCIAL
 * (velocidad perceptual constante). Datos Natural Earth 110m (dominio público)
 * BUNDLEADOS — cero red. Todo deriva del frame: determinista.
 */

// El schema vive en editorial-globe-schema.ts (sin deps pesadas) para que ViralVideo
// lo importe sin arrastrar d3/topojson/world-atlas. Se re-exporta acá por compat.
import type { EditorialMap } from "./editorial-globe-schema";
export { editorialMapSchema } from "./editorial-globe-schema";
export type { EditorialMap } from "./editorial-globe-schema";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// Origen del viaje: México (el público del creador).
const ORIGIN: [number, number] = [-102.5, 23.6];
const GRATICULE = geoGraticule10();

export const EditorialGlobeLayer: React.FC<{
  map: EditorialMap;
  currentTime: number;
  layout: EditorialLayout;
  width: number;
  height: number;
  panel?: PanelRect | null;
}> = ({ map, currentTime, layout, width, height, panel }) => {
  const look = resolveEditorialLook(layout);
  const GOLD = layout.accent ?? look.themeAccent ?? "#f0b429";
  const TEXT = look.canvas.text;
  const MUTED = look.canvas.muted;
  const [FONT_TITLE, FONT_KICKER] = editorialFontsFor(layout);
  // Hook ANTES de cualquier return condicional (regla de hooks).
  const countries = useMemo(
    () =>
      feature(
        topology as unknown as Parameters<typeof feature>[0],
        (topology as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries
      ) as unknown as FeatureCollection<Geometry>,
    []
  );
  const now = stepTime(currentTime, layout.fps12);
  const t = now - map.at;
  const remaining = map.at + (map.duration ?? 5) - now;
  if (t < 0 || remaining < 0) return null;
  const fadeOut = clamp01(remaining / 0.35);

  // Zona de texto (igual que tarjetas/charts/collage).
  const textOnLeft = (panel?.textSide ?? "left") === "left";
  const textBelow = Boolean(panel?.textBelow);
  const zoneWidth = textBelow
    ? width - 112
    : panel
      ? Math.max(width * 0.3, width - panel.w - 140)
      : width * (1 - (layout.panelWidth ?? 0.4)) - 90;
  const zoneStyle: React.CSSProperties = textBelow && panel
    ? { position: "absolute", left: 56, right: 56, top: panel.y + panel.h + height * 0.03, bottom: height * 0.04, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: height * 0.012 }
    : { position: "absolute", top: 0, bottom: 0, [textOnLeft ? "left" : "right"]: 56, width: zoneWidth, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: height * 0.012 };

  // Viaje: 0→1 en ~2.2s (slerp por gran círculo + zoom exponencial).
  const travel = easeInOut(clamp01(t / 2.2));
  const target: [number, number] = [map.lon, map.lat];
  const [lon, lat] = geoInterpolate(ORIGIN, target)(travel);
  const S = Math.min(zoneWidth * 0.92, height * (textBelow ? 0.24 : 0.3));
  const baseScale = S / 2.1;
  const scale = baseScale * Math.exp(travel * Math.log(3.2)); // 1× → 3.2×

  const projection = geoOrthographic()
    .rotate([-lon, -lat])
    .scale(scale)
    .translate([S / 2, S / 2])
    .clipAngle(90);
  const pathGen = geoPath(projection);
  const pin = projection(target);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: fadeOut }}>
      <div style={zoneStyle}>
        <div style={{ fontFamily: FONT_KICKER, fontSize: height * 0.0165, letterSpacing: "0.5em", textTransform: "uppercase", color: MUTED, overflow: "hidden" }}>
          <div style={{ transform: `translateY(${(1 - clamp01(t / 0.4)) * 110}%)` }}>EL LUGAR</div>
        </div>
        <svg width={S} height={S} style={{ overflow: "visible" }}>
          {/* esfera + graticule */}
          <circle cx={S / 2} cy={S / 2} r={Math.min(scale, S / 2)} fill="none" stroke={MUTED} strokeWidth={1} opacity={0.5} />
          <path d={pathGen(GRATICULE) ?? ""} fill="none" stroke={MUTED} strokeWidth={0.5} opacity={0.35} />
          {/* países: tinta del tema */}
          {countries.features.map((f, i) => {
            const d = pathGen(f);
            return d ? <path key={i} d={d} fill={TEXT} opacity={0.22} stroke={TEXT} strokeWidth={0.6} /> : null;
          })}
          {/* pin del destino: anillo que late + punto del acento */}
          {pin && travel > 0.5 ? (
            <g opacity={clamp01((travel - 0.5) * 3)}>
              <circle cx={pin[0]} cy={pin[1]} r={S * 0.035 * (1 + pulse * 0.5)} fill="none" stroke={GOLD} strokeWidth={2} opacity={0.8 - pulse * 0.4} />
              <circle cx={pin[0]} cy={pin[1]} r={S * 0.014} fill={GOLD} />
            </g>
          ) : null}
        </svg>
        {map.label ? (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontFamily: FONT_TITLE,
                fontWeight: 900,
                fontSize: Math.min(zoneWidth * 0.1, height * 0.034),
                letterSpacing: "0.22em",
                color: TEXT,
                transform: `translateY(${(1 - easeInOut(clamp01((t - 1.6) / 0.5))) * 110}%)`,
              }}
            >
              {map.label}
            </div>
          </div>
        ) : null}
        <div style={{ width: zoneWidth * 0.14 * travel, borderTop: `3px solid ${GOLD}` }} />
      </div>
    </AbsoluteFill>
  );
};
