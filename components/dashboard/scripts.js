document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    Charts.init();
    loadCities();
    fetchDataAndUpdateCharts('');
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                Charts.updateTheme(document.body.classList.contains('dark-theme'));
            }
        });
    });

    observer.observe(document.body, {
        attributes: true
    });

    document.getElementById('cityFilter').addEventListener('change', async (e) => {
        const city = e.target.value;
        await loadSchools(city);
        const filterBtn = document.querySelector('.apply-filter-btn');
        filterBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
        filterBtn.disabled = false;
    });

    document.getElementById('schoolFilter').addEventListener('change', () => {
        const filterBtn = document.querySelector('.apply-filter-btn');
        filterBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
        filterBtn.disabled = false;
    });
});

async function fetchDataAndUpdateCharts(city = '', school = '') {
    try {
        const params = new URLSearchParams();
        if (city) params.append('city', city);
        if (school) params.append('school', school);
        
        const response = await fetch(`http://localhost:3000/api/statistics/getChartData?${params}`);
        if (!response.ok) throw new Error('Erro na resposta do servidor');
        
        const data = await response.json();
        if (!data || !data.weekly || !data.monthly) {
            throw new Error('Dados inválidos recebidos');
        }

        Charts.updateData(data.weekly, data.monthly);
        Charts.updateTheme(document.body.classList.contains('dark-theme'));
    } catch (error) {
        console.error('Erro ao buscar dados dos gráficos:', error);
    }
}

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

function showReportOverlay() {
    document.getElementById('reportOverlay').style.display = 'flex';
}

function closeReportOverlay() {
    document.getElementById('reportOverlay').style.display = 'none';
}

function generateReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const format = document.querySelector('input[name="reportFormat"]:checked').value;
    const city = document.getElementById('cityFilter').value;
    const school = document.getElementById('schoolFilter').value;

    if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        alert('A data inicial não pode ser posterior à data final.');
        return;
    }

    const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        format: format,
        city: city,
        school: school
    });

    fetch(`http://localhost:3000/api/reports/generateReport?${params}`)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-${startDate}-${endDate}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            closeReportOverlay();
        })
        .catch(error => {
            console.error('Erro ao gerar relatório:', error);
            alert('Erro ao gerar relatório. Tente novamente.');
        });
}

document.querySelector('.report-container button').onclick = showReportOverlay;

function toggleTheme() {
    Sidebar.toggleTheme();
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const icon = document.querySelector('.theme-toggle i');
        const text = document.querySelector('.theme-toggle span');
        icon.classList.replace('fa-moon', 'fa-sun');
        text.textContent = 'Modo Claro';
    }
});

async function loadCities() {
    try {
        const response = await fetch('http://localhost:3000/api/filters/getCities');
        const cities = await response.json();
        const cityFilter = document.getElementById('cityFilter');
        
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            cityFilter.appendChild(option);
        });

    } catch (error) {
        console.error('Erro ao carregar cidades:', error);
    }
}

async function loadSchools(city = '') {
    try {
        const url = city 
            ? `http://localhost:3000/api/filters/getSchools?city=${encodeURIComponent(city)}`
            : 'http://localhost:3000/api/filters/getSchools';
        const response = await fetch(url);
        const schools = await response.json();
        const schoolFilter = document.getElementById('schoolFilter');
        
        schoolFilter.innerHTML = '<option value="">Todas as escolas</option>';
        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school;
            option.textContent = school;
            schoolFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar escolas:', error);
    }
}

function showNotification(title, message) {
    if (!('Notification' in window)) return;

    const options = {
        body: message,
        icon: './assets/notification-icon.png',
        silent: false
    };

    if (Notification.permission === 'granted') {
        new Notification(title, options);
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, options);
            }
        });
    }
}

async function applyFilters() {
    const filterBtn = document.querySelector('.apply-filter-btn');
    const cityFilter = document.getElementById('cityFilter');
    const schoolFilter = document.getElementById('schoolFilter');
    
    filterBtn.disabled = true;
    const originalText = filterBtn.innerHTML;
    filterBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';
    
    try {
        const params = new URLSearchParams({
            city: cityFilter.value,
            school: schoolFilter.value
        });
        
        const response = await fetch(`http://localhost:3000/api/statistics/getChartData?${params}`);
        if (!response.ok) throw new Error('Erro na resposta do servidor');
        
        const data = await response.json();
        if (!data || !data.weekly || !data.monthly) {
            throw new Error('Dados inválidos recebidos');
        }

        Charts.updateData(data.weekly, data.monthly);
        Charts.updateTheme(document.body.classList.contains('dark-theme'));
        
        filterBtn.innerHTML = '<i class="fas fa-check"></i> Aplicado';
        setTimeout(() => {
            filterBtn.innerHTML = originalText;
            filterBtn.disabled = false;
        }, 1000);
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
        filterBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
        setTimeout(() => {
            filterBtn.innerHTML = originalText;
            filterBtn.disabled = false;
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cityFilter = document.getElementById('cityFilter');
    const filterBtn = document.querySelector('.apply-filter-btn');
    
    cityFilter.addEventListener('change', () => {
        filterBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
        filterBtn.disabled = false;
    });
});

document.getElementById('cityFilter').addEventListener('change', async (e) => {
    const city = e.target.value;
    await loadSchools(city);
    const filterBtn = document.querySelector('.apply-filter-btn');
    filterBtn.innerHTML = '<i class="fas fa-filter"></i> Aplicar Filtros';
    filterBtn.disabled = false;
});