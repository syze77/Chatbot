const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    updateStatus: (callback) => ipcRenderer.on('updateStatus', callback),
});
