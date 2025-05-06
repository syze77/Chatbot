const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const express = require('express');
const { startHydraBot, redirectToWhatsAppChat, server, getRecentContacts, getBotConnection } = require('../core/bot.js');
const { getAllContacts, saveIgnoredContacts } = require('../core/contacts/contactmanager.js');

const statisticsRoutes = require('../routes/statistics.js');
const filtersRoutes = require('../routes/filters.js');
const reportsRoutes = require('../routes/reports.js');
const problemCardsRoutes = require('../routes/api/problemCards.js');

const sequelize = require('../models/connections/connection.js');
const User  = require('../models/entities/user.js');
const School = require('../models/entities/school.js');

// Configuração do servidor HTTP e Socket.IO
const httpServer = http.createServer(server);
const io = socketIo(httpServer);

server.set('io', io);

let win;

// Função central para buscar dados do sistema
async function fetchSystemData() {
    try {
        const [active, waiting, pending] = await Promise.all([
            Call.findAll({
                where: { status: 'ACTIVE' },
                order: [['createDate', 'DESC']],
                limit: 3,
                include: [
                    { model: School },
                    { model: Attendant }
                ]
            }),
            Call.findAll({
                where: { status: 'WAITING' },
                order: [['createDate', 'ASC']],
                include: [
                    { model: School },
                    { model: Attendant }
                ]
            }),
            Call.findAll({
                where: { status: 'PENDING' },
                order: [['createDate', 'DESC']],
                include: [
                    { model: School },
                    { model: Attendant }
                ]
            })
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
        frame: true,
        autoHideMenuBar: true,
        backgroundColor: '#343a40',
        titleBarStyle: 'default',
        titleBarOverlay: {
            color: '#343a40',
            symbolColor: '#ffffff',
            height: 30
        },
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            sandbox: true
        }
    });

    win.setTitle('');
    
    // Remove focus listener and simplify theme handling
    nativeTheme.themeSource = 'dark';

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

server.use(express.json());
server.use(express.urlencoded({ extended: true }));

server.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Setup routes
server.use('/', statisticsRoutes);
server.use('/', filtersRoutes);
server.use('/', reportsRoutes);
server.use('/api/problem-cards', problemCardsRoutes); 


// Configuração dos eventos IPC
function setupIpcHandlers() {
    ipcMain.on('navigate', (event, path) => {
        if (win) win.loadFile(path);
    });

    ipcMain.handle('openWhatsAppChat', async (event, chatId) => {
        try {
            console.log('Main: Tentando abrir chat para:', chatId);
            const result = await redirectToWhatsAppChat(chatId);
            return result;
        } catch (error) {
            console.error('Erro ao abrir chat do WhatsApp:', error);
            throw error;
        }
    });

    ipcMain.handle('save-ignored-contacts', async (event, newContacts) => {
        return await saveIgnoredContacts(newContacts);
    });

    ipcMain.handle('get-contacts', async () => {
        return await getAllContacts();
    });

    // Simplify theme handler
    ipcMain.handle('set-system-theme', (event, theme) => {
        try {
            const isDark = theme === 'dark';
            const themeColor = isDark ? '#343a40' : '#ffffff';
            const symbolColor = isDark ? '#ffffff' : '#000000';
            
            nativeTheme.themeSource = theme;
            win.setBackgroundColor(themeColor);
            
            return theme;
        } catch (error) {
            console.error('Erro ao alterar tema:', error);
            throw error;
        }
    });
}

// Inicialização do aplicativo
app.whenReady().then(async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync();
        createWindow();
        setupIpcHandlers();
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