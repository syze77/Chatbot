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

        // Navega até o WhatsApp Web
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
            console.log('Mensagem recebida:', messageText);

            const responses = {
                'olá': 'Olá! Como posso ajudar você?',
                'oi': 'Olá! Como posso ajudar você?',
                'horário': 'Nosso horário de atendimento é das 9h às 18h.',
            };

            const reply = Object.keys(responses).find((key) => messageText.includes(key));
            const responseText = reply ? responses[reply] : 'Desculpe, não entendi sua mensagem.';

            try {
                await conn.client.sendMessage({
                    to: newMsg.result.chatId,
                    body: responseText,
                    options: { type: 'sendText' },
                });
                console.log('Mensagem enviada:', responseText);
            } catch (err) {
                console.error('Erro ao enviar a mensagem:', err);
            }
        }
    });
}   

// Inicializa o navegador
(async () => {
    await startBrowser();
})();
