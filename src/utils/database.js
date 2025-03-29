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

        const dbExists = fs.existsSync(dbPath);

        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Erro ao abrir o banco de dados:', err);
                reject(err);
                return;
            }

            console.log(dbExists ? 'Conectado ao banco de dados SQLite existente.' : 'Criando novo banco de dados SQLite.');

            // Só cria as tabelas se o banco for novo
            if (!dbExists) {
                db.serialize(() => {
                    // Definição da estrutura da tabela 'problems'
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
                            console.error('Erro ao criar tabela:', err);
                            reject(err);
                            return;
                        }
                        console.log('Banco de dados inicializado com sucesso');
                    });

                    db.run(`CREATE TABLE IF NOT EXISTS ignored_contacts (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        number TEXT,
                        date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )`, (err) => {
                        if (err) {
                            console.error('Erro ao criar tabela:', err);
                            reject(err);
                            return;
                        }
                        resolve(db);
                    });
                });
            } else {
                resolve(db);
            }
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
