# How G27 Driver Hub works

G27 Driver Hub reuses the wheel drivers that ship with Logitech Gaming Software
5.10 (`WmJoyHid` 5.09.129, April 2010) and replaces only the user interface. It
talks to the wheel and the driver through three channels.

## 1. HID output reports (instant, firmware level)

All reports are 7 bytes, no report ID, written to the joystick top-level
collection (usage page 1, usage 4). This is the classic Logitech wheel protocol
documented by the Linux `hid-lg4ff` driver.

| Action | Bytes |
| --- | --- |
| Leave compatibility mode (PID C294 → C29B) | `F8 0A 00 00 00 00 00`, then `F8 09 04 01 00 00 00` |
| Rotation range (40–900°) | `F8 81 lo hi 00 00 00` |
| Centering spring on | `FE 0D k k b 00 00`, then `14 00 00 00 00 00 00` |
| Centering spring off | `F5 00 00 00 00 00 00` |
| RPM LEDs (5 pairs, bitmask) | `F8 12 mask 00 00 00 01` |
| Constant force test (slot 1) | `11 08 level 80 00 00 00`, stop with `13 00 …` |

The mode-switch bytes are the same ones `wmfilter.sys` itself keeps in a
command table (at RVA `0x6A98`), which is how the Logitech driver
switches the wheel to native mode on its own.

## 2. Force feedback settings (applied when a game starts)

`WmJoyFrc.dll` is the DirectInput force-feedback driver and runs inside the
game process. When it is the first to open the wheel, it creates a shared
section named `WmJoyFrcData_VID_046D&PID_C29B` and loads these `REG_DWORD`
values:

```
HKCU\Software\Logitech\Gaming Software\DriverSettings\VID_046D&PID_C29B
  OverallStrength            0..15000   (percent × 100)
  SpringStrength             0..15000
  DamperStrength             0..15000
  CenteringSpring            0..15000
  PersistentCenteringSpring  0 / 1
  ForceEnabled               0 / 1
```

Values outside the range are ignored by the driver. Because they are read when
the game initialises the wheel, changes apply the next time a game starts.

The first DWORD of the shared section holds the tick count of the last
force-feedback activity. It is a useful diagnostic: if it does not change while
you drive, the game is not sending any effects (for example, its FFB scale is
set very low).

## 3. Filter driver parameters (applied when the wheel starts)

`WmFilter.sys` reads, when the device starts:

```
HKLM\SYSTEM\CurrentControlSet\Services\WmFilter\Parameters\VID_046D&PID_C29B
  CombinePedals    0 / 1
  OperatingRange   degrees (default 200, maximum 900)
```

Changing them needs administrator rights and a device restart, which the app
does through a UAC prompt.

## Driver installation

`driver/install-driver.ps1`:

1. Downloads `lgs510_x64.exe` from
   `https://download01.logi.com/web/ftp/pub/techsupport/joystick/lgs510_x64.exe`
   (or uses a local copy).
2. Checks SHA-256 `e07a278eab65df9fa50b3c454627c7169beb41824015839d2a0368caf284ca76`
   and the Authenticode signature (Logitech Inc).
3. Unpacks the two nested installers with 7-Zip and keeps only the `wm*.sys`,
   `wm*.inf`, `wm*.cat` and `wm*.dll` files, re-checking every signature.
4. Runs `pnputil /add-driver … /install` for `wmbenum.inf`, `wmvirhid.inf` and
   `wmjoyhid.inf`, restores `WmFilter.sys`/`WmHidLo.sys` if a previous uninstall
   deleted them (the cause of error code 39), and writes a default
   `OperatingRange` of 900.
5. Removes and rescans the wheel so Windows loads the driver again.

Nothing else from LGS is installed, in particular not `LCore.exe`, the process
that G HUB detects and shuts down.

## Reading inputs

The app reads the wheel with the browser Gamepad API (Chromium raw input). With
the Logitech driver loaded the axes are: 0 = wheel, 2 = throttle, 5 = brake,
6 = clutch (pedals report +1 when released), 9 = POV hat. Shifter gears 1–6 and
reverse are buttons 9–15. If your setup differs, **Inputs → Map pedals** learns
the axes.

## Tools used

The driver analysis was done on the shipped binaries with
[REA](https://www.npmjs.com/package/rea-agents) and Ghidra, to find which
registry values and command tables the drivers use. No Logitech code is
included in this project.
