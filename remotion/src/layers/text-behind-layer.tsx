import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { TextBehind } from "../schemas";

/**
 * TEXTO DETRÁS DEL SUJETO — versión MATTE ESTÁTICO (barata, determinista).
 *
 * El efecto "CapCut clásico": una palabra GIGANTE queda DETRÁS de la persona. La
 * versión cara lo hace per-frame (segmentación en cada cuadro → recorte exacto que
 * sigue el movimiento). Esta capa, en cambio, usa UN matte estático: un PNG con alpha
 * del sujeto recortado de un FRAME CLAVE, alineado al frame completo (mismo encuadre
 * que el video). Se compone:
 *
 *     [video base, ya renderizado debajo]   ← lo pone ViralVideo
 *     →  TEXTO grande                        ← este layer, capa media
 *     →  matte del sujeto (PNG con alpha)    ← este layer, capa superior
 *
 * Como el matte cubre la silueta del frame clave, el texto se ve "detrás" de la
 * persona mientras ésta no se mueva demasiado. Es el 80% del efecto al 5% del costo.
 *
 * QUÉ ESPERA DE PYTHON (matteUrl): un PNG RGBA del MISMO tamaño/encuadre que el video
 * (NO recortado al bounding box — eso desalinea). Es decir: rembg sobre un frame del
 * raw, guardado a resolución completa con el sujeto en su posición original y todo lo
 * demás transparente. Ver text_behind_subject.py (sección "matte estático" documentada
 * en build-props/ docs). Si matteUrl viene vacío, el texto igual se dibuja (sin recorte
 * encima) — degradación elegante, nunca rompe el render.
 *
 * ADITIVO: ViralVideo sólo monta esta capa si project.textBehind != null.
 */
export const TextBehindLayer: React.FC<{
  config: TextBehind;
  currentTime: number;
  fontFamily: string;
}> = ({ config, currentTime, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // El efecto puede limitarse a una ventana [at, at+duration]; si duration<=0 dura
  // todo el video (default histórico del estilo text_behind era persistente).
  const windowed = config.duration > 0;
  if (windowed && (currentTime < config.at || currentTime > config.at + config.duration)) {
    return null;
  }

  const elapsed = windowed ? currentTime - config.at : currentTime;
  const localFrame = elapsed * fps;

  // Entrada del texto: spring de escala + leve subida. Si está en ventana, fade-out.
  const enter = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.7 },
  });
  const fadeOut = windowed
    ? Math.min(1, Math.max(0, (config.at + config.duration - currentTime) / 0.4))
    : 1;
  const opacity = Math.min(enter, fadeOut) * (config.textOpacity ?? 1);

  const fontSize = config.size ?? Math.round(width * 0.34);
  const color = config.color?.startsWith("#") ? config.color : `#${config.color || "ffffff"}`;

  const justify =
    config.position === "top" ? "flex-start" : config.position === "bottom" ? "flex-end" : "center";

  // Drift sutil del texto (paralaje) — sólo si no hay matte se nota; con matte da vida.
  const drift = Math.sin(elapsed * 0.6) * 8;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* CAPA MEDIA — el texto gigante, ENTRE el video y el matte del sujeto. */}
      <AbsoluteFill
        style={{
          justifyContent: justify,
          alignItems: "center",
          padding: config.position === "center" ? 0 : "8% 4%",
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize,
            fontWeight: 900,
            lineHeight: 0.9,
            color,
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "-0.02em",
            opacity,
            transform: `translateY(${(1 - enter) * 40 + drift}px) scale(${0.86 + enter * 0.14})`,
            // Sombra dura para legibilidad cuando el matte no cubre todo el texto.
            textShadow: config.shadow
              ? "0 8px 40px rgba(0,0,0,0.55), 0 2px 0 rgba(0,0,0,0.4)"
              : undefined,
            // Contorno opcional (estética CapCut) — stroke vía text-stroke.
            WebkitTextStroke: config.outline
              ? `${Math.max(2, Math.round(fontSize * 0.012))}px ${config.outlineColor || "#000000"}`
              : undefined,
            maxWidth: "94%",
            wordBreak: "break-word",
          }}
        >
          {config.phrase}
        </div>
      </AbsoluteFill>

      {/* CAPA SUPERIOR — matte del sujeto (PNG con alpha) alineado al frame completo.
          Cubre la silueta de la persona → el texto queda "detrás". object-fit:cover
          igual que el video base para que coincidan exactamente. */}
      {config.matteUrl ? (
        <Img
          src={config.matteUrl}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // El matte viene a resolución completa del frame; no se anima (estático).
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
