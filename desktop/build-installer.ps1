# build-installer.ps1 - Compila el instalador NSIS de Estrategia Viral Studio.
#
# Uso (desde desktop\):  powershell -ExecutionPolicy Bypass -File build-installer.ps1
# Resultado:             C:\hermes-data\dist\EstrategiaViralStudio-Setup.exe (~2 MB)
#
# Que hace:
#   1. Busca makensis (PATH -> Program Files -> NSIS portable en C:\hermes-data\tools\nsis).
#   2. Si no hay NSIS, baja el zip portable 3.11 de SourceForge (sin instalar nada).
#   3. Se asegura de que el plugin INetC este disponible (lo baja del wiki de NSIS).
#   4. Compila desktop\installer\instalador.nsi con /INPUTCHARSET UTF8.
#
# Sin acentos a proposito: PowerShell 5.1 lee .ps1 sin BOM como ANSI.

param(
  [string]$OutDir = 'C:\hermes-data\dist',
  [string]$ToolsDir = 'C:\hermes-data\tools'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$nsi = Join-Path $PSScriptRoot 'installer\instalador.nsi'
$setupExe = Join-Path $OutDir 'EstrategiaViralStudio-Setup.exe'
$nsisPortable = Join-Path $ToolsDir 'nsis'

if (-not (Test-Path $nsi)) { throw "No existe $nsi" }
$icono = Join-Path $PSScriptRoot 'src-tauri\icons\icon.ico'
if (-not (Test-Path $icono)) { throw "No existe el icono $icono (lo necesita el .nsi)" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---------------------------------------------------------------------------
# 1) Encontrar (o bajar) makensis
# ---------------------------------------------------------------------------
function Find-Makensis {
  $cmd = Get-Command makensis -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @(
      "$env:ProgramFiles(x86)\NSIS\makensis.exe",
      "$env:ProgramFiles\NSIS\makensis.exe",
      (Join-Path $nsisPortable 'makensis.exe')
    )) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Install-PortableNsis {
  Write-Host '== NSIS no encontrado: bajando NSIS 3.11 portable (zip, sin instalar)...'
  $zip = Join-Path $ToolsDir 'nsis-3.11.zip'
  $tmp = Join-Path $ToolsDir '_nsis_tmp'
  New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
  # curl.exe (incluido en Windows 10/11) sigue redirects de SourceForge sin drama
  & curl.exe -L -A 'Mozilla/5.0' --silent --show-error -o $zip `
    'https://master.dl.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11.zip?viasf=1'
  if ((Get-Item $zip).Length -lt 1MB) { throw 'La descarga de NSIS llego incompleta (menos de 1 MB). Reintenta.' }
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  if (Test-Path $nsisPortable) { Remove-Item $nsisPortable -Recurse -Force }
  Move-Item (Join-Path $tmp 'nsis-3.11') $nsisPortable
  Remove-Item $tmp -Recurse -Force
  Remove-Item $zip -Force
  return (Join-Path $nsisPortable 'makensis.exe')
}

# ---------------------------------------------------------------------------
# 2) Asegurar el plugin INetC (descarga con barra de progreso)
# ---------------------------------------------------------------------------
function Ensure-Inetc([string]$makensisPath) {
  $nsisRoot = Split-Path $makensisPath
  if ((Split-Path $nsisRoot -Leaf) -eq 'Bin') { $nsisRoot = Split-Path $nsisRoot }
  $destinos = @(
    (Join-Path $nsisRoot 'Plugins\x86-unicode\INetC.dll'),
    (Join-Path $nsisRoot 'Plugins\x86-ansi\INetC.dll')
  )
  if (Test-Path $destinos[0]) { return $true }

  Write-Host "== Plugin INetC no esta en $nsisRoot : bajandolo del wiki de NSIS..."
  $zip = Join-Path $env:TEMP 'Inetc.zip'
  $tmp = Join-Path $env:TEMP '_inetc_tmp'
  & curl.exe -L -A 'Mozilla/5.0' --silent --show-error -o $zip `
    'https://nsis.sourceforge.io/mediawiki/images/c/c9/Inetc.zip'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  try {
    Copy-Item (Join-Path $tmp 'Plugins\x86-unicode\INetC.dll') $destinos[0] -Force
    Copy-Item (Join-Path $tmp 'Plugins\x86-ansi\INetC.dll') $destinos[1] -Force
  }
  catch {
    # Sin permisos para escribir en Program Files: no podemos usar ese NSIS
    Write-Warning "No se pudo copiar INetC a $nsisRoot ($($_.Exception.Message))"
    return $false
  }
  finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
  }
  return (Test-Path $destinos[0])
}

$makensis = Find-Makensis
if (-not $makensis) { $makensis = Install-PortableNsis }
Write-Host "== makensis: $makensis"

if (-not (Ensure-Inetc $makensis)) {
  # El NSIS instalado no acepta el plugin (p. ej. Program Files sin admin):
  # caemos al NSIS portable, donde si podemos escribir.
  Write-Host '== Cambiando al NSIS portable...'
  if (-not (Test-Path (Join-Path $nsisPortable 'makensis.exe'))) { $null = Install-PortableNsis }
  $makensis = Join-Path $nsisPortable 'makensis.exe'
  if (-not (Ensure-Inetc $makensis)) { throw 'No se pudo instalar el plugin INetC ni en el NSIS portable.' }
}

# ---------------------------------------------------------------------------
# 3) Compilar
# ---------------------------------------------------------------------------
Write-Host "== Compilando $nsi ..."
& $makensis /V3 /INPUTCHARSET UTF8 "/DOUTFILE=$setupExe" $nsi
if ($LASTEXITCODE -ne 0) { throw "makensis fallo con codigo $LASTEXITCODE" }

if (-not (Test-Path $setupExe)) { throw "makensis termino bien pero no aparece $setupExe" }
$mb = [Math]::Round((Get-Item $setupExe).Length / 1MB, 2)
Write-Host "== LISTO: $setupExe ($mb MB)"
Write-Host '== Subilo como asset del release junto al zip; el usuario solo baja el Setup.'
