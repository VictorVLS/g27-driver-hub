# Rasterizes assets/icon.svg (detailed, used from 48 px up) and
# assets/icon-small.svg (simplified, used at 16-32 px) with Microsoft Edge,
# then writes assets/icon.png, assets/tray.png and a multi-size assets/icon.ico.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }
$tmp = Join-Path $env:TEMP "g27dh-icons-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Render($svg, $out) {
    $url = 'file:///' + ((Join-Path $assets $svg) -replace '\\', '/')
    # Edge reports "bytes written" on stderr; that is not an error.
    $ErrorActionPreference = 'Continue'
    & $edge --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --force-device-scale-factor=2 --window-size=512,512 "--screenshot=$out" $url 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    for ($i = 0; $i -lt 50 -and -not (Test-Path $out); $i++) { Start-Sleep -Milliseconds 100 }
}
function Resize($src, $size, $out) {
    $img = [Drawing.Image]::FromFile($src)
    $bmp = New-Object Drawing.Bitmap $size, $size, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

Render 'icon.svg' "$tmp\big.png"
Render 'icon-small.svg' "$tmp\small.png"
$sizes = 16, 24, 32, 48, 64, 128, 256
foreach ($s in $sizes) { Resize ($(if ($s -le 32) { "$tmp\small.png" } else { "$tmp\big.png" })) $s "$tmp\$s.png" }
Copy-Item "$tmp\256.png" (Join-Path $assets 'icon.png') -Force
Resize "$tmp\small.png" 32 (Join-Path $assets 'tray.png')

# 32-bit BGRA DIB frame (bottom-up, with the 1-bit AND mask) for sizes below
# 256; the classic layout every Windows component reads.
function DibFrame($png) {
    $bmp = [Drawing.Bitmap]::FromFile($png)
    $n = $bmp.Width
    $ms = New-Object IO.MemoryStream
    $w = New-Object IO.BinaryWriter $ms
    $w.Write([uint32]40); $w.Write([int32]$n); $w.Write([int32]($n * 2)); $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]0); $w.Write([uint32]0); $w.Write([int32]0); $w.Write([int32]0); $w.Write([uint32]0); $w.Write([uint32]0)
    for ($y = $n - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $n; $x++) { $c = $bmp.GetPixel($x, $y); $w.Write([byte]$c.B); $w.Write([byte]$c.G); $w.Write([byte]$c.R); $w.Write([byte]$c.A) }
    }
    $maskRow = [int]([math]::Ceiling($n / 32) * 4)
    for ($y = $n - 1; $y -ge 0; $y--) {
        $row = New-Object byte[] $maskRow
        for ($x = 0; $x -lt $n; $x++) { if ($bmp.GetPixel($x, $y).A -eq 0) { $row[[int][math]::Floor($x / 8)] = $row[[int][math]::Floor($x / 8)] -bor (0x80 -shr ($x % 8)) } }
        $w.Write($row)
    }
    $bmp.Dispose()
    return , $ms.ToArray()
}

$frames = New-Object 'System.Collections.Generic.List[byte[]]'
foreach ($s in $sizes) {
    if ($s -ge 256) { $frames.Add([IO.File]::ReadAllBytes("$tmp\$s.png")) } else { $frames.Add((DibFrame "$tmp\$s.png")) }
}
$ms = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $ms
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $d = $frames[$i]
    $w.Write([byte]($s % 256)); $w.Write([byte]($s % 256)); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$d.Length); $w.Write([uint32]$offset)
    $offset += $d.Length
}
foreach ($d in $frames) { $w.Write($d) }
[IO.File]::WriteAllBytes((Join-Path $assets 'icon.ico'), $ms.ToArray())
Remove-Item $tmp -Recurse -Force
Write-Output "icon.ico ($($sizes -join ', ') px), icon.png 256, tray.png 32"
