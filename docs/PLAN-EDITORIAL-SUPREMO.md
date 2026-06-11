# Plan Editorial Supremo — Tier 1 + 2 en 7 olas

> Investigación base: `docs/EDITORIAL-NEXT.md` (2026-06-11). Detalles técnicos
> verificados con fetch en vivo (URLs, paquetes npm, licencias). Hallazgo:
> **no existe ningún template Remotion editorial/periódico** — nicho vacío.
> Reglas: cero API keys, licencias CC0/MIT/OFL/ISC, todo local y determinista
> (seed fijo + `useCurrentFrame()`; nada de RAF/`Math.random()`/`Date.now()`).

## Reglas de cada ola

1. `tsc --noEmit` = 0 en `frontend/` y `remotion/`.
2. Smoke still/render de cada capa nueva (gotcha conocido: NO
   `background-clip:text` — usar `clip-path`/máscaras).
3. **No-regresión**: un proyecto viejo sin los campos nuevos renderiza idéntico
   (todo opt-in vía `editorialLayout`).
4. Paridad largos: si el FX entra al `.ts` de shorts, evaluar el espejo `.mjs`
   de largos (ver memoria largos-fx-parity).
5. Commit por ola en español + push.

---

## Ola 1 — Motor de look (cero assets, solo código) · ~1 día

El "stack ganador" Vox/Economist que transforma el estilo de inmediato:

- **`steppedFrame(frame, fps, 12)`** util compartido: las capas GRÁFICAS
  (cards, ilustraciones, ambient, decoración) animan a 12 fps
  (`Math.floor(frame/(fps/12))*(fps/12)`); el video del panel queda a 30.
- **Duotono editorial** en el panel de video por tema: `grayscale(1)` +
  capas `mix-blend-mode: multiply/screen` (tinta + papel + acento). Flag
  `editorialLayout.duotone` (default off = compat).
- **Textura procedural de papel** (`feTurbulence fractalNoise 0.04 + 
  feDiffuseLighting`) + **grano animado** (re-seed por frame, opacity 4-8%,
  `mix-blend-mode: overlay`) según tema.
- **Capa de cohesión final**: viñeta suave + gate weave ±1px + aberración
  cromática sutil solo en bordes.

Archivos: `remotion/src/layers/editorial-layer.tsx`, nuevo
`remotion/src/layers/editorial-texture.tsx`, `ViralVideo.tsx`, schema.

## Ola 2 — Tipografía variable + mano alzada · ~1-2 días

- **Descargar 6 TTF variables** (script `python/download_fonts.py`, patrón de
  `download_animated_icons.py`) desde
  `raw.githubusercontent.com/google/fonts/main/ofl/...` → `remotion/public/fonts/`
  renombrados SIN brackets (PowerShell los trata como wildcards):
  Fraunces + Italic (ejes SOFT/WONK/opsz/wght), Bodoni Moda (opsz 6-96),
  Roboto Serif (eje GRAD — pulsos de énfasis sin reflow), Bricolage Grotesque,
  Newsreader. Carga con `@remotion/fonts` `loadFont({url: staticFile(...)})`.
- **Titulares que respiran**: `fontVariationSettings` interpolado por frame
  (custom axes en MAYÚSCULA: `"SOFT" ${x}, "WONK" 1`; fijar `opsz` explícito;
  no mezclar `fontWeight` con `wght`).
- **Subrayado/círculo/box a mano alzada** sincronizado a la voz: la tarjeta ya
  tiene campo `accent` — al timestamp de esa palabra, dibujar con
  `@sethgunnells/rough-notation@0.1.3` (MIT, hecho PARA Remotion:
  `annotate(el, {seed: REQUERIDO, type})` + `setPercentageDrawn(0..1)`;
  crear el annotation UNA vez en ref, `useLayoutEffect`). Plan B: rough.js
  4.6.6 `generator()` con `options.seed` + `evolvePath` de `@remotion/paths`.
- **Contador gigante** para tarjetas stat: `interpolate` + easing cúbico +
  `font-variant-numeric: tabular-nums` + `Intl.NumberFormat("es-MX")`.
- **Pull-quote**: nuevo tipo de tarjeta (cita serif palabra-por-palabra con
  stagger desde timestamps de Whisper, comillas 200-300px al 10%, revelado
  `clip-path: inset()`); Python la detecta (frase en 1ª persona / cita).

Archivos: `editorial-layer.tsx`, `line-art-icons.tsx` (no), nuevo
`editorial-annotation.tsx`, `generate_graphics.py` (pull-quote detection),
`package.json` remotion (+`@sethgunnells/rough-notation`, `roughjs`).

## Ola 3 — 12 sub-temas editoriales (de 4 a 12+ identidades) · ~2-3 días

Refactor: `EDITORIAL_BG` + `FONT_THEMES` → sistema `EDITORIAL_THEMES` con
ficha completa por tema: `{bg, text, muted, accents[], fontTitle, fontBody,
texture, motifs[], gesto}`. Los 3 fondos actuales sobreviven como "Clásico
dark/ink/cream". Nuevos (paletas y fuentes OFL exactas en EDITORIAL-NEXT/
investigación):

| Tema | Paleta clave | Fuentes | Gesto de motion único |
|---|---|---|---|
| Prensa 1900 | papel #e8e1cf, tinta #1c1812, rojo sello #8e2a1e | Playfair + Old Standard TT (+UnifrakturMaguntia masthead) | filetes dobles + capitular + folio "VOL. XXIII" |
| Vogue noir | #0c0b0a / #f4f0e6, oro #c9a96a (var. couché #faf7f2 + rojo labial #b9121b) | Bodoni Moda opsz alto + Lora | numeral 30vw al 8% detrás, hairlines, caps tracking 0.35em |
| Kinfolk calma | #f6f3ec, terracota #b06b4c, salvia #94997f | Cormorant Garamond light + Karla | aire 12-15%, fades 20+ frames, nada rebota |
| Zine riso | papel #f1ece0, rosa #FF48B0, azul #0078BF, amarillo #FFE800 | Archivo Black + Space Mono | MISREGISTRACIÓN viva ±2px multiply + halftone + cinta |
| Grabado victoriano | sepia #ece3cd, oro viejo #8a6d3b, burdeos #5c2120 | IM Fell English + Old Standard TT | cartuchos de esquina, hachurado SVG, "Fig. 1." |
| Constructivista | crema #ece2cf, negro, rojo #cf2618 | Anton/Oswald caps + Inter | wedge rojo `clip-path` como wipe, diagonal 8-12° |
| Bauhaus | #f2e9d8, rojo #be1e2d, azul #21409a, amarillo #f0c020 | Josefin Sans minúsculas + DM Sans | círculo-triángulo-cuadrado como bullets/transiciones |
| Suizo grid | #f4f4f1 / #0d0d0d, rojo #e30613 | Inter Tight/Archivo + Inter | la RETÍCULA aparece 5 frames antes de que el texto caiga |
| Brutalista 2025 | #efefea, azul #0000ee, naranja #ff4d00 | Space Grotesk + IBM Plex Mono | bordes 3px, sombra dura 6px, steps() sin easing, marquee |
| Japón mincho | #f5f3ed, sumi #26241f, bermellón #b3342c | Shippori Mincho + Zen Kaku Gothic | texto VERTICAL (`writing-mode`) + sello hanko procedural |
| Stripe press | azul tinta #0a2540, lavanda #635bff | Newsreader/Source Serif 4 + Inter + Plex Mono | notas al margen¹ + diagramas hairline que se dibujan |
| Docu rojo | #f9f7f1, rojo Economist #e3120b (var. FT salmón #fff1e5/teal #0d7680) | Libre Franklin + Spectral | barra roja pre-titular + highlighter que crece |

- Wizard: selector visual de tema editorial (como los temas actuales).
- Motivos procedurales compartidos: filetes, capitular, halftone pattern,
  hachurado, hanko, marquee, retícula — componentes pequeños reutilizables.
- Python: `_KICKERS` y tono de kickers por tema (opcional).

## Ola 4 — Iconos ×30: Phosphor duotone + Tabler · ~1 día

- Script `python/download_editorial_icons.py`: baja a `{DATA_ROOT}/assets/icons/`
  los SVG de **Phosphor duotone** (1,512; manifest parseable en `src/icons.ts`
  del repo o npm `@phosphor-icons/core` que exporta los assets) y **Tabler
  outline** (5,093, kebab-case, `stroke="currentColor"`). NUNCA fetch en
  render — assets locales + `staticFile()`.
- Render: `PhosphorDuotone` (recolor de la capa `opacity="0.2"` por
  string-replace → dorado + dorado translúcido) y reuso de `LineArtLucide`
  para Tabler (mismo formato stroke).
- Python: pools por tema + ampliar `_EDITORIAL_ICON_WORDS`; validador tipo
  `check-lucide-names.mjs` para los nombres nuevos.

## Ola 5 — Data-viz editorial (el hueco regalado) · ~2 días

El editorial YA genera specs `dataViz` que el render ignora. Renderizarlas:

- **Charts Economist** (temas Docu rojo, Stripe, Suizo): d3-scale/shape como
  cálculo puro + JSX + `spring()` (patrón oficial remotion-dev/d3-example);
  etiquetado directo sin leyendas; cifras tabular-nums; "fuente:" en mono.
- **Charts sketchy** (temas Prensa, Grabado, Zine, Kinfolk): rough.js seed
  fijo + "line boil" alternando seed cada 3 frames; `svg2roughjs` (MIT) para
  esquemas.
- Tipos: counter, bar, line, donut, progress, comparison (los specs existen).
- Sincronía: el chart se dibuja mientras se dice el dato (timestamps ya
  presentes en el spec).

## Ola 6 — Collage, archivo y profundidad · ~2-3 días

- **rembg local**: `pip install "rembg[cpu]"` (onnxruntime ~13MB) +
  pre-descarga `u2net_human_seg.onnx` (176MB) a `U2NET_HOME =
  {DATA_ROOT}/models/u2net` (release v0.0.0 de danielgatis/rembg, sin key).
  Sesión única reutilizada (`new_session`).
- **Tarjeta cutout collage**: frame del creador recortado con borde "de
  tijera" (`drop-shadow` blanco apilado ×4-6), sombra dura, rotación ±3°,
  jitter stop-motion a 12 fps.
- **Papel rasgado**: máscaras `feTurbulence + feDisplacementMap` (atributo
  `seed` determinista) para bordes de panel en temas de papel.
- **Ken Burns 2.5D**: sujeto (rembg) y fondo a velocidades distintas (1.3x) +
  blur 2px fondo; zoom SIEMPRE lineal lento.
- **Texturas CC0 reales** (opcional, técnica Vox de ciclar 4-6 PNGs):
  `ambientcg.com/get?file=Paper001_2K-JPG.zip` … Paper006, Cardboard001-004
  (CC0, descarga directa, `curl -L`, User-Agent no vacío).

## Ola 7 — Mapas editoriales · ~1-2 días

- npm: `world-atlas@2` (ISC, Natural Earth PD), `topojson-client`, `d3-geo`
  — bundlear `countries-50m.json` (756KB; usar 110m para globo lejano).
- Componente `GlobeZoom`: `geoOrthographic` + `geoInterpolate` (slerp) desde
  México [-99,23] al país mencionado + zoom exponencial (~25 líneas,
  determinista; snippet completo en el cheat-sheet).
- Python: detectar países/ciudades en el transcript → escena de mapa con
  estilo del tema (sketchy en temas de papel, hairline en Stripe/Suizo).

---

## Orden y dependencias

```
Ola 1 (motor) → Ola 2 (tipo+mano) → Ola 3 (12 temas, usa 1+2)
                                  → Ola 4 (iconos, independiente)
Ola 5 (charts, usa temas de 3) → Ola 6 (collage) → Ola 7 (mapas)
```

Total estimado: ~10-14 días de trabajo efectivo. Cada ola entrega valor
visible por sí sola y termina commiteada + smoke-renderizada.

## Repos de referencia para estudiar al implementar

- `remotion-dev/template-tiktok` — pipeline de captions por palabra (Whisper local).
- `reactvideoeditor/remotion-templates` (MIT, 81 componentes) — charts & data, typewriter, Ken Burns.
- `lifeprompt-team/remotion-scenes` (MIT) — film grain/VHS/aberración adaptables a riso.
- `udaykirancodes/kinetic-studio` (MIT) — arquitectura "cada palabra = frame coreografiado".
- `remotion-dev/d3-example` — patrón oficial d3 + spring.

## Evitar (verificado)

css.gg (ya no MIT) · Storyset/Freepik (atribución) · unDraw (no bulk) ·
framer-motion / react-countup / roughViz / react-chrono (RAF → flickering) ·
GSAP (licencia propietaria, innecesario) · packs "free film grain" (licencias
dudosas — el grano procedural es mejor).
