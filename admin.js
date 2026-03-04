// =====================================
// BIÑAN CITY HUB — ADMIN DASHBOARD JS
// =====================================

/* ===== DATA ===== */
let barangays = [
    { id: 1, name: 'Barangay Poblacion', captain: 'Hon. Maria Santos', users: 3892, status: 'active', added: 'Jan 1, 2026', notes: 'Pilot barangay' },
    { id: 2, name: 'Barangay San Antonio', captain: 'Hon. Pedro Reyes', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 3, name: 'Barangay Biñan', captain: 'Hon. Ana Cruz', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 4, name: 'Barangay Canlalay', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 5, name: 'Barangay Dela Paz Norte', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 6, name: 'Barangay Dela Paz Sur', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 7, name: 'Barangay Ganado', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 8, name: 'Barangay Langkiwa', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 9, name: 'Barangay Loma', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
    { id: 10, name: 'Barangay Santo Tomas', captain: '—', users: 0, status: 'pending', added: '—', notes: '' },
];

const usersData = [
    { id: 1, first: 'Juan', last: 'Dela Cruz', email: 'juan@email.com', phone: '09171234567', barangay: 'Poblacion', registered: 'Mar 1, 2026', status: 'active' },
    { id: 2, first: 'Maria', last: 'Santos', email: 'maria@email.com', phone: '09201231234', barangay: 'Poblacion', registered: 'Feb 28, 2026', status: 'active' },
    { id: 3, first: 'Carlos', last: 'Reyes', email: 'carlos@email.com', phone: '09175551234', barangay: 'Poblacion', registered: 'Feb 25, 2026', status: 'pending' },
    { id: 4, first: 'Ana', last: 'Ferrer', email: 'ana@email.com', phone: '09209876543', barangay: 'Poblacion', registered: 'Feb 20, 2026', status: 'active' },
    { id: 5, first: 'Miguel', last: 'Diaz', email: 'miguel@email.com', phone: '09178882211', barangay: 'Poblacion', registered: 'Feb 15, 2026', status: 'active' },
];

const docRequests = [
    { ref: 'BCL-2026-00847', name: 'Maria Dela Cruz', type: 'Barangay Clearance', barangay: 'Poblacion', date: 'Feb 28, 2026', status: 'Processing' },
    { ref: 'BID-2026-00823', name: 'Juan Santos Reyes', type: 'Barangay ID', barangay: 'Poblacion', date: 'Feb 20, 2026', status: 'Completed' },
    { ref: 'JSC-2026-00801', name: 'Ana Ferrer', type: 'Job Seeker Cert.', barangay: 'Poblacion', date: 'Feb 18, 2026', status: 'Completed' },
    { ref: 'BCL-2026-00799', name: 'Carlos Reyes', type: 'Barangay Clearance', barangay: 'Poblacion', date: 'Feb 15, 2026', status: 'Pending' },
    { ref: 'BID-2026-00790', name: 'Rosa Villegas', type: 'Barangay ID', barangay: 'Poblacion', date: 'Feb 10, 2026', status: 'Pending' },
    { ref: 'JSC-2026-00784', name: 'Paolo Mendoza', type: 'Job Seeker Cert.', barangay: 'Poblacion', date: 'Feb 5, 2026', status: 'Rejected' },
];

let announcements = [
    { id: 1, title: 'Community Health Drive — March 15, 2026', category: 'Health', barangay: 'Poblacion', content: 'Free medical checkups and health consultations will be held at the Barangay Hall. Schedule your appointment today!', date: 'March 10, 2026' },
    { id: 2, title: 'Road Maintenance Schedule', category: 'Infrastructure', barangay: 'All', content: 'Secondary roads in Zone A and B will undergo maintenance from March 12–19. Please plan your routes accordingly.', date: 'March 8, 2026' },
    { id: 3, title: 'Summer Youth Program Registration', category: 'Youth', barangay: 'All', content: 'Registration is open for our Summer Youth Program. Various skills training and sports activities for ages 13–17.', date: 'March 5, 2026' },
    { id: 4, title: 'Barangay Fiesta Planning Committee Meeting', category: 'Event', barangay: 'Poblacion', content: 'All interested residents are invited to participate in the Fiesta planning. Meeting is scheduled for March 8 at 6 PM.', date: 'March 1, 2026' },
];

const issueReports = [
    { id: 1, category: 'Road Damage', location: 'Brgy. Poblacion, Zone 2', description: 'Pothole near the market entrance', reporter: 'Juan Dela Cruz', date: 'Mar 3, 2026', status: 'Pending' },
    { id: 2, category: 'Street Light Problem', location: 'Main St., Poblacion', description: 'Street light has been off for 3 days', reporter: 'Maria Santos', date: 'Mar 2, 2026', status: 'Processing' },
    { id: 3, category: 'Waste Management', location: 'Blk 5, Zone 1', description: 'Garbage not collected for 2 weeks', reporter: 'Anonymous', date: 'Mar 1, 2026', status: 'Pending' },
    { id: 4, category: 'Drainage Problem', location: 'Near Barangay Hall', description: 'Clogged drainage causing flooding', reporter: 'Carlos Reyes', date: 'Feb 28, 2026', status: 'Completed' },
];

const workersRegistry = [
    { id: 1, name: 'Juan Cruz', specialty: 'Plumber', category: 'Blue Collar', phone: '09171234567', rating: 4.8, status: 'Active' },
    { id: 2, name: 'Maria Santos', specialty: 'Tutor', category: 'White Collar', phone: '09209876543', rating: 4.9, status: 'Active' },
    { id: 3, name: 'Carlos Reyes', specialty: 'Electrician', category: 'Blue Collar', phone: '09175551234', rating: 4.7, status: 'Active' },
    { id: 4, name: 'Anna Ferrer', specialty: 'Accountant', category: 'White Collar', phone: '09205559876', rating: 4.9, status: 'Active' },
    { id: 5, name: 'Miguel Diaz', specialty: 'Carpenter', category: 'Blue Collar', phone: '09178882211', rating: 4.6, status: 'Active' },
];

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
    setHeaderDate();
    initSidebarNav();
    initMobileSidebar();
    renderOverviewTable();
    renderBarangayTable();
    renderUsersTable();
    renderDocRequestsTable();
    renderIssueReportsTable();
    renderWorkersTable();
    renderAnnouncementsGrid();
    initCharts();
    initFormHandlers();
    console.log('Biñan City Hub — Admin Dashboard Initialized');
});

/* ===== DATE ===== */
function setHeaderDate() {
    const dateEl = document.getElementById('headerDate');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
}

/* ===== SIDEBAR NAVIGATION ===== */
function initSidebarNav() {
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const panel = this.getAttribute('data-panel');
            if (panel) showPanel(panel);
        });
    });
}

function showPanel(panelId) {
    // Update panels
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.classList.add('active');

    // Update nav links
    document.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-panel="${panelId}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update header title
    const titles = {
        overview: ['Overview', 'Biñan City Hub — Administrative Dashboard'],
        barangays: ['Barangays', 'Manage and monitor all 24 barangays of Biñan City'],
        users: ['Users / Residents', 'View and manage registered users'],
        documents: ['Document Requests', 'Review and process document applications'],
        announcements: ['Announcements', 'Manage official city and barangay announcements'],
        reports: ['Issue Reports', 'Review community-submitted infrastructure reports'],
        workers: ['Workers Registry', 'Manage the skilled worker directory'],
        settings: ['Settings', 'System configuration and admin account'],
    };

    const t = titles[panelId] || ['Admin', ''];
    const titleEl = document.getElementById('adminPanelTitle');
    const subEl = document.getElementById('adminPanelSub');
    if (titleEl) titleEl.textContent = t[0];
    if (subEl) subEl.textContent = t[1];

    // Close mobile sidebar
    closeMobileSidebar();
}

/* ===== MOBILE SIDEBAR ===== */
function initMobileSidebar() {
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggleBtn) toggleBtn.addEventListener('click', openMobileSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);
}

function openMobileSidebar() {
    document.getElementById('adminSidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
}

/* ===== RENDER TABLES ===== */

function statusPill(status) {
    const map = {
        'Active': 'active', 'active': 'active',
        'Pending': 'pending', 'pending': 'pending',
        'Processing': 'processing',
        'Completed': 'completed',
        'Rejected': 'rejected',
    };
    const cls = map[status] || 'pending';
    return `<span class="status-pill ${cls}">${status}</span>`;
}

function renderOverviewTable() {
    const tbody = document.getElementById('overviewRequestsBody');
    if (!tbody) return;
    tbody.innerHTML = docRequests.slice(0, 5).map((r, i) => `
        <tr>
            <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
            <td><strong>${r.name}</strong></td>
            <td>${r.type}</td>
            <td>${r.barangay}</td>
            <td>${r.date}</td>
            <td>${statusPill(r.status)}</td>
            <td>
                ${r.status === 'Pending' ? `<button class="tbl-btn tbl-btn-approve" onclick="approveDoc('${r.ref}')"><i class="fas fa-check"></i> Approve</button>` : ''}
                <button class="tbl-btn tbl-btn-view" onclick="showAdminToast('Viewing ${r.ref}')"><i class="fas fa-eye"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderBarangayTable(filter = '') {
    const tbody = document.getElementById('barangayTableBody');
    if (!tbody) return;
    const filtered = filter
        ? barangays.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
        : barangays;

    tbody.innerHTML = filtered.map((b, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${b.name}</strong>${b.notes ? `<br><small style="color:var(--text-muted)">${b.notes}</small>` : ''}</td>
            <td>${b.captain}</td>
            <td>${b.users.toLocaleString()}</td>
            <td>${statusPill(b.status === 'active' ? 'Active' : 'Pending')}</td>
            <td>${b.added}</td>
            <td style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="tbl-btn tbl-btn-edit" onclick="openEditBarangayModal(${b.id})"><i class="fas fa-pen"></i></button>
                ${b.status === 'pending' ? `<button class="tbl-btn tbl-btn-approve" onclick="activateBarangay(${b.id})"><i class="fas fa-circle-check"></i> Activate</button>` : ''}
                <button class="tbl-btn tbl-btn-delete" onclick="deleteBarangay(${b.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    // Update pending count
    const pendingCount = document.getElementById('pendingBrgyCount');
    if (pendingCount) pendingCount.textContent = barangays.filter(b => b.status === 'pending').length;
}

function filterBarangays() {
    const val = document.getElementById('barangaySearch').value;
    renderBarangayTable(val);
}

function renderUsersTable(filter = '') {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const filtered = filter
        ? usersData.filter(u => `${u.first} ${u.last} ${u.email}`.toLowerCase().includes(filter.toLowerCase()))
        : usersData;

    tbody.innerHTML = filtered.map((u, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${u.first} ${u.last}</strong></td>
            <td>${u.email}</td>
            <td>${u.phone}</td>
            <td>${u.barangay}</td>
            <td>${u.registered}</td>
            <td>${statusPill(u.status === 'active' ? 'Active' : 'Pending')}</td>
            <td>
                <button class="tbl-btn tbl-btn-view" onclick="showAdminToast('Viewing user: ${u.first} ${u.last}')"><i class="fas fa-eye"></i></button>
                <button class="tbl-btn tbl-btn-delete" onclick="showAdminToast('User removed')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    const countEl = document.getElementById('userCount');
    if (countEl) countEl.textContent = `${filtered.length} users`;
}

function filterUsers() {
    const val = document.getElementById('userSearch').value;
    renderUsersTable(val);
}

function renderDocRequestsTable(typeFilter = '', statusFilter = '') {
    const tbody = document.getElementById('docRequestsBody');
    if (!tbody) return;
    let filtered = [...docRequests];
    if (typeFilter) filtered = filtered.filter(r => r.type === typeFilter);
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
            <td><strong>${r.name}</strong></td>
            <td>${r.type}</td>
            <td>${r.barangay}</td>
            <td>${r.date}</td>
            <td>${statusPill(r.status)}</td>
            <td style="display:flex;gap:5px;">
                ${r.status === 'Pending' ? `<button class="tbl-btn tbl-btn-approve" onclick="approveDoc('${r.ref}')"><i class="fas fa-check"></i> Approve</button>` : ''}
                <button class="tbl-btn tbl-btn-view"><i class="fas fa-eye"></i></button>
                ${r.status !== 'Rejected' && r.status !== 'Completed' ? `<button class="tbl-btn tbl-btn-delete" onclick="showAdminToast('Request rejected')">Reject</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function filterDocuments() {
    const typeVal = document.getElementById('docTypeFilter').value;
    const statusVal = document.getElementById('docStatusFilter').value;
    renderDocRequestsTable(typeVal, statusVal);
}

function approveDoc(ref) {
    showAdminToast(`✓ Document ${ref} approved and marked as Processing`);
    renderOverviewTable();
    renderDocRequestsTable();
}

function renderIssueReportsTable() {
    const tbody = document.getElementById('issueReportsBody');
    if (!tbody) return;
    tbody.innerHTML = issueReports.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.category}</td>
            <td>${r.location}</td>
            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.description}</td>
            <td>${r.reporter}</td>
            <td>${r.date}</td>
            <td>${statusPill(r.status)}</td>
            <td>
                ${r.status !== 'Completed' ? `<button class="tbl-btn tbl-btn-approve" onclick="showAdminToast('Report marked as resolved')">Resolve</button>` : ''}
                <button class="tbl-btn tbl-btn-view"><i class="fas fa-eye"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderWorkersTable() {
    const tbody = document.getElementById('workersAdminBody');
    if (!tbody) return;
    tbody.innerHTML = workersRegistry.map((w, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${w.name}</strong></td>
            <td>${w.specialty}</td>
            <td>${w.category}</td>
            <td>${w.phone}</td>
            <td>
                <span style="color:#f39c12">★</span> ${w.rating}
            </td>
            <td>${statusPill(w.status)}</td>
            <td>
                <button class="tbl-btn tbl-btn-edit" onclick="showAdminToast('Edit worker feature coming soon')"><i class="fas fa-pen"></i></button>
                <button class="tbl-btn tbl-btn-delete" onclick="showAdminToast('Worker removed')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderAnnouncementsGrid() {
    const grid = document.getElementById('announcementsAdminGrid');
    if (!grid) return;
    grid.innerHTML = announcements.map(a => `
        <div class="ann-admin-card">
            <div class="ann-card-tag">${a.category}</div>
            <h5>${a.title}</h5>
            <p>${a.content}</p>
            <div class="ann-card-footer">
                <span class="ann-card-date"><i class="fas fa-calendar-alt" style="color:var(--accent-gold)"></i> ${a.date}</span>
                <div class="ann-card-actions">
                    <button class="tbl-btn tbl-btn-edit" onclick="showAdminToast('Edit announcement feature coming soon')"><i class="fas fa-pen"></i></button>
                    <button class="tbl-btn tbl-btn-delete" onclick="deleteAnnouncement(${a.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

/* ===== BARANGAY CRUD ===== */
function openAddBarangayModal() {
    document.getElementById('addBarangayForm').reset();
    document.getElementById('brgNameError').textContent = '';
    openModal('addBarangayModalOverlay');
}

function openEditBarangayModal(id) {
    const brgy = barangays.find(b => b.id === id);
    if (!brgy) return;
    document.getElementById('editBrgId').value = id;
    document.getElementById('editBrgName').value = brgy.name;
    document.getElementById('editBrgCaptain').value = brgy.captain === '—' ? '' : brgy.captain;
    document.getElementById('editBrgStatus').value = brgy.status;
    document.getElementById('editBrgNotes').value = brgy.notes;
    openModal('editBarangayModalOverlay');
}

function deleteBarangay(id) {
    if (id === 1) {
        showAdminToast('Cannot delete the active pilot barangay!');
        return;
    }
    barangays = barangays.filter(b => b.id !== id);
    renderBarangayTable();
    showAdminToast('Barangay removed successfully');
}

function activateBarangay(id) {
    const brgy = barangays.find(b => b.id === id);
    if (brgy) {
        brgy.status = 'active';
        brgy.added = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        renderBarangayTable();
        showAdminToast(`${brgy.name} activated successfully!`);
    }
}

function deleteAnnouncement(id) {
    announcements = announcements.filter(a => a.id !== id);
    renderAnnouncementsGrid();
    showAdminToast('Announcement deleted');
}

function openAddWorkerModal() {
    showAdminToast('Add Worker form coming soon!');
}

/* ===== FORM HANDLERS ===== */
function initFormHandlers() {
    // Add Barangay
    const addBrgyForm = document.getElementById('addBarangayForm');
    if (addBrgyForm) {
        addBrgyForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const name = document.getElementById('brgName').value.trim();
            const captain = document.getElementById('brgCaptain').value.trim();
            const status = document.getElementById('brgStatus').value;
            const notes = document.getElementById('brgNotes').value.trim();

            if (!name) {
                document.getElementById('brgNameError').textContent = 'Barangay name is required.';
                return;
            }

            const newId = Math.max(...barangays.map(b => b.id)) + 1;
            barangays.push({
                id: newId,
                name,
                captain: captain || '—',
                users: 0,
                status,
                added: status === 'active' ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
                notes
            });

            renderBarangayTable();
            closeModal('addBarangayModalOverlay');
            showAdminToast(`${name} added successfully!`);
        });
    }

    // Edit Barangay
    const editBrgyForm = document.getElementById('editBarangayForm');
    if (editBrgyForm) {
        editBrgyForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const id = parseInt(document.getElementById('editBrgId').value);
            const brgy = barangays.find(b => b.id === id);
            if (!brgy) return;

            brgy.name = document.getElementById('editBrgName').value.trim() || brgy.name;
            brgy.captain = document.getElementById('editBrgCaptain').value.trim() || '—';
            brgy.status = document.getElementById('editBrgStatus').value;
            brgy.notes = document.getElementById('editBrgNotes').value.trim();

            renderBarangayTable();
            closeModal('editBarangayModalOverlay');
            showAdminToast(`${brgy.name} updated successfully!`);
        });
    }

    // Add Announcement
    const addAnnForm = document.getElementById('addAnnouncementForm');
    if (addAnnForm) {
        addAnnForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const title = document.getElementById('annTitle').value.trim();
            const category = document.getElementById('annCategory').value;
            const barangay = document.getElementById('annBarangay').value;
            const content = document.getElementById('annContent').value.trim();

            if (!title || !content) return;

            const newId = Math.max(...announcements.map(a => a.id)) + 1;
            const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            announcements.unshift({ id: newId, title, category, barangay, content, date: now });

            renderAnnouncementsGrid();
            closeModal('addAnnouncementModalOverlay');
            showAdminToast('Announcement published successfully!');
        });
    }
}

/* ===== CHART INITIALIZATION ===== */
function initCharts() {
    // Document Requests Chart
    const docCtx = document.getElementById('adminDocChart');
    if (docCtx) {
        new Chart(docCtx, {
            type: 'bar',
            data: {
                labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
                datasets: [{
                    label: 'Document Requests',
                    data: [180, 220, 195, 260, 310, 282],
                    backgroundColor: 'rgba(26, 58, 82, 0.8)',
                    borderRadius: 8,
                    borderSkipped: false,
                }, {
                    label: 'Completed',
                    data: [160, 200, 175, 245, 290, 250],
                    backgroundColor: 'rgba(212, 165, 116, 0.7)',
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // Request Types Doughnut
    const typeCtx = document.getElementById('adminTypeChart');
    if (typeCtx) {
        new Chart(typeCtx, {
            type: 'doughnut',
            data: {
                labels: ['Barangay Clearance', 'Barangay ID', 'Job Seeker Cert.'],
                datasets: [{
                    data: [45, 35, 20],
                    backgroundColor: ['#1a3a52', '#d4a574', '#2c5282'],
                    borderWidth: 3,
                    borderColor: '#fff',
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
                }
            }
        });
    }
}

/* ===== MODAL CONTROLS ===== */
function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.add('show');
        overlay.style.display = 'flex';
    }
}

function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
    }
}

function openAddAnnouncementModal() {
    document.getElementById('addAnnouncementForm').reset();
    openModal('addAnnouncementModalOverlay');
}

// Close modal on overlay click
document.querySelectorAll('.admin-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
        if (e.target === this) closeModal(this.id);
    });
});

/* ===== TOAST ===== */
let toastTimer = null;

function showAdminToast(msg) {
    const toast = document.getElementById('adminToast');
    const msgEl = document.getElementById('adminToastMsg');
    if (!toast || !msgEl) return;

    msgEl.textContent = msg;
    toast.classList.remove('d-none');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('d-none');
    }, 3500);
}
