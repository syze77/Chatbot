const { contextBridge, ipcRenderer } = require('electron');

// Expor apenas uma vez as funções necessárias
contextBridge.exposeInMainWorld('electron', {
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('openWhatsAppChat', chatId),
    // ...outros métodos...
});