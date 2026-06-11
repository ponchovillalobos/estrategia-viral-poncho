# instalar-helper.ps1 - lo ejecuta el instalador NSIS via nsExec.
# Acciones:
#   verificar <zip> <sums> <destino>  -> compara SHA256 del zip contra SHA256SUMS.txt
#   extraer   <zip> <->    <destino>  -> extrae el zip con .NET (rapido) y progreso
#
# OJO: este archivo va EMPACADO dentro del Setup.exe. Sin acentos a proposito:
# la salida pasa por el log del instalador y la consola OEM los rompe.
# Exit codes: 0 ok, 1 hash no coincide, 2 no se encontro hash esperado, 3 error.

param(
  [Parameter(Mandatory = $true)][string]$Accion,
  [Parameter(Mandatory = $true)][string]$Zip,
  [Parameter(Mandatory = $true)][string]$Sums,
  [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = 'Stop'

try {
  switch ($Accion) {

    'verificar' {
      $nombre = Split-Path $Zip -Leaf
      $linea = Get-Content -LiteralPath $Sums |
        Where-Object { $_ -match [regex]::Escape($nombre) } |
        Select-Object -First 1
      if (-not $linea) {
        Write-Output "No encontre la huella de $nombre en SHA256SUMS.txt"
        exit 2
      }
      $esperado = ($linea.Trim() -split '\s+')[0]
      Write-Output 'Calculando huella SHA256 de la descarga (tarda un momento)...'
      $real = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
      if ($real -eq $esperado) {
        Write-Output 'Integridad verificada: la descarga esta completa y sin alterar.'
        exit 0
      }
      Write-Output "La huella no coincide. Esperada: $esperado / Real: $real"
      exit 1
    }

    'extraer' {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      if (-not (Test-Path -LiteralPath $Destino)) {
        New-Item -ItemType Directory -Force -Path $Destino | Out-Null
      }
      $archivo = [IO.Compression.ZipFile]::OpenRead($Zip)
      try {
        $total = $archivo.Entries.Count
        $i = 0
        $paso = [Math]::Max(1, [int][Math]::Floor($total / 20))
        Write-Output "Extrayendo $total archivos..."
        foreach ($e in $archivo.Entries) {
          $i++
          $rel = $e.FullName -replace '/', '\'
          if ($rel -match '\.\.') { continue }   # guardia zip-slip
          $ruta = Join-Path $Destino $rel
          if ($rel.EndsWith('\') -or $e.Name -eq '') {
            # entrada de carpeta
            [IO.Directory]::CreateDirectory('\\?\' + $ruta) | Out-Null
          }
          else {
            $dir = Split-Path $ruta
            [IO.Directory]::CreateDirectory('\\?\' + $dir) | Out-Null
            # prefijo \\?\ = soporta rutas mas largas que MAX_PATH (torch/node_modules)
            [IO.Compression.ZipFileExtensions]::ExtractToFile($e, '\\?\' + $ruta, $true)
          }
          if ($i % $paso -eq 0) {
            $pct = [int](100 * $i / $total)
            Write-Output ("Extrayendo... {0}% ({1} de {2})" -f $pct, $i, $total)
          }
        }
      }
      finally {
        $archivo.Dispose()
      }
      Write-Output 'Extraccion completa.'
      exit 0
    }

    default {
      Write-Output "Accion desconocida: $Accion"
      exit 3
    }
  }
}
catch {
  Write-Output ("ERROR: " + $_.Exception.Message)
  exit 3
}
