# Rendimiento adaptativo — auditoría 2026-06-10

La app se **adapta sola al hardware de cada equipo** (CPU, RAM, GPU). No hay nada
que configurar: detecta una vez, cachea 7 días y elige el camino más rápido que
ese equipo soporta, siempre con calidad máxima en lo que ve el usuario.

## El detector: `python/hw_profile.py`

Detecta y cachea en `<data>/cache/hw_profile.json`:

| Qué | Cómo | Para qué |
|---|---|---|
| CPU cores + RAM | `os.cpu_count()` + API de Windows | concurrencia de renders |
| GPU NVIDIA | `nvidia-smi` | habilitar caminos GPU |
| NVENC funcional | **encode REAL de prueba** (8 frames sintéticos) — que ffmpeg "liste" nvenc no garantiza que el driver funcione | encoder de video |
| torch CUDA | `torch.cuda.is_available()` | WhisperX en GPU |

CLI de diagnóstico: `python hw_profile.py` (fuerza re-detección e imprime el perfil).

## Qué se adapta

1. **Encoder de video (ffmpeg)** — `ffmpeg_video_args(quality)`:
   - Con GPU NVIDIA funcional → `h264_nvenc` (3-8x más rápido que x264, calidad
     equivalente: p5 + cq 19 + AQ espacial/temporal ≈ x264 crf 18).
   - Sin GPU → `libx264` (final: crf 18 preset fast / intermedios: ultrafast).
   - Aplica en: corte de silencios, extracción de clips de largos (3 encodes),
     color grade LUT post-render, quitar-fondo y texto-detrás-del-sujeto.
2. **WhisperX (transcripción)** — GPU con torch CUDA → `cuda + float16 + batch 16`
   (5-10x más rápido); si no → `cpu + int8 + batch 8`. Aplica a shorts y al modo
   chunked de largos.
   - Nota: el requirements instala torch CPU (liviano). Quien tenga NVIDIA puede
     instalar torch CUDA en el venv y la app lo usa sola.
3. **Renders de Remotion en paralelo (largos)** — escala con los cores:
   4 cores → 1 worker, 8 → 2, 16+ → 3 (antes era fijo 2: sobre-suscribía equipos
   chicos y desperdiciaba los grandes). El `--concurrency` interno de cada render
   reparte `cores-1` entre los workers.
4. **Concurrency de Remotion (shorts)** — ya era `min(8, cores-1)` (el tope de 8
   evita ahogar el dev server que sirve el video con delayRender timeouts).

## Overrides (env) — para diagnosticar, no hacen falta

| Env | Efecto |
|---|---|
| `VIRAL_FORCE_X264=1` | ignora NVENC aunque exista |
| `VIRAL_WHISPER_DEVICE=cpu\|cuda` | fuerza device de WhisperX |
| `VIRAL_WHISPER_COMPUTE_TYPE` | fuerza compute_type (gana al adaptativo) |
| `LF_RENDER_WORKERS=1..4` | fuerza workers de largos |
| `VIRAL_REMOTION_CONCURRENCY` | fuerza concurrency de Remotion |

## Resultado de la auditoría (qué se encontró y arregló)

- ❌→✅ WhisperX clavado en CPU aunque hubiera GPU → device adaptativo.
- ❌→✅ Todos los encodes ffmpeg por software (libx264) → NVENC auto-detectado
  con prueba real de driver.
- ❌→✅ Workers de largos fijos en 2 (lento en 16+ cores, sobre-suscrito en 4) →
  escala 1/2/3 según cores.
- ✅ Remotion shorts ya era adaptativo (cores-1, tope 8 justificado por HTTP).
- ✅ Calidad final intacta en todos los caminos: crf 18 / cq 19 (extrema).
- Verificado en esta máquina (20 cores, sin NVIDIA): perfil correcto, encodes
  final/fast OK, transcripción E2E real (211 palabras en 88.5s) OK.
