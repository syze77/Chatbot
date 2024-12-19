const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');

const cookiesPath = path.join(__dirname, 'cookies.json');
const maxActiveChats = 3;

let bot;
let activeChatsList = [];
const defaultMessage = `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:

Nome completo:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Certifique-se de preencher todas as informações corretamente para agilizar o atendimento.`;

// Inicia o bot
async function startHydraBot() {
  try {
    bot = await hydraBot.initServer({
      puppeteerOptions: {
        headless: false,
        devtools: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      printQRInTerminal: true,
    });

    console.log('Servidor Hydra iniciado!');

    bot.on('connection', async (conn) => {
      if (conn.connect) {
        console.log('Conexão Hydra estabelecida.');
        startListeningForMessages(conn);
      } else {
        console.error('Erro na conexão Hydra.');
      }
    });

    bot.on('qrcode', (qrcode) => {
      console.log('QR Code gerado pelo Hydra:', qrcode);
    });
  } catch (error) {
    console.error('Erro ao iniciar o Hydra:', error);
  }
}

// Função que escuta as mensagens recebidas
function startListeningForMessages(conn) {
  conn.client.ev.on('newMessage', async (newMsg) => {
    const chatId = newMsg.result.chatId;

    if (!newMsg.result.fromMe) {
      const messageText = newMsg.result.body.toLowerCase();

      if (messageText.startsWith("nome:")) {
        const userInfo = parseUserInfo(messageText);
        if (userInfo) {
          if (activeChatsList.length < maxActiveChats) {
            activeChatsList.push(userInfo);
            await sendMessage(conn, chatId, `Obrigado pelas informações, ${userInfo.name}! Estamos iniciando seu atendimento.`);
            await sendProblemOptions(conn, chatId); // Envia opções de problemas
          } else {
            userInfo.isWaiting = true;  // Define o usuário como aguardando
            activeChatsList.push(userInfo);  // Adiciona à lista de espera
            await sendMessage(conn, chatId, `Você está na lista de espera. Sua posição na fila é: ${activeChatsList.filter(chat => chat.isWaiting).length}. Aguarde sua vez.`);
          }
          sendStatusUpdateToMainProcess();
        } else {
          await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
        }
      } else if (messageText === '6') {
        // Resposta quando o usuário escolhe a opção de acessar os vídeos
        await sendMessage(conn, chatId, 'Para mais informações, acesse o canal iEscolar e assista aos vídeos explicativos para resolver as dúvidas mais comuns:\n\n📺 [Clique aqui para assistir aos vídeos do iEscolar](https://www.youtube.com/@iescolaronline5069/videos)');
        sendProblemToFrontEnd('Vídeos iEscolar');  // Envia a informação do problema para o front-end
      } else if (messageText === '1') {
        sendProblemToFrontEnd('Falha no acesso ao sistema');
      } else if (messageText === '2') {
        sendProblemToFrontEnd('Erro ao cadastrar aluno/funcionário');
      } else if (messageText === '3') {
        sendProblemToFrontEnd('Problemas com o diário de classe');
      } else if (messageText === '4') {
        sendProblemToFrontEnd('Falha no registro de notas');
      } else if (messageText === '5') {
        sendProblemToFrontEnd('Outro problema');
      } else {
        await sendMessage(conn, chatId, defaultMessage);
      }
    }
  });

  conn.client.ev.on('chatClosed', async (chatId) => {
    console.log('Chat encerrado:', chatId);
    activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);  // Remove da lista
    sendStatusUpdateToMainProcess();
  });
}

// Função que analisa a mensagem de texto e extrai as informações
function parseUserInfo(messageText) {
  const info = {};
  const lines = messageText.split('\n');
  for (const line of lines) {
    const [key, ...value] = line.split(':');
    if (key && value.length) {
      info[key.trim().toLowerCase()] = value.join(':').trim();
    }
  }
  if (info.nome && info.cidade && info.cargo && info.escola) {
    return {
      name: capitalize(info.nome),
      city: capitalize(info.cidade),
      role: capitalize(info.cargo),
      school: capitalize(info.escola),
    };
  }
  return null;
}

// Função para capitalizar as primeiras letras das palavras
function capitalize(str) {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Função para enviar mensagens ao usuário
async function sendMessage(conn, chatId, message) {
  await conn.client.sendMessage({ to: chatId, body: message, options: { type: 'sendText' } });
}

// Função que envia as opções de problemas para o usuário
async function sendProblemOptions(conn, chatId) {
  const problemOptions = `Por favor, selecione o tipo de problema que você está enfrentando:

1️⃣ Falha no acesso ao sistema
2️⃣ Erro ao cadastrar aluno/funcionário
3️⃣ Problemas com o diário de classe
4️⃣ Falha no registro de notas
5️⃣ Outros (Caso seu problema não esteja na lista, digite abaixo)
6️⃣ Veja as dúvidas mais comuns no canal iEscolar (vídeos explicativos)`;

  await sendMessage(conn, chatId, problemOptions);
}

// Função para enviar a atualização de status ao processo principal (front-end)
function sendStatusUpdateToMainProcess() {
  const activeChats = activeChatsList.filter(chat => !chat.isWaiting);  // Filtra chats ativos
  const waitingList = activeChatsList.filter(chat => chat.isWaiting);  // Filtra chats na lista de espera

  ipcMain.emit('updateStatus', null, {
    activeChats,
    waitingList,
  });
}

// Função para enviar o problema selecionado para o front-end
function sendProblemToFrontEnd(problem) {
  ipcMain.emit('userProblem', null, problem);
}

module.exports = { startHydraBot };
