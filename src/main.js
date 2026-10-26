const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { G27 } = require('./g27');
const sys = require('./system');
const driverSettings = require('./driver-settings');
const EN = require('./i18n-dict');

const ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const DRIVER_SCRIPT = path.join(ROOT, 'driver', 'install-driver.ps1');
const SEVEN_ZIP = path.join(ROOT, 'vendor', '7zip', '7z.exe');
const ICON = path.join(ROOT, 'assets', 'icon.png');
const CONFIG = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_SETTINGS = {
  range: 900,
  autocenter: 30,
  overall: 100,
  spring: 100,
  damper: 100,
  centeringSpring: false,
  centeringStrength: 100,
  combinedPedals: false,
  allowGame: true,
};

const DEFAULT_CONFIG = {
  activeProfileId: 'desktop',
  prefs: { autoSwitch: true, autoNative: true, minimizeToTray: true, startWithWindows: false },
  profiles: [{ id: 'desktop', name: 'Desktop', exe: null, color: '#00b8fc', settings: { ...DEFAULT_SETTINGS } }],
};

let config = loadConfig();
let win = null;
let tray = null;
let quitting = false;
let autoProfileId = null; // profile selected by the process watcher, if any
const wheel = new G27();

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    c.prefs = { ...DEFAULT_CONFIG.prefs, ...c.prefs };
    c.profiles = c.profiles.map((p) => ({ ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } }));
    if (!c.profiles.find((p) => p.id === 'desktop')) c.profiles.unshift(structuredClone(DEFAULT_CONFIG.profiles[0]));
    return c;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

// Only valid after app 'ready'.
const defaultLang = () => (/^pt/i.test(app.getLocale()) ? 'pt' : 'en');

// Portuguese strings are the keys of the shared English dictionary.
function t(s, ...args) {
  let r = config && config.prefs.lang === 'en' && EN[s] ? EN[s] : s;
  args.forEach((a, i) => { r = r.replace(`{${i}}`, a); });
  return r;
}

function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
}

const activeProfile = () =>
  config.profiles.find((p) => p.id === (autoProfileId || config.activeProfileId)) || config.profiles[0];

function publicState() {
  return {
    config,
    activeId: activeProfile().id,
    autoProfileId,
    device: wheel.status(),
    versions: { app: app.getVersion(), electron: process.versions.electron },
  };
}

const send = (channel, data) => win && !win.isDestroyed() && win.webContents.send(channel, data);
const toast = (text, kind = 'info') => send('toast', { text, kind });
const pushState = () => send('state', publicState());

// Firmware-level settings go straight to the wheel; driver-level ones go to
// the registry values the Logitech FFB driver reads when a game opens it.
async function applyToDevice(settings, { quiet = false } = {}) {
  try {
    await driverSettings.applyUser(settings);
    if (wheel.connected && wheel.status().native) {
      await wheel.setRange(settings.range);
      await wheel.setAutocenter(settings.autocenter);
    }
    if (!quiet) toast(t('Perfil "{0}" aplicado', activeProfile().name), 'ok');
  } catch (e) {
    toast(t(e.message), 'error');
  }
}

let applyTimer = null;
function scheduleApply(settings) {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => applyToDevice(settings, { quiet: true }), 60);
}

wheel.on('change', async (st) => {
  send('device', st);
  if (!st.connected) return;
  if (!st.native && config.prefs.autoNative) {
    toast(t('Ativando modo nativo do G27 (900°, pedais separados)…'));
    try { await wheel.switchToNative(); } catch (e) { toast(t(e.message), 'error'); }
    return; // the wheel re-enumerates with the native PID; settings apply then
  }
  await applyToDevice(activeProfile().settings, { quiet: true });
  toast(t('{0} conectado', t(st.model)), 'ok');
});
wheel.on('error', (msg) => toast(t(msg), 'error'));

async function watchProcesses() {
  if (!config.prefs.autoSwitch) {
    if (autoProfileId) { autoProfileId = null; await onProfileChanged(); }
    return;
  }
  const running = await sys.runningProcesses();
  const match = config.profiles.find((p) => p.exe && running.has(p.exe.toLowerCase()));
  const next = match ? match.id : null;
  if (next !== autoProfileId) {
    autoProfileId = next;
    await onProfileChanged();
    return;
  }
  // "Allow game to adjust settings" off: keep forcing the profile's rotation
  // while its game runs, undoing any range the game sets.
  const s = activeProfile().settings;
  if (autoProfileId && !s.allowGame && wheel.connected && wheel.status().native) {
    await wheel.setRange(s.range);
  }
}

async function onProfileChanged() {
  pushState();
  await applyToDevice(activeProfile().settings);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0b0d10',
    icon: ICON,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (!quitting && config.prefs.minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('maximize', () => send('state', publicState()));
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('G27 Driver Hub');
  const rebuild = () =>
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('Abrir G27 Driver Hub'), click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      ...config.profiles.map((p) => ({
        label: p.name, type: 'radio', checked: p.id === activeProfile().id,
        click: () => { config.activeProfileId = p.id; autoProfileId = null; saveConfig(); onProfileChanged(); },
      })),
      { type: 'separator' },
      { label: t('Sair'), click: () => { quitting = true; app.quit(); } },
    ]));
  rebuild();
  tray.on('double-click', () => { win.show(); win.focus(); });
  return rebuild;
}

function registerIpc(rebuildTray) {
  ipcMain.handle('state:get', () => publicState());

  ipcMain.handle('settings:update', (_e, patch) => {
    const p = activeProfile();
    p.settings = { ...p.settings, ...patch };
    saveConfig();
    scheduleApply(p.settings);
    return p.settings;
  });

  ipcMain.handle('profile:save', (_e, prof) => {
    const i = config.profiles.findIndex((p) => p.id === prof.id);
    if (i >= 0) config.profiles[i] = { ...config.profiles[i], ...prof, id: config.profiles[i].id };
    else config.profiles.push({ settings: { ...activeProfile().settings }, color: '#00b8fc', ...prof, id: `p${Date.now()}` });
    saveConfig();
    rebuildTray();
    pushState();
    return publicState();
  });

  ipcMain.handle('profile:delete', async (_e, id) => {
    if (id === 'desktop') return publicState();
    config.profiles = config.profiles.filter((p) => p.id !== id);
    if (config.activeProfileId === id) config.activeProfileId = 'desktop';
    if (autoProfileId === id) autoProfileId = null;
    saveConfig();
    rebuildTray();
    await onProfileChanged();
    return publicState();
  });

  ipcMain.handle('profile:activate', async (_e, id) => {
    config.activeProfileId = id;
    autoProfileId = null;
    saveConfig();
    rebuildTray();
    await onProfileChanged();
    return publicState();
  });

  ipcMain.handle('prefs:set', (_e, patch) => {
    config.prefs = { ...config.prefs, ...patch };
    if ('startWithWindows' in patch) {
      app.setLoginItemSettings({ openAtLogin: !!patch.startWithWindows, args: ['--hidden'] });
    }
    if ('lang' in patch) rebuildTray();
    saveConfig();
    pushState();
    return config.prefs;
  });

  ipcMain.handle('dialog:pick-exe', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: t('Escolha o executável do jogo'),
      filters: [{ name: t('Executáveis'), extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { exe: path.basename(r.filePaths[0]), name: path.basename(r.filePaths[0], '.exe') };
  });

  ipcMain.handle('process:list', async () => [...(await sys.runningProcesses())].sort());

  ipcMain.handle('device:native', async () => {
    await wheel.switchToNative();
    return true;
  });
  ipcMain.handle('device:leds', (_e, mask) => wheel.setLeds(mask));
  ipcMain.handle('device:force', (_e, level) => wheel.constantForce(level));
  ipcMain.handle('device:stop', () => wheel.stopForce());
  ipcMain.handle('device:reapply', () => applyToDevice(activeProfile().settings));

  ipcMain.handle('driver:status', () => sys.driverStatus());
  ipcMain.handle('driver:repair', async (_e, { fromFile = false } = {}) => {
    let source = null;
    if (fromFile) {
      const r = await dialog.showOpenDialog(win, {
        title: t('Escolha o lgs510_x64.exe (Logitech Gaming Software 5.10)'),
        filters: [{ name: t('Instalador LGS 5.10'), extensions: ['exe'] }],
        properties: ['openFile'],
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true, log: '' };
      source = r.filePaths[0];
    }
    wheel.close();
    return sys.repairDriver({ script: DRIVER_SCRIPT, sevenZip: SEVEN_ZIP, source, lang: config.prefs.lang });
  });
  ipcMain.handle('driver:combined', async (_e, on) => {
    const r = await driverSettings.setFilterParams({ combinedPedals: on, range: activeProfile().settings.range });
    if (r.ok) toast(t('Driver atualizado — o volante foi reiniciado'), 'ok');
    return { ...r, message: r.message && t(r.message) };
  });

  ipcMain.on('win', (_e, action) => {
    if (!win) return;
    if (action === 'min') win.minimize();
    else if (action === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    if (!config.prefs.lang) {
      config.prefs.lang = defaultLang();
      saveConfig();
    }
    createWindow();
    const rebuildTray = createTray();
    registerIpc(rebuildTray);
    if (process.argv.includes('--hidden')) win.once('ready-to-show', () => win.hide());
    wheel.poll();
    setInterval(() => wheel.poll(), 1000);
    setInterval(() => watchProcesses().catch(() => {}), 3000);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => app.quit());
}
