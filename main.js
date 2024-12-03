const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Função para criar a janela principal
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true, // Para permitir o uso de Node.js no renderizador
            contextIsolation: false, // Para permitir comunicação com o IPC
        }
    });

    mainWindow.loadFile('index.html');

    // Quando a janela é fechada
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Função para iniciar o app
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Envia os dados atualizados da fila de espera e chats ativos para o renderizador
ipcMain.on('updateStatus', (event, data) => {
    console.log('Atualização recebida:', data);

    if (mainWindow) {
        // Envia os dados do status para o renderizador
        mainWindow.webContents.send('statusUpdate', data);
    }
});

// Fecha o app quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
