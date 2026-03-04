// =====================================
// BIÑAN CITY HUB — AUTH PAGE SCRIPT
// =====================================

/* ===== CHECK URL FOR #SIGNUP ===== */
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash === '#signup') {
        switchTab('signup');
    }
});

/* ===== TAB SWITCHING ===== */
function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginTabBtn = document.getElementById('loginTabBtn');
    const signupTabBtn = document.getElementById('signupTabBtn');

    if (tab === 'login') {
        loginForm.classList.remove('d-none');
        signupForm.classList.add('d-none');
        loginTabBtn.classList.add('active');
        signupTabBtn.classList.remove('active');
        // Update URL hash
        history.replaceState(null, null, '#login');
    } else {
        loginForm.classList.add('d-none');
        signupForm.classList.remove('d-none');
        loginTabBtn.classList.remove('active');
        signupTabBtn.classList.add('active');
        history.replaceState(null, null, '#signup');
    }
}

/* ===== TOGGLE PASSWORD VISIBILITY ===== */
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

/* ===== PASSWORD STRENGTH ===== */
const signupPasswordInput = document.getElementById('signupPassword');
if (signupPasswordInput) {
    signupPasswordInput.addEventListener('input', function () {
        checkPasswordStrength(this.value);
    });
}

function checkPasswordStrength(password) {
    const bars = ['sb1', 'sb2', 'sb3', 'sb4'];
    const label = document.getElementById('strengthLabel');

    // Reset
    bars.forEach(id => {
        const bar = document.getElementById(id);
        if (bar) {
            bar.className = 'strength-bar';
        }
    });

    if (!password) {
        if (label) label.textContent = 'Enter a password';
        return;
    }

    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = ['', 'active-weak', 'active-fair', 'active-good', 'active-strong'];
    const labelTexts = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const labelColors = ['', '#e74c3c', '#f39c12', '#3498db', '#27ae60'];

    for (let i = 0; i < score; i++) {
        const bar = document.getElementById(bars[i]);
        if (bar) bar.classList.add(levels[score]);
    }

    if (label) {
        label.textContent = labelTexts[score] || '';
        label.style.color = labelColors[score] || 'rgba(255,255,255,0.4)';
    }
}

/* ===== FIELD VALIDATION HELPERS ===== */
function showFieldError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;

    // Also mark input red
    const inputId = id.replace('Error', '');
    const input = document.getElementById(inputId);
    if (input) input.classList.add('error');
}

function clearFieldError(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';

    const inputId = id.replace('Error', '');
    const input = document.getElementById(inputId);
    if (input) input.classList.remove('error');
}

function clearAllErrors(ids) {
    ids.forEach(id => clearFieldError(id + 'Error'));
}

/* ===== LOGIN FORM ===== */
const loginFormEl = document.getElementById('loginFormEl');
if (loginFormEl) {
    loginFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        handleLogin();
    });
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    clearAllErrors(['loginEmail', 'loginPassword']);
    let valid = true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError('loginEmailError', 'Please enter a valid email address.');
        valid = false;
    }

    if (!password || password.length < 6) {
        showFieldError('loginPasswordError', 'Password must be at least 6 characters.');
        valid = false;
    }

    if (!valid) return;

    // Simulate loading
    const btn = document.getElementById('loginSubmitBtn');
    btn.querySelector('.btn-text').classList.add('d-none');
    btn.querySelector('.btn-loading').classList.remove('d-none');
    btn.disabled = true;

    setTimeout(() => {
        btn.querySelector('.btn-text').classList.remove('d-none');
        btn.querySelector('.btn-loading').classList.add('d-none');
        btn.disabled = false;

        if (email === 'admin@binan.gov.ph') {
            // Admin: redirect to admin dashboard
            showToast('Admin login successful! Redirecting to admin dashboard...');
            setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
        } else {
            // Regular user: save session to localStorage, go back to index.html
            const namePart = email.split('@')[0];
            const firstName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            const userObj = {
                firstName: firstName,
                lastName: '',
                email: email,
                barangay: 'Barangay Poblacion',
                loginAt: new Date().toISOString()
            };
            localStorage.setItem('bch_user', JSON.stringify(userObj));
            showToast('Login successful! Welcome back to Biñan City Hub.');
            setTimeout(() => { window.location.href = 'index.html#myportal'; }, 1500);
        }
    }, 1400);
}

/* ===== SIGNUP FORM ===== */
const signupFormEl = document.getElementById('signupFormEl');
if (signupFormEl) {
    signupFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        handleSignup();
    });
}

function handleSignup() {
    const firstName = document.getElementById('signupFirstName').value.trim();
    const lastName = document.getElementById('signupLastName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const barangay = document.getElementById('signupBarangay').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;

    clearAllErrors(['signupFirstName', 'signupLastName', 'signupEmail', 'signupPhone', 'signupBarangay', 'signupPassword', 'signupConfirmPassword', 'agreeTerms']);
    let valid = true;

    if (!firstName || firstName.length < 2) {
        showFieldError('signupFirstNameError', 'Enter your first name.');
        valid = false;
    }
    if (!lastName || lastName.length < 2) {
        showFieldError('signupLastNameError', 'Enter your last name.');
        valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError('signupEmailError', 'Enter a valid email address.');
        valid = false;
    }
    if (!phone || !/^[0-9]{10,11}$/.test(phone)) {
        showFieldError('signupPhoneError', 'Enter a valid phone number (10–11 digits).');
        valid = false;
    }
    if (!barangay) {
        showFieldError('signupBarangayError', 'Please select your barangay.');
        valid = false;
    }
    if (!password || password.length < 8) {
        showFieldError('signupPasswordError', 'Password must be at least 8 characters.');
        valid = false;
    }
    if (password !== confirmPassword) {
        showFieldError('signupConfirmPasswordError', 'Passwords do not match.');
        valid = false;
    }
    if (!agreeTerms) {
        showFieldError('agreeTermsError', 'You must agree to the Terms & Conditions.');
        valid = false;
    }

    if (!valid) return;

    // Simulate loading
    const btn = document.getElementById('signupSubmitBtn');
    btn.querySelector('.btn-text').classList.add('d-none');
    btn.querySelector('.btn-loading').classList.remove('d-none');
    btn.disabled = true;

    setTimeout(() => {
        btn.querySelector('.btn-text').classList.remove('d-none');
        btn.querySelector('.btn-loading').classList.add('d-none');
        btn.disabled = false;

        // Save new user session then redirect to homepage My Portal
        const userObj = {
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            barangay: barangay,
            loginAt: new Date().toISOString()
        };
        localStorage.setItem('bch_user', JSON.stringify(userObj));
        showToast('Account created! Welcome to Biñan City Hub.');
        setTimeout(() => { window.location.href = 'index.html#myportal'; }, 1500);
    }, 1600);
}

/* ===== TOAST NOTIFICATION ===== */
function showToast(message) {
    const toast = document.getElementById('authToast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    toast.classList.remove('d-none');

    setTimeout(() => {
        toast.classList.add('d-none');
    }, 4000);
}

/* ===== REAL-TIME VALIDATION ===== */
// Clear error on input
document.querySelectorAll('.auth-input').forEach(input => {
    input.addEventListener('input', function () {
        this.classList.remove('error');
        const errorEl = document.getElementById(this.id + 'Error');
        if (errorEl) errorEl.textContent = '';
    });
});

console.log('Biñan City Hub — Auth Page Initialized');
