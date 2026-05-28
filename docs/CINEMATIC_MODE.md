# Modo Cinematográfico — Documentación técnica

Modo de edición opt-in para producir videos virales con look de cine: imágenes
fullscreen con efecto TV, Ken Burns, camera moves sobre el video base, SFX
sincronizados, subtítulos cinematográficos blancos. **Cero impacto en los otros
estilos**: si no se activa el toggle, el render sale idéntico al anterior.

## ¿Cuándo se activa?

El modo se activa SOLO cuando `subtitleStyle === "cinematic"` en el project JSON.
Eso se setea desde el wizard de cortos cuando el usuario tilda **"Subtítulos cine"**
en el step 5.

```
subtitleStyle === "cinematic"  →  TODAS las mejoras cinematic activas
subtitleStyle === "bebas"|"anton"  →  render legacy idéntico a antes
```

## Componentes que cambian SOLO en cinematic

### 1. `ImageOverlayLayer` con `fullscreenCinematic={true}`
Archivo: `remotion/src/cinematic-layers.tsx`

- Imagen ocupa toda la pantalla (ignora `sizeRatio` y `position`)
- TV grain SIEMPRE activo al aparecer (no solo cuando `effect=tv_static`)
- Scanlines sutiles + chroma shift
- Vignette radial interna para focus
- Ken Burns amplificado: scale 1.0 → 1.4 (en lugar de 1.3)

### 2. `useCameraMoveTransform` sobre `<OffthreadVideo>`
Archivo: `remotion/src/cinematic-layers.tsx`

Aplica zoom_in / zoom_out / pan_left / pan_right sobre el video base con ease-in-out
cúbico. Definido por el agente Cinematographer de la asamblea.

```ts
const cameraMove = useCameraMoveTransform(isCinematicMode ? cameraMoves : []);
```

### 3. Color grading sutil sobre el video base
Archivo: `remotion/src/ViralVideo.tsx`

```css
filter: contrast(1.05) saturate(0.92) brightness(0.98)
```

Solo cuando `isCinematicMode`. Para los otros estilos el video va sin filtro.

### 4. Subtítulos blanco puro
Archivo: `remotion/src/ViralVideo.tsx` (`SubtitleLayer`)

- Fuente Anton, peso 600 (más light que el 800 normal)
- Color `#FFFFFF` puro
- `letter-spacing: 0.18em` (más ancho)
- Sin uppercase forzado
- Triple sombra para legibilidad

## Asamblea de agentes cinematográficos

Archivo: `python/cinematic_assembly.py`

8 especialistas + 1 closer corriendo en secuencia (3-5 min total con Claude Opus):

| Agente | Decide |
|---|---|
| Director | Visión general, actos, momentos clave |
| PacingEditor | Cortes, jump cuts, pausas |
| Cinematographer | Camera moves sobre el video base |
| MotionDesigner | Animaciones de stickers/palabras |
| ColorGrader | Vignette, film grain, paleta |
| SoundDesigner | SFX por timestamp (de la biblioteca de 28) |
| VFXArtist | Effect+motion+transition+timing por imageOverlay |
| SubtitleEditor | Palabras a destacar |
| Closer | Consolida en timeline JSON, resuelve conflictos |

Auto-convocada al renderizar si hay overlays sin timestamps.

## Regla de matching contenido-imagen

El agente VFXArtist analiza:
1. La descripción que el user escribió ("logo HubSpot")
2. El filename del archivo ("cliente_firma.jpg")
3. Busca palabras relacionadas en el transcript con sus timestamps

Ejemplo:
- `description = "logo HubSpot"`
- transcript: "...HubSpot..." en sec 23.4
- → `startTime = 23.4, endTime = 27.0`

## Endpoints

| Endpoint | Función |
|---|---|
| `POST /api/overlays/upload` | Subir imagen (multipart) |
| `GET /api/overlays/list?videoId=X` | Lista overlays |
| `PATCH /api/overlays/[id]` | Actualizar timestamps/effect/etc |
| `DELETE /api/overlays/[id]` | Borrar (entry + archivo) |
| `GET /api/overlays/[id]/image` | Stream del binario |
| `POST /api/overlays/assembly` | Convocar asamblea manualmente |
| `GET /api/sfx/list` | Listar 28 SFX |
| `GET /api/sfx/stream?file=X.mp3` | Stream SFX individual |

## Storage en disco

```
C:\hermes-data\
├── overlays-library.json              ← JSON store de overlays
├── videos\
│   ├── overlays\<videoId>\<id>.<ext>  ← Binarios de imágenes subidas
│   └── assets\sfx\curated\            ← 28 MP3s sintetizados + manifest.json
```

## Garantías de NO regresión

1. Schema de `ViralVideo.tsx` extendido con defaults vacíos → projects pre-sprint funcionan
2. `subtitleStyle` agrega `"cinematic"` como TERCER valor (no toca bebas/anton)
3. Camera moves solo se computan cuando `cameraMoves.length > 0`
4. `fullscreenCinematic` se pasa solo cuando `subtitleStyle === "cinematic"`
5. Color grading del video base solo se aplica cuando `isCinematicMode`
6. Todos los estilos legacy (silent, punch, hype, hype_max, hype_max_sfx, supreme)
   no fueron tocados en su lógica de build

## Test de no-regresión

```
node remotion/build-clip-props.mjs "Merza Servicio Wow_c01_segmento-01" silent
npx remotion render src/index.ts ViralVideo out.mp4 --props=props.json
```

Output esperado: idéntico al render pre-sprint (mismo hash o ffprobe metadata).
