const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  saveVideo: (outputFile, defaultName) => ipcRenderer.invoke('app:save-video', { outputFile, defaultName }),
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:save-settings', settings),
  showNotification: (title, body) => ipcRenderer.invoke('app:show-notification', { title, body }),
  controlWindow: (action) => ipcRenderer.send('app:control-window', action),
});
