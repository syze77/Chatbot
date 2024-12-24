const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startHydraBot } = require('./bot');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

let win;
let db;
const server = express();

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

function initializeDatabase() {
  db = new sqlite3.Database(path.join(__dirname, 'bot_data.db'), (err) => {
    if (err) {
      console.error('Erro ao abrir o banco de dados:', err);
    } else {
      console.log('Conectado ao banco de dados SQLite.');
      db.run(`CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        name TEXT,
        position TEXT,
        city TEXT,
        school TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending'
      )`);
    }
  });
}

server.get('/getProblemsData', (req, res) => {
  db.all('SELECT * FROM problems', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar dados dos problemas:', err);
      res.status(500).send('Erro ao buscar dados dos problemas');
    } else {
      res.json(rows);
    }
  });
});

ipcMain.on('statusUpdate', (event, statusData) => {
  try {
    if (win) {
      win.webContents.send('statusUpdate', statusData);
    }
  } catch (err) {
    console.error("Erro ao enviar status para a janela:", err);
  }
});

ipcMain.on('userProblem', (event, problemDescription, chatId, userName) => {
  try {
    if (win) {
      win.webContents.send('userProblem', problemDescription, chatId, userName);
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

ipcMain.on('getCompletedAttendances', (event) => {
  db.all('SELECT * FROM problems WHERE status = "completed"', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar atendimentos concluídos:', err);
      event.sender.send('getCompletedAttendances', []);
    } else {
      event.sender.send('getCompletedAttendances', rows);
    }
  });
});

ipcMain.on('deleteCompletedAttendance', (event, chatId) => {
  db.run('DELETE FROM problems WHERE id = ?', chatId, (err) => {
    if (err) {
      console.error('Erro ao deletar atendimento concluído:', err);
    }
  });
});

app.whenReady().then(() => {
  createWindow();
  initializeDatabase();
  startHydraBot();

  win.webContents.once('did-finish-load', () => {
    if (win) {
      win.webContents.send('statusUpdate', { activeChats: [], waitingList: [], problems: [] });
    }
  });

  server.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});