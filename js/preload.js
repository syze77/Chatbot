const { contextBridge, ipcRenderer } = require('electron');

// Exponha a API do Electron para o mundo principal
contextBridge.exposeInMainWorld('electronAPI', {
    // Método para abrir um chat do WhatsApp
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('openWhatsAppChat', chatId),
    
    navigate: (path) => ipcRenderer.send('navigate', path),
    
    getTheme: () => localStorage.getItem('theme'),
    setTheme: (theme) => localStorage.setItem('theme', theme),

    invoke: async (channel, data) => {
        console.log('Enviando para canal:', channel, 'dados:', data);
        
        const validChannels = [
            'get-contacts',
            'save-ignored-contacts',
        ];

        if (validChannels.includes(channel)) {
            try {
                const result = await ipcRenderer.invoke(channel, data);
                console.log('Resultado recebido:', result); 
                return result;
            } catch (error) {
                console.error('Erro na invocação:', error);
                throw error;
            }
        }
    }
});