const express = require('express');
const router = express.Router();
const User  = require('../models/entities/user.js');
const School = require('../models/entities/school.js');
const Call = require('../models/entities/call.js');
const Attendant = require('../models/entities/attendant.js');
const { Op, literal, fn, col } = require('sequelize');

router.get('/api/statistics/getChartData', async (req, res) => {
    try {
        const { client, school } = req.query;
        let where = {
            description: { [Op.ne]: null }
        };
        
        if (client && client !== 'undefined' && client !== '') {
            where['$school.client$'] = client;
        }
        
        if (school && school !== 'undefined' && school !== '') {
            where['$school.id$'] = school;
        }

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31);

        // Monthly data
        const monthlyData = await Call.findAll({
            attributes: [
                [fn('date_part', 'month', col('createDate')), 'month'],
                [fn('count', '*'), 'count']
            ],
            where: {
                ...where,
                createDate: {
                    [Op.between]: [startOfYear, endOfYear]
                }
            },
            include: [{
                model: School,
                attributes: []
            }],
            group: [fn('date_part', 'month', col('createDate'))],
            order: [[fn('date_part', 'month', col('createDate')), 'ASC']]
        });

        // Weekly data
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        
        const weeklyData = await Call.findAll({
            attributes: [
                [fn('date', col('createDate')), 'date'],
                [fn('count', '*'), 'count']
            ],
            where: {
                ...where,
                createDate: {
                    [Op.between]: [startOfWeek, new Date()]
                }
            },
            include: [{
                model: School,
                attributes: []
            }],
            group: [fn('date', col('createDate'))],
            order: [[col('createDate'), 'ASC']]
        });

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

        const processed = {
            weekly: {
                labels: weeklyData.map(row => {
                    const date = new Date(row.getDataValue('date'));
                    return weekDays[date.getDay() - 1] || '';
                }).filter(label => label !== ''),
                data: weeklyData.map(row => parseInt(row.getDataValue('count')))
            },
            monthly: {
                labels: monthNames,
                data: Array(12).fill(0).map((_, index) => {
                    const monthData = monthlyData.find(m => parseInt(m.getDataValue('month')) === index + 1);
                    return monthData ? parseInt(monthData.getDataValue('count')) : 0;
                })
            }
        };

        res.json(processed);
    } catch (error) {
        console.error('Erro ao buscar dados dos gráficos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados dos gráficos' });
    }
});

router.get('/api/statistics/getCompletedAttendances', async (req, res) => {
    try {
        const { date, position, client, school, attendant } = req.query;
        
        const where = {
            status: 'COMPLETED',
            description: { [Op.ne]: null }
        };

        if (date) {
            where.dateTimeFinish = {
                [Op.between]: [new Date(date), new Date(date + ' 23:59:59')]
            };
        }

        if (position) where.position = position;
        if (school) where['$school.id$'] = school;
        if (client) where['$school.client$'] = client;
        if (attendant) {
            if (attendant === 'Bot') {
                where['$attendant.id$'] = null;
            } else {
                where['$attendant.id$'] = attendant;
            }
        }

        const completedAttendances = await Call.findAll({
            where,
            include: [
                {
                    model: School,
                    attributes: ['name', 'client']
                },
                {
                    model: Attendant,
                    attributes: ['name']
                }
            ],
            order: [['dateTimeFinish', 'DESC']]
        });

        const formattedAttendances = completedAttendances.map(att => ({
            id: att.id,
            position: att.position,
            description: att.description,
            school: att.school?.name,
            client: att.school?.client,
            attendant: att.attendant?.name || 'Bot',
            date: att.createDate.toLocaleString('pt-BR'),
            date_completed: att.dateTimeFinish.toLocaleString('pt-BR'),
            duration_minutes: Math.floor((att.dateTimeFinish - att.createDate) / (1000 * 60))
        }));

        res.json(formattedAttendances);
    } catch (error) {
        console.error('Erro ao buscar atendimentos concluídos:', error);
        res.status(500).json({ error: 'Erro ao buscar atendimentos concluídos' });
    }
});

module.exports = router;
