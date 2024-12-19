const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startHydraBot } = require('./bot');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),  // Certifique-se de incluir o preload.js
      contextIsolation: true,  // Melhora a segurança isolando o contexto entre o renderer e o Node.js
      enableRemoteModule: false,  // Desabilita o remote module, por questões de segurança
    },
  });

  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });
}

// Recebe as atualizações do status de atendimento e envia para o renderer
ipcMain.on('updateStatus', (event, statusData) => {
  if (win) {
    win.webContents.send('statusUpdate', statusData);  // Envia os dados via IPC para o renderer
  }
});

app.whenReady().then(() => {
  createWindow();
  startHydraBot();  // Inicia o bot
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
