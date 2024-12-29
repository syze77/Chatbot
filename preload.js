const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('openWhatsAppChat', chatId),
    // ...existing electron APIs...
    
    // Add navigation methods
    navigate: (path) => ipcRenderer.send('navigate', path),
    
    // Add theme methods
    getTheme: () => localStorage.getItem('theme'),
    setTheme: (theme) => localStorage.setItem('theme', theme)
});