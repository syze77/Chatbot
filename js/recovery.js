const { getDatabase } = require('./database.js');

let userState = {};

function handleRecovery(message) {
    const userId = message.from;
    const messageText = message.body.toLowerCase().trim();

    // Se for o comando de recuperação
    if (messageText === '/recuperar') {
        userState[userId] = { step: 'cpf' };
        return 'Por favor, digite seu CPF (apenas os 11 números, sem formatação):';
    }

    // Se o usuário está em processo de recuperação
    if (userState[userId]) {
        if (userState[userId].step === 'cpf') {
            // Validar CPF (apenas números)
            if (!/^\d{11}$/.test(messageText)) {
                return 'CPF inválido. Por favor, digite apenas os 11 números do seu CPF:';
            }
            userState[userId].cpf = messageText;
            userState[userId].step = 'email';
            return 'Agora, digite o email que foi usado para fazer o cadastro:';
        }

        if (userState[userId].step === 'email') {
            // Validar formato do email
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(messageText)) {
                return 'Email inválido. Por favor, digite um email válido:';
            }
            const email = messageText;
            const cpf = userState[userId].cpf;

            return new Promise((resolve, reject) => {
                getDatabase().get(
                    'SELECT senhas FROM confidencial WHERE cpf = ? AND email = ?',
                    [cpf, email],
                    (err, row) => {
                        if (err) {
                            delete userState[userId];
                            resolve('Erro ao verificar as informações. Tente novamente com /recuperar');
                            return;
                        }

                        if (row && row.senhas) {
                            const senha = row.senhas;
                            delete userState[userId];
                            resolve(`Sua senha é: ${senha}`);
                        } else {
                            delete userState[userId];
                            resolve('CPF e/ou email não encontrados. Por favor, tente novamente com /recuperar');
                        }
                    }
                );
            });
        }
    }

    return null;
}

function isInRecoveryProcess(userId) {
    return !!userState[userId];
}

module.exports = { handleRecovery, isInRecoveryProcess };
