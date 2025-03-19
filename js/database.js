// Importação dos módulos necessários
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Variável para armazenar a conexão com o banco de dados
let db;

// Função de inicialização do banco de dados
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Conectar ao banco de dados   
        db = new sqlite3.Database(path.join(__dirname, './bot_data.db'), (err) => {
            if (err) {
                console.error('Erro ao abrir o banco de dados:', err);
                reject(err);
                return;
            }
            
            console.log('Conectado ao banco de dados SQLite.');
            
            // Criar tabelas caso não existam
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
        });
    });
}

// Exportação das funções do módulo
module.exports = {
    initializeDatabase,    
    getDatabase: () => db  
};
