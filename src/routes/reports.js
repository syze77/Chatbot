const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { queryDatabase } = require('../utils/database.js');
const { generateXLSXReport } = require('../core/reports/templates/xlsx/report.template.js');
const { generatePDFReport } = require('../core/reports/templates/pdf/report.template.js');

router.get('/api/reports/generateReport', async (req, res) => {
    try {
        const { start, end, format, city, school } = req.query;
        
        let filter = '';
        const params = [start, end];
        
        if (city) {
            filter += ' AND city = ?';
            params.push(city);
        }
        
        if (school) {
            filter += ' AND school = ?';
            params.push(school);
        }
        
        const query = `
            WITH ProblemCards AS (
                SELECT 
                    p.chatId,
                    p.date as problem_date,
                    MIN(pc.card_link) as card_link,
                    MIN(pc.card_status) as card_status
                FROM problems p
                LEFT JOIN problem_cards pc ON 
                    p.chatId = pc.chatId 
                    AND pc.created_at >= p.date 
                    AND pc.created_at <= COALESCE(p.date_completed, datetime(p.date, '+1 day'))
                GROUP BY p.chatId, p.date
            )
            SELECT 
                problems.*,
                strftime('%d/%m/%Y %H:%M', datetime(problems.date, 'localtime')) as formatted_date,
                strftime('%d/%m/%Y %H:%M', datetime(problems.date_completed, 'localtime')) as formatted_date_completed,
                CAST((julianday(problems.date_completed) - julianday(problems.date)) * 24 * 60 AS INTEGER) as duration_minutes,
                attendant_id,
                COALESCE(pc.card_link, 'NÃO FOI NECESSÁRIO') as card_link,
                COALESCE(pc.card_status, 'NÃO FOI NECESSÁRIO') as card_status
            FROM problems 
            LEFT JOIN ProblemCards pc ON 
                problems.chatId = pc.chatId 
                AND problems.date = pc.problem_date
            WHERE problems.date BETWEEN ? AND ?
            AND problems.description IS NOT NULL
            ${filter}
            ORDER BY problems.date DESC
        `;

        const problems = await queryDatabase(query, params);

        if (!Array.isArray(problems)) {
            throw new Error('Dados inválidos retornados da consulta');
        }

        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=rRelatório-${start}-a-${end}.xlsx`);
            const workbook = await generateXLSXReport(problems, start, end);
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
        generatePDFReport(doc, problems, start, end);
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
