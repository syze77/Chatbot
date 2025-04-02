const PDFDocument = require('pdfkit');
const { format, parseISO } = require('date-fns');

const labelSpacing = 50; // Add this constant at the top level of the file

function generatePDFReport(doc, problems, startDate, endDate) {
    // Configurações de estilo
    const colors = {
        primary: '#2C3E50',
        secondary: '#3498DB',
        background: '#F8F9FA',
        border: '#DEE2E6',
        text: '#495057'
    };

    let pageNumber = 1;
    const margin = 50;
    const pageWidth = doc.page.width - 2 * margin;

    // Ordena os problemas pela data
    problems.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Primeira página
    addHeader(doc, pageWidth, margin, colors);
    addSummary(doc, problems, startDate, endDate, margin, pageWidth, colors);
    addFooter(doc, pageNumber, margin, colors);

    // Lista de atendimentos
    problems.forEach((problem, index) => {
        // Adiciona o número sequencial ao problema
        problem.sequentialNumber = index + 1;
        
        // Verifica se precisa de nova página
        if (doc.y > doc.page.height - 150) {
            addFooter(doc, pageNumber, margin, colors);
            doc.addPage();
            pageNumber++;
            addHeader(doc, pageWidth, margin, colors);
        }
        addProblemDetails(doc, problem, margin, pageWidth, colors);
    });
    
    // Adiciona footer na última página
    addFooter(doc, pageNumber, margin, colors);
}

function addHeader(doc, pageWidth, margin, colors) {
    doc.moveTo(margin, 100)
       .lineTo(pageWidth + margin, 100)
       .lineWidth(2)
       .strokeColor(colors.secondary)
       .stroke();

    doc.fontSize(20)
       .fillColor(colors.primary)
       .font('Helvetica-Bold')
       .text('Relatório de Atendimentos Técnicos', margin, 110, {
           width: pageWidth,
           align: 'center'
       });

    doc.moveDown(2);
}

function addSummary(doc, problems, startDate, endDate, margin, pageWidth, colors) {
    const summaryTop = doc.y;
    
    // Container com fundo
    doc.rect(margin, summaryTop, pageWidth, 120)
       .fillColor(colors.background)
       .fill()
       .strokeColor(colors.border)
       .stroke();

    // Formatação simples das datas
    const formattedStartDate = format(parseISO(startDate), 'dd/MM/yyyy');
    const formattedEndDate = format(parseISO(endDate), 'dd/MM/yyyy');
    
    doc.fontSize(12)
       .fillColor(colors.text)
       .text('PERÍODO ANALISADO:', margin + 20, summaryTop + 20)
       .font('Helvetica-Bold')
       .text(`${formattedStartDate} - ${formattedEndDate}`, margin + 200, summaryTop + 20); 

    // Grid de métricas
    const totalMinutes = problems.reduce((acc, curr) => acc + parseInt(curr.duration_minutes), 0);
    const metrics = [
        { label: 'Total de Atendimentos', value: problems.length },
        { label: 'Tempo Total (h)', value: (totalMinutes / 60).toFixed(1) },
        { label: 'Tempo Médio/Atendimento (h)', value: ((totalMinutes / problems.length) / 60).toFixed(1) }
    ];

    const boxWidth = pageWidth / metrics.length;
    metrics.forEach((metric, index) => {
        const x = margin + (index * boxWidth);
        doc.rect(x, summaryTop + 60, boxWidth - 10, 50)
           .fillColor(colors.secondary)
           .fill()
           .fontSize(14)
           .fillColor('white')
           .text(metric.value.toString(), x + 10, summaryTop + 70)
           .fontSize(10)
           .text(metric.label.toUpperCase(), x + 10, summaryTop + 90);
    });

    doc.moveDown(4);
}

function addProblemDetails(doc, problem, margin, pageWidth, colors) {
    // Verifica se precisa de nova página
    if (doc.y > doc.page.height - 150) {
        doc.addPage();
        addHeader(doc, pageWidth, margin, colors);
    }

    const contentHeight = 150; 
    
    const startY = doc.y > margin + 100 ? doc.y : margin + 100;
    
    // Cabeçalho do atendimento
    doc.fontSize(14)
       .fillColor(colors.primary)
       .font('Helvetica-Bold')
       .text(`ATENDIMENTO #${problem.sequentialNumber}`, margin, startY, {
           underline: true
       });

    // Grid de informações
    const details = [
        { label: 'Data:', value: problem.formatted_date },
        { label: 'Status:', value: getStatusBadge(problem.status) },
        { label: 'Nome:', value: problem.name },
        { label: 'Cidade:', value: problem.city },
        { label: 'Escola:', value: problem.school },
        { label: 'Cargo:', value: problem.position },
        { label: 'Duração:', value: `${problem.duration_minutes}min` }
    ];

    createDetailGrid(doc, details, margin, doc.y + 15, pageWidth, colors);

    // Descrição
    doc.fontSize(12)
       .fillColor(colors.text)
       .text('Descrição do Problema:', margin, doc.y + 30)
       .fontSize(10)
       .text(problem.description, margin, doc.y + 5, {
           width: pageWidth,
           align: 'justify',
           lineGap: 5
       });

    // Linha divisória
    doc.moveTo(margin, doc.y + 20)
       .lineTo(margin + pageWidth, doc.y + 20)
       .strokeColor(colors.border)
       .stroke();

    // Adiciona apenas um pequeno espaço entre atendimentos
    doc.moveDown(0.5);
}

function createDetailGrid(doc, items, x, y, width, colors) {
    const cols = 2;
    const rowHeight = 20;
    const colWidth = width / cols;
    
    items.forEach((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        
        const posX = x + (col * colWidth);
        const posY = y + (row * rowHeight);
        
        doc.fontSize(10)
           .fillColor(colors.text)
           .text(`${item.label}`, posX, posY)
           .font('Helvetica-Bold')
           .text(item.value, posX + labelSpacing, posY, {
               width: colWidth - labelSpacing, 
               ellipsis: true 
           });
    });
}

function addFooter(doc, pageNumber, margin, colors) {
    const footerY = doc.page.height - 50;
    
    doc.fontSize(8)
       .fillColor(colors.text)
       .text(
           `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Página ${pageNumber}`,
           margin,
           footerY,
           { width: doc.page.width - 2 * margin, align: 'right' }
       );
}

function getStatusBadge(status) {
    const statusConfig = {
        'completed': { color: '#28A745', text: 'Concluído' },
        'active': { color: '#007BFF', text: 'Em Andamento' },
        'pending': { color: '#DC3545', text: 'Pendente' },
        'waiting': { color: '#FFC107', text: 'Em Espera' }
    };

    return statusConfig[status]?.text || status;
}

module.exports = { generatePDFReport };