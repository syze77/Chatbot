// Atualizar para usar paths relativos para módulos
const socket = io('http://localhost:3000');

// Evento de conexão com o servidor WebSocket
socket.on('connect', () => {
    console.log('Conectado ao servidor de WebSocket');
});

// Evento de atualização de status
socket.on('statusUpdate', (data) => {
    console.log('Atualização de status recebida:', data);
    if (data && typeof data === 'object') {
        updateUI(data);
        // Não atualizar cores dos gráficos aqui
    }
});

// Evento de problema do usuário
socket.on('userProblem', (problemData) => {
    console.log('Problema do usuário recebido:', problemData);
    
    // Se problemData for uma string, converta para objeto
    const data = typeof problemData === 'string' ? 
        { description: problemData } : problemData;
    
    // Exibir o problema na interface
    displayProblem(data.description, data.chatId, data.name);
    
    // Estrutura correta dos dados para a notificação
    const notificationData = {
        chatId: data.chatId,
        name: data.name,
        position: data.position,
        school: data.school,
        description: data.description,
        city: data.city
    };

    // Log de depuração para verificar os dados
    console.log('Dados formatados para notificação:', notificationData);
    
    showNotification('Novo Problema Relatado', notificationData);
});

// Evento de novos dados
socket.on('new-data', (data) => {
    console.log('Novos dados recebidos:', data); // Log de novos dados
    updateUI(data);
});

// Evento de novo problema relatado
socket.on('newProblemReported', (problemData) => {
    console.log('Novo problema relatado:', problemData); // Log de novo problema
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    
    // Criar objeto de dados estruturado para a notificação
    const notificationData = {
        description: problemData.description,
    };
    
    // Usar o objeto estruturado em vez da string
    showNotification('Novo Problema Relatado', notificationData);
});

// Atualizar caminhos de recursos de áudio
const notificationSound = document.getElementById('notification-sound');
const activeChatList = document.getElementById('active-chat-list');
const waitingListContainer = document.getElementById('waiting-list-container');
const problemListContainer = document.getElementById('problem-list-container');

// Atualizar a UI com os dados mais recentes
function updateUI(data) {
    console.log('Atualizando UI com dados:', data);

    // Garantir que temos um objeto de dados válido
    const processedData = {
        activeChats: Array.isArray(data.activeChats) ? data.activeChats : [],
        waitingList: Array.isArray(data.waitingList) ? data.waitingList : [],
        problems: Array.isArray(data.problems) ? data.problems : []
    };

    // Atualizar cada seção
    updateSection(processedData.activeChats, activeChatList, 'active');
    updateSection(processedData.waitingList, waitingListContainer, 'waiting', true);
    updateSection(processedData.problems, problemListContainer, 'problem');

    // Logs de depuração
    console.log('Atendimentos ativos:', processedData.activeChats);
    console.log('Lista de espera:', processedData.waitingList);
    console.log('Problemas:', processedData.problems);
}

// Exibir um problema relatado
function displayProblem(description, chatId, userName) {
    const emptyMessage = problemListContainer.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const existingProblem = Array.from(problemListContainer.children).find(
        item => item.dataset.chatId === chatId
    );
    
    if (existingProblem) {
        return;
    }
    
    const problemItem = document.createElement('div');
    problemItem.classList.add('chat-item', 'problem-item');
    problemItem.dataset.chatId = chatId;
    
    const content = `
        <div class="item-content">
            <div class="user-info">
                <strong>${userName}</strong>
                <span class="status-badge problem">Problema</span>
            </div>
            <div class="problem-description-container">
                <i class="fas fa-exclamation-circle"></i>
                <span class="problem-description">${description}</span>
            </div>
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm attend-btn">
                    <i class="fas fa-headset"></i> Atender
                </button>
            </div>
        </div>
    `;
    
    problemItem.innerHTML = content;
    
    if (chatId) {
        problemItem.addEventListener('click', () => {
            window.electron.openWhatsAppChat(chatId);
        });
        problemItem.style.cursor = 'pointer';
    }
    
    const attendBtn = problemItem.querySelector('.attend-btn');
    if (attendBtn) {
        attendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleAttendProblem({
                chatId: chatId,
                name: userName,
                description: description
            });
        });
    }
    
    problemListContainer.insertBefore(problemItem, problemListContainer.firstChild);
}

// Funções de notificação atualizadas
async function showNotification(title, data) {
    try {
        // Verificar contexto seguro
        if (!window.isSecureContext) {
            console.error('Notificações requerem contexto seguro (HTTPS ou localhost)');
            return;
        }

        // Verificar suporte a notificações
        if (!('Notification' in window)) {
            console.error('Este navegador não suporta notificações');
            return;
        }

        // Solicitar permissão se necessário
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Permissão de notificação negada');
                return;
            }
        }

        // Criar e mostrar notificação
        if (Notification.permission === 'granted') {
            createNotification(title, data);
        }
    } catch (error) {
        console.error('Erro ao mostrar notificação:', error);
    }
}

// Atualizar a função createNotification
function createNotification(title, data) {
    try {
        console.log('Dados recebidos na notificação:', data); // Log de depuração

        // Verificar se data é uma string ou objeto
        const isStringData = typeof data === 'string';
        
        // Formatar o corpo da notificação de forma mais legível
        let notificationBody;
        
        if (isStringData) {
            notificationBody = data;
        } else {
            // Criar array apenas com informações disponíveis
            const lines = [];
            if (data.name) lines.push(`Nome: ${data.name}`);
            if (data.position) lines.push(`Cargo: ${data.position}`);
            if (data.school) lines.push(`Escola: ${data.school}`);
            if (data.city) lines.push(`Cidade: ${data.city}`);
            if (data.description) lines.push(`Problema: ${data.description}`);
            
            notificationBody = lines.join('\n');
        }

        console.log('Corpo da notificação:', notificationBody); // Log de depuração

        const options = {
            body: notificationBody,
            icon: './assets/notification-icon.png',
            badge: './assets/badge-icon.png',
            tag: `problem-${isStringData ? Date.now() : data.chatId}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
            data: data
        };

        const notification = new Notification(title, options);

        notification.onclick = function(event) {
            event.preventDefault();
            window.focus();
            
            if (!isStringData && data.chatId) {
                const problemElement = document.querySelector(`[data-chat-id="${data.chatId}"]`);
                if (problemElement) {
                    problemElement.scrollIntoView({ behavior: 'smooth' });
                    problemElement.classList.add('highlight');
                    
                    setTimeout(() => {
                        problemElement.classList.remove('highlight');
                    }, 2000);
                }
            }
            
            this.close();
        };

        notification.onshow = function() {
            playNotificationSound();
            showBellIcon();
        };

        // Fechar automaticamente após 30 segundos
        setTimeout(() => {
            notification.close();
        }, 30000);

        return notification;
    } catch (error) {
        console.error('Erro ao criar notificação:', error);
        return null;
    }
}

function playNotificationSound() {
    try {
        const sound = document.getElementById('notification-sound');
        if (sound) {
            sound.currentTime = 0;
            const playPromise = sound.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.log('Erro ao reproduzir som:', error);
                });
            }
        }
    } catch (error) {
        console.error('Erro ao reproduzir som de notificação:', error);
    }
}

function showBellIcon() {
    const problemHeader = document.querySelector('.status-header i.fa-exclamation-triangle');
    if (problemHeader) {
        problemHeader.classList.add('fa-bell', 'notification-animation');
        // Remover classe de animação após a animação completar
        setTimeout(() => {
            problemHeader.classList.remove('notification-animation');
        }, 1000);
    }
}

// Adicionar estilos de notificação
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification-animation {
        animation: bell-ring 1s ease;
    }

    @keyframes bell-ring {
        0% { transform: rotate(0); }
        20% { transform: rotate(15deg); }
        40% { transform: rotate(-15deg); }
        60% { transform: rotate(7deg); }
        80% { transform: rotate(-7deg); }
        100% { transform: rotate(0); }
    }

    .highlight {
        animation: highlight-pulse 2s ease;
    }

    @keyframes highlight-pulse {
        0% { background-color: rgba(255, 193, 7, 0.5); }
        100% { background-color: transparente; }
    }
`;
document.head.appendChild(notificationStyles);

// Função melhorada de atualização de seção com estados de carregamento
function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    // Mostrar estado de carregamento
    container.innerHTML = '<div class="loading">Carregando...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${type === 'active' ? 'atendimento ativo' : 
                                  type === 'waiting' ? 'usuário na fila' : 
                                  'problema relatado'}.</div>`;
            return;
        }

        // Adicionar posições na fila para lista de espera
        if (type === 'waiting') {
            items = items.map((item, index) => ({
                ...item,
                queuePosition: index + 1
            }));
        }

        items.forEach(item => {
            const element = createItemElement(item, type, includePosition);
            container.appendChild(element);
        });
    }, 300); // Curto atraso para estado de carregamento
}

// Adicionar função auxiliar de capitalização
function capitalize(str) {
    if (!str) return '';
    return str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Atualizar função createItemElement
function createItemElement(item, type, includePosition) {
    if (!item) return null;

    const element = document.createElement('div');
    element.classList.add('chat-item', `${type}-item`);
    
    const formattedInfo = {
        name: capitalize(item.name || item.nome || ''),
        city: capitalize(item.city || item.cidade || ''),
        position: capitalize(item.position || item.cargo || ''),
        school: capitalize(item.school || item.escola || '')
    };

    let content = '';
    switch(type) {
        case 'active':
        case 'waiting':
            const badge = type === 'active' 
                ? '<span class="status-badge active">Em Atendimento</span>'
                : `<span class="queue-position">Posição ${item.queuePosition || ''}º</span>`;

            content = `
                <div class="item-content ${type}-chat">
                    <div class="user-info">
                        <strong>${formattedInfo.name}</strong>
                        ${badge}
                    </div>
                    <div class="details">
                        <span class="location">${formattedInfo.city}</span> • 
                        <span class="position">${formattedInfo.position}</span>
                    </div>
                    <div class="school-info">
                        <i class="fas fa-school"></i> ${formattedInfo.school}
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-danger btn-sm end-chat-btn">
                            <i class="fas fa-times-circle"></i> Finalizar Atendimento
                        </button>
                    </div>
                </div>
            `;

            // Adicionar event listener para o botão de finalizar
            setTimeout(() => {
                const endChatBtn = element.querySelector('.end-chat-btn');
                if (endChatBtn) {
                    endChatBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleEndChat(item);
                    });
                }
            }, 0);
            break;
            
        case 'problem':
            content = `
                <div class="item-content problem-chat">
                    <div class="problem-header">
                        <strong class="user-name">${capitalize(safeItem.name)}</strong>
                        <span class="status-badge problem">Problema</span>
                    </div>
                    <div class="problem-description-container">
                        <i class="fas fa-exclamation-circle"></i>
                        <span class="problem-description">${safeItem.description}</span>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-sm attend-btn">
                            <i class="fas fa-headset"></i> Atender
                        </button>
                    </div>
                </div>
            `;
            if (safeItem.chatId) {
                element.addEventListener('click', () => {
                    window.electron.openWhatsAppChat(safeItem.chatId);
                });
                element.style.cursor = 'pointer';
            }
            break;
    }
    
    element.innerHTML = content;
    
    // Adicionar manipulador de clique para botão de atendimento
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevenir abertura do chat
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Adicionar nova função para lidar com atendimento de problema
function handleAttendProblem(problem) {
    const confirmAttend = confirm(`Deseja atender o problema relatado por ${problem.name}?`);
    if (confirmAttend) {
        socket.emit('attendProblem', {
            chatId: problem.chatId,
            attendantId: 'CURRENT_USER_ID' // Pode ser necessário adicionar autenticação de usuário adequada
        });
        
        window.electron.openWhatsAppChat(problem.chatId);
    }
}

// Adicionar nova função para lidar com finalização de atendimento
function handleEndChat(chat) {
    const confirmEnd = confirm(`Deseja finalizar o atendimento de ${chat.name}?`);
    if (confirmEnd) {
        // Encontrar e remover o elemento do problema da UI
        const problemItem = Array.from(problemListContainer.children)
            .find(item => item.dataset.chatId === chat.chatId);
        if (problemItem) {
            problemItem.remove();
        }

        socket.emit('endChat', {
            chatId: chat.chatId,
            id: chat.id
        });

        // Se a lista de problemas estiver vazia, mostrar mensagem vazia
        if (problemListContainer.children.length === 0) {
            problemListContainer.innerHTML = '<div class="empty-message">Nenhum problema relatado.</div>';
        }
    }
}

// Buscar dados do banco de dados SQLite e atualizar a UI
async function fetchDataAndUpdateUI() {
    try {
        const response = await fetch('http://localhost:3000/getProblemsData');
        if (!response.ok) {
            throw new Error(`Erro HTTP! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Dados recebidos do servidor:', data);
        updateUI(data);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Mostrar mensagem de erro na UI se necessário
    }
}

// Garantir que o script do renderer seja carregado e executado
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM totalmente carregado e analisado');
    fetchDataAndUpdateUI();
});

// Chamar a função para buscar dados e atualizar a UI quando o conteúdo da página for carregado
document.addEventListener('DOMContentLoaded', fetchDataAndUpdateUI);

// Atualizar a função createItemElement
function createItemElement(item, type, includePosition) {
    if (!item) {
        console.log('Item inválido:', item);
        return null;
    }

    console.log(`Criando elemento do tipo ${type}:`, item); // Log de depuração

    const element = document.createElement('div');
    element.classList.add('chat-item', `${type}-item`);
    
    // Garantir que todos os campos existam
    const safeItem = {
        name: item.name || '',
        city: item.city || '',
        position: item.position || '',
        school: item.school || '',
        description: item.description || '',
        chatId: item.chatId || '',
        queuePosition: item.queuePosition || ''
    };

    let content = '';
    switch(type) {
        case 'active':
        case 'waiting':
            const badge = type === 'active' 
                ? '<span class="status-badge active">Em Atendimento</span>'
                : `<span class="queue-position">Posição ${safeItem.queuePosition}º</span>`;

            content = `
                <div class="item-content ${type}-chat">
                    <div class="user-info">
                        <strong>${capitalize(safeItem.name)}</strong>
                        ${badge}
                    </div>
                    <div class="details">
                        <span class="location">${capitalize(safeItem.city)}</span> • 
                        <span class="position">${capitalize(safeItem.position)}</span>
                    </div>
                    <div class="school-info">
                        <i class="fas fa-school"></i> ${capitalize(safeItem.school)}
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-danger btn-sm end-chat-btn">
                            <i class="fas fa-times-circle"></i> Finalizar Atendimento
                        </button>
                    </div>
                </div>
            `;

            // Adicionar event listener para o botão de finalizar
            setTimeout(() => {
                const endChatBtn = element.querySelector('.end-chat-btn');
                if (endChatBtn) {
                    endChatBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleEndChat(item);
                    });
                }
            }, 0);
            break;
            
        case 'problem':
            content = `
                <div class="item-content problem-chat">
                    <div class="problem-header">
                        <strong class="user-name">${capitalize(safeItem.name)}</strong>
                        <span class="status-badge problem">Problema</span>
                    </div>
                    <div class="problem-description-container">
                        <i class="fas fa-exclamation-circle"></i>
                        <span class="problem-description">${safeItem.description}</span>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-sm attend-btn">
                            <i class="fas fa-headset"></i> Atender
                        </button>
                    </div>
                </div>
            `;
            if (safeItem.chatId) {
                element.addEventListener('click', () => {
                    window.electron.openWhatsAppChat(safeItem.chatId);
                });
                element.style.cursor = 'pointer';
            }
            break;
    }
    
    element.innerHTML = content;
    
    // Adicionar manipulador de clique para botão de atendimento
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevenir abertura do chat
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Adicionar nova função para lidar com atendimento de problema
function handleAttendProblem(problem) {
    const confirmAttend = confirm(`Deseja atender o problema relatado por ${problem.name}?`);
    if (confirmAttend) {
        socket.emit('attendProblem', {
            chatId: problem.chatId,
            attendantId: 'CURRENT_USER_ID' // Pode ser necessário adicionar autenticação de usuário adequada
        });
        
        window.electron.openWhatsAppChat(problem.chatId);
    }
}

// Adicionar nova função para lidar com finalização de atendimento
function handleEndChat(chat) {
    const confirmEnd = confirm(`Deseja finalizar o atendimento de ${chat.name}?`);
    if (confirmEnd) {
        // Encontrar e remover o elemento do problema da UI
        const problemItem = Array.from(problemListContainer.children)
            .find(item => item.dataset.chatId === chat.chatId);
        if (problemItem) {
            problemItem.remove();
        }

        socket.emit('endChat', {
            chatId: chat.chatId,
            id: chat.id
        });

        // Se a lista de problemas estiver vazia, mostrar mensagem vazia
        if (problemListContainer.children.length === 0) {
            problemListContainer.innerHTML = '<div class="empty-message">Nenhum problema relatado.</div>';
        }
    }
}

// Buscar dados do banco de dados SQLite e atualizar a UI
async function fetchDataAndUpdateUI() {
    try {
        const response = await fetch('http://localhost:3000/getProblemsData');
        if (!response.ok) {
            throw new Error(`Erro HTTP! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Dados recebidos do servidor:', data);
        updateUI(data);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Mostrar mensagem de erro na UI se necessário
    }
}

// Garantir que o script do renderer seja carregado e executado
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM totalmente carregado e analisado');
    fetchDataAndUpdateUI();
});

// Chamar a função para buscar dados e atualizar a UI quando o conteúdo da página for carregado
document.addEventListener('DOMContentLoaded', fetchDataAndUpdateUI);

// Adicionar estilos CSS dinâmicos
const style = document.createElement('style');
style.textContent = `
    .chat-item {
        padding: 15px;
        margin: 10px 0;
        border-radius: 10px;
        background-color: #ffffff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
    }

    .chat-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .problem-chat {
        border-left: 4px solid #dc3545;
    }

    .problem-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .user-name {
        font-size: 1.1em;
        color: #212529;
    }

    .problem-description-container {
        background-color: #f8f9fa;
        padding: 12px;
        border-radius: 8px;
        margin: 5px 0;
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }

    .problem-description-container i {
        color: #dc3545;
        font-size: 1.1em;
        margin-top: 2px;
    }

    .problem-description {
        color: #495057;
        font-size: 0.95em;
        line-height: 1.4;
        flex: 1;
    }

    .status-badge.problem {
        background-color: #dc3545;
        color: white;
        padding: 4px 12px;
        border-radius: 15px;
        font-size: 0.8rem;
        font-weight: 600;
    }

    .problem-item:hover {
        background-color: #fff9f9;
        cursor: pointer;
    }
`;
document.head.appendChild(style);

const additionalStyles = `
    .action-buttons {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
    }

    .attend-btn {
        background-color: #28a745;
        border: none;
        color: white;
        padding: 5px 15px;
        border-radius: 15px;
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.3s ease;
    }

    .attend-btn:hover {
        background-color: #218838;
        transform: translateY(-1px);
    }

    .attend-btn i {
        font-size: 0.9em;
    }
    
    .end-chat-btn {
        background-color: #dc3545;
        border: none;
        color: white;
        padding: 5px 15px;
        border-radius: 15px;
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.3s ease;
        margin-top: 10px;
    }

    .end-chat-btn:hover {
        background-color: #c82333;
        transform: translateY(-1px);
    }

    .end-chat-btn i {
        font-size: 0.9em;
    }
`;

style.textContent += additionalStyles;