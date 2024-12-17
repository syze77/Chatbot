const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startHydraBot, stopHydraBot } = require('./bot'); // Garantir que você tenha uma função stopHydraBot

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js') // Se você tiver um arquivo preload.js
        }
    });

    // Carregar o arquivo HTML local
    win.loadFile('index.html'); // Mudança aqui para carregar o HTML diretamente

    // Quando a janela for fechada, definimos win como null
    win.on('closed', () => {
        win = null;
        // Parar o HydraBot se a janela for fechada
        stopHydraBot();
    });
}

// Ouvindo o evento 'updateStatus' e enviando para o renderer process
ipcMain.on('updateStatus', (event, statusUpdate) => {
    if (win) {
        win.webContents.send('statusUpdate', statusUpdate);
    }
});

// Inicia o bot
startHydraBot();

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
