const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Conectado ao servidor de WebSocket');
});

socket.on('statusUpdate', (data) => {
    console.log('Status update received:', data);
    if (data && typeof data === 'object') {
        updateUI(data);
        // Não atualizar cores dos gráficos aqui
    }
});

socket.on('userProblem', (problemData) => {
    console.log('User problem received:', problemData);
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    showNotification('Novo Problema Relatado', 
        `${problemData.name} (${problemData.position}) - ${problemData.description}`);
    playNotificationSound();
    showBellIcon();
});

socket.on('new-data', (data) => {
    console.log('New data received:', data); // Log new data
    updateUI(data);
});

socket.on('newProblemReported', (problemData) => {
    console.log('New problem reported:', problemData); // Log new problem
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    showNotification('Novo Problema Relatado', problemData.description);
    playNotificationSound();
    showBellIcon();
});

const notificationSound = document.getElementById('notification-sound');
const activeChatList = document.getElementById('active-chat-list');
const waitingListContainer = document.getElementById('waiting-list-container');
const problemListContainer = document.getElementById('problem-list-container');

// Update the UI with the latest data
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

    // Debug logs
    console.log('Atendimentos ativos:', processedData.activeChats);
    console.log('Lista de espera:', processedData.waitingList);
    console.log('Problemas:', processedData.problems);
}

// Display a reported problem
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

// Updated notification function
function showNotification(title, message) {
    // Verify notification permission
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
        return;
    }

    if (Notification.permission === 'granted') {
        createNotification(title, message);
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                createNotification(title, message);
            }
        });
    }
}

// Create notification with better formatting
function createNotification(title, message) {
    const options = {
        body: message,
        icon: '/path/to/icon.png', // Add your notification icon
        badge: '/path/to/badge.png', // Add your badge icon
        tag: 'support-notification', // Tag for grouping similar notifications
        renotify: true, // Allow renotification with same tag
        requireInteraction: true, // Notification stays until user interacts
        silent: false, // Play sound
        vibrate: [200, 100, 200] // Vibration pattern
    };

    const notification = new Notification(title, options);
    
    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        this.close();
    };

    playNotificationSound();
    showBellIcon();
}

// Play the notification sound
function playNotificationSound() {
    notificationSound.play();
}

// Show the bell icon
function showBellIcon() {
    const problemHeader = document.querySelector('.status-header i.fa-exclamation-triangle');
    if (problemHeader) {
        problemHeader.classList.add('fa-bell');
    }
}

// Improved updateSection function with loading states
function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="loading">Loading...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${type === 'active' ? 'atendimento ativo' : 
                                  type === 'waiting' ? 'usuário na fila' : 
                                  'problema relatado'}.</div>`;
            return;
        }

        // Add queue positions for waiting list
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
    }, 300); // Short delay for loading state
}

// Add capitalize helper function
function capitalize(str) {
    if (!str) return '';
    return str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Update createItemElement function
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
    
    // Add click handler for attend button
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the chat from opening
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Add new function to handle attending to a problem
function handleAttendProblem(problem) {
    const confirmAttend = confirm(`Deseja atender o problema relatado por ${problem.name}?`);
    if (confirmAttend) {
        socket.emit('attendProblem', {
            chatId: problem.chatId,
            attendantId: 'CURRENT_USER_ID' // You might want to add proper user authentication
        });
        
        window.electron.openWhatsAppChat(problem.chatId);
    }
}

// Add new function to handle chat completion
function handleEndChat(chat) {
    const confirmEnd = confirm(`Deseja finalizar o atendimento de ${chat.name}?`);
    if (confirmEnd) {
        // Find and remove the problem element from UI
        const problemItem = Array.from(problemListContainer.children)
            .find(item => item.dataset.chatId === chat.chatId);
        if (problemItem) {
            problemItem.remove();
        }

        socket.emit('endChat', {
            chatId: chat.chatId,
            id: chat.id
        });

        // If problem list is empty, show empty message
        if (problemListContainer.children.length === 0) {
            problemListContainer.innerHTML = '<div class="empty-message">Nenhum problema relatado.</div>';
        }
    }
}

// Fetch data from the SQLite database and update the UI
async function fetchDataAndUpdateUI() {
    try {
        const response = await fetch('http://localhost:3000/getProblemsData');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Dados recebidos do servidor:', data);
        updateUI(data);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Mostrar mensagem de erro na UI se necessário
    }
}

// Ensure the renderer script is loaded and executed
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    fetchDataAndUpdateUI();
});

// Call the function to fetch data and update the UI when the page content is loaded
document.addEventListener('DOMContentLoaded', fetchDataAndUpdateUI);

// Atualizar a função createItemElement
function createItemElement(item, type, includePosition) {
    if (!item) {
        console.log('Item inválido:', item);
        return null;
    }

    console.log(`Criando elemento do tipo ${type}:`, item); // Debug log

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
    
    // Add click handler for attend button
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the chat from opening
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Add new function to handle attending to a problem
function handleAttendProblem(problem) {
    const confirmAttend = confirm(`Deseja atender o problema relatado por ${problem.name}?`);
    if (confirmAttend) {
        socket.emit('attendProblem', {
            chatId: problem.chatId,
            attendantId: 'CURRENT_USER_ID' // You might want to add proper user authentication
        });
        
        window.electron.openWhatsAppChat(problem.chatId);
    }
}

// Atualizar a função updateSection
function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    console.log(`Atualizando seção ${type}:`, items); // Debug log
    
    container.innerHTML = '<div class="loading">Carregando...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (!items || items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${
                type === 'active' ? 'atendimento ativo' : 
                type === 'waiting' ? 'usuário na fila' : 
                'problema relatado'}</div>`;
        }

        items.forEach((item, index) => {
            if (type === 'waiting') {
                item.queuePosition = index + 1;
            }
            const element = createItemElement(item, type, includePosition);
            if (element) {
                container.appendChild(element);
            }
        });
    }, 300);
}

// Atualizar os event listeners do Socket.IO
socket.on('statusUpdate', (data) => {
    console.log('Status update received:', data);
    if (data && typeof data === 'object') {
        updateUI(data);
    }
});

socket.on('new-data', (data) => {
    console.log('New data received:', data);
    updateUI(data);
});

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