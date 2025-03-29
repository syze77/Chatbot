const express = require('express');
const router = express.Router();
const { queryDatabase } = require('../utils/database.js');

router.get('/api/filters/getCities', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT city 
            FROM problems 
            WHERE city IS NOT NULL 
            ORDER BY city`;
        
        const cities = await queryDatabase(query);
        res.json(cities.map(row => row.city));
    } catch (error) {
        console.error('Erro ao buscar cidades:', error);
        res.status(500).json({ error: 'Erro ao buscar cidades' });
    }
});

router.get('/api/filters/getSchools', async (req, res) => {
    try {
        const { city } = req.query;
        let query = `
            SELECT DISTINCT school 
            FROM problems 
            WHERE school IS NOT NULL`;
        
        const params = [];
        if (city) {
            query += ` AND city = ?`;
            params.push(city);
        }
        
        query += ` ORDER BY school`;
        
        const schools = await queryDatabase(query, params);
        res.json(schools.map(row => row.school));
    } catch (error) {
        console.error('Erro ao buscar escolas:', error);
        res.status(500).json({ error: 'Erro ao buscar escolas' });
    }
});

module.exports = router;
