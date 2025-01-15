const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function getLastFiveWorkdays() {
    const dates = [];
    let currentDate = new Date();
    
    while (dates.length < 5) {
        const dayOfWeek = currentDate.getDay();
        // Check if it's not weekend (0 = Sunday, 6 = Saturday)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            dates.unshift({
                date: new Date(currentDate),
                label: `${weekDays[dayOfWeek]} ${currentDate.getDate()}/${currentDate.getMonth() + 1}`
            });
        }
        currentDate.setDate(currentDate.getDate() - 1);
    }
    return dates;
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

function getWorkdaysInRange(startDate, endDate) {
    const days = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek > 0 && dayOfWeek < 6) { // Mon-Fri only
            days.push({
                date: new Date(currentDate),
                label: `${weekDays[dayOfWeek - 1]} ${formatDate(currentDate)}`
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
}

let dailyProblemsChart;
let monthlyProblemsChart;

function initCharts() {
    initDailyChart();
    initMonthlyChart();
}

function initDailyChart() {
    const ctx = document.getElementById('dailyProblemsChart').getContext('2d');
    dailyProblemsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Problemas por Dia',
                data: [],
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 5,
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            return value === 1 ? '1 problema' : `${value} problemas`;
                        }
                    }
                }
            }
        }
    });
}

function initMonthlyChart() {
    const ctx = document.getElementById('monthlyProblemsChart').getContext('2d');
    monthlyProblemsChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.8)',
                    'rgba(54, 162, 235, 0.8)',
                    'rgba(255, 206, 86, 0.8)',
                    'rgba(75, 192, 192, 0.8)',
                    'rgba(153, 102, 255, 0.8)',
                    'rgba(255, 159, 64, 0.8)',
                    'rgba(255, 0, 0, 0.8)',
                    'rgba(0, 255, 0, 0.8)',
                    'rgba(0, 0, 255, 0.8)',
                    'rgba(128, 0, 128, 0.8)',
                    'rgba(0, 128, 128, 0.8)',
                    'rgba(128, 128, 0, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateChartData(weeklyData, monthlyData) {
    if (weeklyData && Array.isArray(weeklyData.labels) && Array.isArray(weeklyData.data)) {
        // Garantir que os dados estejam em ordem cronológica
        const labels = [...weeklyData.labels];
        const data = [...weeklyData.data];

        // Mapear os labels para o formato correto
        dailyProblemsChart.data.labels = labels.map(label => label.split('|').reverse().join(' '));
        dailyProblemsChart.data.datasets[0].data = data;
        dailyProblemsChart.update();

        console.log('Dados processados:', {
            labels: dailyProblemsChart.data.labels,
            data: dailyProblemsChart.data.datasets[0].data
        });
    }

    // Update monthly chart
    if (monthlyData && monthlyData.labels && monthlyData.data) {
        monthlyProblemsChart.data.labels = monthlyData.labels;
        monthlyProblemsChart.data.datasets[0].data = monthlyData.data;
        monthlyProblemsChart.update();
    }
}

function updateChartsTheme(isDark) {
    const chartColor = isDark ? 
        { bg: 'rgba(45, 45, 45, 0.2)', border: 'rgba(45, 45, 45, 1)' } : 
        { bg: 'rgba(23, 162, 184, 0.2)', border: 'rgba(23, 162, 184, 1)' };
    
    const textColor = isDark ? '#E4E6EF' : '#666';

    // Update daily chart
    dailyProblemsChart.data.datasets[0].backgroundColor = chartColor.bg;
    dailyProblemsChart.data.datasets[0].borderColor = chartColor.border;
    dailyProblemsChart.options.scales.y.ticks.color = textColor;
    dailyProblemsChart.options.scales.x.ticks.color = textColor;
    
    // Update monthly chart
    monthlyProblemsChart.options.plugins.legend.labels.color = textColor;
    
    // Apply updates
    dailyProblemsChart.update();
    monthlyProblemsChart.update();
}

window.Charts = {
    init: initCharts,
    updateData: updateChartData,
    updateTheme: updateChartsTheme
};
