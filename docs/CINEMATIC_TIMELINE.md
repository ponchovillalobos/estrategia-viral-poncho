# Timeline Cinematográfico AE-style

Cómo se compone un video del modo cinematográfico, capa por capa, pensado como
un timeline de After Effects.

## Diagrama de capas (top → bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│ Capa 6: SUBTÍTULOS CINEMATIC (Anton blanco · letter-spacing 0.18) │
├─────────────────────────────────────────────────────────────────┤
│ Capa 5: FILM GRAIN (SVG turbulence animado · mix-blend overlay)   │
├─────────────────────────────────────────────────────────────────┤
│ Capa 4: VIGNETTE (radial gradient negro en bordes)               │
├─────────────────────────────────────────────────────────────────┤
│ Capa 3: IMAGE OVERLAYS (fullscreen + TV grain + Ken Burns)        │
│         · Solo cuando aparece la imagen (entre startTime/endTime)│
├─────────────────────────────────────────────────────────────────┤
│ Capa 2: CAMERA MOVES sobre <OffthreadVideo>                       │
│         · zoom_in / zoom_out / pan_left / pan_right               │
├─────────────────────────────────────────────────────────────────┤
│ Capa 1: VIDEO BASE (con color grading: contrast↑ saturation↓)    │
└─────────────────────────────────────────────────────────────────┘

  Audio:
  ─ Capa A1: Audio original del video
  ─ Capa A2: SFX marks (28 sonidos disponibles, matched o estructurales)
  ─ Capa A3: Música opcional (musicTrack)
```

## Flujo del pipeline (cuando hay imageOverlays)

```
1. WIZARD                          → user sube imágenes + descripciones + orden
   ↓
2. /api/overlays/upload            → guarda imágenes en C:\hermes-data\overlays\
   ↓
3. /api/editor/auto-build POST     → arranca el render
   ↓
4. python/match_overlays_to_       → match descripción ↔ palabras del transcript
   transcript.py                       (ej: "reunión" → seg 2.19)
   ↓
5. python/match_sfx_to_transcript  → match palabras ↔ SFX
   .py                                 (ej: "1960" → ding.mp3 en seg 10.55)
   ↓
6. style-templates.ts:              → camera moves auto cada 6-8s
   generateCameraMoves()                + jump cuts auto en pausas >0.4s
   ↓
7. style-templates.ts:              → enriquece project JSON con todas las capas
   commonBase()
   ↓
8. remotion/build-props.mjs         → convierte project → props.json
   ↓
9. npx remotion render              → mp4 final
```

## Vocabulario SFX-keyword (los 28 sonidos)

### Disparados por palabras del transcript

| SFX | Palabras que lo activan |
|---|---|
| **drum-hit** | boom, impacto, golpe, shock, fuerte, explosión |
| **impact-hit** | choca, estrella, golpea, cae, crash, rompió |
| **deep-boom** | enorme, gigante, masivo, millones, mundo, universal |
| **heartbeat** | tensión, miedo, nervios, ansiedad, estrés, pánico |
| **vhs-static-on** | recuerdo, memoria, antes, atrás, pasado, décadas |
| **tape-stop** | alto, stop, para, freno, espera, basta |
| **static-burst** | pum, zaz, shock |
| **camera-shutter** | foto, fotografía, retrato, instantánea |
| **old-camera** | época, histórico, antiguo, vintage, siglo |
| **ding** | porcentaje, cifra, número, millón + cualquier número (1960, 80, etc) |
| **reveal-chime** | revelación, secreto, verdad, descubrí |
| **breath-in** | respira, aire, calma, tranquilo, íntimo |
| **riser-short** | espera, atención, prepárate, mira, checa (se inyecta 1s ANTES) |
| **transition-up** | sube, creció, aumenta, crece |
| **transition-down** | baja, cae, menos, disminuye |
| **typewriter-key** | escribe, carta, mensaje, texto |
| **paper-rustle** | papel, libro, documento, archivo, publicó |
| **click-select** | elige, selecciona, decide |
| **pop** | pop, aparece, surge |
| **glitch-short** | error, glitch, rompe, falla |
| **vhs-rewind** | regresa, vuelve, retrocede |

### Estructurales (se inyectan por posición, no por palabra)

| SFX | Cuándo se inyecta |
|---|---|
| **swoosh-cinematic** | Seg 0.3 — entrada del video |
| **whoosh-short** | En cada jump cut |
| **vhs-static-off** | Cerca del final (duration - 1.5) |

## Perfiles de densidad

| Perfil | Camera moves | SFX | Jump cuts | Para |
|---|---|---|---|---|
| **low** (A) | 3 sutiles (intensity 0.05) | 4-8 solo estructurales | 0 | Tono dramático/íntimo |
| **medium** (B) | 6 medios (intensity 0.08) | 6-12 matched + estructurales | 3 | **Default** — equilibrado |
| **high** (C) | 10 fuertes (intensity 0.12) | 10-18 matched + estructurales | 6 | TikTok/Reels alta energía |

Cambiar densidad: pasar `cinematic.density: "low"|"medium"|"high"` al endpoint
`/api/editor/auto-build`. El test A/B/C (`POST /api/editor/test-ab`) corre los 3
en secuencia.

## Cómo el creador puede guiar la salida

### Por cada imagen subida
- **Descripción**: poné palabras que estén en el guión hablado (ej: "Carnegie 1936"
  si en el video decís "Carnegie" y "1936"). El matcher las usa para timestamp exacto.
- **Orden (#)**: si querés forzar el orden manual (1, 2, 3, ...), poné el número.
  Tiene prioridad sobre el matching.

### Para que los SFX matcheen mejor con el video
- Usá palabras de la tabla SFX-keyword en tu guión. Ej: si decís "impacto" en algún
  momento, automáticamente se inyecta `drum-hit.mp3` ahí.
- Las cifras (números) disparan `ding.mp3` automáticamente.
- Los SFX estructurales (intro/outro/jump cuts) van siempre, no necesitás nada.

### Para más o menos densidad
- Lanzá un Test A/B/C desde el wizard.
- Elegí el que más te guste.
- Ese perfil queda como default.

## Archivos clave del código

### Backend
- `python/match_overlays_to_transcript.py` — match imágenes ↔ palabras
- `python/match_sfx_to_transcript.py` — match palabras ↔ SFX
- `python/cinematic_assembly.py` — asamblea LLM (solo si los matchers no cubren todo)

### TypeScript
- `frontend/src/lib/style-templates.ts` — `commonBase()` + `generateCameraMoves()` + `generateJumpCuts()`
- `frontend/src/app/api/editor/auto-build/route.ts` — pipeline completo
- `frontend/src/app/api/editor/test-ab/route.ts` — runner A/B/C

### Remotion
- `remotion/src/cinematic-layers.tsx` — `ImageOverlayLayer` + `useCameraMoveTransform` + `FilmGrainLayer`
- `remotion/src/ViralVideo.tsx` — compose todas las capas, detecta `isCinematicMode`
- `remotion/build-props.mjs` — convierte project JSON → props.json para Remotion

### Storage
- `C:\hermes-data\overlays-library.json` — registro de imágenes subidas
- `C:\hermes-data\videos\overlays\{videoId}\` — binarios de imágenes
- `C:\hermes-data\videos\assets\sfx\curated\` — 28 SFX sintetizados + manifest.json
