const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { startHydraBot, redirectToWhatsAppChat, server } = require('./bot');
const { initializeDatabase, getDatabase } = require('./database');

// Configuração do servidor HTTP e Socket.IO
const httpServer = http.createServer(server);
const io = socketIo(httpServer);

let win;

// Função utilitária para consultas ao banco de dados
async function executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        getDatabase().all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Função central para buscar dados do sistema
async function fetchSystemData() {
    const queries = {
        active: `SELECT * FROM problems WHERE status = 'active' ORDER BY date DESC LIMIT 3`,
        waiting: `SELECT * FROM problems WHERE status = 'waiting' ORDER BY date ASC`,
        pending: `SELECT * FROM problems WHERE status = 'pending' ORDER BY date DESC`
    };

    try {
        const [active, waiting, pending] = await Promise.all([
            executeQuery(queries.active),
            executeQuery(queries.waiting),
            executeQuery(queries.pending)
        ]);

        return {
            activeChats: active,
            waitingList: waiting,
            problems: pending
        };
    } catch (error) {
        console.error('Erro ao buscar dados do sistema:', error);
        throw error;
    }
}

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

    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools();
    }
}

// Configuração das rotas do servidor
server.get('/getProblemsData', async (req, res) => {
    try {
        const data = await fetchSystemData();
        res.json(data);
        io.emit('statusUpdate', data);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        res.status(500).send('Erro ao buscar dados');
    }
});

server.get('/getCompletedAttendances', async (req, res) => {
    try {
        const completed = await executeQuery('SELECT * FROM problems WHERE status = "completed"');
        res.json(completed);
    } catch (error) {
        console.error('Erro ao buscar atendimentos concluídos:', error);
        res.status(500).send('Erro ao buscar atendimentos concluídos');
    }
});

server.delete('/deleteCompletedAttendance/:id', async (req, res) => {
    try {
        await executeQuery('DELETE FROM problems WHERE id = ?', [req.params.id]);
        res.sendStatus(200);
    } catch (error) {
        console.error('Erro ao deletar atendimento:', error);
        res.status(500).send('Erro ao deletar atendimento');
    }
});

// Configuração dos eventos IPC
ipcMain.on('navigate', (event, path) => {
    if (win) win.loadFile(path);
});

ipcMain.handle('openWhatsAppChat', async (event, chatId) => {
    try {
        await redirectToWhatsAppChat(chatId);
    } catch (error) {
        console.error('Erro ao abrir chat do WhatsApp:', error);
        throw error;
    }
});

// Inicialização do aplicativo
app.whenReady().then(async () => {
    try {
        await initializeDatabase();
        createWindow();
        startHydraBot(io);

        httpServer.listen(3000, () => {
            console.log('Servidor rodando na porta 3000');
        });

        // Envio do estado inicial
        if (win) {
            win.webContents.once('did-finish-load', async () => {
                const initialData = await fetchSystemData();
                win.webContents.send('statusUpdate', initialData);
            });
        }
    } catch (error) {
        console.error('Erro durante a inicialização:', error);
        app.quit();
    }
});

// Gerenciamento do ciclo de vida do aplicativo
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

module.exports = {};