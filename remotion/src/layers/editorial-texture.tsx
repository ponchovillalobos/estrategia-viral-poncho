import { AbsoluteFill } from "remotion";

/**
 * EDITORIAL — Motor de look (Ola 1 del plan EDITORIAL-SUPREMO):
 *   - stepTime: cuantiza el reloj de las capas GRÁFICAS a 12 fps (la firma de
 *     Vox: el motion gráfico se ve "hecho a mano"; el video sigue a 30).
 *   - EditorialPaper: textura de papel procedural (feTurbulence+feDiffuseLighting,
 *     cero assets, resolución infinita) detrás de todo el lienzo.
 *   - EditorialFinish: grano animado + viñeta + aberración cromática sutil en
 *     bordes — la "capa de cohesión" que unifica el render como filmado.
 *   - EditorialDuotone: duotono del panel de video (backdrop-filter grayscale +
 *     capas lighten/darken) — el look Economist para material de archivo.
 * Todo determinista: nada de Math.random/Date; el grano re-seedea con el tiempo
 * cuantizado (mismo frame → mismo seed en cualquier thread de render).
 */

/** Tiempo cuantizado a `fps` pasos por segundo cuando `on` (capas gráficas). */
export const stepTime = (t: number, on: boolean | undefined, fps = 12): number =>
  on ? Math.floor(t * fps) / fps : t;

/** Deriva ±1px tipo "gate weave" para capas gráficas (cohesión, determinista). */
export const gateWeave = (t: number, on: boolean | undefined): string =>
  on
    ? `translate(${(Math.sin(t * 6.7) * 0.9).toFixed(2)}px, ${(Math.cos(t * 5.3) * 0.7).toFixed(2)}px)`
    : "";

/** Textura de papel procedural para el lienzo (estática — barata). */
export const EditorialPaper: React.FC<{
  width: number;
  height: number;
  /** true si el fondo del tema es oscuro (ajusta blend/opacity). */
  darkCanvas: boolean;
  /** Intensidad 0..1 (default sutil). */
  opacity?: number;
}> = ({ width, height, darkCanvas, opacity = 1 }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: "soft-light",
          opacity: (darkCanvas ? 0.4 : 0.55) * opacity,
        }}
      >
        <filter id="edtx-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="5"
            seed="7"
            stitchTiles="stitch"
            result="noise"
          />
          <feDiffuseLighting in="noise" lightingColor="#ffffff" surfaceScale="1.6">
            <feDistantLight azimuth="45" elevation="60" />
          </feDiffuseLighting>
        </filter>
        <rect width="100%" height="100%" filter="url(#edtx-paper)" />
      </svg>
      {/* fibra fina encima (grano de papel sin recubrir) */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: darkCanvas ? "screen" : "multiply",
          opacity: 0.05 * opacity,
        }}
      >
        <filter id="edtx-fibre" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#edtx-fibre)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Capa de cohesión final: grano vivo + viñeta + aberración sutil en bordes. */
export const EditorialFinish: React.FC<{
  width: number;
  height: number;
  /** Tiempo actual (se cuantiza solo a 12 fps para re-seedear el grano). */
  t: number;
  darkCanvas: boolean;
}> = ({ width, height, t, darkCanvas }) => {
  // El grano re-seedea a 12 fps (grano "vivo" sin parecer ruido de compresión).
  const seed = 1 + (Math.floor(t * 12) % 12);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* grano animado */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: "overlay",
          opacity: darkCanvas ? 0.07 : 0.055,
        }}
      >
        <filter id="edtx-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#edtx-grain)" />
      </svg>
      {/* viñeta suave */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,${darkCanvas ? 0.26 : 0.14}) 100%)`,
        }}
      />
      {/* aberración cromática SOLO en los bordes (rojo izq / cian der, casi imperceptible) */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(255,40,40,0.05) 0%, transparent 5%, transparent 95%, rgba(40,230,255,0.05) 100%)",
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};

/** Duotono del panel de video: gris → sombras a `shadow`, luces a `highlight`.
 *  Autocontenido vía backdrop-filter (no toca el elemento <video>). */
export const EditorialDuotone: React.FC<{
  /** 0..1 — 0 desactiva (no montar), 1 = duotono pleno. */
  strength: number;
  shadow: string;
  highlight: string;
}> = ({ strength, shadow, highlight }) => {
  const s = Math.min(1, Math.max(0, strength));
  if (s <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* desatura lo de atrás (el video del panel) */}
      <AbsoluteFill style={{ backdropFilter: `grayscale(${s}) contrast(1.05)` }} />
      <AbsoluteFill style={{ opacity: s }}>
        {/* sombras → tinta */}
        <AbsoluteFill style={{ backgroundColor: shadow, mixBlendMode: "lighten" }} />
        {/* luces → papel */}
        <AbsoluteFill style={{ backgroundColor: highlight, mixBlendMode: "darken" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Pareja tinta/papel del duotono por fondo del tema. */
export const DUOTONE_COLORS: Record<string, { shadow: string; highlight: string }> = {
  dark: { shadow: "#171310", highlight: "#f3ede1" },
  ink: { shadow: "#0d1b2a", highlight: "#e9eef5" },
  cream: { shadow: "#2a2118", highlight: "#f5efe3" },
};
