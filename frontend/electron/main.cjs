// electron/main.cjs — Electron main process + auto-update
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'POS - Point of Sale',
    // icon: path.join(__dirname, '../public/icon.png'), // uncomment kalau sudah ada icon.png 512x512
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    // Cek update 3 detik setelah window siap (production only)
    setTimeout(() => checkForUpdates(), 3000);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Auto Updater ──────────────────────────────────────────

function checkForUpdates() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Silent fail — app tetap jalan meskipun cek update gagal
  });
}

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-status', 'available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-status', 'downloaded');
});

autoUpdater.on('error', () => {
  mainWindow?.webContents.send('update-status', 'error');
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ── App lifecycle ─────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
