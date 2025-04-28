const { getDatabase } = require('../../utils/database.js');
const finished = require('../messages/finished.json');

class ServiceFeedback {
    static async handleFeedback(conn, chatId, messageText, io) {
        try {
            const rating = parseInt(messageText);
            if (rating >= 1 && rating <= 5) {
                await this.saveFeedback(chatId, rating);
                await conn.client.sendMessage({
                    to: chatId,
                    body: finished.feedbackThank,
                    options: { type: 'sendText' }
                });
                await conn.client.sendMessage({
                    to: chatId,
                    body: "Se precisar de mais algum atendimento, envie suas informações novamente no formato:",
                    options: { type: 'sendText' }
                });

                // Emitir evento para fechar o chat na UI
                io.emit('endChat', { chatId });
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
                 SET feedback_rating = ?,
                     date_completed = datetime('now')
                 WHERE chatId = ? AND status = 'completed'`,
                [rating, chatId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    static async requestFeedback(conn, chatId) {
        try {
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
