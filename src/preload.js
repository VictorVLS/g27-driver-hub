const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('hub', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveProfile: (p) => ipcRenderer.invoke('profile:save', p),
  deleteProfile: (id) => ipcRenderer.invoke('profile:delete', id),
  activateProfile: (id) => ipcRenderer.invoke('profile:activate', id),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  pickExe: () => ipcRenderer.invoke('dialog:pick-exe'),
  listProcesses: () => ipcRenderer.invoke('process:list'),

  switchNative: () => ipcRenderer.invoke('device:native'),
  setLeds: (mask) => ipcRenderer.invoke('device:leds', mask),
  testForce: (level) => ipcRenderer.invoke('device:force', level),
  stopForce: () => ipcRenderer.invoke('device:stop'),
  reapply: () => ipcRenderer.invoke('device:reapply'),

  driverStatus: () => ipcRenderer.invoke('driver:status'),
  repairDriver: (opts) => ipcRenderer.invoke('driver:repair', opts),
  setCombinedPedals: (on) => ipcRenderer.invoke('driver:combined', on),

  telemetryStatus: () => ipcRenderer.invoke('telemetry:status'),
  updateState: () => ipcRenderer.invoke('update:state'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  win: (action) => ipcRenderer.send('win', action),

  onDevice: on('device'),
  onState: on('state'),
  onToast: on('toast'),
  onUpdate: on('update'),
});
