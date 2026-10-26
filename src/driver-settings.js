// Registry values consumed by the LGS 5.10 driver stack, recovered with REA +
// Ghidra from the shipped binaries:
//
// WmJoyFrc.dll (FFB, runs inside the game) creates the shared section
// "WmJoyFrcData_VID_046D&PID_C29B"; when it is the first opener it loads
//   HKCU\Software\Logitech\Gaming Software\DriverSettings\VID_046D&PID_C29B
// REG_DWORD OverallStrength / SpringStrength / DamperStrength / CenteringSpring
// in 0..15000 (percent x 100), PersistentCenteringSpring and ForceEnabled 0/1.
//
// WmFilter.sys reads, when the wheel starts,
//   HKLM\SYSTEM\CurrentControlSet\Services\WmFilter\Parameters\VID_046D&PID_C29B
// REG_DWORD CombinePedals (0/1) and OperatingRange (degrees, default 200, max 900).
// WmHidLo.sys reads WheelRange (default 200) from its own Parameters key and
// sends it to the wheel as the start-up rotation.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const DEVICE = 'VID_046D&PID_C29B';
const USER_KEY = `HKEY_CURRENT_USER\\Software\\Logitech\\Gaming Software\\DriverSettings\\${DEVICE}`;
const FILTER_KEY = `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\WmFilter\\Parameters\\${DEVICE}`;
const HIDLO_KEY = `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\WmHidLo\\Parameters\\${DEVICE}`;

const pct = (v) => Math.max(0, Math.min(15000, Math.round(v * 100)));
const dword = (n) => `dword:${(n >>> 0).toString(16).padStart(8, '0')}`;

function regFile(key, values) {
  const lines = ['Windows Registry Editor Version 5.00', '', `[${key}]`];
  for (const [k, v] of Object.entries(values)) lines.push(`"${k}"=${dword(v)}`);
  return lines.join('\r\n') + '\r\n';
}

function importReg(text) {
  const file = path.join(os.tmpdir(), `g27hub-${process.pid}-${Date.now()}.reg`);
  fs.writeFileSync(file, '﻿' + text, 'utf16le');
  return new Promise((resolve, reject) => {
    execFile('reg.exe', ['import', file], { windowsHide: true }, (err, _o, stderr) => {
      fs.rm(file, () => {});
      err ? reject(new Error(`Falha ao gravar configurações do driver: ${stderr || err.message}`)) : resolve();
    });
  });
}

let lastUser = '';
async function applyUser(s) {
  const text = regFile(USER_KEY, {
    OverallStrength: pct(s.overall),
    SpringStrength: pct(s.spring),
    DamperStrength: pct(s.damper),
    CenteringSpring: pct(s.centeringStrength),
    PersistentCenteringSpring: s.centeringSpring ? 1 : 0,
    ForceEnabled: 1,
  });
  if (text === lastUser) return;
  await importReg(text);
  lastUser = text;
}

// Writes the filter-driver values elevated (UAC) and restarts the wheel so
// WmFilter and WmHidLo re-read them.
function setFilterParams({ combinedPedals, range }) {
  const degrees = Math.max(40, Math.min(900, Math.round(range)));
  const text = regFile(FILTER_KEY, { CombinePedals: combinedPedals ? 1 : 0, OperatingRange: degrees }) +
    `\r\n[${HIDLO_KEY}]\r\n"WheelRange"=${dword(degrees)}\r\n`;
  const file = path.join(os.tmpdir(), `g27hub-filter-${Date.now()}.reg`);
  fs.writeFileSync(file, '﻿' + text, 'utf16le');
  const inner = [
    `reg.exe import '${file}'`,
    `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_046D&PID_C29B' } | ForEach-Object { pnputil /restart-device $_.InstanceId }`,
  ].join('; ');
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', [
      '-NoProfile', '-Command',
      `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile -EncodedCommand ${encoded}'; exit $p.ExitCode } catch { exit 5 }`,
    ], { windowsHide: true });
    p.on('exit', (code) => {
      fs.rm(file, () => {});
      if (code === 5) resolve({ ok: false, message: 'Permissão de administrador negada' });
      else resolve({ ok: true });
    });
  });
}

module.exports = { applyUser, setFilterParams, USER_KEY, FILTER_KEY };
