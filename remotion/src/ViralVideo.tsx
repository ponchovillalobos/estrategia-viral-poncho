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
import {
  Flame, Rocket, Target, Lightbulb, Heart, Star, Zap, TrendingUp, ThumbsUp, Eye,
  Crown, Sparkles, Brain, MessageCircle, DollarSign, Award, Bell, CheckCircle,
  AlertTriangle, Music, Camera, Film, Hash, Bookmark, Share2, Play, Coffee, Smile,
  Gem, Sun,
} from "lucide-react";

// B5 — Iconos curados (lucide-react, offline, MIT). Cualquier sticker puede pedir un
// icono por NOMBRE — si no está en el mapa, se cae a un fallback (Sparkles).
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  fire: Flame, rocket: Rocket, target: Target, lightbulb: Lightbulb, heart: Heart,
  star: Star, zap: Zap, trending: TrendingUp, thumbsup: ThumbsUp, eye: Eye,
  crown: Crown, sparkles: Sparkles, brain: Brain, message: MessageCircle,
  money: DollarSign, award: Award, bell: Bell, check: CheckCircle, warn: AlertTriangle,
  music: Music, camera: Camera, film: Film, hash: Hash, bookmark: Bookmark,
  share: Share2, play: Play, coffee: Coffee, smile: Smile, gem: Gem, sun: Sun,
};

const { fontFamily: BEBAS } = loadBebas();
const { fontFamily: ANTON } = loadAnton();

const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

const bRollSchema = z.object({
  start: z.number(),
  end: z.number(),
  url: z.string(),
});

const animationSchema = z.object({
  at: z.number(),
  type: z.enum(["zoom", "glow", "shake"]),
});

const emphasisCardSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.9),
  word: z.string(),
  emoji: z.string(),
  bg: z.string().default("#09090b"),
  color: z.string().default("#fafafa"),
  accent: z.string().default("#34d399"),
});

const zoomMarkSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.6),
  scale: z.number().default(1.15),
});

const wordStickerSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.1),
  word: z.string(),
  emoji: z.string(),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "top-center"])
    .default("top-right"),
  rotation: z.number().default(-5),
  bg: z.string().default("#fbbf24"),
  color: z.string().default("#0a0a0a"),
});

const floatingEmojiSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.2),
  emoji: z.string(),
  from: z.enum(["left", "right", "top", "bottom"]).default("left"),
  size: z.number().default(180),
  yOffset: z.number().default(0),
});

const reactionZoomSchema = z.object({
  at: z.number(),
  intensity: z.number().default(1.4),
  duration: z.number().default(0.25),
});

const stutterMarkSchema = z.object({
  at: z.number(),
  duration: z.number().default(0.2),
});

const sfxMarkSchema = z.object({
  at: z.number(),
  sound: z.string(),
  url: z.string().optional(),
  volume: z.number().default(0.4),
});

// A6 — End-screen / CTA: tarjeta animada en los últimos `durationSec` del video.
const endScreenSchema = z.object({
  text: z.string().default("Seguime para más"),
  handle: z.string().default(""),
  emoji: z.string().default("🔥"),
  durationSec: z.number().default(2.5),
  bg: z.string().default("#0a0a0a"),
  accent: z.string().default("#34d399"),
});

// A4 — Speed ramp: ventana donde se overlay-ea el source playing a `rate` < 1 (slow-mo)
// o > 1 (acelerado). El video base sigue corriendo a 1x debajo; al terminar la ventana
// reaparece. La duración total del video NO cambia.
const speedRampSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.5),
  rate: z.number().default(0.5),
});

// B5 — Icon sticker: aparece N segundos con un icono del ICON_MAP + bg circular opcional.
const iconStickerSchema = z.object({
  at: z.number(),
  duration: z.number().default(1.1),
  icon: z.string().default("sparkles"),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "top-center"])
    .default("top-right"),
  color: z.string().default("#0a0a0a"),
  bg: z.string().default("#fbbf24"),
  size: z.number().default(120),
});

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

// B6 — Brand kit / marca de agua: handle (y/o logo) sutil en una esquina, todo el video.
const brandKitSchema = z.object({
  handle: z.string().default(""),
  logoUrl: z.string().default(""),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right"])
    .default("bottom-right"),
  opacity: z.number().default(0.55),
  color: z.string().default("#ffffff"),
});

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

// B5 — Icon sticker: render de un icono lucide con bg circular animado.
const IconStickerLayer: React.FC<{
  sticker: z.infer<typeof iconStickerSchema>;
  currentTime: number;
}> = ({ sticker, currentTime }) => {
  const elapsed = currentTime - sticker.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 10, stiffness: 260, mass: 0.5 },
  });
  const exitStart = sticker.duration - 0.2;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.2 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const Icon = ICON_MAP[sticker.icon.toLowerCase()] ?? Sparkles;
  const floatY = Math.sin(elapsed * 2.2) * 5;
  const wobbleRot = Math.sin(elapsed * 1.6) * 3;
  // Posicionamiento por esquina/center con padding seguro.
  const pad = 80;
  const isTop = sticker.position.startsWith("top");
  const isLeft = sticker.position.endsWith("left");
  const isCenter = sticker.position === "top-center";
  const justify = isCenter ? "center" : isLeft ? "flex-start" : "flex-end";
  const align = isTop ? "flex-start" : "flex-end";
  const padTop = isCenter ? 160 : pad;
  const diameter = sticker.size + 36;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: align,
        alignItems: justify,
        padding: pad,
        paddingTop: padTop,
        opacity,
      }}
    >
      <div
        style={{
          width: diameter,
          height: diameter,
          borderRadius: "50%",
          background: sticker.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 16px 40px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,255,255,0.1) inset",
          transform: `translateY(${floatY}px) scale(${enter}) rotate(${wobbleRot}deg)`,
        }}
      >
        <Icon size={sticker.size} color={sticker.color} strokeWidth={2.4} />
      </div>
    </AbsoluteFill>
  );
};

// B6 — Marca de agua: handle (y/o logo) fijo en una esquina, opacidad sutil.
const BrandWatermarkLayer: React.FC<{
  config: z.infer<typeof brandKitSchema>;
  fontFamily: string;
}> = ({ config, fontFamily }) => {
  const isTop = config.position.startsWith("top");
  const isLeft = config.position.endsWith("left");
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: isTop ? "flex-start" : "flex-end",
        alignItems: isLeft ? "flex-start" : "flex-end",
        padding: 48,
        opacity: config.opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {config.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logoUrl} alt="" style={{ height: 56, width: "auto" }} />
        ) : null}
        {config.handle ? (
          <span
            style={{
              fontFamily,
              fontSize: 36,
              fontWeight: 700,
              color: config.color,
              letterSpacing: "0.04em",
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
            }}
          >
            {config.handle.startsWith("@") ? config.handle : `@${config.handle}`}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// A6 — End-screen / CTA: aparece en los últimos `durationSec` con entrada animada.
const EndScreenLayer: React.FC<{
  config: z.infer<typeof endScreenSchema>;
  currentTime: number;
  totalDuration: number;
  fps: number;
  fontFamily: string;
}> = ({ config, currentTime, totalDuration, fps, fontFamily }) => {
  const startAt = totalDuration - config.durationSec;
  if (currentTime < startAt) return null;
  const elapsed = currentTime - startAt;
  const enter = spring({
    frame: Math.max(0, elapsed * fps),
    fps,
    config: { damping: 16, stiffness: 140, mass: 0.7 },
  });
  const scale = 0.7 + enter * 0.3;
  return (
    <AbsoluteFill
      style={{
        background: `${config.bg}f2`,
        backdropFilter: "blur(14px)",
        justifyContent: "center",
        alignItems: "center",
        opacity: Math.min(1, elapsed / 0.25),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          transform: `scale(${scale})`,
        }}
      >
        <div style={{ fontSize: 200, lineHeight: 1, filter: `drop-shadow(0 12px 50px ${config.accent}66)` }}>
          {config.emoji}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 120,
            fontWeight: 900,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            lineHeight: 1.0,
            textAlign: "center",
            padding: "0 60px",
            maxWidth: 980,
            textShadow: `0 0 70px ${config.accent}88`,
          }}
        >
          {config.text}
        </div>
        {config.handle ? (
          <div
            style={{
              fontFamily,
              fontSize: 56,
              fontWeight: 700,
              color: config.accent,
              letterSpacing: "0.04em",
            }}
          >
            {config.handle.startsWith("@") ? config.handle : `@${config.handle}`}
          </div>
        ) : null}
        <div
          style={{
            height: 8,
            width: 220 * enter,
            background: config.accent,
            borderRadius: 4,
            boxShadow: `0 0 30px ${config.accent}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const PipBRollLayer: React.FC<{ url: string; accent: string }> = ({
  url,
  accent,
}) => {
  // Layout responsivo: en 1080×1920 (vertical) → PiP de 540×720 con padding-bottom 480.
  // En 16:9 (1920×1080) escala proporcionalmente para que el PiP quede en posición útil.
  const { width: compWidth, height: compHeight } = useVideoConfig();
  const pipWidth = Math.min(compWidth * 0.5, 540);
  const pipHeight = Math.min(compHeight * 0.375, 720);
  const paddingBottom = compHeight * 0.25;
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom,
      }}
    >
      <div
        style={{
          width: pipWidth,
          height: pipHeight,
          borderRadius: 28,
          overflow: "hidden",
          border: `5px solid ${accent}`,
          boxShadow: `0 0 60px ${accent}55, 0 12px 40px rgba(0,0,0,0.7)`,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <OffthreadVideo
          src={url}
          muted
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const FloatingEmojiLayer: React.FC<{
  emoji: z.infer<typeof floatingEmojiSchema>;
  currentTime: number;
}> = ({ emoji, currentTime }) => {
  const elapsed = currentTime - emoji.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 12, stiffness: 180, mass: 0.6 },
  });
  const exitStart = emoji.duration - 0.25;
  const exitProgress =
    elapsed > exitStart ? (elapsed - exitStart) / 0.25 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const offBlock = 200;
  let tx = 0;
  let ty = emoji.yOffset;
  if (emoji.from === "left") tx = -offBlock + enter * offBlock;
  else if (emoji.from === "right") tx = offBlock - enter * offBlock;
  else if (emoji.from === "top") ty = emoji.yOffset - offBlock + enter * offBlock;
  else ty = emoji.yOffset + offBlock - enter * offBlock;

  const wobble = Math.sin(elapsed * 6) * 8;

  // En flexDirection:row → justifyContent controla el eje X, alignItems el Y.
  // Antes estaban invertidos: emojis con from="left" terminaban arriba en vez de a la izquierda.
  const horizontalAlign =
    emoji.from === "left" ? "flex-start" : emoji.from === "right" ? "flex-end" : "center";

  return (
    <AbsoluteFill
      style={{
        justifyContent: horizontalAlign,
        alignItems: "center",
        flexDirection: "row",
        padding: "0 80px",
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: emoji.size,
          lineHeight: 1,
          transform: `translate(${tx}px, ${ty + wobble}px) rotate(${
            (Math.sin(elapsed * 4) - 0.5) * 8
          }deg)`,
          filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.55))",
        }}
      >
        {emoji.emoji}
      </div>
    </AbsoluteFill>
  );
};

const WordStickerLayer: React.FC<{
  sticker: z.infer<typeof wordStickerSchema>;
  currentTime: number;
  fontFamily: string;
}> = ({ sticker, currentTime, fontFamily }) => {
  const elapsed = currentTime - sticker.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 10, stiffness: 280, mass: 0.5 },
  });
  const exitStart = sticker.duration - 0.2;
  const exitProgress =
    elapsed > exitStart ? (elapsed - exitStart) / 0.2 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Forzamos siempre top-center para que el sticker nunca quede recortado
  // por bordes del frame y nunca tape PiP/B-roll que va abajo. Ignoramos
  // sticker.position de los JSONs viejos.
  // Dimensiones responsivas: 1080×1920 → top 180, availableWidth 720.
  // En 16:9 (1920×1080) → top escala con height, availableWidth con compWidth.
  const { width: compWidth, height: compHeight } = useVideoConfig();
  const positionStyles: React.CSSProperties = {
    top: compHeight * 0.094,
    left: "50%",
    transform: "translateX(-50%)",
  };

  const availableWidth = compWidth * 0.667;
  const charFactor = 0.55;
  const sizeByWidth =
    availableWidth / Math.max(1, sticker.word.length * charFactor);
  // Tope superior escala con compWidth para mantener legibilidad
  const wordSize = Math.min(
    Math.floor(compWidth * 0.102),
    Math.max(56, Math.floor(sizeByWidth))
  );

  // A8 — animación post-entrada: el sticker flota suave (drift Y) y oscila apenas su
  // rotación, en vez de quedar congelado tras la entrada. Sutil para no distraer.
  const floatY = Math.sin(elapsed * 2.2) * 6;
  const wobbleRot = Math.sin(elapsed * 1.6) * 2;

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        opacity,
        transform: `${
          positionStyles.transform ?? ""
        } translateY(${floatY}px) scale(${enter}) rotate(${sticker.rotation + wobbleRot}deg)`,
        transformOrigin: "center",
      }}
    >
      <div
        style={{
          background: sticker.bg,
          color: sticker.color,
          padding: "18px 28px",
          borderRadius: 18,
          fontFamily,
          fontSize: wordSize,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          gap: 18,
          boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 0 4px rgba(255,255,255,0.08) inset",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: wordSize * 0.85 }}>{sticker.emoji}</span>
        <span>{sticker.word}</span>
      </div>
    </div>
  );
};

interface EmphasisCardLayerProps {
  card: z.infer<typeof emphasisCardSchema>;
  currentTime: number;
  fontFamily: string;
}

const EmphasisCardLayer: React.FC<EmphasisCardLayerProps> = ({
  card,
  currentTime,
  fontFamily,
}) => {
  const elapsed = currentTime - card.at;
  const enter = spring({
    frame: Math.max(0, elapsed * 30),
    fps: 30,
    config: { damping: 14, stiffness: 220, mass: 0.5 },
  });
  const exitStart = card.duration - 0.18;
  const exitProgress = elapsed > exitStart ? (elapsed - exitStart) / 0.18 : 0;
  const opacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = 0.6 + enter * 0.4;
  // Dimensiones responsivas: 1080×1920 → emoji 360, availableWidth 960 (1080 - 120 padding).
  // En 16:9 (1920×1080) escala con compWidth manteniendo proporciones.
  const { width: compWidth } = useVideoConfig();
  const emojiSize = Math.floor(compWidth * 0.333);
  const availableWidth = compWidth - 120;
  const charFactor = 0.55;
  const maxByWidth = availableWidth / Math.max(1, card.word.length * charFactor);
  const wordSize = Math.min(
    Math.floor(compWidth * 0.204),
    Math.max(90, Math.floor(maxByWidth))
  );

  return (
    <AbsoluteFill
      style={{
        background: `${card.bg}f5`,
        backdropFilter: "blur(12px)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontSize: emojiSize,
            lineHeight: 1,
            filter: `drop-shadow(0 12px 60px ${card.accent}66)`,
          }}
        >
          {card.emoji}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: wordSize,
            fontWeight: 900,
            color: card.color,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            lineHeight: 1,
            textAlign: "center",
            padding: "0 60px",
            maxWidth: "100%",
            whiteSpace: "nowrap",
            textShadow: `0 0 80px ${card.accent}88`,
            background: `linear-gradient(180deg, ${card.color} 0%, ${card.accent} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {card.word}
        </div>
        <div
          style={{
            height: 8,
            width: 200 * enter,
            background: card.accent,
            borderRadius: 4,
            boxShadow: `0 0 30px ${card.accent}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

interface SubtitleLayerProps {
  words: ViralVideoProps["words"];
  currentTime: number;
  fps: number;
  fontFamily: string;
  color: string;
  highlight: string;
  colorRotation?: string[];
  bounce?: boolean;
  /** Si es "cinematic", usa estilo de cine: letter-spacing wide, glow sutil, posición distinta */
  subtitleStyle?: "bebas" | "anton" | "cinematic";
}

const SubtitleLayer: React.FC<SubtitleLayerProps> = ({
  words,
  currentTime,
  fps,
  fontFamily,
  color,
  highlight,
  colorRotation = [],
  bounce = false,
  subtitleStyle = "bebas",
}) => {
  // Tomar SOLO la palabra activa (o la más reciente que ya empezó).
  // Cada palabra se mantiene visible hasta que arranque la siguiente.
  let activeIndex = -1;
  for (let idx = 0; idx < words.length; idx++) {
    if (words[idx].start <= currentTime + 0.05) activeIndex = idx;
    else break;
  }
  if (activeIndex === -1) return null;

  const word = words[activeIndex];
  const next = words[activeIndex + 1];
  const startsAt = word.start;
  const endsAt = next ? next.start - 0.04 : word.end + 1.5;

  if (currentTime > endsAt + 0.1) return null;

  const elapsed = currentTime - startsAt;
  const remaining = endsAt - currentTime;

  // Fade in 0.08s · fade out 0.06s
  const fadeIn = Math.min(1, Math.max(0, elapsed / 0.08));
  const fadeOut = Math.min(1, Math.max(0, remaining / 0.06));
  const opacity = Math.min(fadeIn, fadeOut);

  // Bounce opcional: pop scale (1.08 → 1.0) en los primeros 0.18s. Sin bounce: scale fijo 1.
  let scale = 1;
  if (bounce && elapsed < 0.18) {
    const t = elapsed / 0.18;
    scale = 1 + 0.08 * Math.sin(Math.PI * t);
  }

  const wordColor =
    colorRotation.length > 0
      ? colorRotation[activeIndex % colorRotation.length]
      : highlight;
  // Sin color rotation, la palabra activa usa el highlight; subtitleColor queda
  // reservado para subtítulos no-activos (no se muestran en este modo).
  void color;

  // ──────────────────────────────────────────────────────────────────────────
  // Estilo CINEMATOGRÁFICO de subtítulos:
  //   - Fuente Anton, peso 600 (más light que normal para feeling cine)
  //   - BLANCO PURO (#FFFFFF) — no off-white. Solicitado explícitamente.
  //   - letter-spacing 0.18em (más ancho)
  //   - text-transform: none (no all-caps — más cinematográfico)
  //   - Glow sutil + sombra suave para legibilidad sobre cualquier escena
  //   - Posición un poco más arriba (paddingBottom 220 vs 320 normal)
  // ──────────────────────────────────────────────────────────────────────────
  const isCinematic = subtitleStyle === "cinematic";

  // F7 SUPREME — Entrada animada con spring + glow del color highlight.
  // Reemplaza el bounce simple por un spring suave de scale + translateY que
  // simula la entrada cinematográfica de cada palabra. El glow es drop-shadow
  // del color highlight (accent) — visible pero no choca con el shadow negro.
  const entryFrame = elapsed * fps;
  const entrySpring = isCinematic
    ? spring({
        frame: entryFrame,
        fps,
        config: { damping: 14, stiffness: 110, mass: 0.7 },
      })
    : 1;
  const cinematicScale = isCinematic ? 0.88 + entrySpring * 0.12 : 1;
  const cinematicTranslateY = isCinematic ? (1 - entrySpring) * 28 : 0;
  // MAX OUT — glow EXTREMO triple capa del color highlight
  const cinematicGlow = isCinematic
    ? `drop-shadow(0 0 40px ${highlight}) drop-shadow(0 0 20px ${highlight}cc) drop-shadow(0 0 8px rgba(0,0,0,1)) drop-shadow(0 5px 30px rgba(0,0,0,1))`
    : undefined;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: isCinematic ? 220 : 320,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: isCinematic ? 96 : 110,
          fontWeight: isCinematic ? 700 : 800,
          color: isCinematic ? "#ffffff" : wordColor,
          textTransform: isCinematic ? "none" : "uppercase",
          letterSpacing: isCinematic ? "0.22em" : "0.02em",
          lineHeight: 1.0,
          textAlign: "center",
          maxWidth: 980,
          padding: "0 50px",
          whiteSpace: "nowrap",
          textShadow: isCinematic
            ? // Sombra mínima: el glow ya hace drop-shadow del color, el black es para legibilidad
              "0 2px 14px rgba(0,0,0,0.85)"
            : "0 4px 22px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
          filter: cinematicGlow,
          opacity,
          transform: isCinematic
            ? `scale(${cinematicScale * scale}) translateY(${cinematicTranslateY}px)`
            : `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {word.word}
      </div>
    </AbsoluteFill>
  );
};
