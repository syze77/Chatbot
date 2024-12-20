const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startHydraBot } = require('./bot');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

ipcMain.on('updateStatus', (event, statusData) => {
  try {
    if (win) {
      win.webContents.send('statusUpdate', statusData); 
    }
  } catch (err) {
    console.error("Erro ao enviar status para a janela:", err);
  }
});

app.whenReady().then(() => {
  createWindow();
  startHydraBot();

  win.webContents.once('did-finish-load', () => {
    if (win) {
      win.webContents.send('statusUpdate', { activeChats: [], waitingList: [] });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
