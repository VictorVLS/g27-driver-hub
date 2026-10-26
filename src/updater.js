// In-app updates from the GitHub releases (electron-updater). Downloads are
// differential: the installer's .blockmap lets electron-updater fetch only
// the blocks that changed since the installed version.
const { app } = require('electron');

let autoUpdater = null;
let state = { status: app.isPackaged ? 'idle' : 'dev', version: null, percent: 0, transferred: 0, total: 0, notes: '', error: '' };
let notify = () => {};

const stripHtml = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();

function set(patch) {
  state = { ...state, ...patch };
  notify(state);
}

function init(onChange) {
  notify = onChange;
  if (!app.isPackaged) return; // no app-update.yml when running from source
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Testing hook: serve dist/ over HTTP and point the app at it.
  if (process.env.G27DH_UPDATE_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.G27DH_UPDATE_URL, useMultipleRangeRequest: false });
  }
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }));
  autoUpdater.on('update-available', (info) => set({
    status: 'available', version: info.version, notes: stripHtml(info.releaseNotes).slice(0, 1500),
  }));
  autoUpdater.on('download-progress', (p) => set({
    status: 'downloading', percent: Math.round(p.percent), transferred: p.transferred, total: p.total,
  }));
  autoUpdater.on('update-downloaded', () => set({ status: 'ready', percent: 100 }));
  autoUpdater.on('error', (e) => {
    const msg = String((e && e.message) || e);
    // The newest GitHub release has no update metadata (an older release, or
    // GitHub's releases feed still cached right after a publish): nothing to
    // update to, so report "up to date" instead of an error.
    if (state.status === 'checking' && /latest\.yml|No published versions|HttpError: 404/i.test(msg)) {
      set({ status: 'latest' });
      return;
    }
    if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK/i.test(msg)) {
      set({ status: 'error', error: 'offline' });
      return;
    }
    set({ status: 'error', error: msg.split('\n')[0] });
  });
}

async function check() {
  if (!autoUpdater) return state;
  try { await autoUpdater.checkForUpdates(); } catch { /* reported by the 'error' event */ }
  return state;
}

async function download() {
  if (!autoUpdater || state.status !== 'available') return state;
  set({ status: 'downloading', percent: 0 });
  try { await autoUpdater.downloadUpdate(); } catch { /* reported by the 'error' event */ }
  return state;
}

// Runs the downloaded installer silently (one UAC prompt) and reopens the app.
function install() {
  if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(true, true);
}

module.exports = { init, check, download, install, getState: () => state };
