const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();

const cookiesPath = path.join(__dirname, 'cookies.json');
const maxActiveChats = 3;
const maxTotalChats = 5;

let bot;
let activeChatsList = [];
let userCurrentTopic = {};  // Armazenar o tópico atual de cada usuário
let botConnection = null; // Add this at the top with other variables
let reportedProblems = []; // Add this to store reported problems
let db;

const defaultMessage = `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:

Nome:
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
        botConnection = conn; // Store connection
        startListeningForMessages(conn);
      } else {
        console.error('Erro na conexão Hydra.');
      }
    });

    // Add IPC listener for chat redirection
    ipcMain.on('redirectToChat', async (event, chatId) => {
      console.log('Bot: Received redirect request for chat:', chatId);
      if (botConnection) {
        await redirectToWhatsAppChat(botConnection, chatId);
      }
    });

    // Add IPC listener to mark problem as completed
    ipcMain.on('markProblemCompleted', (event, chatId) => {
      reportedProblems = reportedProblems.filter(problem => problem.chatId !== chatId);
      markProblemAsCompleted(chatId);
      sendStatusUpdateToMainProcess();
    });

    bot.on('qrcode', (qrcode) => {
      console.log('QR Code gerado pelo Hydra:', qrcode);
    });

    initializeDatabase();
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
            activeChatsList.push({ ...userInfo, chatId });
            await sendMessage(conn, chatId, `Obrigado pelas informações, ${userInfo.name}! Estamos iniciando seu atendimento.`);
            await sendProblemOptions(conn, chatId); // Envia opções de problemas
            userCurrentTopic[chatId] = 'problema'; // Define o usuário na fase de problemas
          } else {
            userInfo.isWaiting = true;  // Define o usuário como aguardando
            activeChatsList.push({ ...userInfo, chatId });  // Adiciona à lista de espera
            await sendMessage(conn, chatId, `Você está na lista de espera. Sua posição na fila é: ${activeChatsList.filter(chat => chat.isWaiting).length}. Aguarde sua vez.`);
          }
          sendStatusUpdateToMainProcess();
        } else {
          await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
        }
      } else if (userCurrentTopic[chatId] === 'problema') {
        // Usuário na fase de problemas
        await handleProblemSelection(conn, chatId, messageText);
      } else if (userCurrentTopic[chatId] && userCurrentTopic[chatId].stage === 'subproblema') {
        // Usuário na fase de subtópicos
        await handleSubProblemSelection(conn, chatId, messageText);
      } else if (userCurrentTopic[chatId] === 'descricaoProblema') {
        // Usuário na fase de descrição do problema
        await handleProblemDescription(conn, chatId, newMsg.result.body);
      } else if (userCurrentTopic[chatId] === 'videoFeedback') {
        // Usuário na fase de feedback do vídeo
        await handleVideoFeedback(conn, chatId, messageText);
      } else {
        await sendMessage(conn, chatId, defaultMessage);
      }
    }
  });

  conn.client.ev.on('chatClosed', async (chatId) => {
    console.log('Chat encerrado:', chatId);
    activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);
    delete userCurrentTopic[chatId]; 
    markProblemAsCompleted(chatId); // Mark the problem as completed
    sendStatusUpdateToMainProcess();
    attendNextUserInQueue(conn); // Attend the next user in the queue
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

  userCurrentTopic[chatId] = { problem, stage: 'subproblema' }; 
  await sendMessage(conn, chatId, subProblemOptions);
}

// Função para lidar com a seleção de subtópicos
async function handleSubProblemSelection(conn, chatId, messageText) {
  if (messageText === 'voltar') {
    // Volta para a seleção de problemas
    userCurrentTopic[chatId] = 'problema';
    await sendProblemOptions(conn, chatId);
  } else {
    // Envia um vídeo do YouTube relacionado ao subtópico
    const videoUrl = getVideoUrlForSubProblem(messageText);
    const subProblemText = getSubProblemText(userCurrentTopic[chatId].problem, messageText);
    await sendMessage(conn, chatId, `Aqui está um vídeo que pode ajudar a resolver seu problema: ${videoUrl}`);
    await sendMessage(conn, chatId, 'O vídeo foi suficiente para resolver seu problema? (sim/não)');
    userCurrentTopic[chatId] = 'videoFeedback'; // Define para a fase de feedback do vídeo
    // Adiciona o problema ao banco de dados
    const userInfo = activeChatsList.find(chat => chat.chatId === chatId);
    const problemData = { 
      chatId, 
      description: subProblemText, // Salva o subtópico selecionado
      date: new Date().toLocaleDateString(),
      name: userInfo ? userInfo.name : '',
      position: userInfo ? userInfo.position : '',
      city: userInfo ? userInfo.city : '',
      school: userInfo ? userInfo.school : ''
    };
    reportedProblems.push(problemData);
    saveProblemToDatabase(problemData);
    sendStatusUpdateToMainProcess();
  }
}

// Função para obter o texto do subtópico
function getSubProblemText(problem, subProblem) {
  const subProblemTexts = {
    'Falha no acesso ao sistema': {
      '1': 'Não consigo acessar minha conta',
      '2': 'Sistema não carrega',
      '3': 'Outro problema relacionado ao acesso'
    },
    'Erro ao cadastrar aluno/funcionário': {
      '1': 'Erro ao inserir dados do aluno',
      '2': 'Erro ao inserir dados do funcionário',
      '3': 'Outro problema relacionado ao cadastro'
    },
    'Problemas com o diário de classe': {
      '1': 'Falha na inserção de notas',
      '2': 'Falha na visualização de registros',
      '3': 'Outro problema com o diário de classe'
    },
    'Falha no registro de notas': {
      '1': 'Não consigo registrar as notas',
      '2': 'Notas não estão sendo salvas',
      '3': 'Outro problema com o registro de notas'
    }
  };
  return subProblemTexts[problem] ? subProblemTexts[problem][subProblem] : 'Outro problema';
}

// Função para obter o URL do vídeo para um subtópico
function getVideoUrlForSubProblem(subProblem) {
  const videoUrls = {
    '1': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Exemplo de URL de vídeo
    '2': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '3': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    // Adicione mais URLs conforme necessário
  };
  return videoUrls[subProblem] || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // URL padrão
}

// Função para lidar com o feedback do vídeo
async function handleVideoFeedback(conn, chatId, messageText) {
  if (messageText === 'sim') {
    await sendMessage(conn, chatId, 'Ficamos felizes em ajudar! Se precisar de mais alguma coisa, estamos à disposição.');
    userCurrentTopic[chatId] = 'problema'; // Retorna à fase de problemas
    await closeChat(chatId); // Close the chat
  } else if (messageText === 'não') {
    await sendMessage(conn, chatId, 'Por favor, descreva o problema que você está enfrentando:');
    userCurrentTopic[chatId] = 'descricaoProblema'; // Define para a fase de descrição do problema
  } else {
    await sendMessage(conn, chatId, 'Resposta inválida. Por favor, responda com "sim" ou "não".');
  }
}

// Função para lidar com a descrição do problema
async function handleProblemDescription(conn, chatId, messageText) {
  console.log(`Bot: handleProblemDescription called with chatId: ${chatId}`);
  const userInfo = activeChatsList.find(chat => chat.chatId === chatId);
  const problemData = { 
    chatId, 
    description: messageText, 
    date: new Date().toLocaleDateString(),
    name: userInfo ? userInfo.name : '',
    position: userInfo ? userInfo.position : '',
    city: userInfo ? userInfo.city : '',
    school: userInfo ? userInfo.school : ''
  }; // Add user info to problem data
  reportedProblems.push(problemData); // Add problem to reportedProblems
  saveProblemToDatabase(problemData); // Save problem to database
  await sendMessage(conn, chatId, 'Sua descrição foi recebida. Um atendente entrará em contato em breve.');
  sendProblemToFrontEnd(problemData);  // Envia a descrição do problema no formato original com o chatId
  sendStatusUpdateToMainProcess(); // Update the status to include the new problem
  attendNextUserInQueue(conn); // Attend the next user in the queue
}

// Função para salvar o problema no banco de dados
function saveProblemToDatabase(problemData) {
  db.run(`INSERT INTO problems (chatId, description, date, name, position, city, school) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [problemData.chatId, problemData.description, problemData.date, problemData.name, problemData.position, problemData.city, problemData.school], 
    function(err) {
      if (err) {
        return console.log(err.message);
      }
      console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}

// Função para marcar o problema como concluído no banco de dados
function markProblemAsCompleted(chatId) {
  db.run(`UPDATE problems SET status = 'completed' WHERE chatId = ?`, [chatId], function(err) {
    if (err) {
      return console.log(err.message);
    }
    console.log(`Problem with chatId ${chatId} marked as completed.`);
  });
}

// Função para enviar a atualização de status ao processo principal (front-end)
function sendStatusUpdateToMainProcess() {
  const activeChats = activeChatsList.filter(chat => !chat.isWaiting && userCurrentTopic[chat.chatId] !== 'atendente'); 
  const waitingList = activeChatsList.filter(chat => chat.isWaiting);  
  const attendedByAttendant = activeChatsList.filter(chat => userCurrentTopic[chat.chatId] === 'atendente');
  
  ipcMain.emit('statusUpdate', null, {  // Corrected event name
    activeChats,
    waitingList,
    problems: reportedProblems, // Include reported problems in the status update
    attendedByAttendant // Include chats attended by attendants
  });
}

// Função para enviar o problema selecionado para o front-end
function sendProblemToFrontEnd(problemData) {
  console.log(`Bot: sendProblemToFrontEnd called with chatId: ${problemData.chatId}`);
  if (problemData.description.startsWith('Subtópico:')) {
    return; // Não envia subtópicos para o front-end
  }
  ipcMain.emit('userProblem', null, problemData.description, problemData.chatId, problemData.name);
}

// Função para encerrar o chat
async function closeChat(chatId) {
  await sendMessage(botConnection, chatId, 'Atendimento encerrado. Obrigado!');
  activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);
  delete userCurrentTopic[chatId];
  reportedProblems = reportedProblems.filter(problem => problem.chatId !== chatId); // Remove the problem
  markProblemAsCompleted(chatId); // Mark the problem as completed
  sendStatusUpdateToMainProcess();
  attendNextUserInQueue(botConnection);
}

// Função para atender o próximo usuário na fila
async function attendNextUserInQueue(conn) {
  const nextUser = activeChatsList.find(chat => chat.isWaiting);
  if (nextUser) {
    nextUser.isWaiting = false;
    await sendMessage(conn, nextUser.chatId, `Obrigado por aguardar, ${nextUser.name}. Estamos iniciando seu atendimento.`);
    await sendProblemOptions(conn, nextUser.chatId);
    userCurrentTopic[nextUser.chatId] = 'problema';
    sendStatusUpdateToMainProcess();
  }
}

// Função para inicializar o banco de dados
function initializeDatabase() {
  db = new sqlite3.Database(path.join(__dirname, 'bot_data.db'), (err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
  });

  db.run(`CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT,
    description TEXT,
    date TEXT,
    name TEXT,
    position TEXT,
    city TEXT,
    school TEXT,
    status TEXT DEFAULT 'pending'
  )`, (err) => {
    if (err) {
      return console.log(err.message);
    }
    console.log('Table created.');
  });
}

module.exports = { startHydraBot };