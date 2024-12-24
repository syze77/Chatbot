const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onStatusUpdate: (callback) => ipcRenderer.on('statusUpdate', callback),
  onUserProblem: (callback) => ipcRenderer.on('userProblem', callback),
  openWhatsAppChat: (chatId) => ipcRenderer.send('openWhatsAppChat', chatId),
  getCompletedAttendances: (callback) => ipcRenderer.on('getCompletedAttendances', callback),
  deleteCompletedAttendance: (chatId) => ipcRenderer.send('deleteCompletedAttendance', chatId)
});