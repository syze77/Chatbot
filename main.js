const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// Função para criar a janela principal
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false, // Não habilitar Node.js no renderizador (por segurança)
            contextIsolation: true, // Ativar o isolamento de contexto
            preload: path.join(__dirname, 'preload.js'), // Arquivo de preload
        },
    });

    // Carrega o arquivo HTML
    mainWindow.loadFile('index.html');

    // Quando a janela é fechada
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Inicializa o app
app.whenReady().then(() => {
    createWindow();

    // Recria a janela quando o aplicativo é ativado (ex: ícone no macOS)
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Escuta as mensagens do `bot.js` para atualizações de status
ipcMain.on('updateStatus', (event, data) => {
    console.log('Atualização de status recebida:', data);

    // Envia as atualizações para o front-end
    if (mainWindow) {
        mainWindow.webContents.send('statusUpdate', data);
    }
});

// Fecha o aplicativo quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
