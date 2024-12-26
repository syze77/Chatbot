const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openWhatsAppChat: (chatId) => ipcRenderer.send('redirectToChat', chatId),
    markProblemCompleted: (chatId) => ipcRenderer.send('markProblemCompleted', chatId),
    getCompletedAttendances: (callback) => ipcRenderer.on('completedAttendances', callback),
    deleteCompletedAttendance: (chatId) => ipcRenderer.send('deleteCompletedAttendance', chatId)
});