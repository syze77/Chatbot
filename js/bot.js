/**
 * Bot de atendimento automatizado com integração WhatsApp
 * Responsável por gerenciar filas, mensagens e interações com usuários
 */

const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const express = require('express');
const { getDatabase } = require('./database.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Atualizar caminhos de recursos
const assetsPath = path.join(__dirname, '../assets');

/**
 * Configurações globais do sistema
 * MESSAGE_DELAY: Intervalo entre mensagens para evitar bloqueio do WhatsApp
 * MAX_ACTIVE_CHATS: Limite máximo de atendimentos simultâneos
 */
const MESSAGE_DELAY = 1000; // 1 segundo entre mensagens
const MAX_ACTIVE_CHATS = 3;

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

/**
 * Template de boas-vindas e coleta de informações
 * Solicita dados básicos do usuário para início do atendimento
 */
const defaultMessage = `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:

Nome:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Copie o template abaixo e preencha todas as informações corretamente para agilizar o seu atendimento.`;

// Inicializar Express
const server = express();

// Adicionar middleware JSON
server.use(express.json());

let activeChatsList = [];
let reportedProblems = [];

// Adicionar no início do arquivo, junto com outras variáveis globais
const messageHistory = new Map(); // Armazena histórico de mensagens por chat
const MESSAGE_HISTORY_LIMIT = 50; // Limite de mensagens para armazenar por chat
const DUPLICATE_MESSAGE_WINDOW = 60000; // Janela de 1 minuto para verificar duplicatas

/**
 * Inicializa o servidor do bot e configura eventos principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
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
            `Olá ${nextInLine.name}! Sua vez chegou. Estamos iniciando seu atendimento.`
          );
          await sendProblemOptions(botConnection, nextInLine.chatId);
        }

        // Atualizar usuários em espera e status
        await updateWaitingUsers(io);
        await sendStatusUpdateToMainProcess(io);

      } catch (error) {
        console.error('Erro ao finalizar atendimento:', error);
      }
    });
  });
}

// Ouvir mensagens recebidas
async function startListeningForMessages(conn, io) {
    conn.client.ev.on('newMessage', async (newMsg) => {
        const chatId = newMsg.result.chatId;

        try {
            // Verificar se o contato está na lista de ignorados
            const isIgnored = await new Promise((resolve, reject) => {
                getDatabase().get(
                    'SELECT id FROM ignored_contacts WHERE id = ?',
                    [chatId],
                    (err, row) => {
                        if (err) {
                            console.error('Erro ao verificar contato ignorado:', err);
                            resolve(false); // Em caso de erro, não ignorar o contato
                        } else {
                            resolve(!!row);
                        }
                    }
                );
            });

            if (isIgnored) {
                console.log(`Mensagem ignorada do contato ${chatId}`);
                return;
            }

            // Verifica se é uma mensagem de grupo (chatId geralmente termina com @g.us)
            if (chatId.endsWith('@g.us')) {
                return; // Ignora mensagens de grupos
            }

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
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    });

    conn.client.ev.on('chatClosed', async (chatId) => {
        // Ignora eventos de grupos
        if (!chatId.endsWith('@g.us')) {
            handleChatClosed(chatId, io);
        }
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
    try {
        // Verificar se é uma mensagem duplicada recente
        const chatHistory = messageHistory.get(chatId) || [];
        const now = Date.now();
        
        // Limpar mensagens antigas do histórico (mais de 1 minuto)
        while (chatHistory.length > 0 && now - chatHistory[0].timestamp > DUPLICATE_MESSAGE_WINDOW) {
            chatHistory.shift();
        }
        
        // Verificar se é uma mensagem duplicada
        const isDuplicate = chatHistory.some(msg => 
            msg.text === messageText && 
            (now - msg.timestamp) < DUPLICATE_MESSAGE_WINDOW
        );
        
        if (isDuplicate) {
            console.log(`Mensagem duplicada ignorada para ${chatId}: ${messageText}`);
            return;
        }
        
        // Adicionar mensagem ao histórico
        chatHistory.push({ text: messageText, timestamp: now });
        if (chatHistory.length > MESSAGE_HISTORY_LIMIT) {
            chatHistory.shift();
        }
        messageHistory.set(chatId, chatHistory);

        // Se o chat está sendo atendido por humano, ignorar
        if (humanAttendedChats.has(chatId)) {
            return;
        }

        const currentTopic = userCurrentTopic[chatId];
        
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
        console.error('Erro no processamento de mensagem:', error);
    }
}

// Nova função para obter estado do chat
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

// Nova função para envio formatado de mensagens
async function sendFormattedMessage(conn, chatId, type) {
    switch (type) {
        case 'template':
            await sendMessage(conn, chatId, defaultMessage);
            await sendMessage(conn, chatId, 'Nome:\nCidade:\nCargo:\nEscola:');
            break;
        // Adicionar outros tipos conforme necessário
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
             WHERE chatId = ? AND status = 'active'`,
            [chatId],
            io
        );

        // Obter próximo usuário na lista de espera
        const nextUser = await getNextInWaitingList();
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
                `Olá ${nextUser.name}! Um atendente está disponível agora para ajudá-lo.`
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Atualizar posições de todos os usuários em espera
        await updateWaitingUsers(io);
        
        // Buscar e transmitir status atualizado para todos os clientes
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
// Controle de mensagens recentes
const recentMessages = new Map();
const MESSAGE_TIMEOUT = 2000; // 2 segundos de intervalo mínimo entre mensagens idênticas

const sentMessages = new Map();
const DEBOUNCE_TIME = 2000; // 2 segundos

// Substituir a função sendMessage existente
async function sendMessage(conn, chatId, message) {
    // Criar fila para este chat se não existir
    if (!messageQueue.has(chatId)) {
        messageQueue.set(chatId, Promise.resolve());
    }

    // Adicionar mensagem à fila deste chat
    messageQueue.set(chatId, messageQueue.get(chatId).then(async () => {
        const messageKey = `${chatId}:${message}`;
        const now = Date.now();

        try {
            // Verificar se a mensagem foi enviada recentemente
            const chatHistory = messageHistory.get(chatId) || [];
            const isDuplicate = chatHistory.some(msg => 
                msg.text === message && 
                (now - msg.timestamp) < DUPLICATE_MESSAGE_WINDOW
            );

            if (isDuplicate) {
                console.log(`Evitando envio de mensagem duplicada para ${chatId}`);
                return;
            }

            // Adicionar ao histórico antes de enviar
            chatHistory.push({ text: message, timestamp: now });
            if (chatHistory.length > MESSAGE_HISTORY_LIMIT) {
                chatHistory.shift();
            }
            messageHistory.set(chatId, chatHistory);

            // Enviar a mensagem
            await conn.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });

            // Aguardar delay fixo entre mensagens
            await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            throw error;
        }
    }));

    // Retornar a promessa da fila
    return messageQueue.get(chatId);
}

// Envia opções de problema para o usuário
async function sendProblemOptions(conn, chatId) {
  const problemOptions = `Por favor, selecione o tipo de dificuldade que você está enfrentando:

1️⃣ Acesso ao sistema
2️⃣ Cadastro de aluno/outros
3️⃣ Dificuldade com o diário de classe
4️⃣ Dificuldade no registro de notas
5️⃣ Dificuldades com RFACE
6️⃣ Outro problema`;

  await sendMessage(conn, chatId, problemOptions);
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
      await sendSubProblemOptions(conn, chatId, 'Acesso ao sistema');
      break;
    case '2':
      await sendSubProblemOptions(conn, chatId, 'Cadastro de aluno/outros');
      break;
    case '3':
      await sendSubProblemOptions(conn, chatId, 'Dificuldade com o diário de classe');
      break;
    case '4':
      await sendSubProblemOptions(conn, chatId, 'Dificuldade no registro de notas');
      break;
    case '5':
      await sendMessage(conn, chatId, 'Por favor, descreva detalhadamente a dificuldade que você está enfrentando:');
      userCurrentTopic[chatId] = { 
        state: 'descricaoProblema',
        type: 'custom'
      };
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
    'Acesso ao sistema': `Selecione o subtópico:

1️⃣ Não consigo acessar o sistema
2️⃣ Sistema não está abrindo
3️⃣ Outro problema relacionado ao acesso

Digite 'voltar' para retornar ao menu anterior.`,
    'Cadastro de aluno/outros': `Selecione o subtópico:

1️⃣ Dificuldade ao inserir informações do estudante
2️⃣ Dificuldade ao inserir informações do funcionário
3️⃣ Outro problema relacionado ao cadastro

Digite 'voltar' para retornar ao menu anterior.`,
    'Dificuldade com o diário de classe': `Selecione o subtópico:

1️⃣ Dificuldade ao inserir notas
2️⃣ Dificuldade ao realizar um registro
3️⃣ Outro problema com o diário de classe

Digite 'voltar' para retornar ao menu anterior.`,
    'Dificuldade no registro de notas': `Selecione o subtópico:

1️⃣ Não consigo inserir as notas
2️⃣ As notas não estão sendo salvas corretamente
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
        const videoUrl = getVideoUrlForSubProblem(messageText, chatId); // Adicionar chatId aqui

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
    'Acesso ao sistema': {
      '1': 'Não consigo acessar o sistema',
      '2': 'Sistema não está abrindo',
      '3': 'Outro problema relacionado ao acesso'
    },
    'Cadastro de aluno/outros': {
      '1': 'Dificuldade ao inserir informações do estudante',
      '2': 'Dificuldade ao inserir informações do funcionário',
      '3': 'Outro problema relacionado ao cadastro'
    },
    'Dificuldade com o diário de classe': {
      '1': 'Dificuldade ao inserir notas',
      '2': 'Dificuldade ao realizar um registro',
      '3': 'Outro problema com o diário de classe'
    },
    'Dificuldade no registro de notas': {
      '1': 'Não consigo inserir as notas',
      '2': 'As notas não estão sendo salvas corretamente',
      '3': 'Outro problema com o registro de notas'
    }
  };
  return subProblemTexts[problem] ? subProblemTexts[problem][subProblem] : 'Outro problema';
}

// Obtém URL do vídeo para subproblema
function getVideoUrlForSubProblem(subProblem, chatId) { // Adicionar parâmetro chatId
  const mainProblem = userCurrentTopic[chatId].problem;
  
  const videoUrls = {
    'Falha no acesso ao sistema': {
      '1': 'https://www.youtube.com/watch?v=acesso-conta',
      '2': 'https://www.youtube.com/watch?v=sistema-nao-carrega',
      '3': 'https://www.youtube.com/watch?v=outros-problemas-acesso'
    },
    'Erro ao cadastrar aluno/funcionário': {
      '1': 'https://www.youtube.com/watch?v=cadastro-aluno',
      '2': 'https://www.youtube.com/watch?v=cadastro-funcionario',
      '3': 'https://www.youtube.com/watch?v=outros-problemas-cadastro'
    },
    'Problemas com o diário de classe': {
      '1': 'https://www.youtube.com/watch?v=insercao-notas-diario',
      '2': 'https://www.youtube.com/watch?v=visualizacao-registros',
      '3': 'https://www.youtube.com/watch?v=outros-problemas-diario'
    },
    'Falha no registro de notas': {
      '1': 'https://www.youtube.com/watch?v=registro-notas',
      '2': 'https://www.youtube.com/watch?v=salvar-notas',
      '3': 'https://www.youtube.com/watch?v=outros-problemas-notas'
    }
  };

  return videoUrls[mainProblem]?.[subProblem] || 'https://www.youtube.com/watch?v=ajuda-geral';
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
            'Problema registrado com sucesso. Um atendente analisará sua solicitação e entrará em contato em breve.'
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
            'Ocorreu um erro ao registrar seu problema. Por favor, tente novamente.'
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
                `Olá ${nextUser.name}! Sua vez chegou. Estamos iniciando seu atendimento.`
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Atualizar posições de todos os usuários em espera
        await updateWaitingUsers(io);
        
        // Buscar e transmitir atualização final de status
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
    const sanitizedChatId = chatId.replace('@c.us', '');
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${sanitizedChatId}`;
    require('electron').shell.openExternal(whatsappUrl);
}

async function updateWaitingUsers(io) {
    try {
        const waitingUsers = await new Promise((resolve, reject) => {
            getDatabase().all(
                'SELECT chatId, name FROM problems WHERE status = "waiting" ORDER BY date ASC',
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // Atualizar cada usuário em espera com sua nova posição
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

/**
 * Gera relatórios de atendimento em PDF ou Excel
 * Endpoint: /generateReport
 * Suporta filtros por período, cidade e escola
 */
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

        // Manipular formato de exportação Excel
        if (format === 'xlsx') {
            const Excel = require('exceljs');
            const workbook = new Excel.Workbook();
            const worksheet = workbook.addWorksheet('Atendimentos');

            // Configurar colunas
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

            // Adicionar linhas
            worksheet.addRows(problems);

            // Estilizar linha de cabeçalho
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

        // Geração de PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}-a-${end}.pdf`);
        doc.pipe(res);

        // Calcular estatísticas
        const totalAtendimentos = problems.length;
        const concluidos = problems.filter(p => p.status === 'completed').length;
        const tempoMedioMinutos = concluidos ? Math.round(
            problems.reduce((acc, p) => acc + (p.duration_minutes || 0), 0) / concluidos
        ) : 0;

        // Cabeçalho e estatísticas
        doc.fontSize(20).text('Relatório de Atendimentos', { align: 'center' }).moveDown(1);
        doc.fontSize(12).text(`Período: ${new Date(start).toLocaleDateString()} a ${new Date(end).toLocaleDateString()}`).moveDown(2);
        
        doc.fontSize(14).text('Estatísticas', { underline: true }).moveDown(1);
        doc.fontSize(12)
           .text(`Total de Atendimentos: ${totalAtendimentos}`)
           .text(`Atendimentos Concluídos: ${concluidos}`)
           .text(`Tempo Médio: ${Math.floor(tempoMedioMinutos/60)}h ${tempoMedioMinutos%60}min`)
           .moveDown(2);

        // Listagem de problemas
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

/**
 * API para obtenção de dados estatísticos
 * Fornece dados para gráficos de atendimento
 * Suporta filtros por cidade e escola
 */
server.get('/getChartData', async (req, res) => {
    try {
        const { city, school } = req.query;
        let conditions = ['description IS NOT NULL'];
        const params = [];
        
        if (city && city !== 'undefined' && city !== '') {
            conditions.push('problems.city = ?');
            params.push(city);
        }
        
        if (school && school !== 'undefined' && school !== '') {
            conditions.push('problems.school = ?');
            params.push(school);
        }
        
        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        
        console.log('Query conditions:', conditions); // Log de depuração
        console.log('Query parameters:', params); // Log de depuração
        
        // Query para dados mensais 
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

        // Query para dados semanais 
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
        const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

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


async function getRecentContacts(conn) {
    try {
        if (!conn || !conn.client) {
            throw new Error('Conexão não inicializada');
        }

        console.log('Iniciando busca de contatos...');

        try {
            // Tentar diferentes métodos para obter contatos
            let allContacts;
            
            // Método 1: Tentar getContacts direto
            try {
                allContacts = await conn.client.getAllContacts();
            } catch (err) {
                console.log('Método 1 falhou, tentando método 2...');
                // Método 2: Tentar via store
                allContacts = conn.client.store?.contacts;
            }

            if (!allContacts) {
                console.log('Método 2 falhou, tentando método 3...');
                // Método 3: Tentar via chats
                const chats = await conn.client.getChats();
                allContacts = chats.filter(chat => !chat.isGroup);
            }

            if (!allContacts || Object.keys(allContacts).length === 0) {
                console.warn('Nenhum contato encontrado após tentar todos os métodos');
                return [];
            }

            console.log('Contatos encontrados:', Object.keys(allContacts).length);

            // Processar contatos
            const contacts = Array.isArray(allContacts) ? allContacts : Object.values(allContacts);
            
            return contacts
                .filter(contact => {
                    return contact && 
                           contact.id && 
                           !contact.isGroup && 
                           contact.id.server !== 'g.us';
                })
                .map(contact => ({
                    id: contact.id._serialized || contact.id,
                    name: contact.name || contact.pushname || 'Sem nome',
                    number: contact.id.user || contact.id.split('@')[0],
                    lastMessageTime: contact.lastMessageTime || null,
                    imageUrl: contact.profilePicUrl || null,
                    description: contact.status || null
                }));

        } catch (error) {
            console.error('Erro ao processar contatos:', error);
            return [];
        }
    } catch (error) {
        console.error('Erro detalhado ao obter contatos:', error);
        console.error('Stack trace:', error.stack);
        return [];
    }
}

// Exportação das funcionalidades principais
module.exports = {
    startHydraBot,
    redirectToWhatsAppChat,
    server,
    getRecentContacts,
    getBotConnection: () => botConnection
};