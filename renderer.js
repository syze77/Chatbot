const { ipcRenderer } = require('electron');

// Função para receber atualizações de status do back-end (main.js) e atualizar a interface
ipcRenderer.on('statusUpdate', (event, statusData) => {
  updateUI(statusData);
});

// Função que atualiza a interface com os dados recebidos do back-end
function updateUI(data) {
  // Atualiza atendimentos ativos
  const activeChatList = document.getElementById('active-chat-list');
  activeChatList.innerHTML = ''; // Limpa o conteúdo anterior
  if (data.activeChats && data.activeChats.length > 0) {
    data.activeChats.forEach(chat => {
      const chatItem = document.createElement('div');
      chatItem.className = 'chat-item active-chat';
      chatItem.textContent = `${chat.name} - ${chat.role} - ${chat.school}`;
      activeChatList.appendChild(chatItem);
    });
  } else {
    activeChatList.innerHTML = '<div class="empty-message">Nenhum atendimento ativo no momento.</div>';
  }

  // Atualiza a fila de espera
  const waitingListContainer = document.getElementById('waiting-list-container');
  waitingListContainer.innerHTML = ''; // Limpa o conteúdo anterior
  if (data.waitingList && data.waitingList.length > 0) {
    data.waitingList.forEach(user => {
      const userItem = document.createElement('div');
      userItem.className = 'chat-item waiting-list';
      userItem.textContent = `${user.name} - ${user.role} - ${user.school}`;
      waitingListContainer.appendChild(userItem);
    });
  } else {
    waitingListContainer.innerHTML = '<div class="empty-message">Nenhum usuário na fila de espera.</div>';
  }
}
