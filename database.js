const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(path.join(__dirname, 'bot_data.db'), (err) => {
            if (err) {
                console.error('Erro ao abrir o banco de dados:', err);
                reject(err);
                return;
            }
            
            console.log('Conectado ao banco de dados SQLite.');
            
            // Create tables if they don't exist
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS problems (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    name TEXT,
                    city TEXT,
                    position TEXT,
                    school TEXT,
                    chatId TEXT,
                    description TEXT,
                    status TEXT DEFAULT 'pending',
                    date_completed TEXT DEFAULT NULL,
                    attendant_id TEXT
                )`, (err) => {
                    if (err) {
                        console.error('Error creating table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Database initialized successfully');
                    resolve(db);
                });
            });
        });
    });
}

module.exports = {
    initializeDatabase,
    getDatabase: () => db
};
