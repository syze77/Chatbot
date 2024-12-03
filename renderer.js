const { ipcRenderer } = require('electron');

// Escuta o evento 'statusUpdate' e atualiza a interface
ipcRenderer.on('statusUpdate', (event, data) => {
    const activeChatsElement = document.getElementById('activeChats');
    const waitingListElement = document.getElementById('waitingList');

    // Atualiza o número de chats ativos
    activeChatsElement.textContent = `Chats Ativos: ${data.activeChats}`;

    // Limpa a lista de espera
    waitingListElement.innerHTML = '';

    // Popula a lista de espera dinamicamente
    data.waitingList.forEach((userId, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = `Usuário ${index + 1}: ${userId}`;
        waitingListElement.appendChild(listItem);
    });
});
