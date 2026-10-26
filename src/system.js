// Windows integration: driver health, elevated repair, registry-backed driver
// settings read by the Logitech FFB/filter drivers, and running-process scan.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 8 << 20, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function ps(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}

async function driverStatus() {
  const r = await ps(`
    $d = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(USB|HID)\\\\VID_046D&PID_C29' } | ForEach-Object {
      $p = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_ProblemCode -ErrorAction SilentlyContinue).Data
      [pscustomobject]@{ name = $_.FriendlyName; status = "$($_.Status)"; id = $_.InstanceId; problem = $p }
    }
    [pscustomobject]@{
      devices = @($d)
      wmfilter = Test-Path "$env:SystemRoot\\System32\\drivers\\WmFilter.sys"
      wmhidlo = Test-Path "$env:SystemRoot\\System32\\drivers\\WmHidLo.sys"
      ffbDll = Test-Path "$env:SystemRoot\\System32\\WmJoyFrc.dll"
    } | ConvertTo-Json -Depth 4 -Compress`);
  try {
    const j = JSON.parse(r.stdout.trim());
    const devices = j.devices || [];
    const broken = devices.filter((d) => d.status !== 'OK');
    return {
      devices,
      files: { wmfilter: j.wmfilter, wmhidlo: j.wmhidlo, ffbDll: j.ffbDll },
      healthy: devices.length > 0 && broken.length === 0 && j.wmfilter && j.wmhidlo && j.ffbDll,
      problem: broken.length ? broken[0].problem : null,
      present: devices.length > 0,
    };
  } catch {
    return { devices: [], files: {}, healthy: false, present: false, error: r.stderr || 'falha ao consultar dispositivos' };
  }
}

// Launches install-driver.ps1 elevated (UAC prompt) and resolves with its log.
// source: optional local lgs510_x64.exe, otherwise the script downloads it.
function repairDriver({ script, sevenZip, source, lang = 'pt' }) {
  const log = path.join(os.tmpdir(), `g27-driver-hub-${Date.now()}.log`);
  const inner = `-NoProfile -ExecutionPolicy Bypass -File "${script}" -SevenZip "${sevenZip}" -LogPath "${log}" -Lang ${lang}` +
    (source ? ` -Source "${source}"` : '');
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', [
      '-NoProfile', '-Command',
      `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '${inner.replace(/'/g, "''")}'; exit $p.ExitCode } catch { exit 5 }`,
    ], { windowsHide: true });
    p.on('exit', (code) => {
      const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
      resolve({ ok: code === 0, cancelled: code === 5, log: text });
    });
  });
}

// Reads/writes REG_DWORD values with reg.exe so no native addon is needed.
async function regSetDword(key, name, value) {
  return run('reg.exe', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(value >>> 0), '/f']);
}

async function regQuery(key) {
  const r = await run('reg.exe', ['query', key]);
  const out = {};
  if (!r.ok) return out;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^\s+(\S+)\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    if (m) out[m[1]] = parseInt(m[2], 16);
  }
  return out;
}

async function runningProcesses() {
  const r = await run('tasklist.exe', ['/fo', 'csv', '/nh']);
  const set = new Set();
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)"/);
    if (m) set.add(m[1].toLowerCase());
  }
  return set;
}

module.exports = { driverStatus, repairDriver, regSetDword, regQuery, runningProcesses, ps };
