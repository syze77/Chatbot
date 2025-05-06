const express = require('express');
const router = express.Router();
const School = require('../models/entities/school.js');
const { Op, fn, col } = require('sequelize');

router.get('/api/filters/getClients', async (req, res) => {
    try {
        const clients = await School.findAll({
            attributes: [
                [fn('DISTINCT', col('client')), 'client']
            ],
            where: {
                client: { [Op.ne]: null }
            },
            order: [['client', 'ASC']]
        });
        
        res.json(clients.map(row => row.getDataValue('client')));
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
});

router.get('/api/filters/getSchools', async (req, res) => {
    try {
        const { client } = req.query;
        const where = { name: { [Op.ne]: null } };
        
        if (client) {
            where.client = client;
        }
        
        const schools = await School.findAll({
            attributes: ['name'],
            where,
            order: [['name', 'ASC']]
        });
        
        res.json(schools.map(row => row.name));
    } catch (error) {
        console.error('Erro ao buscar escolas:', error);
        res.status(500).json({ error: 'Erro ao buscar escolas' });
    }
});

module.exports = router;
