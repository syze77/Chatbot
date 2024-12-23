const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback),
  onUserProblem: (callback) => ipcRenderer.on('userProblem', callback),
  openWhatsAppChat: (chatId) => ipcRenderer.send('openWhatsAppChat', chatId),
});
