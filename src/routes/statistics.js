const express = require('express');
const router = express.Router();
const { queryDatabase } = require('../utils/database.js');

router.get('/getChartData', async (req, res) => {
    try {
        const { city, school } = req.query;
        let conditions = ['problems.description IS NOT NULL'];
        const params = [];
        
        if (city && city !== 'undefined' && city !== '') {
            conditions.push('problems.city = ?');
            params.push(city);
        }
        
        if (school && school !== 'undefined' && school !== '') {
            conditions.push('problems.school = ?');
            params.push(school);
        }
        
        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        // Query modificada para dados mensais com preenchimento correto
        const monthlyQuery = `
            WITH RECURSIVE 
            months(month_num) AS (
                SELECT 1
                UNION ALL
                SELECT month_num + 1
                FROM months
                WHERE month_num < 12
            )
            SELECT 
                printf('%02d', months.month_num) as month,
                COALESCE(
                    (SELECT COUNT(*) 
                     FROM problems 
                     ${whereClause}
                     ${whereClause ? 'AND' : 'WHERE'} strftime('%m', date) = printf('%02d', months.month_num)
                     AND strftime('%Y', date) = strftime('%Y', 'now')), 
                    0
                ) as count
            FROM months
            ORDER BY months.month_num`;

        // Query modificada para dados semanais
        const weeklyQuery = `
            WITH RECURSIVE 
            dates(date) AS (
                SELECT date('now', '-6 days')
                UNION ALL
                SELECT date(date, '+1 day')
                FROM dates
                WHERE date < date('now')
            )
            SELECT 
                dates.date,
                COALESCE(
                    (SELECT COUNT(*) 
                     FROM problems 
                     ${whereClause}
                     ${whereClause ? 'AND' : 'WHERE'} date(problems.date) = dates.date),
                    0
                ) as count
            FROM dates
            ORDER BY dates.date`;

        const [weeklyData, monthlyData] = await Promise.all([
            queryDatabase(weeklyQuery, params),
            queryDatabase(monthlyQuery, params)
        ]);

        // Nomes dos meses em português
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        // Nomes dos dias da semana em português
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        const processed = {
            weekly: {
                labels: weeklyData.map(row => {
                    const date = new Date(row.date);
                    return weekDays[date.getDay()];
                }),
                data: weeklyData.map(row => row.count)
            },
            monthly: {
                labels: monthNames,
                data: monthlyData.map(row => row.count)
            }
        };

        res.json(processed);
    } catch (error) {
        console.error('Erro ao buscar dados dos gráficos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados dos gráficos' });
    }
});

router.get('/getCompletedAttendances', async (req, res) => {
    try {
        const { date, position, city, school } = req.query;
        let query = `
            SELECT 
                id, 
                chatId, 
                name, 
                position, 
                city, 
                school, 
                description,
                strftime('%d/%m/%Y %H:%M', datetime(date, 'localtime')) as date,
                strftime('%d/%m/%Y %H:%M', datetime(date_completed, 'localtime')) as date_completed,
                status,
                CAST(
                    (julianday(date_completed) - julianday(date)) * 24 * 60 AS INTEGER
                ) as duration_minutes
            FROM problems 
            WHERE status = 'completed'
            AND description IS NOT NULL`;
        
        const params = [];
        
        if (date) {
            query += ` AND DATE(date_completed) = DATE(?)`;
            params.push(date);
        }
        
        if (position) {
            query += ` AND position = ?`;
            params.push(position);
        }

        if (city) {
            query += ` AND city = ?`;
            params.push(city);
        }

        if (school) {
            query += ` AND school = ?`;
            params.push(school);
        }
        
        query += ` ORDER BY date_completed DESC`;

        const completedAttendances = await queryDatabase(query, params);
        res.json(completedAttendances);
    } catch (error) {
        console.error('Erro ao buscar atendimentos concluídos:', error);
        res.status(500).json({ error: 'Erro ao buscar atendimentos concluídos' });
    }
});

module.exports = router;
