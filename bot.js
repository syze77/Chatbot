const venom = require('venom-bot');

// Criar a sessão do bot
venom
  .create({
    session: 'whatsapp-session',  // Nome da sessão
    multidevice: false,           // Desativa o suporte a multi-dispositivos
    headless: false,              // Executa em modo headless (interface gráfica)
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-default-apps',
    ],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Caminho para o Chrome
    useChromium: true,            // Usar o Chromium em vez do Chrome
  })
  .then((client) => {
    console.log('Bot iniciado com sucesso!');
    initializeBot(client); // Passar o client para inicializar as interações do bot
  })
  .catch((error) => {
    console.error('Erro ao iniciar o bot:', error);
    console.error('Detalhes do erro:', error.stack);  // Log mais detalhado para depuração
  });

// Função para inicializar o bot
function initializeBot(client) {
  // Captura o QR Code
  client.on('qr', (qr) => {
    console.log('QR Code recebido. Escaneie para autenticar:');
    console.log(qr);  // Exibe o QR Code no terminal
  });

  // Estado da conexão
  client.on('stateChange', (state) => {
    console.log('Estado da conexão:', state);

    // Resolver conflitos de sessão (se houver)
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
      client.useHere();
    }
  });

  // Receber mensagens
  client.on('message', (message) => {
    console.log(`Mensagem recebida de ${message.sender.pushname || 'Desconhecido'}: ${message.body}`);

    // Responder com base na mensagem recebida
    handleIncomingMessage(client, message);
  });
}

// Função para processar mensagens recebidas
function handleIncomingMessage(client, message) {
  const lowerCaseMessage = message.body ? message.body.toLowerCase() : '';

  if (lowerCaseMessage === 'oi') {
    client
      .sendText(message.from, 'Olá! Você está falando com o Suporte da Redenet. Como posso ajudar?')
      .then(() => console.log('Resposta enviada com sucesso!'))
      .catch((error) => console.error('Erro ao enviar mensagem:', error));
  } else {
    client
      .sendText(message.from, 'Desculpe, não entendi sua mensagem.')
      .then(() => console.log('Resposta enviada com sucesso!'))
      .catch((error) => console.error('Erro ao enviar mensagem:', error));
  }
}
