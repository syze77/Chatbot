const express = require('express');
const router = express.Router();
const { getDatabase } = require('../../utils/database');

router.get('/test', (req, res) => {
    console.log('Test route accessed');
    res.json({ status: 'API is working' });
});

// Criar novo card
router.post('/create', async (req, res) => {
    try {
        console.log('Recebendo requisição:', req.body);
        const { chatId, cardLink } = req.body;
        
        if (!chatId || !cardLink) {
            console.error('Dados inválidos:', { chatId, cardLink });
            return res.status(400).json({ error: 'chatId e cardLink são obrigatórios' });
        }

        const db = getDatabase();
        const query = `INSERT INTO problem_cards (chatId, card_link) VALUES (?, ?)`;
        
        db.run(query, [chatId, cardLink], function(err) {
            if (err) {
                console.error('Erro SQL ao inserir card:', err);
                return res.status(500).json({ error: 'Erro ao salvar o card' });
            }
            
            // Buscar o card recém-criado
            db.get('SELECT * FROM problem_cards WHERE id = ?', [this.lastID], (err, card) => {
                if (err) {
                    console.error('Erro ao buscar card criado:', err);
                    return res.status(500).json({ error: 'Erro ao recuperar o card criado' });
                }
                
                console.log('Card criado com sucesso:', card);
                
                // Emitir evento via Socket.IO
                if (req.app.get('io')) {
                    req.app.get('io').emit('cardCreated', card);
                }
                
                res.status(201).json(card);
            });
        });
    } catch (error) {
        console.error('Erro ao criar card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Listar todos os cards com filtros
router.get('/', (req, res) => {
    try {
        const db = getDatabase();
        const { status, date } = req.query;
        
        let query = 'SELECT * FROM problem_cards WHERE 1=1';
        const params = [];
        
        if (status && status !== 'all') {
            query += ' AND card_status = ?';
            params.push(status);
        }
        
        if (date) {
            query += ' AND DATE(created_at) = DATE(?)';
            params.push(date);
        }
        
        query += ' ORDER BY created_at DESC';
        
        db.all(query, params, (err, cards) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erro ao buscar cards' });
            }
            res.json(cards || []);
        });
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Marcar card como concluído
router.put('/:id/complete', (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        
        db.run(
            'UPDATE problem_cards SET card_status = ?, updated_at = DATETIME("now") WHERE id = ?',
            ['completed', id],
            function(err) {
                if (err) {
                    console.error('Erro ao atualizar status do card:', err);
                    return res.status(500).json({ error: 'Erro ao atualizar o card' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Card não encontrado' });
                }
                
                db.get('SELECT * FROM problem_cards WHERE id = ?', [id], (err, card) => {
                    if (err) {
                        return res.status(500).json({ error: 'Erro ao buscar card atualizado' });
                    }
                    
                    // Emitir evento via Socket.IO
                    req.app.get('io').emit('cardUpdated', card);
                    res.json(card);
                });
            }
        );
    } catch (error) {
        console.error('Erro ao concluir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Reabrir card
router.put('/:id/reopen', (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        
        db.run(
            'UPDATE problem_cards SET card_status = ?, updated_at = DATETIME("now") WHERE id = ?',
            ['pending', id],
            function(err) {
                if (err) {
                    console.error('Erro ao reabrir card:', err);
                    return res.status(500).json({ error: 'Erro ao reabrir o card' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Card não encontrado' });
                }
                
                db.get('SELECT * FROM problem_cards WHERE id = ?', [id], (err, card) => {
                    if (err) {
                        return res.status(500).json({ error: 'Erro ao buscar card atualizado' });
                    }
                    
                    req.app.get('io').emit('cardUpdated', card);
                    res.json(card);
                });
            }
        );
    } catch (error) {
        console.error('Erro ao reabrir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
