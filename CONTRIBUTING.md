# Contribuir / desarrollar

Guía rápida para trabajar en el código. Para instalar de cero, ver
[docs/SETUP.md](./docs/SETUP.md).

## Sub-proyectos

| Carpeta | Qué es | Comandos clave |
|---|---|---|
| `frontend/` | Next.js 16 (dashboard + API routes) | `npm run dev`, `npx tsc --noEmit` |
| `remotion/` | Composición de video (Remotion v4) | `node generate-luts.mjs`, `npx remotion studio`, `npx tsc --noEmit` |
| `python/` | Pipeline IA local | `venv/Scripts/python.exe <script>.py` |

## Verificación antes de commitear

```powershell
# Tipos (debe dar 0 errores en ambos)
cd frontend; npx tsc --noEmit
cd ..\remotion; npx tsc --noEmit

# Tests + paridad de estilos shorts↔largos (obligatorio — CI lo corre en cada PR)
cd frontend; npm test

# Smoke render de una capa de Remotion (sin server), ~1s:
#   armás un props.json mínimo y:  npx remotion render src/index.ts ViralVideo out.mp4 --props=props.json --frames=0-25
```

## Patrón clave: efectos ADITIVOS

Todos los efectos de video son **opt-in con defaults vacíos**. Para agregar un efecto nuevo
sin romper renders existentes:

1. **Schema** (`remotion/src/*.tsx`): nuevo campo en `viralVideoSchema` con `.default([])` /
   `.default("none")` + agregarlo a `defaultProps` y al destructuring de `ViralVideo`.
2. **Capa**: montar el componente nuevo **gated** por `campo.length > 0` (o `!== "none"`), así
   con el default no se monta y el render queda idéntico.
3. **build-props.mjs**: pasar el campo a `props` (remapeando timestamps con `filterAndRemap`
   si tiene `at`/`t`, para que respete los jump cuts).
4. **style-templates.ts**: poblar el campo desde un estilo (o desde `applyCapcutFx`).
5. (Opcional) paso Python: si el efecto necesita análisis (beats, tracking, segmentación),
   agregá un script en `python/` que devuelva JSON por stdout y llamalo desde
   `auto-build/route.ts` con `runProcess`, con fallback si falla.

Ver [docs/EFFECTS.md](./docs/EFFECTS.md) para cómo está conectado el pipeline.

## Agregar un estilo

En `frontend/src/lib/style-templates.ts`: agregá el `StyleId` (también en `lib/job-store.ts`
y en el wizard `wizard-client.tsx`), una rama en `buildProjectForStyle`, y una entrada en
`STYLE_INFO`. Pasá el resultado por `applyCapcutFx(...)` para heredar los efectos CapCut.

## Agregar una red social

Espejá la arquitectura de LinkedIn/Instagram: `lib/<red>-client.ts` (OAuth) +
`lib/<red>-upload.ts` (publicar) + `/api/auth/<red>/{login,callback}` + `/api/<red>/publish`
+ sección en `user-settings.ts` + `/setup/<red>` + botón en `production-list.tsx`.

## Estilo de código

- TypeScript estricto; matchear el estilo del archivo vecino.
- Comentarios en español (como el resto del repo), concisos y al grano.
- Nada de secretos hardcodeados: leer de `.env.local` (Pexels) o `user-settings.json` (OAuth).

## Seguridad

Nunca commitees `.env.local`, `user-settings.json`, `*.key`, `*.pem`. Ya están en
`.gitignore`. Verificá con `git status` antes del primer push.
