const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

let dailyProblemsChart;
let monthlyProblemsChart;

function initCharts() {
    initDailyChart();
    initMonthlyChart();
}

function generateDatasetColors(count) {
    const baseColors = [
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 99, 132, 0.5)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(255, 206, 86, 0.5)', border: 'rgba(255, 206, 86, 1)' },
        { bg: 'rgba(153, 102, 255, 0.5)', border: 'rgba(153, 102, 255, 1)' }
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

function initDailyChart() {
    const ctx = document.getElementById('dailyProblemsChart').getContext('2d');
    dailyProblemsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Problemas',
                data: [],
                backgroundColor: 'rgba(75, 192, 192, 0.6)', 
                borderColor: 'rgba(75, 192, 192, 1)',
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
                        precision: 0,
                        color: '#E4E6EF' // Cor do texto no eixo Y para dark theme
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)' // Grade mais visível no dark theme
                    }
                },
                x: {
                    ticks: {
                        color: '#E4E6EF' // Cor do texto no eixo X para dark theme
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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

async function updateChartData(weeklyData, monthlyData) {
    if (weeklyData) {
        const filteredData = {
            labels: weeklyData.labels.filter((_, index) => {
                const dayLabel = weeklyData.labels[index];
                return !['DOM', 'SAB'].includes(dayLabel);
            }),
            data: weeklyData.data.filter((_, index) => {
                const dayLabel = weeklyData.labels[index];
                return !['DOM', 'SAB'].includes(dayLabel);
            })
        };

        dailyProblemsChart.data.labels = filteredData.labels;
        dailyProblemsChart.data.datasets[0].data = filteredData.data;
        dailyProblemsChart.update('none');
    }

    if (monthlyData) {
        monthlyProblemsChart.data.labels = monthlyData.labels;
        monthlyProblemsChart.data.datasets[0].data = monthlyData.data;
        monthlyProblemsChart.update('none');
    }
}

function updateChartsTheme(isDark) {
    const chartColor = isDark ? 
        { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' } : 
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' };
    
    const textColor = isDark ? '#E4E6EF' : '#666';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Update daily chart
    dailyProblemsChart.data.datasets[0].backgroundColor = chartColor.bg;
    dailyProblemsChart.data.datasets[0].borderColor = chartColor.border;
    dailyProblemsChart.options.scales.y.ticks.color = textColor;
    dailyProblemsChart.options.scales.x.ticks.color = textColor;
    dailyProblemsChart.options.scales.y.grid.color = gridColor;
    
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