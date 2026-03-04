// ============================================
// BIÑAN CITY HUB — MAIN.JS
// One page, two states: guest vs logged-in
// ============================================

const BCH_USER_KEY = 'bch_user';

/* ===== STATIC DATA ===== */
const workersData = [
    { name: 'Juan Cruz', specialty: 'Plumber', category: 'blue-collar', phone: '09171234567', email: 'juan.cruz@email.com', rating: 4.8, reviews: 32 },
    { name: 'Maria Santos', specialty: 'Tutor', category: 'white-collar', phone: '09201231234', email: 'maria.santos@email.com', rating: 4.9, reviews: 47 },
    { name: 'Carlos Reyes', specialty: 'Electrician', category: 'blue-collar', phone: '09175551234', email: 'carlos.reyes@email.com', rating: 4.7, reviews: 28 },
    { name: 'Anna Ferrer', specialty: 'Accountant', category: 'white-collar', phone: '09205559876', email: 'anna.ferrer@email.com', rating: 4.9, reviews: 41 },
    { name: 'Miguel Diaz', specialty: 'Carpenter', category: 'blue-collar', phone: '09178882211', email: 'miguel.diaz@email.com', rating: 4.6, reviews: 19 },
    { name: 'Rosa Villanueva', specialty: 'Mechanic', category: 'blue-collar', phone: '09209997890', email: 'rosa.v@email.com', rating: 4.5, reviews: 15 },
    { name: 'Paolo Mendoza', specialty: 'Tutor', category: 'white-collar', phone: '09171119876', email: 'paolo.m@email.com', rating: 4.8, reviews: 36 },
    { name: 'Lena Castillo', specialty: 'Electrician', category: 'blue-collar', phone: '09204445566', email: 'lena.c@email.com', rating: 4.7, reviews: 22 },
    { name: 'Ramon Torres', specialty: 'Plumber', category: 'blue-collar', phone: '09175553344', email: 'ramon.t@email.com', rating: 4.4, reviews: 11 },
    { name: 'Bea Navarro', specialty: 'Accountant', category: 'white-collar', phone: '09201112233', email: 'bea.n@email.com', rating: 4.9, reviews: 53 },
    { name: 'Dante Flores', specialty: 'Carpenter', category: 'blue-collar', phone: '09174443322', email: 'dante.f@email.com', rating: 4.3, reviews: 8 },
    { name: 'Grace Tan', specialty: 'Tutor', category: 'white-collar', phone: '09202223344', email: 'grace.t@email.com', rating: 4.7, reviews: 29 },
];

const announcementsData = [
    { category: 'Health', title: 'Community Health Drive — March 15, 2026', date: 'March 10, 2026', content: 'Free medical checkups and consultations at the Barangay Hall. No appointment needed.' },
    { category: 'Infrastructure', title: 'Road Maintenance — Zone A & B (Mar 12–19)', date: 'March 8, 2026', content: 'Secondary roads undergoing maintenance. Expect delays. Alternative routes recommended.' },
    { category: 'Youth', title: 'Summer Youth Program Registration Open', date: 'March 5, 2026', content: 'Skills training and sports activities for ages 13–17. Register at the barangay office.' },
    { category: 'Event', title: 'Fiesta Planning Meeting — March 8 @ 6PM', date: 'March 1, 2026', content: 'All interested residents welcome. Help plan our annual Barangay Fiesta.' },
];

const barangaysData = [
    { name: 'Barangay Poblacion', residents: 3892, docs: 1247, workers: 456, status: 'active' },
    { name: 'Barangay San Antonio', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Biñan', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Canlalay', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Dela Paz Norte', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Dela Paz Sur', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Ganado', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Langkiwa', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: 'Barangay Loma', residents: 0, docs: 0, workers: 0, status: 'pending' },
    { name: '+ 15 more barangays', residents: 0, docs: 0, workers: 0, status: 'soon' },
];

const reportsData = [
    { category: 'Road Damage', location: 'Zone 2, Poblacion', date: 'Mar 3, 2026', status: 'Pending' },
    { category: 'Street Light Problem', location: 'Main St.', date: 'Mar 2, 2026', status: 'Processing' },
    { category: 'Waste Management', location: 'Blk 5, Zone 1', date: 'Mar 1, 2026', status: 'Pending' },
    { category: 'Drainage Problem', location: 'Near Brgy Hall', date: 'Feb 28, 2026', status: 'Resolved' },
];

// Demo applications for the logged-in user
const userApplications = [
    { doc: 'Barangay Clearance', date: 'Feb 28, 2026', status: 'Processing', action: 'View Details' },
    { doc: 'Barangay ID', date: 'Feb 20, 2026', status: 'Completed', action: 'Download' },
    { doc: 'Job Seeker Cert.', date: 'Feb 10, 2026', status: 'Completed', action: 'Download' },
];

/* ===== CURRENT STATE ===== */
let currentUser = null;  // null = guest
let pendingAction = null; // track what guest tried

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // Check saved session first
    initAuthState();
    // Topbar & nav
    setupTopbarScroll();
    setupHamburger();
    setupTabNav();
    // Analytics
    animateCounters();
    renderAnalyticsCharts();
    renderBarangayTable();
    renderTopWorkersSidebar();
    renderAnnouncementsSidebar();
    // Workers tab
    renderWorkers(workersData);
    updateWorkerCount(workersData.length);
    setupWorkerFilters();
    // Community tab
    renderAnnouncementsPage();
    renderReportsTable();
    setupReportForm();
    // Modals
    setupApplyForm();
    // Clock
    setupStatusBarClock();
    // Check URL hash
    checkUrlHash();
});

/* ============================================================
   AUTH STATE MANAGEMENT
   ============================================================ */
function initAuthState() {
    try {
        const stored = localStorage.getItem(BCH_USER_KEY);
        if (stored) {
            currentUser = JSON.parse(stored);
            applyLoggedInUI(currentUser);
        }
    } catch (e) {
        localStorage.removeItem(BCH_USER_KEY);
    }
}

function applyLoggedInUI(user) {
    // Toggle body class — this drives all .guest-only / .user-only visibility
    document.body.classList.add('logged-in');

    // Update topbar display name
    const firstName = user.firstName || user.name || 'Resident';
    setText('topbarUserName', firstName);
    setText('mobUserName', firstName);

    // Update My Portal content
    setText('portalWelcomeName', firstName);
    setText('portalUserBarangay', user.barangay || 'Barangay Poblacion');
    setText('profileName', `${user.firstName || ''} ${user.lastName || ''}`.trim() || firstName);
    setText('profileEmail', user.email || '—');
    setText('profileBarangay', user.barangay || 'Barangay Poblacion');

    // Render user data
    renderUserApplications();
    renderPortalAnnouncementsMini();
    renderDocRecentApps();
}

function doLogout() {
    localStorage.removeItem(BCH_USER_KEY);
    currentUser = null;
    document.body.classList.remove('logged-in');
    switchTab('analytics');
    showToast('Logged out successfully.');

    // Reset topbar names
    setText('topbarUserName', '—');
    setText('mobUserName', '—');
}

/* ============================================================
   URL HASH — navigate after login redirect
   ============================================================ */
function checkUrlHash() {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['analytics', 'workers', 'documents', 'community', 'myportal'];
    if (hash && validTabs.includes(hash)) {
        switchTab(hash);
    }
}

/* ============================================================
   TOPBAR SCROLL
   ============================================================ */
function setupTopbarScroll() {
    window.addEventListener('scroll', () => {
        document.getElementById('topbar')?.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
}

/* ============================================================
   HAMBURGER
   ============================================================ */
function setupHamburger() {
    document.getElementById('hamburger')?.addEventListener('click', () => {
        document.getElementById('mobileNav').classList.toggle('open');
    });
}
function closeMobile() {
    document.getElementById('mobileNav')?.classList.remove('open');
}

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
function setupTabNav() {
    document.querySelectorAll('.tnav-link[data-tab]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchTab(link.getAttribute('data-tab'));
            closeMobile();
        });
    });
}

function switchTab(tabId) {
    // If trying to open myportal while not logged in, show login modal
    if (tabId === 'myportal' && !currentUser) {
        requireLogin('portal');
        return;
    }
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('tab-' + tabId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.tnav-link[data-tab]').forEach(l => {
        l.classList.toggle('active', l.getAttribute('data-tab') === tabId);
    });

    history.replaceState(null, null, '#' + tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   COUNTER ANIMATION
   ============================================================ */
function animateCounters() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-target'));
            let start = null;
            const tick = ts => {
                if (!start) start = ts;
                const p = Math.min((ts - start) / 1600, 1);
                const e = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.floor(e * target).toLocaleString();
                if (p < 1) requestAnimationFrame(tick);
                else el.textContent = target.toLocaleString();
            };
            requestAnimationFrame(tick);
            obs.unobserve(el);
        });
    }, { threshold: 0.4 });
    document.querySelectorAll('.counter').forEach(el => obs.observe(el));
}

/* ============================================================
   CHARTS
   ============================================================ */
function renderAnalyticsCharts() {
    // Trend chart
    const tCtx = document.getElementById('docTrendChart');
    if (tCtx) {
        new Chart(tCtx, {
            type: 'line',
            data: {
                labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
                datasets: [
                    { label: 'Barangay ID', data: [45, 52, 48, 61, 55, 67], borderColor: '#d4a574', backgroundColor: 'rgba(212,165,116,0.08)', fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#d4a574', pointBorderColor: '#fff', pointBorderWidth: 2 },
                    { label: 'Barangay Clearance', data: [30, 35, 40, 38, 52, 48], borderColor: '#5dade2', backgroundColor: 'rgba(93,173,226,0.07)', fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#5dade2', pointBorderColor: '#fff', pointBorderWidth: 2 },
                    { label: 'Job Seeker Cert.', data: [20, 22, 25, 28, 30, 35], borderColor: '#4cde80', backgroundColor: 'rgba(76,222,128,0.07)', fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#4cde80', pointBorderColor: '#fff', pointBorderWidth: 2 },
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top', labels: { color: 'rgba(255,255,255,0.55)', usePointStyle: true, padding: 14, font: { size: 11.5, weight: '600' } } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
                }
            }
        });
    }

    // Doughnut
    const dCtx = document.getElementById('docTypeChart');
    if (dCtx) {
        new Chart(dCtx, {
            type: 'doughnut',
            data: { labels: ['Barangay ID', 'Clearance', 'Job Seeker'], datasets: [{ data: [45, 35, 20], backgroundColor: ['#d4a574', '#5dade2', '#4cde80'], borderWidth: 3, borderColor: '#0f2236' }] },
            options: { responsive: true, cutout: '68%', plugins: { legend: { display: false } } }
        });
        const legend = document.getElementById('docTypeLegend');
        if (legend) {
            legend.innerHTML = [
                { l: 'Barangay ID', p: '45%', c: '#d4a574' },
                { l: 'Clearance', p: '35%', c: '#5dade2' },
                { l: 'Job Seeker', p: '20%', c: '#4cde80' },
            ].map(i => `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><span style="width:9px;height:9px;border-radius:50%;background:${i.c};flex-shrink:0"></span><span style="color:rgba(255,255,255,0.5);flex:1">${i.l}</span><span style="color:#fff;font-weight:700">${i.p}</span></div>`).join('');
        }
    }

    // Skills bar
    const sCtx = document.getElementById('skillsChart');
    if (sCtx) {
        new Chart(sCtx, {
            type: 'bar',
            data: {
                labels: ['Plumbing', 'Tutoring', 'Electrical', 'Carpentry', 'Accounting', 'Mechanics'],
                datasets: [{ label: 'Searches', data: [145, 128, 115, 98, 87, 76], backgroundColor: ['rgba(212,165,116,0.75)', 'rgba(93,173,226,0.75)', 'rgba(76,222,128,0.75)', 'rgba(212,165,116,0.55)', 'rgba(93,173,226,0.55)', 'rgba(76,222,128,0.55)'], borderRadius: 7, borderSkipped: false }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, beginAtZero: true } }
            }
        });
    }
}

/* ============================================================
   BARANGAY TABLE
   ============================================================ */
function renderBarangayTable() {
    const tbody = document.getElementById('barangayTableBody');
    if (!tbody) return;
    const pillMap = { active: { cls: 'active', label: 'Live' }, pending: { cls: 'pending', label: 'Pending' }, soon: { cls: 'soon', label: 'Coming Soon' } };
    tbody.innerHTML = barangaysData.map(b => {
        const p = pillMap[b.status] || pillMap.soon;
        return `<tr>
            <td><strong>${b.name}</strong></td>
            <td>${b.residents > 0 ? b.residents.toLocaleString() : '<span style="color:rgba(255,255,255,0.2)">—</span>'}</td>
            <td>${b.docs > 0 ? b.docs.toLocaleString() : '<span style="color:rgba(255,255,255,0.2)">—</span>'}</td>
            <td>${b.workers > 0 ? b.workers : '<span style="color:rgba(255,255,255,0.2)">—</span>'}</td>
            <td><span class="tpill ${p.cls}">${p.label}</span></td>
        </tr>`;
    }).join('');
}

/* ============================================================
   ANNOUNCEMENTS
   ============================================================ */
function buildAnnCard(a) {
    return `<div class="ann-card">
        <span class="ann-card-tag">${a.category}</span>
        <p class="ann-card-title">${a.title}</p>
        <p class="ann-card-date"><i class="fas fa-calendar-alt"></i> ${a.date}</p>
        <p class="ann-card-content">${a.content}</p>
    </div>`;
}

function renderAnnouncementsSidebar() {
    const el = document.getElementById('announcementsFeed');
    if (el) el.innerHTML = announcementsData.slice(0, 3).map(buildAnnCard).join('');
}
function renderAnnouncementsPage() {
    const el = document.getElementById('communityAnnouncementsFeed');
    if (el) el.innerHTML = announcementsData.map(buildAnnCard).join('');
}
function renderPortalAnnouncementsMini() {
    const el = document.getElementById('portalAnnouncementsMini');
    if (el) el.innerHTML = announcementsData.slice(0, 3).map(buildAnnCard).join('');
}

/* ============================================================
   TOP WORKERS SIDEBAR
   ============================================================ */
function renderTopWorkersSidebar() {
    const el = document.getElementById('topWorkersList');
    if (!el) return;
    const top = [...workersData].sort((a, b) => b.rating - a.rating).slice(0, 5);
    el.innerHTML = top.map(w => `
        <div class="top-worker-item" onclick="handleWorkerContact('${w.name}','${w.specialty}','${w.phone}','${w.email}')">
            <div class="tw-avatar"><i class="fas fa-user"></i></div>
            <div class="tw-info">
                <span class="tw-name">${w.name}</span>
                <span class="tw-spec">${w.specialty}</span>
            </div>
            <span class="tw-rating">⭐ ${w.rating}</span>
        </div>
    `).join('');
}

/* ============================================================
   WORKER GRID
   ============================================================ */
function renderWorkers(workers) {
    const grid = document.getElementById('workerDirectory');
    if (!grid) return;
    if (!workers.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:rgba(255,255,255,0.22)"><i class="fas fa-user-slash" style="font-size:34px;display:block;margin-bottom:13px"></i>No workers match your filters.</div>`;
        return;
    }
    grid.innerHTML = workers.map(w => `
        <div class="worker-card">
            <div class="worker-info">
                <div class="worker-avatar"><i class="fas fa-user"></i></div>
                <p class="worker-name">${w.name}</p>
                <p class="worker-specialty">${w.specialty}</p>
                <span class="worker-category">${w.category === 'blue-collar' ? '🔧 Blue Collar' : '💼 White Collar'}</span>
                <div class="worker-rating">⭐ ${w.rating.toFixed(1)} · <span style="color:rgba(255,255,255,0.3)">${w.reviews} reviews</span></div>
            </div>
            <div class="worker-contact">
                <button class="btn-contact" onclick="handleWorkerContact('${w.name}','${w.specialty}','${w.phone}','${w.email}')">
                    <i class="fas fa-phone"></i> Call
                </button>
                <button class="btn-contact" onclick="handleWorkerContact('${w.name}','${w.specialty}','${w.phone}','${w.email}')">
                    <i class="fas fa-envelope"></i> Email
                </button>
            </div>
        </div>
    `).join('');
}

function updateWorkerCount(n) {
    setText('workerCount', n);
    setText('workerFilterCount', `${n} workers`);
}

function setupWorkerFilters() {
    ['workerSearch', 'categoryFilter', 'specialtyFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyWorkerFilters);
        document.getElementById(id)?.addEventListener('change', applyWorkerFilters);
    });
}

function applyWorkerFilters() {
    const term = (document.getElementById('workerSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('categoryFilter')?.value || '';
    const spec = document.getElementById('specialtyFilter')?.value || '';
    const filtered = workersData.filter(w => {
        const ms = w.name.toLowerCase().includes(term) || w.specialty.toLowerCase().includes(term);
        const mc = !cat || w.category === cat;
        const msp = !spec || w.specialty.toLowerCase() === spec.toLowerCase();
        return ms && mc && msp;
    });
    renderWorkers(filtered);
    updateWorkerCount(filtered.length);
}

/* ============================================================
   WORKER CONTACT — smart: guests get login modal, users get contact modal
   ============================================================ */
function handleWorkerContact(name, specialty, phone, email) {
    if (!currentUser) {
        requireLogin('contact');
        return;
    }
    // Logged in → show contact details
    setText('contactName', name);
    setText('contactSpec', specialty);
    setText('contactPhoneTxt', phone);
    setText('contactEmailTxt', email);
    document.getElementById('contactPhone').href = 'tel:' + phone;
    document.getElementById('contactEmail').href = 'mailto:' + email;
    document.getElementById('contactModal').classList.add('open');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.remove('open');
}

/* ============================================================
   DOCUMENT ACTION — smart: guests get login modal, users get apply form
   ============================================================ */
function handleDocAction(docName) {
    if (!currentUser) {
        requireLogin('apply');
        return;
    }
    openApplyModal(docName);
}

/* ============================================================
   APPLY MODAL (logged-in users)
   ============================================================ */
let applyModalDocName = '';

function openApplyModal(docName) {
    applyModalDocName = docName;
    setText('applyModalTitle', `Apply — ${docName}`);
    setText('applyModalSub', `Fill in the required details for your ${docName} request.`);

    // Show purpose field only for clearance
    const pw = document.getElementById('applyPurposeWrap');
    if (pw) pw.style.display = docName.toLowerCase().includes('clearance') ? 'block' : 'none';

    // Pre-fill with user data if available
    if (currentUser) {
        const nameInput = document.getElementById('applyFullName');
        const emailInput = document.getElementById('applyEmail');
        if (nameInput && !nameInput.value) nameInput.value = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
        if (emailInput && !emailInput.value) emailInput.value = currentUser.email || '';
    }

    document.getElementById('applyModal').classList.add('open');
}

function closeApplyModal() {
    document.getElementById('applyModal').classList.remove('open');
    document.getElementById('applyForm')?.reset();
}

function setupApplyForm() {
    document.getElementById('applyForm')?.addEventListener('submit', e => {
        e.preventDefault();
        closeApplyModal();
        // Simulate adding to applications
        userApplications.unshift({ doc: applyModalDocName, date: formatDate(new Date()), status: 'Pending', action: 'View Details' });
        renderUserApplications();
        renderDocRecentApps();
        showToast(`${applyModalDocName} application submitted! We'll notify you on updates.`);
    });
}

/* ============================================================
   USER APPLICATIONS (My Portal tab)
   ============================================================ */
function renderUserApplications() {
    const tbody = document.getElementById('userApplicationsBody');
    if (!tbody) return;
    const pillMap = { Pending: 'pending', Processing: 'processing', Completed: 'active', Resolved: 'active' };
    tbody.innerHTML = userApplications.map(a => `
        <tr>
            <td><strong>${a.doc}</strong></td>
            <td style="color:rgba(255,255,255,0.45)">${a.date}</td>
            <td><span class="tpill ${pillMap[a.status] || 'pending'}">${a.status}</span></td>
            <td><button class="gc-link-btn">${a.action}</button></td>
        </tr>
    `).join('');
}

function renderDocRecentApps() {
    const tbody = document.getElementById('docRecentAppsBody');
    if (!tbody) return;
    const pillMap = { Pending: 'pending', Processing: 'processing', Completed: 'active' };
    tbody.innerHTML = userApplications.slice(0, 3).map(a => `
        <tr>
            <td><strong>${a.doc}</strong></td>
            <td style="color:rgba(255,255,255,0.45)">${a.date}</td>
            <td><span class="tpill ${pillMap[a.status] || 'pending'}">${a.status}</span></td>
            <td><button class="gc-link-btn">${a.action}</button></td>
        </tr>
    `).join('');
}

/* ============================================================
   REPORT FORM (community tab — logged-in only)
   ============================================================ */
function setupReportForm() {
    document.getElementById('reportForm')?.addEventListener('submit', e => {
        e.preventDefault();
        e.target.reset();
        showToast('Issue report submitted! The barangay team will respond shortly.');
    });
}

/* ============================================================
   REPORTS TABLE
   ============================================================ */
function renderReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;
    const pillMap = { Pending: 'pending', Processing: 'processing', Resolved: 'active' };
    tbody.innerHTML = reportsData.map(r => `
        <tr>
            <td>${r.category}</td>
            <td>${r.location}</td>
            <td style="color:rgba(255,255,255,0.4)">${r.date}</td>
            <td><span class="tpill ${pillMap[r.status] || 'pending'}">${r.status}</span></td>
        </tr>
    `).join('');
}

/* ============================================================
   GUEST LOGIN MODAL — context-aware copy
   ============================================================ */
const loginModalCopy = {
    apply: { icon: 'fas fa-file-pen', title: 'Login to Apply', desc: 'Create a free account to submit document applications and track their status.' },
    contact: { icon: 'fas fa-address-book', title: 'Login to Contact Workers', desc: 'Login or signup to view contact details and connect directly with workers.' },
    report: { icon: 'fas fa-triangle-exclamation', title: 'Login to Submit Report', desc: 'You need an account to submit issue reports and track their resolution.' },
    portal: { icon: 'fas fa-user-circle', title: 'Login to View My Portal', desc: 'Login or signup to access your personal portal, applications, and profile.' },
    default: { icon: 'fas fa-lock', title: 'Login Required', desc: 'Please login or create a free account to continue.' },
};

function requireLogin(action = 'default') {
    pendingAction = action;
    const copy = loginModalCopy[action] || loginModalCopy.default;
    document.getElementById('modalIco').innerHTML = `<i class="${copy.icon}"></i>`;
    setText('modalTitle', copy.title);
    setText('modalDesc', copy.desc);
    showLoginModal();
}

function showLoginModal() { document.getElementById('loginModal').classList.add('open'); }
function closeLoginModal() { document.getElementById('loginModal').classList.remove('open'); }

// Close modals on backdrop click
document.addEventListener('click', e => {
    if (e.target.id === 'loginModal') closeLoginModal();
    if (e.target.id === 'applyModal') closeApplyModal();
    if (e.target.id === 'contactModal') closeContactModal();
});

// ESC key closes any open modal
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeLoginModal();
    closeApplyModal();
    closeContactModal();
    closeMobile();
});

/* ============================================================
   STATUS BAR CLOCK
   ============================================================ */
function setupStatusBarClock() {
    const el = document.getElementById('statusBarTime');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    tick(); setInterval(tick, 1000);
}

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
let toastTimer;
function showToast(msg) {
    const el = document.getElementById('portalToast');
    const span = document.getElementById('portalToastMsg');
    if (!el || !span) return;
    span.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

/* ============================================================
   HELPERS
   ============================================================ */
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function formatDate(d) {
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
