const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();

const cookiesPath = path.join(__dirname, 'cookies.json');
const maxActiveChats = 3;

let bot;
let activeChatsList = [];
let userCurrentTopic = {};
let botConnection = null;
let reportedProblems = [];
let db;

const defaultMessage = `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:

Nome:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Certifique-se de preencher todas as informações corretamente para agilizar o atendimento.`;

// Initialize the bot
async function startHydraBot(io) {
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
        botConnection = conn;
        startListeningForMessages(conn, io);
      } else {
        console.error('Erro na conexão Hydra.');
      }
    });

    ipcMain.on('redirectToChat', async (event, chatId) => {
      if (botConnection) {
        await redirectToWhatsAppChat(botConnection, chatId);
      }
    });

    ipcMain.on('markProblemCompleted', (event, chatId) => {
      reportedProblems = reportedProblems.filter(problem => problem.chatId !== chatId);
      markProblemAsCompleted(chatId, io);
      sendStatusUpdateToMainProcess(io);
    });

    bot.on('qrcode', (qrcode) => {
      console.log('QR Code gerado pelo Hydra:', qrcode);
    });

    initializeDatabase();
  } catch (error) {
    console.error('Erro ao iniciar o Hydra:', error);
  }
}

// Listen for incoming messages
function startListeningForMessages(conn, io) {
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
            await sendProblemOptions(conn, chatId);
            userCurrentTopic[chatId] = 'problema';
            saveClientInfoToDatabase(userInfo, chatId, io);
          } else {
            userInfo.isWaiting = true;
            activeChatsList.push({ ...userInfo, chatId });
            await sendMessage(conn, chatId, `Você está na lista de espera. Sua posição na fila é: ${activeChatsList.filter(chat => chat.isWaiting).length}. Aguarde sua vez.`);
          }
          sendStatusUpdateToMainProcess(io);
        } else {
          await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
        }
      } else if (userCurrentTopic[chatId] === 'problema') {
        await handleProblemSelection(conn, chatId, messageText, io);
      } else if (userCurrentTopic[chatId] && userCurrentTopic[chatId].stage === 'subproblema') {
        await handleSubProblemSelection(conn, chatId, messageText, io);
      } else if (userCurrentTopic[chatId] === 'descricaoProblema') {
        await handleProblemDescription(conn, chatId, newMsg.result.body, io);
      } else if (userCurrentTopic[chatId] === 'videoFeedback') {
        await handleVideoFeedback(conn, chatId, messageText, io);
      } else {
        await sendMessage(conn, chatId, defaultMessage);
      }
    }
  });

  conn.client.ev.on('chatClosed', async (chatId) => {
    activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);
    delete userCurrentTopic[chatId];
    sendStatusUpdateToMainProcess(io);
    attendNextUserInQueue(conn, io);
  });
}

// Parse user information from the message
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

// Capitalize the first letters of words
function capitalize(str) {
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// Send a message to the user
async function sendMessage(conn, chatId, message) {
  await conn.client.sendMessage({ to: chatId, body: message, options: { type: 'sendText' } });
}

// Send problem options to the user
async function sendProblemOptions(conn, chatId) {
  const problemOptions = `Por favor, selecione o tipo de problema que você está enfrentando:

1️⃣ Falha no acesso ao sistema
2️⃣ Erro ao cadastrar aluno/funcionário
3️⃣ Problemas com o diário de classe
4️⃣ Falha no registro de notas
5️⃣ Outro problema`;

  await sendMessage(conn, chatId, problemOptions);
}

// Handle problem selection
async function handleProblemSelection(conn, chatId, messageText, io) {
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
      userCurrentTopic[chatId] = 'descricaoProblema';
      break;
    case 'voltar':
      await sendProblemOptions(conn, chatId);
      break;
    default:
      await sendMessage(conn, chatId, 'Opção inválida. Por favor, selecione uma opção válida.');
  }
}

// Send sub-problem options to the user
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

// Handle sub-problem selection
async function handleSubProblemSelection(conn, chatId, messageText, io) {
  if (messageText === 'voltar') {
    userCurrentTopic[chatId] = 'problema';
    await sendProblemOptions(conn, chatId);
  } else {
    const videoUrl = getVideoUrlForSubProblem(messageText);
    const subProblemText = getSubProblemText(userCurrentTopic[chatId].problem, messageText);
    await sendMessage(conn, chatId, `Aqui está um vídeo que pode ajudar a resolver seu problema: ${videoUrl}`);
    await sendMessage(conn, chatId, 'O vídeo foi suficiente para resolver seu problema? (sim/não)');
    userCurrentTopic[chatId] = 'videoFeedback';
    const userInfo = activeChatsList.find(chat => chat.chatId === chatId);
    const problemData = { 
      chatId, 
      description: subProblemText,
      date: new Date().toLocaleDateString(),
      name: userInfo ? userInfo.name : '',
      position: userInfo ? userInfo.position : '',
      city: userInfo ? userInfo.city : '',
      school: userInfo ? userInfo.school : '',
      status: 'pending',
      problemId: userInfo ? userInfo.problemId : null // Use the saved problem ID
    };
    reportedProblems.push(problemData);
    saveProblemToDatabase(problemData, io);
    sendStatusUpdateToMainProcess(io);
    io.emit('newProblemReported', problemData); // Emit event when a new problem is reported
  }
}

// Get sub-problem text
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

// Get video URL for sub-problem
function getVideoUrlForSubProblem(subProblem) {
  const videoUrls = {
    '1': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '2': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '3': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  return videoUrls[subProblem] || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
}

// Handle video feedback
async function handleVideoFeedback(conn, chatId, messageText, io) {
  if (messageText === 'sim') {
    await sendMessage(conn, chatId, 'Ficamos felizes em ajudar! Se precisar de mais alguma coisa, estamos à disposição.');
    userCurrentTopic[chatId] = 'problema';
    await closeChat(chatId, io);
  } else if (messageText === 'não') {
    await sendMessage(conn, chatId, 'Por favor, descreva o problema que você está enfrentando:');
    userCurrentTopic[chatId] = 'descricaoProblema';
  } else {
    await sendMessage(conn, chatId, 'Resposta inválida. Por favor, responda com "sim" ou "não".');
  }
}

// Handle problem description
async function handleProblemDescription(conn, chatId, messageText, io) {
  const userInfo = activeChatsList.find(chat => chat.chatId === chatId);
  const problemData = { 
    chatId, 
    description: messageText,
    date: new Date().toLocaleDateString(),
    name: userInfo ? userInfo.name : '',
    position: userInfo ? userInfo.position : '',
    city: userInfo ? userInfo.city : '',
    school: userInfo ? userInfo.school : '',
    status: 'pending',
    problemId: userInfo ? userInfo.problemId : null // Use the saved problem ID
  };
  reportedProblems.push(problemData);
  saveProblemToDatabase(problemData, io);
  await sendMessage(conn, chatId, 'Sua descrição foi recebida. Um atendente entrará em contato em breve.');
  sendProblemToFrontEnd(problemData);
  sendStatusUpdateToMainProcess(io);
  io.emit('newProblemReported', problemData); // Emit event when a new problem is reported
  attendNextUserInQueue(conn, io);
}

// Save client information to the database
function saveClientInfoToDatabase(userInfo, chatId, io) {
  db.run(`INSERT INTO problems (chatId, name, position, city, school, status) VALUES (?, ?, ?, ?, ?, 'pending')`, 
    [chatId, userInfo.name, userInfo.position, userInfo.city, userInfo.school], 
    function(err) {
      if (err) {
        return console.log(err.message);
      }
      console.log(`Client info inserted with rowid ${this.lastID}`);
      // Find the user in the activeChatsList and update their problemId
      const userIndex = activeChatsList.findIndex(chat => chat.chatId === chatId);
      if (userIndex !== -1) {
        activeChatsList[userIndex].problemId = this.lastID;
      }
      io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
    });
}

// Save problem to the database
function saveProblemToDatabase(problemData, io) {
  db.run(`UPDATE problems SET description = ?, date = ? WHERE id = ?`, 
    [problemData.description, problemData.date, problemData.problemId], 
    function(err) {
      if (err) {
        return console.log(err.message);
      }
      console.log(`Problem description updated for id ${problemData.problemId}`);
      io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
    });
}

// Mark problem as completed in the database
function markProblemAsCompleted(problemId, io) {
  db.run(`UPDATE problems SET status = 'completed' WHERE id = ?`, [problemId], function(err) {
    if (err) {
      return console.log(err.message);
    }
    console.log(`Problem with id ${problemId} marked as completed.`);
    io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
  });
}

// Send status update to the main process
function sendStatusUpdateToMainProcess(io) {
  const activeChats = activeChatsList.filter(chat => !chat.isWaiting && userCurrentTopic[chat.chatId] !== 'atendente'); 
  const waitingList = activeChatsList.filter(chat => chat.isWaiting);  
  const attendedByAttendant = activeChatsList.filter(chat => userCurrentTopic[chat.chatId] === 'atendente');
  
  ipcMain.emit('statusUpdate', null, { 
    activeChats,
    waitingList,
    problems: reportedProblems,
    attendedByAttendant
  });
  io.emit('statusUpdate', { 
    activeChats,
    waitingList,
    problems: reportedProblems,
    attendedByAttendant
  });
}

// Send problem to the front-end
function sendProblemToFrontEnd(problemData) {
  if (problemData.description.startsWith('Subtópico:')) {
    return;
  }
  ipcMain.emit('userProblem', null, problemData.description, problemData.chatId, problemData.name);
}

// Close the chat
async function closeChat(chatId, io) {
  await sendMessage(botConnection, chatId, 'Atendimento encerrado. Obrigado!');
  const userInfo = activeChatsList.find(chat => chat.chatId === chatId);
  activeChatsList = activeChatsList.filter(chat => chat.chatId !== chatId);
  delete userCurrentTopic[chatId];
  reportedProblems = reportedProblems.filter(problem => problem.chatId !== chatId);
  if (userInfo && userInfo.problemId) {
    markProblemAsCompleted(userInfo.problemId, io); // Use the saved problem ID
  }
  sendStatusUpdateToMainProcess(io);
  attendNextUserInQueue(botConnection, io);
}

// Attend the next user in the queue
async function attendNextUserInQueue(conn, io) {
  const nextUser = activeChatsList.find(chat => chat.isWaiting);
  if (nextUser) {
    nextUser.isWaiting = false;
    await sendMessage(conn, nextUser.chatId, `Obrigado por aguardar, ${nextUser.name}. Estamos iniciando seu atendimento.`);
    await sendProblemOptions(conn, nextUser.chatId);
    userCurrentTopic[nextUser.chatId] = 'problema';
    sendStatusUpdateToMainProcess(io);
  }
}

// Get the waiting list
function getWaitingList() {
  return activeChatsList.filter(chat => chat.isWaiting);
}

// Initialize the database
function initializeDatabase() {
  db = new sqlite3.Database(path.join(__dirname, 'bot_data.db'), (err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
  });

  db.run(`CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    name TEXT,
    city TEXT,
    position TEXT,
    school TEXT,
    chatId TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending'
  )`, (err) => {
    if (err) {
      return console.log(err.message);
    }
    console.log('Table created.');
  });
}

module.exports = { startHydraBot };