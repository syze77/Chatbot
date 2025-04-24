const ExcelJS = require('exceljs');

async function generateXLSXReport(problems, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório de Atendimentos');

    // Configure cabeçalhos
    worksheet.columns = [
        { header: 'Data', key: 'date', width: 20 },
        { header: 'Nome', key: 'name', width: 30 },
        { header: 'Cidade', key: 'city', width: 25 }, // Aumentado de 20 para 25
        { header: 'Escola', key: 'school', width: 35 }, // Aumentado de 30 para 35
        { header: 'Cargo', key: 'position', width: 25 }, // Aumentado de 20 para 25
        { header: 'Atendente', key: 'attendant_id', width: 20 }, // Aumentado de 15 para 20
        { header: 'Card Link', key: 'card_link', width: 45 }, // Aumentado de 40 para 45
        { header: 'Status Card', key: 'card_status', width: 25 }, // Aumentado de 20 para 25
        { header: 'Descrição', key: 'description', width: 50 },
        { header: 'Duração (min)', key: 'duration', width: 15 }
    ];

    // Adicionar dados
    problems.forEach(problem => {
        worksheet.addRow({
            date: problem.formatted_date,
            name: problem.name,
            city: problem.city,
            school: problem.school,
            position: problem.position,
            attendant_id: problem.attendant_id || 'BOT',
            card_link: problem.card_link || 'NÃO FOI NECESSÁRIO',
            card_status: problem.card_status || 'NÃO FOI NECESSÁRIO',
            description: problem.description,
            duration: problem.duration_minutes
        });
    });

    return workbook;
}

module.exports = { generateXLSXReport };
