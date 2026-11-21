# Prepare card assets: find the two 2400x1792 PNGs under Root (ASCII-only script for PS 5.1),
# classify by mean brightness (bright = blank face template, dark = ornate back),
# crop by background-color distance, resize to 720px height, save as JPEG.
# Usage: powershell -File scripts/prepare-assets.ps1 -Root F:\game
param([string]$Root = 'F:\game')
Add-Type -AssemblyName System.Drawing
$outDir = Join-Path $PSScriptRoot '..\src\webui\assets'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# 1. candidates: PNGs exactly 2400x1792, manual stack walk so access-denied dirs are skipped
$candidates = @()
$seen = 0
$stack = [System.Collections.Generic.Stack[string]]::new()
$stack.Push($Root)
while ($stack.Count -gt 0) {
  $dir = $stack.Pop()
  try {
    foreach ($f in [System.IO.Directory]::EnumerateFiles($dir, '*.png')) {
      $seen++
      if ($seen -gt 200000) { break }
      try {
        $img = [System.Drawing.Bitmap]::FromFile($f)
        if ($img.Width -eq 2400 -and $img.Height -eq 1792) { $candidates += $f }
        $img.Dispose()
      } catch { }
    }
    foreach ($d in [System.IO.Directory]::EnumerateDirectories($dir)) { $stack.Push($d) }
  } catch { }
}
Write-Host ("scanned {0} pngs, candidates: {1}" -f $seen, $candidates.Count)
if ($candidates.Count -lt 2) { Write-Host 'need two 2400x1792 pngs'; exit 1 }

# 2. classify by mean brightness
function MeanBrightness([string]$path) {
  $img = [System.Drawing.Bitmap]::FromFile($path)
  $small = New-Object System.Drawing.Bitmap(64, 48)
  $g = [System.Drawing.Graphics]::FromImage($small)
  $g.DrawImage($img, 0, 0, 64, 48)
  $g.Dispose()
  $sum = 0L
  for ($y = 0; $y -lt 48; $y++) {
    for ($x = 0; $x -lt 64; $x++) {
      $p = $small.GetPixel($x, $y)
      $sum += ($p.R + $p.G + $p.B)
    }
  }
  $small.Dispose()
  $img.Dispose()
  return $sum / (64 * 48 * 3)
}
$scored = $candidates | ForEach-Object { [pscustomobject]@{ Path = $_; Bright = MeanBrightness $_ } } | Sort-Object Bright -Descending
$faceSrc = $scored[0].Path
$backSrc = $scored[$scored.Count - 1].Path
Write-Host ("face = {0} (brightness {1:N0})" -f $faceSrc, $scored[0].Bright)
Write-Host ("back = {0} (brightness {1:N0})" -f $backSrc, $scored[$scored.Count - 1].Bright)

# 3. crop by distance from the corner background color, then resize
function Crop-Card([string]$src, [string]$dst) {
  $img = [System.Drawing.Bitmap]::FromFile($src)
  $c = $img.GetPixel(5, 5)
  $minX = $img.Width; $minY = $img.Height; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $img.Height; $y += 2) {
    for ($x = 0; $x -lt $img.Width; $x += 2) {
      $p = $img.GetPixel($x, $y)
      $dist = [Math]::Abs($p.R - $c.R) + [Math]::Abs($p.G - $c.G) + [Math]::Abs($p.B - $c.B)
      if ($p.A -gt 100 -and $dist -gt 90) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $pad = 3
  $minX = [Math]::Max(0, $minX - $pad)
  $minY = [Math]::Max(0, $minY - $pad)
  $w = [Math]::Min($img.Width - $minX, $maxX - $minX + $pad * 2)
  $h = [Math]::Min($img.Height - $minY, $maxY - $minY + $pad * 2)
  $rect = New-Object System.Drawing.Rectangle($minX, $minY, $w, $h)
  $cropped = $img.Clone($rect, $img.PixelFormat)
  $targetH = 720
  $targetW = [int][Math]::Round($cropped.Width * $targetH / $cropped.Height)
  $resized = New-Object System.Drawing.Bitmap($targetW, $targetH)
  $g = [System.Drawing.Graphics]::FromImage($resized)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($cropped, 0, 0, $targetW, $targetH)
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]86)
  $resized.Save($dst, $codec, $params)
  $kb = [Math]::Round((Get-Item $dst).Length / 1KB)
  Write-Host ("{0}: crop {1}x{2} -> {3}x{4}, {5}KB" -f (Split-Path $dst -Leaf), $cropped.Width, $cropped.Height, $targetW, $targetH, $kb)
  $resized.Dispose()
  $cropped.Dispose()
  $img.Dispose()
}

Crop-Card $faceSrc (Join-Path $outDir 'card-face.jpg')
Crop-Card $backSrc (Join-Path $outDir 'card-back.jpg')
