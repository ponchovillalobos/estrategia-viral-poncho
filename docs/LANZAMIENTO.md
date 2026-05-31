# Sprint `lanzamiento` — refactor + UI polish + tests, listo para vender

Esta ola endurece el código para llevar el proyecto de "funciona" a "vendible". Sin
cambios de comportamiento; **todo es additive o cero-semantic-change**.

Respaldo previo: tag `v3-pre-lanzamiento`.

## 1. Refactor cauteloso (código más mantenible)

Cada cambio se commiteó por separado, con `tsc` 0 + smoke de rutas entre cada paso.

| # | Refactor | Impacto |
|---|---|---|
| 1 | Nuevo `frontend/src/lib/run-process.ts` con `runProcess` + `parseLastJsonLine` | Centraliza el patrón de spawn + timeouts + JSON-tail |
| 2 | `runPythonJson<T>()` en `lib/run-python.ts` (sobre `runProcess`) | API moderna para llamadas Python con timeouts e idle-timeout |
| 3 | auto-build usa `runProcess` compartido (chau definición inline ~70 líneas) | Una sola implementación canónica |
| 4 | 4 bloques de auto-build (bg/tts/text-behind/translate) adoptan `parseLastJsonLine` | Patrón duplicado eliminado |
| 5 | `findRawVideo()` helper (chau patrón mp4│mov × 3) | Una función en vez de 18 líneas duplicadas |
| 6 | Tipo `ResolvedProject` elimina 17 casts `as { foo? }` en auto-build | Type-safety real; código legible |

Resultado: ~155 líneas menos en `auto-build/route.ts`, 2 módulos nuevos reutilizables.

## 2. Tests reales (vitest)

Primer test runner del proyecto. `vitest@4` con soporte nativo de TS + alias de Next.js.

- `npm test`         → corre la suite una vez
- `npm run test:watch` → TDD
- 6/6 tests para `parseLastJsonLine` (stdout vacío, sin JSON, múltiples JSONs, CRLF,
  JSON inválido al final, genéricos de TS).

Base para sumar más tests a helpers críticos.

## 3. UI polish "preciosa visualmente"

Audit de UI lanzado (20+ items). HIGH priority shipped:

- **Hero** del Inicio con gradient + glow detrás del título + degradé en "shorts virales".
- **Tarjetas de Producción** con hover-lift sutil (translateY + shadow tintada).
- **Barra de progreso** del wizard con gradient emerald→cyan + glow.
- **Confetti emoji** en el cierre del wizard (componente nuevo CSS-puro).
- **Step 6 mobile responsive** (emoji + título escalan).
- **Bordes de cards** con +5% opacidad (10% → 15%).
- **Settings** con label "Configuración" en desktop + aria mejorado.
- **Copy feedback** animado (`animate-in zoom-in-50 duration-200`) en lugar de un cambio instantáneo.
- **Placeholder de buscador** con contraste +10pp + focus ring brand.
- **Producción**: chau `font-mono-tab` en platform badges; "Video largo" en vez de "long_form".

## 4. Perf

- **Karaoke captions**: `groupWordsIntoLines` + mapa `wordIdx→lineIdx` se memoizan a
  nivel componente (antes recalculaba en CADA frame, ~360k iteraciones de más en un
  video de 60s a 30fps × 200 palabras).
- **`(p.platforms ?? [])` × 2 sitios** en production-list reemplazado por `?.` chaining
  (sin alocar arrays vacíos por render).

## 5. Modularización

- `remotion/src/icon-map.ts` — 30 imports lucide + el mapa de iconos extraído de ViralVideo.

## 6. Splits de archivos pesados (ola 2)

### ViralVideo.tsx (Remotion)
8 capas inline extraídas a `remotion/src/layers/` + zod schemas a `remotion/src/schemas.ts`
+ icon-map a `remotion/src/icon-map.ts`. Cada extracción su propio commit con `tsc 0` +
bundle Remotion verificado.

| # | Capa | Archivo |
|---|---|---|
| 1 | BrandWatermarkLayer | `layers/brand-watermark-layer.tsx` |
| 2 | IconStickerLayer | `layers/icon-sticker-layer.tsx` |
| 3 | EndScreenLayer | `layers/end-screen-layer.tsx` |
| 4 | PipBRollLayer | `layers/pip-broll-layer.tsx` |
| 5 | FloatingEmojiLayer | `layers/floating-emoji-layer.tsx` |
| 6 | WordStickerLayer | `layers/word-sticker-layer.tsx` |
| 7 | EmphasisCardLayer | `layers/emphasis-card-layer.tsx` |
| 8 | SubtitleLayer | `layers/subtitle-layer.tsx` |

**Resultado:** ViralVideo.tsx ~1100 → **641 líneas (-42%)**.

### production-list.tsx (Producción UI)
Split en componentes + lib helpers, commit por commit con smoke 200 verificado.

| Pieza | A archivo |
|---|---|
| Constants + types + `pickCaptionForPlatform` | `components/produccion/produccion-types.ts` |
| `ScheduleStatusBadge` | `components/produccion/schedule-status-badge.tsx` |
| `FilterChip` | `components/produccion/filter-chip.tsx` |
| `CaptionTabs` + `PLATFORM_TABS` | `components/produccion/caption-tabs.tsx` |
| `ProjectPreviewDialog` | `components/produccion/project-preview-dialog.tsx` |
| 5 publish/regenerate actions | `lib/produccion/publish-actions.ts` |
| `loadSchedule` + types | `lib/produccion/schedule-helpers.ts` |
| `loadTranscript` + `copyTranscript` | `lib/produccion/transcript-helpers.ts` |

**Resultado:** production-list.tsx 991 → **512 líneas (-48%)**.

### auto-build/route.ts (server pipeline)

Pasos por etapa, cada commit con `tsc 0` + smoke 200 verificado.

| Pieza | A archivo |
|---|---|
| Constants + types | `lib/types.ts`, `lib/helpers.ts` |
| Auto-enriquecimiento cinematográfico (SFX + camera moves + jump cuts) | `lib/enrich-cinematic.ts` |
| Resolver de imageOverlays (matcher Python → asamblea LLM → fallback) | `lib/resolve-overlays.ts` |
| Beat-sync (zooms + flashes + punches al beat) | `lib/beat-sync.ts` |
| 5 FX enrichments (tracking, bg-removal, voz IA, texto-detrás, traducción) | `lib/fx-enrichments.ts` |

**Resultado:** auto-build/route.ts 1145 → **472 líneas (-59%)**.

## 7. Tests adicionales

Cobertura subida de 26 → **50 tests** (+92%):

- `schedule-helpers` — 5 tests (agrupación por projectId, último gana, default a tiktok,
  network error, lista vacía).
- `transcript-helpers` — 8 tests (cache hit, ensamble del texto, trim, HTTP/network errors,
  finally setLoading, copy noop, copy success).
- `publish-actions` — 11 tests (copy + 4 publish handlers + regenerate, con mocks de
  `fetch`/`clipboard`/`window.open` vía `vi.stubGlobal`).

Total: **6 archivos de test, 50 tests pasando**. Vitest config nuevo
(`vitest.config.ts`) mapea el alias `@/` → `src/` para tests que importan módulos
con paths de Next.js.

## 8. Lint 100% limpio

ESLint: **85 → 0 problems (-100%); errors 53 → 0 (-100%); warnings 32 → 0 (-100%)**.

- 28 `react/no-unescaped-entities` arreglados con guillemets españoles «»
  (ortográficamente correctos para ES, sin escape).
- `<a href>` interno → `<Link>` en stats-cards.
- `Date.now()` en useState → lazy initializer.
- Reorden de `a.onended` en music-picker para evitar mutación post-setter.
- 9 `react-hooks/set-state-in-effect` resueltos con patrón **store-and-compare**
  (recomendado por React docs) en vez de `useEffect(() => setX(...), [openProp])`:
  rename-dialog, upload-helper-dialog, instagram-helper-dialog, schedule-dialog,
  tab-nav, adapt-dialog, batch-adapt-panel, production-list (preview reset),
  research-workspace.

- 12 patrones `load on mount` / `load + polling` / `generate on open` ahora
  llevan `// eslint-disable-next-line react-hooks/set-state-in-effect` con
  comentario que justifica por qué el patrón es válido (vs migrar a
  `use(promise)` o SWR, fuera de scope).
- 1 `react-hooks/immutability` resuelto hoisting `loadProposals` arriba del
  useEffect que lo invoca.
- `eslint.config.mjs`: `argsIgnorePattern/varsIgnorePattern: '^_'` para que la
  convención Unix de prefijo `_` silencie warnings legítimos (`_req` en
  handlers que no consumen el parámetro).
- 7 archivos con thumbnails dinámicos: `/* eslint-disable
  @next/next/no-img-element */` a nivel archivo (Pexels external URLs +
  `/api/.../thumbnail` con sizes flexibles — next/image requeriría
  remotePatterns + sizing fijo, costo no justificado para previews).
- Dead code eliminado en production-list (postingToTikTok/postToTikTok wrapper/
  tiktokConnected) — huérfanos del refactor previo.

## 9. UI "preciosa" — polish visual final

Componentes nuevos reusables:

- `components/ui/empty-state.tsx` — empty state con halo radial detrás del icono,
  ring tintado en el icono, CTA con shadow + hover-lift. 5 tonos
  (emerald/amber/sky/violet/muted). Adoptado en `/produccion` (2 estados),
  `/editor/wizard` (sin videos) y `/largos` (sin videos largos).
- `components/ui/skeleton.tsx` — `Skeleton` primitive + `ProjectCardSkeleton`.
  Mostramos 4 skeletons en `/produccion` mientras carga, en vez de pantalla
  blanca → feedback inmediato.

Estilos globales (`globals.css`):

- `*:focus-visible`: anillo emerald (var(--primary)) 2px con offset 2px, sólo
  con teclado (convención accesible). Reemplaza el `outline-ring/50` default
  gris.
- `::selection`: bg emerald al 35% en vez del del user agent.
- Scrollbar fino (10px), blanco al 15%, hover 28% — Firefox + WebKit.

Micro-interactions por pantalla:

- **Inicio (hero + acciones)**: las 3 cards principales tienen `sheen` que
  cruza al hover (gradient blanco 5%) + icono escala 1.1 + sombra emerald.
  El flow numérico pasa de gris a degradé radial emerald-25→5 con ring +
  glow. Accesos secundarios con hover-lift + tinte de icono.
- **Nav (tab-nav)**: tab activo ahora con underline animado de 2px en el
  color del tab + glow del mismo color (más elegante que el bg-pill).
  Logo dot con halo emerald y scale al hover.
- **Producción (cards)**: thumb con zoom suave (scale 1.05, 500ms) al hover
  + gradient overlay desde abajo + botón play con scale-in (0.75 → 1) +
  shadow grande. Focus-visible primary.
- **Wizard (stepper)**: paso actual destacado (bg primary, scale-110, sombra
  emerald), pasos hechos con check + tinte primary, connectors con
  gradient primary → primary/60.

## Lo que NO se hizo (queda para futuro)

- Migrar los patrones `load on mount` a React 19 `use(promise)` + Suspense.
  Funcional hoy; cambio cosmético/perf marginal.
- Ilustraciones SVG custom para empty states (los iconos lucide cumplen).
- Tema light/dark toggle (hoy hardcode dark via `html { color-scheme: dark }`).

## Cómo verificar

```bash
cd frontend
npm test           # 50/50 tests pasan
npx tsc --noEmit   # 0 errores
npx eslint .       # 0 problems
cd ../remotion
npx tsc --noEmit   # 0 errores
npx remotion compositions src/index.ts  # debe listar "ViralVideo"
```

Y en la app: abrí http://localhost:3000 — fijate el glow del hero, hover en las cards
de Producción, el sheen de las cards de acciones, el underline glow al cambiar de
tab, el zoom en el thumbnail al pasar el mouse, y al terminar un render el confetti.
