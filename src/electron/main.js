const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { startHydraBot, redirectToWhatsAppChat, server, getRecentContacts, getBotConnection } = require('../core/bot.js');
const { initializeDatabase, getDatabase } = require('../utils/database.js');

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
            preload: path.join(__dirname, 'preload.js'),
            // Adicionar configurações de segurança
            webSecurity: true,
            sandbox: true
        }
    });

    // Configurar regras de segurança de conteúdo
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https:",
                    "img-src 'self' data: https: blob:",
                    "style-src 'self' 'unsafe-inline' https:",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
                    "connect-src 'self' http://localhost:3000 ws://localhost:3000"
                ].join('; ')
            }
        });
    });

    win.loadFile(path.join(__dirname, '../../components/initial/index.html'));

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
function setupIpcHandlers() {
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

    ipcMain.handle('save-ignored-contacts', async (event, newContacts) => {
        try {
            console.log('Contatos recebidos para atualização:', newContacts);
            
            if (!Array.isArray(newContacts)) {
                throw new Error('Contatos devem ser um array');
            }

            const db = getDatabase();
            
            // Iniciar transação
            await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', err => err ? reject(err) : resolve());
            });

            try {
                // Primeiro, obter todos os contatos atualmente ignorados
                const existingContacts = await new Promise((resolve, reject) => {
                    db.all('SELECT id FROM ignored_contacts', [], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows.map(row => row.id));
                    });
                });

                // Identificar contatos que foram desmarcados
                const newContactIds = new Set(newContacts.map(c => c.id));
                const contactsToRemove = existingContacts.filter(id => !newContactIds.has(id));

                // Remover contatos desmarcados
                if (contactsToRemove.length > 0) {
                    const placeholders = contactsToRemove.map(() => '?').join(',');
                    await new Promise((resolve, reject) => {
                        db.run(
                            `DELETE FROM ignored_contacts WHERE id IN (${placeholders})`,
                            contactsToRemove,
                            err => err ? reject(err) : resolve()
                        );
                    });
                }

                // Adicionar ou atualizar novos contatos selecionados
                const stmt = db.prepare('INSERT OR REPLACE INTO ignored_contacts (id, name, number) VALUES (?, ?, ?)');

                for (const contact of newContacts) {
                    await new Promise((resolve, reject) => {
                        stmt.run([contact.id, contact.name, contact.number], err => {
                            if (err) {
                                console.error('Erro ao inserir contato:', err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                }

                await new Promise((resolve, reject) => {
                    stmt.finalize(err => err ? reject(err) : resolve());
                });

                await new Promise((resolve, reject) => {
                    db.run('COMMIT', err => err ? reject(err) : resolve());
                });

                const totalIgnored = await new Promise((resolve, reject) => {
                    db.get('SELECT COUNT(*) as count FROM ignored_contacts', [], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    });
                });

                console.log(`Total de contatos ignorados após atualização: ${totalIgnored}`);
                
                return {
                    success: true,
                    added: newContacts.length,
                    removed: contactsToRemove.length,
                    total: totalIgnored,
                    message: `Lista de contatos ignorados atualizada com sucesso`
                };

            } catch (error) {
                await new Promise(resolve => db.run('ROLLBACK', resolve));
                throw error;
            }

        } catch (error) {
            console.error('Erro ao atualizar contatos ignorados:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    ipcMain.handle('get-contacts', async () => {
        try {
            console.log('Iniciando obtenção de contatos...');
            
            const botConn = getBotConnection();
            if (!botConn) {
                console.error('Conexão do bot não disponível');
                return { contacts: [], ignoredContacts: [] };
            }

            console.log('Obtendo contatos recentes...');
            const contacts = await getRecentContacts(botConn);
            console.log('Contatos obtidos:', contacts.length);

            console.log('Obtendo contatos ignorados...');
            const ignoredContacts = await executeQuery(
                'SELECT id FROM ignored_contacts',
                []
            );
            console.log('Contatos ignorados:', ignoredContacts.length);

            return {
                contacts,
                ignoredContacts: ignoredContacts.map(row => row.id)
            };
        } catch (error) {
            console.error('Erro ao obter contatos:', error);
            return { contacts: [], ignoredContacts: [] };
        }
    });
}

// Inicialização do aplicativo
app.whenReady().then(async () => {
    try {
        await initializeDatabase();
        createWindow();
        startHydraBot(io);
        setupIpcHandlers();

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