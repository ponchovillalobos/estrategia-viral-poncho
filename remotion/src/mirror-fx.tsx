/**
 * Mirror / clone / split — efectos tipo CapCut "kaleidoscope" sobre el video base.
 *
 * A diferencia de las transiciones (overlays que no tocan el video), estos efectos
 * SÍ necesitan el video, así que renderizan sus propias copias (muted) de
 * `rawVideoUrl` con transforms durante una ventana de tiempo, cubriendo el base.
 *
 * 100% aditivo: ViralVideo solo monta MirrorFxLayer si `mirrorFx.length > 0`.
 * Con el array vacío (todos los estilos por default) no agrega nada.
 */
import { AbsoluteFill, OffthreadVideo, useVideoConfig } from "remotion";
import { z } from "zod";

export const mirrorFxSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.0),
  kind: z.enum(["mirror_v", "mirror_h", "clone_3", "split_2"]).default("mirror_v"),
});
export type MirrorFxProps = z.infer<typeof mirrorFxSchema>;

interface MirrorFxLayerProps {
  fx: MirrorFxProps[];
  rawVideoUrl: string;
  currentTime: number;
  /** Mismo filtro de color que el video base, para que el efecto matchee el grade. */
  videoFilter?: string;
}

export const MirrorFxLayer: React.FC<MirrorFxLayerProps> = ({
  fx,
  rawVideoUrl,
  currentTime,
  videoFilter,
}) => {
  const { width, height } = useVideoConfig();
  if (!rawVideoUrl) return null;
  const active = fx.find((f) => currentTime >= f.at && currentTime <= f.at + f.duration);
  if (!active) return null;

  const vid = (extra: React.CSSProperties, w: number, h: number) => (
    <OffthreadVideo
      src={rawVideoUrl}
      muted
      style={{ width: w, height: h, objectFit: "cover", filter: videoFilter, ...extra }}
    />
  );

  if (active.kind === "mirror_v") {
    // Eje vertical al centro: izquierda normal, derecha espejada → simetría kaleidoscópica.
    const half = width / 2;
    return (
      <AbsoluteFill style={{ flexDirection: "row", pointerEvents: "none" }}>
        <div style={{ width: half, height, overflow: "hidden" }}>{vid({}, width, height)}</div>
        <div style={{ width: half, height, overflow: "hidden", transform: "scaleX(-1)" }}>
          {vid({}, width, height)}
        </div>
      </AbsoluteFill>
    );
  }

  if (active.kind === "mirror_h") {
    // Eje horizontal: arriba normal, abajo espejado (reflejo tipo agua).
    const half = height / 2;
    return (
      <AbsoluteFill style={{ flexDirection: "column", pointerEvents: "none" }}>
        <div style={{ width, height: half, overflow: "hidden" }}>{vid({}, width, height)}</div>
        <div style={{ width, height: half, overflow: "hidden", transform: "scaleY(-1)" }}>
          {vid({ marginTop: -half }, width, height)}
        </div>
      </AbsoluteFill>
    );
  }

  if (active.kind === "clone_3") {
    // Tríptico: 3 columnas, centro normal, laterales espejados.
    const col = width / 3;
    return (
      <AbsoluteFill style={{ flexDirection: "row", pointerEvents: "none" }}>
        <div style={{ width: col, height, overflow: "hidden", transform: "scaleX(-1)" }}>
          {vid({}, col, height)}
        </div>
        <div style={{ width: col, height, overflow: "hidden" }}>{vid({}, col, height)}</div>
        <div style={{ width: col, height, overflow: "hidden", transform: "scaleX(-1)" }}>
          {vid({}, col, height)}
        </div>
      </AbsoluteFill>
    );
  }

  // split_2 — dos filas idénticas (clon vertical, look "double exposure split").
  const half = height / 2;
  return (
    <AbsoluteFill style={{ flexDirection: "column", pointerEvents: "none" }}>
      <div style={{ width, height: half, overflow: "hidden" }}>{vid({}, width, half)}</div>
      <div style={{ width, height: half, overflow: "hidden" }}>{vid({}, width, half)}</div>
    </AbsoluteFill>
  );
};
