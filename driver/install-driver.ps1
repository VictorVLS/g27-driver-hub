# Installs (or repairs) the Logitech G27 driver stack without installing the
# Logitech Gaming Software application itself.
#
# The Logitech binaries are never shipped with G27 Driver Hub: this script
# downloads the official LGS 5.10 installer from Logitech's own server (or uses
# a local copy), verifies its SHA-256 and Authenticode signature, extracts only
# the wheel drivers and installs them with pnputil. Must run elevated, except
# with -ExtractOnly.
param(
    [Parameter(Mandatory)] [string]$SevenZip,
    [string]$Source = '',
    [string]$LogPath = "$env:TEMP\g27-driver-hub-install.log",
    [string]$CacheDir = (Join-Path $env:ProgramData 'G27DriverHub'),
    [ValidateSet('pt', 'en')] [string]$Lang = 'pt',
    [switch]$ExtractOnly  # download, verify and unpack only; no admin needed
)

$ErrorActionPreference = 'Stop'
$LgsUrl = 'https://download01.logi.com/web/ftp/pub/techsupport/joystick/lgs510_x64.exe'
$LgsSha256 = 'e07a278eab65df9fa50b3c454627c7169beb41824015839d2a0368caf284ca76'
$DriverDir = Join-Path $CacheDir 'drivers'
$Required = 'wmjoyhid.inf', 'wmjoyhid.cat', 'wmfilter.sys', 'wmhidlo.sys', 'wmjoyfrc.dll', 'wmjoyf32.dll',
            'wmvirhid.inf', 'wmvirhid.cat', 'wmvirhid.sys', 'wmbenum.inf', 'wmbenum.cat', 'wmbenum.sys', 'wmxlcore.sys'

function L([string]$pt, [string]$en) { if ($Lang -eq 'en') { $en } else { $pt } }

function Assert-LogitechSigned($path) {
    if ($path -match '\.inf$') { return }  # INF files are covered by their signed .cat
    $sig = Get-AuthenticodeSignature $path
    $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
    if ($sig.Status -ne 'Valid' -or $subject -notmatch 'Logitech|Microsoft Windows Hardware') {
        throw (L 'Assinatura inválida em' 'Invalid signature on') + " $(Split-Path $path -Leaf): $($sig.Status) $subject"
    }
}

Start-Transcript -Path $LogPath -Force | Out-Null
$code = 1
try {
    $haveDrivers = (Test-Path $DriverDir) -and -not ($Required | Where-Object { -not (Test-Path (Join-Path $DriverDir $_)) })
    if (-not $haveDrivers) {
        New-Item -ItemType Directory -Force $CacheDir | Out-Null
        $lgs = Join-Path $CacheDir 'lgs510_x64.exe'
        if ($Source) {
            Write-Output ('== ' + (L 'Usando instalador local:' 'Using local installer:') + " $Source")
            Copy-Item $Source $lgs -Force
        } elseif (-not (Test-Path $lgs) -or (Get-FileHash $lgs -Algorithm SHA256).Hash -ne $LgsSha256) {
            Write-Output ('== ' + (L 'Baixando o LGS 5.10 do servidor oficial da Logitech' "Downloading LGS 5.10 from Logitech's official server"))
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest $LgsUrl -OutFile $lgs -UseBasicParsing
        }
        $hash = (Get-FileHash $lgs -Algorithm SHA256).Hash.ToLower()
        if ($hash -ne $LgsSha256) { throw (L 'SHA-256 do lgs510_x64.exe não confere' 'lgs510_x64.exe SHA-256 mismatch') + " ($hash)" }
        Assert-LogitechSigned $lgs
        Write-Output (L 'Instalador verificado: SHA-256 e assinatura da Logitech OK' 'Installer verified: SHA-256 and Logitech signature OK')

        $tmp = Join-Path $env:TEMP "g27dh-$([guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Force $tmp | Out-Null
        & $SevenZip e $lgs "-o$tmp\outer" 'lgs510_x64.exe' -r -y | Out-Null
        if ($LASTEXITCODE -ne 0) { throw (L '7-Zip falhou ao abrir o instalador' '7-Zip could not open the installer') + " ($LASTEXITCODE)" }
        # Paths inside the Logitech stub carry a leading "\", so match by file name.
        & $SevenZip e "$tmp\outer\lgs510_x64.exe" "-o$tmp\drv" 'wm*.sys' 'wm*.inf' 'wm*.cat' 'wm*.dll' -r -y | Out-Null
        if ($LASTEXITCODE -ne 0) { throw (L '7-Zip falhou ao extrair os drivers' '7-Zip could not extract the drivers') + " ($LASTEXITCODE)" }
        New-Item -ItemType Directory -Force $DriverDir | Out-Null
        Copy-Item "$tmp\drv\*" $DriverDir -Force
        Remove-Item $tmp -Recurse -Force
        foreach ($f in $Required) { Assert-LogitechSigned (Join-Path $DriverDir $f) }
        Write-Output ((L 'Drivers extraídos e verificados em' 'Drivers extracted and verified in') + " $DriverDir")
    }

    if ($ExtractOnly) {
        Write-Output (L 'ExtractOnly: nada foi instalado.' 'ExtractOnly: nothing was installed.')
    } else {
        Write-Output ('== ' + (L 'Instalando os pacotes de driver' 'Installing driver packages'))
        foreach ($inf in 'wmbenum.inf', 'wmvirhid.inf', 'wmjoyhid.inf') {
            pnputil /add-driver (Join-Path $DriverDir $inf) /install
        }

        # A previous LGS uninstall can leave the service registered but delete the
        # .sys, which makes the wheel's HID function fail with code 39.
        foreach ($sys in 'wmfilter.sys', 'wmhidlo.sys') {
            $dst = Join-Path $env:SystemRoot "System32\drivers\$sys"
            if (-not (Test-Path $dst)) {
                Write-Output ((L 'Restaurando' 'Restoring') + " $sys")
                Copy-Item (Join-Path $DriverDir $sys) $dst -Force
            }
        }

        # WmFilter reads these when the wheel starts; without them it boots at 200°.
        $params = 'HKLM:\SYSTEM\CurrentControlSet\Services\WmFilter\Parameters\VID_046D&PID_C29B'
        New-Item -Path $params -Force | Out-Null
        if ($null -eq (Get-ItemProperty $params -Name OperatingRange -ErrorAction SilentlyContinue)) {
            New-ItemProperty -Path $params -Name OperatingRange -PropertyType DWord -Value 900 -Force | Out-Null
            New-ItemProperty -Path $params -Name CombinePedals -PropertyType DWord -Value 0 -Force | Out-Null
        }

        Write-Output ('== ' + (L 'Reiniciando o volante' 'Restarting the wheel'))
        Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(USB|HID)\\VID_046D&PID_C29[4-9AB]' } | ForEach-Object {
            pnputil /remove-device $_.InstanceId
        }
        pnputil /scan-devices
        Start-Sleep -Seconds 3
        Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_046D&PID_C29' } |
            Format-Table FriendlyName, Status, InstanceId -AutoSize | Out-String -Width 200
    }
    Write-Output (L 'Concluído.' 'Done.')
    $code = 0
} catch {
    Write-Output ((L 'ERRO:' 'ERROR:') + " $($_.Exception.Message)")
} finally {
    Stop-Transcript | Out-Null
}
exit $code
