const hydraBot = require('hydra-bot');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron'); // Importando ipcMain para enviar dados ao main process

// Caminho para salvar os cookies
const cookiesPath = path.join(__dirname, 'cookies.json');

// Fila de espera e controle de chats ativos
let waitingList = [];
let activeChats = 0;
const maxActiveChats = 3;  // Limite de chats simultâneos

let bot;
let processedChats = new Set(); // Para evitar múltiplos processamentos do mesmo chat

// Função para iniciar o HydraBot
async function startHydraBot() {
    try {
        bot = await hydraBot.initServer({
            puppeteerOptions: {
                headless: false,
                devtools: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
            timeAutoClose: 0,
            printQRInTerminal: true,
        });

        console.log('Servidor Hydra iniciado!');

        bot.on('connection', async (conn) => {
            console.log('Status da conexão:', conn);
            if (conn.connect) {
                console.log('Conexão Hydra estabelecida.');
                await startListeningForMessages(conn);
            } else {
                console.log('Erro na conexão Hydra.');
            }
        });

        bot.on('qrcode', (qrcode) => {
            console.log('QR Code gerado pelo Hydra:', qrcode);
        });

    } catch (error) {
        console.error('Erro ao iniciar o Hydra:', error);
    }
}

// Função para ouvir as mensagens e evitar múltiplas respostas
async function startListeningForMessages(conn) {
    if (!conn.client || !conn.client.ev) {
        console.error('Erro: cliente ou evento não definidos');
        return;
    }

    conn.client.ev.on('newMessage', async (newMsg) => {
        const chatId = newMsg.result.chatId;
        console.log('Nova mensagem recebida...', chatId);

        // Evita processar o mesmo chat várias vezes
        if (processedChats.has(chatId)) {
            console.log(`Mensagem já processada para o chat ${chatId}`);
            return;
        }

        if (!newMsg.result.fromMe) {
            const messageText = newMsg.result.body.toLowerCase();
            console.log('Mensagem recebida:', messageText);

            if (messageText.startsWith("nome:")) {
                const userInfo = parseUserInfo(messageText);
                if (userInfo) {
                    if (activeChats < maxActiveChats) {
                        activeChats++;
                        console.log('Atendendo novo chat...');
                        await conn.client.sendMessage({
                            to: chatId,
                            body: `Obrigado pelas informações, ${userInfo.nome}! Estamos iniciando seu atendimento.`,
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
                    sendUpdateToMainProcess(); // Envia as atualizações de status para o main process
                    processedChats.add(chatId); // Marca o chat como processado
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

    conn.client.ev.on('chatClosed', async (chatId) => {
        activeChats--;
        processedChats.delete(chatId);
        if (waitingList.length > 0) {
            const nextUser = waitingList.shift(); // Remove o primeiro da fila
            activeChats++;
            console.log('Atendendo novo chat da fila...');
            await conn.client.sendMessage({
                to: nextUser.chatId,
                body: `Você foi removido da fila! Iniciando seu atendimento, ${nextUser.nome}.`,
                options: { type: 'sendText' },
            });
        }
        sendUpdateToMainProcess(); // Envia as atualizações de status para o main process
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
            nome: capitalizeName(info.nome),
            cidade: info.cidade,
            cargo: info.cargo,
            escola: info.escola,
        };
    }
    return null;
}

// Função para capitalizar a primeira letra de cada palavra
function capitalizeName(name) {
    return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Função para enviar a atualização ao main process
function sendUpdateToMainProcess() {
    const statusUpdate = {
        activeChats,
        waitingList: waitingList.map((user, index) => ({
            id: index + 1,
            ...user,
        })),
    };

    // Envia para o main process
    ipcMain.emit('updateStatus', statusUpdate);
}

module.exports = { startHydraBot, sendUpdateToMainProcess };
