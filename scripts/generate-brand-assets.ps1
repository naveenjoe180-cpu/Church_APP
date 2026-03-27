$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$appAssets = Join-Path $root 'church-network-app\assets'
$adminPublic = Join-Path $root 'church-network-admin\public'

New-Item -ItemType Directory -Force -Path $appAssets | Out-Null
New-Item -ItemType Directory -Force -Path $adminPublic | Out-Null

$paper = [System.Drawing.Color]::FromArgb(255, 251, 247, 239)
$midnight = [System.Drawing.Color]::FromArgb(255, 11, 26, 43)
$gold = [System.Drawing.Color]::FromArgb(255, 217, 164, 65)
$ink = [System.Drawing.Color]::FromArgb(255, 18, 38, 61)
$muted = [System.Drawing.Color]::FromArgb(255, 96, 107, 121)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$softWhite = [System.Drawing.Color]::FromArgb(110, 255, 255, 255)
$transparentColor = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)

function New-Canvas {
  param(
    [int]$Width,
    [int]$Height
  )

  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear($transparentColor)

  [PSCustomObject]@{
    Bitmap = $bitmap
    Graphics = $graphics
  }
}

function Save-Bitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Bitmap.Dispose()
}

function Draw-Cross {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$CenterX,
    [float]$TopY,
    [float]$Height,
    [System.Drawing.Color]$Primary,
    [System.Drawing.Color]$Soft
  )

  $mainPen = [System.Drawing.Pen]::new($Primary, 8)
  $mainPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $mainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $softPen = [System.Drawing.Pen]::new($Soft, 3)
  $softPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $softPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $Graphics.DrawLine($mainPen, $CenterX, $TopY, $CenterX, $TopY + $Height)
  $Graphics.DrawLine($mainPen, $CenterX - 42, $TopY + 34, $CenterX + 42, $TopY + 34)
  $Graphics.DrawLine($softPen, $CenterX - 8, $TopY - 4, $CenterX - 8, $TopY + $Height + 6)
  $Graphics.DrawLine($softPen, $CenterX - 48, $TopY + 38, $CenterX + 48, $TopY + 38)

  $mainPen.Dispose()
  $softPen.Dispose()
}

function Draw-Dove {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$OriginX,
    [float]$OriginY,
    [float]$Scale,
    [System.Drawing.Color]$Color
  )

  $pen = [System.Drawing.Pen]::new($Color, 3)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $Graphics.DrawBezier($pen, $OriginX, $OriginY + 24 * $Scale, $OriginX + 20 * $Scale, $OriginY, $OriginX + 48 * $Scale, $OriginY + 6 * $Scale, $OriginX + 56 * $Scale, $OriginY + 28 * $Scale)
  $Graphics.DrawBezier($pen, $OriginX + 18 * $Scale, $OriginY + 18 * $Scale, $OriginX + 34 * $Scale, $OriginY - 6 * $Scale, $OriginX + 74 * $Scale, $OriginY - 2 * $Scale, $OriginX + 90 * $Scale, $OriginY + 22 * $Scale)
  $Graphics.DrawBezier($pen, $OriginX + 52 * $Scale, $OriginY + 28 * $Scale, $OriginX + 48 * $Scale, $OriginY + 58 * $Scale, $OriginX + 32 * $Scale, $OriginY + 76 * $Scale, $OriginX + 18 * $Scale, $OriginY + 80 * $Scale)
  $Graphics.DrawBezier($pen, $OriginX + 14 * $Scale, $OriginY + 36 * $Scale, $OriginX + 6 * $Scale, $OriginY + 46 * $Scale, $OriginX + 6 * $Scale, $OriginY + 64 * $Scale, $OriginX + 22 * $Scale, $OriginY + 68 * $Scale)
  $Graphics.DrawLine($pen, $OriginX + 8 * $Scale, $OriginY + 20 * $Scale, $OriginX - 8 * $Scale, $OriginY + 10 * $Scale)
  $Graphics.DrawLine($pen, $OriginX - 8 * $Scale, $OriginY + 10 * $Scale, $OriginX - 20 * $Scale, $OriginY + 2 * $Scale)
  $Graphics.DrawLine($pen, $OriginX - 10 * $Scale, $OriginY + 8 * $Scale, $OriginX - 4 * $Scale, $OriginY + 20 * $Scale)

  $pen.Dispose()
}

function Draw-HorizontalOfficialLogo {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$OffsetX,
    [float]$OffsetY,
    [float]$Scale,
    [System.Drawing.Color]$TextColor,
    [System.Drawing.Color]$SecondaryColor,
    [System.Drawing.Color]$AccentColor
  )

  $beFont = [System.Drawing.Font]::new('Georgia', [float](126 * $Scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $helFont = [System.Drawing.Font]::new('Georgia', [float](126 * $Scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = [System.Drawing.Font]::new('Georgia', [float](36 * $Scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new($TextColor)
  $subtitleBrush = [System.Drawing.SolidBrush]::new($SecondaryColor)

  $Graphics.DrawString('Be', $beFont, $brush, $OffsetX, $OffsetY + 84 * $Scale)
  Draw-Cross -Graphics $Graphics -CenterX ($OffsetX + 254 * $Scale) -TopY ($OffsetY + 22 * $Scale) -Height (194 * $Scale) -Primary $TextColor -Soft $SecondaryColor
  $Graphics.DrawString('hel', $helFont, $brush, $OffsetX + 288 * $Scale, $OffsetY + 84 * $Scale)
  $Graphics.DrawString('International Pentecostal Church', $subtitleFont, $subtitleBrush, $OffsetX + 292 * $Scale, $OffsetY + 202 * $Scale)
  Draw-Dove -Graphics $Graphics -OriginX ($OffsetX + 392 * $Scale) -OriginY ($OffsetY + 2 * $Scale) -Scale (0.78 * $Scale) -Color $AccentColor

  $beFont.Dispose()
  $helFont.Dispose()
  $subtitleFont.Dispose()
  $brush.Dispose()
  $subtitleBrush.Dispose()
}

function Write-HorizontalLogoFile {
  param(
    [string]$Path
  )

  $canvas = New-Canvas -Width 1500 -Height 540
  Draw-HorizontalOfficialLogo -Graphics $canvas.Graphics -OffsetX 40 -OffsetY 50 -Scale 1 -TextColor $ink -SecondaryColor $muted -AccentColor $muted
  $canvas.Graphics.Dispose()
  Save-Bitmap -Bitmap $canvas.Bitmap -Path $Path
}

function Write-SplashLogoFile {
  param(
    [string]$Path
  )

  $canvas = New-Canvas -Width 1200 -Height 1200
  Draw-HorizontalOfficialLogo -Graphics $canvas.Graphics -OffsetX 120 -OffsetY 344 -Scale 0.78 -TextColor $ink -SecondaryColor $muted -AccentColor $muted
  $canvas.Graphics.Dispose()
  Save-Bitmap -Bitmap $canvas.Bitmap -Path $Path
}

function Write-AppIconFile {
  param(
    [string]$Path,
    [bool]$Transparent = $false,
    [bool]$Monochrome = $false
  )

  $canvas = New-Canvas -Width 1024 -Height 1024
  $textColor = if ($Monochrome) { [System.Drawing.Color]::Black } else { $white }
  $softColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(90, 0, 0, 0) } else { $softWhite }
  $accentColor = if ($Monochrome) { [System.Drawing.Color]::Black } else { $gold }

  if (-not $Transparent -and -not $Monochrome) {
    $canvas.Graphics.Clear($midnight)
  }

  if ($Monochrome) {
    $canvas.Graphics.Clear($transparentColor)
  }

  $titleFont = [System.Drawing.Font]::new('Georgia', 150, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = [System.Drawing.Font]::new('Georgia', 46, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $titleBrush = [System.Drawing.SolidBrush]::new($textColor)
  $subtitleColor = if ($Monochrome) { [System.Drawing.Color]::Black } else { [System.Drawing.Color]::FromArgb(220, 255, 255, 255) }
  $subtitleBrush = [System.Drawing.SolidBrush]::new($subtitleColor)

  Draw-Cross -Graphics $canvas.Graphics -CenterX 512 -TopY 160 -Height 420 -Primary $textColor -Soft $softColor
  $canvas.Graphics.DrawString('Bethel', $titleFont, $titleBrush, 194, 570)
  $canvas.Graphics.DrawString('Connect', $subtitleFont, $subtitleBrush, 352, 744)

  if (-not $Monochrome) {
    Draw-Dove -Graphics $canvas.Graphics -OriginX 612 -OriginY 146 -Scale 1.05 -Color $accentColor
  }

  $titleFont.Dispose()
  $subtitleFont.Dispose()
  $titleBrush.Dispose()
  $subtitleBrush.Dispose()
  $canvas.Graphics.Dispose()
  Save-Bitmap -Bitmap $canvas.Bitmap -Path $Path
}

function Write-BackgroundImage {
  param(
    [string]$Path,
    [System.Drawing.Color]$Color
  )

  $canvas = New-Canvas -Width 1024 -Height 1024
  $canvas.Graphics.Clear($Color)
  $canvas.Graphics.Dispose()
  Save-Bitmap -Bitmap $canvas.Bitmap -Path $Path
}

Write-HorizontalLogoFile -Path (Join-Path $appAssets 'bethel-official-logo.png')
Write-HorizontalLogoFile -Path (Join-Path $adminPublic 'bethel-official-logo.png')
Write-SplashLogoFile -Path (Join-Path $appAssets 'splash-icon.png')
Write-AppIconFile -Path (Join-Path $appAssets 'icon.png')
Write-AppIconFile -Path (Join-Path $appAssets 'android-icon-foreground.png') -Transparent $true
Write-BackgroundImage -Path (Join-Path $appAssets 'android-icon-background.png') -Color $midnight
Write-AppIconFile -Path (Join-Path $appAssets 'android-icon-monochrome.png') -Transparent $true -Monochrome $true
Write-AppIconFile -Path (Join-Path $appAssets 'favicon.png')
Write-AppIconFile -Path (Join-Path $adminPublic 'favicon.png')

Write-Output 'Brand assets generated successfully.'
