const { contextBridge, ipcRenderer } = require('electron');

// Exponha a API do Electron para o mundo principal
contextBridge.exposeInMainWorld('electronAPI', {
    // Método para abrir um chat do WhatsApp
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('openWhatsAppChat', chatId),
    
    // Adicione métodos de navegação
    navigate: (path) => ipcRenderer.send('navigate', path),
    
    // Adicione métodos de tema
    getTheme: () => localStorage.getItem('theme'),
    setTheme: (theme) => localStorage.setItem('theme', theme),

    invoke: (channel, ...args) => {
        const validChannels = [
            'get-contacts',
            'save-ignored-contacts',
            // ...outros canais existentes...
        ];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        return Promise.reject(new Error(`Canal IPC não permitido: ${channel}`));
    },
});