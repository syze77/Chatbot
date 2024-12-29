const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { startHydraBot, redirectToWhatsAppChat, server } = require('./bot');
const http = require('http');
const socketIo = require('socket.io');
const { initializeDatabase, getDatabase } = require('./database'); // Updated line

// Create HTTP server with Express
const httpServer = http.createServer(server);
const io = socketIo(httpServer);

let win;

// Create the main application window
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('index.html');

    // Habilitar DevTools em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools();
    }

    // Remover o intervalo de atualização automática
    // setupAutoUpdate(); // Esta linha deve ser removida
}

// Handle navigation
ipcMain.on('navigate', (event, path) => {
    if (win) {
        win.loadFile(path);
    }
});

// Atualizar a função sendInitialData
function sendInitialData() {
    const queries = {
        active: 'SELECT * FROM problems WHERE status = "active" ORDER BY date DESC LIMIT 3',
        waiting: 'SELECT * FROM problems WHERE status = "waiting" ORDER BY date ASC',
        pending: 'SELECT * FROM problems WHERE status = "pending" ORDER BY date DESC'
    };

    Promise.all([
        new Promise((resolve, reject) => {
            getDatabase().all(queries.active, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
            getDatabase().all(queries.waiting, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
            getDatabase().all(queries.pending, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        })
    ])
    .then(([active, waiting, pending]) => {
        const data = {
            activeChats: active,
            waitingList: waiting,
            problems: pending
        };
        io.emit('statusUpdate', data);
    })
    .catch(err => {
        console.error('Erro ao buscar dados iniciais:', err);
    });
}

// Atualizar o intervalo de atualização automática
function setupAutoUpdate() {
    setInterval(() => {
        const queries = {
            active: 'SELECT * FROM problems WHERE status = "active" ORDER BY date ASC LIMIT 3',
            waiting: 'SELECT * FROM problems WHERE status = "waiting" ORDER BY date ASC',
            pending: 'SELECT * FROM problems WHERE status = "pending" ORDER BY date DESC'
        };

        Promise.all([
            new Promise((resolve, reject) => {
                getDatabase().all(queries.active, [], (err, rows) => err ? reject(err) : resolve(rows || []));
            }),
            new Promise((resolve, reject) => {
                getDatabase().all(queries.waiting, [], (err, rows) => err ? reject(err) : resolve(rows || []));
            }),
            new Promise((resolve, reject) => {
                getDatabase().all(queries.pending, [], (err, rows) => err ? reject(err) : resolve(rows || []));
            })
        ]).then(([active, waiting, pending]) => {
            const data = { activeChats: active, waitingList: waiting, problems: pending };
            io.emit('statusUpdate', data);
        }).catch(err => {
            console.error('Erro na atualização automática:', err);
        });
    }, 5000); // Atualiza a cada 5 segundos
}

// Atualizar a função getProblemsData com queries corrigidas
server.get('/getProblemsData', (req, res) => {
  const queries = {
    active: `SELECT 
              id, name, city, position, school, chatId, description, date 
            FROM problems 
            WHERE status = 'active' 
            ORDER BY date DESC 
            LIMIT 3`,
    waiting: `SELECT 
              id, name, city, position, school, chatId, description, date 
            FROM problems 
            WHERE status = 'waiting' 
            ORDER BY date ASC`,
    pending: `SELECT 
              id, name, city, position, school, chatId, description, date 
            FROM problems 
            WHERE status = 'pending' 
            ORDER BY date DESC`
  };

  Promise.all([
    new Promise((resolve, reject) => {
      getDatabase().all(queries.active, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    }),
    new Promise((resolve, reject) => {
      getDatabase().all(queries.waiting, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    }),
    new Promise((resolve, reject) => {
      getDatabase().all(queries.pending, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    })
  ])
  .then(([active, waiting, pending]) => {
    const data = {
      activeChats: active.map(row => ({
        id: row.id,
        name: row.name,
        city: row.city,
        position: row.position,
        school: row.school,
        chatId: row.chatId,
        description: row.description,
        date: row.date
      })),
      waitingList: waiting.map(row => ({
        id: row.id,
        name: row.name,
        city: row.city,
        position: row.position,
        school: row.school,
        chatId: row.chatId,
        description: row.description,
        date: row.date
      })),
      problems: pending.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        chatId: row.chatId
      }))
    };
    
    console.log('Dados formatados:', data); // Debug log
    res.json(data);
    io.emit('new-data', data);
  })
  .catch(err => {
    console.error('Erro ao buscar dados:', err);
    res.status(500).send('Erro ao buscar dados');
  });
});

server.get('/getCompletedAttendances', (req, res) => {
  getDatabase().all('SELECT * FROM problems WHERE status = "completed"', (err, rows) => {
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
  getDatabase().run('DELETE FROM problems WHERE id = ?', id, (err) => {
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
  getDatabase().get('SELECT * FROM problems WHERE chatId = ?', [chatId], (err, row) => {
    if (err) {
      console.error('Erro ao buscar informações do usuário:', err);
      res.status(500).send('Erro ao buscar informações do usuário');
    } else {
      res.json(row);
    }
  });
});

// Adicionar handler para abertura de links do WhatsApp
ipcMain.handle('openWhatsAppChat', async (event, chatId) => {
    try {
        await redirectToWhatsAppChat(chatId);
    } catch (error) {
        console.error('Erro ao abrir chat do WhatsApp:', error);
        throw error;
    }
});

// Atualizar o banco de dados e notificar os clientes
async function updateDatabaseAndNotify(query, params, io, eventType = 'statusUpdate') {
    return new Promise((resolve, reject) => {
        getDatabase().run(query, params, async function(err) {
            if (err) {
                console.error('Erro na atualização:', err);
                reject(err);
                return;
            }

            try {
                // Buscar dados atualizados
                const data = await fetchCurrentStatus();
                // Emitir atualização para todos os clientes
                io.emit(eventType, data);
                resolve(data);
            } catch (error) {
                console.error('Erro ao buscar dados atualizados:', error);
                reject(error);
            }
        });
    });
}

// Função para buscar o status atual
async function fetchCurrentStatus() {
    const queries = {
        active: `SELECT * FROM problems WHERE status = 'active' ORDER BY date DESC LIMIT 3`,
        waiting: `SELECT * FROM problems WHERE status = 'waiting' ORDER BY date ASC`,
        pending: `SELECT * FROM problems WHERE status = 'pending' ORDER BY date DESC`
    };

    try {
        const [active, waiting, pending] = await Promise.all([
            queryDatabase(queries.active),
            queryDatabase(queries.waiting),
            queryDatabase(queries.pending)
        ]);

        return {
            activeChats: active,
            waitingList: waiting,
            problems: pending
        };
    } catch (error) {
        console.error('Erro ao buscar status:', error);
        throw error;
    }
}

// Função auxiliar para executar queries
function queryDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        getDatabase().all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Start the application with proper error handling
app.whenReady().then(async () => {
  try {
    createWindow();
    await initializeDatabase(); // Wait for database initialization
    startHydraBot(io); // Pass the io instance to the bot

    win.webContents.once('did-finish-load', () => {
      if (win) {
        win.webContents.send('statusUpdate', { activeChats: [], waitingList: [], problems: [] });
        console.log('Initial status update sent to front-end');
      }
    });

    // Start HTTP server
    httpServer.listen(3000, () => {
      console.log('Server is running on port 3000');
    });
    
  } catch (error) {
    console.error('Error during initialization:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Remove the db export since we're using getDatabase() now
module.exports = {};