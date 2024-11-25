const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    
    onQRCodeReceived: (callback) => ipcRenderer.on('qr-code', callback),
    registerWindow: () => ipcRenderer.send('register-window'),
});
