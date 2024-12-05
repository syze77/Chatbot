const { contextBridge, ipcRenderer } = require('electron');

// Expondo apenas as funcionalidades necessárias
contextBridge.exposeInMainWorld('electron', {
    sendStatusUpdate: (data) => ipcRenderer.send('updateStatus', data), // Envia atualização para o processo principal
    onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback) // Ouve por atualizações do processo principal
});
