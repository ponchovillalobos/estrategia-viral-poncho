import { lazy, Suspense, useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { LottieAnimationData } from "@remotion/lottie";

/**
 * Carga LAZY del componente <Lottie> de @remotion/lottie (que arrastra lottie-web,
 * ~24MB). Sólo los proyectos con stickers Lottie / ilustraciones animadas lo usan, así
 * que no debe entrar al bundle inicial de cada render/preview.
 *
 * NOTA de tipos: importamos `LottieAnimationData` con `import type` — eso NO emite código
 * (no arrastra lottie-web al bundle), sólo el tipo. El runtime de lottie-web entra recién
 * por el `import()` dinámico del chunk.
 *
 * RENDER DETERMINISTA: igual que el globo lazy — delayRender pausa la captura hasta que
 * el chunk montó; @remotion/lottie ya gestiona su propio delayRender para la PREPARACIÓN
 * de la animación (frames), así que entre los dos el primer frame nunca sale en blanco.
 */

const LazyLottieImpl = lazy(() =>
  import("@remotion/lottie").then((m) => ({ default: m.Lottie }))
);

const ReleaseOnReady: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
};

export const LottieLazy: React.FC<{
  animationData: LottieAnimationData;
  loop?: boolean;
}> = ({ animationData, loop = true }) => {
  const [handle] = useState(() => delayRender("lottie-web (lazy chunk)"));
  return (
    <Suspense fallback={null}>
      <ReleaseOnReady onReady={() => continueRender(handle)} />
      <LazyLottieImpl animationData={animationData} loop={loop} />
    </Suspense>
  );
};
