class Sidebar {
    static async init() {
        try {
            // Garante que o container existe
            const container = document.getElementById('sidebar-container');
            if (!container) {
                throw new Error('Sidebar container not found');
            }

            // Injeta a sidebar
            container.innerHTML = this.getSidebarContent();
            
            // Inicializa os listeners e tema
            this.setupEventListeners();
            this.initializeTheme();
            this.highlightCurrentPage();
            
            // Inicia com a sidebar recolhida por padrão
            const sidebar = document.querySelector('.sidebar');
            const content = document.querySelector('.content');
            const toggleBtn = document.querySelector('.sidebar-toggle i');
            
            sidebar.classList.add('collapsed');
            content.classList.add('collapsed');
            toggleBtn.classList.replace('fa-bars', 'fa-bars-staggered');
            this.setInteractiveElements(false);
            
            localStorage.setItem('sidebarState', 'collapsed');
        } catch (error) {
            console.error('Error initializing sidebar:', error);
        }
    }

    static getSidebarContent() {
        return `
            <div class="sidebar">
                <div class="sidebar-header">
                    <button class="sidebar-toggle" onclick="Sidebar.toggleSidebar()">
                        <i class="fas fa-bars"></i>
                    </button>
                    <img src="../../assets/logo.svg" alt="Logo" class="brand-logo" />
                </div>

                <nav class="sidebar-nav">
                    <ul class="nav-links">
                        <li>
                            <a href="../initial/index.html" id="home-link" class="nav-item">
                                <div class="nav-icon">
                                    <i class="fas fa-home"></i>
                                </div>
                                <span class="nav-text">Visão Geral</span>
                            </a>
                        </li>
                        <li>
                            <a href="../dashboard/index.html" id="dashboard-link" class="nav-item">
                                <div class="nav-icon">
                                    <i class="fas fa-chart-line"></i>
                                </div>
                                <span class="nav-text">Dashboard</span>
                            </a>
                        </li>
                        <li>
                            <a href="../completed/index.html" id="completed-link" class="nav-item">
                                <div class="nav-icon">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <span class="nav-text">Concluídos</span>
                            </a>
                        </li>
                        <li>
                            <a href="../ignore/index.html" id="ignored-contacts-link" class="nav-item">
                                <div class="nav-icon">
                                    <i class="fas fa-user-slash"></i>
                                </div>
                                <span class="nav-text">Contatos</span>
                            </a>
                        </li>
                    </ul>
                </nav>

                <div class="sidebar-footer">
                    <div class="theme-toggle" onclick="Sidebar.toggleTheme()">
                        <div class="nav-icon">
                            <i class="fas fa-moon"></i>
                        </div>
                        <span class="toggle-text">Modo Escuro</span>
                    </div>
                    
                    <div class="admin-profile">
                        <div class="admin-avatar">
                            <img src="../../assets/avatar.jpg" alt="Admin" class="admin-img">
                        </div>
                        <div class="admin-info">
                            <span class="admin-name">Suporte</span>
                            <span class="admin-role">
                                <i class="fas fa-circle-check"></i>
                                Administrador
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static setupEventListeners() {
        window.addEventListener('resize', this.handleResize.bind(this));
        document.addEventListener('click', this.handleOutsideClick.bind(this));
    }

    static handleResize() {
        const sidebar = document.querySelector('.sidebar');
        const content = document.querySelector('.content');
        
        if (window.innerWidth <= 768) {
            sidebar.classList.add('collapsed');
            content.classList.add('collapsed');
        }
    }

    static handleOutsideClick(event) {
        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.querySelector('.sidebar-toggle');
        
        if (window.innerWidth <= 768 && 
            !sidebar.contains(event.target) && 
            !toggleBtn.contains(event.target)) {
            sidebar.classList.add('collapsed');
        }
    }

    static toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const content = document.querySelector('.content');
        const toggleBtn = document.querySelector('.sidebar-toggle i');
        
        sidebar.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        
        // Adiciona uma pequena transição antes de ativar/desativar os eventos
        setTimeout(() => {
            if (sidebar.classList.contains('collapsed')) {
                toggleBtn.classList.replace('fa-bars', 'fa-bars-staggered');
                this.setInteractiveElements(false);
            } else {
                toggleBtn.classList.replace('fa-bars-staggered', 'fa-bars');
                this.setInteractiveElements(true);
            }
        }, 150);
        
        localStorage.setItem('sidebarState', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    }

    // Adicione este novo método
    static setInteractiveElements(enabled) {
        const sidebar = document.querySelector('.sidebar');
        const links = sidebar.querySelectorAll('.nav-links a');
        const themeToggle = sidebar.querySelector('.theme-toggle');
        const adminProfile = sidebar.querySelector('.admin-profile');
        
        [links, themeToggle, adminProfile].forEach(elements => {
            if (NodeList.prototype.isPrototypeOf(elements)) {
                elements.forEach(el => {
                    el.style.pointerEvents = enabled ? 'auto' : 'none';
                    el.style.cursor = enabled ? 'pointer' : 'default';
                });
            } else if (elements) {
                elements.style.pointerEvents = enabled ? 'auto' : 'none';
                elements.style.cursor = enabled ? 'pointer' : 'default';
            }
        });
    }

    static highlightCurrentPage() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const currentLink = document.getElementById(`${currentPage.split('.')[0]}-link`);
        if (currentLink) {
            currentLink.classList.add('active');
        }
    }

    static initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            const icon = document.querySelector('.theme-toggle i');
            const text = document.querySelector('.theme-toggle span');
            icon.classList.replace('fa-moon', 'fa-sun');
            text.textContent = 'Modo Claro';
        }
    }

    static toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const icon = document.querySelector('.theme-toggle i');
        const text = document.querySelector('.theme-toggle span');
        
        if (document.body.classList.contains('dark-theme')) {
            icon.classList.replace('fa-moon', 'fa-sun');
            text.textContent = 'Modo Claro';
            localStorage.setItem('theme', 'dark');
        } else {
            icon.classList.replace('fa-sun', 'fa-moon');
            text.textContent = 'Modo Escuro';
            localStorage.setItem('theme', 'light');
        }
    }
}

// Garantir que o objeto seja global
window.Sidebar = Sidebar;

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
});
