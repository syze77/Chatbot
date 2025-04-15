const { getDatabase } = require('../../utils/database.js');
const { getRecentContacts, getBotConnection } = require('../bot.js');

async function executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        getDatabase().all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function getAllContacts() {
    try {
        const botConn = getBotConnection();
        if (!botConn) {
            return { contacts: [], ignoredContacts: [] };
        }

        const contacts = await getRecentContacts(botConn);
        const ignoredContacts = await executeQuery(
            'SELECT id FROM ignored_contacts',
            []
        );

        return {
            contacts,
            ignoredContacts: ignoredContacts.map(row => row.id)
        };
    } catch (error) {
        console.error('Erro ao obter contatos:', error);
        return { contacts: [], ignoredContacts: [] };
    }
}

async function saveIgnoredContacts(newContacts) {
    try {
        if (!Array.isArray(newContacts)) {
            throw new Error('Contatos devem ser um array');
        }

        const db = getDatabase();
        
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', err => err ? reject(err) : resolve());
        });

        try {
            const existingContacts = await executeQuery('SELECT id FROM ignored_contacts');
            const newContactIds = new Set(newContacts.map(c => c.id));
            const contactsToRemove = existingContacts
                .map(row => row.id)
                .filter(id => !newContactIds.has(id));

            if (contactsToRemove.length > 0) {
                const placeholders = contactsToRemove.map(() => '?').join(',');
                await executeQuery(
                    `DELETE FROM ignored_contacts WHERE id IN (${placeholders})`,
                    contactsToRemove
                );
            }

            const stmt = db.prepare('INSERT OR REPLACE INTO ignored_contacts (id, name, number) VALUES (?, ?, ?)');

            for (const contact of newContacts) {
                await new Promise((resolve, reject) => {
                    stmt.run([contact.id, contact.name, contact.number], err => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }

            await new Promise((resolve, reject) => {
                stmt.finalize(err => err ? reject(err) : resolve());
            });

            await new Promise((resolve, reject) => {
                db.run('COMMIT', err => err ? reject(err) : resolve());
            });

            const totalIgnored = await executeQuery('SELECT COUNT(*) as count FROM ignored_contacts')
                .then(rows => rows[0].count);

            return {
                success: true,
                added: newContacts.length,
                removed: contactsToRemove.length,
                total: totalIgnored,
                message: 'Lista de contatos ignorados atualizada com sucesso'
            };

        } catch (error) {
            await new Promise(resolve => db.run('ROLLBACK', resolve));
            throw error;
        }
    } catch (error) {
        console.error('Erro ao atualizar contatos ignorados:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    getAllContacts,
    saveIgnoredContacts
};