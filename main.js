const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// const open = require('open'); // Remove this line
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

ipcMain.on('statusUpdate', (event, statusData) => {  // Corrected event name
  try {
    if (win) {
      win.webContents.send('statusUpdate', statusData); 
    }
  } catch (err) {
    console.error("Erro ao enviar status para a janela:", err);
  }
});

ipcMain.on('userProblem', (event, problemDescription, chatId) => {
  try {
    if (win) {
      win.webContents.send('userProblem', problemDescription, chatId);
    }
  } catch (err) {
    console.error("Erro ao enviar problema para a janela:", err);
  }
});

ipcMain.on('openWhatsAppChat', async (event, chatId) => {
  const whatsappNumber = chatId.split('@')[0];
  const whatsappUrl = `https://wa.me/${whatsappNumber}`;
  console.log(`Main: Opening WhatsApp chat with URL: ${whatsappUrl}`);
  const open = await import('open'); // Use dynamic import
  open.default(whatsappUrl, { app: { name: 'chrome' } }); // Open the URL in Chrome
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