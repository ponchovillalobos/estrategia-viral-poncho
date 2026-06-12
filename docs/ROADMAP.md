# 🗺️ Roadmap — mejorar cada día sin que nadie nos alcance

> Filosofía: fácil, sencillo, simple pero espectacular. 100% local y gratis de
> operar. Cero servicios de pago, cero API keys, cero trámites. El foso no es
> una feature: es la COMBINACIÓN de privacidad local + costo marginal $0 +
> español nativo + cadencia de mejora que una empresa grande no puede igualar
> en este nicho.

## El motor (cadencia semanal — esto es lo que nos hace inalcanzables)

| Día | Ritual | Costo |
|---|---|---|
| Lunes | **Plantillas del estudio**: 2-3 presets nuevos al `presets/manifest.json` (commitear JSON = todos los clientes las ven ese día, sin release) | 30 min |
| Martes–Jueves | **Una mejora visible** por semana (de los horizontes de abajo), construida y probada E2E | variable |
| Viernes | Triage de issues/feedback + release menor si hubo fixes (la receta de `RELEASE.md` toma ~40 min) | 1-2 h |
| Mensual | **Vigilancia competitiva**: 1 hora revisando qué sacaron CapCut/OpusClip/Submagic — copiamos la idea, no la dependencia cloud | 1 h |
| Trimestral | **Auditoría UX con agentes** (como la de 2026-06-12): comprador escéptico recorre la app, hallazgos → plan → ejecución | 1 día |

Regla de oro de cada mejora: se prueba con un render real antes de declararla
lista, y el copy nuevo nace en mexicano.

## Horizonte 1 (semanas 1-4) — cerrar los huecos conocidos

1. **Probar el Setup en una PC limpia / máquina virtual** — pendiente desde
   v0.1.0; es lo único entre nosotros y vender con confianza.
2. **Editar el TEXTO de los subtítulos por clip** — el último gap del retoque
   (los ajustes de inicio/fin ya están). Mata el motivo #1 de devolución.
3. **Página de Ayuda dentro de la app** — FAQ de los 10 fallos comunes,
   "dónde están mis archivos", "Reportar problema" (issue de GitHub
   prellenado, el usuario ve lo que envía). El comprador nunca queda solo.
4. **Notificación de Windows** al terminar un video (plugin de Tauri,
   diseñado y listo para cablear; requiere recompilar el launcher).
5. **Cómo cobrar sin complicarse**: al inicio, venta directa (WhatsApp/
   transferencia/marketplace) + emitir la licencia con `sign-license.mjs`.
   Una landing simple en GitHub Pages (gratis) con el video demo y el botón
   de descarga del trial — el trial YA es el vendedor.

## Horizonte 2 (mes 2) — lo que hace doler no comprarla

6. **Pegar un link de YouTube** en videos largos (yt-dlp ya está en el venv) —
   el flujo OpusClip completo sin descargar nada a mano.
7. **Modo agencia**: arrastrar 10 videos → la fila los procesa todos con la
   misma plantilla. Justifica el tier de $499 por sí solo.
8. **Voz IA y audio pro** (Piper ya está en `python/`): "✨ Mejorar audio" en
   shorts (la cadena de mastering de largos ya existe) + narrar textos.
9. **Auto-portada**: elegir el mejor frame + título encima → thumbnail listo
   para YouTube/TikTok.
10. **Métricas que aprenden**: registrar cómo le fue a cada video publicado
    (ya existe /metricas) y que el sistema sugiera "tus videos estilo X con
    música Y rinden mejor".

## Horizonte 3 (mes 3+) — adelantarse, no alcanzar

11. **Auto-reframe 16:9→9:16 siguiendo a la persona** (track_subject.py ya
    rastrea caras) — feature premium de CapCut, gratis aquí.
12. **Temporadas de estilos**: cada 1-2 meses, 2-3 temas editoriales nuevos
    (el motor de 17 temas da para 30) anunciados como "colección" — el
    producto se siente vivo y coleccionable.
13. **B-roll multi-fuente** con fallback (Pexels ya está; sumar bancos CC0)
    para que ninguna palabra clave quede "seca".
14. **Plantillas basadas en tendencias**: el módulo research ya analiza
    virales ajenos — convertir lo aprendido en presets del feed cada semana.
15. **Comunidad open-source**: changelog público, "qué viene" visible en este
    archivo, aceptar issues — cada usuario se vuelve tester y vendedor.

## Lo que NO vamos a hacer (el foso también se cava diciendo no)

- Timeline multipista tipo CapCut (meses de trabajo para competir donde
  CapCut es gratis; nuestros sliders + texto editable capturan el 80%).
- Cualquier cosa con suscripción, API key de pago, servidor propio o
  certificados de pago.
- Telemetría/analytics que llamen a casa — la privacidad ES el producto.
- 48 idiomas de paridad — español impecable > checklist de marketing.

## Métricas de que vamos ganando (sin telemetría, respetando la privacidad)

- Descargas por release en GitHub (públicas).
- Licencias emitidas por mes (tu registro local).
- Issues abiertos vs cerrados por semana.
- Tiempo de "instalo → primer video generado" en cada prueba de PC limpia
  (meta: < 30 minutos incluyendo descargas).
