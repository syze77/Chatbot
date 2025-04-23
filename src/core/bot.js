/**
 * Bot de atendimento automatizado com integração WhatsApp
 * Responsável por gerenciar filas, mensagens e interações com usuários
 */

const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const express = require('express');
const { getDatabase } = require('../utils/database.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { handleRecovery } = require('./recovery.js'); 
const { getRecentContacts } = require('./contacts/getcontacts.js');

//Importar mensagens e diálogos                                            
const greetings = require('./messages/greetings.json');
const dialogs = require('./messages/dialogs.json');
const errors = require('./messages/errors.json');
const finished = require('./messages/finished.json');
const commands = require('./messages/commands.json');
const logs = require('./messages/logs.json');

//Caminhos de recursos
const assetsPath = path.join(__dirname, '../assets');

const PROBLEM_MAPPINGS = require('./messages/problemMappings.json');

/**
 * Configurações globais do sistema
 */
const CONFIG = {
    MESSAGE_DELAY: 1500, 
    MAX_ACTIVE_CHATS: 3,
    MESSAGE_HISTORY_LIMIT: 50,
    DUPLICATE_MESSAGE_WINDOW: 30000,
    DEFAULT_HEADLESS: false
};

const RESPONSE_DELAY = {
    MIN: 30000, // 30 segundos
    MAX: 120000 // 120 segundos
};

/**
 * Estado global da aplicação
 * bot: Instância principal do bot
 * botConnection: Conexão atual com o WhatsApp
 * messageQueue: Fila de mensagens para garantir ordem de envio
 * isProcessingQueue: Flag de controle do processamento da fila
 * userCurrentTopic: Registro dos tópicos atuais de cada usuário
 * humanAttendedChats: Conjunto de chats em atendimento humano
 */
let bot;
let botConnection = null;
const messageQueue = new Map();
let isProcessingQueue = false;
let userCurrentTopic = {};
let humanAttendedChats = new Set();
const messageHistory = new Map();

// Add these two new declarations
const processedEvents = new Set();
const EVENT_TIMEOUT = 2000; 

/**
 * Template de boas-vindas e coleta de informações
 * Solicita dados básicos do usuário para início do atendimento
 */
const defaultMessage = greetings.welcome;

// Inicializar Express
const server = express();

// Adicionar middleware JSON
server.use(express.json());

/**
 * Inicializa o servidor do bot e configura eventos principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
async function startHydraBot(io) {
  try {
    bot = await hydraBot.initServer({
      puppeteerOptions: {
        headless: CONFIG.DEFAULT_HEADLESS,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    });

    console.log('Bot initialized successfully');
    setupEventListeners(io);
  } catch (error) {
    console.error(errors.connectionError);
  }

  io.on('connection', (socket) => {
    socket.on('attendProblem', async (data) => {
      try {
        const { chatId, attendantId } = data;
        
        // Criar um ID único para o evento
        const eventId = `attend_${chatId}_${Date.now()}`;
        
        // Verificar se este evento já foi processado recentemente
        if (processedEvents.has(eventId)) {
          return;
        }
        
        // Marcar evento como processado
        processedEvents.add(eventId);
        setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

        // Adicionar chat à lista de atendidos por humanos
        humanAttendedChats.add(chatId);

        // Atualizar status do problema no banco de dados
        await getDatabase().run(
          `UPDATE problems 
           SET status = 'active', 
               attendant_id = ? 
           WHERE chatId = ? AND status = 'pending'`,
          [attendantId, chatId]
        );

        // Enviar atualização de status para todos os clientes
        sendStatusUpdateToMainProcess(io);

        // Enviar mensagem de confirmação para o usuário
        if (botConnection) {
          await sendMessage(
            botConnection,
            chatId,
            greetings.attendantAssigned
          );
        }
      } catch (error) {
        console.error(errors.processError.replace('%s', error));
      }
    });

    socket.on('endChat', async (data) => {
      try {
        const { chatId, id } = data;
        
        // Criar um ID único para o evento
        const eventId = `end_${chatId}_${Date.now()}`;
        
        // Verificar se este evento já foi processado recentemente
        if (processedEvents.has(eventId)) {
          return;
        }
        
        // Marcar evento como processado
        processedEvents.add(eventId);
        setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

        // Remover chat da lista de atendidos por humanos
        humanAttendedChats.delete(chatId);

        // Atualizar status do chat para concluído no banco de dados
        await getDatabase().run(
          `UPDATE problems 
           SET status = 'completed', 
               date_completed = DATETIME('now')
           WHERE chatId = ? AND (id = ? OR status = 'active' OR status = 'pending')`,
          [chatId, id]
        );

        // Enviar mensagem de conclusão para o usuário
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

          // Resetar tópico do usuário para permitir novo atendimento
          delete userCurrentTopic[chatId];
        }

        // Processar próximo usuário na fila
        const nextInLine = await getNextInWaitingList();
        if (nextInLine) {
          await getDatabase().run(
            'UPDATE problems SET status = "active" WHERE chatId = ?',
            [nextInLine.chatId]
          );

          await sendMessage(
            botConnection,
            nextInLine.chatId,
            greetings.nextInLine.replace('%s', nextInLine.name)
          );
          await sendProblemOptions(botConnection, nextInLine.chatId);
        }

        // Atualizar usuários em espera e status
        try {
            await updateWaitingUsers(io);
        } catch (error) {
            console.error('Error updating waiting users:', error);
        }
        await sendStatusUpdateToMainProcess(io);

      } catch (error) {
        console.error(errors.processError.replace('%s', error));
      }
    });
  });
}

/**
 * Configura os event listeners principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
function setupEventListeners(io) {
  bot.on('connection', async (conn) => {
    if (conn.connect) {
      console.log(logs.connectionEstablished);
      botConnection = conn;
      startListeningForMessages(conn, io);
    } else {
      console.error(errors.connectionError);
    }
  });

  setupIpcListeners(io);
  setupSocketListeners(io);
}

function setupIpcListeners(io) {
  // Listener para redirecionamento de chat
  ipcMain.on('redirectToChat', (event, chatId) => {
    redirectToWhatsAppChat(chatId);
  });

  // Listener para envio de mensagem
  ipcMain.on('sendMessage', async (event, { chatId, message }) => {
    if (botConnection) {
      try {
        await sendMessage(botConnection, chatId, message);
      } catch (error) {
        console.error(errors.sendError.replace('%s', error));
      }
    }
  });
}

function setupSocketListeners(io) {
    console.log(logs.socketConfigured);
    
    // Adicionar handler para criação de cards
    io.on('connection', (socket) => {
        socket.on('createCard', async (data) => {
            try {
                console.log('Recebendo solicitação de criação de card:', data);
                const { chatId, cardLink } = data;
                
                const db = getDatabase();
                const query = `INSERT INTO problem_cards (chatId, card_link, card_status) 
                             VALUES (?, ?, 'pending')`;
                
                db.run(query, [chatId, cardLink], function(err) {
                    if (err) {
                        console.error('Erro ao criar card:', err);
                        socket.emit('cardError', { error: 'Erro ao salvar o card' });
                        return;
                    }
                    
                    // Buscar o card criado
                    db.get('SELECT * FROM problem_cards WHERE id = ?', [this.lastID], (err, card) => {
                        if (err) {
                            console.error('Erro ao buscar card criado:', err);
                            socket.emit('cardError', { error: 'Erro ao recuperar o card' });
                            return;
                        }
                        
                        console.log('Card criado com sucesso:', card);
                        io.emit('cardCreated', card);
                    });
                });
            } catch (error) {
                console.error('Erro ao processar criação do card:', error);
                socket.emit('cardError', { error: 'Erro interno do servidor' });
            }
        });

        socket.on('cardUpdated', async (card) => {
            try {
                io.emit('cardUpdated', card);
            } catch (error) {
                console.error('Erro ao atualizar card:', error);
            }
        });
    });
}

// Ouvir mensagens recebidas
async function startListeningForMessages(conn, io) {
    const processedMessageIds = new Set();
    const MESSAGE_EXPIRY = 60000;

    conn.client.ev.on('newMessage', async (newMsg) => {
        const chatId = newMsg.result.chatId;
        const messageId = newMsg.result.id || `${chatId}_${Date.now()}`;

        // Verificar se a mensagem já foi processada
        if (processedMessageIds.has(messageId)) {
            console.log(logs.processedMessage.replace('%s', messageId));
            return;
        }

        // Adicionar mensagem ao controle
        processedMessageIds.add(messageId);
        setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_EXPIRY);

        try {
            // Ignorar mensagens enviadas pelo bot
            if (newMsg.result.fromMe) {
                return;
            }

            // Ignorar mensagens de grupos
            if (chatId.endsWith('@g.us')) {
                return;
            }

            const messageText = newMsg.result.body.toLowerCase();

            // Verificar se é recuperação de senha
            const recoveryResponse = await handleRecovery(newMsg.result);
            if (recoveryResponse) {
                await sendMessage(conn, chatId, recoveryResponse);
                return;
            }

            // Continuar com o fluxo normal para outras mensagens
            const isIgnored = await checkIgnoredContact(chatId);
            if (isIgnored) {
                return;
            }

            // Processar mensagem normal
            if (messageText.startsWith("nome:")) {
                const userInfo = parseUserInfo(messageText);
                if (userInfo) {
                    await handleNewUser(conn, chatId, userInfo, io);
                } else {
                    await sendFormattedMessage(conn, chatId, 'template');
                }
            } else {
                await handleUserMessage(conn, chatId, messageText, io);
            }
            
        } catch (error) {
            console.error(errors.processError.replace('%s', error.message || 'Unknown error'));
        }
    });

    const originalSendMessage = sendMessage;
    global.sendMessage = async (conn, chatId, message) => {
        const messageId = `send_${chatId}_${Date.now()}`;
        
        if (processedMessageIds.has(messageId)) {
            console.log('Tentativa de envio duplicado evitada:', messageId);
            return;
        }

        processedMessageIds.add(messageId);
        setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_EXPIRY);

        return await originalSendMessage(conn, chatId, message);
    };

    conn.client.ev.on('chatClosed', async (chatId) => {
        // Ignora eventos de grupos
        if (!chatId.endsWith('@g.us')) {
            handleChatClosed(chatId, io);
        }
    });
}

async function checkIgnoredContact(chatId) {
    return new Promise((resolve) => {
        getDatabase().get(
            'SELECT id FROM ignored_contacts WHERE id = ?',
            [chatId],
            (err, row) => {
                if (err) {
                    console.error('Erro ao verificar contato ignorado:', err);
                    resolve(false);
                } else {
                    resolve(!!row);
                }
            }
        );
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
    const status = activeCount < CONFIG.MAX_ACTIVE_CHATS ? 'active' : 'waiting';
    
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
                greetings.attendantAvailable.replace('%s', userInfo.name)
            );
            await sendProblemOptions(conn, chatId);
            userCurrentTopic[chatId] = 'problema';
        } else {
            const position = await getWaitingPosition(chatId);
            await sendMessage(
                conn,
                chatId,
                greetings.queueUpdate.replace('%s', userInfo.name).replace('%d', position)
            );
        }
    } catch (error) {
        console.error(errors.processError.replace('%s', error));
        await sendMessage(conn, chatId, errors.tryAgainLater);
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
    try {
        const currentTopic = userCurrentTopic[chatId];
        
        // Lista de comandos que devem ignorar verificação de duplicidade
        const allowedDuplicates = [
            '1', '2', '3', '4', '5', '6',
            'voltar',
            'sim', 'não',
            'menu'
        ];
        
        // Verificar duplicação apenas se não for um comando permitido
        if (!allowedDuplicates.includes(messageText.toLowerCase())) {
            const chatHistory = messageHistory.get(chatId) || [];
            const now = Date.now();
            
            // Limpar mensagens antigas do histórico
            while (chatHistory.length > 0 && now - chatHistory[0].timestamp > CONFIG.DUPLICATE_MESSAGE_WINDOW) {
                chatHistory.shift();
            }
            
            // Verificar se é uma mensagem duplicada
            const isDuplicate = chatHistory.some(msg => 
                msg.text === messageText && 
                (now - msg.timestamp) < CONFIG.DUPLICATE_MESSAGE_WINDOW
            );
            
            if (isDuplicate) {
                console.log(`Mensagem duplicada ignorada para ${chatId}: ${messageText}`);
                return;
            }
            
            // Adicionar mensagem ao histórico
            chatHistory.push({ text: messageText, timestamp: now });
            if (chatHistory.length > CONFIG.MESSAGE_HISTORY_LIMIT) {
                chatHistory.shift();
            }
            messageHistory.set(chatId, chatHistory);
        }

        // Se o chat está sendo atendido por humano, ignorar
        if (humanAttendedChats.has(chatId)) {
            return;
        }
        
        // Verificar estado do chat no banco de dados
        const chatState = await getChatState(chatId);
        if (chatState && chatState.status === 'active') {
            // Se já existe um atendimento ativo, não iniciar novo
            if (!currentTopic && !messageText.toLowerCase().startsWith('nome:')) {
                console.log(`Chat ${chatId} já possui atendimento ativo`);
                return;
            }
        }
        
        // Resto do processamento de mensagem
        if (!currentTopic || messageText.toLowerCase().startsWith('nome:')) {
            if (messageText.toLowerCase().startsWith('nome:')) {
                const userInfo = parseUserInfo(messageText);
                if (userInfo) {
                    await handleNewUser(conn, chatId, userInfo, io);
                } else {
                    await sendFormattedMessage(conn, chatId, 'template');
                }
            } else {
                await sendFormattedMessage(conn, chatId, 'template');
            }
            return;
        }

        if (currentTopic.state === 'descricaoProblema') {
            await handleProblemDescription(conn, chatId, messageText, io);
            // Após descrever o problema, limpar o tópico para evitar respostas automáticas
            delete userCurrentTopic[chatId];
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
        console.error(errors.processError.replace('%s', error));
    }
}

//Função para obter estado do chat
async function getChatState(chatId) {
    return new Promise((resolve, reject) => {
        getDatabase().get(
            'SELECT status FROM problems WHERE chatId = ? ORDER BY date DESC LIMIT 1',
            [chatId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

function getRandomDelay() {
    return Math.floor(Math.random() * (RESPONSE_DELAY.MAX - RESPONSE_DELAY.MIN + 1) + RESPONSE_DELAY.MIN);
}

function getRandomWelcomeMessage() {
    const messages = greetings.welcome;
    if (!Array.isArray(messages) || messages.length === 0) {
        return 'Olá! Por favor, envie suas informações no formato:';
    }
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
}

async function sendFormattedMessage(conn, chatId, type) {
    switch (type) {
        case 'template':
            // Mantém delay inicial longo
            await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
            await sendMessage(conn, chatId, getRandomWelcomeMessage());
            // Reduz delay do template
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMessage(conn, chatId, greetings.template);
            break;
        default:
            await sendMessage(conn, chatId, getRandomWelcomeMessage());
    }
}

// Processa fechamento do chat
async function handleChatClosed(chatId, io) {
    try {
        // Marcar chat como concluído
        await updateDatabaseAndNotify(
            `UPDATE problems 
             SET status = 'completed', 
             date_completed = datetime('now') 
             WHERE chatId = ?`,
            [chatId],
            io
        );

        // Obter próximo usuário na lista de espera
        const nextUser = await getNextInWaitingList();
        
        // Verificar se existe próximo usuário
        if (nextUser) {
            // Atualizar status do próximo usuário
            await updateDatabaseAndNotify(
                `UPDATE problems 
                 SET status = 'active' 
                 WHERE chatId = ?`,
                [nextUser.chatId],
                io
            );

            // Enviar mensagem para o próximo usuário
            await sendMessage(
                botConnection,
                nextUser.chatId,
                greetings.nextInLine.replace('%s', nextUser.name)
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Atualizar posições de todos os usuários em espera
        await updateWaitingUsers(io);
        
        // Buscar e transmitir status atualizado para todos os clientes
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error(errors.processError.replace('%s', error));
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
// Controle de mensagens recentes
const recentMessages = new Map();
const MESSAGE_TIMEOUT = 2000; 

const sentMessages = new Map();
const DEBOUNCE_TIME = 2000; 


async function sendMessage(conn, chatId, message) {
    if (!messageQueue.has(chatId)) {
        messageQueue.set(chatId, Promise.resolve());
    }

    return messageQueue.get(chatId).then(async () => {
        const now = Date.now();
        const lastMessage = sentMessages.get(chatId);

        if (lastMessage && 
            lastMessage.text === message && 
            (now - lastMessage.timestamp) < DEBOUNCE_TIME) {
            console.log(logs.similarMessage.replace('%s', message));
            return;
        }

        try {
            if (!conn || !conn.client || !message) {
                throw new Error('Invalid connection or message');
            }

            await conn.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });

            sentMessages.set(chatId, {
                text: message,
                timestamp: now
            });

            await new Promise(resolve => setTimeout(resolve, CONFIG.MESSAGE_DELAY));
        } catch (error) {
            console.error(errors.sendError.replace('%s', error.message || 'Unknown error'));
            throw error;
        }
    });
}

// Envia opções de problema para o usuário
async function sendProblemOptions(conn, chatId) {
    await sendMessage(conn, chatId, dialogs.problemOptions);
}

/**
 * Manipula a seleção de problemas pelo usuário
 * Direciona para fluxos específicos baseado na escolha
 * @param {Object} conn - Conexão com WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} messageText - Texto da mensagem recebida
 * @param {Object} io - Instância do Socket.IO
 */
async function handleProblemSelection(conn, chatId, messageText, io) {
    switch (messageText) {
        case '1':
            await sendMessage(conn, chatId, dialogs.subProblems.accessSystem.title);
            userCurrentTopic[chatId] = { problem: 'Acesso ao sistema', stage: 'subproblema' };
            break;
        case '2':
            await sendMessage(conn, chatId, dialogs.subProblems.registration.title);
            userCurrentTopic[chatId] = { problem: 'Cadastro de aluno/funcionário', stage: 'subproblema' };
            break;
        case '3':
            await sendMessage(conn, chatId, dialogs.subProblems.classLog.title);
            userCurrentTopic[chatId] = { problem: 'Diário de classe', stage: 'subproblema' };
            break;
        case '4':
            await sendMessage(conn, chatId, dialogs.subProblems.studentMovement.title);
            userCurrentTopic[chatId] = { problem: 'Movimentação de Alunos', stage: 'subproblema' };
            break;
        case '5':
            await sendMessage(conn, chatId, dialogs.rfaceContact);
            await sendMessage(conn, chatId, greetings.template);
            delete userCurrentTopic[chatId]; 
            break;
        case '6':
            await sendMessage(conn, chatId, dialogs.describeIssue);
            userCurrentTopic[chatId] = { 
                state: 'descricaoProblema',
                type: 'custom'
            };
            break;
        case commands.backCommand:
            await sendProblemOptions(conn, chatId);
            break;
        default:
            await sendMessage(conn, chatId, errors.invalidOption);
    }
}

// Envia opções de subproblema para o usuário
async function sendSubProblemOptions(conn, chatId, problem) {
  const subProblemOptions = getSubProblemOptions(problem);
  userCurrentTopic[chatId] = { problem, stage: 'subproblema' }; 
  await sendMessage(conn, chatId, subProblemOptions);
}

function getSubProblemOptions(problem) {
    const key = PROBLEM_MAPPINGS[problem];
    if (key && dialogs.subProblems[key]) {
        return `${dialogs.subProblems[key].title}\n\n${commands.backMessage}`;
    }
    return errors.invalidOption;
}
function getSubProblemText(problem, subProblem) {
    const key = PROBLEM_MAPPINGS[problem];
    if (key && dialogs.subProblems[key]?.options[subProblem]) {
        return dialogs.subProblems[key].options[subProblem];
    }
    return 'Outro problema';
}

function getVideoUrlForSubProblem(subProblem, chatId) {
    const mainProblem = userCurrentTopic[chatId].problem;
    const key = PROBLEM_MAPPINGS[mainProblem];
    if (key && dialogs.subProblems[key]?.videos[subProblem]) {
        return dialogs.subProblems[key].videos[subProblem];
    }
    return errors.invalidOption;
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
        const problemKey = PROBLEM_MAPPINGS[mainProblem];

        // Verifica se é uma opção válida para o problema específico
        if (!problemKey || !dialogs.subProblems[problemKey]?.options[messageText]) {
            await sendMessage(conn, chatId, errors.invalidOption);
            return;
        }

        const subProblemText = dialogs.subProblems[problemKey].options[messageText];
        const videoUrl = dialogs.subProblems[problemKey].videos[messageText];

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

        await sendMessage(conn, chatId, dialogs.watchVideo.replace('%s', videoUrl));
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

// Processa feedback do vídeo
async function handleVideoFeedback(conn, chatId, messageText, io) {
    try {
        if (messageText.toLowerCase() === 'sim') {
            await sendMessage(conn, chatId, finished.helpfulVideo);
            await sendMessage(conn, chatId, greetings.template);
            // Resetar o tópico para permitir novo atendimento
            delete userCurrentTopic[chatId];
            await closeChat(chatId, io);
        } else if (messageText.toLowerCase() === 'não') {
            await sendMessage(conn, chatId, dialogs.describeIssue);
            userCurrentTopic[chatId] = {
                state: 'descricaoProblema',
                previousState: 'videoFeedback'
            };
        } else {
            await sendMessage(conn, chatId, errors.invalidYesNo);
        }
    } catch (error) {
        console.error('Erro em handleVideoFeedback:', error);
    }
}

// Processa descrição do problema
async function handleProblemDescription(conn, chatId, messageText, io) {
    try {
        // Buscar informações do usuário
        const userInfo = await new Promise((resolve, reject) => {
            getDatabase().get(
                'SELECT name, city, position, school FROM problems WHERE chatId = ? ORDER BY date DESC LIMIT 1',
                [chatId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) reject(new Error('Usuário não encontrado'));
                    else resolve(row);
                }
            );
        });

        const date = new Date().toISOString();
        const description = messageText;

        // Criar novo registro de problema
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
                    description,
                    'pending',
                    date
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Notificar o front-end sobre o novo problema
        io.emit('userProblem', description, chatId, userInfo.name);

        // Enviar confirmação para o usuário
        await sendMessage(
            conn, 
            chatId, 
            finished.problemRegistered
        );

        // Atualizar status
        await sendStatusUpdateToMainProcess(io);

        // Adicionar à lista de chats atendidos para parar respostas automáticas
        humanAttendedChats.add(chatId);
        
        // Limpar o tópico do usuário
        delete userCurrentTopic[chatId];

    } catch (error) {
        console.error('Erro em handleProblemDescription:', error);
        await sendMessage(
            conn, 
            chatId, 
            errors.tryAgainLater
        );
        userCurrentTopic[chatId] = 'problema';
        await sendProblemOptions(conn, chatId);
    }
}

// Salvar informações do cliente no banco de dados
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

// Salvar problema no banco de dados
function saveProblemToDatabase(problemData, io) {
  getDatabase().run(`UPDATE problems SET description = ?, date = ? WHERE id = ?`, 
    [problemData.description, problemData.date, problemData.problemId], 
    function(err) {
      if (err) {
        console.error('Erro ao salvar problema:', err.message);
        return;
      }
      console.log(`Descrição do problema atualizada para id ${problemData.problemId}`);
      io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
    });
}

// Marcar problema como concluído no banco de dados
function markProblemAsCompleted(problemId, io) {
  getDatabase().run(`UPDATE problems SET status = 'completed' WHERE id = ?`, [problemId], function(err) {
    if (err) {
      console.error('Erro ao marcar problema como concluído:', err.message);
      return;
    }
    console.log(`Problema com id ${problemId} marcado como concluído.`);
    io.emit('statusUpdate', { activeChats: activeChatsList, waitingList: getWaitingList(), problems: reportedProblems });
  });
}

// Enviar atualização de status para o processo principal
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

        // Emitir atualização para todos os clientes
        io.emit('statusUpdate', statusData);
        
        // Log de depuração
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

// Enviar problema para o front-end
function sendProblemToFrontEnd(problemData) {
  if (problemData.description.startsWith('Subtópico:')) {
    return;
  }
  ipcMain.emit('userProblem', null, problemData.description, problemData.chatId, problemData.name);
}

// Fechar o chat
async function closeChat(chatId, io) {
    try {
        // Primeiro atualiza o banco
        await getDatabase().run(
            `UPDATE problems 
             SET status = 'completed', 
             date_completed = datetime('now') 
             WHERE chatId = ?`,
            [chatId]
        );

        // Busca status atualizado imediatamente após a mudança
        const [active, waiting, pending, completed] = await Promise.all([
            queryDatabase('SELECT * FROM problems WHERE status = "active" ORDER BY date DESC'),
            queryDatabase('SELECT * FROM problems WHERE status = "waiting" ORDER BY date ASC'),
            queryDatabase('SELECT * FROM problems WHERE status = "pending" ORDER BY date DESC'),
            queryDatabase('SELECT * FROM problems WHERE status = "completed" ORDER BY date_completed DESC LIMIT 10')
        ]);

        // Emite atualização com dados reais
        io.emit('statusUpdate', {
            activeChats: active,
            waitingList: waiting,
            problems: pending,
            completedChats: completed
        });

        // Processa próximo usuário na fila
        const nextUser = await getNextInWaitingList();
        if (nextUser) {
            await getDatabase().run(
                `UPDATE problems 
                 SET status = 'active' 
                 WHERE chatId = ?`,
                [nextUser.chatId]
            );

            await sendMessage(
                botConnection,
                nextUser.chatId,
                greetings.nextInLine.replace('%s', nextUser.name)
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Atualiza posições dos usuários em espera
        await updateWaitingUsers(io);

    } catch (error) {
        console.error(errors.processError.replace('%s', error));
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


async function attendNextUserInQueue(conn, io) {
    const nextUser = activeChatsList.find(chat => chat.isWaiting);
    if (nextUser) {
        nextUser.isWaiting = false;
        await sendMessage(
            conn, 
            nextUser.chatId, 
            commands.nextInQueueMessage.replace('%s', nextUser.name)
        );
        await sendProblemOptions(conn, nextUser.chatId);
        userCurrentTopic[nextUser.chatId] = 'problema';
        sendStatusUpdateToMainProcess(io);
    }
}

// Atender o próximo usuário na fila
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

// Obter a lista de espera
function getWaitingList() {
  return activeChatsList.filter(chat => chat.isWaiting);
}

function redirectToWhatsAppChat(chatId) {
    try {
        // Remove '@c.us' se presente e remove quaisquer caracteres não numéricos
        const cleanNumber = chatId.replace('@c.us', '').replace(/\D/g, '');
        
        // Verifica se o número está vazio após a limpeza
        if (!cleanNumber) {
            console.error('ID de chat inválido:', chatId);
            return;
        }

        const whatsappUrl = `https://wa.me/${cleanNumber}`;
        console.log('Redirecionando para:', whatsappUrl);
        require('electron').shell.openExternal(whatsappUrl);
    } catch (error) {
        console.error('Erro ao redirecionar para WhatsApp:', error);
    }
}

async function updateWaitingUsers(io) {
    try {
        const waitingUsers = await new Promise((resolve, reject) => {
            getDatabase().all(
                `SELECT chatId, name, date 
                 FROM problems 
                 WHERE status = "waiting" 
                 ORDER BY date ASC`,
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // Para cada usuário em espera, calcular e enviar sua posição atual
        for (let i = 0; i < waitingUsers.length; i++) {
            const user = waitingUsers[i];
            const currentPosition = i + 1; // Posição baseada no índice + 1
            
            const message = greetings.queueUpdate.replace('%s', user.name).replace('%d', currentPosition);
            
            if (botConnection) {
                await sendMessage(botConnection, user.chatId, message);
            }
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

module.exports = {
    startHydraBot,
    redirectToWhatsAppChat,
    server,
    getRecentContacts,
    getBotConnection: () => botConnection
};
