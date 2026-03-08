$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$knightPath = 'C:\Programming\Contracts\Art Assets\Super Pixel Heroes - Knight\Super Pixel Heroes - Knight\spritesheet\sph_knight_red\spritesheet.png'
$diverPath  = 'C:\Programming\Contracts\oasiz-game-studio\abyssal-fall\public\assets\diver.png'
$outPath    = 'C:\Programming\Contracts\oasiz-game-studio\abyssal-fall\public\assets\characters\knight_red_diverhelmet.png'
$previewOut = 'C:\Programming\Contracts\oasiz-game-studio\abyssal-fall\public\assets\characters\_preview_helmet_frame.png'

$frameW = 112
$frameH = 80

$knight = [System.Drawing.Bitmap]::FromFile($knightPath)
$diver  = [System.Drawing.Bitmap]::FromFile($diverPath)

# Known tight helmet crop from diver.png (derived from debug bbox pass)
$helmetX = 205
$helmetY = 105
$helmetW = 68
$helmetH = 73
$helmet = New-Object System.Drawing.Bitmap $helmetW, $helmetH
$gh = [System.Drawing.Graphics]::FromImage($helmet)
$gh.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gh.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$srcRect = New-Object System.Drawing.Rectangle($helmetX, $helmetY, $helmetW, $helmetH)
$dstRect = New-Object System.Drawing.Rectangle(0, 0, $helmetW, $helmetH)
$gh.DrawImage($diver, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$gh.Dispose()

$out = New-Object System.Drawing.Bitmap $knight.Width, $knight.Height
$g = [System.Drawing.Graphics]::FromImage($out)
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($knight, 0, 0, $knight.Width, $knight.Height)

$cols = [int]($knight.Width / $frameW)
$rows = [int]($knight.Height / $frameH)

for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    $fx = $c * $frameW
    $fy = $r * $frameH

    # Per-frame alpha bbox for dynamic head anchoring.
    $minX = $frameW; $minY = $frameH; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $frameH; $y++) {
      for ($x = 0; $x -lt $frameW; $x++) {
        $px = $knight.GetPixel($fx + $x, $fy + $y)
        if ($px.A -gt 12) {
          if ($x -lt $minX) { $minX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
    if ($maxX -lt 0) { continue }

    $bw = $maxX - $minX + 1
    $bh = $maxY - $minY + 1
    if ($bw -lt 20 -or $bh -lt 20) { continue }

    # Helmet target size: intentionally small relative to knight frame.
    $dw = [int]([Math]::Round([Math]::Max(20, [Math]::Min(30, $bw * 0.36))))
    $dh = [int]([Math]::Round([Math]::Max(20, [Math]::Min(30, $bh * 0.36))))

    # Place near top-center of character bbox with slight downward bias.
    $centerX = $fx + $minX + ($bw / 2.0)
    $dx = [int]([Math]::Round($centerX - $dw / 2.0))
    $dy = [int]([Math]::Round($fy + $minY + 1))

    $dest = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
    $src = New-Object System.Drawing.Rectangle(0, 0, $helmet.Width, $helmet.Height)
    $g.DrawImage($helmet, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)

    # One-frame preview output from idle row/frame for quick checking.
    if ($r -eq 25 -and $c -eq 0) {
      $preview = New-Object System.Drawing.Bitmap $frameW, $frameH
      $gp = [System.Drawing.Graphics]::FromImage($preview)
      $srcPrev = New-Object System.Drawing.Rectangle($fx, $fy, $frameW, $frameH)
      $dstPrev = New-Object System.Drawing.Rectangle(0, 0, $frameW, $frameH)
      $gp.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $gp.DrawImage($out, $dstPrev, $srcPrev, [System.Drawing.GraphicsUnit]::Pixel)
      $gp.Dispose()
      $preview.Save($previewOut, [System.Drawing.Imaging.ImageFormat]::Png)
      $preview.Dispose()
    }
  }
}

$dir = Split-Path -Parent $outPath
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$out.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $out.Dispose(); $helmet.Dispose(); $knight.Dispose(); $diver.Dispose()
Write-Output "Wrote: $outPath"
Write-Output "Preview: $previewOut"
