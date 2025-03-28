const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { queryDatabase } = require('../utils/database.js');
const { generateXLSXReport } = require('../core/reports/templates/xlsx/report.template.js');
const { generatePDFReport } = require('../core/reports/templates/pdf/report.template.js');

router.get('/generateReport', async (req, res) => {
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
            SELECT 
                problems.*,
                strftime('%d/%m/%Y %H:%M', datetime(date, 'localtime')) as formatted_date,
                strftime('%d/%m/%Y %H:%M', datetime(date_completed, 'localtime')) as formatted_date_completed,
                CAST((julianday(date_completed) - julianday(date)) * 24 * 60 AS INTEGER) as duration_minutes
            FROM problems 
            WHERE date BETWEEN ? AND ?
            AND description IS NOT NULL
            ${filter}
            ORDER BY date DESC
        `;

        const problems = await queryDatabase(query, params);

        if (format === 'xlsx') {
            const workbook = await generateXLSXReport(problems, start, end);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}-a-${end}.xlsx`);
            await workbook.xlsx.write(res);
            return;
        }

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}-a-${end}.pdf`);
        doc.pipe(res);
        
        generatePDFReport(doc, problems, start, end);
        doc.end();

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

module.exports = router;
