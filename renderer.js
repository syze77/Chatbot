window.electron.onStatusUpdate((event, statusData) => {
    updateUI(statusData);
    fetchDataAndUpdateCharts(); // Update charts when status is updated
});

window.electron.onUserProblem((event, problemDescription, chatId, userName) => {
    displayProblem(problemDescription, chatId, userName);
    showNotification('Novo Problema Relatado', problemDescription);
    playNotificationSound();
    showBellIcon();
    fetchDataAndUpdateCharts(); // Update charts when a new problem is reported
});

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

// Function to fetch data from Excel file and update charts
async function fetchDataAndUpdateCharts() {
    const response = await fetch('bot_data.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });

    const worksheet = workbook.Sheets['Problems'];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    updateDailyChart(jsonData);
    updateMonthlyChart(jsonData);
}

function updateDailyChart(data) {
    const labels = data.length > 1 ? data.slice(1).map(row => row[0]) : ['No Data'];
    const values = data.length > 1 ? data.slice(1).map(row => row[5]) : [0];

    const ctx = document.getElementById('dailyProblemsChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Problemas por Dia',
                data: values,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Problemas por Dia'
                }
            }
        }
    });
}

function updateMonthlyChart(data) {
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const monthlyData = new Array(12).fill(0);

    if (data.length > 1) {
        data.slice(1).forEach(row => {
            const date = new Date(row[0]);
            const month = date.getMonth();
            monthlyData[month]++;
        });
    }

    const ctx = document.getElementById('monthlyProblemsChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: monthNames,
            datasets: [{
                label: 'Problemas por Mês',
                data: monthlyData,
                backgroundColor: [
                    'rgb(255, 99, 132)',
                    'rgb(54, 162, 235)',
                    'rgb(255, 205, 86)',
                    'rgb(75, 192, 192)',
                    'rgb(153, 102, 255)',
                    'rgb(255, 159, 64)',
                    'rgb(255, 99, 132)',
                    'rgb(54, 162, 235)',
                    'rgb(255, 205, 86)',
                    'rgb(75, 192, 192)',
                    'rgb(153, 102, 255)',
                    'rgb(255, 159, 64)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Problemas por Mês'
                }
            }
        }
    });
}

// Call the function to fetch data and update charts initially
fetchDataAndUpdateCharts();
