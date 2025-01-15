const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Conectado ao servidor de WebSocket');
});

socket.on('statusUpdate', (statusData) => {
    console.log('Status update received:', statusData); // Log status update
    updateUI(statusData);
    fetchDataAndUpdateCharts(document.getElementById('cityFilter')?.value || '');
});

socket.on('userProblem', (problemData) => {
    console.log('User problem received:', problemData);
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    showNotification('Novo Problema Relatado', 
        `${problemData.name} (${problemData.position}) - ${problemData.description}`);
    playNotificationSound();
    showBellIcon();
    fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart);
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
    fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart);
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

// Update updateSection function to handle queue positions correctly
function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Carregando...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (!items || items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${
                type === 'active' ? 'atendimento ativo' : 
                type === 'waiting' ? 'usuário na fila' : 
                'problema relatado'}</div>`;
            return;
        }

        // Sort waiting list by date if needed
        if (type === 'waiting') {
            items.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        items.forEach((item, index) => {
            if (type === 'waiting') {
                item.queuePosition = index + 1;
            }
            const element = createItemElement(item, type, includePosition);
            container.appendChild(element);
        });
    }, 300);
}

// Helper function to create item elements with specific information
function createItemElement(item, type, includePosition) {
    const element = document.createElement('div');
    element.classList.add('chat-item', `${type}-item`);
    
    let content = '';
    switch(type) {
        case 'active':
            content = `
                <div class="item-content active-chat">
                    <div class="user-info">
                        <strong>${item.name}</strong>
                        <span class="status-badge active">Em Atendimento</span>
                    </div>
                    <div class="details">
                        <span class="location">${item.city}</span> | 
                        <span class="position">${item.position}</span>
                    </div>
                    <div class="school-info">${item.school}</div>
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
            
        case 'waiting':
            const queuePosition = includePosition ? item.queuePosition || waitingList.indexOf(item) + 1 : '';
            content = `
                <div class="item-content waiting-chat">
                    <div class="user-info">
                        <strong>${item.name}</strong>
                        <span class="queue-position">Posição: ${queuePosition}</span>
                    </div>
                    <div class="details">
                        <span class="location">${item.city}</span> | 
                        <span class="position">${item.position}</span>
                    </div>
                    <div class="school-info">${item.school}</div>
                </div>
            `;
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

// Create a chat item element
async function createChatItem(user, status) {
    const chatItem = document.createElement('div');
    chatItem.classList.add('chat-item');

    if (status === 'active') {
        chatItem.classList.add('active-chat-item');
    } else if (status === 'waiting') {
        chatItem.classList.add('waiting-chat-item');
    } else if (status === 'problem') {
        chatItem.classList.add('problem-item');
        chatItem.innerHTML = `<strong>${user.name}:</strong> ${user.description}`;
        return chatItem;
    }

    const response = await fetch(`http://localhost:3000/getUserInfo/${user.chatId}`);
    const userInfo = await response.json();

    chatItem.innerHTML = `
        <div><span class="info-label">Nome:</span> ${userInfo.name}</div>
        <div><span class="info-label">Cargo:</span> ${userInfo.position}</div>
        <div><span class="info-label">Cidade:</span> ${userInfo.city}</div>
        <div><span class="info-label">Escola:</span> ${userInfo.school}</div>
    `;

    return chatItem;
}

// Fetch data from the SQLite database and update charts
async function fetchDataAndUpdateCharts(city = '') {
    try {
        const response = await fetch(`http://localhost:3000/getChartData?city=${encodeURIComponent(city)}`);
        const data = await response.json();
        
        console.log('Dados recebidos:', data); // Debug log

        if (!data || !data.weekly || !data.monthly) {
            console.error('Estrutura de dados inválida:', data);
            return;
        }

        // Atualizar gráfico semanal
        if (dailyProblemsChart) {
            dailyProblemsChart.data.labels = data.weekly.labels;
            dailyProblemsChart.data.datasets[0].data = data.weekly.data;
            dailyProblemsChart.update('active');
        } else {
            console.error('Gráfico semanal não inicializado');
        }

        // Atualizar gráfico mensal
        if (monthlyProblemsChart) {
            monthlyProblemsChart.data.labels = data.monthly.labels;
            monthlyProblemsChart.data.datasets[0].data = data.monthly.data;
            monthlyProblemsChart.update('active');
        } else {
            console.error('Gráfico mensal não inicializado');
        }

    } catch (error) {
        console.error('Erro ao buscar ou atualizar dados:', error);
    }
}

// Improved dashboard charts
function updateDailyChart(data, chart) {
    const today = new Date();
    const last7Days = Array.from({length: 7}, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        return date.toISOString().split('T')[0];
    }).reverse();

    const dailyCounts = {};
    last7Days.forEach(date => dailyCounts[date] = 0);

    // Count problems per day
    data.forEach(problem => {
        const problemDate = new Date(problem.date).toISOString().split('T')[0];
        if (dailyCounts[problemDate] !== undefined) {
            dailyCounts[problemDate]++;
        }
    });

    chart.data.labels = last7Days.map(date => {
        const [year, month, day] = date.split('-');
        return `${day}/${month}`;
    });
    chart.data.datasets[0].data = Object.values(dailyCounts);
    chart.update();
}

function updateMonthlyChart(data, chart) {
    const months = Array.from({length: 12}, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        return date.toLocaleString('pt-BR', { month: 'long' });
    }).reverse();

    const monthlyCounts = {};
    months.forEach(month => monthlyCounts[month] = 0);

    // Count problems per month
    data.forEach(problem => {
        const month = new Date(problem.date).toLocaleString('pt-BR', { month: 'long' });
        if (monthlyCounts[month] !== undefined) {
            monthlyCounts[month]++;
        }
    });

    const backgroundColor = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
    ];

    chart.data.labels = Object.keys(monthlyCounts);
    chart.data.datasets[0].data = Object.values(monthlyCounts);
    chart.data.datasets[0].backgroundColor = backgroundColor;
    chart.update();
}

// Load completed attendances
async function loadCompletedAttendances() {
    const response = await fetch('http://localhost:3000/getCompletedAttendances');
    const completedAttendances = await response.json();
    const completedList = document.getElementById('completed-list');
    completedList.innerHTML = '';
    completedAttendances.forEach(attendance => {
        const item = document.createElement('div');
        item.classList.add('completed-item');
        item.innerHTML = `
            <div>
                <strong>${attendance.name}</strong><br>
                ${attendance.position} - ${attendance.city} - ${attendance.school}<br>
                ${attendance.description}
            </div>
            <input type="checkbox" data-id="${attendance.id}">
        `;
        completedList.appendChild(item);
    });
}

// Delete selected completed attendances
async function deleteSelected() {
    const checkboxes = document.querySelectorAll('.completed-item input[type="checkbox"]:checked');
    checkboxes.forEach(async (checkbox) => {
        const id = checkbox.dataset.id;
        await fetch(`http://localhost:3000/deleteCompletedAttendance/${id}`, { method: 'DELETE' });
        checkbox.closest('.completed-item').remove();
    });
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

// Add new function to generate report
function generateReport(startDate, endDate) {
    const formattedStartDate = new Date(startDate).toISOString();
    const formattedEndDate = new Date(endDate).toISOString();

    fetch(`http://localhost:3000/generateReport?start=${formattedStartDate}&end=${formattedEndDate}`)
        .then(response => response.json())
        .then(data => {
            const reportWindow = window.open('', '_blank');
            reportWindow.document.write(`
                <html>
                <head>
                    <title>Relatório de Atendimentos</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { padding: 8px; border: 1px solid #ddd; }
                        th { background-color: #f4f4f4; }
                        .stats { margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <h1>Relatório de Atendimentos</h1>
                    <div class="stats">
                        <h2>Estatísticas</h2>
                        <p>Total de atendimentos: ${data.total}</p>
                        <p>Tempo médio de atendimento: ${data.averageTime}</p>
                        <p>Problemas mais comuns: ${data.commonProblems.join(', ')}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Usuário</th>
                                <th>Problema</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.problems.map(p => `
                                <tr>
                                    <td>${new Date(p.date).toLocaleString()}</td>
                                    <td>${p.name}</td>
                                    <td>${p.description}</td>
                                    <td>${p.status}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
                </html>
            `);
        })
        .catch(error => console.error('Erro ao gerar relatório:', error));
}

// Adicionar função para validar dados do gráfico
function validateChartData(data) {
    console.log('Validando dados:', data);
    if (!data) return false;
    if (!Array.isArray(data.labels) || !Array.isArray(data.data)) return false;
    if (data.labels.length !== data.data.length) return false;
    if (data.data.some(item => typeof item !== 'number')) return false;
    return true;
}

// Modificar a função updateChartData
function updateChartData(weeklyData, monthlyData) {
    console.log('Atualizando dados dos gráficos:', { weeklyData, monthlyData });

    if (!validateChartData(weeklyData) || !validateChartData(monthlyData)) {
        console.error('Dados inválidos para os gráficos');
        return;
    }

    try {
        // Atualizar gráfico semanal
        dailyProblemsChart.data.labels = weeklyData.labels;
        dailyProblemsChart.data.datasets[0].data = weeklyData.data;
        dailyProblemsChart.update();

        // Atualizar gráfico mensal
        monthlyProblemsChart.data.labels = monthlyData.labels;
        monthlyProblemsChart.data.datasets[0].data = monthlyData.data;
        monthlyProblemsChart.update();

        console.log('Gráficos atualizados com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar gráficos:', error);
    }
}

// Adicionar função para inicializar os gráficos
function initializeCharts() {
    console.log('Inicializando gráficos...');
    
    // Configuração comum para cores e estilos
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
            }
        }
    };

    // Inicializar gráfico semanal
    const dailyCtx = document.getElementById('dailyProblemsChart');
    if (dailyCtx) {
        window.dailyProblemsChart = new Chart(dailyCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Problemas por Dia',
                    data: [],
                    backgroundColor: 'rgba(23, 162, 184, 0.2)',
                    borderColor: 'rgba(23, 162, 184, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    // Inicializar gráfico mensal
    const monthlyCtx = document.getElementById('monthlyProblemsChart');
    if (monthlyCtx) {
        window.monthlyProblemsChart = new Chart(monthlyCtx, {
            type: 'pie',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)'
                    ]
                }]
            },
            options: commonOptions
        });
    }

    console.log('Gráficos inicializados');
}

// Modificar o evento DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, iniciando aplicação...');
    
    initializeCharts();
    loadCities();
    
    // Carregar dados iniciais
    fetchDataAndUpdateCharts('');
    
    // Configurar observer para tema
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                updateChartsTheme();
            }
        });
    });

    observer.observe(document.body, {
        attributes: true
    });
    
    console.log('Aplicação iniciada');
});