# Auditoría Suprema + Plan de Mejora — 2026-06-09

> **Estado de ejecución (actualizado 2026-06-09):**
> - ✅ **FASE 0 COMPLETA**: `--concurrency cores-1` en los 3 puntos de render (shorts,
>   auto-build, largos); render de clips de largos PARALELO (pool de 2, env
>   `LF_RENDER_WORKERS`, props file único por clip+estilo); `PYTHONIOENCODING=utf-8`
>   en todos los subprocess; file lock por render (`{id}.__lock`, stale 30 min) +
>   `renameWithRetry` ante locks de OneDrive/antivirus; retención de artefactos
>   (intermedios >24h siempre; renders finales sólo con env
>   `VIRAL_RENDER_RETENTION_DAYS`) con auditoría en `disk-audit.log`; ETA por job en
>   la cola + cancelación individual (`?action=cancel&jobId=`) + fix de cancel-all
>   que dejaba jobs "queued" eternos; **paridad .ts/.mjs**: `graphics: true` agregado
>   a hype/hype_max/hype_max_sfx/supreme de largos, estilos `graphics_pro`/`graphics_max`
>   portados a largos (con generación automática de gráficos cuando el estilo los trae)
>   y test automático `node remotion/check-style-parity.mjs` (exit 1 si divergen).
> - ✅ **Pedido del user**: selector de COLOR de subtítulos en el wizard (paso 3) con
>   9 colores + automático, preview en vivo ("Así se ven TUS subtítulos" con fuente +
>   color + resaltado), guardado en plantillas y cableado hasta el render.
> - ✅ **FASE 1 (núcleo) — DIRECTOR EMOCIONAL**: `python/emotion_director.py` analiza
>   el audio de la voz con librosa (100% local): curva de AROUSAL 0-1 por 0.5s
>   (RMS + onsets, suavizada), PICOS emocionales (top 5, mín 6s entre sí), detección
>   de voz → curva de DUCKING con histéresis (la música baja a 0.35x cuando hay voz
>   y respira SOLO en pausas ≥1.5s — sin "bombeo"), y MOOD global
>   (hype/tension/inspirador/chill/epico) con léxico de valencia en español.
>   Cableado completo: `applyEmotionDirector` en shorts (auto-build) + `_apply_emotion`
>   en largos → el motor Remotion recibe `musicVolumeCurve` (Audio con volumen por
>   frame y rampa de 0.45s), reactionZooms extra en picos (solo estilos dinámicos) y
>   SFX con volumen modulado por el arousal del momento (0.28 calmo → 0.58 intenso).
>   Con jump cuts, la curva se remapea a la línea de tiempo cortada.
>   Verificado con video real de 5 min: mood correcto, 5 picos, ducking limpio
>   (2 respiros reales), still render OK con la curva.
> - ⏳ Pendiente F1 (mejoras): modelo de emoción de voz (SpeechBrain) y detección de
>   risas (PANNs) como señales extra; música elegida por mood (requiere manifest de
>   moods de los tracks CC0).
> - ⏳ Siguiente: FASE 2 (ritmo real: muletillas ES, silence removal con aire,
>   micro punch-ins, hook reorder + loop).

> Auditoría con 6 agentes en paralelo: motor Remotion/FX, pipeline Python/IA,
> frontend/APIs/UX, pipeline de largos, robustez/rendimiento, y estado del arte
> 2025-2026 del mercado (Opus Clip, Submagic, Captions.ai, Descript, CapCut,
> Wisecut, AutoPod) con su equivalente open source 100% local/gratis.

---

## 1. CALIFICACIÓN GLOBAL

| Área | Nota | Lo mejor | Lo peor |
|---|---|---|---|
| **Motor Remotion / FX** | **6.9/10** | Cinematic FX 9/10, subtítulos 8/10, data-viz 8/10 | Tracking 4/10, auto-reframe 3/10, sin motion blur/3D/partículas/LUT dinámico |
| **Pipeline Python / IA** | **5.5/10** | WhisperX 8/10, VAD 7/10, captions LLM 7/10 | SFX matching 3/10 (ciego al contexto), gráficos 4/10, tracking Haar 4/10 |
| **Frontend / Producto** | **5.5/10** | Publicación 1-click, plantillas, multi-select | Sin live preview, sin timeline visual, render serial, sin A/B |
| **Pipeline de largos** | **4.8/10** | Paridad FX ~85% lograda | Render 100% secuencial (80 min/15 clips), divergencia .ts/.mjs (ya pasó una vez), Ollama solo ve texto |
| **Robustez / Ingeniería** | **5.2/10** | Orphan sweep, path traversal protegido, reconciliación de jobs | Código en OneDrive (¡locks!), sin `--concurrency`, sin file locks, tests 3/10 |
| **PROMEDIO** | **5.6/10** | — | Para "supremo" se necesita ≥ 8.5 |

**Veredicto:** la plataforma es la más completa que existe gratis/local en español,
pero hoy es "muy buena automatización con efectos correctos". Para ser **suprema**
le faltan 3 cosas que NADIE da gratis: **inteligencia emocional que dirija la
edición**, **edición de audio/ritmo real** (muletillas, silencios, punch-ins), y
**experiencia de producto** (preview en vivo, velocidad).

---

## 2. HALLAZGOS CLAVE POR ÁREA

### 2.1 Motor Remotion (6.9/10)
- 23 capas/sistemas activos. Springs bien calibrados y consistentes.
- **Huecos top:** sin motion blur en transiciones (se ven "congeladas"); partículas
  primitivas (34 dust con `Math.sin`, sin Perlin/gravedad/confeti/fuego); todo 2D
  (cero `perspective`/`rotateX/Y`); color grading = 3 presets duros (sin LUT por
  frame, sin split-tone); tracking rígido (label no rota con la cara); auto-reframe
  solo eje X sin spring ni zoom compensatorio.
- **Deuda:** `DataVizLayer` recalcula el SVG cada frame sin memo; `sampleTrackX`
  duplicado (ViralVideo.tsx:95 vs tracked-layer.tsx:34); build-props vs
  build-clip-props ~60% duplicados; props de ViralVideo = 50+ campos planos.

### 2.2 Pipeline Python (5.5/10)
- **SFX ciego al contexto:** "perdí dinero" dispara *bling* alegre (match_sfx 3/10).
- **Sin emoción:** nada mide el arousal de la voz; zooms/SFX/música no responden a
  cómo se dice algo, solo a qué se dice.
- **Muletillas:** WhisperX las transcribe pero nadie las corta ("este", "o sea",
  "pues", "eh").
- **Tracking Haar:** falla en silencio con caras giradas >45° o pequeñas.
- **Virality score:** no mide arco emocional ni honestidad del hook (clickbait).
- Bugs concretos: interpolación lineal de timestamps en `--chunked`
  (transcribe.py:206), rescate de JSON de Ollama puede dejar clips sin `end`
  (analyze_clips.py:195), fuzzy SFX matchea "expo"→"explosión" (≥0.83).

### 2.3 Frontend / Producto (5.5/10)
- **Crítico:** no hay **live preview** (se renderiza a ciegas: 5-25 min para ver el
  resultado) ni **timeline visual** (el editor edita listas de números).
- Cola sin ETA ni cancelación individual; batch = serial puro.
- Scheduler de publicaciones **guarda fechas pero no existe el daemon que dispara**.
- Sin A/B de variantes ni métricas por estilo.
- 74 endpoints con validación inconsistente (sin zod en inputs).

### 2.4 Largos (4.8/10)
- Faltan en largos: **b-roll, beat-sync, remove-bg, graphics_pro/max**; kinetic
  presets desincronizados (faltan glow_pulse/type_on en .mjs).
- 15 clips ≈ 80 min secuenciales → con 3 renders paralelos serían ~25 min.
- Timestamps acumulan ±0.6-0.9s de error (chunked sin align + re-transcripción).
- **Divergencia .ts/.mjs es estructural** — ya ocurrió en 2026-06. Solución
  recomendada: spec JSON compartido + generadores comunes (8-10h).

### 2.5 Robustez (5.2/10)
- **El código vive en OneDrive** → locks de sync pueden matar renders en silencio.
- Remotion sin `--concurrency` (CPU desaprovechado 3-4x).
- Sin file lock por render (riesgo de `__rendering.mp4` corrupto).
- Subprocess Python sin `PYTHONIOENCODING=utf-8` (riesgo cp1252 con acentos).
- Renders viejos jamás se purgan (solo huérfanos) → disco crece sin límite.
- Tests: solo 3 suites; cola/render/largos = 0% cobertura.

### 2.6 Mercado 2025-2026 (qué dan los líderes y nadie da gratis)
| Feature de pago | Quién | Réplica local |
|---|---|---|
| Filler-word removal | Descript | WhisperX + diccionario español + corte ffmpeg |
| Magic zooms / punch-ins | Submagic | Énfasis (audio energy) → zoom 5-10% Remotion |
| Música + ducking por emoción | Wisecut | SpeechBrain emotion (Apache) + librosa + `sidechaincompress` |
| AI B-roll por contexto | Opus Clip | OpenCLIP local + biblioteca CC0 indexada |
| Multicam auto-switching | AutoPod $29/mes | sherpa-onnx diarización + Light-ASD |
| Edit-for-clarity / hook reorder | Descript | Ollama elige la frase top → segundo 0 + loop perfecto |
| Studio sound | Descript/Adobe | DeepFilterNet (MIT, CPU tiempo real) |
| Detección risas/aplausos | — (nadie) | PANNs CNN14 (AudioSet) |

**Patrón clave robado de FunClip (Alibaba, MIT):** pedirle al LLM *spans de texto
exactos* y mapearlos a timestamps localmente — mucho más robusto que pedirle
timestamps (que Ollama inventa).

**Tendencias de formato 2026:** hook con texto en <1.5s, micro punch-ins en vez de
cortes duros, captions 1-3 palabras karaoke, audio táctil (SFX al entrar texto),
loop perfecto (fin empalma con inicio), lo-fi auténtico + motion graphics
puntuales, voz 1.05-1.15x con silencios fuera.

---

## 3. PLAN DE MEJORA "SUPREMO" (6 fases)

> Regla intacta: **cero API keys**. Todo open source / modelos locales / GitHub raw.
> Cada fase termina con tsc=0, render de prueba real y commit.

### FASE 0 — Cimientos (≈1 semana) — *sin esto, lo demás se cae*
| # | Acción | Impacto |
|---|---|---|
| 0.1 | `--concurrency cores-1` en todos los spawns de Remotion | Renders 3-4x más rápidos GRATIS |
| 0.2 | Paralelizar clips de largos (pool de 2-3 renders) | 80 min → ~25 min por lote |
| 0.3 | `PYTHONIOENCODING=utf-8` en run-process + file lock por render (`.lock`) | Mata bugs de acentos y MP4 corruptos |
| 0.4 | Detección de lock OneDrive antes de render (o `VIRAL_PROJECT_ROOT` fuera de OneDrive) | Elimina fallas silenciosas |
| 0.5 | Unificar estilos .ts/.mjs: spec JSON compartido + generadores + test de equivalencia | Mata la divergencia para siempre |
| 0.6 | Retención de renders (env `VIRAL_RENDER_RETENTION_DAYS`, default 30) + aviso de disco | Disco nunca se llena |
| 0.7 | ETA en cola (duración × factor por estilo) + cancelar job individual | UX inmediata |

### FASE 1 — Motor de Retención Emocional (≈2 semanas) — *el diferenciador #1 mundial*
Nadie (ni de pago) modula la edición frame a frame según la emoción de la voz.
| # | Acción | Lib |
|---|---|---|
| 1.1 | Curva de arousal/energía por segundo del audio | librosa RMS + onsets (ya instalado) |
| 1.2 | Emoción de voz por frase (hype/calma/tensión/alegría) | SpeechBrain wav2vec2-IEMOCAP (Apache, CPU) |
| 1.3 | Detección de risas/aplausos/gritos → highlights automáticos | PANNs CNN14 |
| 1.4 | **Director emocional**: la curva dirige zooms (intensidad), SFX (densidad), música (mood + ducking `sidechaincompress`), color (saturación), duración de tarjetas fullscreen | nuevo `python/emotion_director.py` → campos en project JSON |
| 1.5 | SFX context-aware (sentimiento de la frase → bling vs error) | diccionario + sentiment local |
| 1.6 | Música por mood del clip (ya hay 54 tracks agrupados) + cortes alineados a beat (detect_beats ya existe, no se usa) | librosa |
| 1.7 | Virality v2: arco emocional + honestidad del hook + penalizar muletillas | virality.py |

### FASE 2 — Edición de ritmo real (≈1-2 semanas) — *lo que Descript cobra*
| # | Acción | Detalle |
|---|---|---|
| 2.1 | **Quitar muletillas en español** (único en el mercado hispano) | WhisperX word-level + diccionario ("este…", "o sea", "pues", "eh", "¿no?") + corte ffmpeg con 0.2s de aire (patrón auto-editor) |
| 2.2 | Silence removal pro con margen natural | Silero VAD ya existe; distinguir pausa dramática (pre-revelación) de silencio muerto usando la curva de arousal de Fase 1 |
| 2.3 | **Micro punch-ins automáticos** en énfasis (tendencia 2026: zoom 5-10% > corte duro) | energía de voz → zoomMarks |
| 2.4 | **Hook reordering + loop perfecto**: Ollama devuelve el *texto exacto* de la frase más viral (patrón FunClip), se mueve al segundo 0, y el final empalma con el inicio | analyze_clips + build-props |
| 2.5 | Voz 1.05-1.1x opcional (estándar de los líderes) | ffmpeg atempo |
| 2.6 | Subtítulos fuera de la cara (usa face_bbox que ya existe) | build-props |
| 2.7 | Studio sound: limpiar voz | DeepFilterNet (MIT, CPU) |

### FASE 3 — Motor visual supremo (≈2 semanas)
| # | Acción |
|---|---|
| 3.1 | Motion blur en transiciones (CameraMotionBlur con shutter variable) |
| 3.2 | Sistema de partículas (Perlin con @remotion/noise ya importado): confeti, chispas, humo, lluvia de emojis |
| 3.3 | 3D: `perspective` + `rotateX/Y` en transiciones, mirror, tarjetas y headlines |
| 3.4 | LUT/color dinámico por frame (interpolación de grading + split-tone) — conectar con el director emocional |
| 3.5 | Máscaras animadas (reveal círculo/forma sobre video, no solo `inset()`) |
| 3.6 | Tracking v2: YuNet/retinaface en vez de Haar + rotación del label con la cara + auto-reframe en Y con spring y zoom compensatorio |
| 3.7 | Memoizar SVG de DataVizLayer + extraer utils de animación compartidos |

### FASE 4 — Producto supremo (≈2-3 semanas)
| # | Acción |
|---|---|
| 4.1 | **Live preview con @remotion/player** embebido en el wizard/editor: ver el video CON efectos al instante, sin renderizar (el mayor salto de UX posible — los props ya existen) |
| 4.2 | Timeline visual (canvas: palabras, FX, música, charts; arrastrar para mover) |
| 4.3 | Preview por estilo en el wizard (Player con 3s del video real en cada tarjeta de estilo) |
| 4.4 | Scheduler daemon real (dispara publicaciones programadas + retry) |
| 4.5 | Batch paralelo de jobs (CPU-aware) + validación zod en endpoints |
| 4.6 | Undo/redo en el editor + indicador de cambios sin guardar |
| 4.7 | Tests de cola/render/sweep (crash → recovery) |

### FASE 5 — Frontera (≈3-4 semanas, GPU recomendada para 5.2)
| # | Acción |
|---|---|
| 5.1 | **B-roll inteligente local**: OpenCLIP indexa biblioteca CC0 (descarga GitHub raw) → matching frase↔clip por embeddings. Lo que Opus cobra. |
| 5.2 | B-roll **generativo** offline: FLUX.1-schnell (Apache) imágenes + Ken Burns; video Wan2.1-1.3B si hay GPU |
| 5.3 | **Multicam auto-switching** (sherpa-onnx diarización sin token + Light-ASD): "AutoPod gratis en español", no existe en el mundo |
| 5.4 | Clips de largos v2: segmentación por temas (patrón ClipsAI) + señales de audio de Fase 1 + spans de texto exactos (FunClip) → fin de timestamps inventados |
| 5.5 | Scene detection + scoring estético (PySceneDetect/TransNetV2 + LAION aesthetic) para elegir mejores tomas |

---

## 4. LOS 5 DIFERENCIADORES "NUNCA ANTES VISTOS"

1. **Director emocional** (Fase 1): la emoción de la voz dirige zoom/SFX/música/color frame a frame. Nadie lo hace, ni pagando.
2. **Muletillas en español nativo** (2.1): Descript las detecta mal en español; esto sería único en el mercado hispano.
3. **Hook reordering + loop perfecto** (2.4): Descript hace lo primero pagando; la combinación con loop no la hace nadie.
4. **Multicam auto-switching gratis** (5.3): hoy solo AutoPod ($29/mes) y Descript.
5. **B-roll generativo 100% offline** (5.2): Opus lo cobra caro y en cloud.

## 5. ORDEN RECOMENDADO

**Fase 0 → 1 → 2** (≈4-5 semanas) ya pone la plataforma por delante de todo lo
gratis y a la par de lo de pago en inteligencia. **3 → 4** la hace verse y sentirse
suprema. **5** la vuelve incomparable.

Quick wins de esta semana (≤1 día c/u): 0.1, 0.2, 0.3, 0.7, 1.6 (beat-sync ya
existe sin usar), 2.3, 2.6.
