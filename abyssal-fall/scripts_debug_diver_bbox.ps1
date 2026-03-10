$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$d = [System.Drawing.Bitmap]::FromFile('C:\Programming\Contracts\oasiz-game-studio\abyssal-fall\public\assets\diver.png')
Write-Output ('diver size: {0}x{1}' -f $d.Width, $d.Height)
$minX = $d.Width; $minY = $d.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $d.Height; $y++) {
  for ($x = 0; $x -lt $d.Width; $x++) {
    if ($d.GetPixel($x, $y).A -gt 12) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$bw = $maxX - $minX + 1
$bh = $maxY - $minY + 1
Write-Output ('bbox: {0},{1} to {2},{3}' -f $minX, $minY, $maxX, $maxY)
Write-Output ('bbox size: {0}x{1}' -f $bw, $bh)

# Emit a tiny debug crop for visual inspection
$cropW = [Math]::Max(1, [int]($bw * 0.38))
$cropH = [Math]::Max(1, [int]($bh * 0.28))
$cropX = [int]($minX + $bw * 0.31)
$cropY = [int]($minY + $bh * 0.04)
Write-Output ('test crop: x={0} y={1} w={2} h={3}' -f $cropX, $cropY, $cropW, $cropH)

$test = New-Object System.Drawing.Bitmap $cropW, $cropH
$g = [System.Drawing.Graphics]::FromImage($test)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$src = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$dst = New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)
$g.DrawImage($d, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$out = 'C:\Programming\Contracts\oasiz-game-studio\abyssal-fall\public\assets\characters\_debug_diver_helmet_crop.png'
$test.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$test.Dispose()
$d.Dispose()
Write-Output "wrote: $out"
