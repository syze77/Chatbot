async function getRecentContacts(conn) {
    try {
        if (!conn || !conn.client) {
            console.error('Conexão ou cliente não disponível');
            return [];
        }

        console.log('Iniciando busca de contatos...');

        try {
            const chats = await conn.client.getAllChats();
            console.log('Chats obtidos:', chats?.length || 0);

            if (!chats || !Array.isArray(chats)) {
                console.error('Chats inválidos ou vazios');
                return [];
            }

            // Filtrar e mapear os contatos
            const contacts = chats
                .filter(chat => {
                    // Verificar se é um chat individual e não um grupo
                    const isGroup = typeof chat.id === 'string' ? 
                        chat.id.includes('g.us') : 
                        (chat.id?.remote?.includes('g.us') || chat.id?.server === 'g.us');
                    
                    return chat && chat.id && !isGroup;
                })
                .map(chat => {
                    try {
                        console.log('Processando chat:', chat.id);
                        
                        // Extrair ID do chat de forma segura
                        let chatId, number;
                        if (typeof chat.id === 'string') {
                            chatId = chat.id;
                            number = chat.id.split('@')[0];
                        } else if (chat.id?.remote) {
                            chatId = chat.id.remote;
                            number = chat.id.remote.split('@')[0];
                        } else if (chat.id?._serialized) {
                            chatId = chat.id._serialized;
                            number = chat.id.user;
                        } else {
                            chatId = `${chat.id.user}@c.us`;
                            number = chat.id.user;
                        }

                        return {
                            id: chatId,
                            name: chat.name || chat.contact?.pushname || number,
                            number: number,
                            
                            lastMessageTime: (() => {
                                const timestamp = chat.lastMessageTime || chat.t;
                              
                                if (timestamp && timestamp.toString().length === 13) {
                                    return Math.floor(timestamp / 1000);
                                }
                                
                                return timestamp || Math.floor(Date.now() / 1000);
                            })(),
                            unreadCount: chat.unreadCount || 0
                        };
                    } catch (err) {
                        console.error('Erro ao processar chat específico:', err);
                        return null;
                    }
                })
                .filter(contact => contact !== null)
                .sort((a, b) => b.lastMessageTime - a.lastMessageTime);

            console.log('Total de contatos processados:', contacts.length);
            return contacts;

        } catch (err) {
            console.error('Erro ao processar chats:', err);
            return [];
        }
    } catch (error) {
        console.error('Erro geral em getRecentContacts:', error);
        return [];
    }
}

module.exports = {
    getRecentContacts
};
