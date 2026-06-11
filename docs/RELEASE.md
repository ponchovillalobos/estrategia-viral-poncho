# 🚢 Checklist para publicar una versión nueva

Cómo pasar del código a un release descargable en GitHub. Todo se corre desde
la raíz del repo en PowerShell, salvo que se indique otra cosa.

## 0. Antes de empezar

- [ ] Subí la versión en `frontend/src/lib/app-version.ts` (y donde aplique en `desktop/`).
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

- [ ] **Probá el exe** en frío: `desktop\src-tauri\target\release\desktop.exe`
  (abrí la app, generá una vista previa). No publiques sin esto.

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
Get-Content SHA256SUMS.txt   # verificá que estén exe + zip
```

## 6. Publicar el release

```powershell
gh release create $v `
  "EstrategiaViralStudio-$v.zip" `
  SHA256SUMS.txt `
  --title "Estrategia Viral Studio $v" `
  --notes "Qué hay de nuevo: ..."
# Si existe instalador (Setup.exe de NSIS/tauri bundle), agregalo a la lista.
```

## 7. Después de publicar

- [ ] Abrí [Releases → latest](https://github.com/ponchovillalobos/estrategia-viral-poncho/releases/latest)
  y verificá que el zip se baje y el nombre/versión sean correctos.
- [ ] Arrancá una versión vieja de la app y confirmá que el aviso de
  "hay versión nueva" aparece (update-check).

> Nota: hoy no existe `build-installer.ps1`; el paquete oficial es el `.zip`
> portable. Si se agrega un instalador NSIS, corrélo entre los pasos 3 y 4 y
> subí también el `Setup.exe` + su hash en `SHA256SUMS.txt`.
