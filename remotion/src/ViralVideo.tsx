import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { z } from "zod";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { CameraMotionBlur } from "@remotion/motion-blur";
import {
  ImageOverlayLayer,
  FilmGrainLayer,
  useCameraMoveTransform,
  imageOverlaySchema,
  cameraMoveSchema,
} from "./cinematic-layers";
import {
  SceneFxLayer,
  ProTransitionLayer,
  KineticSubtitleLayer,
  sceneFxSchema,
  proTransitionSchema,
  kineticPresetSchema,
} from "./scene-fx";
import { MirrorFxLayer, mirrorFxSchema } from "./mirror-fx";
import { TrackedLayer, trackPointSchema, trackedItemSchema } from "./tracked-layer";
import { BrandWatermarkLayer } from "./layers/brand-watermark-layer";
import { IconStickerLayer } from "./layers/icon-sticker-layer";
import { EndScreenLayer } from "./layers/end-screen-layer";
import { PipBRollLayer } from "./layers/pip-broll-layer";
import { FloatingEmojiLayer } from "./layers/floating-emoji-layer";
import { WordStickerLayer } from "./layers/word-sticker-layer";
import { EmphasisCardLayer } from "./layers/emphasis-card-layer";
import { SubtitleLayer } from "./layers/subtitle-layer";

const { fontFamily: BEBAS } = loadBebas();
const { fontFamily: ANTON } = loadAnton();

import {
  wordSchema,
  bRollSchema,
  animationSchema,
  emphasisCardSchema,
  zoomMarkSchema,
  wordStickerSchema,
  floatingEmojiSchema,
  reactionZoomSchema,
  stutterMarkSchema,
  sfxMarkSchema,
  endScreenSchema,
  speedRampSchema,
  iconStickerSchema,
  brandKitSchema,
  dataVizSchema,
  kineticHeadlineSchema,
} from "./schemas";
import { DataVizLayer } from "./layers/data-viz-layer";
import { KineticHeadlineLayer } from "./layers/kinetic-headline-layer";

/**
 * A2 — Interpolación lineal de la posición X de la cara a un tiempo dado, en el espacio
 * normalizado 0..1 del trackPath. Igual lógica que sampleAt() en tracked-layer, pero
 * inline para no acoplar este archivo al otro.
 */
function sampleTrackX(path: { t: number; x: number }[], t: number): number {
  if (path.length === 0) return 0.5;
  if (t <= path[0].t) return path[0].x;
  const last = path[path.length - 1];
  if (t >= last.t) return last.x;
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1];
      const b = path[i];
      const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
      return a.x + (b.x - a.x) * f;
    }
  }
  return last.x;
}

// brandKitSchema (B6) vive ahora en ./schemas.

export const viralVideoSchema = z.object({
  rawVideoUrl: z.string(),
  videoDurationSec: z.number().default(30),
  words: z.array(wordSchema).default([]),
  bRoll: z.array(bRollSchema).default([]),
  musicUrl: z.string().nullable().default(null),
  musicVolume: z.number().default(0.15),
  subtitleStyle: z.enum(["bebas", "anton", "cinematic"]).default("bebas"),
  subtitleColor: z.string().default("#ffffff"),
  subtitleHighlight: z.string().default("#34d399"),
  animations: z.array(animationSchema).default([]),
  emphasisCards: z.array(emphasisCardSchema).default([]),
  bRollMode: z.enum(["fullscreen", "pip"]).default("fullscreen"),
  zoomMarks: z.array(zoomMarkSchema).default([]),
  wordStickers: z.array(wordStickerSchema).default([]),
  floatingEmojis: z.array(floatingEmojiSchema).default([]),
  colorRotation: z.array(z.string()).default([]),
  vignette: z.boolean().default(false),
  reactionZooms: z.array(reactionZoomSchema).default([]),
  stutterMarks: z.array(stutterMarkSchema).default([]),
  captionBounce: z.boolean().default(false),
  sfxMarks: z.array(sfxMarkSchema).default([]),
  // Modo cinematográfico — opt-in. Defaults vacíos/falsos = render idéntico a antes.
  imageOverlays: z.array(imageOverlaySchema).default([]),
  cameraMoves: z.array(cameraMoveSchema).default([]),
  filmGrain: z.boolean().default(false),
  // F3 SUPREME — densidad cinematográfica para mood-aware color grading.
  // low=KODAK warm, medium=FUJI cool, high=BLEACH thriller.
  cinematicDensity: z.enum(["low", "medium", "high"]).default("medium"),
  // === CapCut Pro FX (opt-in, ADITIVO) — defaults vacíos/"none" = render idéntico ===
  sceneFx: z.array(sceneFxSchema).default([]),
  proTransitions: z.array(proTransitionSchema).default([]),
  kineticPreset: kineticPresetSchema,
  mirrorFx: z.array(mirrorFxSchema).default([]),
  trackPath: z.array(trackPointSchema).default([]),
  trackedItems: z.array(trackedItemSchema).default([]),
  // A6/A8/B6/B5 — opt-in. null/false/[] = render idéntico.
  endScreen: endScreenSchema.nullable().default(null),
  progressBar: z.boolean().default(false),
  brandKit: brandKitSchema.nullable().default(null),
  iconStickers: z.array(iconStickerSchema).default([]),
  speedRamps: z.array(speedRampSchema).default([]),
  // C1 — Voz IA (Piper). Opt-in: si voiceoverUrl viene, se monta una pista de audio
  // extra (encima de music+sfx+raw). Default null = sin voiceover, render idéntico.
  voiceoverUrl: z.string().nullable().default(null),
  voiceoverVolume: z.number().default(0.7),
  voiceoverStartSec: z.number().default(0),
  // A2 — Auto-reframe 16:9 → 9:16 siguiendo al sujeto. Si autoReframe=true y hay trackPath
  // poblado, ViralVideo desplaza el video horizontalmente para mantener la cara centrada
  // sin perder altura. sourceAspect = ancho/alto del source (default 16/9).
  autoReframe: z.boolean().default(false),
  sourceAspect: z.number().default(16 / 9),
  // Dimensiones del composition — Root.tsx las lee vía calculateMetadata.
  // Default vertical 9:16. Pasar {width:1920, height:1080} para horizontal 16:9.
  width: z.number().default(1080),
  height: z.number().default(1920),
  // === MODO GRÁFICOS & MOTION (opt-in) — charts animados + titulares poderosos. ===
  // Defaults [] = render idéntico. Cada elemento tiene su ventana [at, at+duration].
  dataViz: z.array(dataVizSchema).default([]),
  kineticHeadlines: z.array(kineticHeadlineSchema).default([]),
});

type ViralVideoProps = z.infer<typeof viralVideoSchema>;

export const defaultProps: ViralVideoProps = {
  rawVideoUrl: "",
  videoDurationSec: 30,
  words: [],
  bRoll: [],
  musicUrl: null,
  musicVolume: 0.15,
  subtitleStyle: "bebas",
  subtitleColor: "#ffffff",
  subtitleHighlight: "#34d399",
  animations: [],
  emphasisCards: [],
  bRollMode: "fullscreen",
  zoomMarks: [],
  wordStickers: [],
  floatingEmojis: [],
  colorRotation: [],
  vignette: false,
  reactionZooms: [],
  stutterMarks: [],
  captionBounce: false,
  sfxMarks: [],
  imageOverlays: [],
  cameraMoves: [],
  filmGrain: false,
  cinematicDensity: "medium",
  sceneFx: [],
  proTransitions: [],
  kineticPreset: "none",
  mirrorFx: [],
  trackPath: [],
  trackedItems: [],
  endScreen: null,
  progressBar: false,
  brandKit: null,
  iconStickers: [],
  speedRamps: [],
  voiceoverUrl: null,
  voiceoverVolume: 0.7,
  voiceoverStartSec: 0,
  autoReframe: false,
  sourceAspect: 16 / 9,
  width: 1080,
  height: 1920,
  dataViz: [],
  kineticHeadlines: [],
};

export const ViralVideo: React.FC<ViralVideoProps> = ({
  rawVideoUrl,
  words,
  bRoll,
  musicUrl,
  musicVolume,
  subtitleStyle,
  subtitleColor,
  subtitleHighlight,
  animations,
  emphasisCards,
  bRollMode,
  zoomMarks,
  wordStickers,
  floatingEmojis,
  colorRotation,
  vignette,
  reactionZooms,
  stutterMarks,
  captionBounce,
  sfxMarks,
  imageOverlays,
  cameraMoves,
  filmGrain,
  cinematicDensity,
  sceneFx,
  proTransitions,
  kineticPreset,
  mirrorFx,
  trackPath,
  trackedItems,
  endScreen,
  progressBar,
  brandKit,
  iconStickers,
  speedRamps,
  voiceoverUrl,
  voiceoverVolume,
  voiceoverStartSec,
  autoReframe,
  sourceAspect,
  dataViz,
  kineticHeadlines,
}) => {
  // Modo cinematic detection: se activa con CUALQUIERA de estas señales:
  //   - subtitleStyle="cinematic" explícito (toggle "Subtítulos cine"), O
  //   - filmGrain activo (el user pidió look cine), O
  //   - hay imageOverlays con timestamps (modo cinematográfico funcional)
  // Si alguna está, se aplican TODAS las mejoras visuales:
  //   - Imágenes fullscreen con TV grain siempre activo + Ken Burns amplio
  //   - Camera moves sobre el video base
  //   - Color grading sutil (contrast/saturation tipo cine)
  // Para los estilos legacy (bebas/anton sin overlays/grain) el render queda IDÉNTICO.
  const isCinematicMode =
    subtitleStyle === "cinematic" || filmGrain || imageOverlays.length > 0;
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width: compWidth, height: compHeight } = useVideoConfig();
  const currentTime = frame / fps;
  const totalDuration = durationInFrames / fps;

  // A2 — Auto-reframe: si el source es más ancho que el frame, desplazar horizontalmente
  // para mantener la cara centrada. Sólo aplica con autoReframe=true + trackPath poblado +
  // frame vertical (9:16) + source más ancho que el frame.
  let autoReframeTranslateX = 0;
  if (
    autoReframe &&
    trackPath.length > 0 &&
    compHeight > compWidth &&
    sourceAspect > compWidth / compHeight
  ) {
    const faceX = sampleTrackX(trackPath, currentTime);
    // objectFit:cover escala el source para que el alto = compHeight; el ancho excede.
    const renderedSourceWidth = compHeight * sourceAspect;
    const maxOffset = (renderedSourceWidth - compWidth) / 2;
    const desired = -(faceX - 0.5) * renderedSourceWidth;
    autoReframeTranslateX = Math.max(-maxOffset, Math.min(maxOffset, desired));
  }

  const activeAnim = animations.find(
    (a) => currentTime >= a.at && currentTime <= a.at + 0.5
  );
  const activeEmphasis = emphasisCards.find(
    (c) => currentTime >= c.at && currentTime <= c.at + c.duration
  );
  const activeZoom = zoomMarks.find(
    (z) => currentTime >= z.at && currentTime <= z.at + z.duration
  );

  const activeReactionZoom = reactionZooms.find(
    (z) => currentTime >= z.at && currentTime <= z.at + z.duration
  );
  const activeStutter = stutterMarks.find(
    (s) => currentTime >= s.at && currentTime <= s.at + s.duration
  );

  let scale = 1;
  if (activeReactionZoom) {
    const t = (currentTime - activeReactionZoom.at) / activeReactionZoom.duration;
    // Punch: subida rápida 0-0.3, sostén 0.3-0.7, bajada rápida 0.7-1
    const punch =
      t < 0.3 ? t / 0.3 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    scale = 1 + (activeReactionZoom.intensity - 1) * punch;
  } else if (activeZoom) {
    const t = (currentTime - activeZoom.at) / activeZoom.duration;
    const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    scale = 1 + (activeZoom.scale - 1) * bell;
  } else if (activeAnim?.type === "zoom") {
    scale = interpolate(currentTime - activeAnim.at, [0, 0.25, 0.5], [1, 1.08, 1]);
  }

  let shake = 0;
  if (activeReactionZoom) {
    const t = (currentTime - activeReactionZoom.at) / activeReactionZoom.duration;
    shake = Math.sin(t * 80) * 14 * (1 - Math.abs(t - 0.5) * 1.5);
  } else if (activeStutter) {
    const t = currentTime - activeStutter.at;
    // Shake X violento alta frecuencia
    shake = Math.sin(t * 180) * 18;
  } else if (activeAnim?.type === "shake") {
    shake = Math.sin((currentTime - activeAnim.at) * 60) * 6;
  }

  // bebas usa BEBAS, anton + cinematic usan ANTON (cinematic agrega styling extra).
  const fontFamily = subtitleStyle === "bebas" ? BEBAS : ANTON;
  const fullscreenBRoll = bRollMode === "fullscreen";

  // CameraMoves sobre el video base — SOLO activo en modo cinematic.
  // useCameraMoveTransform respeta la regla de hooks: siempre llamar.
  const cameraMove = useCameraMoveTransform(isCinematicMode ? cameraMoves : []);
  const baseScale = scale * cameraMove.scale;
  const baseTranslateX = shake + cameraMove.translateX + autoReframeTranslateX;
  const baseTranslateY = cameraMove.translateY;

  // F3 SUPREME — Color grading PROFESIONAL según densidad (mood-aware).
  // Antes: contrast(1.05) saturate(0.92) — imperceptible.
  // Ahora: 3 moods cinematográficos (KODAK warm / FUJI cool / BLEACH thriller)
  // según cinematicDensity, recibido del project. Diferencia visible entre A/B/C.
  // MAX OUT — color grading extremo para ver el techo. Calibrable después.
  const videoFilter = isCinematicMode
    ? cinematicDensity === "low"
      ? // KODAK ULTRA WARM — naranja casi quemado
        "contrast(1.6) saturate(0.6) brightness(0.85) hue-rotate(-8deg) sepia(0.25)"
      : cinematicDensity === "high"
      ? // BLEACH BYPASS EXTREMO — casi blanco y negro con tinte azul
        "contrast(1.95) saturate(0.12) brightness(0.82) hue-rotate(-10deg)"
      : // FUJI ULTRA COOL — teal/cyan muy marcado
        "contrast(1.55) saturate(0.6) brightness(0.88) hue-rotate(18deg)"
    : undefined;

  // F2 SUPREME — Motion blur OFICIAL de Remotion (regla 180° cine).
  // Solo activo cuando hay un camera move ACTIVO en ese frame (cameraMove.scale!=1
  // o translate!=0). Sin esto, CameraMotionBlur no agrega costo CPU porque no
  // detecta movimiento.
  const hasActiveCameraMotion =
    isCinematicMode &&
    (Math.abs(cameraMove.scale - 1) > 0.001 ||
      Math.abs(cameraMove.translateX) > 0.5 ||
      Math.abs(cameraMove.translateY) > 0.5);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${baseScale}) translate(${baseTranslateX}px, ${baseTranslateY}px)`,
        }}
      >
        {rawVideoUrl && (
          hasActiveCameraMotion ? (
            // MAX OUT (calibrado) — shutterAngle 270° + 15 samples (25 samples reventaba)
            <CameraMotionBlur shutterAngle={270} samples={15}>
              <OffthreadVideo
                src={rawVideoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: videoFilter,
                }}
              />
            </CameraMotionBlur>
          ) : (
            <OffthreadVideo
              src={rawVideoUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: videoFilter,
              }}
            />
          )
        )}
      </AbsoluteFill>

      {/* A4 — Speed ramps: ventanas donde se overlay-ea el source a rate < 1 (slow-mo)
          o > 1 (acelerado), tapando el base 1x debajo. Audio mute para no doblar. */}
      {speedRamps.map((r, i) => {
        const fromFrame = Math.round(r.at * fps);
        const winFrames = Math.max(1, Math.round(r.duration * fps));
        return (
          <Sequence key={`sr-${i}`} from={fromFrame} durationInFrames={winFrames}>
            <AbsoluteFill
              style={{
                transform: `scale(${baseScale}) translate(${baseTranslateX}px, ${baseTranslateY}px)`,
              }}
            >
              {rawVideoUrl && (
                <OffthreadVideo
                  src={rawVideoUrl}
                  startFrom={fromFrame}
                  playbackRate={r.rate}
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: videoFilter,
                  }}
                />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {fullscreenBRoll &&
        bRoll.map((clip, i) => (
          <Sequence
            key={i}
            from={Math.floor(clip.start * fps)}
            durationInFrames={Math.ceil((clip.end - clip.start) * fps)}
          >
            <AbsoluteFill>
              <OffthreadVideo src={clip.url} muted />
            </AbsoluteFill>
          </Sequence>
        ))}

      {!fullscreenBRoll &&
        bRoll.map((clip, i) => (
          <Sequence
            key={i}
            from={Math.floor(clip.start * fps)}
            durationInFrames={Math.ceil((clip.end - clip.start) * fps)}
          >
            <PipBRollLayer url={clip.url} accent={subtitleHighlight} />
          </Sequence>
        ))}

      {/* Mirror/clone/split — cubre el video base durante su ventana, debajo de
          subtítulos/stickers. Solo monta si mirrorFx trae datos (aditivo). */}
      {mirrorFx.length > 0 && (
        <MirrorFxLayer
          fx={mirrorFx}
          rawVideoUrl={rawVideoUrl}
          currentTime={currentTime}
          videoFilter={videoFilter}
        />
      )}

      {vignette && (
        <AbsoluteFill
          style={{
            background: isCinematicMode
              ? // MAX OUT — vignette extrema, bordes prácticamente negros
                "radial-gradient(ellipse 75% 55% at center, transparent 15%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.99) 95%, rgba(0,0,0,1) 100%)"
              : "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
            pointerEvents: "none",
          }}
        />
      )}

      {activeAnim?.type === "glow" && (
        <AbsoluteFill
          style={{
            boxShadow: `inset 0 0 200px ${subtitleHighlight}`,
            mixBlendMode: "screen",
            opacity: 0.6,
          }}
        />
      )}

      {/* MAX OUT — Flash 8 frames blancos + Glitch RGB en TODOS los density */}
      {isCinematicMode && activeStutter && (() => {
        const stutterFrame = Math.round((currentTime - activeStutter.at) * fps);
        // Flash: 8 frames con decay (1.0, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1)
        const flashRamp = [1.0, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1];
        const flashOpacity = stutterFrame < flashRamp.length ? flashRamp[stutterFrame] : 0;
        // RGB glitch: TODOS los density, 12 frames con magnitud 30px (era 12)
        const showGlitch = stutterFrame < 12;
        const glitchMag = stutterFrame < 12 ? 30 - (stutterFrame * 2) : 0;
        return (
          <>
            {flashOpacity > 0 && (
              <AbsoluteFill
                style={{
                  background: "white",
                  opacity: flashOpacity,
                  pointerEvents: "none",
                }}
              />
            )}
            {showGlitch && (
              <AbsoluteFill
                style={{
                  pointerEvents: "none",
                  mixBlendMode: "screen",
                  opacity: 0.95,
                  filter: `drop-shadow(${(stutterFrame % 2 === 0 ? glitchMag : -glitchMag)}px 0 0 rgba(255,0,0,1)) drop-shadow(${(stutterFrame % 2 === 0 ? -glitchMag : glitchMag)}px 0 0 rgba(0,255,255,1)) drop-shadow(0 ${glitchMag * 0.5}px 0 rgba(255,255,0,0.6))`,
                  background:
                    "linear-gradient(180deg, transparent 0%, transparent 100%)",
                }}
              />
            )}
          </>
        );
      })()}

      {/* Subtítulo: con kineticPreset "none" se usa el SubtitleLayer de siempre.
          Los estilos que eligen un preset cinético montan KineticSubtitleLayer en su lugar. */}
      {kineticPreset === "none" ? (
        <SubtitleLayer
          words={words}
          currentTime={currentTime}
          fps={fps}
          fontFamily={fontFamily}
          color={subtitleColor}
          highlight={subtitleHighlight}
          colorRotation={colorRotation}
          bounce={captionBounce}
          subtitleStyle={subtitleStyle}
        />
      ) : (
        <KineticSubtitleLayer
          words={words}
          currentTime={currentTime}
          fps={fps}
          preset={kineticPreset}
          fontFamily={fontFamily}
          color={subtitleColor}
          highlight={subtitleHighlight}
        />
      )}

      {floatingEmojis
        .filter(
          (e) => currentTime >= e.at - 0.05 && currentTime <= e.at + e.duration
        )
        .map((e, i) => {
          // Si hay sticker top-center activo y el emoji venía de 'top', redirigir a 'left' para no chocar.
          const topStickerActive = wordStickers.some(
            (s) =>
              s.position === "top-center" &&
              currentTime >= s.at &&
              currentTime <= s.at + s.duration
          );
          const safeEmoji =
            e.from === "top" && topStickerActive
              ? { ...e, from: "left" as const }
              : e;
          return (
            <FloatingEmojiLayer
              key={`fe-${i}`}
              emoji={safeEmoji}
              currentTime={currentTime}
            />
          );
        })}

      {wordStickers
        .map((s, i, arr) => {
          // Cortar la duración si el siguiente sticker arranca antes.
          const next = arr[i + 1];
          const effectiveEnd =
            next && next.at < s.at + s.duration
              ? next.at - 0.05
              : s.at + s.duration;
          return { sticker: s, effectiveEnd, index: i };
        })
        .filter(
          ({ sticker, effectiveEnd }) =>
            currentTime >= sticker.at - 0.05 && currentTime <= effectiveEnd
        )
        .map(({ sticker, effectiveEnd, index }) => (
          <WordStickerLayer
            key={`ws-${index}`}
            sticker={{ ...sticker, duration: effectiveEnd - sticker.at }}
            currentTime={currentTime}
            fontFamily={fontFamily}
          />
        ))}

      {/* B5 — Icon stickers: aparecen N segundos con un icono del ICON_MAP. Aditivo. */}
      {iconStickers
        .filter((s) => currentTime >= s.at - 0.05 && currentTime <= s.at + s.duration)
        .map((s, i) => (
          <IconStickerLayer key={`is-${i}-${s.at}`} sticker={s} currentTime={currentTime} />
        ))}

      {activeEmphasis && (
        <EmphasisCardLayer
          card={activeEmphasis}
          currentTime={currentTime}
          fontFamily={fontFamily}
        />
      )}

      {sfxMarks.map((sfx, i) => {
        const startFrame = Math.max(0, Math.floor(sfx.at * fps));
        return (
          <Sequence
            key={`sfx-${i}-${sfx.at}`}
            from={startFrame}
            durationInFrames={Math.max(1, Math.ceil(3 * fps))}
          >
            <Audio src={sfx.url ?? sfx.sound} volume={sfx.volume} />
          </Sequence>
        );
      })}

      {musicUrl && <Audio src={musicUrl} volume={musicVolume} />}

      {/* C1 — Voz IA (Piper): pista de audio extra. Arranca en voiceoverStartSec. */}
      {voiceoverUrl && (
        <Sequence from={Math.max(0, Math.round(voiceoverStartSec * fps))}>
          <Audio src={voiceoverUrl} volume={voiceoverVolume} />
        </Sequence>
      )}

      {/* === Modo cinematográfico (opt-in vía imageOverlays/filmGrain/vignette) === */}
      {/* Cuando isCinematicMode=true → imágenes FULLSCREEN + TV grain siempre + Ken Burns amplio */}
      <ImageOverlayLayer overlays={imageOverlays} fullscreenCinematic={isCinematicMode} />
      <FilmGrainLayer enabled={filmGrain} />

      {/* === CapCut Pro FX (opt-in, ADITIVO) — solo montan si traen datos === */}
      {sceneFx.length > 0 && <SceneFxLayer fx={sceneFx} currentTime={currentTime} />}
      {proTransitions.length > 0 && (
        <ProTransitionLayer
          transitions={proTransitions}
          currentTime={currentTime}
          fps={fps}
        />
      )}

      {/* Motion tracking — label que sigue la cara. Encima de todo. Aditivo. */}
      {trackPath.length > 0 && trackedItems.length > 0 && (
        <TrackedLayer
          trackPath={trackPath}
          items={trackedItems}
          currentTime={currentTime}
          fontFamily={fontFamily}
        />
      )}

      {/* MODO GRÁFICOS & MOTION — gráficas animadas (counter/bar/line/donut). Aditivo. */}
      {dataViz.map((dv, i) => (
        <DataVizLayer
          key={`dv-${i}`}
          config={dv}
          currentTime={currentTime}
          fps={fps}
          fontFamily={fontFamily}
        />
      ))}

      {/* MODO GRÁFICOS & MOTION — titulares poderosos animados. Aditivo. */}
      {kineticHeadlines.map((kh, i) => (
        <KineticHeadlineLayer
          key={`kh-${i}`}
          config={kh}
          currentTime={currentTime}
          fps={fps}
          fontFamily={fontFamily}
        />
      ))}

      {/* A8 — Barra de progreso (opt-in). Encima de todo, no tapa nada. */}
      {progressBar && (
        <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "flex-start" }}>
          <div
            style={{
              height: 8,
              width: `${Math.min(100, (frame / Math.max(1, durationInFrames)) * 100)}%`,
              background: subtitleHighlight,
              boxShadow: `0 0 16px ${subtitleHighlight}`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* A6 — End-screen / CTA en los últimos segundos. Encima de todo. Aditivo. */}
      {endScreen && (
        <EndScreenLayer
          config={endScreen}
          currentTime={currentTime}
          totalDuration={totalDuration}
          fps={fps}
          fontFamily={fontFamily}
        />
      )}

      {/* B6 — Marca de agua (handle/logo) sutil en una esquina, todo el video. Aditivo. */}
      {brandKit && (brandKit.handle || brandKit.logoUrl) && (
        <BrandWatermarkLayer config={brandKit} fontFamily={fontFamily} />
      )}
    </AbsoluteFill>
  );
};

// IconStickerLayer vive ahora en ./layers/icon-sticker-layer.

// EndScreenLayer vive ahora en ./layers/end-screen-layer.

// PipBRollLayer vive ahora en ./layers/pip-broll-layer.

// FloatingEmojiLayer vive ahora en ./layers/floating-emoji-layer.

// WordStickerLayer vive ahora en ./layers/word-sticker-layer.

// EmphasisCardLayer vive ahora en ./layers/emphasis-card-layer.

// SubtitleLayer vive ahora en ./layers/subtitle-layer.
