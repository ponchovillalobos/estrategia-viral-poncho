# Estrategia Viral Poncho

Sistema local de **planificación + edición automática + publicación** de contenido viral
para redes sociales, enfocado en español (LATAM) y el nicho **comunicación · persuasión ·
ventas · IA**.

Combina tres piezas:

- **Dashboard Next.js 16** (React 19, Tailwind 4) — plan editorial, producción, métricas.
- **Motor de video Remotion v4** — composición programática estilo MrBeast/Hormozi/CapCut.
- **Pipeline Python local** (WhisperX + silero-vad + OpenCV/MediaPipe + ffmpeg) — transcribe,
  corta silencios, detecta beats, trackea la cara, quita fondo.

Todo corre **local y headless** (sin servicios pagos por uso): dejás un MP4, y sale un short
vertical con subtítulos animados, SFX, color de cine, transiciones pro y caption viral —
listo para publicar en **LinkedIn** e **Instagram** desde la misma app.

> Estado: proyecto personal hecho público para que otros lo puedan usar y adaptar. Ver
> [Licencia](#licencia).

---

## Qué hace

1. **Plan editorial** — calendario de 30 días por red con hooks, hashtags, horarios óptimos y KPIs.
2. **Edición automática de shorts** — dejás un MP4 en `raw/`, y el sistema:
   transcribe (WhisperX, palabra por palabra), corta silencios (silero-vad), agrega
   subtítulos animados, stickers, emojis, zooms rítmicos, jump cuts, **SFX coordinados al
   transcript**, color grading, film grain, vignette y motion blur — con **estilos predefinidos**.
3. **Efectos "nivel CapCut"** (nativos, headless) — LUTs reales (ffmpeg `lut3d`), light leaks /
   bokeh / dust, **9 transiciones pro** (whip / glitch / reveal / flash / light-streak / swipe-blur / iris / …),
   **tipografía cinética + karaoke palabra-por-palabra**, mirror / clone / split, **cortar al
   ritmo (beat-sync)**, **motion tracking** (labels que siguen la cara), **quitar fondo con IA**,
   **speed ramps** (slow-mo viral), **end-screen / CTA**, marca de agua de tu @handle,
   barra de progreso, icon stickers (Lucide). Ver [`docs/EFFECTS.md`](./docs/EFFECTS.md) y
   [`docs/NIVEL_2.md`](./docs/NIVEL_2.md).
4. **Auto-reframe 16:9 → 9:16** — toma una grabación horizontal y la convierte en short
   vertical desplazando la cámara para mantener la cara centrada (face-tracking).
5. **Texto detrás del sujeto** (estilo CapCut clásico) — bake en Python con mediapipe + ffmpeg
   de la palabra clave detrás de la persona, como un nuevo estilo del wizard.
6. **B-roll automático de Pexels** — dos estilos (`B-roll Full` / `B-roll PIP`) que buscan
   videos según las keywords del transcript y los insertan a tiempo.
7. **Voz IA local (opt-in)** — locución con [Piper](https://github.com/rhasspy/piper) (voz
   ES default) o **clonar tu propia voz** con XTTS-v2 (Coqui TTS) a partir de una muestra de
   ~6s. Sin costo, todo local.
8. **Traducción de captions** (opt-in) — paquetes [argos-translate](https://github.com/argosopentech/argos-translate)
   ES→EN/PT/… para publicar el mismo video en audiencias multi-idioma. Offline.
9. **Cursos largos → clips virales** — dejás un video de 1h y genera (a) un MP4 limpio sin
   silencios y (b) varios clips de 30-60s con momentos virales detectados por LLM local.
10. **Publicación a redes** — **LinkedIn** (API oficial, auto-publicación de video) e
    **Instagram** (Graph API, Reels). Ver [`docs/SOCIAL_PUBLISHING.md`](./docs/SOCIAL_PUBLISHING.md).
11. **Métricas** — entrada manual por red con gráficas; sync automático de métricas de LinkedIn.

---

## Stack y costo

- 100% open source / gratis con cuenta. **Único requerido:** una API key gratis de Pexels.
- Captions virales vía **CLIs por OAuth** (Claude Code / Codex con tu suscripción) o **Ollama**
  local como fallback — sin API keys.
- Corre en una laptop Windows 11 con Node, Python 3.11 y ffmpeg portable.

---

## Tests

```bash
cd frontend
npm test          # vitest run — corre la suite
npm run test:watch  # vitest watch — TDD
```

El proyecto tiene tests unitarios para los helpers críticos (parser de stdout de scripts
Python, etc.) y smoke tests end-to-end de las rutas HTTP. Cada commit del refactor pasó
`tsc --noEmit` + tests + smoke de rutas (200) antes de mergearse.

## Inicio rápido (máquina nueva)

```powershell
# 1. Instalar: Node 20+, Python 3.11, Git, ffmpeg (ver PREREQUISITES.md / docs/SETUP.md)

# 2. Clonar
git clone <url> Estrategia_Viral_Poncho
cd Estrategia_Viral_Poncho

# 3. Dependencias
cd frontend; npm install; cd ..
cd remotion; npm install; cd ..
python -m venv python/venv
python/venv/Scripts/python.exe -m pip install -r python/requirements.txt   # whisperx, silero-vad, opencv, mediapipe, librosa, etc.

# 4. Config local — copiá el template y poné tu Pexels key (gratis, sin tarjeta)
copy frontend\.env.local.example frontend\.env.local
#    → editá PEXELS_API_KEY en https://www.pexels.com/api/new/

# 5. Assets que NO van en el repo (se generan/descargan):
node remotion/generate-luts.mjs                  # LUTs de color → remotion/public/luts/*.cube
#    Modelo de quitar-fondo (opcional, ~250 KB):
curl -sL -o python/models/selfie_segmenter.tflite \
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

# 6. Arrancar
cd frontend
npm run dev      # → http://localhost:3000
```

> **ffmpeg**: el pipeline lo busca en `{DATA_ROOT}/../tools/ffmpeg-*/bin/` o en el `PATH`.
> Bajá el build "essentials" de gyan.dev y descomprimilo ahí, o seteá `VIRAL_FFMPEG_EXE`.

---

## Flujo básico de uso

1. Pegá un MP4 en `<DATA_ROOT>/raw/` (default `C:\hermes-data\videos\raw\`).
2. Abrí `http://localhost:3000/editor` → aparece el video. Renombralo (✏️) si querés.
3. Usá el **Wizard** (`/editor/wizard`): elegís video(s), estilo, color y plataformas → render.
4. El render sale en `<DATA_ROOT>/renders/`. En **Producción** generás el caption (✨) y publicás.

Detalle paso a paso en [`docs/USAGE.md`](./docs/USAGE.md).

---

## Estilos de edición

| Estilo | Para qué |
|---|---|
| **Silent** | Limpio, solo color — sin distracciones |
| **Punch** | Impacto en momentos clave |
| **Hype** | MrBeast viral + **motion tracking** (label que sigue la cara) |
| **Hype Max** | Hype + jump cuts + reaction zooms + **mirror/kaleidoscope** |
| **Hype Max SFX** | Premium con SFX coordinados |
| **Supreme** | Full stack (default para clips largos) |
| **Cinematic Pro** | Imágenes fullscreen + música + camera moves auto |
| **B-roll Full** | **Pexels a pantalla completa**, auto por transcripción + beat-sync |
| **B-roll PIP** | **Pexels pequeñito** sobre tu video + **quitar fondo con IA** + beat-sync |

Todos los estilos incluyen las "recetas CapCut" (LUT, scene-fx, transiciones pro, tipografía
cinética). Detalle completo en [`docs/EFFECTS.md`](./docs/EFFECTS.md).

---

## Publicación a redes

| Red | Estado | Requisitos |
|---|---|---|
| **LinkedIn** | ✅ Auto-publicación lista | Crear app en LinkedIn Developers + conectar en `/setup/linkedin` |
| **Instagram** | ✅ Auto-publicación (Reels) | Cuenta Business + app de Meta + URL pública (túnel) → `/setup/instagram` |
| TikTok | ⏸️ Código presente, oculto del UI | Requiere auditoría de TikTok (Content Posting API) |
| Facebook | ❌ No implementado | — |

Guía completa de conexión: [`docs/SOCIAL_PUBLISHING.md`](./docs/SOCIAL_PUBLISHING.md).

> Las credenciales OAuth se guardan **local** en `C:\hermes-data\user-settings.json`
> (fuera del repo, nunca se commitea).

---

## Estructura del repo

```
Estrategia_Viral_Poncho/
├── frontend/                  ← Next.js (dashboard, API routes, editor, producción)
│   └── src/
│       ├── app/               ← rutas + API (auth/*, instagram/publish, linkedin/publish, editor/auto-build…)
│       ├── components/        ← UI (produccion, editor, setup/linkedin, setup/instagram…)
│       └── lib/               ← style-templates, pexels, linkedin-client, instagram-client, paths, user-settings
├── remotion/                  ← composición de video
│   ├── src/                   ← ViralVideo, cinematic-layers, scene-fx, mirror-fx, tracked-layer
│   ├── generate-luts.mjs      ← genera los LUTs .cube (color)
│   └── build-props.mjs        ← arma props.json por render
├── python/                    ← pipeline IA local
│   ├── transcribe / cut_silences / long_form_pipeline
│   ├── match_sfx_to_transcript.py     ← SFX coordinados
│   ├── detect_beats.py                ← beat-sync (librosa)
│   ├── track_subject.py               ← motion tracking (OpenCV)
│   └── remove_background.py           ← quitar fondo (MediaPipe)
└── docs/                      ← documentación (ver abajo)
```

Datos del usuario (separados del repo, en `C:\hermes-data\videos\` por default): `raw/`,
`transcripts/`, `cuts/`, `renders/`, `projects/`, `assets/{broll,music,sfx}`, `overlays/`,
`long_form/`. Ver `docs/ARCHITECTURE.md` para el detalle.

---

## Documentación

- [PREREQUISITES.md](./PREREQUISITES.md) — qué instalar y descargar
- [docs/SETUP.md](./docs/SETUP.md) — instalación detallada
- [docs/USAGE.md](./docs/USAGE.md) — tutorial de uso
- [docs/UI.md](./docs/UI.md) — **diseño de la interfaz (pensada para principiantes) + convenciones**
- [docs/NIVEL_2.md](./docs/NIVEL_2.md) — **sprint nivel-2: FX/Assets/IA agregados (karaoke, auto-reframe, voz IA, etc.)**
- [docs/LANZAMIENTO.md](./docs/LANZAMIENTO.md) — **sprint lanzamiento: refactor + UI polish + tests (listo para vender)**
- [docs/EFFECTS.md](./docs/EFFECTS.md) — **estilos + sistema de efectos (CapCut FX, beat-sync, tracking, quitar fondo)**
- [docs/SOCIAL_PUBLISHING.md](./docs/SOCIAL_PUBLISHING.md) — **conectar y publicar en LinkedIn / Instagram**
- [docs/STYLES.md](./docs/STYLES.md) — estilos base
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — arquitectura interna
- [docs/REPOS.md](./docs/REPOS.md) — open source usado (licencias)
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) — errores comunes

---

## Seguridad

- Secretos (`.env.local`, `user-settings.json`, `*.key`, `*.pem`) están en `.gitignore` — **nunca
  los commitees**.
- Las API de redes son oficiales (LinkedIn/Meta). El sistema **no** maneja tu password: usa OAuth.
- Antes de publicar el repo: revisá que no hayas hardcodeado keys (el código las lee de
  `.env.local` y `user-settings.json`, ambos ignorados).

---

## Licencia

El código de este proyecto es de Poncho Robles. Si lo vas a hacer público para que otros lo
usen, **elegí y agregá una licencia explícita** (p. ej. [MIT](https://choosealicense.com/licenses/mit/)
para uso libre, o source-available si querés restringir). Sin un archivo `LICENSE`, por
default nadie tiene permiso de reutilizarlo.

Los componentes open source mantienen sus licencias: Next.js (MIT), Remotion (ver términos de
Remotion — puede requerir licencia para uso comercial/empresa), WhisperX (BSD-2), silero-vad
(MIT), MediaPipe (Apache-2.0), OpenCV (Apache-2.0), librosa (ISC), ffmpeg (LGPL/GPL según build),
shadcn/ui (MIT), SFX CC0.
