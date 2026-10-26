; Runs after the files are copied: fetches the official LGS 5.10 package from
; Logitech, verifies it and installs only the G27 wheel drivers.
!macro customInstall
  ; In-app updates run this installer with --updated: then the script only
  ; repairs the driver if it is unhealthy, so the wheel is not restarted.
  StrCpy $2 ""
  ${If} ${isUpdated}
    StrCpy $2 "-Update"
  ${EndIf}
  StrCpy $1 "en"
  ${If} $LANGUAGE == 1046
    StrCpy $1 "pt"
    DetailPrint "Instalando o driver do G27 (baixando o LGS 5.10 oficial da Logitech)..."
  ${Else}
    DetailPrint "Installing the G27 driver (downloading the official LGS 5.10 from Logitech)..."
  ${EndIf}
  ; Sysnative: the 64-bit PowerShell, since this installer runs as a 32-bit process.
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\driver\install-driver.ps1" -SevenZip "$INSTDIR\resources\vendor\7zip\7z.exe" -Lang $1 $2 -LogPath "$TEMP\g27-driver-hub-install.log"'
  Pop $0
  ${If} $0 != 0
    ${If} $LANGUAGE == 1046
      MessageBox MB_ICONEXCLAMATION|MB_OK "Não foi possível instalar o driver do volante agora (código $0).$\r$\n$\r$\nO aplicativo foi instalado. Abra o G27 Driver Hub > Sistema > Instalar / reparar driver.$\r$\nLog: $TEMP\g27-driver-hub-install.log" /SD IDOK
    ${Else}
      MessageBox MB_ICONEXCLAMATION|MB_OK "The wheel driver could not be installed right now (code $0).$\r$\n$\r$\nThe app was installed. Open G27 Driver Hub > System > Install / repair driver.$\r$\nLog: $TEMP\g27-driver-hub-install.log" /SD IDOK
    ${EndIf}
  ${EndIf}
!macroend
