if (window.electron) {
    window.electron.onStatusUpdate((event, statusData) => {
        updateUI(statusData);
        fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart); // Update charts when status is updated
    });

    window.electron.onUserProblem((event, problemDescription, chatId, userName) => {
        displayProblem(problemDescription, chatId, userName);
        showNotification('Novo Problema Relatado', problemDescription);
        playNotificationSound();
        showBellIcon();
        fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart); // Update charts when a new problem is reported
    });

    window.electron.getCompletedAttendances((event, completedAttendances) => {
        loadCompletedAttendances(completedAttendances);
    });

    window.electron.deleteCompletedAttendance = (chatId) => {
        ipcRenderer.send('deleteCompletedAttendance', chatId);
    };
}

const notificationSound = document.getElementById('notification-sound');
const activeChatList = document.getElementById('active-chat-list');
const waitingListContainer = document.getElementById('waiting-list-container');
const problemListContainer = document.getElementById('problem-list-container');

function updateUI(data) {
    updateSection(data.activeChats, activeChatList, 'active');
    updateSection(data.waitingList, waitingListContainer, 'waiting', true);
    updateSection(data.problems, problemListContainer, 'problem');
}

function displayProblem(problemDescription, chatId, userName) {
    const emptyMessage = problemListContainer.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const problemItem = document.createElement('div');
    problemItem.classList.add('chat-item', 'problem-item');
    problemItem.innerHTML = `<strong>${userName}:</strong> ${problemDescription}`;
    problemItem.addEventListener('click', () => {
        console.log(`Index: Problem item clicked with chatId: ${chatId}`);
        window.electron.openWhatsAppChat(chatId);
    });
    
    const bellIcon = document.createElement('i');
    bellIcon.classList.add('fas', 'fa-bell', 'bell-icon');
    problemItem.appendChild(bellIcon);
    
    problemListContainer.appendChild(problemItem);
}

function showNotification(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body: message });
            }
        });
    }
}

function playNotificationSound() {
    notificationSound.play();
}

function showBellIcon() {
    const problemHeader = document.querySelector('.status-header i.fa-exclamation-triangle');
    if (problemHeader) {
        problemHeader.classList.add('fa-bell');
    }
}

function updateSection(list, container, status, includePosition = false) {
    container.innerHTML = '';
    if (list && list.length > 0) {
        list.forEach((item, index) => {
            const chatItem = createChatItem(item, status);
            if (includePosition) {
                const position = document.createElement('div');
                position.classList.add('info-label');
                position.innerHTML = `Posição na fila: ${index + 1}`;
                chatItem.appendChild(position);
            }
            container.appendChild(chatItem);
        });
    } else {
        container.innerHTML = '<div class="empty-message">Nenhum item disponível.</div>';
    }
}

function createChatItem(user, status) {
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

    const name = document.createElement('div');
    name.innerHTML = `<span class="info-label">Nome:</span> ${user.name}`;
    chatItem.appendChild(name);

    const role = document.createElement('div');
    role.innerHTML = `<span class="info-label">Cargo:</span> ${user.position}`;
    chatItem.appendChild(role);

    const city = document.createElement('div');
    city.innerHTML = `<span class="info-label">Cidade:</span> ${user.city}`;
    chatItem.appendChild(city);

    const school = document.createElement('div');
    school.innerHTML = `<span class="info-label">Escola:</span> ${user.school}`;
    chatItem.appendChild(school);

    return chatItem;
}

// Function to fetch data from SQLite database and update charts
async function fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart) {
    const response = await fetch('/getProblemsData'); // Adjust the endpoint as needed
    const data = await response.json();

    updateDailyChart(data, dailyProblemsChart);
    updateMonthlyChart(data, monthlyProblemsChart);
}

function updateDailyChart(data, chart) {
    const labels = data.length > 1 ? data.map(row => row.date) : ['No Data'];
    const values = data.length > 1 ? data.map(row => row.description) : [0];

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
}

function updateMonthlyChart(data, chart) {
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const monthlyData = new Array(12).fill(0);

    if (data.length > 1) {
        data.forEach(row => {
            const date = new Date(row.date);
            const month = date.getMonth();
            monthlyData[month]++;
        });
    }

    chart.data.labels = monthNames;
    chart.data.datasets[0].data = monthlyData;
    chart.update();
}

// Function to load completed attendances
function loadCompletedAttendances(completedAttendances) {
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
            <input type="checkbox" data-chat-id="${attendance.chatId}">
        `;
        completedList.appendChild(item);
    });
}