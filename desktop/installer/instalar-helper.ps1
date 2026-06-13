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
  # NO obligatorio: 'extraer' no usa Sums. Si fuera Mandatory y el binding
  # fallara (p.ej. un arg raro desde powershell.exe -File), PowerShell intenta
  # preguntar interactivamente y, sin consola, muere con codigo != 0 ANTES de
  # correr el script — exactamente el bug que tumbaba la extraccion.
  [string]$Sums = '',
  [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = 'Stop'

# Cada mensaje va al log del instalador (stdout) Y a un archivo en la carpeta
# de instalacion: en modo silencioso el log de NSIS no se ve, y este archivo
# es la unica forma de diagnosticar que paso.
$script:LogPath = Join-Path $Destino 'instalar-helper.log'
function W([string]$m) {
  Write-Output $m
  try { Add-Content -LiteralPath $script:LogPath -Value ('[' + (Get-Date -Format 'HH:mm:ss') + "] $m") } catch {}
}
W "--- accion: $Accion ---"

try {
  switch ($Accion) {

    'verificar' {
      $nombre = Split-Path $Zip -Leaf
      $linea = Get-Content -LiteralPath $Sums |
        Where-Object { $_ -match [regex]::Escape($nombre) } |
        Select-Object -First 1
      if (-not $linea) {
        W "No encontre la huella de $nombre en SHA256SUMS.txt"
        exit 2
      }
      $esperado = ($linea.Trim() -split '\s+')[0]
      W 'Calculando huella SHA256 de la descarga (tarda un momento)...'
      $real = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
      if ($real -eq $esperado) {
        W 'Integridad verificada: la descarga esta completa y sin alterar.'
        exit 0
      }
      W "La huella no coincide. Esperada: $esperado / Real: $real"
      exit 1
    }

    'extraer' {
      if (-not (Test-Path -LiteralPath $Destino)) {
        New-Item -ItemType Directory -Force -Path $Destino | Out-Null
      }

      # ANTES de extraer: cerrar cualquier proceso que corra DESDE la carpeta de
      # instalacion (desktop.exe, y sus hijos node.exe/python.exe de una version
      # abierta). Esos tienen .pyd/.dll cargados y BLOQUEADOS; sin esto la
      # extraccion no puede sobrescribirlos ("el archivo esta siendo utilizado en
      # otro proceso") — exactamente lo que rompia un reinstalar/actualizar.
      # Filtra por ruta: solo toca procesos de ESTA carpeta, jamas node/python
      # ajenos del sistema (p.ej. los de Program Files).
      # OJO: usamos Get-CimInstance (ExecutablePath), NO (Get-Process).Path: el
      # instalador NSIS es de 32 bits y desde PowerShell de 32 bits .Path NO puede
      # leer el modulo de procesos de 64 bits (node/python son 64-bit) -> devolvia
      # null y no detectaba a nadie. CIM si lo lee cross-bitness.
      $destFull = $Destino.TrimEnd('\')
      try { $rp = (Resolve-Path -LiteralPath $Destino -ErrorAction Stop).Path; if ($rp) { $destFull = $rp.TrimEnd('\') } } catch {}
      $prefijo = $destFull + '\'
      $bloqueadores = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
          $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefijo, [System.StringComparison]::OrdinalIgnoreCase)
        })
      foreach ($b in $bloqueadores) {
        W ("Cerrando proceso que bloquea archivos: $($b.Name) (PID $($b.ProcessId))")
        try { Stop-Process -Id $b.ProcessId -Force -ErrorAction Stop } catch { W ("  no se pudo cerrar: " + $_.Exception.Message) }
      }
      if ($bloqueadores.Count -gt 0) {
        W ("Cerre $($bloqueadores.Count) proceso(s) de una version abierta; sigo con la extraccion.")
        Start-Sleep -Seconds 3
      }

      # METODO 1: tar.exe nativo de Windows (10 1803+). Binario del sistema
      # firmado por Microsoft: los antivirus no lo bloquean (a PowerShell
      # escribiendo miles de archivos si lo llegan a matar) y maneja zip64
      # y rutas largas sin depender de .NET.
      $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
      if (Test-Path -LiteralPath $tar) {
        W 'Extrayendo con la herramienta del sistema (tar)...'
        $errFile = Join-Path $env:TEMP ('evs-tar-' + [Guid]::NewGuid().ToString('N') + '.log')
        $p = Start-Process -FilePath $tar `
          -ArgumentList ('-xf "' + $Zip + '" -C "' + $Destino + '"') `
          -NoNewWindow -PassThru -RedirectStandardError $errFile
        $null = $p.Handle   # sin esto PS 5.1 no cachea el handle y ExitCode llega null
        $min = 0
        while (-not $p.HasExited) {
          Start-Sleep -Seconds 20
          $min += 0.33
          W ('Extrayendo... sigue trabajando ({0:N0} min; son miles de archivos)' -f $min)
        }
        $p.WaitForExit()
        $codigo = $p.ExitCode
        if ($null -eq $codigo) { $codigo = -1 }
        if ($codigo -eq 0) {
          Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
          W 'Extraccion completa.'
          exit 0
        }
        $detalle = ''
        if (Test-Path -LiteralPath $errFile) {
          $detalle = (Get-Content -LiteralPath $errFile -TotalCount 5) -join ' | '
          Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
        }
        W ("tar fallo (codigo $codigo): $detalle")
        W 'Probando metodo alternativo de extraccion...'
      }
      else {
        W 'tar.exe no esta en este Windows; usando metodo alternativo...'
      }

      # METODO 2 (respaldo): .NET, con progreso por porcentaje.
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $archivo = [IO.Compression.ZipFile]::OpenRead($Zip)
      try {
        $total = $archivo.Entries.Count
        $i = 0
        $paso = [Math]::Max(1, [int][Math]::Floor($total / 20))
        W "Extrayendo $total archivos..."
        foreach ($e in $archivo.Entries) {
          $i++
          $rel = $e.FullName -replace '/', '\'
          if ($rel -match '\.\.') { continue }   # guardia zip-slip
          $script:entradaActual = $rel
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
            W ("Extrayendo... {0}% ({1} de {2})" -f $pct, $i, $total)
          }
        }
      }
      finally {
        $archivo.Dispose()
      }
      W 'Extraccion completa.'
      exit 0
    }

    default {
      W "Accion desconocida: $Accion"
      exit 3
    }
  }
}
catch {
  # Error con TODO el detalle: tipo, mensaje, inner y linea — para que el log
  # del instalador diga exactamente que paso (foto del usuario = diagnostico).
  $e = $_.Exception
  W ("ERROR: [" + $e.GetType().Name + "] " + $e.Message)
  if ($e.InnerException) {
    W ("  Causa interna: [" + $e.InnerException.GetType().Name + "] " + $e.InnerException.Message)
  }
  if ($script:entradaActual) {
    W ("  Archivo en curso: " + $script:entradaActual)
  }
  W ("  Donde: " + $_.InvocationInfo.PositionMessage)
  exit 3
}
