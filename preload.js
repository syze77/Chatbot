const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Expondo funções para o frontend
    onQRCodeReceived: (callback) => ipcRenderer.on('qr-code', callback),
    registerWindow: () => ipcRenderer.send('register-window'),
});
