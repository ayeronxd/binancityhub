// ================================
// BIÑAN CITY HUB - MAIN SCRIPT
// Smart City Web Portal Application
// ================================

/* =========== GLOBALS & STATE =========== */
let currentUserRole = 'guest';
let dashboardChart = null;
let skillsChart = null;

// Sample Worker Data
const workersData = [
    { id: 1, name: 'Juan Cruz', specialty: 'Plumber', category: 'blue-collar', rating: 4.8, reviews: 24, phone: '09171234567', email: 'juan.cruz@email.com' },
    { id: 2, name: 'Maria Santos', specialty: 'Tutor', category: 'white-collar', rating: 4.9, reviews: 18, phone: '09209876543', email: 'maria.santos@email.com' },
    { id: 3, name: 'Carlos Reyes', specialty: 'Electrician', category: 'blue-collar', rating: 4.7, reviews: 31, phone: '09175551234', email: 'carlos.reyes@email.com' },
    { id: 4, name: 'Anna Ferrer', specialty: 'Accountant', category: 'white-collar', rating: 4.9, reviews: 22, phone: '09205559876', email: 'anna.ferrer@email.com' },
    { id: 5, name: 'Miguel Diaz', specialty: 'Carpenter', category: 'blue-collar', rating: 4.6, reviews: 15, phone: '09178882211', email: 'miguel.diaz@email.com' },
    { id: 6, name: 'Rosa Villegas', specialty: 'Tutor', category: 'white-collar', rating: 4.8, reviews: 26, phone: '09203334455', email: 'rosa.villegas@email.com' },
    { id: 7, name: 'Paolo Mendoza', specialty: 'Mechanic', category: 'blue-collar', rating: 4.5, reviews: 19, phone: '09179998877', email: 'paolo.mendoza@email.com' },
];

// Sample Announcements Data
const announcementsData = [
    {
        title: 'Community Health Drive - March 15, 2026',
        date: 'March 10, 2026',
        content: 'Free medical checkups and health consultations will be held at the Barangay Hall. Schedule your appointment today!'
    },
    {
        title: 'Road Maintenance Schedule',
        date: 'March 8, 2026',
        content: 'Secondary roads in Zone A and B will undergo maintenance from March 12-19. Please plan your routes accordingly.'
    },
    {
        title: 'Summer Youth Program Registration',
        date: 'March 5, 2026',
        content: 'Registration is open for our Summer Youth Program. Various skills training and sports activities available for ages 13-17.'
    },
    {
        title: 'Barangay Fiesta Planning Committee Meeting',
        date: 'March 1, 2026',
        content: 'All interested residents are invited to participate in the Fiesta planning. Meeting is scheduled for March 8 at 6 PM.'
    },
];

// Sample Application Data (stored submissions)
const applicationsData = {
    1: {
        id: 1,
        type: 'Barangay Clearance',
        fullName: 'Maria Dela Cruz',
        address: 'Blk 5, Lot 12, Poblacion St., Biñan City',
        date: 'Feb 28, 2026',
        status: 'Processing',
        purpose: 'Employment',
        submittedData: JSON.stringify({
            fullName: 'Maria Dela Cruz',
            address: 'Blk 5, Lot 12, Poblacion St., Biñan City',
            purpose: 'Employment',
            submissionDate: 'Feb 28, 2026 at 2:30 PM',
            refNumber: 'BCL-2026-00847'
        }, null, 2)
    },
    2: {
        id: 2,
        type: 'Barangay ID',
        fullName: 'Juan Santos Reyes',
        address: 'Zone 3, Barangay Poblacion, Biñan City',
        date: 'Feb 20, 2026',
        status: 'Completed',
        phone: '09171234567',
        birthdate: 'May 15, 1985',
        submittedData: JSON.stringify({
            fullName: 'Juan Santos Reyes',
            address: 'Zone 3, Barangay Poblacion, Biñan City',
            birthdate: 'May 15, 1985',
            phone: '09171234567',
            submissionDate: 'Feb 20, 2026 at 10:15 AM',
            refNumber: 'BID-2026-00823',
            idNumber: 'BP-000012345'
        }, null, 2)
    }
};

/* =========== INITIALIZATION =========== */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Biñan City Hub Portal Initialized');
    
    // Initialize event listeners
    initializeNavigation();
    initializeUserRole();
    initializeSidebar();
    initializeFormValidation();
    initializeApplicationActions();
    initializeAuthForms();
    initializeWorkerHub();
    initializeAnnouncements();
    initializeCharts();
});

/* =========== NAVIGATION SYSTEM =========== */
/**
 * Initialize navigation between sections
 * Handles switching between Dashboard, Digital Governance, Worker Hub, and Community Reports
 */
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Get section ID
            const sectionName = this.getAttribute('data-section');
            showSection(sectionName);
            
            // Close sidebar on mobile after navigation
            const sidebar = document.getElementById('sidebar');
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('show');
            }
        });
    });
    
    // Set dashboard as default active section
    showSection('dashboard');
}

/**
 * Show/hide sections based on section name
 * @param {string} sectionName - Name of the section to show
 */
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    // Show selected section
    const selectedSection = document.getElementById(sectionName + '-section');
    if (selectedSection) {
        selectedSection.classList.add('active');
        
        // Trigger chart redraw if dashboard section
        if (sectionName === 'dashboard' && dashboardChart) {
            dashboardChart.resize();
            skillsChart.resize();
        }
    }
}

/* =========== USER ROLE MANAGEMENT =========== */
/**
 * Initialize user role selector and handle minor protection logic
 */
function initializeUserRole() {
    const userRoleSelect = document.getElementById('userRole');
    const minorAlert = document.getElementById('minorAlert');
    
    userRoleSelect.addEventListener('change', function() {
        currentUserRole = this.value;
        console.log('User role changed to:', currentUserRole);
        
        // Show/hide minor alert based on role selection
        if (currentUserRole === 'resident-minor') {
            minorAlert.classList.remove('d-none');
            console.log('Minor protection activated - Parental Consent Required');
            
            // Disable document request forms for minors
            disableDocumentForms();
        } else {
            minorAlert.classList.add('d-none');
            
            // Enable document request forms
            enableDocumentForms();
        }
    });
}

/**
 * Disable document request forms for minors
 */
function disableDocumentForms() {
    const formButtons = document.querySelectorAll('[data-bs-target="#barangayIdModal"], [data-bs-target="#barangayClearanceModal"], [data-bs-target="#jobSeekerModal"]');
    formButtons.forEach(button => {
        button.disabled = true;
        button.title = 'Parental consent required for minors';
        button.classList.add('opacity-50');
    });
}

/**
 * Enable document request forms
 */
function enableDocumentForms() {
    const formButtons = document.querySelectorAll('[data-bs-target="#barangayIdModal"], [data-bs-target="#barangayClearanceModal"], [data-bs-target="#jobSeekerModal"]');
    formButtons.forEach(button => {
        button.disabled = false;
        button.title = '';
        button.classList.remove('opacity-50');
    });
}

/* =========== SIDEBAR TOGGLE FOR MOBILE =========== */
/**
 * Initialize mobile sidebar functionality
 */
function initializeSidebar() {
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    
    // Toggle sidebar visibility
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }
    
    // Close sidebar
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            sidebar.classList.remove('show');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!e.target.closest('.sidebar') && !e.target.closest('#toggleSidebarBtn')) {
                sidebar.classList.remove('show');
            }
        }
    });
}

/* =========== FORM VALIDATION =========== */
/**
 * Initialize form validation for all forms
 */
function initializeFormValidation() {
    // Document Request Forms
    const barangayIdForm = document.getElementById('barangayIdForm');
    const barangayClearanceForm = document.getElementById('barangayClearanceForm');
    const jobSeekerForm = document.getElementById('jobSeekerForm');
    const reportForm = document.getElementById('reportForm');
    
    // Barangay ID Form
    if (barangayIdForm) {
        barangayIdForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (validateBarangayIdForm()) {
                submitDocumentForm('Barangay ID');
            }
        });
    }
    
    // Barangay Clearance Form
    if (barangayClearanceForm) {
        barangayClearanceForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (validateBarangayClearanceForm()) {
                submitDocumentForm('Barangay Clearance');
            }
        });
    }
    
    // Job Seeker Form
    if (jobSeekerForm) {
        jobSeekerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (validateJobSeekerForm()) {
                submitDocumentForm('First-Time Job Seeker Certification');
            }
        });
    }
    
    // Report Form
    if (reportForm) {
        reportForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (validateReportForm()) {
                submitReport();
            }
        });
    }
}

/**
 * Validate Barangay ID Form
 * @returns {boolean} True if form is valid
 */
function validateBarangayIdForm() {
    let isValid = true;
    const fullName = document.getElementById('idFullName').value.trim();
    const address = document.getElementById('idAddress').value.trim();
    const birthdate = document.getElementById('idBirthdate').value;
    const phone = document.getElementById('idPhone').value.trim();
    
    // Clear previous errors
    clearFormErrors(['idFullName', 'idAddress', 'idBirthdate', 'idPhone']);
    
    // Validate Full Name
    if (!fullName || fullName.length < 5) {
        showError('idFullName', 'Please enter a valid full name');
        isValid = false;
    }
    
    // Validate Address
    if (!address || address.length < 5) {
        showError('idAddress', 'Please enter a valid address');
        isValid = false;
    }
    
    // Validate Birthdate
    if (!birthdate) {
        showError('idBirthdate', 'Please select your birthdate');
        isValid = false;
    }
    
    // Validate Phone
    if (!phone || !phone.match(/^[0-9]{10,11}$/)) {
        showError('idPhone', 'Please enter a valid phone number (10-11 digits)');
        isValid = false;
    }
    
    return isValid;
}

/**
 * Validate Barangay Clearance Form
 * @returns {boolean} True if form is valid
 */
function validateBarangayClearanceForm() {
    let isValid = true;
    const fullName = document.getElementById('clearFullName').value.trim();
    const address = document.getElementById('clearAddress').value.trim();
    const purpose = document.getElementById('clearPurpose').value;
    
    // Clear previous errors
    clearFormErrors(['clearFullName', 'clearAddress', 'clearPurpose']);
    
    // Validate Full Name
    if (!fullName || fullName.length < 5) {
        showError('clearFullName', 'Please enter a valid full name');
        isValid = false;
    }
    
    // Validate Address
    if (!address || address.length < 5) {
        showError('clearAddress', 'Please enter a valid address');
        isValid = false;
    }
    
    // Validate Purpose
    if (!purpose) {
        showError('clearPurpose', 'Please select the purpose of clearance');
        isValid = false;
    }
    
    return isValid;
}

/**
 * Validate Job Seeker Form
 * @returns {boolean} True if form is valid
 */
function validateJobSeekerForm() {
    let isValid = true;
    const fullName = document.getElementById('jobFullName').value.trim();
    const education = document.getElementById('jobEducation').value;
    const email = document.getElementById('jobEmail').value.trim();
    
    // Clear previous errors
    clearFormErrors(['jobFullName', 'jobEducation', 'jobEmail']);
    
    // Validate Full Name
    if (!fullName || fullName.length < 5) {
        showError('jobFullName', 'Please enter a valid full name');
        isValid = false;
    }
    
    // Validate Education
    if (!education) {
        showError('jobEducation', 'Please select your educational attainment');
        isValid = false;
    }
    
    // Validate Email
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showError('jobEmail', 'Please enter a valid email address');
        isValid = false;
    }
    
    return isValid;
}

/**
 * Validate Report Form
 * @returns {boolean} True if form is valid
 */
function validateReportForm() {
    let isValid = true;
    const category = document.getElementById('reportCategory').value;
    const location = document.getElementById('reportLocation').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    
    // Clear previous errors
    clearFormErrors(['reportCategory', 'reportLocation', 'reportDescription']);
    
    // Validate Category
    if (!category) {
        showError('reportCategory', 'Please select a category');
        isValid = false;
    }
    
    // Validate Location
    if (!location || location.length < 3) {
        showError('reportLocation', 'Please enter a valid location');
        isValid = false;
    }
    
    // Validate Description
    if (!description || description.length < 10) {
        showError('reportDescription', 'Please enter a detailed description (at least 10 characters)');
        isValid = false;
    }
    
    return isValid;
}

/**
 * Show form error message
 * @param {string} fieldId - ID of the form field
 * @param {string} message - Error message to display
 */
function showError(fieldId, message) {
    const errorElement = document.getElementById(fieldId + 'Error');
    if (errorElement) {
        errorElement.textContent = message;
    }
}

/**
 * Clear form errors
 * @param {array} fieldIds - Array of field IDs to clear errors for
 */
function clearFormErrors(fieldIds) {
    fieldIds.forEach(id => {
        const errorElement = document.getElementById(id + 'Error');
        if (errorElement) {
            errorElement.textContent = '';
        }
    });
}

/**
 * Submit document application form
 * @param {string} documentType - Type of document being applied for
 */
function submitDocumentForm(documentType) {
    // Show success alert
    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show" role="alert">
            <i class="fas fa-check-circle"></i> <strong>Success!</strong> Your application for ${documentType} has been submitted. 
            You will receive updates via email.
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const governanceSection = document.getElementById('governance-section');
    const existingAlert = governanceSection.querySelector('.alert-success');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    governanceSection.insertAdjacentHTML('afterbegin', alertHtml);
    
    // Reset form and close modal
    event.target.reset();
    const modalElement = event.target.closest('.modal');
    if (modalElement) {
        const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        modal.hide();
    }
    
    console.log('Document form submitted:', documentType);
}

/**
 * Submit infrastructure report
 */
function submitReport() {
    const category = document.getElementById('reportCategory').value;
    const location = document.getElementById('reportLocation').value;
    const description = document.getElementById('reportDescription').value;
    
    // Show success alert
    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show" role="alert">
            <i class="fas fa-check-circle"></i> <strong>Report Submitted!</strong> Thank you for helping us improve our community. 
            Your report has been received and will be reviewed by our team.
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const communitySection = document.getElementById('community-section');
    const existingAlert = communitySection.querySelector('.alert-success');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    communitySection.insertAdjacentHTML('afterbegin', alertHtml);
    
    // Reset form
    document.getElementById('reportForm').reset();
    
    console.log('Report submitted:', { category, location, description });
}

/* =========== APPLICATION ACTIONS =========== */
/**
 * Initialize event handlers for application action buttons (View Details, Download)
 */
function initializeApplicationActions() {
    const actionButtons = document.querySelectorAll('.action-btn');
    
    actionButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            const appId = this.getAttribute('data-app-id');
            const action = this.getAttribute('data-action');
            
            if (action === 'details') {
                showApplicationDetails(appId);
            } else if (action === 'download') {
                downloadApplication(appId);
            }
        });
    });
    
    console.log('Application action handlers initialized');
}

/**
 * Show application details in a modal
 * @param {string} appId - Application ID
 */
function showApplicationDetails(appId) {
    const application = applicationsData[appId];
    
    if (!application) {
        console.error('Application not found:', appId);
        return;
    }
    
    // Populate modal with application details
    document.getElementById('detailType').textContent = application.type;
    document.getElementById('detailName').textContent = application.fullName;
    document.getElementById('detailAddress').textContent = application.address;
    document.getElementById('detailDate').textContent = application.date;
    
    // Set badge color based on status
    const statusBadge = document.querySelector('#detailStatus');
    statusBadge.innerHTML = '';
    
    if (application.status === 'Processing') {
        statusBadge.innerHTML = '<span class="badge bg-warning">Processing</span>';
    } else if (application.status === 'Completed') {
        statusBadge.innerHTML = '<span class="badge bg-success">Completed</span>';
    } else {
        statusBadge.textContent = application.status;
    }
    
    document.getElementById('detailData').textContent = application.submittedData;
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('applicationDetailsModal'));
    modal.show();
    
    console.log('Application details shown for ID:', appId);
}

/**
 * Download application document
 * @param {string} appId - Application ID
 */
function downloadApplication(appId) {
    const application = applicationsData[appId];
    
    if (!application) {
        console.error('Application not found:', appId);
        return;
    }
    
    // Create a text document with application details
    const documentContent = `
BIÑAN CITY HUB - APPLICATION DOCUMENT
========================================

Document Type: ${application.type}
Full Name: ${application.fullName}
Address: ${application.address}
Application Date: ${application.date}
Status: ${application.status}

Application Details:
${application.submittedData}

========================================
This is an official document from Biñan City Government
Pilot Implementation: Barangay Poblacion
`;
    
    // Create a Blob and trigger download
    const element = document.createElement('a');
    const file = new Blob([documentContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${application.type.replace(/\s+/g, '_')}_${appId}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    // Show success message
    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show" role="alert">
            <i class="fas fa-download"></i> <strong>Download Started!</strong> Your ${application.type} document is being downloaded.
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const governanceSection = document.getElementById('governance-section');
    const existingAlert = governanceSection.querySelector('.alert-success');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    governanceSection.insertAdjacentHTML('afterbegin', alertHtml);
    
    console.log('Application downloaded for ID:', appId);
}

/* =========== AUTHENTICATION FORMS =========== */
/**
 * Initialize login and signup form handlers
 */
function initializeAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    console.log('Authentication forms initialized');
}

/**
 * Handle login form submission
 */
function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // Clear errors
    document.getElementById('loginEmailError').textContent = '';
    document.getElementById('loginPasswordError').textContent = '';
    
    let isValid = true;
    
    // Validate email
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        document.getElementById('loginEmailError').textContent = 'Please enter a valid email address';
        isValid = false;
    }
    
    // Validate password
    if (!password || password.length < 6) {
        document.getElementById('loginPasswordError').textContent = 'Password must be at least 6 characters';
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show success message
    showAuthSuccess('Login successful! Welcome back to Biñan City Hub.', 'loginModal');
    console.log('Login submitted:', email);
}

/**
 * Handle signup form submission
 */
function handleSignup(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;
    
    // Clear errors
    document.getElementById('signupNameError').textContent = '';
    document.getElementById('signupEmailError').textContent = '';
    document.getElementById('signupPhoneError').textContent = '';
    document.getElementById('signupPasswordError').textContent = '';
    document.getElementById('signupConfirmPasswordError').textContent = '';
    
    let isValid = true;
    
    // Validate full name
    if (!fullName || fullName.length < 3) {
        document.getElementById('signupNameError').textContent = 'Full name must be at least 3 characters';
        isValid = false;
    }
    
    // Validate email
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        document.getElementById('signupEmailError').textContent = 'Please enter a valid email address';
        isValid = false;
    }
    
    // Validate phone
    if (!phone || !phone.match(/^[0-9]{10,11}$/)) {
        document.getElementById('signupPhoneError').textContent = 'Please enter a valid phone number (10-11 digits)';
        isValid = false;
    }
    
    // Validate password
    if (!password || password.length < 8) {
        document.getElementById('signupPasswordError').textContent = 'Password must be at least 8 characters';
        isValid = false;
    }
    
    // Validate password match
    if (password !== confirmPassword) {
        document.getElementById('signupConfirmPasswordError').textContent = 'Passwords do not match';
        isValid = false;
    }
    
    // Validate terms agreement
    if (!agreeTerms) {
        alert('Please agree to the Terms and Conditions');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show success message
    showAuthSuccess('Account created successfully! You can now login.', 'signupModal');
    console.log('Signup submitted:', { fullName, email, phone });
}

/**
 * Show authentication success message
 * @param {string} message - Success message to display
 * @param {string} modalId - ID of modal to close
 */
function showAuthSuccess(message, modalId) {
    // Close the modal
    const modalElement = document.getElementById(modalId);
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) {
        modal.hide();
    }
    
    // Show success alert on the page
    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show\" role=\"alert\" style=\"margin-top: 20px; z-index: 2000; position: relative;\">
            <i class=\"fas fa-check-circle\"></i> <strong>Success!</strong> ${message}
            <button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\"></button>
        </div>
    `;
    
    const dashboard = document.getElementById('dashboard-section');
    if (dashboard) {
        dashboard.insertAdjacentHTML('afterbegin', alertHtml);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const alert = dashboard.querySelector('.alert-success');
            if (alert) alert.remove();
        }, 5000);
    }
}

/* =========== WORKER HUB =========== */
/**
 * Initialize Worker Hub with filtering and display
 */
function initializeWorkerHub() {
    const searchInput = document.getElementById('workerSearch');
    const categoryFilter = document.getElementById('categoryFilter');
    const specialtyFilter = document.getElementById('specialtyFilter');
    
    // Initial render
    renderWorkers(workersData);
    
    // Event listeners for filtering
    searchInput.addEventListener('input', filterWorkers);
    categoryFilter.addEventListener('change', filterWorkers);
    specialtyFilter.addEventListener('change', filterWorkers);
}

/**
 * Filter and display workers based on search and filters
 */
function filterWorkers() {
    const searchTerm = document.getElementById('workerSearch').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    const specialty = document.getElementById('specialtyFilter').value;
    
    // Filter workers based on criteria
    const filteredWorkers = workersData.filter(worker => {
        const matchesSearch = worker.name.toLowerCase().includes(searchTerm) || 
                            worker.specialty.toLowerCase().includes(searchTerm);
        const matchesCategory = !category || worker.category === category;
        const matchesSpecialty = !specialty || worker.specialty.toLowerCase() === specialty.toLowerCase();
        
        return matchesSearch && matchesCategory && matchesSpecialty;
    });
    
    renderWorkers(filteredWorkers);
    console.log('Filtered workers:', filteredWorkers.length);
}

/**
 * Render worker cards to the page
 * @param {array} workers - Array of worker objects to display
 */
function renderWorkers(workers) {
    const directory = document.getElementById('workerDirectory');
    
    if (workers.length === 0) {
        directory.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info" role="alert">
                    <i class="fas fa-info-circle"></i> No workers found matching your criteria. Try adjusting your filters.
                </div>
            </div>
        `;
        return;
    }
    
    directory.innerHTML = workers.map(worker => `
        <div class="col-md-6 col-lg-4">
            <div class="worker-card">
                <div class="worker-info">
                    <div class="worker-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <p class="worker-name">${worker.name}</p>
                    <p class="worker-specialty">${worker.specialty}</p>
                    <span class="worker-category">${worker.category === 'blue-collar' ? '🔧 Blue Collar' : '💼 White Collar'}</span>
                    <div class="worker-rating">
                        ${'⭐'.repeat(Math.floor(worker.rating))} ${worker.rating.toFixed(1)} (${worker.reviews} reviews)
                    </div>
                </div>
                <div class="worker-contact">
                    <a href="tel:${worker.phone}" class="btn-call">
                        <i class="fas fa-phone"></i> Call
                    </a>
                    <a href="mailto:${worker.email}" class="btn-message">
                        <i class="fas fa-envelope"></i> Email
                    </a>
                </div>
            </div>
        </div>
    `).join('');
    
    console.log('Workers rendered:', workers.length);

    // Attach click handlers for contact buttons to show pop-up animation
    const contactLinks = directory.querySelectorAll('.worker-contact a');
    contactLinks.forEach(link => {
        link.addEventListener('click', handleContactClick);
    });
}

/**
 * Handle click on call/email buttons to show a brief pop-up animation
 * then perform the original action (tel: / mailto:)
 */
function handleContactClick(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    const href = btn.getAttribute('href') || '#';
    const isTel = href.indexOf('tel:') === 0;
    const isMail = href.indexOf('mailto:') === 0;
    const msg = isTel ? 'Calling...' : isMail ? 'Composing email...' : 'Opening...';
    const card = btn.closest('.worker-card');
    if (!card) return;

    // Remove existing bubble if any
    const existing = card.querySelector('.pop-bubble');
    if (existing) existing.remove();

    // Create bubble
    const bubble = document.createElement('div');
    bubble.className = 'pop-bubble';
    bubble.textContent = msg;
    card.appendChild(bubble);

    // Position bubble centered above the clicked button
    const btnRect = btn.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const centerX = btnRect.left - cardRect.left + (btnRect.width / 2);
    bubble.style.left = `${centerX}px`;
    const topY = btnRect.top - cardRect.top - 8;
    bubble.style.top = `${topY}px`;

    // Animate in
    requestAnimationFrame(() => bubble.classList.add('show'));
    btn.classList.add('pop-active');

    // After short delay, hide animation and perform original action
    setTimeout(() => {
        bubble.classList.remove('show');
        btn.classList.remove('pop-active');
        setTimeout(() => {
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, 180);

        // Follow the original link after animation so the pop is visible
        if (isTel || isMail) {
            window.location.href = href;
        }
    }, 800);
}

/* =========== ANNOUNCEMENTS =========== */
/**
 * Initialize and render announcements feed
 */
function initializeAnnouncements() {
    renderAnnouncements();
}

/**
 * Render announcements to the page
 */
function renderAnnouncements() {
    const feed = document.getElementById('announcementsFeed');
    
    feed.innerHTML = announcementsData.map(announcement => `
        <div class="announcement-card">
            <p class="announcement-title">${announcement.title}</p>
            <p class="announcement-date">
                <i class="fas fa-calendar-alt"></i> ${announcement.date}
            </p>
            <p class="announcement-content">${announcement.content}</p>
        </div>
    `).join('');
    
    console.log('Announcements rendered:', announcementsData.length);
}

/* =========== CHARTS =========== */
/**
 * Initialize Chart.js charts for dashboard
 */
function initializeCharts() {
    // Document Request Volume Chart
    const documentCtx = document.getElementById('documentChart');
    if (documentCtx) {
        dashboardChart = new Chart(documentCtx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Current'],
                datasets: [{
                    label: 'Barangay ID',
                    data: [45, 52, 48, 61, 55, 67],
                    borderColor: '#1a3a52',
                    backgroundColor: 'rgba(26, 58, 82, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointBackgroundColor: '#1a3a52',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }, {
                    label: 'Barangay Clearance',
                    data: [30, 35, 40, 38, 42, 48],
                    borderColor: '#d4a574',
                    backgroundColor: 'rgba(212, 165, 116, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointBackgroundColor: '#d4a574',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }, {
                    label: 'Job Seeker Cert',
                    data: [20, 22, 25, 28, 30, 35],
                    borderColor: '#2c5282',
                    backgroundColor: 'rgba(44, 82, 130, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointBackgroundColor: '#2c5282',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }
    
    // Top Searched Skills Chart
    const skillsCtx = document.getElementById('skillsChart');
    if (skillsCtx) {
        skillsChart = new Chart(skillsCtx, {
            type: 'bar',
            data: {
                labels: ['Plumbing', 'Tutoring', 'Electrical', 'Carpentry', 'Accounting', 'Mechanics'],
                datasets: [{
                    label: 'Search Count',
                    data: [145, 128, 115, 98, 87, 76],
                    backgroundColor: [
                        '#1a3a52',
                        '#2c5282',
                        '#d4a574',
                        '#1a3a52',
                        '#2c5282',
                        '#d4a574'
                    ],
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    }
    
    console.log('Charts initialized');
}

/* =========== UTILITY FUNCTIONS =========== */

/**
 * Log application event for debugging
 * @param {string} event - Event description
 */
function logEvent(event) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${event}`);
}

/**
 * Format date to readable format
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
