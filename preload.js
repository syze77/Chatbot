const { contextBridge, ipcRenderer } = require('electron');

// Exposição segura das APIs para o frontend
contextBridge.exposeInMainWorld('electronAPI', {
    onQRCode: (callback) => ipcRenderer.on('qr-code', (_, qr) => callback(qr)),  // Garante que o QR Code chegue ao frontend
});
