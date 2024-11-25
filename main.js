const venom = require('venom-bot');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
        },
    });

    mainWindow.loadFile('index.html');

    venom.create({
        session: 'whatsapp-session',
        multidevice: true,
        headless: true,
        useChrome: true,
    }).then((client) => start(client))
    .catch((error) => {
        console.error('Erro ao iniciar o bot:', error);
    });

    function start(client) {
        console.log('Bot iniciado com sucesso!');

        // Evento para capturar o QR Code
        client.on('qr', (qr) => {
            console.log('QR Code recebido. Escaneie para autenticar.');
            console.log(qr); // Exibe o QR Code no terminal

            // Envia o QR Code para o frontend (no Electron)
            if (mainWindow) {
                mainWindow.webContents.send('qr-code', qr);
            }
        });

        // Escuta mudanças de estado da conexão
        client.onStateChange((state) => {
            console.log('Estado da conexão:', state);
        });
    }
});
