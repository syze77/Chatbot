const { contextBridge, ipcRenderer } = require('electron');

// Expondo as funções do ipcRenderer para o contexto do renderer
contextBridge.exposeInMainWorld('electron', {
  onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback),
  sendUpdateStatus: (statusData) => ipcRenderer.send('updateStatus', statusData),
});
