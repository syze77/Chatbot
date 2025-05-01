// Configuração do Socket.IO
const socket = io('http://localhost:3000');

// Elementos do DOM
const cardsContainer = document.getElementById('cardsContainer');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const applyFilterBtn = document.getElementById('applyFilter');

// Função principal para carregar cards
async function loadCards(filters = {}) {
    try {
        let url = 'http://localhost:3000/api/problem-cards';
        const params = new URLSearchParams();
        
        if (filters.status && filters.status !== 'all') {
            params.append('status', filters.status);
        }
        if (filters.date) {
            params.append('date', filters.date);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const cards = await response.json();
        renderCards(cards);
    } catch (error) {
        console.error('Erro ao carregar cards:', error);
        showError('Falha ao carregar os cards');
    }
}

// Função para criar um novo card
async function createCard(chatId, cardLink) {
    try {
        console.log('Tentando criar card:', { chatId, cardLink });
        
        if (!chatId || !cardLink) {
            throw new Error('ChatId e CardLink são obrigatórios');
        }

        const response = await fetch('http://localhost:3000/api/problem-cards/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatId: chatId.toString(),
                cardLink: cardLink.toString()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao criar card');
        }

        console.log('Card criado com sucesso:', data);
        await loadCards(); // Recarrega a lista de cards
        return data;
    } catch (error) {
        console.error('Erro ao criar card:', error);
        alert('Erro ao criar o card: ' + error.message);
        throw error;
    }
}

// Função para exibir erro
function showError(message) {
    cardsContainer.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            ${message}
        </div>`;
}

// Função para renderizar cards com debug
function renderCards(cards) {
    console.log('Renderizando cards:', cards);
    cardsContainer.innerHTML = '';
    
    if (!Array.isArray(cards) || cards.length === 0) {
        console.log('Nenhum card encontrado');
        cardsContainer.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-inbox"></i>
                Nenhum card encontrado
            </div>`;
        return;
    }

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'cards-grid';
    
    cards.forEach(card => {
        console.log('Processando card:', card);
        const cardElement = createCardElement(card);
        cardsGrid.appendChild(cardElement);
    });

    cardsContainer.appendChild(cardsGrid);
}

// Função para criar elemento de card com verificações
function createCardElement(card) {
    if (!card || !card.id) {
        console.error('Card inválido:', card);
        return document.createElement('div');
    }

    console.log('Criando elemento para card:', card);
    
    const div = document.createElement('div');
    div.className = `card-item ${card.card_status || 'pending'}`;
    div.dataset.id = card.id;

    const statusText = card.card_status === 'pending' ? 'Pendente' : 'Concluído';
    const statusClass = card.card_status === 'pending' ? 'status-pending' : 'status-completed';

    const createdDate = new Date(card.created_at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    div.innerHTML = `
        <div class="card-header">
            <span class="card-status ${statusClass}">${statusText}</span>
            <div class="card-title">Card #${card.id}</div>
        </div>
        <div class="card-body">
            <div class="card-info">
                <div class="info-row">
                    <i class="fas fa-phone"></i>
                    <span>${formatPhoneNumber(card.chatId)}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-calendar"></i>
                    <span>Criado em ${createdDate}</span>
                </div>
            </div>
            <div class="card-actions">
                <a href="${card.card_link}" target="_blank" class="btn btn-primary btn-sm">
                    <i class="fas fa-external-link-alt"></i>
                    Abrir Card
                </a>
                ${card.card_status === 'pending' ? `
                    <button class="btn btn-success btn-sm" onclick="markAsCompleted(${card.id})">
                        <i class="fas fa-check"></i>
                        Concluir
                    </button>
                ` : `
                    <button class="btn btn-warning btn-sm" onclick="reopenCard(${card.id})">
                        <i class="fas fa-redo"></i>
                        Reabrir
                    </button>
                `}
            </div>
        </div>
    `;

    return div;
}

// Adicionar função para reabrir card
async function reopenCard(cardId) {
    try {
        const response = await fetch(`http://localhost:3000/api/problem-cards/${cardId}/reopen`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const updatedCard = await response.json();
        
        // Atualiza o card na interface
        const cardElement = document.querySelector(`[data-id="${cardId}"]`);
        if (cardElement) {
            cardElement.replaceWith(createCardElement(updatedCard));
        }

        // Notifica outros clientes via Socket.IO
        socket.emit('cardUpdated', updatedCard);
    } catch (error) {
        console.error('Erro ao reabrir card:', error);
        alert('Erro ao reabrir o card. Por favor, tente novamente.');
    }
}

// Função para marcar card como concluído
async function markAsCompleted(cardId) {
    try {
        const response = await fetch(`http://localhost:3000/api/problem-cards/${cardId}/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const updatedCard = await response.json();
        
        // Atualiza o card na interface
        const cardElement = document.querySelector(`[data-id="${cardId}"]`);
        if (cardElement) {
            cardElement.replaceWith(createCardElement(updatedCard));
        }

        // Notifica outros clientes via Socket.IO
        socket.emit('cardUpdated', updatedCard);
    } catch (error) {
        console.error('Erro ao marcar card como concluído:', error);
        alert('Erro ao concluir o card. Por favor, tente novamente.');
    }
}

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

        try {
            if (cardCreatedSelect.value === 'yes') {
                const cardData = {
                    chatId: chat.chatId,
                    cardLink: cardLinkInput.value.trim()
                };
                
                console.log('Enviando dados do card:', cardData);
                socket.emit('createCard', cardData);
            }

            socket.emit('endChat', {
                chatId: chat.chatId,
                id: chat.id,
                cardCreated: cardCreatedSelect.value === 'yes'
            });

            // Remove o item da lista
            const problemItem = document.querySelector(`[data-chatid="${chat.chatId}"]`);
            if (problemItem) {
                problemItem.remove();
            }

        } catch (error) {
            console.error('Erro ao finalizar atendimento:', error);
            alert('Erro ao finalizar o atendimento. Por favor, tente novamente.');
        }
    };

    confirmEndBtn.addEventListener('click', handleConfirm);
    modal.show();
}

// Event Listeners
socket.on('connect', () => {
    console.log('Conectado ao Socket.IO');
});

socket.on('cardCreated', (card) => {
    console.log('Novo card recebido via Socket.IO:', card);
    loadCards();
});

socket.on('cardUpdated', (card) => {
    console.log('Card atualizado:', card);
    const cardElement = document.querySelector(`[data-id="${card.id}"]`);
    if (cardElement) {
        cardElement.replaceWith(createCardElement(card));
    }
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('Página carregada, buscando cards...');
    loadCards();
    
    // Atualização automática
    setInterval(() => {
        console.log('Atualizando cards...');
        loadCards({
            status: statusFilter.value,
            date: dateFilter.value
        });
    }, 30000);
});

// Filtros
applyFilterBtn.addEventListener('click', () => {
    loadCards({
        status: statusFilter.value,
        date: dateFilter.value
    });
});

function formatPhoneNumber(number) {
    // Remove WhatsApp format
    const cleaned = number.split('@')[0];
    
    // Remove country code (55) from the beginning
    const withoutCountry = cleaned.startsWith('55') ? cleaned.slice(2) : cleaned;
    
    // Format as (XX) 9XXXX-XXXX, ensuring the 9 is always present
    if (withoutCountry.length >= 8) {
        const ddd = withoutCountry.slice(0, 2);
        const mainNumber = withoutCountry.slice(2);
        return `(${ddd}) 9${mainNumber.slice(0, 4)}-${mainNumber.slice(4)}`;
    }
    
    return number;
}