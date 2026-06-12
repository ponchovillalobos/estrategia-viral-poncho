# 🚢 Checklist para publicar una versión nueva

Cómo pasar del código a un release descargable en GitHub. Todo se corre desde
la raíz del repo en PowerShell, salvo que se indique otra cosa.

## 0. Antes de empezar

- [ ] Sube la versión en LOS TRES lugares (deben coincidir): `frontend/src/lib/app-version.ts`,
  `desktop/src-tauri/tauri.conf.json` y `desktop/installer/instalador.nsi` (APP_VERSION —
  el ZIP_NAME se deriva de ahí y DEBE coincidir con el nombre del zip que subas).
- [ ] Working tree limpio (`git status`) y cambios pusheados a `main`.

## 1. Build del frontend (server de producción)

```powershell
cd frontend
npx next build
cd ..
```

## 2. Exe del launcher (Tauri) — solo si cambió `desktop/`

```powershell
cd desktop
npm install
npx tauri build
cd ..
```

## 3. Payload autocontenido + SHA256

```powershell
# Si nunca lo corriste en esta máquina: primero el runtime de Python portable
powershell -ExecutionPolicy Bypass -File desktop\make-python-runtime.ps1

powershell -ExecutionPolicy Bypass -File desktop\bundle.ps1
# → desktop\src-tauri\target\release\  (desktop.exe + payload\ + SHA256SUMS.txt)
```

- [ ] **Prueba el exe** en frío: `desktop\src-tauri\target\release\desktop.exe`
  (abre la app, genera una vista previa). No publiques sin esto.

## 4. Zip del paquete

```powershell
$v = "v0.1.1"   # ← la versión nueva
cd desktop\src-tauri\target\release
tar -a -c -f "EstrategiaViralStudio-$v.zip" desktop.exe payload SHA256SUMS.txt
```

## 5. Checksums del zip

```powershell
Get-FileHash "EstrategiaViralStudio-$v.zip" -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash)  EstrategiaViralStudio-$v.zip" } |
  Add-Content SHA256SUMS.txt
Get-Content SHA256SUMS.txt   # verifica que estén exe + zip
```

## 6. Publicar el release

```powershell
gh release create $v `
  "EstrategiaViralStudio-$v.zip" `
  "EstrategiaViralStudio-Setup.exe" `
  SHA256SUMS.txt `
  --title "Estrategia Viral Studio $v" `
  --notes "Qué hay de nuevo: ..."
```

## 6.5 Instalador NSIS (entre el zip y el release)

```powershell
& desktop\build-installer.ps1
# → desktop\installer\EstrategiaViralStudio-Setup.exe
# Agrega su hash a SHA256SUMS.txt antes de publicar.
```

## 7. Después de publicar

- [ ] Abre [Releases → latest](https://github.com/ponchovillalobos/viralito/releases/latest)
  y verifica que el zip se baje y el nombre/versión sean correctos (el Setup
  descarga `EstrategiaViralStudio-v{APP_VERSION}.zip` de latest — si el nombre
  no coincide, el instalador de esa versión muere).
- [ ] Arranca una versión vieja de la app y confirma que el aviso de
  "hay versión nueva" aparece (update-check).
