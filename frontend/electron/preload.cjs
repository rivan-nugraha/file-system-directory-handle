// electron/preload.cjs — Aman bridge antara Electron & renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: require('../package.json').version,

  // Auto-update events
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, status) => callback(status));
  },
  installUpdate: () => {
    ipcRenderer.send('install-update');
  },
});
