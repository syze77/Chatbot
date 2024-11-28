const venom = require('venom-bot');
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Comunicação segura com o renderer
            contextIsolation: true, // Segurança no Electron
            nodeIntegration: false, // Desativa Node.js no frontend
        },
    });

    mainWindow.loadFile('index.html'); // Carrega o HTML do frontend

    venom.create({
        session: 'whatsapp-session',
        multidevice: true,
        headless: true,
        useChrome: true, // Usa o Chrome no modo headless
    }).then((client) => start(client))
    .catch((error) => {
        console.error('Erro ao iniciar o bot:', error);
    });

    function start(client) {
        console.log('Bot iniciado com sucesso!');

        // Evento para capturar o QR Code
        client.on('qr', (qr) => {
            console.log('QR Code gerado', qr);  // Esse log deve ser visto no console do Electron, não no console do navegador

            // Envia o QR Code para o frontend (renderer)
            if (mainWindow) {
                mainWindow.webContents.send('qr-code', qr); // Envia o QR Code para o frontend
            }
        });

        // Escuta mudanças de estado da conexão
        client.onStateChange((state) => {
            console.log('Estado da conexão:', state);
        });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
