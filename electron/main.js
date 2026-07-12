const { app, BrowserWindow, shell, ipcMain, Tray, Menu, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

let mainWindow = null;
let serverInstance = null;
let backendPort = Number(process.env.PORT) || 5000;
let tray = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function resolveEnvPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'server', '.env');
  }

  const userEnvPath = path.join(app.getPath('userData'), '.env');
  if (!fs.existsSync(userEnvPath)) {
    const examplePath = path.join(__dirname, '..', 'server', '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, userEnvPath);
    }
  }

  return userEnvPath;
}

function readSettings() {
  const envPath = resolveEnvPath();
  if (!fs.existsSync(envPath)) return {};
  
  const content = fs.readFileSync(envPath, 'utf8');
  const settings = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      settings[key] = val;
    }
  }
  return settings;
}

function writeSettings(newSettings) {
  const envPath = resolveEnvPath();
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  const lines = content.split('\n');
  const updatedKeys = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      if (newSettings.hasOwnProperty(key)) {
        lines[i] = `${key}=${newSettings[key]}`;
        updatedKeys.add(key);
      }
    }
  }
  
  for (const key of Object.keys(newSettings)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${newSettings[key]}`);
    }
  }
  
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
}

function configureRuntimeEnv() {
  process.env.YT_DATA_DIR = process.env.YT_DATA_DIR || app.getPath('userData');
  const envPath = resolveEnvPath();
  if (envPath) {
    process.env.DOTENV_CONFIG_PATH = envPath;
  }
}

async function startBackend() {
  configureRuntimeEnv();

  const { startServer } = require(path.join(__dirname, '..', 'server', 'index.js'));
  try {
    const { port, server } = await startServer();
    serverInstance = server;
    backendPort = port;
    return port;
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      backendPort = Number(process.env.PORT) || 5000;
      return backendPort;
    }
    throw err;
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray_icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Restore Studio', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Exit Studio', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('YT Made EZ Studio');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: false, // Frameless window
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'YT Made EZ Studio',
          body: 'Application running in system tray. Discord bot remains active.',
          icon: path.join(__dirname, 'tray_icon.png')
        });
        notif.show();
      }
    }
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `http://localhost:${port}`;

  mainWindow.loadURL(startUrl);
}

// IPC Registering
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:open-external', async (_event, url) => {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('app:get-settings', () => {
  return readSettings();
});

ipcMain.handle('app:save-settings', (event, settings) => {
  writeSettings(settings);
  return { success: true };
});

ipcMain.handle('app:save-video', async (event, { outputFile, defaultName }) => {
  if (!fs.existsSync(outputFile)) {
    throw new Error('Source file does not exist.');
  }

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Video',
    defaultPath: path.join(app.getPath('downloads'), defaultName || 'video.mp4'),
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] }
    ]
  });

  if (filePath) {
    fs.copyFileSync(outputFile, filePath);
    return { success: true, path: filePath };
  }
  
  return { success: false };
});

ipcMain.handle('app:show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: title || 'YT Made EZ Studio',
      body: body || '',
      icon: path.join(__dirname, 'tray_icon.png')
    });
    notif.show();
    return true;
  }
  return false;
});

ipcMain.on('app:control-window', (event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  } else if (action === 'close') {
    mainWindow.close();
  }
});

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    const port = await startBackend();
    createTray();
    createMainWindow(port);
  } catch (err) {
    console.error('Failed to start app:', err);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) {
    createMainWindow(backendPort);
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  if (serverInstance && typeof serverInstance.close === 'function') {
    try { serverInstance.close(); } catch { /* ignore */ }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
