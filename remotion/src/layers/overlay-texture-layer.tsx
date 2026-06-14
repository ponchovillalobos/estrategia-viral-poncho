/**
 * OverlayTextureLayer — compone una TEXTURA procedural (assets/overlays/*.png:
 * grano, polvo, scratches, light-leak…) sobre TODO el video con mixBlendMode
 * configurable por proyecto.
 *
 * 100% ADITIVA y opt-in: ViralVideo solo monta esta capa si `overlayTexture` no es
 * null. Un proyecto sin el campo renderiza IDÉNTICO al histórico.
 *
 *   - "screen"     → aclara (light-leaks, polvo brillante): el negro = transparente
 *   - "overlay"    → sube contraste (grano filmico)
 *   - "soft-light" → grano suave
 *   - "multiply"   → oscurece (viñetas, scratches oscuros)
 *   - "lighten"    → toma lo más claro
 *
 * La textura es un único <img> a pantalla completa — barato de render y sin estado.
 */
import { AbsoluteFill } from "remotion";
import type { OverlayTexture } from "../schemas";

export const OverlayTextureLayer: React.FC<{ overlay: OverlayTexture }> = ({
  overlay,
}) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <img
        src={overlay.url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: overlay.cover ? "cover" : "fill",
          mixBlendMode: overlay.blendMode,
          opacity: overlay.opacity,
        }}
      />
    </AbsoluteFill>
  );
};
