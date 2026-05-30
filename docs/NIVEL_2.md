# Sprint `nivel-2` — más funcionalidad sin tocar lo existente

Este sprint agregó **funcionalidades nuevas** al motor sin modificar el comportamiento
de los estilos anteriores. Todo opt-in, additive, y 100% gratis/local (cero costo
mensual). Respaldo previo: tag `v2-pre-nivel2`.

## Ola 1 — Quick wins de FX (5/5 ✅)

| Item | Qué hace | Cómo activarlo |
|---|---|---|
| **A1** Subtítulos karaoke | Muestra la frase y resalta la palabra activa (look CapCut) | `kineticPreset: "karaoke"` (activado en supreme + broll) |
| **A5** 3 transiciones nuevas | `light_streak` / `swipe_blur` / `iris` en el generador | Auto en cualquier estilo con `proTransitions` |
| **A6** End-screen / CTA | Tarjeta animada en los últimos ~2.5s con tu @handle | `endScreen: {...}` (activado en supreme + broll) |
| **A7** Cortar al ritmo | Reaction-zooms en los beats más fuertes | Activo automático cuando hay beat-sync |
| **A8** Barra + stickers flotando | Barra de progreso + word-stickers con float | `progressBar: true` + animación post-entrada automática |

## Ola 2 — Bancos de assets (2/6 entregados; 4 diferidos)

| Item | Estado | Notas |
|---|---|---|
| **B5** Iconos lucide-react | ✅ | 30 iconos curados (fire/rocket/target/…), offline, MIT |
| **B6** Brand kit / marca de agua | ✅ | Tu @handle (de settings) en una esquina, sutil |
| B1 B-roll multi-fuente | ⏸️ | Necesita key Coverr/Unsplash (postergada) |
| B2 Música Freesound | ⏸️ | Necesita key Freesound (postergada) |
| B3 SFX Freesound | ⏸️ | Necesita key Freesound (postergada) |
| B4 Emojis Lottie animados | ⏸️ | Necesita curar set CC0 (próximo sprint) |

## Ola 3 — FX avanzado (3/3 ✅)

| Item | Qué hace | Cómo activarlo |
|---|---|---|
| **A2** Auto-reframe 16:9→9:16 | Desplaza el video para mantener la cara centrada | `autoReframe: true` (activado en `hype`) |
| **A3** Texto detrás del sujeto | NUEVO estilo. Bake con mediapipe + ffmpeg | Elegir estilo "Texto detrás de vos" en el wizard |
| **A4** Speed ramps | Slow-mo / aceleración por ventanas | `speedRamps: [{at, duration, rate}]` (activado en supreme + hype_max) |

## Ola 4 — IA de contenido local (5/5 ✅)

| Item | Qué hace | Cómo activarlo |
|---|---|---|
| **C1** Voz IA Piper | Locución TTS español, sin descargas extra | `voiceover: { text: "..." }` |
| **C2** Clonar tu voz (XTTS) | TTS con TU voz a partir de una muestra | `voiceover: { text, speakerWav: "ruta.wav" }` |
| **C3** Traducción de captions | Caption traducido a en/pt/fr/... | `translateTo: "en"` |
| **C4** Auto-thumbnail | Frame al 35% (no a 1s) | Automático |
| **C5** Hooks virales | 18 hooks verificados en `viral_hooks.json` | Ya integrado en `generate_caption.py` |

## Ola 5 — Distribución (diferida)

No priorizada por el user. Items para próximos sprints: YouTube Shorts, TikTok directo,
Facebook Reels, Instagram metrics auto, Google Trends.

---

## Modelos/paquetes descargados (gratis, una sola vez)

- **Piper voz ES** (`es_ES-davefx-medium`, ~63MB) → `python/models/piper/`
- **argos-translate ES→EN** (~150MB) → cache de argostranslate
- **XTTS-v2** (~1.8GB) → se descarga **la primera vez** que se llama a `xtts.py`

Todos gitignored.

## Archivos nuevos clave

- **Remotion:** capas `EndScreenLayer`, `BrandWatermarkLayer`, `IconStickerLayer` en `ViralVideo.tsx`;
  preset `karaoke` + helper `groupWordsIntoLines` y 3 transiciones nuevas en `scene-fx.tsx`.
- **Lógica TS:** generadores nuevos (`generateIconStickers`, `generateSpeedRamps`) y opciones
  nuevas en `applyCapcutFx`; nuevo estilo `text_behind` en `style-templates.ts`.
- **Python:** `text_behind_subject.py`, `tts.py`, `xtts.py`, `translate.py`.
- **API:** `/api/voiceover/stream` para servir los WAVs.

## Cómo probar

Renderizá con el estilo **Premium** (supreme) — vas a ver karaoke + end-screen + barra de
progreso + speed ramps + iconos + watermark + transiciones nuevas. O probá el estilo
**"Texto detrás de vos"** para A3. Para C1/C3, editá un project JSON y agregá:

```json
"voiceover": { "text": "Lo que nadie te cuenta", "volume": 0.7 },
"translateTo": "en"
```

Al renderizar, vas a obtener el WAV de voz IA y el caption traducido en el JSON final.
