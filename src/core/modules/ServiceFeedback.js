const { getDatabase } = require('../../utils/database.js');
const finished = require('../messages/finished.json');

class ServiceFeedback {
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async handleFeedback(conn, chatId, messageText, io) {
        try {
            const rating = parseInt(messageText);
            if (rating >= 1 && rating <= 5) {
                // Atualizar status primeiro
                await this.updateChatStatus(chatId);
                
                // Salvar o feedback
                await this.saveFeedback(chatId, rating);
                
                // Enviar mensagens finais
                await conn.client.sendMessage({
                    to: chatId,
                    body: finished.feedbackThank,
                    options: { type: 'sendText' }
                });

                // Esperar 2 segundos
                await this.delay(15000);

                await conn.client.sendMessage({
                    to: chatId,
                    body: "Atendimento finalizado. Se precisar de mais algum atendimento, envie suas informações novamente no formato:",
                    options: { type: 'sendText' }
                });

                // Emitir eventos na ordem correta
                const statusData = await this.getStatusUpdate();
                io?.emit('statusUpdate', statusData);
                io?.emit('feedbackReceived', { chatId });
                io?.emit('forceUpdate');

                return true;
            } else {
                await conn.client.sendMessage({
                    to: chatId,
                    body: finished.feedbackInvalid,
                    options: { type: 'sendText' }
                });
                return false;
            }
        } catch (error) {
            console.error('Erro ao processar feedback:', error);
            return false;
        }
    }

    static async saveFeedback(chatId, rating) {
        return new Promise((resolve, reject) => {
            getDatabase().run(
                `UPDATE problems 
                 SET feedback_rating = ?
                 WHERE chatId = ? AND status = 'completed'`,
                [rating, chatId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    static async updateChatStatus(chatId) {
        return new Promise((resolve, reject) => {
            getDatabase().run(
                `UPDATE problems 
                 SET status = 'completed',
                 date_completed = DATETIME('now')
                 WHERE chatId = ? AND status IN ('active', 'pending')`,
                [chatId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    static async getStatusUpdate() {
        return new Promise((resolve, reject) => {
            getDatabase().all(
                `SELECT 
                    (SELECT json_group_array(json_object(
                        'chatId', chatId,
                        'name', name,
                        'position', position,
                        'city', city,
                        'school', school,
                        'status', status,
                        'description', description
                    )) FROM problems WHERE status = 'active') as activeChats,
                    (SELECT json_group_array(json_object(
                        'chatId', chatId,
                        'name', name,
                        'position', position,
                        'city', city,
                        'school', school,
                        'status', status,
                        'description', description
                    )) FROM problems WHERE status = 'waiting') as waitingList,
                    (SELECT json_group_array(json_object(
                        'chatId', chatId,
                        'name', name,
                        'position', position,
                        'city', city,
                        'school', school,
                        'status', status,
                        'description', description
                    )) FROM problems WHERE status = 'pending') as problems`,
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const result = {
                            activeChats: JSON.parse(rows[0].activeChats || '[]'),
                            waitingList: JSON.parse(rows[0].waitingList || '[]'),
                            problems: JSON.parse(rows[0].problems || '[]')
                        };
                        resolve(result);
                    }
                }
            );
        });
    }

    static async requestFeedback(conn, chatId) {
        try {
            // Atualizar status primeiro
            await this.updateChatStatus(chatId);
            
            // Atualizar UI antes de solicitar feedback
            const statusData = await this.getStatusUpdate();
            global.io?.emit('statusUpdate', statusData);
            global.io?.emit('chatCompleted', { chatId });
            
            // Depois solicitar feedback
            await conn.client.sendMessage({
                to: chatId,
                body: finished.feedbackRequest,
                options: { type: 'sendText' }
            });
            
            return true;
        } catch (error) {
            console.error('Erro ao solicitar feedback:', error);
            return false;
        }
    }
}

module.exports = ServiceFeedback;
