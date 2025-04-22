const socket = io('http://localhost:3000');
const cardsContainer = document.getElementById('cardsContainer');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const applyFilterBtn = document.getElementById('applyFilter');

// Carregar cards do servidor
async function loadCards(filters = {}) {
    try {
        const response = await fetch('http://localhost:3000/problem-cards?' + new URLSearchParams(filters));
        const cards = await response.json();
        renderCards(cards);
    } catch (error) {
        console.error('Erro ao carregar cards:', error);
    }
}

// Renderizar cards na interface
function renderCards(cards) {
    cardsContainer.innerHTML = '';
    
    if (cards.length === 0) {
        cardsContainer.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-inbox"></i>
                Nenhum card encontrado
            </div>`;
        return;
    }

    cards.forEach(card => {
        const cardElement = createCardElement(card);
        cardsContainer.appendChild(cardElement);
    });
}

// Criar elemento de card
function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card-item';
    div.dataset.id = card.id;

    const statusText = card.card_status === 'pending' ? 'Pendente' : 'Concluído';
    const statusClass = card.card_status === 'pending' ? 'status-pending' : 'status-completed';

    div.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">Card #${card.id}</h3>
            <span class="card-status ${statusClass}">${statusText}</span>
        </div>
        <div class="card-info">
            <div class="info-item">
                <i class="fas fa-user"></i>
                <span>Chat ID: ${card.chatId}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-calendar"></i>
                <span>Criado em: ${new Date(card.created_at).toLocaleDateString()}</span>
            </div>
        </div>
        <div class="card-actions">
            <a href="${card.card_link}" target="_blank" class="card-link">
                <i class="fas fa-external-link-alt"></i>
                Abrir Card
            </a>
            ${card.card_status === 'pending' ? `
                <button class="complete-btn" onclick="markAsCompleted(${card.id})">
                    <i class="fas fa-check"></i>
                    Concluir
                </button>
            ` : ''}
        </div>
    `;

    return div;
}

// Marcar card como concluído
async function markAsCompleted(cardId) {
    try {
        const response = await fetch(`http://localhost:3000/problem-cards/${cardId}/complete`, {
            method: 'PUT'
        });

        if (response.ok) {
            const card = document.querySelector(`[data-id="${cardId}"]`);
            if (card) {
                card.querySelector('.card-status').className = 'card-status status-completed';
                card.querySelector('.card-status').textContent = 'Concluído';
                card.querySelector('.complete-btn').remove();
            }
        }
    } catch (error) {
        console.error('Erro ao marcar card como concluído:', error);
    }
}

// Event listeners
applyFilterBtn.addEventListener('click', () => {
    const filters = {
        status: statusFilter.value !== 'all' ? statusFilter.value : '',
        date: dateFilter.value
    };
    loadCards(filters);
});

// Atualização em tempo real via WebSocket
socket.on('cardUpdated', (updatedCard) => {
    const cardElement = document.querySelector(`[data-id="${updatedCard.id}"]`);
    if (cardElement) {
        cardElement.replaceWith(createCardElement(updatedCard));
    }
});

// Função para alternar a barra lateral
function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

// Inicializar ao carregar o DOM
document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    loadCards();
});

// Carregar cards iniciais
loadCards();
