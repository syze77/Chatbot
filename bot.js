const { ipcRenderer } = require('electron'); // Garantir que o ipcRenderer está disponível no contexto
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const hydraBot = require('hydra-bot');

// Caminho do executável do Chrome
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let browser;
let page;

// Caminho para salvar os cookies
const cookiesPath = path.join(__dirname, 'cookies.json');

// Fila de espera e controle de chats ativos
let waitingList = [];
let activeChats = 0;
const maxActiveChats = 4;

// Função para salvar os cookies
async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log('Cookies salvos com sucesso.');
}

// Função para carregar os cookies
async function loadCookies(page) {
    if (fs.existsSync(cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath));
        for (let cookie of cookies) {
            await page.setCookie(cookie);
        }
        console.log('Cookies carregados com sucesso.');
    }
}

// Função de atraso (sleep)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startBrowser() {
    try {
        browser = await puppeteer.launch({
            headless: false,
            executablePath,
            slowMo: 100,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        page = await browser.newPage();

        // Carrega os cookies se existirem
        await loadCookies(page);

        // Navega até o WhatsApp Business Web
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

        const qrCodeSelector = 'canvas[aria-label="Scan this QR code to link a device!"]';
        try {
            await page.waitForSelector(qrCodeSelector, { timeout: 60000 });
            console.log('QR Code detectado, aguardando escaneamento...');

            await page.screenshot({ path: 'qr_code.png' });

            await page.waitForSelector('div[title="Nova conversa"]', { timeout: 60000 });
            console.log('Conectado ao WhatsApp Web!');
            await saveCookies(page);
            await setupHydra(page);
        } catch (err) {
            console.log('QR Code já escaneado ou erro na conexão.', err);
            await setupHydra(page);
        }
    } catch (err) {
        console.error('Erro ao iniciar o navegador:', err);
        if (browser) await browser.close();
    }
}

async function setupHydra(page) {
    try {
        const ev = await hydraBot.initServer({
            puppeteerOptions: {
                headless: false,
                devtools: true,
                browserPage: page,
            },
            timeAutoClose: 0,
            printQRInTerminal: true,
        });

        console.log('Servidor Hydra iniciado!');

        ev.on('connection', async (conn) => {
            console.log('Status da conexão:', conn);
            if (conn.connect) {
                console.log('Conexão Hydra estabelecida.');
                await startListeningForMessages(conn);
            } else {
                console.log('Erro na conexão Hydra.');
            }
        });

        ev.on('qrcode', (qrcode) => {
            console.log('QR Code gerado pelo Hydra:', qrcode);
        });

        return ev;
    } catch (error) {
        console.error('Erro ao configurar o Hydra:', error);
        if (browser) await browser.close();
        await startBrowser(); // Reinicia o navegador em caso de falha
    }
}

async function startListeningForMessages(conn) {
    if (!conn.client || !conn.client.ev) {
        console.error('Erro: cliente ou evento não definidos');
        return;
    }

    conn.client.ev.on('newMessage', async (newMsg) => {
        console.log('Nova mensagem recebida...');
        if (!newMsg.result.fromMe) {
            const messageText = newMsg.result.body.toLowerCase();
            const chatId = newMsg.result.chatId;

            console.log('Mensagem recebida:', messageText);

            if (messageText.startsWith("nome:")) {
                // Coleta as informações do usuário
                const userInfo = parseUserInfo(messageText);
                if (userInfo) {
                    if (activeChats < maxActiveChats) {
                        activeChats++;
                        console.log('Atendendo novo chat...');
                        await conn.client.sendMessage({
                            to: chatId,
                            body: 'Obrigado pelas informações! Estamos iniciando seu atendimento.',
                            options: { type: 'sendText' },
                        });
                    } else {
                        waitingList.push({ chatId, ...userInfo });
                        console.log('Usuário na fila de espera');
                        await conn.client.sendMessage({
                            to: chatId,
                            body: 'Você está na lista de espera. Aguarde sua vez.',
                            options: { type: 'sendText' },
                        });
                    }
                    sendUpdateToRenderer();
                } else {
                    await conn.client.sendMessage({
                        to: chatId,
                        body: 'Por favor, insira suas informações no formato correto: Nome: [seu nome], Cidade: [sua cidade], Cargo: [seu cargo], Escola: [sua escola]',
                        options: { type: 'sendText' },
                    });
                }
            } else {
                await conn.client.sendMessage({
                    to: chatId,
                    body: `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:
                    
Nome completo:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Certifique-se de preencher todas as informações corretamente para agilizar o atendimento.`,
                    options: { type: 'sendText' },
                });
            }
        }
    });

    // Detectar quando um chat é finalizado
    conn.client.ev.on('chatClosed', async (chatId) => {
        activeChats--;  // Reduz o número de chats ativos quando um chat é fechado
        sendUpdateToRenderer();
    });
}

// Função para analisar as informações do usuário
function parseUserInfo(messageText) {
    const info = {};
    const lines = messageText.split('\n');
    for (const line of lines) {
        const [key, ...value] = line.split(':');
        if (key && value) {
            info[key.trim().toLowerCase()] = value.join(':').trim();
        }
    }
    if (info.nome && info.cidade && info.cargo && info.escola) {
        return {
            nome: info.nome,
            cidade: info.cidade,
            cargo: info.cargo,
            escola: info.escola,
        };
    }
    return null;
}

function sendUpdateToRenderer() {
    const statusUpdate = {
        activeChats,
        waitingList: waitingList.map((user, index) => ({
            id: index + 1,
            ...user,
        })),
    };

    if (typeof ipcRenderer !== 'undefined') {
        ipcRenderer.send('updateStatus', statusUpdate);
    } else {
        console.error('ipcRenderer não está disponível no contexto atual');
    }
}

