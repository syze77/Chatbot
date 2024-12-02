const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const hydraBot = require('hydra-bot');

// Caminho do executável do Chrome
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // Para Windows

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
        // Inicia o navegador com o Puppeteer
        browser = await puppeteer.launch({
            headless: false,
            executablePath,
            slowMo: 100,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        // Abre uma nova página
        page = await browser.newPage();
        
        // Carrega os cookies se existirem
        await loadCookies(page);

        // Navega até o WhatsApp Web
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

        // Se os cookies não existirem ou a sessão expirar, o QR Code será mostrado
        const qrCodeSelector = 'canvas[aria-label="Scan this QR code to link a device!"]';
        try {
            await page.waitForSelector(qrCodeSelector, { timeout: 60000 });
            console.log('QR Code detectado, aguardando escaneamento...');
            // Tira uma captura do QR Code (apenas para debug ou exibição)
            await page.screenshot({ path: 'qr_code.png' });
            // Espera até que o usuário tenha escaneado o QR Code e a página tenha carregado
            await page.waitForSelector('div[title="Nova conversa"]', { timeout: 60000 });
            console.log('Conectado ao WhatsApp Web!');
            // Salva os cookies após a conexão bem-sucedida
            await saveCookies(page);
        } catch (err) {
            console.log('QR Code já escaneado ou erro na conexão.', err);
        }
    } catch (err) {
        console.error('Erro ao iniciar o navegador:', err);
        if (browser) {
            await browser.close();
        }
    }
}

async function setupHydra() {
    try {
        const ev = await hydraBot.initServer({
            puppeteerOptions: {
                headless: false,
                devtools: true,
            },
            timeAutoClose: 0, // 0 = desabilitado
            printQRInTerminal: true, // Imprimir QR Code no terminal
        });

        console.log('Servidor WebSocket do Hydra iniciado!');

        ev.on('connection', (conn) => {
            console.log('Conexão Hydra estabelecida.');

            if (!conn || !conn.connect) {
                console.log('Erro: Conexão Hydra falhou.');
                return;
            }

            console.log('Conectado ao WhatsApp!');

            // Aguarda a conexão ser estabelecida antes de seguir
            (async () => {
                let connected = false;
                while (!connected) {
                    if (conn && conn.client && conn.client.pupPage) {
                        console.log('Conexão com o cliente Hydra estabelecida!');
                        connected = true; // A conexão foi estabelecida
                        await startListeningForMessages(conn); // Inicia a escuta de mensagens
                    } else {
                        console.log('Aguardando a conexão ser totalmente estabelecida...');
                        await sleep(1000); // Espera 1 segundo antes de tentar novamente
                    }
                }
            })();
        });

        ev.on('qrcode', (qrcode) => {
            console.log('QR Code gerado pelo Hydra:', qrcode);
        });

        return ev;
    } catch (error) {
        console.error('Erro ao configurar o Hydra:', error);
        await restartBrowser();
    }
}

// Função para escutar novas mensagens
async function startListeningForMessages(conn) {
    conn.ev.on('newMessage', async (newMsg) => {
        console.log('Nova mensagem recebida...');
        if (!newMsg.result.fromMe) {
            const messageText = newMsg.result.body.toLowerCase();
            console.log('Mensagem recebida:', messageText);

            const responses = {
                'olá': 'Olá! Como posso ajudar você?',
                'oi': 'Olá! Como posso ajudar você?',
                'horário': 'Nosso horário de atendimento é das 9h às 18h.',
            };

            // Resposta conforme a mensagem recebida
            const reply = Object.keys(responses).find((key) => messageText.includes(key));

            if (reply) {
                await conn.client.sendMessage(newMsg.result.chatId, responses[reply]);
            } else {
                await conn.client.sendMessage(newMsg.result.chatId, 'Desculpe, não entendi sua mensagem.');
            }
        }
    });
}

// Função para reiniciar o navegador
async function restartBrowser() {
    console.log('Reiniciando o navegador...');
    // Fecha o navegador e reinicia
    if (browser) {
        await browser.close();
    }
    await startBrowser();
    await setupHydra(); // Reinicia o Hydra após reiniciar o navegador
}

// Função principal que inicia tudo
(async () => {
    await startBrowser();
    if (page && browser) {
        await setupHydra();
    } else {
        console.log('Falha ao iniciar o navegador, tentando reiniciar...');
        await restartBrowser();
    }
})();
