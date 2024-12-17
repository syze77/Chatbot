// Esperando pela atualização do status do bot
window.electron.onStatusUpdate((event, data) => {
    console.log('Status recebido no renderizador:', data);

    // Atualiza a interface com os dados recebidos
    document.getElementById('chatStatus').innerHTML = `Chats Ativos: ${data.activeChats}`;
    document.getElementById('waitingList').innerHTML = `Lista de Espera: ${data.waitingList.length}`;
});

// Função para enviar uma atualização de status
function sendStatusUpdate() {
    const statusData = {
        activeChats: 5, // exemplo de chats ativos
        waitingList: [{ id: 1, nome: 'João' }] // exemplo de usuários na fila
    };
    
    // Envia o status para o processo principal
    window.electron.sendStatusUpdate(statusData);
}

// Chama a função de atualização quando necessário
sendStatusUpdate();