import { lazy, Suspense, useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { EditorialMap } from "./editorial-globe-schema";
import type { EditorialLayout, PanelRect } from "./editorial-layer";

/**
 * Carga LAZY del globo editorial (Ola 7).
 *
 * editorial-globe.tsx arrastra d3-geo + topojson-client + world-atlas (~8MB de mapa
 * Natural Earth). El 99% de los proyectos NO usan el globo, así que no tiene sentido
 * meter ese peso en el bundle inicial de cada render/preview. Con React.lazy el chunk
 * del globo sólo se descarga cuando ViralVideo monta esta capa (hay un editorialMap
 * activo en ese frame).
 *
 * RENDER DETERMINISTA (server-side renderMedia): React.lazy resuelve desde un chunk
 * LOCAL del bundle (no red), pero el import dinámico es asíncrono. Para que Remotion no
 * capture el frame ANTES de que el componente esté montado, envolvemos con delayRender:
 * el handle se libera (continueRender) recién cuando el módulo cargó (LazyGlobeLoader se
 * monta dentro del Suspense, después de que el import resolvió). Así el primer frame con
 * globo nunca sale en blanco.
 */

const LazyGlobe = lazy(() =>
  import("./editorial-globe").then((m) => ({ default: m.EditorialGlobeLayer }))
);

/** Se monta SOLO cuando el chunk ya cargó (está dentro del Suspense, no en el fallback).
 *  Al montar libera el delayRender del padre (en un effect, tras commit). */
const ReleaseOnReady: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
};

export const EditorialGlobeLazy: React.FC<{
  map: EditorialMap;
  currentTime: number;
  layout: EditorialLayout;
  width: number;
  height: number;
  panel?: PanelRect | null;
}> = (props) => {
  // delayRender pausa la captura del frame hasta que el chunk del globo montó.
  const [handle] = useState(() => delayRender("editorial globe (lazy chunk)"));
  return (
    <Suspense fallback={null}>
      <ReleaseOnReady onReady={() => continueRender(handle)} />
      <LazyGlobe {...props} />
    </Suspense>
  );
};
