document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const icon = document.querySelector('.theme-toggle i');
        const text = document.querySelector('.theme-toggle span');
        icon.classList.replace('fa-moon', 'fa-sun');
        text.textContent = 'Modo Claro';
    }

    console.log('DOM fully loaded and parsed');
    
    socket.on('statusUpdate', (data) => {
        console.log('Received status update:', data);
        updateUI(data);
    });

    fetchDataAndUpdateUI();
});

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

function toggleTheme() {
    Sidebar.toggleTheme();
}