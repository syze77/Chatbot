const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');

const cookiesPath = path.join(__dirname, 'cookies.json');
const maxActiveChats = 3;

let bot;
let activeChatsList = [];
let userCurrentTopic = {};  // Armazenar o tópico atual de cada usuário

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
            userCurrentTopic[chatId] = 'problema'; // Define o usuário na fase de problemas
          } else {
            userInfo.isWaiting = true;  // Define o usuário como aguardando
            activeChatsList.push(userInfo);  // Adiciona à lista de espera
            await sendMessage(conn, chatId, `Você está na lista de espera. Sua posição na fila é: ${activeChatsList.filter(chat => chat.isWaiting).length}. Aguarde sua vez.`);
          }
          sendStatusUpdateToMainProcess();
        } else {
          await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
        }
      } else if (userCurrentTopic[chatId] === 'problema') {
        // Usuário na fase de problemas
        await handleProblemSelection(conn, chatId, messageText);
      } else if (userCurrentTopic[chatId] === 'subproblema') {
        // Usuário na fase de subtópicos
        await handleSubProblemSelection(conn, chatId, messageText);
      } else if (userCurrentTopic[chatId] === 'descricaoProblema') {
        // Usuário na fase de descrição do problema
        await handleProblemDescription(conn, chatId, messageText);
      } else {
        await sendMessage(conn, chatId, defaultMessage);
      }
    }
  });

  conn.client.ev.on('chatClosed', async (chatId) => {
    console.log('Chat encerrado:', chatId);
    activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);
    delete userCurrentTopic[chatId]; 
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
      position: capitalize(info.cargo),
      school: capitalize(info.escola),
    };
  }
  return null;
}

// Função para capitalizar as primeiras letras das palavras
function capitalize(str) {
    return str
        .split(' ') // Divide a string em palavras
        .map(word => {
            if (word.length > 0) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); // Capitaliza a palavra
            }
            return word; // Evita erros com strings vazias
        })
        .join(' '); // Junta as palavras novamente
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
5️⃣ Outro problema`;

  await sendMessage(conn, chatId, problemOptions);
}

// Função para lidar com a seleção de problemas
async function handleProblemSelection(conn, chatId, messageText) {
  switch (messageText) {
    case '1':
      await sendSubProblemOptions(conn, chatId, 'Falha no acesso ao sistema');
      break;
    case '2':
      await sendSubProblemOptions(conn, chatId, 'Erro ao cadastrar aluno/funcionário');
      break;
    case '3':
      await sendSubProblemOptions(conn, chatId, 'Problemas com o diário de classe');
      break;
    case '4':
      await sendSubProblemOptions(conn, chatId, 'Falha no registro de notas');
      break;
    case '5':
      await sendMessage(conn, chatId, 'Por favor, descreva o problema que você está enfrentando:');
      userCurrentTopic[chatId] = 'descricaoProblema'; // Define para a fase de descrição
      break;
    case 'voltar':
      await sendProblemOptions(conn, chatId); 
      break;
    default:
      await sendMessage(conn, chatId, 'Opção inválida. Por favor, selecione uma opção válida.');
  }
}

// Função para enviar os subtópicos de um problema
async function sendSubProblemOptions(conn, chatId, problem) {
  let subProblemOptions = '';

  switch (problem) {
    case 'Falha no acesso ao sistema':
      subProblemOptions = `Selecione o subtópico:

1️⃣ Não consigo acessar minha conta
2️⃣ Sistema não carrega
3️⃣ Outro problema relacionado ao acesso

Digite 'voltar' para retornar ao menu anterior.`;
      break;
    case 'Erro ao cadastrar aluno/funcionário':
      subProblemOptions = `Selecione o subtópico:

1️⃣ Erro ao inserir dados do aluno
2️⃣ Erro ao inserir dados do funcionário
3️⃣ Outro problema relacionado ao cadastro

Digite 'voltar' para retornar ao menu anterior.`;
      break;
    case 'Problemas com o diário de classe':
      subProblemOptions = `Selecione o subtópico:

1️⃣ Falha na inserção de notas
2️⃣ Falha na visualização de registros
3️⃣ Outro problema com o diário de classe

Digite 'voltar' para retornar ao menu anterior.`;
      break;
    case 'Falha no registro de notas':
      subProblemOptions = `Selecione o subtópico:

1️⃣ Não consigo registrar as notas
2️⃣ Notas não estão sendo salvas
3️⃣ Outro problema com o registro de notas

Digite 'voltar' para retornar ao menu anterior.`;
      break;
  }

  userCurrentTopic[chatId] = 'subproblema'; 
  await sendMessage(conn, chatId, subProblemOptions);
}

// Função para lidar com a seleção de subtópicos
async function handleSubProblemSelection(conn, chatId, messageText) {
  if (messageText === 'voltar') {
    // Volta para a seleção de problemas
    userCurrentTopic[chatId] = 'problema';
    await sendProblemOptions(conn, chatId);
  } else {
    // Lida com o problema selecionado (pode enviar para o front-end ou tomar outras ações)
    sendProblemToFrontEnd(messageText);
  }
}

// Função para lidar com a descrição do problema
async function handleProblemDescription(conn, chatId, messageText) {
  sendProblemToFrontEnd(messageText);  // Envia a descrição do problema
  await sendMessage(conn, chatId, 'Sua descrição foi recebida. Um atendente entrará em contato em breve.');
  userCurrentTopic[chatId] = 'problema';  // Retorna à fase de problemas
}

// Função para enviar a atualização de status ao processo principal (front-end)
function sendStatusUpdateToMainProcess() {
  const activeChats = activeChatsList.filter(chat => !chat.isWaiting); 
  const waitingList = activeChatsList.filter(chat => chat.isWaiting);  
  
  ipcMain.emit('updateStatus', null, {
    activeChats,
    waitingList,
  });
}

// Função para enviar o problema selecionado para o front-end
function sendProblemToFrontEnd(problemDescription) {
  ipcMain.emit('userProblem', null, problemDescription);
}

module.exports = { startHydraBot };
