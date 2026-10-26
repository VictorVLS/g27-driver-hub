# Build step: fetches the official 7-Zip release (LGPL) used by the installer
# to unpack Logitech's LGS 5.10 package on the user's machine.
$ErrorActionPreference = 'Stop'
$Version = '26.05'
$Msi = '7z2605-x64.msi'
$Sha256 = '3fe4ab99fa15629c652944309a2b2bc6e41fc933fc6b63f5df1ebcf3aea68263'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'vendor\7zip'
if (Test-Path (Join-Path $out '7z.exe')) { Write-Output "7-Zip $Version já presente"; exit 0 }

$tmp = Join-Path $env:TEMP "g27dh-7z-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $tmp, $out | Out-Null
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest "https://github.com/ip7z/7zip/releases/download/$Version/$Msi" -OutFile "$tmp\$Msi" -UseBasicParsing
$hash = (Get-FileHash "$tmp\$Msi" -Algorithm SHA256).Hash.ToLower()
if ($hash -ne $Sha256) { throw "SHA-256 do 7-Zip não confere: $hash" }
Start-Process msiexec.exe -ArgumentList "/a `"$tmp\$Msi`" /qn TARGETDIR=`"$tmp\x`"" -Wait
$src = Get-ChildItem "$tmp\x" -Recurse -Filter 7z.exe | Select-Object -First 1
foreach ($f in '7z.exe', '7z.dll', 'License.txt') { Copy-Item (Join-Path $src.DirectoryName $f) $out -Force }
Remove-Item $tmp -Recurse -Force
Write-Output "7-Zip $Version copiado para $out"
