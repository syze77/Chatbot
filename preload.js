const { contextBridge, ipcRenderer } = require('electron');

// Expor uma função para o renderer process ouvir atualizações de status
contextBridge.exposeInMainWorld('electron', {
    onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback),
});
