const { contextBridge, ipcRenderer } = require('electron');

// Exponha a API do Electron para o mundo principal
contextBridge.exposeInMainWorld('electron', {
    // Método para abrir um chat do WhatsApp
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('openWhatsAppChat', chatId),
    
    // Adicione métodos de navegação
    navigate: (path) => ipcRenderer.send('navigate', path),
    
    // Adicione métodos de tema
    getTheme: () => localStorage.getItem('theme'),
    setTheme: (theme) => localStorage.setItem('theme', theme)
});