# Interfaz (UI) — diseño para principiantes

El dashboard está pensado para una persona **que no sabe nada de edición ni de marketing**:
debe ser simple, claro y visual. Este documento explica las decisiones de diseño y las
convenciones, para que cualquiera que extienda la app las mantenga.

## Principios

1. **Que se entienda qué hacer primero.** Toda pantalla tiene un punto de entrada obvio y,
   donde aplica, un único botón principal destacado.
2. **Cero jerga.** Nada de codenames internos (`hype_max_sfx`, `B-roll`, `caption_long`,
   `OAuth`, `LUT`, `frame`) ni rutas de archivo (`C:\...`) en la interfaz. Si un término
   técnico es inevitable, se acompaña de ayuda contextual.
3. **Visual antes que texto.** Iconos + nombres humanos + ejemplos antes que descripciones largas.
4. **Estados vacíos que enseñan.** Cuando no hay nada todavía, se muestra qué hacer y un botón
   para hacerlo — nunca una pantalla en blanco o un mensaje pasivo.

## Navegación

Barra superior (`components/layout/tab-nav.tsx`), ordenada por el **flujo real**:

`Inicio · Crear video · Mis videos · Resultados · Videos largos · Inspiración · Instagram · LinkedIn`

- **Responsive:** links inline en desktop (`lg:`); en móvil/tablet se colapsan en una
  hamburguesa con panel desplegable.
- El logo (“Estrategia Viral”) lleva al Inicio.

## Pantallas clave

- **Inicio (`app/page.tsx`):** página de partida guiada — saludo, qué hace la app, 3 acciones
  grandes (Crear video / Mis videos / Conectar redes), tira “Cómo funciona” en 4 pasos, y el
  checklist **“Empezá acá”** que se tilda solo según el estado real (componente
  `components/home/getting-started.tsx`).
- **Crear video (`app/editor`):** lista de videos con botón **Subir desde mi compu** (no se
  muestran rutas de archivo), estado vacío accionable, y acceso al asistente automático.
- **Asistente / wizard (`components/editor/wizard/wizard-client.tsx`):** 5 pasos
  (Video · Estilo · Color · Redes · Generar) con stepper etiquetado. Los estilos tienen
  **nombres humanos + descripción + badge “Recomendado”**; el progreso se muestra en lenguaje
  claro (“generando…”, “listo”) sin contadores de frames; las opciones avanzadas
  (modo cinematográfico) van plegadas; al terminar hay un **cierre celebratorio** con CTA a publicar.
- **Mis videos (`app/produccion`):** galería de videos editados; botones de publicación con el
  nombre completo de cada red (Instagram / LinkedIn).

## Componentes y convenciones reutilizables

- **`components/ui/help-hint.tsx`** — ícono `?` con explicación breve al hover/foco (accesible,
  sin dependencias). Usalo al lado de cualquier término que pueda confundir:
  `<HelpHint>Explicación simple…</HelpHint>`.
- **Color de marca = acción principal.** El color `--primary` (emerald, definido en
  `app/globals.css`) se reserva para el botón/acción más importante de cada pantalla. Lo demás
  va en gris/outline. Así el usuario siempre ve “qué tocar”.
- **Tipografía:** la fuente monoespaciada (`.font-mono-tab`) se reserva para **datos numéricos**
  (porcentajes, tamaños, fechas). Las etiquetas y títulos van en la fuente normal (más humana).
- **Estados vacíos:** patrón ícono + título + frase + botón primario (ver `video-list.tsx` y
  `production-list.tsx`).

## Historial del rediseño (olas)

El rediseño se hizo en 4 olas (ramas/commits en git, tag de respaldo `v1-pre-rediseno-ui`):

1. **Claridad inmediata** — nav renombrada/reordenada, color de marca, rutas ocultas, acrónimos
   fuera, estados vacíos accionables.
2. **Orientación** — Inicio guiado, checklist “Empezá acá”, tira “Cómo funciona”, ayuda contextual.
3. **Wizard** — estilos con nombres humanos + recomendado, stepper etiquetado, progreso humano,
   avanzadas plegadas, cierre celebratorio.
4. **Sistema visual** — logo legible, nav responsive, idioma 100% español consistente.

> Nota: el color de marca quedó anclado en el **emerald** (el del logo). Una identidad de color
> más amplia (modo claro, acentos cálidos) y previsualizaciones reales de cada estilo (clips de
> ejemplo) quedan como mejoras futuras de assets.
