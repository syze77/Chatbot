const express = require('express');
const router = express.Router();
const Call = require('../../models/entities/call.js');
const Card = require('../../models/entities/card.js');
const { Op } = require('sequelize');

router.get('/test', (req, res) => {
    console.log('Test route accessed');
    res.json({ status: 'API is working' });
});

// Criar novo card
router.post('/create', async (req, res) => {
    try {
        console.log('Recebendo requisição:', req.body);
        const { callId, link } = req.body;
        
        if (!callId || !link) {
            console.error('Dados inválidos:', { callId, link });
            return res.status(400).json({ error: 'callId e link são obrigatórios' });
        }

        const card = await Card.create({
            link,
            status: 'PENDING',
            callId
        });

        if (req.app.get('io')) {
            req.app.get('io').emit('cardCreated', card);
        }

        res.status(201).json(card);
    } catch (error) {
        console.error('Erro ao criar card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Listar todos os cards com filtros
router.get('/', async (req, res) => {
    try {
        const { status, date } = req.query;
        let where = {};
        
        if (status && status !== 'all') {
            where.status = status;
        }
        
        if (date) {
            where.createdAt = {
                [Op.between]: [new Date(date), new Date(date + ' 23:59:59')]
            };
        }
        
        const cards = await Card.findAll({
            where,
            include: [{
                model: Call,
                attributes: ['description']
            }],
            order: [['createdAt', 'DESC']]
        });

        res.json(cards);
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Marcar card como concluído
router.put('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const [updated] = await Card.update(
            { 
                status: 'COMPLETED',
                updatedAt: new Date()
            },
            { where: { id } }
        );
        
        if (updated === 0) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }

        const card = await Card.findByPk(id);
        req.app.get('io').emit('cardUpdated', card);
        res.json(card);
    } catch (error) {
        console.error('Erro ao concluir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Reabrir card
router.put('/:id/reopen', async (req, res) => {
    try {
        const { id } = req.params;
        const [updated] = await Card.update(
            { 
                status: 'PENDING',
                updatedAt: new Date()
            },
            { where: { id } }
        );
        
        if (updated === 0) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }

        const card = await Card.findByPk(id);
        req.app.get('io').emit('cardUpdated', card);
        res.json(card);
    } catch (error) {
        console.error('Erro ao reabrir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
