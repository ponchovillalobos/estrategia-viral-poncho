# Editorial: siguiente nivel — investigación 2026-06-11

Investigación (código + web) de TODO lo que aún se puede agregar al estilo
📰 Editorial. Reglas: cero API keys, cero registros, solo licencias
CC0/MIT/OFL/ISC (CC-BY marcado), todo local. URLs verificadas en vivo.

## Qué tiene hoy (inventario)

- **4 temas de fuente** (`FONT_THEMES` en `editorial-layer.tsx`): playfair,
  dmserif, lora, abril. **3 fondos** (`EDITORIAL_BG`): dark, ink, cream.
  **10 acentos** (`PALETTE` en `style-templates.ts`).
- **Ilustraciones**: 28 line-art a mano (`line-art-icons.tsx`) + ~230 Lucide
  curados (`_LUCIDE_POOL`) + catálogo Noto Lottie (no usado en editorial).
- **4 tipos de tarjeta** (capítulo numerado / stat / titular / visual) +
  `IllustrationFX` (ring/burst/frame/clean) + `EditorialAmbient`.
- **6 modos de panel** con coreografía (`editorialLayout.scenes`).
- **NO tiene**: charts (genera specs pero el render las ignora), karaoke,
  Lottie, texturas, fotos de archivo, mapas, citas pull-quote.

## TIER 1 — máximo impacto, esfuerzo bajo

1. **12 fps en capas gráficas** (firma de Vox, look "hecho a mano"):
   `Math.floor(frame/(fps/12))*(fps/12)` antes de `interpolate()`. Sin assets.
2. **Subrayado/círculo a mano alzada sincronizado a la voz** (sello documental):
   fork para Remotion `@sethgunnells/rough-notation` (MIT, seed + % dibujado
   por frame) o rough.js (MIT, seed determinista) + `evolvePath`.
3. **Duotono editorial** sobre el panel de video / fotos: `grayscale(1)` +
   `mix-blend-mode multiply/screen` (tinta + papel + acento dorado). Sin assets.
4. **Tipografía VARIABLE animada por frame** (`fontVariationSettings` con
   `interpolate()`): **Fraunces** (ejes SOFT/WONK únicos), **Bodoni Moda**
   (opsz 6–96), **Roboto Serif** (eje GRAD: engorda trazos sin reflow — pulsos
   de énfasis), **Bricolage Grotesque**, **Newsreader**. Descarga directa:
   `github.com/google/fonts/raw/main/ofl/...` (OFL, sin key).
5. **Contador gigante** para el "dato estrella": `interpolate()` + easing +
   `font-variant-numeric: tabular-nums` + `Intl.NumberFormat`. (NO react-countup:
   usa RAF → flickering en Remotion.)
6. **Texturas procedurales** (papel/grano/acuarela): `feTurbulence` +
   `feDiffuseLighting`; grano animado re-seedeando por frame, opacidad 4-8%
   `mix-blend-mode: overlay`. Cero assets, resolución infinita.
7. **Iconos duotone dorados**: **Phosphor** ~1,512 × 6 pesos MIT
   (`raw.githubusercontent.com/phosphor-icons/core/main/assets/duotone/<n>-duotone.svg`)
   y **Tabler** 6,146 SVG MIT con `stroke="currentColor"`
   (`raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/<n>.svg`).
8. **Line-drawing/morphing**: `@remotion/paths` (`evolvePath`,
   `interpolatePath`) + **flubber** (MIT) para morphs dramáticos.

## TIER 2 — alto impacto, esfuerzo medio

9. **Collage cutout de papel**: borde blanco "de tijera" (`drop-shadow` blanco
   apilado ×4-6), sombra dura, rotación ±3°, jitter stop-motion. Recorte de
   sujeto: **rembg** (MIT; pesos U2Net se bajan de GitHub releases sin key).
10. **Bordes de papel rasgado**: `feTurbulence` + `feDisplacementMap` con
    `seed` determinista.
11. **Mapas editoriales animados** (zoom a país, coropletas): d3-geo (ISC) +
    `unpkg.com/world-atlas@2/countries-50m.json` (Natural Earth, dominio
    público) o GeoJSON CC0 de `martynafford/natural-earth-geojson`.
12. **Charts estilo Economist**: d3-scale/shape como cálculo puro + JSX +
    `spring()` (patrón oficial remotion-dev/d3-example). Paleta del styleguide
    público del Economist (rojo #E3120B, etiquetado directo, sin leyendas).
    El editorial YA genera specs de dataViz — solo falta renderizarlas.
13. **Charts sketchy estilo NYT**: rough.js seed fijo + "line boil" alternando
    seed cada 3 frames; **svg2roughjs** (MIT) convierte cualquier SVG a estilo
    dibujado a mano.
14. **Ken Burns 2.5D**: sujeto recortado (rembg) y fondo a velocidades
    distintas (1.3x) + blur 2px en fondo; zoom SIEMPRE lineal lento.
15. **Texturas CC0 reales 4K**: `download.cc0-textures.com/cc0t/Paper001_4K-JPG.zip`
    y `ambientcg.com/get?file=Paper001_2K-JPG.zip` (técnica Vox: ciclar 4-6
    PNGs cada ~10 frames con flips).
16. **Pull-quotes serif palabra por palabra**: stagger desde los timestamps de
    Whisper (ya existen), comillas gigantes 200-300px al 10%, revelado con
    `clip-path: inset()` (NO background-clip:text — gotcha conocido).

## TIER 3 — bancos de assets / refinamiento

17. **Grabados de archivo**: British Library Flickr (1M+ PD), Old Book
    Illustrations (~4,800), Openclipart (170k+ SVG CC0 directo).
18. **Fotos de archivo sin key**: NASA Images API (JSON sin key), Wikimedia
    Commons (`Special:FilePath/<archivo>?width=2000`).
19. **Ilustraciones de personas**: Open Doodles (~30 CC0, una tinta → recolor
    dorado trivial), Doodle Icons de Khushmeen (400+ CC0).
20. **Halftone procedural** (retratos "neo-print"): `repeating radial-gradient`
    + `contrast()` alto, animar `background-size`.
21. **Capa de cohesión final**: aberración cromática sutil en bordes + viñeta
    + gate weave ±1px (patrón Vox).
22. **Transición pull-back 3D** con blur ±4 frames alrededor del corte.

## Extensiones triviales del sistema actual (sin investigación, solo agregar)

- Más temas de fuente (enum + `loadFont` en `FONT_THEMES`).
- Más fondos en `EDITORIAL_BG` (ej. "sepia papel", "forest", "burgundy").
- Más acentos en `PALETTE`.
- Más iconos a mano en `line-art-icons.tsx` y vocabulario en
  `_EDITORIAL_ICON_WORDS`.
- Más variantes de `IllustrationFX` y más modos de panel en `rectFor()`.

## EVITAR

- css.gg (ya no es MIT), Storyset/Freepik (atribución obligatoria), Blush y
  rawpixel (cuenta), unDraw (prohíbe bulk), framer-motion / react-countup /
  roughViz / react-chrono (RAF → flickering en Remotion), GSAP (gratis pero
  licencia propietaria — innecesario), packs de "free film grain" (licencias
  dudosas; el grano procedural es mejor).

## Síntesis

La tendencia 2025-2026: **la imperfección es la nueva señal de credibilidad
editorial** frente al contenido IA pulido. Stack ganador = duotono + textura +
cutout + subrayados a mano + un dato gigante, todo a 12 fps en capas gráficas,
con timings derivados de la transcripción. Reglas de determinismo en Remotion:
todo deriva de `useCurrentFrame()`; todo lo pseudo-aleatorio lleva `seed` fijo.
