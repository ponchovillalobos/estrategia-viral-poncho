# make-python-runtime.ps1 — Construye el Python PORTABLE del instalador.
# El venv de desarrollo NO es relocatable (pyvenv.cfg apunta al Python base);
# este script arma python/runtime/ con el Python EMBEDDABLE oficial + todas las
# dependencias instaladas adentro → corre en cualquier Windows x64 sin instalar nada.
#
# Uso:  powershell -ExecutionPolicy Bypass -File make-python-runtime.ps1
# Resultado: {repo}\python\runtime\  (~4-6 GB por torch; una sola vez, idempotente)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path "$PSScriptRoot\.."
$rt = "$repo\python\runtime"
$ver = "3.11.9"

if (Test-Path "$rt\python.exe") {
  Write-Host "== runtime ya existe en $rt (borralo para reconstruir)"
} else {
  Write-Host "[1/4] Descargando Python $ver embeddable..."
  New-Item -ItemType Directory -Force $rt | Out-Null
  $zip = "$env:TEMP\python-embed.zip"
  Invoke-WebRequest "https://www.python.org/ftp/python/$ver/python-$ver-embed-amd64.zip" -OutFile $zip
  Expand-Archive $zip $rt -Force
  Remove-Item $zip -Force

  # Habilitar site-packages (el embeddable lo trae apagado por default).
  Write-Host "[2/4] Habilitando site-packages..."
  $pth = "$rt\python311._pth"
  (Get-Content $pth) -replace "^#import site", "import site" | Set-Content $pth -Encoding ascii

  Write-Host "[3/4] Instalando pip..."
  Invoke-WebRequest "https://bootstrap.pypa.io/get-pip.py" -OutFile "$rt\get-pip.py"
  & "$rt\python.exe" "$rt\get-pip.py" --no-warn-script-location
  Remove-Item "$rt\get-pip.py" -Force
}

Write-Host "[4/4] Instalando dependencias (torch CPU primero; esto tarda MUCHO)..."
& "$rt\python.exe" -m pip install --no-warn-script-location torch torchaudio --index-url https://download.pytorch.org/whl/cpu
& "$rt\python.exe" -m pip install --no-warn-script-location -r "$repo\python\requirements.txt"

# Smoke test: los imports pesados deben cargar.
Write-Host "== Smoke test..."
& "$rt\python.exe" -c "import torch, librosa, numpy, cv2, mediapipe; print('runtime OK · torch', torch.__version__)"
$size = (Get-ChildItem $rt -Recurse -File | Measure-Object Length -Sum).Sum / 1GB
Write-Host ("== Python runtime listo: {0:N1} GB en {1}" -f $size, $rt)
