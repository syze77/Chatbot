const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const School = require('../models/entities/school.js');
const Call = require('../models/entities/call.js');
const Card = require('../models/entities/card.js');
const Attendant = require('../models/entities/attendant.js');
const { Op, fn, col, literal } = require('sequelize');
const { generateXLSXReport } = require('../core/reports/templates/xlsx/report.template.js');
const { generatePDFReport } = require('../core/reports/templates/pdf/report.template.js');

router.get('/api/reports/generateReport', async (req, res) => {
    try {
        const { start, end, format, city, school } = req.query;
        
        let where = {
            createDate: {
                [Op.between]: [new Date(start), new Date(end)]
            },
            description: { [Op.ne]: null }
        };

        if (city) where['$school.city$'] = city;
        if (school) where['$school.id$'] = school;

        const problems = await Call.findAll({
            where,
            include: [
                {
                    model: Card,
                    attributes: ['link', 'status']
                },
                {
                    model: School,
                    attributes: ['name', 'city']
                },
                {
                    model: Attendant,
                    attributes: ['name']
                }
            ],
            order: [['createDate', 'DESC']]
        });

        const formattedProblems = problems.map(problem => ({
            id: problem.id,
            description: problem.description,
            school: problem.school?.name,
            city: problem.school?.city,
            position: problem.position,
            status: problem.status,
            formatted_date: problem.createDate.toLocaleString('pt-BR'),
            formatted_date_completed: problem.dateTimeFinish?.toLocaleString('pt-BR'),
            duration_minutes: problem.dateTimeFinish ? 
                Math.floor((problem.dateTimeFinish - problem.createDate) / (1000 * 60)) : null,
            attendant_id: problem.attendant?.name || 'Bot',
            card_link: problem.card?.link || 'Não foi necessário',
            card_status: problem.card?.status || 'Não foi necessário'
        }));

        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Relatório-${start}-a-${end}.xlsx`);
            const workbook = await generateXLSXReport(formattedProblems, start, end);
            await workbook.xlsx.write(res);
            return;
        }

        const doc = new PDFDocument({ 
            size: 'A4', 
            margin: 50,
            bufferPages: true
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Relatório-${start}-a-${end}.pdf`);
        
        doc.pipe(res);
        generatePDFReport(doc, formattedProblems, start, end);
        doc.end();

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ 
            error: 'Erro ao gerar relatório',
            details: error.message
        });
    }
});

module.exports = router;
