const socket = io('http://localhost:3000');

socket.on('statusUpdate', (statusData) => {
    updateUI(statusData);
    fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart);
});

socket.on('userProblem', (problemDescription, chatId, userName) => {
    displayProblem(problemDescription, chatId, userName);
    showNotification('Novo Problema Relatado', problemDescription);
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
    updateSection(data.activeChats, activeChatList, 'active');
    updateSection(data.waitingList, waitingListContainer, 'waiting', true);
    updateSection(data.problems, problemListContainer, 'problem');
}

// Display a reported problem
function displayProblem(problemDescription, chatId, userName) {
    const emptyMessage = problemListContainer.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const problemItem = document.createElement('div');
    problemItem.classList.add('chat-item', 'problem-item');
    problemItem.innerHTML = `<strong>${userName}:</strong> ${problemDescription}`;
    problemItem.addEventListener('click', () => {
        window.electron.openWhatsAppChat(chatId);
    });
    
    const bellIcon = document.createElement('i');
    bellIcon.classList.add('fas', 'fa-bell', 'bell-icon');
    problemItem.appendChild(bellIcon);
    
    problemListContainer.appendChild(problemItem);
}

// Show a notification
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

// Update a section of the UI
function updateSection(list, container, status, includePosition = false) {
    container.innerHTML = '';
    if (list && list.length > 0) {
        list.forEach(async (item, index) => {
            const chatItem = await createChatItem(item, status);
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

    const name = document.createElement('div');
    name.innerHTML = `<span class="info-label">Nome:</span> ${userInfo.name}`;
    chatItem.appendChild(name);

    const role = document.createElement('div');
    role.innerHTML = `<span class="info-label">Cargo:</span> ${userInfo.position}`;
    chatItem.appendChild(role);

    const city = document.createElement('div');
    city.innerHTML = `<span class="info-label">Cidade:</span> ${userInfo.city}`;
    chatItem.appendChild(city);

    const school = document.createElement('div');
    school.innerHTML = `<span class="info-label">Escola:</span> ${userInfo.school}`;
    chatItem.appendChild(school);

    return chatItem;
}

// Fetch data from the SQLite database and update charts
async function fetchDataAndUpdateCharts(dailyProblemsChart, monthlyProblemsChart) {
    const response = await fetch('http://localhost:3000/getProblemsData');
    const data = await response.json();

    updateDailyChart(data, dailyProblemsChart);
    updateMonthlyChart(data, monthlyProblemsChart);
}

// Update the daily problems chart
function updateDailyChart(data, chart) {
    const labels = data.length > 1 ? data.map(row => row.date) : ['No Data'];
    const values = data.length > 1 ? data.map(row => row.description) : [0];

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
}

// Update the monthly problems chart
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
    const data = await response.json();
    updateUIWithProblemsData(data);
  } catch (error) {
    console.error('Erro ao buscar dados dos problemas:', error);
  }
}

// Update the UI with problems data
function updateUIWithProblemsData(data) {
  const problemsContainer = document.getElementById('problems-container');
  problemsContainer.innerHTML = ''; // Clear existing content

  data.forEach(problem => {
    const problemElement = document.createElement('div');
    problemElement.className = 'problem-item';
    problemElement.innerHTML = `
      <div><strong>ID:</strong> ${problem.id}</div>
      <div><strong>Descrição:</strong> ${problem.description}</div>
      <div><strong>Status:</strong> ${problem.status}</div>
      <div><strong>Data:</strong> ${problem.date}</div>
      <div><strong>Nome:</strong> ${problem.name}</div>
      <div><strong>Cargo:</strong> ${problem.position}</div>
      <div><strong>Cidade:</strong> ${problem.city}</div>
      <div><strong>Escola:</strong> ${problem.school}</div>
    `;
    problemsContainer.appendChild(problemElement);
  });
}

// Call the function to fetch data and update the UI when the page content is loaded
document.addEventListener('DOMContentLoaded', fetchDataAndUpdateUI);