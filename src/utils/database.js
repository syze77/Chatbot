// Importação dos módulos necessários
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Variável para armazenar a conexão com o banco de dados
let db;

// Função de inicialização do banco de dados
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const dataDir = path.join(__dirname, '../data');
        const dbPath = path.join(dataDir, 'bot_data.db');

        // Verifica se o diretório 'data' existe, caso contrário, cria-o
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Erro ao abrir o banco de dados:', err);
                reject(err);
                return;
            }

            console.log('Conectado ao banco de dados SQLite.');

            // Sempre criar/verificar todas as tabelas, independente se o banco é novo ou não
            db.serialize(() => {
                // Criação da tabela problem_cards
                db.run(`CREATE TABLE IF NOT EXISTS problem_cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chatId TEXT NOT NULL,
                    card_link TEXT NOT NULL,
                    card_status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
                    updated_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
                )`, (err) => {
                    if (err) {
                        console.error('Erro ao criar tabela problem_cards:', err);
                        reject(err);
                        return;
                    }
                    console.log('Tabela problem_cards verificada/criada com sucesso');
                });

                // Criação das outras tabelas
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
                    attendant_id TEXT,
                    feedback_rating INTEGER DEFAULT NULL
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS ignored_contacts (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    number TEXT,
                    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`);

                // Adicionar índices para melhor performance
                db.run(`CREATE INDEX IF NOT EXISTS idx_problem_cards_chatid ON problem_cards(chatId)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_problem_cards_status ON problem_cards(card_status)`);
                
                resolve(db);
            });
        });
    });
}

function queryDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Exportação das funções do módulo
module.exports = {
    initializeDatabase,    
    getDatabase: () => db,
    queryDatabase,
    db  
};
