const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');

const cookiesPath = path.join(__dirname, 'cookies.json');
const maxActiveChats = 3;

let bot;

async function startHydraBot() {
  try {
    bot = await hydraBot.initServer({
      puppeteerOptions: {
        headless: false,
        devtools: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      timeAutoClose: 0,
      printQRInTerminal: true,
    });

    console.log('Servidor Hydra iniciado!');

    bot.on('connection', async (conn) => {
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

async function startListeningForMessages(conn) {
  if (!conn.client || !conn.client.ev) {
    console.error('Erro: cliente ou evento não definidos');
    return;
  }

  conn.client.ev.on('newMessage', async (newMsg) => {
    const chatId = newMsg.result.chatId;

    if (!newMsg.result.fromMe) {
      const messageText = newMsg.result.body.toLowerCase();
      console.log('Mensagem recebida:', messageText);

      if (messageText.startsWith("nome:")) {
        const userInfo = parseUserInfo(messageText);
        if (userInfo) {
          const activeChats = await getActiveChatsCount();

          if (activeChats < maxActiveChats) {
            console.log('Atendendo novo chat...');
            await conn.client.sendMessage({
              to: chatId,
              body: `Obrigado pelas informações, ${userInfo.name}! Estamos iniciando seu atendimento.`,
              options: { type: 'sendText' },
            });
            sendStatusUpdateToMainProcess(activeChats, []); // Envia o status para o front-end
          } else {
            console.log('Usuário na fila de espera');
            await conn.client.sendMessage({
              to: chatId,
              body: 'Você está na lista de espera. Aguarde sua vez.',
              options: { type: 'sendText' },
            });
            sendStatusUpdateToMainProcess(activeChats, [userInfo]); // Envia para o front-end com fila de espera
          }
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
    console.log('Chat encerrado:', chatId);
    const activeChats = await getActiveChatsCount();
    sendStatusUpdateToMainProcess(activeChats, []);
  });
}

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
      name: capitalizeName(info.nome),
      city: info.cidade,
      role: info.cargo,
      school: info.escola,
    };
  }
  return null;
}

function capitalizeName(name) {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function sendStatusUpdateToMainProcess(activeChats, waitingList) {
  const statusUpdate = {
    activeChats,
    waitingList,
  };
  ipcMain.emit('updateStatus', null, statusUpdate); // Envia o status via IPC para o main process
}

async function getActiveChatsCount() {
  // Simulação do número de chats ativos
  return Math.floor(Math.random() * (maxActiveChats + 1));  // Apenas para exemplo
}

module.exports = { startHydraBot };
