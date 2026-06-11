# Instalador (Setup.exe)

Instalador "web" de NSIS: un `EstrategiaViralStudio-Setup.exe` chiquito (~180 KB)
que descarga el zip grande (~1 GB) del último GitHub Release durante la
instalación. El usuario ya no descomprime nada a mano.

## Cómo se construye

```powershell
# desde desktop\
powershell -ExecutionPolicy Bypass -File build-installer.ps1
# → C:\hermes-data\dist\EstrategiaViralStudio-Setup.exe
```

El script es autosuficiente, sin instalar nada en el sistema:

1. Busca `makensis` (PATH → `Program Files (x86)\NSIS` → portable en
   `C:\hermes-data\tools\nsis\`).
2. Si no hay, baja el **zip portable de NSIS 3.11** de SourceForge a
   `C:\hermes-data\tools\nsis\`.
3. Se asegura de tener el **plugin INetC** (barra de progreso de descarga);
   si falta, lo baja del wiki de NSIS y lo copia a `Plugins\`.
4. Compila `desktop\installer\instalador.nsi` con `/INPUTCHARSET UTF8`
   (el .nsi está en UTF-8 con BOM: no tocar la codificación, tiene acentos).

## Qué hace el Setup.exe (wizard en español, MUI2)

1. **Bienvenida** — explica los 3 pasos.
2. **Chequeo del sistema** — página custom que **no deja avanzar** (botón
   Siguiente deshabilitado) hasta cumplir: Windows 10/11 x64, RAM ≥ 8 GB,
   disco ≥ 8 GB libres. GPU es solo informativa. Botón "Volver a comprobar".
3. **Carpeta destino** — por defecto `C:\EstrategiaViralStudio`. Bloquea
   carpetas dentro de OneDrive y re-chequea el espacio de la unidad elegida.
4. **Instalación**:
   - Descarga `releases/latest/download/EstrategiaViralStudio-v0.1.0.zip`
     con barra de progreso (INetC), con reintento/resume si se corta.
   - Baja `SHA256SUMS.txt` del mismo release y **verifica el SHA256** del zip
     (vía `installer\instalar-helper.ps1`, empacado dentro del Setup). Si no
     coincide, lo vuelve a descargar.
   - Extrae con .NET (`ZipFile`, prefijo `\\?\` para rutas largas de
     torch/node_modules) mostrando % en el detalle. Borra el zip al final.
   - Accesos directos: **Escritorio** y **Menú Inicio** (+ Desinstalar), con
     el icono del exe (Tauri: `src-tauri\icons\icon.ico` para el Setup).
   - Registra el desinstalador en **Panel de Control / Apps** (HKLM,
     DisplayName, EstimatedSize real medido, etc.).
5. **Final** — "¡Listo, a crear!" con checkbox para abrir la app (la lanza
   vía `explorer.exe` para que NO corra como administrador) y el aviso de
   SmartScreen explicado.

El **desinstalador** (`Desinstalar.exe`) cierra la app, borra accesos
directos, vacía la carpeta con el truco `robocopy /MIR` (rutas > MAX_PATH) y
limpia el registro. No toca los videos del usuario (viven fuera, p. ej.
`C:\viral-data`).

## Publicar una versión nueva

1. Subí el zip nuevo + `SHA256SUMS.txt` (con la línea del **zip**) al release.
2. Si cambió el nombre del zip o la versión, actualizá `APP_VERSION` /
   `ZIP_NAME` arriba de `desktop\installer\instalador.nsi`.
3. Recompilá con `build-installer.ps1` y subí el `Setup.exe` como asset.

Como el instalador apunta a `releases/latest/download/...`, mientras el
nombre del zip no cambie, el mismo Setup.exe instala siempre el último release.

## Notas

- El Setup.exe no está firmado (sin costos): SmartScreen puede mostrar el
  aviso azul → "Más información" → "Ejecutar de todas formas".
- Pide permisos de administrador (UAC) para escribir en `C:\` y registrar el
  desinstalador en HKLM.
- Archivos: `desktop\installer\instalador.nsi` (script NSIS),
  `desktop\installer\instalar-helper.ps1` (verificación + extracción),
  `desktop\build-installer.ps1` (build).
