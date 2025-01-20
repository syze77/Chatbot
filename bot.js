const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const express = require('express');
const { getDatabase } = require('./database');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Constantes globais
const MESSAGE_DELAY = 1000; // 1 segundo entre mensagens
const MAX_ACTIVE_CHATS = 3;

// Estado global da aplicação
let bot;
let botConnection = null;
let messageQueue = [];
let isProcessingQueue = false;
let userCurrentTopic = {};

// Mensagem padrão para novos usuários
const defaultMessage = `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:

Nome:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Certifique-se de preencher todas as informações corretamente para agilizar o atendimento.`;

// Initialize Express
const server = express();

// Add JSON middleware
server.use(express.json());

let activeChatsList = [];
let reportedProblems = [];

// Initialize the bot
async function startHydraBot(io) {
  try {
    bot = await hydraBot.initServer({
      puppeteerOptions: {
        headless: false,
        devtools: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
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

  } catch (error) {
    console.error('Erro ao iniciar o Hydra:', error);
  }

  io.on('connection', (socket) => {
    socket.on('attendProblem', async (data) => {
      try {
        const { chatId, attendantId } = data;

        // Update problem status in database
        await getDatabase().run(
          `UPDATE problems 
           SET status = 'active', 
               attendant_id = ? 
           WHERE chatId = ? AND status = 'pending'`,
          [attendantId, chatId]
        );

        // Send status update to all clients
        sendStatusUpdateToMainProcess(io);

        // Send confirmation message to the user
        if (botConnection) {
          await sendMessage(
            botConnection,
            chatId,
            'Um atendente está analisando seu problema e entrará em contato em breve.'
          );
        }
      } catch (error) {
        console.error('Erro ao atender problema:', error);
      }
    });

    socket.on('endChat', async (data) => {
      try {
        const { chatId, id } = data;

        // Update chat status to completed in database
        await getDatabase().run(
          `UPDATE problems 
           SET status = 'completed', 
               date_completed = DATETIME('now')
           WHERE chatId = ? AND (id = ? OR status = 'active' OR status = 'pending')`,
          [chatId, id]
        );

        // Send completion message to user
        if (botConnection) {
          await sendMessage(
            botConnection,
            chatId,
            'Atendimento finalizado. Se precisar de mais algum atendimento, envie suas informações novamente no formato:'
          );
          await sendMessage(
            botConnection,
            chatId,
            `Nome:\nCidade:\nCargo:\nEscola:`
          );

          // Reset user topic to allow new service
          delete userCurrentTopic[chatId];
        }

        // Process next user in queue
        const nextInLine = await getNextInWaitingList();
        if (nextInLine) {
          await getDatabase().run(
            'UPDATE problems SET status = "active" WHERE chatId = ?',
            [nextInLine.chatId]
          );

          await sendMessage(
            botConnection,
            nextInLine.chatId,
            `Olá ${nextInLine.name}! Sua vez chegou. Estamos iniciando seu atendimento.`
          );
          await sendProblemOptions(botConnection, nextInLine.chatId);
        }

        // Update waiting users and status
        await updateWaitingUsers(io);
        await sendStatusUpdateToMainProcess(io);

      } catch (error) {
        console.error('Erro ao finalizar atendimento:', error);
      }
    });
  });
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
          handleNewUser(conn, chatId, userInfo, io);
        } else {
          await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
        }
      } else {
        handleUserMessage(conn, chatId, messageText, io);
      }
    }
  });

  conn.client.ev.on('chatClosed', async (chatId) => {
    handleChatClosed(chatId, io);
  });
}

/**
 * Atualiza o banco de dados e notifica os clientes
 * @param {string} query - Query SQL
 * @param {Array} params - Parâmetros da query
 * @param {Object} io - Objeto Socket.IO
 * @returns {Promise<number>} ID do registro inserido/atualizado
 */
async function updateDatabaseAndNotify(query, params, io) {
    return new Promise((resolve, reject) => {
        getDatabase().run(query, params, async function(err) {
            if (err) {
                console.error('Erro na atualização do banco:', err);
                reject(err);
                return;
            }

            try {
                // Buscar dados atualizados
                const statusData = await fetchCurrentStatus();
                // Emitir atualização para todos os clientes
                io.emit('statusUpdate', statusData);
                resolve(this.lastID);
            } catch (error) {
                console.error('Erro ao buscar dados atualizados:', error);
                reject(error);
            }
        });
    });
}

// Função auxiliar para buscar status atual
async function fetchCurrentStatus() {
    return new Promise((resolve, reject) => {
        const queries = {
            active: 'SELECT * FROM problems WHERE status = "active" ORDER BY date DESC LIMIT 3',
            waiting: 'SELECT * FROM problems WHERE status = "waiting" ORDER BY date ASC',
            pending: 'SELECT * FROM problems WHERE status = "pending" ORDER BY date DESC'
        };

        Promise.all([
            queryDatabase(queries.active),
            queryDatabase(queries.waiting),
            queryDatabase(queries.pending)
        ])
        .then(([active, waiting, pending]) => {
            resolve({
                activeChats: active,
                waitingList: waiting,
                problems: pending
            });
        })
        .catch(reject);
    });
}

// Função auxiliar para consultas no banco de dados
function queryDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        getDatabase().all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Processa novo usuário
async function handleNewUser(conn, chatId, userInfo, io) {
    const activeCount = await getActiveChatsCount();
    const status = activeCount < MAX_ACTIVE_CHATS ? 'active' : 'waiting';
    
    try {
        await updateDatabaseAndNotify(
            `INSERT INTO problems (chatId, name, position, city, school, status, date) 
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            [chatId, userInfo.name, userInfo.position, userInfo.city, userInfo.school, status],
            io
        );

        if (status === 'active') {
            await sendMessage(
                conn, 
                chatId, 
                `Olá ${userInfo.name}! Um atendente está disponível para ajudá-lo.`
            );
            await sendProblemOptions(conn, chatId);
            userCurrentTopic[chatId] = 'problema';
        } else {
            const position = await getWaitingPosition(chatId);
            await sendMessage(
                conn,
                chatId,
                `Olá ${userInfo.name}!\n\nTodos os nossos atendentes estão ocupados no momento.\n` +
                `Você está na ${position}ª posição da fila.\n` +
                `Aguarde, você será notificado assim que um atendente estiver disponível.`
            );
        }
    } catch (error) {
        console.error('Erro ao processar novo usuário:', error);
        await sendMessage(conn, chatId, 'Desculpe, ocorreu um erro. Por favor, tente novamente mais tarde.');
    }
}

// Função para obter contagem de chats ativos
async function getActiveChatsCount() {
    return new Promise((resolve, reject) => {
        getDatabase().get('SELECT COUNT(*) as count FROM problems WHERE status = "active"', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// Função para obter posição na fila
async function getWaitingPosition(chatId) {
    return new Promise((resolve, reject) => {
        getDatabase().all('SELECT chatId FROM problems WHERE status = "waiting" ORDER BY date ASC', (err, rows) => {
            if (err) reject(err);
            else {
                const position = rows.findIndex(row => row.chatId === chatId) + 1;
                resolve(position || rows.length + 1);
            }
        });
    });
}

// Processa mensagem do usuário
async function handleUserMessage(conn, chatId, messageText, io) {
    const currentTopic = userCurrentTopic[chatId];
    
    // Se não há tópico atual ou se uma nova mensagem começa com "nome:"
    if (!currentTopic || messageText.toLowerCase().startsWith('nome:')) {
        if (messageText.toLowerCase().startsWith('nome:')) {
            const userInfo = parseUserInfo(messageText);
            if (userInfo) {
                await handleNewUser(conn, chatId, userInfo, io);
            } else {
                await sendMessage(conn, chatId, 'Por favor, insira suas informações no formato correto.');
            }
        } else {
            await sendMessage(conn, chatId, defaultMessage);
            // Adicionar uma pequena pausa entre as mensagens
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Enviar o template de preenchimento
            await sendMessage(conn, chatId, `Nome:\nCidade:\nCargo:\nEscola:`);
        }
        return;
    }

    try {
        if (currentTopic.state === 'descricaoProblema') {
            await handleProblemDescription(conn, chatId, messageText, io);
            userCurrentTopic[chatId] = 'problema';
        } else if (currentTopic === 'problema') {
            await handleProblemSelection(conn, chatId, messageText, io);
        } else if (currentTopic.stage === 'subproblema') {
            await handleSubProblemSelection(conn, chatId, messageText, io);
        } else if (currentTopic === 'videoFeedback') {
            await handleVideoFeedback(conn, chatId, messageText, io);
        } else {
            await sendMessage(conn, chatId, defaultMessage);
        }
    } catch (error) {
        console.error('Error handling user message:', error);
        await sendMessage(conn, chatId, 'Desculpe, ocorreu um erro. Por favor, tente novamente.');
    }
}

// Processa fechamento do chat
async function handleChatClosed(chatId, io) {
    try {
        // Mark chat as completed
        await updateDatabaseAndNotify(
            `UPDATE problems 
             SET status = 'completed', 
             date_completed = datetime('now') 
             WHERE chatId = ? AND status = 'active'`,
            [chatId],
            io
        );

        // Get next user in waiting list
        const nextUser = await getNextInWaitingList();
        if (nextUser) {
            // Update next user status
            await updateDatabaseAndNotify(
                `UPDATE problems 
                 SET status = 'active' 
                 WHERE chatId = ?`,
                [nextUser.chatId],
                io
            );

            // Send message to next user
            await sendMessage(
                botConnection,
                nextUser.chatId,
                `Olá ${nextUser.name}! Um atendente está disponível agora para ajudá-lo.`
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Update all waiting users positions
        await updateWaitingUsers(io);
        
        // Fetch and broadcast updated status to all clients
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error('Erro ao finalizar atendimento:', error);
    }
}

// Analisa informações do usuário da mensagem
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

// Capitaliza primeiras letras das palavras
function capitalize(str) {
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

/**
 * Envia uma mensagem para o usuário através do WhatsApp
 * @param {Object} conn - Conexão com o WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem a ser enviada
 * @returns {Promise<void>}
 */
async function sendMessage(conn, chatId, message) {
  return new Promise((resolve, reject) => {
    messageQueue.push({
      conn,
      chatId,
      message,
      resolve,
      reject,
      retries: 0
    });

    if (!isProcessingQueue) {
      processMessageQueue();
    }
  });
}

/**
 * Processa a fila de mensagens com delay entre elas
 * @param {void}
 * @returns {Promise<void>}
 */
async function processMessageQueue() {
  if (messageQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const message = messageQueue[0];

  try {
    await message.conn.client.sendMessage({ 
      to: message.chatId, 
      body: message.message, 
      options: { type: 'sendText' } 
    });

    message.resolve();
    messageQueue.shift();
    
    // Add delay before next message
    await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
    
  } catch (error) {
    console.error('Error sending message:', error);
    message.retries++;
    
    if (message.retries >= 3) {
      message.reject(error);
      messageQueue.shift();
    }
  }

  // Process next message
  processMessageQueue();
}

// Envia opções de problema para o usuário
async function sendProblemOptions(conn, chatId) {
  const problemOptions = `Por favor, selecione o tipo de problema que você está enfrentando:

1️⃣ Falha no acesso ao sistema
2️⃣ Erro ao cadastrar aluno/funcionário
3️⃣ Problemas com o diário de classe
4️⃣ Falha no registro de notas
5️⃣ Outro problema`;

  await sendMessage(conn, chatId, problemOptions);
}

// Processa seleção de problema
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

// Envia opções de subproblema para o usuário
async function sendSubProblemOptions(conn, chatId, problem) {
  const subProblemOptions = getSubProblemOptions(problem);
  userCurrentTopic[chatId] = { problem, stage: 'subproblema' }; 
  await sendMessage(conn, chatId, subProblemOptions);
}

// Obtém opções de subproblema
function getSubProblemOptions(problem) {
  const options = {
    'Falha no acesso ao sistema': `Selecione o subtópico:

1️⃣ Não consigo acessar minha conta
2️⃣ Sistema não carrega
3️⃣ Outro problema relacionado ao acesso

Digite 'voltar' para retornar ao menu anterior.`,
    'Erro ao cadastrar aluno/funcionário': `Selecione o subtópico:

1️⃣ Erro ao inserir dados do aluno
2️⃣ Erro ao inserir dados do funcionário
3️⃣ Outro problema relacionado ao cadastro

Digite 'voltar' para retornar ao menu anterior.`,
    'Problemas com o diário de classe': `Selecione o subtópico:

1️⃣ Falha na inserção de notas
2️⃣ Falha na visualização de registros
3️⃣ Outro problema com o diário de classe

Digite 'voltar' para retornar ao menu anterior.`,
    'Falha no registro de notas': `Selecione o subtópico:

1️⃣ Não consigo registrar as notas
2️⃣ Notas não estão sendo salvas
3️⃣ Outro problema com o registro de notas

Digite 'voltar' para retornar ao menu anterior.`
  };
  return options[problem] || 'Opção inválida. Por favor, selecione uma opção válida.';
}

// Processa seleção de subproblema
async function handleSubProblemSelection(conn, chatId, messageText, io) {
    try {
        if (messageText === 'voltar') {
            userCurrentTopic[chatId] = 'problema';
            await sendProblemOptions(conn, chatId);
            return;
        }

        const mainProblem = userCurrentTopic[chatId].problem;
        const subProblemText = getSubProblemText(mainProblem, messageText);
        const videoUrl = getVideoUrlForSubProblem(messageText);

        // Buscar informações do usuário
        const userInfo = await new Promise((resolve, reject) => {
            getDatabase().get(
                'SELECT name, city, position, school FROM problems WHERE chatId = ?', 
                [chatId], 
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) reject(new Error('Usuário não encontrado'));
                    else resolve(row);
                }
            );
        });

        // Criar novo registro de problema
        const problemDescription = `${mainProblem} - ${subProblemText}`;
        const date = new Date().toISOString();

        await new Promise((resolve, reject) => {
            getDatabase().run(
                `INSERT INTO problems 
                (chatId, name, city, position, school, description, status, date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    chatId,
                    userInfo.name,
                    userInfo.city,
                    userInfo.position,
                    userInfo.school,
                    problemDescription,
                    'pending',
                    date
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        await sendMessage(conn, chatId, `Aqui está um vídeo que pode ajudar a resolver seu problema: ${videoUrl}`);
        await sendMessage(conn, chatId, 'O vídeo foi suficiente para resolver seu problema? (sim/não)');
        userCurrentTopic[chatId] = 'videoFeedback';

        // Emitir evento com o novo problema
        io.emit('userProblem', problemDescription, chatId, userInfo.name);
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error('Erro em handleSubProblemSelection:', error);
        await sendMessage(conn, chatId, 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
        userCurrentTopic[chatId] = 'problema';
    }
}

// Obtém texto do subproblema
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

// Obtém URL do vídeo para subproblema
function getVideoUrlForSubProblem(subProblem) {
  const videoUrls = {
    '1': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '2': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '3': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  return videoUrls[subProblem] || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
}

// Processa feedback do vídeo
async function handleVideoFeedback(conn, chatId, messageText, io) {
    try {
        if (messageText.toLowerCase() === 'sim') {
            await sendMessage(conn, chatId, 'Ficamos felizes em ajudar! Se precisar de mais algum atendimento, envie suas informações novamente no formato:');
            await sendMessage(conn, chatId, `Nome:\nCidade:\nCargo:\nEscola:`);
            // Resetar o tópico para permitir novo atendimento
            delete userCurrentTopic[chatId];
            await closeChat(chatId, io);
        } else if (messageText.toLowerCase() === 'não') {
            await sendMessage(conn, chatId, 'Por favor, descreva o problema que você está enfrentando:');
            userCurrentTopic[chatId] = {
                state: 'descricaoProblema',
                previousState: 'videoFeedback'
            };
        } else {
            await sendMessage(conn, chatId, 'Resposta inválida. Por favor, responda com "sim" ou "não".');
        }
    } catch (error) {
        console.error('Error in video feedback:', error);
    }
}

// Processa descrição do problema
async function handleProblemDescription(conn, chatId, messageText, io) {
    try {
        const currentTopic = userCurrentTopic[chatId];
        const isFromVideoFeedback = currentTopic && 
                                   currentTopic.state === 'descricaoProblema' && 
                                   currentTopic.previousState === 'videoFeedback';

        // Buscar o problema mais recente do usuário
        const userInfo = await new Promise((resolve, reject) => {
            getDatabase().get(
                `SELECT id, name, city, position, school FROM problems 
                 WHERE chatId = ? AND status = 'pending' 
                 ORDER BY date DESC LIMIT 1`,
                [chatId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) reject(new Error('Usuário não encontrado'));
                    else resolve(row);
                }
            );
        });

        if (isFromVideoFeedback && userInfo) {
            // Atualizar o problema existente
            await new Promise((resolve, reject) => {
                getDatabase().run(
                    `UPDATE problems 
                     SET description = ?, 
                         date = ? 
                     WHERE id = ?`,
                    [messageText, new Date().toISOString(), userInfo.id],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            io.emit('userProblem', messageText, chatId, userInfo.name);
            await sendMessage(conn, chatId, 'Problema atualizado. Um atendente entrará em contato em breve.');
            await sendStatusUpdateToMainProcess(io);
        } else {
            // Criar novo registro de problema
            const date = new Date().toISOString();
            await new Promise((resolve, reject) => {
                getDatabase().run(
                    `INSERT INTO problems 
                    (chatId, name, city, position, school, description, status, date) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        chatId,
                        userInfo.name,
                        userInfo.city,
                        userInfo.position,
                        userInfo.school,
                        messageText,
                        'pending',
                        date
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            io.emit('userProblem', messageText, chatId, userInfo.name);
            await sendMessage(conn, chatId, 'Problema registrado. Um atendente entrará em contato em breve.');
            await sendStatusUpdateToMainProcess(io);
        }
    } catch (error) {
        console.error('Erro em handleProblemDescription:', error);
        await sendMessage(conn, chatId, 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
        userCurrentTopic[chatId] = 'problema';
    }
}

// Save client information to the database
function saveClientInfoToDatabase(userInfo, chatId, status, io) {
  const date = new Date().toISOString();
  
  getDatabase().run(
    `INSERT INTO problems (chatId, name, position, city, school, status, date) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [chatId, userInfo.name, userInfo.position, userInfo.city, userInfo.school, status, date], 
    function(err) {
      if (err) {
        console.error('Erro ao salvar informações do cliente:', err.message);
        return;
      }
      console.log(`Cliente inserido com ID ${this.lastID}`);
      io.emit('statusUpdate');
    }
  );
}

// Save problem to the database
function saveProblemToDatabase(problemData, io) {
  getDatabase().run(`UPDATE problems SET description = ?, date = ? WHERE id = ?`, 
    [problemData.description, problemData.date, problemData.problemId], 
    function(err) {
      if (err) {
        console.error('Erro ao salvar problema:', err.message);
        return;
      }
      console.log(`Problem description updated for id ${problemData.problemId}`);
      io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
    });
}

// Mark problem as completed in the database
function markProblemAsCompleted(problemId, io) {
  getDatabase().run(`UPDATE problems SET status = 'completed' WHERE id = ?`, [problemId], function(err) {
    if (err) {
      console.error('Erro ao marcar problema como concluído:', err.message);
      return;
    }
    console.log(`Problem with id ${problemId} marked as completed.`);
    io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
  });
}

// Send status update to the main process
async function sendStatusUpdateToMainProcess(io) {
    try {
        const queries = {
            active: `SELECT * FROM problems 
                     WHERE status = 'active' 
                     ORDER BY date DESC`,
            waiting: `SELECT * FROM problems 
                      WHERE status = 'waiting' 
                      ORDER BY date ASC`,
            pending: `SELECT * FROM problems 
                      WHERE status = 'pending' 
                      ORDER BY date DESC`,
            completed: `SELECT * FROM problems 
                        WHERE status = 'completed' 
                        ORDER BY date_completed DESC 
                        LIMIT 10`
        };

        const [active, waiting, pending, completed] = await Promise.all([
            queryDatabase(queries.active),
            queryDatabase(queries.waiting),
            queryDatabase(queries.pending),
            queryDatabase(queries.completed)
        ]);

        const statusData = {
            activeChats: active,
            waitingList: waiting,
            problems: pending,
            completedChats: completed
        };

        // Emit update to all clients
        io.emit('statusUpdate', statusData);
        
        // Debug log
        console.log('Status atualizado:', {
            activeCount: active.length,
            waitingCount: waiting.length,
            pendingCount: pending.length,
            completedCount: completed.length
        });

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
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
    try {
        // Mark chat as completed
        await updateDatabaseAndNotify(
            `UPDATE problems 
             SET status = 'completed', 
             date_completed = datetime('now') 
             WHERE chatId = ?`,
            [chatId],
            io
        );

        // Get next user in waiting list
        const nextUser = await getNextInWaitingList();
        if (nextUser) {
            // Update next user status
            await updateDatabaseAndNotify(
                `UPDATE problems 
                 SET status = 'active' 
                 WHERE chatId = ?`,
                [nextUser.chatId],
                io
            );

            // Send message to next user
            await sendMessage(
                botConnection,
                nextUser.chatId,
                `Olá ${nextUser.name}! Sua vez chegou. Estamos iniciando seu atendimento.`
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Update all waiting users positions
        await updateWaitingUsers(io);
        
        // Fetch and broadcast final status update
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error('Erro ao finalizar atendimento:', error);
    }
}

// Função para obter próximo da fila
async function getNextInWaitingList() {
    return new Promise((resolve, reject) => {
        getDatabase().get(
            `SELECT * FROM problems 
             WHERE status = 'waiting' 
             ORDER BY date ASC 
             LIMIT 1`,
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
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

// Adicionar função para redirecionar para WhatsApp
function redirectToWhatsAppChat(chatId) {
    const sanitizedChatId = chatId.replace('@c.us', '');
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${sanitizedChatId}`;
    require('electron').shell.openExternal(whatsappUrl);
}

// Add new function to update waiting users
async function updateWaitingUsers(io) {
    try {
        const waitingUsers = await new Promise((resolve, reject) => {
            getDatabase().all(
                'SELECT chatId, name FROM problems WHERE status = "waiting" ORDER BY date ASC',
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // Update each waiting user with their new position
        for (let i = 0; i < waitingUsers.length; i++) {
            const position = i + 1;
            const user = waitingUsers[i];
            await sendMessage(
                botConnection,
                user.chatId,
                `Atualização: ${user.name}, sua posição atual na fila é ${position}º lugar.`
            );
        }
    } catch (error) {
        console.error('Erro ao atualizar usuários em espera:', error);
    }
}

// Função auxiliar para converter status em texto legível
function getStatusText(status) {
    const statusMap = {
        'active': 'Em atendimento',
        'waiting': 'Em espera',
        'completed': 'Concluído',
        'pending': 'Pendente'
    };
    return statusMap[status] || status;
}

// Add report generation endpoint
server.get('/generateReport', async (req, res) => {
    try {
        const { start, end, format, city, school } = req.query;
        
        let filter = '';
        const params = [start, end];
        
        if (city) {
            filter += ' AND city = ?';
            params.push(city);
        }
        
        if (school) {
            filter += ' AND school = ?';
            params.push(school);
        }
        
        const query = `
            SELECT 
                problems.*,
                strftime('%d/%m/%Y %H:%M', datetime(date, 'localtime')) as formatted_date,
                strftime('%d/%m/%Y %H:%M', datetime(date_completed, 'localtime')) as formatted_date_completed,
                CAST((julianday(date_completed) - julianday(date)) * 24 * 60 AS INTEGER) as duration_minutes
            FROM problems 
            WHERE date BETWEEN ? AND ?
            AND description IS NOT NULL
            ${filter}
            ORDER BY date DESC
        `;

        const problems = await queryDatabase(query, params);

        // Handle Excel export format
        if (format === 'xlsx') {
            const Excel = require('exceljs');
            const workbook = new Excel.Workbook();
            const worksheet = workbook.addWorksheet('Atendimentos');

            // Configure columns
            worksheet.columns = [
                { header: 'Nome', key: 'name', width: 30 },
                { header: 'Cidade', key: 'city', width: 20 },
                { header: 'Escola', key: 'school', width: 30 },
                { header: 'Cargo', key: 'position', width: 20 },
                { header: 'Problema', key: 'description', width: 50 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Data Início', key: 'formatted_date', width: 20 },
                { header: 'Data Conclusão', key: 'formatted_date_completed', width: 20 },
                { header: 'Duração (min)', key: 'duration_minutes', width: 15 }
            ];

            // Add rows
            worksheet.addRows(problems);

            // Style header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}-a-${end}.xlsx`);

            await workbook.xlsx.write(res);
            return;
        }

        // PDF Generation
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}-a-${end}.pdf`);
        doc.pipe(res);

        // Calculate statistics
        const totalAtendimentos = problems.length;
        const concluidos = problems.filter(p => p.status === 'completed').length;
        const tempoMedioMinutos = concluidos ? Math.round(
            problems.reduce((acc, p) => acc + (p.duration_minutes || 0), 0) / concluidos
        ) : 0;

        // Header and statistics
        doc.fontSize(20).text('Relatório de Atendimentos', { align: 'center' }).moveDown(1);
        doc.fontSize(12).text(`Período: ${new Date(start).toLocaleDateString()} a ${new Date(end).toLocaleDateString()}`).moveDown(2);
        
        doc.fontSize(14).text('Estatísticas', { underline: true }).moveDown(1);
        doc.fontSize(12)
           .text(`Total de Atendimentos: ${totalAtendimentos}`)
           .text(`Atendimentos Concluídos: ${concluidos}`)
           .text(`Tempo Médio: ${Math.floor(tempoMedioMinutos/60)}h ${tempoMedioMinutos%60}min`)
           .moveDown(2);

        // Problems listing
        doc.fontSize(14).text('Detalhamento', { underline: true }).moveDown(1);

        problems.forEach((problem) => {
            const duracao = problem.duration_minutes
                ? `${Math.floor(problem.duration_minutes/60)}h ${problem.duration_minutes%60}min`
                : 'Em andamento';

            doc.fontSize(12)
               .text(`Data: ${problem.formatted_date}`)
               .text(`Nome: ${problem.name}`)
               .text(`Cargo: ${problem.position}`)
               .text(`Escola: ${problem.school}`)
               .text(`Cidade: ${problem.city}`)
               .text(`Problema: ${problem.description}`)
               .text(`Status: ${getStatusText(problem.status)}`)
               .text(`Duração: ${duracao}`)
               .moveDown(1);
        });

        doc.end();

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

// Atualizar o endpoint getChartData com query corrigida
server.get('/getChartData', async (req, res) => {
    try {
        const { city, school } = req.query;
        let conditions = ['description IS NOT NULL'];
        const params = [];
        
        if (city) {
            conditions.push('problems.city = ?');
            params.push(city);
        }
        
        if (school) {
            conditions.push('problems.school = ?');
            params.push(school);
        }
        
        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        
        // Query para dados mensais (modificada para garantir todos os meses)
        const monthlyQuery = `
            WITH RECURSIVE 
            months(month_num) AS (
                SELECT 1
                UNION ALL
                SELECT month_num + 1
                FROM months
                WHERE month_num < 12
            ),
            month_data AS (
                SELECT 
                    strftime('%m', problems.date) as month,
                    COUNT(DISTINCT problems.id) as count
                FROM problems
                ${whereClause}
                AND strftime('%Y', problems.date) = strftime('%Y', 'now')
                GROUP BY strftime('%m', problems.date)
            )
            SELECT 
                printf('%02d', months.month_num) as month,
                COALESCE(month_data.count, 0) as count
            FROM months
            LEFT JOIN month_data ON printf('%02d', months.month_num) = month_data.month
            ORDER BY months.month_num`;

        // Query para dados semanais (mantida como está)
        const weeklyQuery = `
            WITH RECURSIVE dates(date) AS (
                SELECT date('now', 'weekday 1', '-7 days')
                UNION ALL
                SELECT date(date, '+1 day')
                FROM dates
                WHERE date < date('now')
                LIMIT 7
            )
            SELECT 
                dates.date,
                COUNT(DISTINCT problems.id) as count
            FROM dates
            LEFT JOIN problems ON date(problems.date) = dates.date
            ${whereClause}
            GROUP BY dates.date
            ORDER BY dates.date`;

        const [weeklyData, monthlyData] = await Promise.all([
            queryDatabase(weeklyQuery, params),
            queryDatabase(monthlyQuery, params)
        ]);

        // Processar os dados
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        const processed = {
            weekly: {
                labels: weeklyData.map(row => {
                    const date = new Date(row.date);
                    return weekDays[date.getDay()];
                }),
                data: weeklyData.map(row => row.count)
            },
            monthly: {
                labels: monthNames,
                data: monthlyData.map(row => row.count)
            }
        };

        res.json(processed);
        
    } catch (error) {
        console.error('Erro ao buscar dados dos gráficos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados dos gráficos' });
    }
});

// Update the getCompletedAttendances endpoint
server.get('/getCompletedAttendances', async (req, res) => {
    try {
        const { date, position, city, school } = req.query;
        let query = `
            SELECT 
                id, 
                chatId, 
                name, 
                position, 
                city, 
                school, 
                description,
                strftime('%d/%m/%Y %H:%M', datetime(date, 'localtime')) as date,
                strftime('%d/%m/%Y %H:%M', datetime(date_completed, 'localtime')) as date_completed,
                status,
                CAST(
                    (julianday(date_completed) - julianday(date)) * 24 * 60 AS INTEGER
                ) as duration_minutes
            FROM problems 
            WHERE status = 'completed'
            AND description IS NOT NULL`;
        
        const params = [];
        
        if (date) {
            query += ` AND DATE(date_completed) = DATE(?)`;
            params.push(date);
        }
        
        if (position) {
            query += ` AND position = ?`;
            params.push(position);
        }

        if (city) {
            query += ` AND city = ?`;
            params.push(city);
        }

        if (school) {
            query += ` AND school = ?`;
            params.push(school);
        }
        
        query += ` ORDER BY date_completed DESC`;

        const completedAttendances = await queryDatabase(query, params);
        res.json(completedAttendances);
    } catch (error) {
        console.error('Erro ao buscar atendimentos concluídos:', error);
        res.status(500).json({ error: 'Erro ao buscar atendimentos concluídos' });
    }
});

// Adicionar novo endpoint para obter cidades
server.get('/getCities', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT city 
            FROM problems 
            WHERE city IS NOT NULL 
            ORDER BY city`;
        
        const cities = await queryDatabase(query);
        res.json(cities.map(row => row.city));
    } catch (error) {
        console.error('Erro ao buscar cidades:', error);
        res.status(500).json({ error: 'Erro ao buscar cidades' });
    }
});

// Adicionar novo endpoint para obter escolas por cidade
server.get('/getSchools', async (req, res) => {
    try {
        const { city } = req.query;
        let query = `
            SELECT DISTINCT school 
            FROM problems 
            WHERE school IS NOT NULL`;
        
        const params = [];
        if (city) {
            query += ` AND city = ?`;
            params.push(city);
        }
        
        query += ` ORDER BY school`;
        
        const schools = await queryDatabase(query, params);
        res.json(schools.map(row => row.school));
    } catch (error) {
        console.error('Erro ao buscar escolas:', error);
        res.status(500).json({ error: 'Erro ao buscar escolas' });
    }
});

// Adicionar ao módulo exports
module.exports = {
    startHydraBot,
    redirectToWhatsAppChat,
    server
};