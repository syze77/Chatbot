const venom = require('venom-bot');

// Cria a sessão persistente
venom
  .create({
    session: 'whatsapp-session', // Nome da sessão
    multidevice: true, // Suporte a múltiplos dispositivos
  })
  .then((client) => start(client))
  .catch((error) => {
    console.error('Erro ao iniciar o bot:', error);
  });

// Função para iniciar o bot
function start(client) {
  console.log('Bot iniciado com sucesso!');
  
  // Envia uma mensagem de boas-vindas automaticamente quando uma nova mensagem for recebida
  client.onMessage((message) => {
    console.log(`Mensagem recebida de ${message.sender.pushname}: ${message.body}`);
    
    // Responde com base na mensagem recebida
    if (message.body.toLowerCase() === 'olá') {
      client.sendText(message.from, 'Olá!, você esta falando com o Suporte da Redenet, como posso ajudar?');
    } else {
      client.sendText(message.from, 'Desculpe, não entendi sua mensagem.');
    }
  });

  // Registra o QR Code caso o bot precise autenticar pela primeira vez
  client.on('qr', (qr) => {
    console.log('QR Code recebido:', qr);
  });

  // Escuta a mudança de estado da conexão
  client.onStateChange((state) => {
    console.log('Estado da conexão:', state);
  });
}
