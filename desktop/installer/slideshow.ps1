# slideshow.ps1 - Ventana visual que acompana la instalacion de Viralito.
# La lanza el instalador NSIS como proceso SEPARADO (tiene su propio message
# loop, asi anima aunque NSIS este bloqueado bajando/extrayendo).
#
# Args:
#   -Carpeta <dir>   carpeta con las imagenes (slide1.png..slideN.png) y el icono
#   -Estado  <file>  archivo que el instalador actualiza con "fase|detalle"
#   -Zip     <file>  ruta del zip que se descarga (para mostrar MB en vivo)
#
# Se cierra solo cuando el archivo de estado dice "FIN" o aparece <Estado>.stop.
# Sin acentos en codigo a proposito (PS 5.1 + ANSI). Los textos visibles SI
# llevan acentos porque WinForms es Unicode.

param(
  [string]$Carpeta,
  [string]$Estado,
  [string]$Zip
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# --- Paleta Viralito -------------------------------------------------------
$navy   = [System.Drawing.Color]::FromArgb(19, 25, 45)
$navy2  = [System.Drawing.Color]::FromArgb(28, 35, 60)
$pink   = [System.Drawing.Color]::FromArgb(250, 60, 141)
$violet = [System.Drawing.Color]::FromArgb(173, 35, 238)
$texto  = [System.Drawing.Color]::FromArgb(232, 235, 245)
$tenue  = [System.Drawing.Color]::FromArgb(150, 156, 180)

# --- Slides: imagen + titulo + frase ---------------------------------------
$slides = @(
  @{ img = 'slide1.png'; t = 'Tu estudio viral, 100% en tu compu'; d = 'Sin nube, sin mensualidades, sin claves de API.' },
  @{ img = 'slide2.png'; t = 'Crea shorts virales desde cualquier video'; d = 'Subtítulos karaoke, efectos y música, automáticos.' },
  @{ img = 'slide3.png'; t = 'De un video largo a clips virales'; d = 'La IA encuentra los mejores momentos y los corta.' },
  @{ img = 'slide4.png'; t = '17 estilos editoriales'; d = 'Del MrBeast intenso al documental tipo revista.' },
  @{ img = 'slide5.png'; t = 'Gráficas animadas de datos'; d = 'Dices "el 70%" y aparece la gráfica sola.' },
  @{ img = 'slide6.png'; t = 'Ilustraciones y mapas que aparecen solos'; d = 'Según lo que dices, con IA local.' }
)

# --- Ventana ---------------------------------------------------------------
$f = New-Object System.Windows.Forms.Form
$f.Text = 'Instalando Viralito'
$f.Size = New-Object System.Drawing.Size(760, 560)
# Posicion ARRIBA-centro: deja libre el centro de la pantalla para la barra de
# progreso de la descarga (inetc la muestra ahi), asi no se tapan.
$f.StartPosition = 'Manual'
try {
  $sw = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width
  $f.Location = New-Object System.Drawing.Point([int](($sw - 760) / 2), 24)
} catch { $f.StartPosition = 'CenterScreen' }
$f.FormBorderStyle = 'None'
$f.BackColor = $navy
$f.TopMost = $false
$f.ShowInTaskbar = $true
try { $ico = Join-Path $Carpeta 'app.ico'; if (Test-Path $ico) { $f.Icon = New-Object System.Drawing.Icon($ico) } } catch {}

# Borde sutil con el gradiente de marca (barra arriba)
$barra = New-Object System.Windows.Forms.Panel
$barra.Size = New-Object System.Drawing.Size(760, 6)
$barra.Location = New-Object System.Drawing.Point(0, 0)
$barra.Add_Paint({
  param($s, $e)
  $r = New-Object System.Drawing.Rectangle(0, 0, $s.Width, $s.Height)
  $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush($r, $pink, $violet, 0)
  $e.Graphics.FillRectangle($br, $r); $br.Dispose()
})
$f.Controls.Add($barra)

# Titulo "Viralito"
$lblMarca = New-Object System.Windows.Forms.Label
$lblMarca.Text = 'Viralito'
$lblMarca.Font = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
$lblMarca.ForeColor = $pink
$lblMarca.AutoSize = $true
$lblMarca.BackColor = [System.Drawing.Color]::Transparent
$lblMarca.Location = New-Object System.Drawing.Point(28, 22)
$f.Controls.Add($lblMarca)

# Fase (lo escribe el instalador)
$lblFase = New-Object System.Windows.Forms.Label
$lblFase.Text = 'Preparando...'
$lblFase.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$lblFase.ForeColor = $texto
$lblFase.AutoSize = $true
$lblFase.BackColor = [System.Drawing.Color]::Transparent
$lblFase.Location = New-Object System.Drawing.Point(30, 64)
$f.Controls.Add($lblFase)

# Detalle (MB / progreso)
$lblDet = New-Object System.Windows.Forms.Label
$lblDet.Text = ''
$lblDet.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$lblDet.ForeColor = $tenue
$lblDet.AutoSize = $true
$lblDet.BackColor = [System.Drawing.Color]::Transparent
$lblDet.Location = New-Object System.Drawing.Point(30, 88)
$f.Controls.Add($lblDet)

# Imagen (PictureBox Zoom = mantiene proporcion)
$pic = New-Object System.Windows.Forms.PictureBox
$pic.Size = New-Object System.Drawing.Size(700, 330)
$pic.Location = New-Object System.Drawing.Point(30, 120)
$pic.SizeMode = 'Zoom'
$pic.BackColor = $navy2
$f.Controls.Add($pic)

# Titulo del slide
$lblT = New-Object System.Windows.Forms.Label
$lblT.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$lblT.ForeColor = $texto
$lblT.AutoSize = $false
$lblT.Size = New-Object System.Drawing.Size(700, 28)
$lblT.TextAlign = 'MiddleCenter'
$lblT.BackColor = [System.Drawing.Color]::Transparent
$lblT.Location = New-Object System.Drawing.Point(30, 460)
$f.Controls.Add($lblT)

# Frase del slide
$lblD = New-Object System.Windows.Forms.Label
$lblD.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$lblD.ForeColor = $tenue
$lblD.AutoSize = $false
$lblD.Size = New-Object System.Drawing.Size(700, 22)
$lblD.TextAlign = 'MiddleCenter'
$lblD.BackColor = [System.Drawing.Color]::Transparent
$lblD.Location = New-Object System.Drawing.Point(30, 490)
$f.Controls.Add($lblD)

# Puntos de progreso del slideshow
$lblDots = New-Object System.Windows.Forms.Label
$lblDots.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$lblDots.ForeColor = $tenue
$lblDots.AutoSize = $false
$lblDots.Size = New-Object System.Drawing.Size(700, 20)
$lblDots.TextAlign = 'MiddleCenter'
$lblDots.BackColor = [System.Drawing.Color]::Transparent
$lblDots.Location = New-Object System.Drawing.Point(30, 524)
$f.Controls.Add($lblDots)

# --- Estado del slideshow --------------------------------------------------
$script:idx = -1
$script:cache = @{}
$script:vistoEstado = $false   # ya vimos el archivo de estado alguna vez?

function Mostrar-Slide([int]$i) {
  $s = $slides[$i]
  $ruta = Join-Path $Carpeta $s.img
  if (Test-Path $ruta) {
    try {
      if (-not $script:cache.ContainsKey($ruta)) {
        $bytes = [System.IO.File]::ReadAllBytes($ruta)
        $ms = New-Object System.IO.MemoryStream(, $bytes)
        $script:cache[$ruta] = [System.Drawing.Image]::FromStream($ms)
      }
      $pic.Image = $script:cache[$ruta]
    } catch {}
  }
  $lblT.Text = $s.t
  $lblD.Text = $s.d
  $puntos = ''
  for ($k = 0; $k -lt $slides.Count; $k++) { if ($k -eq $i) { $puntos += '●  ' } else { $puntos += '○  ' } }
  $lblDots.Text = $puntos.Trim()
}

function Fmt-MB([long]$b) { return ('{0:N0} MB' -f ($b / 1MB)) }

# Lee la primera linea del archivo de estado decodificando bien la codificacion.
# CLAVE: NSIS (Unicode True) escribe ese archivo en UTF-16LE; leerlo como ANSI
# mostraba simbolos raros (mojibake que parecia virus). Detectamos UTF-16 por
# los bytes nulos y, si no, UTF-8. Asi el texto (con acentos) se ve perfecto.
function Leer-Estado([string]$path) {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if (-not $bytes -or $bytes.Length -eq 0) { return '' }
    $nulos = 0; $lim = [Math]::Min($bytes.Length, 40)
    for ($i = 1; $i -lt $lim; $i += 2) { if ($bytes[$i] -eq 0) { $nulos++ } }
    if ($nulos -gt 3) {
      $txt = [System.Text.Encoding]::Unicode.GetString($bytes)
    } else {
      $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
    }
    $txt = $txt.TrimStart([char]0xFEFF)               # quita BOM si lo hay
    return (($txt -split "`n")[0] -replace "`r", '').Trim()
  } catch { return '' }
}

# Timer 1: avanzar slide cada 3.5s
$tSlide = New-Object System.Windows.Forms.Timer
$tSlide.Interval = 3500
$tSlide.Add_Tick({
  $script:idx = ($script:idx + 1) % $slides.Count
  Mostrar-Slide $script:idx
})

# Timer 2: leer estado + progreso de descarga, cada 600ms
$tEstado = New-Object System.Windows.Forms.Timer
$tEstado.Interval = 600
$tEstado.Add_Tick({
  # cerrar?
  if ((Test-Path ($Estado + '.stop'))) { $f.Close(); return }
  $fase = ''; $detalle = ''
  if (Test-Path $Estado) {
    $script:vistoEstado = $true
    $linea = Leer-Estado $Estado
    if ($linea) {
      if ($linea -eq 'FIN') { $f.Close(); return }
      $partes = $linea -split '\|', 2
      $fase = $partes[0]
      if ($partes.Count -gt 1) { $detalle = $partes[1] }
    }
  }
  elseif ($script:vistoEstado) {
    # El archivo de estado existio y ahora NO: NSIS borro $PLUGINSDIR al salir,
    # asi que el instalador termino (incluido modo silencioso). Cerrar.
    $f.Close(); return
  }
  if ($fase) { $lblFase.Text = $fase }
  # Durante la descarga, mostrar MB en vivo leyendo el tamano del zip parcial
  if ($fase -like 'Descargando*' -and $Zip -and (Test-Path $Zip)) {
    try { $len = (Get-Item -LiteralPath $Zip).Length; $lblDet.Text = 'Descargado: ' + (Fmt-MB $len) + '   ·   puedes seguir trabajando mientras tanto' } catch {}
  }
  elseif ($detalle) { $lblDet.Text = $detalle }
})

$f.Add_Shown({
  $script:idx = 0
  Mostrar-Slide 0
  # Aparecer al frente al abrir (sin quedarse TopMost para no estorbar si el
  # usuario se va a otra app durante la descarga larga).
  $f.TopMost = $true
  $f.Activate()
  $f.BringToFront()
  $f.TopMost = $false
  $tSlide.Start()
  $tEstado.Start()
})
$f.Add_FormClosing({ $tSlide.Stop(); $tEstado.Stop() })

[void]$f.ShowDialog()
