# Investigación: Motion Design en Remotion — 2026-06-09

> **EJECUTADO (mismo día)**: Fase A+B implementadas — 3 estilos nuevos en el
> selector de shorts Y largos: **Motion Pro ✨** (fondo aurora audio-reactivo,
> limpio, sin emojis), **Motion Beat 🎧** (gradiente mesh que late con la música
> + zooms al beat) y **Motion Grid 🌐** (cuadrícula retro-tech en perspectiva).
> Motor: `remotion/src/layers/animated-background-layer.tsx` (aurora/mesh/grid,
> `visualizeAudio` + `useWindowedAudioData` de @remotion/media-utils → el fondo
> PULSA con los graves de la música; sin música respira suave). Los 3 estilos:
> música CC0 automática + ducking del director emocional + charts + karaoke,
> CERO stickers/emojis. Vendor de referencia: `remotion/vendor/remotion-scenes`
> (201+ escenas MIT clonadas al repo para las fases C/D).

> Pedido del user: estilo de videos con PURAS animaciones, muy limpio, sin emojis
> ni tanto texto — gráficas, zooms, personajes, fondos que cambian al ritmo.
> Qué existe en el ecosistema Remotion (gratis, MIT, sin API keys) y qué nos falta.

## 1. LOS REPOS DE ORO (todos MIT, sin keys, uso comercial OK)

| Repo | Qué trae | Por qué nos sirve |
|---|---|---|
| **lifeprompt-team/remotion-scenes** | **201+ escenas profesionales** en 16 categorías: tipografía cinética/neón/glitch (12), formas con morphing y cubos 3D (10), transiciones líquidas/persianas (10), charts y stat-cards (8), **fondos animados: aurora/mesh/gradientes/grid (10)**, partículas: nieve/sakura/fireworks (10), títulos cinemáticos épicos/sci-fi (10), layouts split/off-grid (12), listas y timelines animados (12), **temas completos: cyberpunk/minimal/Y2K (33)**, **rollers: contadores tragamonedas (22)**, **líquidos: ink splash/blobs/ondas (10)** | LA mina. Es exactamente "motion design limpio sin emojis". Se vendorea por categoría (`npx degit`) |
| **reactvideoeditor/remotion-templates** | 81 plantillas: charts & data (9), texto (9), fondos (9), cinematic (9), transiciones (9), logo/branding (9), intro/outro (9), imagen (9) | Segunda fuente; charts más pulidos que los nuestros |
| **av/remotion-bits** | Componentes listos: text effects, gradient transitions, **particle systems, escenas 3D** + utilidades de motion/color | CLI `npx remotion-bits find` para explorar |
| **kapishdima/remocn** | Registry estilo shadcn: `npx shadcn add` de fondos, escenas, glass code blocks, charts animados | Para escenas de producto/demos |
| **stefanwittwer/remotion-animated** | API declarativa de animación (Move/Scale/Rotate/Fade encadenables) | Acelera escribir animaciones nuevas |
| **LottieFiles/motion-design-skill** | Principios de motion design (timing, easing, coreografía, principios Disney) como skill para agentes | Para que la IA componga escenas con criterio de director |
| **diffusionstudio/lottie** | Skill open-source para **GENERAR animaciones Lottie production-ready con Claude Code** | 🔥 Personajes/iconos animados A MEDIDA por video, sin diseñador |
| **LottieFiles/test-files** (`data/` CC0) + **spemer/lottie-animations-json** | Animaciones Lottie de dominio público descargables por raw | Assets de personajes/iconos sin cuenta |

## 2. PAQUETES OFICIALES DE REMOTION QUE NO USAMOS

| Paquete | Qué hace | Estado en nuestro proyecto |
|---|---|---|
| **@remotion/media-utils** → `useWindowedAudioData()` + `visualizeAudio()` | **Espectro de audio POR FRAME** → fondos/formas/barras que pulsan AL RITMO de la música o la voz | ❌ NO lo usamos — es "el fondo que cambia al ritmo" que pidió el user. Instalado pero sin uso |
| **@remotion/transitions** | `<TransitionSeries>` oficial: fade/slide/wipe/**flip**/clock-wipe + timings con spring | ❌ Nuestras transiciones son artesanales; éstas suman variedad gratis |
| **@remotion/shapes** | Generador de formas SVG animables (rect/circle/pie/star/polygon) | ❌ No usado |
| **@remotion/paths** | `interpolatePath()` → **MORPHING entre formas**, dibujar trazos, mover elementos por una curva | ❌ No usado — clave para líquidos/morph |
| **@remotion/rive** | Personajes RIVE (animación esqueletal interactiva) | ❌ No usado (assets buenos requieren cuenta → preferir Lottie CC0 + generación) |
| **@remotion/noise** | Perlin noise | ✅ Ya lo usamos (dust, partículas) |
| **@remotion/lottie** | Player de Lottie | ✅ Ya lo usamos (4 stickers propios) |

## 3. QUÉ NO TIENE NUESTRO PROYECTO (el diff honesto)

1. **NADA audio-reactivo visual**: el director emocional modula volumen/zooms, pero
   ningún elemento VISUAL pulsa con la música frame a frame (`visualizeAudio`).
2. **Fondos animados**: cero (aurora, gradient mesh, grid, partículas ambientales de fondo).
3. **Morphing de formas y líquidos**: cero (ink splash, blobs, liquid transitions).
4. **Tipografía cinética PRO**: tenemos 6 efectos de headline; faltan rollers/
   contadores tragamonedas, neón, typewriter con cursor, split por palabra coreografiado.
5. **Personajes animados**: solo 4 stickers Lottie abstractos propios; cero personajes.
6. **Layouts de escena**: todo es video+overlays; no hay escenas split/off-grid/
   listas animadas/timelines (lo que hace que un video se vea "diseñado").
7. **Temas estéticos coherentes**: los estilos cambian FX, no la estética completa
   (cyberpunk/minimal/Y2K con paleta+fuentes+motion propios).
8. **Estilo "limpio"**: todos nuestros estilos saturan con stickers/emojis; falta el
   modo minimal donde la animación ES el protagonista.

## 4. PLAN PROPUESTO — Estilo "MOTION PRO" (animación pura, sin emojis)

**Fase A — Vendorear lo mejor de remotion-scenes (MIT)** (~1 sesión)
   Adaptar a nuestro schema opt-in: fondos animados (aurora/mesh/gradiente),
   rollers/contadores, 2-3 transiciones líquidas, stat-cards. Nuevo estilo
   `motion_pro`: SIN emojis ni stickers; subtítulos minimal; charts pro; fondos
   animados detrás del speaker (con remove-bg que ya tenemos los fondos brillan).

**Fase B — Capa AUDIO-REACTIVA** (~1 sesión)
   `useWindowedAudioData` + `visualizeAudio` sobre la música del project →
   fondo aurora que respira con el beat, barras/ondas sutiles, acentos de color
   en cada golpe. Conectado al director emocional (mood elige la paleta).

**Fase C — Personajes** (~1 sesión)
   Lottie CC0 (LottieFiles test-files + repos GitHub raw) + el skill
   `diffusionstudio/lottie` para GENERAR personajes/iconos a medida del guión
   con Claude Code. Nadie en el mercado genera personajes por video.

**Fase D — Temas estéticos**: portar 2-3 temas completos (minimal/cyberpunk)
   como variantes del estilo (paleta + fuente + fondo + motion coherentes).

## Anexo 2026-06-10 — Frameworks de PRESENTACIONES con código (para Editorial v2+)

| Repo | Qué robarle para nuestro Editorial |
|---|---|
| **[slidevjs/slidev](https://github.com/slidevjs/slidev)** (MIT, ~35k★) | Sus **layouts de slide** (two-cols, image-right, quote, fact, statement) son composiciones probadas para nuestras tarjetas; sus transiciones entre slides (slide-up, fade-out, view-transitions) y el patrón `v-click` (revelar elementos por pasos) → revelar kicker→título→subtítulo→ícono en pasos ya lo hacemos, pero sus **temas** (apple-basic, seriph, shibainu) son paletas/tipografías listas para portar como temas editoriales nuevos. |
| **[motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas)** (MIT, ~17k★) | La referencia de animación vectorial narrada: **patrones de easing/signals** y sus escenas de ejemplo (diagramas que se construyen, flechas que conectan conceptos, código que se transforma) — ideas directas para más line-art animado (diagramas de flujo que se dibujan mientras el speaker explica). |
| **open-slide.dev** | Framework de slides pensado para AGENTES — patrones de generación de slides por LLM aplicables a nuestro `_enrich_cards_llm`. |

**Implementado hoy (Editorial v2)**: panel de video DINÁMICO por escenas
(derecha→izquierda→cuadrado→grande→fullscreen, lerp 0.8s ease), ícono garantizado
en toda tarjeta (fallback rotativo), y reescritura de textos con Ollama
(títulos impactantes + subtítulos que APORTAN datos, con fallback heurístico).

## Fuentes
- https://github.com/lifeprompt-team/remotion-scenes (MIT, 201+ escenas)
- https://github.com/reactvideoeditor/remotion-templates (MIT, 81 plantillas)
- https://github.com/av/remotion-bits · https://github.com/kapishdima/remocn
- https://github.com/stefanwittwer/remotion-animated
- https://github.com/lottiefiles/motion-design-skill
- https://github.com/diffusionstudio/lottie
- https://github.com/LottieFiles/test-files (CC0) · https://github.com/spemer/lottie-animations-json
- https://www.remotion.dev/docs/audio/visualization · /docs/transitions · /docs/shapes · /docs/paths
