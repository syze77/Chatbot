// Estabelece conexão WebSocket com o servidor local
const socket = io('http://localhost:3000');

// Registra evento de conexão bem-sucedida
socket.on('connect', () => {
    console.log('Conectado ao servidor de WebSocket');
});

// Manipula atualizações de status recebidas do servidor
socket.on('statusUpdate', (data) => {
    // Verifica se os dados são válidos antes de atualizar a UI
    if (data && typeof data === 'object') {
        updateUI(data);
    }
});

// Manipula novos problemas reportados pelos usuários
socket.on('userProblem', (problemData) => {    
    // Normaliza os dados do problema
    const data = typeof problemData === 'string' ? 
        { description: problemData } : problemData;
    
    // Exibe o problema na interface
    displayProblem(data.description, data.chatId, data.name);
    
    // Prepara dados para notificação
    const notificationData = {
        chatId: data.chatId,
        name: data.name,
        position: data.position,
        school: data.school,
        description: data.description,
        city: data.city
    };
    
    // Mostra notificação do novo problema
    showNotification('Novo Problema Relatado', notificationData);
});

// Handler do evento new-data
socket.on('new-data', (data) => {
    console.log('Novos dados recebidos:', data); // Log de novos dados
    updateUI(data);
});

// Handler do evento newProblemReported
socket.on('newProblemReported', (problemData) => {
    console.log('Novo problema relatado:', problemData); // Log de novo problema
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    
    const notificationData = {
        description: problemData.description,
    };
    
    showNotification('Novo Problema Relatado', notificationData);
});

// Atualizar caminhos de recursos de áudio
const notificationSound = document.getElementById('notification-sound');
const activeChatList = document.getElementById('active-chat-list');
const waitingListContainer = document.getElementById('waiting-list-container');
const problemListContainer = document.getElementById('problem-list-container');

// Funções de manipulação da interface
// Função principal para atualizar a interface do usuário
function updateUI(data) {
    // Processa e valida os dados recebidos
    const processedData = {
        activeChats: Array.isArray(data.activeChats) ? data.activeChats : [],
        waitingList: Array.isArray(data.waitingList) ? data.waitingList : [],
        problems: Array.isArray(data.problems) ? data.problems : []
    };

    // Atualiza cada seção da interface
    updateSection(processedData.activeChats, activeChatList, 'active');
    updateSection(processedData.waitingList, waitingListContainer, 'waiting', true);
    updateSection(processedData.problems, problemListContainer, 'problem');
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
        // Atualizar descrição do problema existente
        const descriptionElement = existingProblem.querySelector('.problem-description');
        if (descriptionElement) {
            descriptionElement.textContent = description;
        }
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

function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Carregando...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${type === 'active' ? 'atendimento ativo' : 
                                  type === 'waiting' ? 'usuário na fila' : 
                                  'problema relatado'}.</div>`;
            return;
        }

        // Garantir que os itens na fila de espera tenham posição correta
        if (type === 'waiting') {
            items.forEach((item, index) => {
                item.queuePosition = index + 1;
            });
        }

        items.forEach(item => {
            const element = createItemElement(item, type, includePosition);
            container.appendChild(element);
        });
    }, 300);
}

function capitalize(str) {
    if (!str) return '';
    return str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function createItemElement(item, type, includePosition) {
    if (!item) {
        console.log('Item inválido:', item);
        return null;
    }

    console.log(`Criando elemento do tipo ${type}:`, item);
    const element = document.createElement('div');
    element.classList.add('chat-item', `${type}-item`);
    
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
    
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Função para manipular o atendimento de um problema
async function handleAttendProblem(problem) {
    try {
        const modal = new bootstrap.Modal(document.getElementById('attendantModal'));
        modal.show();

        return new Promise((resolve, reject) => {
            const confirmBtn = document.getElementById('confirmAttendBtn');
            const attendantSelect = document.getElementById('attendantSelect');
            const attendantInput = document.getElementById('attendantName');
            const otherAttendantGroup = document.getElementById('otherAttendantGroup');

            // Mostrar/ocultar campo de input baseado na seleção
            attendantSelect.addEventListener('change', () => {
                otherAttendantGroup.style.display = 
                    attendantSelect.value === 'outro' ? 'block' : 'none';
                if (attendantSelect.value !== 'outro') {
                    attendantInput.value = '';
                }
            });
            
            const handleConfirm = async () => {
                let attendantName = attendantSelect.value;
                
                if (attendantName === 'outro') {
                    attendantName = attendantInput.value.trim();
                    if (!attendantName) {
                        alert('Por favor, insira o nome do atendente');
                        return;
                    }
                }

                modal.hide();
                confirmBtn.removeEventListener('click', handleConfirm);

                try {
                    console.log('Iniciando atendimento para:', problem);

                    socket.emit('attendProblem', {
                        chatId: problem.chatId,
                        attendantId: attendantName,
                        problemDescription: problem.description
                    });

                    await new Promise(resolve => setTimeout(resolve, 500));

                    let whatsappId = problem.chatId;
                    if (!whatsappId.includes('@')) {
                        whatsappId = `${whatsappId}@c.us`;
                    }

                    await window.electronAPI.openWhatsAppChat(whatsappId);
                    resolve();
                } catch (error) {
                    console.error('Erro ao abrir chat:', error);
                    alert('Erro ao abrir chat do WhatsApp. Por favor, tente novamente.');
                    reject(error);
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            
            document.getElementById('attendantModal').addEventListener('hidden.bs.modal', () => {
                attendantSelect.value = 'Júnior Araújo'; 
                otherAttendantGroup.style.display = 'none';
                attendantInput.value = '';
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve();
            }, { once: true });
        });
    } catch (error) {
        console.error('Erro ao atender problema:', error);
        alert('Erro ao iniciar atendimento. Por favor, tente novamente.');
    }
}

// Função para finalizar um atendimento
async function handleEndChat(chat) {
    const modal = new bootstrap.Modal(document.getElementById('endChatModal'));
    const cardCreatedSelect = document.getElementById('cardCreatedSelect');
    const cardLinkGroup = document.getElementById('cardLinkGroup');
    const cardLinkInput = document.getElementById('cardLink');
    const confirmEndBtn = document.getElementById('confirmEndBtn');

    cardCreatedSelect.value = 'no';
    cardLinkGroup.style.display = 'none';
    cardLinkInput.value = '';

    cardCreatedSelect.addEventListener('change', () => {
        cardLinkGroup.style.display = 
            cardCreatedSelect.value === 'yes' ? 'block' : 'none';
        if (cardCreatedSelect.value === 'no') {
            cardLinkInput.value = '';
        }
    });

    const handleConfirm = async () => {
        if (cardCreatedSelect.value === 'yes' && !cardLinkInput.value.trim()) {
            alert('Por favor, insira o link do card');
            return;
        }

        modal.hide();

        // Remove o item da lista de problemas
        const problemItem = Array.from(problemListContainer.children)
            .find(item => item.dataset.chatId === chat.chatId);
        if (problemItem) {
            problemItem.remove();
        }

        // Criar card apenas se necessário
        if (cardCreatedSelect.value === 'yes') {
            try {
                // Usar a API do módulo de cards
                socket.emit('createCard', {
                    chatId: chat.chatId,
                    cardLink: cardLinkInput.value.trim()
                });
            } catch (error) {
                console.error('Erro ao criar card:', error);
                alert('Erro ao criar o card. O atendimento será finalizado mesmo assim.');
            }
        }

        // Notificar sobre o fim do atendimento
        socket.emit('endChat', {
            chatId: chat.chatId,
            id: chat.id,
            cardCreated: cardCreatedSelect.value === 'yes',
            cardLink: cardLinkInput.value.trim()
        });

        if (problemListContainer.children.length === 0) {
            problemListContainer.innerHTML = '<div class="empty-message">Nenhum problema relatado.</div>';
        }

        confirmEndBtn.removeEventListener('click', handleConfirm);
    };

    confirmEndBtn.addEventListener('click', handleConfirm);
    modal.show();
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
    }
}

// Inicialização e carregamento
document.addEventListener('DOMContentLoaded', () => {
    fetchDataAndUpdateUI();
});

// Estilos dinâmicos
const style = document.createElement('style');
style.textContent = `
    .chat-item {
        padding: 15px;
        margin: 10px 0;
        border-radius: 10px;
        background-color: #ffffff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
        color: #333333;
    }

    .dark-theme .chat-item {
        background-color: #2b2b2b;
        color: #e4e6ef;
        border-color: #363636;
    }

    .chat-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .dark-theme .chat-item:hover {
        background-color: #363636;
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
        background-color: #363636;
        cursor: pointer;
    }
`;

// Update problem-item hover style
style.textContent += `
    .problem-item:hover {
        background-color: #363636;
        cursor: pointer;
    }
`;

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

//Badge de posição na fila
const queueStyles = document.createElement('style');
queueStyles.textContent = `
    .queue-badge {
        background-color: #ffc107;
        color: #000;
        padding: 4px 12px;
        border-radius: 15px;
        font-size: 0.85rem;
        font-weight: 600;
        margin-left: 10px;
    }

    .waiting-chat {
        border-left: 4px solid #ffc107;
    }

    .waiting-chat .user-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
`;
document.head.appendChild(queueStyles);

const modalHTML = `
<div id="attendantModal" class="modal fade custom-modal" tabindex="-1" style="display: none;">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="fas fa-headset"></i>
                    Iniciar Atendimento
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="attendantSelect">Selecione o Atendente:</label>
                    <select class="form-control" id="attendantSelect">
                        <option value="Júnior Araújo">Júnior Araújo</option>
                        <option value="Júnior Parnaiba">Júnior Parnaiba</option>
                        <option value="outro">Outro</option>
                    </select>
                </div>
                <div class="form-group mt-3" id="otherAttendantGroup" style="display: none;">
                    <label for="attendantName">Nome do Atendente:</label>
                    <input type="text" class="form-control" id="attendantName" placeholder="Digite o nome do atendente">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="confirmAttendBtn">
                    <i class="fas fa-check"></i>
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>`;

document.body.insertAdjacentHTML('beforeend', modalHTML);

const modalStyles = `
    .custom-modal .modal-content {
        border: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        background-color: #ffffff;
        color: #212529;
    }

    .custom-modal .modal-header {
        background-color: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        padding: 1rem;
    }

    .custom-modal .form-control {
        background-color: #ffffff;
        border-color: #ced4da;
        color: #212529;
    }

    .dark-theme .custom-modal .modal-content {
        background-color: #2b3035;
        color: #e9ecef;
        border: 1px solid #495057;
    }

    .dark-theme .custom-modal .modal-header {
        background-color: #343a40;
        border-color: #495057;
    }

    .dark-theme .custom-modal .modal-footer {
        background-color: #343a40;
        border-color: #495057;
    }

    .dark-theme .custom-modal .modal-body {
        background-color: #2b3035;
    }

    .dark-theme .custom-modal .form-control {
        background-color: #212529;
        border-color: #495057;
        color: #ffffff;
    }

    .dark-theme .custom-modal .form-control::placeholder {
        color: #6c757d;
    }

    .dark-theme .custom-modal .btn-close {
        filter: invert(1) grayscale(100%) brightness(200%);
    }

    .dark-theme .custom-modal label {
        color: #e9ecef;
    }

    .dark-theme .custom-modal .form-control::placeholder {
        color: #6c757d;
    }

    .dark-theme .custom-modal .btn-outline-secondary {
        color: #e9ecef;
        border-color: #6c757d;
    }

    .dark-theme .custom-modal .btn-outline-secondary:hover {
        background-color: #6c757d;
        color: #fff;
    }

    .custom-modal .modal-title {
        font-size: 1.1rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .custom-modal .modal-title i {
        color: #28a745;
    }

    .custom-modal .modal-body {
        padding: 1.5rem;
    }

    .custom-modal .form-group label {
        font-weight: 500;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }

    .custom-modal .form-control {
        padding: 0.5rem 0.75rem;
        font-size: 0.95rem;
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .custom-modal .form-control:focus {
        border-color: #28a745;
        box-shadow: 0 0 0 0.2rem rgba(40, 167, 69, 0.25);
    }

    .custom-modal .modal-footer {
        padding: 1rem;
        gap: 8px;
    }

    .custom-modal .btn {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .custom-modal .btn-success {
        background-color: #28a745;
        border-color: #28a745;
        color: #fff;
    }

    .custom-modal .btn-success:hover {
        background-color: #218838;
        border-color: #1e7e34;
    }

    .custom-modal .modal-content,
    .custom-modal .form-control,
    .custom-modal .btn {
        transition: all 0.2s ease-in-out;
    }
`;

style.textContent += modalStyles;

document.body.insertAdjacentHTML('beforeend', `
<div id="endChatModal" class="modal fade custom-modal" tabindex="-1" style="display: none;">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="fas fa-check-circle"></i>
                    Finalizar Atendimento
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="cardCreatedSelect">Foi necessário criar um card?</label>
                    <select class="form-control" id="cardCreatedSelect">
                        <option value="no">Não</option>
                        <option value="yes">Sim</option>
                    </select>
                </div>
                <div class="form-group mt-3" id="cardLinkGroup" style="display: none;">
                    <label for="cardLink">Link do Card:</label>
                    <input type="text" class="form-control" id="cardLink" placeholder="Cole o link do card aqui">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="confirmEndBtn">
                    <i class="fas fa-check"></i>
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>`);