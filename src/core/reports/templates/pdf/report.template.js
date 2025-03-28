const PDFDocument = require('pdfkit');

function generatePDFReport(doc, problems, startDate, endDate) {
    // Cabeçalho
    doc.fontSize(18).text('Relatório de Atendimentos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Período: ${startDate} a ${endDate}`, { align: 'center' });
    doc.moveDown();

    // Tabela de dados
    problems.forEach((problem, index) => {
        if (index > 0) doc.addPage();

        doc.fontSize(14).text('Detalhes do Atendimento', { underline: true });
        doc.moveDown();
        
        doc.fontSize(10);
        doc.text(`Data: ${problem.formatted_date}`);
        doc.text(`Nome: ${problem.name}`);
        doc.text(`Cidade: ${problem.city}`);
        doc.text(`Escola: ${problem.school}`);
        doc.text(`Cargo: ${problem.position}`);
        doc.moveDown();
        doc.text('Descrição do Problema:', { underline: true });
        doc.text(problem.description);
        doc.moveDown();
        doc.text(`Duração do Atendimento: ${problem.duration_minutes} minutos`);
    });
}

function getStatusText(status) {
    const statusMap = {
        'active': 'Em atendimento',
        'waiting': 'Em espera',
        'completed': 'Concluído',
        'pending': 'Pendente'
    };
    return statusMap[status] || status;
}

module.exports = { generatePDFReport };
