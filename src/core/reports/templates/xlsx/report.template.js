const ExcelJS = require('exceljs');

async function generateXLSXReport(problems, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório de Atendimentos');

    // Configure cabeçalhos
    worksheet.columns = [
        { header: 'Data', key: 'date', width: 20 },
        { header: 'Nome', key: 'name', width: 30 },
        { header: 'Cidade', key: 'city', width: 20 },
        { header: 'Escola', key: 'school', width: 30 },
        { header: 'Cargo', key: 'position', width: 20 },
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
            description: problem.description,
            duration: problem.duration_minutes
        });
    });

    return workbook;
}

module.exports = { generateXLSXReport };
