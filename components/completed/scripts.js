async function loadAttendants() {
    try {
        const response = await fetch('http://localhost:3000/api/statistics/getCompletedAttendances');
        const attendances = await response.json();
        const uniqueAttendants = [...new Set(attendances.map(a => a.attendant))].filter(Boolean);
        
        const filterAttendant = document.getElementById('filterAttendant');
        uniqueAttendants.forEach(attendant => {
            if (!filterAttendant.querySelector(`option[value="${attendant}"]`)) {
                const option = document.createElement('option');
                option.value = attendant;
                option.textContent = attendant;
                filterAttendant.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar atendentes:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    loadCompletedAttendances();
    loadAttendants();
});

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

function toggleTheme() {
    Sidebar.toggleTheme();
}

function deleteSelected() {
    const checkboxes = document.querySelectorAll('.completed-item input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
        const chatId = checkbox.dataset.chatId;
        window.electron.deleteCompletedAttendance(chatId);
        checkbox.closest('.completed-item').remove();
    });
}

async function loadCompletedAttendances() {
    try {
        console.log('Fetching completed attendances...');
        const response = await fetch('http://localhost:3000/api/statistics/getCompletedAttendances');
        console.log('Response status:', response.status);
        const completedAttendances = await response.json();
        console.log('Received attendances:', completedAttendances);
        displayCompletedAttendances(completedAttendances);
    } catch (error) {
        console.error('Erro ao carregar atendimentos:', error);
        displayCompletedAttendances([]);
    }
}

function formatDate(dateString) {
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Fortaleza',
    };
    return new Date(dateString).toLocaleString('pt-BR', options);
}

function calculateDuration(durationMinutes) {
    if (durationMinutes < 60) {
        return `${durationMinutes} minutos`;
    }
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (hours < 24) {
        return `${hours}h ${minutes}min`;
    }
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h ${minutes}min`;
}

function displayCompletedAttendances(attendances) {
    const completedList = document.getElementById('completed-list');
    completedList.innerHTML = '';

    if (!attendances || attendances.length === 0) {
        completedList.innerHTML = '<div class="no-results">Nenhum atendimento concluído encontrado.</div>';
        return;
    }

    attendances.forEach(attendance => {
        const duration = calculateDuration(attendance.duration_minutes || 0);
        
        const item = document.createElement('div');
        item.className = 'completed-item';
        item.innerHTML = `
            <div class="user-info-section">
                <div class="user-name">${attendance.name || 'Sem nome'}</div>
                <div class="user-details"><i class="fas fa-user-tag"></i> ${attendance.position || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-map-marker-alt"></i> ${attendance.city || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-school"></i> ${attendance.school || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-headset"></i> Atendente: ${attendance.attendant || 'Não atribuído'}</div>
            </div>
            
            <div class="problem-section">
                <div class="problem-title">Problema Relatado</div>
                <div class="problem-description">${attendance.description || 'Sem descrição'}</div>
            </div>
            
            <div class="time-section">
                <div class="time-info">
                    <i class="fas fa-clock"></i> Início<br>
                    <strong>${attendance.date || 'Data não registrada'}</strong>
                </div>
                <div class="time-info">
                    <i class="fas fa-check-circle"></i> Conclusão<br>
                    <strong>${attendance.date_completed || 'Data não registrada'}</strong>
                </div>
                <div class="duration-badge">
                    <i class="fas fa-hourglass-end"></i> ${duration}
                </div>
            </div>
        `;
        completedList.appendChild(item);
    });

    console.log('Attendances displayed:', attendances.length);
}

async function filterByDate(date) {
    if (!date) return loadCompletedAttendances();
    
    try {
        const response = await fetch(`http://localhost:3000/api/statistics/getCompletedAttendances?date=${date}`);
        const filteredAttendances = await response.json();
        displayCompletedAttendances(filteredAttendances);
    } catch (error) {
        console.error('Erro ao filtrar por data:', error);
    }
}

async function filterByPosition(position) {
    if (!position) return loadCompletedAttendances();
    
    try {
        const response = await fetch(`http://localhost:3000/api/statistics/getCompletedAttendances?position=${position}`);
        const filteredAttendances = await response.json();
        displayCompletedAttendances(filteredAttendances);
    } catch (error) {
        console.error('Erro ao filtrar por cargo:', error);
    }
}

async function filterByAttendant(attendant) {
    if (!attendant) return loadCompletedAttendances();
    
    try {
        const response = await fetch(`http://localhost:3000/api/statistics/getCompletedAttendances?attendant=${attendant}`);
        const filteredAttendances = await response.json();
        displayCompletedAttendances(filteredAttendances);
    } catch (error) {
        console.error('Erro ao filtrar por atendente:', error);
    }
}