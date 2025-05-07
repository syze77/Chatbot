/**
 * Bot de atendimento automatizado com integração WhatsApp
 * Responsável por gerenciar filas, mensagens e interações com usuários
 */

const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { handleRecovery } = require('./recovery.js'); 
const { getRecentContacts } = require('./contacts/getcontacts.js');
const ServiceFeedback = require('./modules/ServiceFeedback');
const User = require('../models/entities/user.js');
const School = require('../models/entities/school.js');
const Call = require('../models/entities/call.js');
const UserTelephone = require('../models/entities/usertelephone.js');
const { Op } = require('sequelize');

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
        await Call.update(
          { status: 'ACTIVE', attendant_id: attendantId },
          { where: { chatId, status: 'PENDING' } }
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
        const { chatId, id, requestFeedback } = data;
        
        const eventId = `end_${chatId}_${Date.now()}`;
        if (processedEvents.has(eventId)) {
          return;
        }
        
        processedEvents.add(eventId);
        setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

        humanAttendedChats.delete(chatId);

        // Atualizar status no banco de dados
        await Call.update(
          { status: 'COMPLETED', dateTimeFinish: new Date() },
          { where: { chatId, [Op.or]: [{ id }, { status: 'ACTIVE' }, { status: 'PENDING' }] } }
        );

        delete userCurrentTopic[chatId];

        // Atualizar status
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
    
    io.on('connection', (socket) => {
        socket.on('createCard', async (data) => {
            try {
                console.log('Recebendo solicitação de criação de card:', data);
                const { chatId, cardLink } = data;
                
                const newCard = await Call.create({
                  chatId,
                  card_link: cardLink,
                  card_status: 'PENDING'
                });

                console.log('Card criado com sucesso:', newCard);
                io.emit('cardCreated', newCard);
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

        socket.on('endChat', async (data) => {
            try {
                const { chatId, id, requestFeedback } = data;
                
                const eventId = `end_${chatId}_${Date.now()}`;
                if (processedEvents.has(eventId)) return;
                
                processedEvents.add(eventId);
                setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

                humanAttendedChats.delete(chatId);

                // 1. Atualizar status para completed imediatamente
                await Call.update(
                  { status: 'COMPLETED', dateTimeFinish: new Date() },
                  { where: { chatId, [Op.or]: [{ id }, { status: 'ACTIVE' }, { status: 'PENDING' }] } }
                );

                // 2. Emitir atualização imediata da UI
                const statusData = await fetchCurrentStatus();
                io.emit('statusUpdate', statusData);
                io.emit('chatCompleted', { chatId });

                delete userCurrentTopic[chatId];

                // 3. Solicitar feedback apenas se explicitamente solicitado
                if (requestFeedback && botConnection && !userCurrentTopic[chatId]) {
                    setTimeout(async () => {
                        await ServiceFeedback.requestFeedback(botConnection, chatId);
                        userCurrentTopic[chatId] = 'serviceFeedback';
                    }, 500);
                }

            } catch (error) {
                console.error(errors.processError.replace('%s', error));
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

            const messageText = newMsg.result.body.trim();

            // --- INÍCIO DA TRIAGEM: Solicitar CPF ---
            if (!userCurrentTopic[chatId]) {
                // (mensagem aleatória)
                await sendMessage(conn, chatId, getRandomWelcomeMessage());
                userCurrentTopic[chatId] = { state: 'awaitingCpf' };
                return;
            }

            // --- Recebe CPF e busca usuário ---
            if (userCurrentTopic[chatId]?.state === 'awaitingCpf') {
                const cpf = messageText.replace(/\D/g, '');
                if (!cpf || cpf.length < 11) {
                    await sendMessage(conn, chatId, errors.invalidCpf);
                    return;
                }
                // Buscar usuário pelo CPF
                const user = await User.findOne({ where: { cpf } });
                if (!user) {
                    await sendMessage(conn, chatId, errors.userNotFound);
                    return;
                }

                // Buscar escolas vinculadas (tabela de associação)
                const userSchools = await user.getSchools();
                if (!userSchools || userSchools.length === 0) {
                    await sendMessage(conn, chatId, errors.noSchoolLinked);
                    return;
                }

                // Montar lista de escolas/cidades
                if (userSchools.length === 1) {
                    // Só uma escola/cidade, seguir fluxo
                    const school = userSchools[0];
                    userCurrentTopic[chatId] = {
                        state: 'cpfTriaged',
                        userId: user.id,
                        userName: user.name,
                        userType: user.type,
                        schoolId: school.id,
                        schoolName: school.name,
                        city: school.client
                    };
                    await sendMessage(conn, chatId, greetings.confirmSchool.replace('%s', `${school.name} - ${school.client}`));
                    // Prosseguir para o fluxo normal (ex: pedir problema)
                    await sendProblemOptions(conn, chatId);
                    userCurrentTopic[chatId] = 'problema';
                } else {
                    // Múltiplas escolas/cidades, pedir escolha
                    let msg = greetings.chooseSchool + '\n';
                    userSchools.forEach((school, idx) => {
                        msg += `${idx + 1}. ${school.name} - ${school.client}\n`;
                    });
                    await sendMessage(conn, chatId, msg.trim());
                    userCurrentTopic[chatId] = {
                        state: 'awaitingSchoolSelection',
                        userId: user.id,
                        userName: user.name,
                        userType: user.type,
                        schools: userSchools.map(s => ({
                            id: s.id,
                            name: s.name,
                            city: s.client
                        }))
                    };
                }
                return;
            }

            // --- Recebe escolha da escola/cidade ---
            if (userCurrentTopic[chatId]?.state === 'awaitingSchoolSelection') {
                const selection = parseInt(messageText, 10);
                const schools = userCurrentTopic[chatId].schools;
                if (!selection || selection < 1 || selection > schools.length) {
                    await sendMessage(conn, chatId, errors.invalidSchoolSelection);
                    return;
                }
                const chosen = schools[selection - 1];
                userCurrentTopic[chatId] = {
                    state: 'cpfTriaged',
                    userId: userCurrentTopic[chatId].userId,
                    userName: userCurrentTopic[chatId].userName,
                    userType: userCurrentTopic[chatId].userType,
                    schoolId: chosen.id,
                    schoolName: chosen.name,
                    city: chosen.city
                };
                await sendMessage(conn, chatId, greetings.confirmSchool.replace('%s', `${chosen.name} - ${chosen.city}`));
                // Prosseguir para o fluxo normal (ex: pedir problema)
                await sendProblemOptions(conn, chatId);
                userCurrentTopic[chatId] = 'problema';
                return;
            }

            // --- Fluxo normal após triagem ---
            await handleUserMessage(conn, chatId, messageText, io);
            
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
    const ignored = await User.findOne({ where: { id: chatId, ignored: true } });
    return !!ignored;
}

/**
 * Atualiza o banco de dados e notifica os clientes
 * @param {string} query - Query SQL
 * @param {Array} params - Parâmetros da query
 * @param {Object} io - Objeto Socket.IO
 * @returns {Promise<number>} ID do registro inserido/atualizado
 */
async function updateDatabaseAndNotify(fieldsToUpdate, condition, io) {
    await Call.update(fieldsToUpdate, { where: condition });
    const statusData = await fetchCurrentStatus();
    io.emit('statusUpdate', statusData);
}

// Função auxiliar para buscar status atual
async function fetchCurrentStatus() {
    const [active, waiting, pending] = await Promise.all([
        Call.findAll({ where: { status: 'ACTIVE' }, order: [['createDate', 'DESC']], limit: 3 }),
        Call.findAll({ where: { status: 'WAITING' }, order: [['createDate', 'ASC']] }),
        Call.findAll({ where: { status: 'PENDING' }, order: [['createDate', 'DESC']] })
    ]);

    return {
        activeChats: active,
        waitingList: waiting,
        problems: pending
    };
}

// Processa novo usuário
async function handleNewUser(conn, chatId, userInfo, io) {
    const activeCount = await Call.count({ where: { status: 'ACTIVE' } });
    const status = activeCount < CONFIG.MAX_ACTIVE_CHATS ? 'ACTIVE' : 'WAITING';
    
    try {
        await Call.create({
            chatId,
            name: userInfo.name,
            position: userInfo.position,
            city: userInfo.city,
            school: userInfo.school,
            status,
            createDate: new Date()
        });

        if (status === 'ACTIVE') {
            await sendMessage(
                conn, 
                chatId, 
                greetings.attendantAvailable.replace('%s', userInfo.name)
            );
            await sendProblemOptions(conn, chatId);
            userCurrentTopic[chatId] = 'problema';
        } else {
            const waitingChats = await Call.findAll({
                where: { status: 'WAITING' },
                order: [['createDate', 'ASC']],
                attributes: ['chatId']
            });
            const position = waitingChats.findIndex(row => row.chatId === chatId) + 1;
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
    return await Call.count({ where: { status: 'ACTIVE' } });
}

// Função para obter estado do chat
async function getChatState(chatId) {
    return await Call.findOne({
        where: { chatId },
        order: [['createDate', 'DESC']],
        attributes: ['status']
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
    // Apenas envia mensagem de boas-vindas aleatória, pois não há mais fluxo de template
    await sendMessage(conn, chatId, getRandomWelcomeMessage());
}

// Processa fechamento do chat
async function handleChatClosed(chatId, io) {
    try {
        // Marcar chat como concluído
        await Call.update(
            { status: 'COMPLETED', dateTimeFinish: new Date() },
            { where: { chatId } }
        );

        // Obter próximo usuário na lista de espera
        const nextUser = await Call.findOne({
            where: { status: 'WAITING' },
            order: [['createDate', 'ASC']]
        });
        
        // Verificar se existe próximo usuário
        if (nextUser) {
            // Atualizar status do próximo usuário
            await Call.update(
                { status: 'ACTIVE' },
                { where: { chatId: nextUser.chatId } }
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
            delete userCurrentTopic[chatId];
            // Emitir evento endChat
            io.emit('endChat', { chatId });
            await closeChat(chatId, io);
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
        const userInfo = await Call.findOne({
            where: { chatId },
            attributes: ['name', 'city', 'position', 'school']
        });

        if (!userInfo) {
            throw new Error('Usuário não encontrado');
        }

        // Criar novo registro de problema
        const problemDescription = `${mainProblem} - ${subProblemText}`;
        const date = new Date();

        await Call.create({
            chatId,
            name: userInfo.name,
            city: userInfo.city,
            position: userInfo.position,
            school: userInfo.school,
            description: problemDescription,
            status: 'PENDING',
            createDate: date
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
            await ServiceFeedback.requestFeedback(botConnection, chatId);
            userCurrentTopic[chatId] = 'serviceFeedback';
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
        // Get user info for possible new problem creation
        const userInfo = await Call.findOne({
            where: { chatId },
            order: [['createDate', 'DESC']],
            attributes: ['name', 'city', 'position', 'school']
        });

        if (!userInfo) {
            throw new Error('Usuário não encontrado');
        }

        const date = new Date();
        const description = messageText;

        // Check if this is from video feedback "não" response or option 6
        const isFromVideo = userCurrentTopic[chatId]?.previousState === 'videoFeedback';

        if (isFromVideo) {
            // Update the most recent problem for video feedback case
            const existingProblem = await Call.findOne({
                where: { chatId },
                order: [['createDate', 'DESC']]
            });

            if (existingProblem) {
                await Call.update(
                    { description, createDate: date },
                    { where: { id: existingProblem.id } }
                );

                io.emit('userProblem', {
                    description,
                    chatId,
                    name: existingProblem.name,
                    city: existingProblem.city,
                    position: existingProblem.position,
                    school: existingProblem.school
                });
            }
        } else {
            // Create new problem record for option 6
            await Call.create({
                chatId,
                name: userInfo.name,
                city: userInfo.city,
                position: userInfo.position,
                school: userInfo.school,
                description,
                status: 'PENDING',
                createDate: date
            });

            // Emit new problem event
            io.emit('userProblem', {
                description,
                chatId,
                name: userInfo.name,
                city: userInfo.city,
                position: userInfo.position,
                school: userInfo.school
            });
        }

        // Common actions for both cases
        await sendMessage(
            conn, 
            chatId, 
            finished.problemRegistered
        );

        await sendStatusUpdateToMainProcess(io);
        humanAttendedChats.add(chatId);
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
async function saveClientInfoToDatabase(userInfo, chatId, status, io) {
    await Call.create({
        chatId,
        name: userInfo.name,
        position: userInfo.position,
        city: userInfo.city,
        school: userInfo.school,
        status,
        createDate: new Date()
    });
    io.emit('statusUpdate');
}

// Salvar problema no banco de dados
async function saveProblemToDatabase(problemData, io) {
    await Call.update(
        { description: problemData.description, createDate: problemData.date },
        { where: { id: problemData.problemId } }
    );
    io.emit('statusUpdate');
}

// Marcar problema como concluído no banco de dados
async function markProblemAsCompleted(problemId, io) {
    await Call.update(
        { status: 'COMPLETED' },
        { where: { id: problemId } }
    );
    io.emit('statusUpdate');
}

// Enviar atualização de status para o processo principal
async function sendStatusUpdateToMainProcess(io) {
    try {
        const [active, waiting, pending, completed] = await Promise.all([
            Call.findAll({ where: { status: 'ACTIVE' }, order: [['createDate', 'DESC']] }),
            Call.findAll({ where: { status: 'WAITING' }, order: [['createDate', 'ASC']] }),
            Call.findAll({ where: { status: 'PENDING' }, order: [['createDate', 'DESC']] }),
            Call.findAll({ where: { status: 'COMPLETED' }, order: [['dateTimeFinish', 'DESC']], limit: 10 })
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
        // 1. Atualizar status para completed imediatamente
        await Call.update(
            { status: 'COMPLETED', dateTimeFinish: new Date() },
            { where: { chatId } }
        );

        // 2. Emitir atualização imediata da UI
        const statusData = await ServiceFeedback.getStatusUpdate();
        io.emit('statusUpdate', statusData);

        // 4. Processa próximo usuário na fila
        const nextUser = await Call.findOne({
            where: { status: 'WAITING' },
            order: [['createDate', 'ASC']]
        });

        if (nextUser) {
            await Call.update(
                { status: 'ACTIVE' },
                { where: { chatId: nextUser.chatId } }
            );

            await sendMessage(
                botConnection,
                nextUser.chatId,
                greetings.nextInLine.replace('%s', nextUser.name)
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // 5. Atualiza posições dos usuários em espera
        await updateWaitingUsers(io);

    } catch (error) {
        console.error(errors.processError.replace('%s', error));
    }
}

// Função para obter próximo da fila
async function getNextInWaitingList() {
    return await Call.findOne({
        where: { status: 'WAITING' },
        order: [['createDate', 'ASC']]
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
        const waitingUsers = await Call.findAll({
            where: { status: 'WAITING' },
            order: [['createDate', 'ASC']],
            attributes: ['chatId', 'name', 'date']
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
        'ACTIVE': 'Em atendimento',
        'WAITING': 'Em espera',
        'COMPLETED': 'Concluído',
        'PENDING': 'Pendente'
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
