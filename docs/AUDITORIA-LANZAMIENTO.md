# Auditoría de lanzamiento — plan de ejecución

> **2026-06-10** · Auditoría multi-agente: 6 especialistas simultáneos (seguridad,
> robustez, rendimiento, UX, distribución 1-click, calidad) + verificación
> adversarial de cada hallazgo grave (un agente independiente intentó REFUTAR
> cada uno leyendo el código real). 33 agentes, 597 lecturas de código.
>
> **Resultado: 72 hallazgos → 11 graves CONFIRMADOS · 16 refutados (falsas
> alarmas eliminadas) · 45 menores.** Lo que sigue es el plan para dejar la app
> lista para publicar: filosofía 1 click, cero fallos en manos de usuarios.

## Veredicto ejecutivo

La app está **sólida en seguridad** (sin path traversal explotable, sin secretos
en el repo público — verificado con `git log -S` sobre todo el historial, bind a
localhost) y el motor de edición funciona. Lo que la separa del lanzamiento es la
**experiencia de primera ejecución en una máquina limpia**: hoy un usuario nuevo
puede ver pantalla en blanco (puerto ocupado), una transcripción que "se cuelga"
(descarga de modelo de 1.5 GB sin barra y con timeout de 10 min que la mata), y
errores con stack traces en inglés. Eso es lo que se arregla en las fases 1-2.

---

## FASE 1 — Bloqueantes de lanzamiento (sin esto NO se publica)

### 1.1 Puerto 3100 sin verificar → pantalla en blanco [CRÍTICA · distribución]
- `desktop/src-tauri/src/lib.rs:108-116` — `spawn_server()` silencia errores
  (`eprintln` invisible en GUI) + sleep ciego de 1200ms. Si el 3100 está ocupado,
  node arranca y muere ~1s después; el webview muestra blanco **o el contenido de
  OTRA app que use ese puerto**. Cierre sucio deja node.exe zombi ocupando el
  puerto para el próximo arranque.
- **Fix**: healthcheck HTTP a localhost:3100 con timeout (poll 200ms × 25s);
  si falla → diálogo nativo con el motivo (EADDRINUSE/EACCES parseado del stderr
  de node). Mejor aún: elegir puerto libre dinámicamente y pasarlo a la ventana.
  Al boot, matar node.exe zombi propio (PID file).

### 1.2 Primera transcripción: descarga ~1.5 GB sin feedback y el timeout la MATA [ALTA · distribución]
- Los modelos WhisperX no van en el payload (`bundle.ps1:9`). En el primer uso,
  `whisperx.load_model()` descarga en silencio ("cargando modelo…" solo en
  stderr). **Agravante encontrado por el verificador**: `run-python.ts:75-77`
  mata el proceso a los 10 min exactos → en conexión lenta la primera
  transcripción FALLA con "transcribe failed". Y el wizard transcribe en
  paralelo → varios procesos descargan el mismo modelo a la vez.
- **Fix**: onboarding de primer arranque que invoque `python transcribe.py
  --download-model small` (ya existe, línea 256) con pantalla "Descargando el
  modelo de voz (~1.5 GB, solo la primera vez)" + progreso; reemplazar el kill
  ciego de 10 min por idle-timeout; serializar la primera transcripción.

### 1.3 "Doctor" de instalación: venv/runtime roto = app muerta sin diagnóstico [ALTA · robustez]
- `run-process.ts:85-92` **descarta el error de spawn** (resuelve con stderr
  vacío): si python.exe falta no hay diagnóstico ALGUNO. Imports de whisperx sin
  try/except → ModuleNotFoundError crudo. No existe ningún pre-flight: ni el
  launcher (que si el runtime falta abre la ventana igual), ni bootstrap, ni
  ninguna ruta API valida el entorno.
- **Fix**: (a) `run-process.ts`: concatenar `String(err)` al stderr en el handler
  de error; (b) ruta `GET /api/doctor` que valide python+imports+ffmpeg+node y
  devuelva qué falta en español; (c) el launcher la consulta al arrancar y
  muestra qué reparar; (d) botón "Verificar instalación" en Configuración.

### 1.4 Errores crudos al usuario [ALTA · ux]
- `auto-build/route.ts:274,357,491` guarda stderr técnico en `error`;
  `wizard-client.tsx:1314` lo muestra tal cual — y por el doble slice el usuario
  ve un fragmento del MEDIO de un stack trace de Chromium.
- **Fix**: capa única `humanizeError()` que mapee los casos conocidos (ENOSPC →
  "Disco lleno, liberá espacio", ENOENT ffmpeg → "Falta un componente, abrí
  Configuración → Verificar instalación", timeout → "El video tardó demasiado,
  probá de a uno") con el detalle técnico colapsable. Aplicar en auto-build,
  render, transcribe y long_form.

### 1.5 ffmpeg literal en vez de FFMPEG_EXE — mastering y LUT se saltan EN SILENCIO [ALTA · descubierto por un verificador]
- `auto-build/route.ts:382 y :433` spawnean el literal `"ffmpeg"` en vez de
  `FFMPEG_EXE` de paths.ts → en máquinas sin ffmpeg en el PATH del sistema (la
  mayoría de los usuarios finales), el audio mastering y el color grade LUT no
  se aplican y nadie se entera. **Fix de 1 línea × 2.**

### 1.6 SmartScreen y canal de distribución [ALTA · distribución]
- Sin firma de código, Windows 11 muestra "Windows protegió su PC" en toda
  máquina nueva. Además **GitHub Releases limita assets a 2 GB y el payload pesa
  5-7 GB** → el plan de distribución actual no alcanza tal cual.
- **Fix mínimo viable**: (a) instrucciones con captura "Más información →
  Ejecutar de todas formas" en el README; (b) SHA256 publicado; (c) partir la
  descarga: instalador chico + payload descargado por el launcher en el primer
  arranque con progreso (resuelve también el límite de 2 GB); (d) firma de
  código (~$150-300/año) cuando haya presupuesto; Microsoft Store como opción.

### 1.7 OAuth de redes apunta a localhost:3000 en la app empaquetada [MEDIA-ALTA]
- `instagram-client.ts:35`, `linkedin-client.ts:71`, `tiktok-client.ts:22`:
  `getBaseUrl()` defaultea a `localhost:3000`, pero la app desktop corre en 3100
  → el callback OAuth redirige a un puerto donde no escucha nadie. OJO: setear
  `NEXT_PUBLIC_BASE_URL` en el launcher NO sirve (Next la inlinea en build time).
- **Fix**: leer `process.env.VIRAL_API_HOST` (runtime, ya exportada por el
  launcher) antes del fallback, en los 3 clientes.

## FASE 2 — Robustez (que NUNCA se trabe)

### 2.1 Lock de render fantasma tras cierre de la app [ALTA]
- Cerrar la app desktop mata node con TerminateProcess → el `finally` que libera
  el `.__lock` no corre. El usuario queda con "409 ya hay un render en curso"
  hasta 30 min, sin guía. **OJO**: el fix del auditor original (bajar stale a
  5 min) fue REFUTADO — un render legítimo dura hasta 25 min y se robaría el
  lock a mitad de un render vivo.
- **Fix correcto (del verificador)**: el lock ya guarda el PID — validar vida
  con `process.kill(pid, 0)` (ESRCH → robar al instante) + barrer
  `RENDERS_DIR/*.__lock` en el boot del server (los de un boot anterior son
  huérfanos por definición).

### 2.2 Race de props.json en renders paralelos de largos [MEDIA·ALTO esfuerzo — verificar]
- Reportado: dos workers escribiendo el mismo props. El pipeline ya usa
  `props_{clip_id}_{style_id}.json` único — auditar si queda algún camino con
  nombre fijo y cerrarlo.

### 2.3 Mensajes accionables para los casos físicos [MEDIA]
- Disco lleno (ENOSPC → mensaje en español + pre-check de 500 MB antes de
  renders), video corrupto vs subida truncada (distinguir spawn-error ENOENT de
  ffprobe del "video corrupto" — hoy `save-upload.ts:91-101` culpa al video
  cuando falta ffmpeg), OneDrive lockeando archivos (renameWithRetry agotado →
  decir "otro programa está usando el archivo").
- Negative-cache de thumbnails: un video corrupto hoy reintenta
  ffprobe(8s)+ffmpeg(30s) en CADA carga de la galería → escribir `{id}.failed`
  y devolver placeholder.

## FASE 3 — Rendimiento (lo que falta tras el perfil adaptativo)

### 3.1 Largos: un proceso de Python POR CLIP re-carga el modelo Whisper [ALTA]
- El hotspot real (corregido por el verificador): `extract_clips.py:347-373`
  spawnea un transcribe.py NUEVO por cada clip — con 15+ clips son 15+ cargas de
  modelo+torch (~15-60s c/u en CPU) = varios minutos de overhead puro por video.
- **Fix simple**: transcribe.py acepta N paths y los procesa con UNA carga de
  modelo; extract_clips lo invoca una sola vez con todos los clips. (El daemon
  persistente queda como mejora futura.)

### 3.2 Remotion re-bundlea el proyecto en cada render [MEDIA]
- Usar `bundle()` cacheado (o `npx remotion bundle` pre-armado en el payload) y
  renderizar con `--serve-url` apuntando al bundle: ahorra ~20-40s por render.

### 3.3 Menores acumulativos [MEDIA/BAJA]
- Sweep de huérfanos también en boot (hoy solo cada 12h), poda de `previews/`,
  paginación en /produccion, lazy real de miniaturas del wizard (hoy carga
  todas), arranque del launcher con healthcheck en vez del delay fijo de 1.2s.

## FASE 4 — UX final "que un niño la use"

- `long-form-wizard.tsx:710-711`: badges **"transcript" y "clean" crudos** →
  "Transcripción lista" / "Texto limpio" + tooltip (los vecinos ya están en
  español). [confirmado]
- EmptyState del paso 1 muestra un **path absoluto crudo** ("copiá MP4s a
  C:\hermes-data\videos\raw") → usar el prop `cta` que EmptyState ya soporta con
  botón grande "Importar desde mi compu" (NO prometer drag&drop: no existe
  handler onDrop hoy). [confirmado]
- Configuración: las credenciales OAuth de TikTok/LinkedIn/Instagram sin
  contexto asustan a un usuario nuevo → moverlas a una sección colapsada
  "Avanzado: publicar en redes (opcional)".
- Jerga restante: "limpiar" (paso 1), "asamblea" (cinematográfico), toasts en
  inglés residuales.
- Rutas vivas fuera de menú (/metricas, /research): decidir — o se eliminan del
  build o se documentan como "experimentales".

## FASE 5 — Calidad (que no vuelva a romperse)

### 5.1 Cero tests E2E del corazón [CRÍTICA]
- transcribe → auto-build → project JSON → render: 0 tests (auto-build/route.ts
  530 líneas + lib 970 + style-templates 1133). La paridad ts↔mjs **ya divergió
  una vez en producción** (largos sin LUT/scene-fx, documentado en
  check-style-parity.mjs) y el check no corre en `npm test`.
- **Fix**: (a) test de integración con vitest que importe el handler de
  auto-build con un transcript de muestra y valide el project JSON; (b) agregar
  `node remotion/check-style-parity.mjs` al script `test`; (c) smoke render de
  1 frame por estilo como script de release.

### 5.2 Menores
- console.log de debug (20+), tipos `unknown[]` en ResolvedProject, validación
  de `captionMeta`, rutas legacy single-video.

## FASE 6 — Empaque final y publicación

1. Re-build completo del payload (hoy es un snapshot pre-Editorial v3):
   `next build` + `bundle.ps1`.
2. Instalador chico + descarga de payload/modelos en primer arranque (resuelve
   GitHub 2 GB + SmartScreen parcialmente).
3. Probar en **máquina virtual limpia** (sin node, sin python, sin ffmpeg, sin
   internet rápido): instalación → onboarding → primer video editado. Este es el
   test de aceptación del lanzamiento.
4. README público con: requisitos, capturas del flujo, instrucciones SmartScreen,
   SHA256, sección de donaciones (FUNDING.yml ya está).

---

## Falsas alarmas eliminadas por la verificación adversarial (16)

Para que no perdamos tiempo en ellas (cada una fue refutada leyendo el código):
la key de Pexels **NO** está en el repo público (verificado `git log -S` en todo
el historial — solo existe localmente y el .example ya está); CORS de
/api/music/stream es necesario para Remotion y no expone nada; el editorial
degrada bien sin Ollama (badge "modo heurístico" ya existe); el polling de 3s es
correcto para una app local mono-usuario (los endpoints leen de memoria);
thumbnails YA tienen caché en disco + browser; el runtime embeddable ES
relocatable (la nota de pyvenv.cfg era del venv de dev, ya migrado); los datos
van SIEMPRE a %USERPROFILE% (Program Files no los rompe); `frontendDist: ../src`
es inocuo (la ventana carga la URL del server local; "corregirlo" habría
embebido cientos de MB inútiles en el exe); bundle.ps1 SÍ copia npm/npx y
node_modules; el JSON parsing de las rutas ya valida campos requeridos a mano;
ENOSPC ya limpia los temporales en todos los caminos.

## Orden de ejecución sugerido

| Fase | Qué desbloquea | Esfuerzo |
|---|---|---|
| F1 (1.1-1.7) | Poder instalar y usar en máquina limpia sin sustos | ~2-3 sesiones |
| F2 | Cero trabas fantasma | ~1 sesión |
| F4 | Pulido "para un niño" | ~1 sesión |
| F5.1 | Red de seguridad antes de tocar más código | ~1 sesión |
| F3 | Largos mucho más rápidos | ~1 sesión |
| F6 | PUBLICAR 🚀 | ~1-2 sesiones + VM de prueba |
