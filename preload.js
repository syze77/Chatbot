const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback),
});
