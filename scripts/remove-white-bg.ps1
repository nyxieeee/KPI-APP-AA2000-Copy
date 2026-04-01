$p = "C:\Users\Paulo Almorfe\Downloads\aa2000-kpi\src\assets\images\logo.png"
if (!(Test-Path $p)) { throw "Missing $p" }
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($p)
$w = $bmp.Width
$h = $bmp.Height
$whiteHi = 245
$whiteLo = 198
$flatTol = 30
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.A -eq 0) { continue }
    $r = [int]$c.R
    $g = [int]$c.G
    $b = [int]$c.B
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $flat = ($max - $min) -le $flatTol
    $wgt = ([double]$r + [double]$g + [double]$b) / 3.0
    if ($flat -and $wgt -ge $whiteLo) {
      if ($wgt -ge $whiteHi) {
        $a = 0
      } else {
        $t = ($wgt - $whiteLo) / ($whiteHi - $whiteLo)
        $a = [int][Math]::Round($c.A * (1.0 - $t))
      }
      if ($a -lt $c.A) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $r, $g, $b))
      }
    }
  }
}
# Edge pass: remove near-white pixels that touch transparency (run multiple times to strip halo layers)
$neighbors = @(@(-1,-1),@(0,-1),@(1,-1),@(-1,0),@(1,0),@(-1,1),@(0,1),@(1,1))
$wgtCut = 208
$satTol = 38
foreach ($pass in 1..4) {
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.A -eq 0) { continue }
      $r = [int]$c.R; $g = [int]$c.G; $b = [int]$c.B
      $max = [Math]::Max($r, [Math]::Max($g, $b))
      $min = [Math]::Min($r, [Math]::Min($g, $b))
      if (($max - $min) -gt $satTol) { continue }
      $wgt = ([double]$r + [double]$g + [double]$b) / 3.0
      if ($wgt -lt $wgtCut) { continue }
      $touchesTransparent = $false
      foreach ($n in $neighbors) {
        $nx = $x + [int]$n[0]; $ny = $y + [int]$n[1]
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h) { $touchesTransparent = $true; break }
        if ($bmp.GetPixel($nx, $ny).A -eq 0) { $touchesTransparent = $true; break }
      }
      if ($touchesTransparent) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $r, $g, $b))
      }
    }
  }
}
# Blue-only pass: remove any pixel that is not clearly blue (keeps blue + cyan, removes gray/white/other)
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.A -eq 0) { continue }
    $r = [int]$c.R; $g = [int]$c.G; $b = [int]$c.B
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $avg = ($r + $g + $b) / 3.0
    $sat = ($max - $min)
    $isGrayOrWhite = ($sat -le 28 -and $avg -gt 200)
    $notBlue = ($b -lt $r -or $b -lt $g)
    $weakBlue = ($b -ge $r -and $b -ge $g -and ($b - [Math]::Min($r, $g)) -lt 18)
    if ($isGrayOrWhite -or $notBlue -or $weakBlue) {
      $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $r, $g, $b))
    }
  }
}
$tmp = "$p.tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Move-Item -Force $tmp $p
Write-Host "Done. White background removed."
