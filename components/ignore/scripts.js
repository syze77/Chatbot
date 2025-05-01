let contacts = [];
let ignoredContacts = new Set();

document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    loadContacts();
    
    document.getElementById('refreshBtn').addEventListener('click', loadContacts);
    document.getElementById('saveBtn').addEventListener('click', saveIgnoredContacts);
});

async function loadContacts() {
    try {
        const activeContainer = document.querySelector('.active-contacts');
        const ignoredContainer = document.querySelector('.ignored-contacts');
        activeContainer.innerHTML = '<div class="loading">Carregando contatos...</div>';
        ignoredContainer.innerHTML = '<div class="loading">Carregando contatos...</div>';

        const response = await window.electronAPI.invoke('get-contacts');
        console.log('Resposta recebida:', response);

        contacts = response.contacts || [];
        ignoredContacts = new Set(response.ignoredContacts || []);

        console.log('Contatos carregados:', contacts);
        console.log('Contatos ignorados:', Array.from(ignoredContacts));

        renderContacts();
        
        showToast(`${contacts.length} contatos carregados`, 'success');
    } catch (error) {
        console.error('Erro ao carregar contatos:', error);
        showToast('Erro ao carregar contatos. Tente novamente.', 'error');
        
        const activeContainer = document.querySelector('.active-contacts');
        const ignoredContainer = document.querySelector('.ignored-contacts');
        activeContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                Erro ao carregar contatos. 
                <button onclick="loadContacts()" class="btn btn-link">Tentar novamente</button>
            </div>
        `;
        ignoredContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                Erro ao carregar contatos. 
                <button onclick="loadContacts()" class="btn btn-link">Tentar novamente</button>
            </div>
        `;
    }
}

async function renderContacts() {
    const activeContainer = document.querySelector('.active-contacts');
    const ignoredContainer = document.querySelector('.ignored-contacts');
    const searchTerm = document.getElementById('searchContact').value.toLowerCase();
    activeContainer.innerHTML = '';
    ignoredContainer.innerHTML = '';

    if (!contacts || contacts.length === 0) {
        activeContainer.innerHTML = `
            <div class="no-contacts">
                <i class="fas fa-users-slash"></i>
                <p>Nenhum contato encontrado.</p>
            </div>
        `;
        ignoredContainer.innerHTML = `
            <div class="no-contacts">
                <i class="fas fa-users-slash"></i>
                <p>Nenhum contato encontrado.</p>
            </div>
        `;
        return;
    }

    const sortedContacts = [...contacts]
        .sort((a, b) => {
            if (a.lastMessageTime && b.lastMessageTime) {
                return b.lastMessageTime - a.lastMessageTime;
            }
            return (a.name || '').localeCompare(b.name || '');
        })
        .filter(contact => {
            const contactName = (contact.name || '').toLowerCase();
            const contactNumber = (contact.number || '').toLowerCase();
            const contactDesc = (contact.description || '').toLowerCase();
            return contactName.includes(searchTerm) || 
                   contactNumber.includes(searchTerm) ||
                   contactDesc.includes(searchTerm);
        });

    if (sortedContacts.length === 0) {
        activeContainer.innerHTML = `
            <div class="no-contacts">
                <i class="fas fa-search"></i>
                <p>Nenhum contato encontrado para "${searchTerm}"</p>
            </div>
        `;
        ignoredContainer.innerHTML = `
            <div class="no-contacts">
                <i class="fas fa-search"></i>
                <p>Nenhum contato encontrado para "${searchTerm}"</p>
            </div>
        `;
        return;
    }

    sortedContacts.forEach(contact => {
        const contactDiv = document.createElement('div');
        contactDiv.className = 'contact-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = contact.id;
        checkbox.checked = ignoredContacts.has(contact.id);
        
        const label = document.createElement('label');
        label.htmlFor = contact.id;
        label.innerHTML = `
            <div class="contact-avatar">
                ${contact.imageUrl ? 
                    `<img src="${contact.imageUrl}" alt="${contact.name}" />` : 
                    `<i class="fas fa-user"></i>`}
            </div>
            <div class="contact-info">
                <span class="contact-name">${contact.name || 'Sem nome'}</span>
                <span class="contact-number">${contact.number || 'Número indisponível'}</span>
                ${contact.description ? 
                    `<span class="contact-description">${contact.description}</span>` : ''}
                ${contact.lastMessageTime ? 
                    `<span class="last-message-time">Última mensagem: ${new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Sao_Paulo'
                    }).format(contact.lastMessageTime * 1000)}</span>` : ''}
            </div>
        `;
        
        contactDiv.appendChild(checkbox);
        contactDiv.appendChild(label);

        if (ignoredContacts.has(contact.id)) {
            ignoredContainer.appendChild(contactDiv);
        } else {
            activeContainer.appendChild(contactDiv);
        }

        checkbox.addEventListener('change', (e) => {
            const contactDiv = e.target.closest('.contact-item');
            contactDiv.classList.toggle('changed');
            
            if (e.target.checked) {
                ignoredContacts.add(contact.id);
            } else {
                ignoredContacts.delete(contact.id);
            }
            
            updateContactsCounter();
        });
    });

    updateCounter();
}

function updateCounter() {
    const total = contacts.length;
    const ignored = Array.from(document.querySelectorAll('.contact-item input:checked')).length;
    
    const counterEl = document.createElement('div');
    counterEl.className = 'contacts-counter';
    counterEl.innerHTML = `
        <span>Total: ${total}</span>
        <span>Ignorados: ${ignored}</span>
    `;

    const header = document.querySelector('.contacts-header');
    const existingCounter = header.querySelector('.contacts-counter');
    if (existingCounter) {
        existingCounter.remove();
    }
    header.appendChild(counterEl);
}

async function saveIgnoredContacts() {
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const selectedCheckboxes = document.querySelectorAll('.contact-item input[type="checkbox"]:checked');
        
        const selectedContacts = Array.from(selectedCheckboxes).map(checkbox => {
            const contactEl = checkbox.closest('.contact-item');
            return {
                id: checkbox.id,
                name: contactEl.querySelector('.contact-name').textContent,
                number: contactEl.querySelector('.contact-number').textContent
            };
        });

        console.log('Contatos selecionados:', selectedContacts);

        const result = await window.electronAPI.invoke('save-ignored-contacts', selectedContacts);

        if (result.success) {
            ignoredContacts = new Set(selectedContacts.map(c => c.id));

            document.querySelectorAll('.contact-item').forEach(contactEl => {
                const checkbox = contactEl.querySelector('input[type="checkbox"]');
                const isIgnored = checkbox.checked;
                const targetContainer = isIgnored ? 
                    document.querySelector('.ignored-contacts') : 
                    document.querySelector('.active-contacts');

                contactEl.classList.toggle('ignored', isIgnored);
                targetContainer.appendChild(contactEl);
            });

            showToast(`${result.added} contatos atualizados com sucesso`, 'success');
            updateContactsCounter();
        }
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showToast('Erro ao salvar alterações', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
    }
}

function updateContactsCounter() {
    const totalContacts = document.querySelectorAll('.contact-item').length;
    const ignoredCount = document.querySelectorAll('.contact-item input:checked').length;
    
    const activeHeader = document.querySelector('.active-contacts').closest('.card').querySelector('.status-header');
    const ignoredHeader = document.querySelector('.ignored-contacts').closest('.card').querySelector('.status-header');
    
    activeHeader.innerHTML = `
        <i class="fas fa-users"></i> 
        Contatos Ativos (${totalContacts - ignoredCount})
    `;
    
    ignoredHeader.innerHTML = `
        <i class="fas fa-user-slash"></i> 
        Contatos Ignorados (${ignoredCount})
    `;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('statusToast');
    const toastBody = toast.querySelector('.toast-body');
    
    toast.classList.remove('bg-success', 'bg-danger');
    toast.classList.add(type === 'success' ? 'bg-success' : 'bg-danger');
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchContact');
    let debounceTimeout;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            renderContacts();
        }, 300);
    });

});