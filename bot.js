const venom = require('venom-bot');

venom
  .create({
    session: 'whatsapp-session',
    multidevice: true,
    headless: true,
    useChrome: true,
  })
  .then((client) => start(client))
  .catch((error) => {
    console.error('Erro ao iniciar o bot:', error);
  });

function start(client) {
  console.log('Bot iniciado com sucesso!');

  client.onMessage((message) => {
    console.log(`Mensagem recebida: ${message.body}`);
  });
}

// Função para iniciar o bot
async function start(client) {
  try {
    // Manipulando o QR Code
    client.onQr((qr) => {
      console.log('QR Code recebido. Escaneie para autenticar.');
      console.log(qr); // Exibe o QR Code no terminal
      // Aqui você pode integrar com o Electron ou outro frontend
    });

    // Escutando o estado da conexão
    client.onStateChange(async (state) => {
      console.log('Estado da conexão:', state);

      // Lidar com estado de conflito ou se a conexão não foi lançada
      if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
        await client.useHere(); // Resolve conflitos
      }
    });

    // Escutando as mensagens recebidas
    client.onMessage(async (message) => {
      console.log(`Mensagem recebida de ${message.sender.pushname || "Desconhecido"}: ${message.body}`);

      // Responde com base na mensagem recebida
      if (message.body.toLowerCase() === 'olá') {
        await client.sendText(message.from, 'Olá! Você está falando com o Suporte da Redenet. Como posso ajudar?');
      } else {
        await client.sendText(message.from, 'Desculpe, não entendi sua mensagem.');
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar o bot no método start:', error);
  }
}
