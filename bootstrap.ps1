# =============================================================================
# bootstrap.ps1 â€” Setup automÃ¡tico de Estrategia Viral Poncho en mÃ¡quina nueva
# =============================================================================
#
# Uso:
#   1. Instalar primero: Node.js 24, Python 3.11, Git, Ollama (ver PREREQUISITES.md)
#   2. Clonar el repo: git clone <url> Estrategia_Viral_Poncho
#   3. cd Estrategia_Viral_Poncho
#   4. .\bootstrap.ps1
#
# Este script:
#   - Verifica prerequisitos
#   - Crea estructura de carpetas en C:\viral-data\
#   - Descarga FFmpeg portable
#   - Clona pack SFX CC0 y cura 14 archivos
#   - Pulla modelos Ollama (qwen3:1.7b)
#   - Instala deps de frontend
#   - Instala deps de remotion
#   - Crea venv Python e instala whisperx + silero-vad + torch CPU
#   - Pre-descarga modelos WhisperX
#   - Crea .env.local template
# =============================================================================

$ErrorActionPreference = "Stop"
$script:errors = @()

function Write-Step($msg) { Write-Host "`n[step] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  âš    $msg" -ForegroundColor Yellow }
function Write-Err($msg) {
  Write-Host "  âœ—   $msg" -ForegroundColor Red
  $script:errors += $msg
}

# Detectar root del proyecto (donde estÃ¡ este script)
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot
Write-Host "`n=== bootstrap.ps1 â€” Estrategia Viral Poncho ===" -ForegroundColor Magenta
Write-Host "Project root: $ProjectRoot`n"

# =============================================================================
# STEP 1: Verificar prerequisitos manuales
# =============================================================================
Write-Step "Verificando prerequisitos manuales"

# Node
try {
  $nodeVer = & node --version 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Ok "Node: $nodeVer" }
  else { throw }
} catch {
  # Intentar agregar path estÃ¡ndar
  $stdNode = "C:\Program Files\nodejs"
  if (Test-Path "$stdNode\node.exe") {
    $env:PATH = "$stdNode;$env:PATH"
    Write-Ok "Node encontrado en $stdNode (agregado a PATH)"
  } else {
    Write-Err "Node.js no encontrado. Instalar desde https://nodejs.org/"
  }
}

# Python
try {
  $pyVer = & python --version 2>$null
  if ($pyVer -match "3\.11\.") { Write-Ok "Python: $pyVer" }
  elseif ($LASTEXITCODE -eq 0) { Write-Warn "Python detectado pero NO es 3.11: $pyVer (puede dar problemas)" }
  else { throw }
} catch {
  Write-Err "Python 3.11 no encontrado. Instalar desde https://www.python.org/downloads/release/python-3119/"
}

# Git
try {
  $gitVer = & git --version 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Ok "Git: $gitVer" }
  else { throw }
} catch {
  Write-Err "Git no encontrado. Instalar desde https://git-scm.com/download/win"
}

# Ollama
try {
  $r = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
  Write-Ok "Ollama corriendo Â· modelos instalados: $($r.models.Count)"
  $script:ollamaOk = $true
} catch {
  Write-Warn "Ollama no responde en localhost:11434. Necesario para long_form."
  Write-Warn "Instalar desde https://ollama.com/download/windows"
  $script:ollamaOk = $false
}

# =============================================================================
# STEP 2: Crear estructura de carpetas en C:\viral-data
# =============================================================================
Write-Step "Creando estructura de carpetas en C:\viral-data"

$folders = @(
  "C:\viral-data\tools",
  "C:\viral-data\videos\raw",
  "C:\viral-data\videos\transcripts",
  "C:\viral-data\videos\cuts",
  "C:\viral-data\videos\renders",
  "C:\viral-data\videos\projects",
  "C:\viral-data\videos\assets\broll",
  "C:\viral-data\videos\assets\music",
  "C:\viral-data\videos\assets\sfx\source",
  "C:\viral-data\videos\assets\sfx\curated",
  "C:\viral-data\videos\long_form\raw",
  "C:\viral-data\videos\long_form\transcripts",
  "C:\viral-data\videos\long_form\cuts",
  "C:\viral-data\videos\long_form\clean",
  "C:\viral-data\videos\long_form\proposals",
  "C:\viral-data\videos\long_form\clips",
  "C:\viral-data\videos\long_form\projects",
  "C:\viral-data\videos\long_form\renders"
)
foreach ($f in $folders) {
  if (-not (Test-Path $f)) { New-Item -ItemType Directory -Force -Path $f | Out-Null }
}
Write-Ok "$($folders.Count) carpetas creadas/verificadas"

# =============================================================================
# STEP 3: Descargar FFmpeg portable
# =============================================================================
Write-Step "Descargando FFmpeg portable"

$ffmpegExists = Get-ChildItem "C:\viral-data\tools\" -Directory -Filter "ffmpeg-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ffmpegExists) {
  Write-Ok "FFmpeg ya existe en $($ffmpegExists.FullName)"
} else {
  try {
    $url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    $zip = "C:\viral-data\tools\ffmpeg.zip"
    Write-Host "  Descargando $url (~90 MB)..." -NoNewline
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Write-Host " OK"
    Expand-Archive -Path $zip -DestinationPath "C:\viral-data\tools\" -Force
    Remove-Item $zip
    $ffmpegDir = Get-ChildItem "C:\viral-data\tools\" -Directory -Filter "ffmpeg-*" | Select-Object -First 1
    Write-Ok "FFmpeg extraÃ­do: $($ffmpegDir.Name)"
  } catch {
    Write-Err "Error descargando FFmpeg: $_"
  }
}

# =============================================================================
# STEP 4: Clonar pack SFX CC0 + curar 14 archivos
# =============================================================================
Write-Step "Descargando pack SFX (CC0 Public Domain Sounds)"

$sfxSource = "C:\viral-data\videos\assets\sfx\source"
if ((Test-Path "$sfxSource\.git") -and (Test-Path "$sfxSource\kenney_interfacesounds")) {
  Write-Ok "Pack SFX ya clonado"
} else {
  try {
    Push-Location $sfxSource
    & git clone --depth=1 https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds.git . 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Pack SFX clonado"
  } catch {
    Write-Err "Error clonando pack SFX: $_"
  }
}

Write-Step "Curando 14 SFX en assets/sfx/curated/"

$sfxDest = "C:\viral-data\videos\assets\sfx\curated"
$sfxMap = @{
  "whoosh.ogg"       = "$sfxSource\kenney_interfacesounds\Audio\back_001.ogg"
  "swoosh.wav"       = "$sfxSource\Micro Pack - Organic Wooshes\Classic Swish 1.wav"
  "swoosh_soft.wav"  = "$sfxSource\Micro Pack - Organic Wooshes\Gentle Swish.wav"
  "swoosh_quick.wav" = "$sfxSource\Micro Pack - Organic Wooshes\Swish 2.wav"
  "water_drop.ogg"   = "$sfxSource\40-cc0-water-splash-slime-sfx\bubble_01.ogg"
  "bloop.ogg"        = "$sfxSource\40-cc0-water-splash-slime-sfx\bubble_02.ogg"
  "splash.ogg"       = "$sfxSource\40-cc0-water-splash-slime-sfx\splash_01.ogg"
  "pop.ogg"          = "$sfxSource\kenney_interfacesounds\Audio\drop_001.ogg"
  "pop_short.ogg"    = "$sfxSource\kenney_interfacesounds\Audio\drop_002.ogg"
  "click.ogg"        = "$sfxSource\kenney_uiaudio\Audio\click1.ogg"
  "ding.ogg"         = "$sfxSource\kenney_interfacesounds\Audio\confirmation_001.ogg"
  "ding_bell.ogg"    = "$sfxSource\kenney_interfacesounds\Audio\confirmation_002.ogg"
  "notification.ogg" = "$sfxSource\kenney_interfacesounds\Audio\bong_001.ogg"
  "thud.wav"         = "$sfxSource\Micro Pack - Organic Wooshes\Thunk 1.wav"
}
$copied = 0
foreach ($k in $sfxMap.Keys) {
  if (Test-Path $sfxMap[$k]) {
    Copy-Item $sfxMap[$k] (Join-Path $sfxDest $k) -Force
    $copied++
  }
}
Write-Ok "$copied/$($sfxMap.Count) SFX copiados a curated/"

# =============================================================================
# STEP 5: Pull modelo Ollama qwen3:1.7b
# =============================================================================
if ($script:ollamaOk) {
  Write-Step "Verificando modelo Ollama qwen3:1.7b (1.3 GB)"
  try {
    $models = Invoke-RestMethod -Uri "http://localhost:11434/api/tags"
    $hasQwen = $models.models | Where-Object { $_.name -like "qwen3:1.7b*" }
    if ($hasQwen) {
      Write-Ok "qwen3:1.7b ya instalado"
    } else {
      Write-Host "  Descargando qwen3:1.7b (~1.3 GB, primera vez)..." -ForegroundColor Yellow
      & ollama pull qwen3:1.7b
      Write-Ok "qwen3:1.7b descargado"
    }
  } catch {
    Write-Err "Error con Ollama: $_"
  }
}

# =============================================================================
# STEP 6: npm install en frontend
# =============================================================================
Write-Step "Instalando deps de frontend (~700 MB, ~3 min)"

$env:PATH = "C:\Program Files\nodejs;$env:PATH"
Push-Location "$ProjectRoot\frontend"
if (Test-Path "node_modules") {
  Write-Ok "frontend/node_modules ya existe (skip)"
} else {
  try {
    & npm install 2>&1 | Out-Null
    Write-Ok "frontend deps instaladas"
  } catch {
    Write-Err "Error en npm install frontend: $_"
  }
}
Pop-Location

# Crear .env.local si no existe
if (-not (Test-Path "$ProjectRoot\frontend\.env.local")) {
  if (Test-Path "$ProjectRoot\frontend\.env.local.example") {
    Copy-Item "$ProjectRoot\frontend\.env.local.example" "$ProjectRoot\frontend\.env.local"
    Write-Ok ".env.local creado desde template"
    Write-Warn "Editar frontend\.env.local y poner tu PEXELS_API_KEY"
  } else {
    @"
# Pexels API key - obtenela en https://www.pexels.com/api/new/
PEXELS_API_KEY=
"@ | Out-File "$ProjectRoot\frontend\.env.local" -Encoding utf8
    Write-Warn ".env.local creado vacÃ­o. Editar y poner tu PEXELS_API_KEY"
  }
}

# =============================================================================
# STEP 7: npm install en remotion
# =============================================================================
Write-Step "Instalando deps de remotion (~500 MB, ~3 min)"

Push-Location "$ProjectRoot\remotion"
if (Test-Path "node_modules") {
  Write-Ok "remotion/node_modules ya existe (skip)"
} else {
  try {
    & npm install 2>&1 | Out-Null
    Write-Ok "remotion deps instaladas"
  } catch {
    Write-Err "Error en npm install remotion: $_"
  }
}
Pop-Location

# =============================================================================
# STEP 8: Crear venv Python + instalar deps
# =============================================================================
Write-Step "Creando venv Python + deps (~3 GB, ~10 min)"

Push-Location "$ProjectRoot\python"

if (Test-Path "venv\Scripts\python.exe") {
  Write-Ok "python/venv ya existe (skip creaciÃ³n)"
} else {
  try {
    & python -m venv venv
    Write-Ok "venv creado"
  } catch {
    Write-Err "Error creando venv: $_"
  }
}

# torch CPU primero
$pyExe = "$ProjectRoot\python\venv\Scripts\python.exe"
if (Test-Path $pyExe) {
  try {
    & $pyExe -c "import torch" 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "torch ya instalado"
    } else {
      Write-Host "  Instalando torch CPU + torchaudio (~2 GB)..." -ForegroundColor Yellow
      & $pyExe -m pip install --upgrade pip --quiet
      & $pyExe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
      Write-Ok "torch CPU instalado"
    }
  } catch {
    Write-Err "Error instalando torch: $_"
  }

  try {
    & $pyExe -c "import whisperx, silero_vad" 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "whisperx + silero-vad ya instalados"
    } else {
      Write-Host "  Instalando whisperx + silero-vad + utilidades..." -ForegroundColor Yellow
      & $pyExe -m pip install whisperx silero-vad numpy ffmpeg-python --quiet
      Write-Ok "whisperx + silero-vad instalados"
    }
  } catch {
    Write-Err "Error instalando deps Python: $_"
  }
}
Pop-Location

# =============================================================================
# STEP 9: Pre-descargar modelos WhisperX
# =============================================================================
Write-Step "Pre-descargando modelos WhisperX (small espaÃ±ol + alignment, ~1.5 GB)"

if (Test-Path "$pyExe") {
  Push-Location "$ProjectRoot\python"
  try {
    & $pyExe transcribe.py --download-model small 2>&1 | Out-Null
    Write-Ok "Modelos WhisperX descargados"
  } catch {
    Write-Warn "Error descargando modelos WhisperX. Se descargarÃ¡n en la primera transcripciÃ³n."
  }
  Pop-Location
}

# =============================================================================
# STEP 10: VerificaciÃ³n final
# =============================================================================
Write-Step "VerificaciÃ³n final"

$ffmpegFolder = Get-ChildItem "C:\viral-data\tools\" -Directory -Filter "ffmpeg-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ffmpegFolder -and (Test-Path (Join-Path $ffmpegFolder.FullName "bin\ffmpeg.exe"))) {
  Write-Ok "FFmpeg detectable: $($ffmpegFolder.Name) (auto-detect activo)"
} else {
  Write-Err "FFmpeg no detectable en C:\viral-data\tools\ffmpeg-*\bin\"
}

$sfxCount = (Get-ChildItem "C:\viral-data\videos\assets\sfx\curated\" -ErrorAction SilentlyContinue | Measure-Object).Count
if ($sfxCount -ge 12) {
  Write-Ok "$sfxCount SFX en curated/"
} else {
  Write-Err "Solo $sfxCount SFX en curated/ (esperado >= 12)"
}

$envFile = "$ProjectRoot\frontend\.env.local"
if (Test-Path $envFile) {
  $envContent = Get-Content $envFile -Raw
  if ($envContent -match "PEXELS_API_KEY=\S") {
    Write-Ok "PEXELS_API_KEY configurada"
  } else {
    Write-Warn "PEXELS_API_KEY vacÃ­a. Editar frontend\.env.local con tu key (https://www.pexels.com/api/new/)"
  }
}

# =============================================================================
# RESUMEN
# =============================================================================
Write-Host "`n=== RESUMEN ===" -ForegroundColor Magenta

if ($script:errors.Count -eq 0) {
  Write-Host "`nâœ… Setup completo!" -ForegroundColor Green
  Write-Host "`nProxIMOS pasos:" -ForegroundColor Cyan
  Write-Host "  1. Editar frontend\.env.local y poner PEXELS_API_KEY"
  Write-Host "  2. Arrancar dashboard: cd frontend; npm run dev"
  Write-Host "  3. Abrir http://localhost:3000"
  Write-Host "  4. Leer docs\USAGE.md para tutorial completo"
} else {
  Write-Host "`nâš  Setup terminÃ³ con $($script:errors.Count) error(es):" -ForegroundColor Yellow
  foreach ($e in $script:errors) {
    Write-Host "  - $e" -ForegroundColor Red
  }
  Write-Host "`nVer docs\TROUBLESHOOTING.md para soluciones." -ForegroundColor Yellow
}

Write-Host ""
