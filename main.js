const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startHydraBot } = require('./bot');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

let win;
let db;
const server = express();
const httpServer = http.createServer(server);
const io = socketIo(httpServer);

// Create the main application window
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

// Initialize the SQLite database
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
       city TEXT,
       position TEXT,
       school TEXT,
       chatId TEXT,
       description TEXT,
       status TEXT DEFAULT 'pending'
      )`);
    }
  });
}

// Set up the Express server to fetch problem data
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

server.get('/getCompletedAttendances', (req, res) => {
  db.all('SELECT * FROM problems WHERE status = "completed"', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar atendimentos concluídos:', err);
      res.status(500).send('Erro ao buscar atendimentos concluídos');
    } else {
      res.json(rows);
    }
  });
});

server.delete('/deleteCompletedAttendance/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM problems WHERE id = ?', id, (err) => {
    if (err) {
      console.error('Erro ao deletar atendimento concluído:', err);
      res.status(500).send('Erro ao deletar atendimento concluído');
    } else {
      res.sendStatus(200);
    }
  });
});

// Set up the Express server to fetch user information
server.get('/getUserInfo/:chatId', (req, res) => {
  const chatId = req.params.chatId;
  db.get('SELECT * FROM problems WHERE chatId = ?', [chatId], (err, row) => {
    if (err) {
      console.error('Erro ao buscar informações do usuário:', err);
      res.status(500).send('Erro ao buscar informações do usuário');
    } else {
      res.json(row);
    }
  });
});

// Start the application
app.whenReady().then(() => {
  createWindow();
  initializeDatabase();
  startHydraBot(io); // Pass the io instance to the bot

  win.webContents.once('did-finish-load', () => {
    if (win) {
      win.webContents.send('statusUpdate', { activeChats: [], waitingList: [], problems: [] });
    }
  });

  httpServer.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});