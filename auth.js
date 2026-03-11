// =====================================
// BINAN CITY HUB - AUTH PAGE SCRIPT
// =====================================
// Purpose:
// - Handle login / signup with Supabase Auth.
// - Multi-step Forgot Password: email lookup → account card → OTP → new password.
// - Resolve role after login and route users to the correct experience.

let supabaseClient = null;

// Tracks context across the multi-step forgot-password flow.
let forgotEmail = "";   // email collected in step 1
let forgotName  = "";   // profile name shown in the account card

document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  const hash = window.location.hash;
  if (hash === "#signup") {
    switchTab("signup");
  } else if (hash === "#forgot") {
    switchTab("forgot");
  } else if (hash === "#reset") {
    // User landed here from the reset email link (Supabase redirected them with a token).
    switchTab("forgot");
    forgotGoToStep(4);
    showToast("Session verified. Set your new password below.", "success");
  }

  bindForms();
  await loadBarangayOptions();

  // Wire "Forgot password?" link inside the login form.
  document.getElementById("forgotLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchTab("forgot");
  });

  // Wire password strength meter for the reset form.
  document.getElementById("forgotNewPass")?.addEventListener("input", function () {
    checkForgotPasswordStrength(this.value);
  });
});

function bindForms() {
  const loginFormEl = document.getElementById("loginFormEl");
  if (loginFormEl) {
    loginFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleLogin();
    });
  }

  const signupFormEl = document.getElementById("signupFormEl");
  if (signupFormEl) {
    signupFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleSignup();
    });
  }

  document.querySelectorAll(".auth-input").forEach((input) => {
    input.addEventListener("input", function () {
      this.classList.remove("error");
      const errorEl = document.getElementById(this.id + "Error");
      if (errorEl) errorEl.textContent = "";
    });
  });
}

// Populates barangay signup dropdown from DB so choices stay current.
async function loadBarangayOptions() {
  if (!supabaseClient) return;

  const select = document.getElementById("signupBarangay");
  if (!select) return;

  const { data } = await supabaseClient
    .from("barangays")
    .select("name")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (!data?.length) return;

  select.innerHTML = '<option value="">Select your barangay...</option>';
  data.forEach((item) => {
    const display = item.name;
    const value = display
      .toLowerCase()
      .replace(/^barangay\s+/, "")
      .replaceAll(".", "")
      .replaceAll(" ", "-");

    select.insertAdjacentHTML("beforeend", `<option value="${value}">${display}</option>`);
  });
}

// ─────────────────────────────────────────────────────────────
// TAB / FORM SWITCHING
// ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  const loginForm  = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const forgotForm = document.getElementById("forgotForm");
  const tabs       = document.getElementById("authTabs");
  const loginTabBtn  = document.getElementById("loginTabBtn");
  const signupTabBtn = document.getElementById("signupTabBtn");

  // Hide all forms first.
  loginForm?.classList.add("d-none");
  signupForm?.classList.add("d-none");
  forgotForm?.classList.add("d-none");

  if (tab === "login") {
    loginForm?.classList.remove("d-none");
    loginTabBtn?.classList.add("active");
    signupTabBtn?.classList.remove("active");
    tabs?.classList.remove("d-none");
    history.replaceState(null, null, "#login");
  } else if (tab === "signup") {
    signupForm?.classList.remove("d-none");
    loginTabBtn?.classList.remove("active");
    signupTabBtn?.classList.add("active");
    tabs?.classList.remove("d-none");
    history.replaceState(null, null, "#signup");
  } else if (tab === "forgot") {
    // Hide the Login/SignUp tab bar while in the forgot flow.
    tabs?.classList.add("d-none");
    forgotForm?.classList.remove("d-none");
    history.replaceState(null, null, "#forgot");
  }
}

// ─────────────────────────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────────────────────────

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon  = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

// ─────────────────────────────────────────────────────────────
// PASSWORD STRENGTH METERS
// ─────────────────────────────────────────────────────────────

// Sign-up strength uses sb1-sb4 / strengthLabel.
const signupPasswordInput = document.getElementById("signupPassword");
if (signupPasswordInput) {
  signupPasswordInput.addEventListener("input", function () {
    checkPasswordStrength(this.value);
  });
}

function checkPasswordStrength(password) {
  updateStrengthBars(password, ["sb1", "sb2", "sb3", "sb4"], "strengthLabel");
}

// Reset-password strength uses fsb1-fsb4 / forgotStrengthLabel.
function checkForgotPasswordStrength(password) {
  updateStrengthBars(password, ["fsb1", "fsb2", "fsb3", "fsb4"], "forgotStrengthLabel");
}

// Shared strength-bar updater so both forms have identical behaviour.
function updateStrengthBars(password, barIds, labelId) {
  const label = document.getElementById(labelId);
  barIds.forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.className = "strength-bar";
  });

  if (!password) {
    if (label) { label.textContent = "Enter a password"; label.style.color = ""; }
    return;
  }

  let score = 0;
  if (password.length >= 8)          score += 1;
  if (/[A-Z]/.test(password))        score += 1;
  if (/[0-9]/.test(password))        score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const levels      = ["", "active-weak", "active-fair", "active-good", "active-strong"];
  const labelTexts  = ["", "Weak", "Fair", "Good", "Strong"];
  const labelColors = ["", "#e74c3c", "#f39c12", "#3498db", "#27ae60"];

  for (let i = 0; i < score; i += 1) {
    const bar = document.getElementById(barIds[i]);
    if (bar) bar.classList.add(levels[score]);
  }

  if (label) {
    label.textContent = labelTexts[score] || "";
    label.style.color = labelColors[score] || "rgba(255,255,255,0.4)";
  }
}

// ─────────────────────────────────────────────────────────────
// FIELD ERROR HELPERS
// ─────────────────────────────────────────────────────────────

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
  const inputId = id.replace("Error", "");
  document.getElementById(inputId)?.classList.add("error");
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = "";
  const inputId = id.replace("Error", "");
  document.getElementById(inputId)?.classList.remove("error");
}

function clearAllErrors(ids) {
  ids.forEach((id) => clearFieldError(id + "Error"));
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

async function handleLogin() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  clearAllErrors(["loginEmail", "loginPassword"]);

  let valid = true;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError("loginEmailError", "Please enter a valid email address.");
    valid = false;
  }
  if (!password || password.length < 6) {
    showFieldError("loginPasswordError", "Password must be at least 6 characters.");
    valid = false;
  }
  if (!valid) return;

  if (!supabaseClient) {
    showToast("Supabase is not configured. Update supabase-config.js first.", "error");
    return;
  }

  setButtonLoading("loginSubmitBtn", true);
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setButtonLoading("loginSubmitBtn", false);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const { data: userData } = await supabaseClient.auth.getUser();
  const user = userData?.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "resident";

  if (role === "super_admin" || role === "barangay_admin") {
    showToast("Login successful. Redirecting to admin dashboard...", "success");
    setTimeout(() => { window.location.href = "admin.html"; }, 900);
    return;
  }

  showToast("Login successful. Redirecting to your portal...", "success");
  setTimeout(() => { window.location.href = "index.html#myportal"; }, 900);
}

// ─────────────────────────────────────────────────────────────
// SIGN UP
// ─────────────────────────────────────────────────────────────

async function handleSignup() {
  const firstName       = document.getElementById("signupFirstName").value.trim();
  const lastName        = document.getElementById("signupLastName").value.trim();
  const email           = document.getElementById("signupEmail").value.trim();
  const phone           = document.getElementById("signupPhone").value.trim();
  const barangayRaw     = document.getElementById("signupBarangay").value;
  const password        = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("signupConfirmPassword").value;
  const agreeTerms      = document.getElementById("agreeTerms").checked;

  clearAllErrors([
    "signupFirstName", "signupLastName", "signupEmail", "signupPhone",
    "signupBarangay", "signupPassword", "signupConfirmPassword", "agreeTerms"
  ]);

  let valid = true;
  if (!firstName || firstName.length < 2)
    { showFieldError("signupFirstNameError", "Enter your first name."); valid = false; }
  if (!lastName  || lastName.length  < 2)
    { showFieldError("signupLastNameError",  "Enter your last name."); valid = false; }
  if (!email     || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    { showFieldError("signupEmailError",    "Enter a valid email address."); valid = false; }
  if (!phone     || !/^[0-9]{10,11}$/.test(phone))
    { showFieldError("signupPhoneError",    "Enter a valid phone number (10-11 digits)."); valid = false; }
  if (!barangayRaw)
    { showFieldError("signupBarangayError", "Please select your barangay."); valid = false; }
  if (!password  || password.length < 8)
    { showFieldError("signupPasswordError", "Password must be at least 8 characters."); valid = false; }
  if (password   !== confirmPassword)
    { showFieldError("signupConfirmPasswordError", "Passwords do not match."); valid = false; }
  if (!agreeTerms)
    { showFieldError("agreeTermsError", "You must agree to the Terms & Conditions."); valid = false; }
  if (!valid) return;

  if (!supabaseClient) {
    showToast("Supabase is not configured. Update supabase-config.js first.", "error");
    return;
  }

  const barangay = toBarangayDisplay(barangayRaw);
  const fullName = `${firstName} ${lastName}`.trim();

  setButtonLoading("signupSubmitBtn", true);

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, barangay, phone } }
  });

  if (!error && data?.user) {
    await supabaseClient.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      email,
      barangay,
      role: "resident",
      phone
    });
  }

  setButtonLoading("signupSubmitBtn", false);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("Account created. Check your email if confirmation is enabled, then login.", "success");
  setTimeout(() => { switchTab("login"); }, 1000);
}

// ─────────────────────────────────────────────────────────────
// FORGOT PASSWORD – STEP NAVIGATION
// ─────────────────────────────────────────────────────────────

function forgotGoToStep(step) {
  [1, 2, 3, 4].forEach((n) => {
    document.getElementById(`forgotStep${n}`)?.classList.toggle("d-none", n !== step);
  });
}

function forgotGoBack(step) {
  forgotGoToStep(step);
  if (step === 1) {
    forgotEmail = "";
    forgotName  = "";
    const emailInput = document.getElementById("forgotEmail");
    if (emailInput) emailInput.value = "";
    clearFieldError("forgotEmailError");
  }
}

// STEP 1 – Look up the profile by email; shows account card if found.
async function handleForgotStep1() {
  const email = (document.getElementById("forgotEmail")?.value || "").trim().toLowerCase();
  clearFieldError("forgotEmailError");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError("forgotEmailError", "Please enter a valid email address.");
    return;
  }

  if (!supabaseClient) {
    showToast("Supabase is not configured.", "error");
    return;
  }

  setButtonLoading("forgotStep1Btn", true);

  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("full_name, email")
    .ilike("email", email)
    .limit(1);

  setButtonLoading("forgotStep1Btn", false);

  if (!profiles || profiles.length === 0) {
    showFieldError("forgotEmailError", "No account found with this email address.");
    return;
  }

  const profile = profiles[0];
  forgotEmail = email;
  forgotName  = profile.full_name || "Resident";

  const nameEl  = document.getElementById("forgotAccountName");
  const emailEl = document.getElementById("forgotAccountEmail");
  if (nameEl)  nameEl.textContent  = forgotName;
  if (emailEl) emailEl.textContent = forgotEmail;

  forgotGoToStep(2);
}

// STEP 2 – Send OTP / reset email via Supabase.
async function handleForgotSendCode() {
  if (!forgotEmail) { forgotGoToStep(1); return; }

  setButtonLoading("forgotStep2Btn", true);

  // Using undefined redirectTo forces Supabase to send an OTP when
  // "Email OTP" is enabled in Authentication → Email Templates.
  const { error } = await supabaseClient.auth.resetPasswordForEmail(forgotEmail, {
    redirectTo: undefined
  });

  setButtonLoading("forgotStep2Btn", false);

  if (error) {
    showToast(error.message || "Failed to send code. Try again.", "error");
    return;
  }

  const sub = document.getElementById("forgotStep3Sub");
  if (sub) sub.textContent = `We sent a reset code to ${forgotEmail}. Enter it below.`;

  const otpInput = document.getElementById("forgotOtp");
  if (otpInput) otpInput.value = "";
  clearFieldError("forgotOtpError");

  forgotGoToStep(3);
  showToast("Code sent! Check your email inbox.", "success");
}

// STEP 3 – Verify the 6-digit OTP.
async function handleForgotVerifyOtp() {
  const token = (document.getElementById("forgotOtp")?.value || "").trim().replace(/\s/g, "");
  clearFieldError("forgotOtpError");

  if (!token || token.length < 6 || token.length > 8 || !/^[a-zA-Z0-9]{6,8}$/.test(token)) {
    showFieldError("forgotOtpError", "Enter the reset code from your email (6–8 characters).");
    return;
  }

  setButtonLoading("forgotStep3Btn", true);

  // verifyOtp also sets the recovery session so updateUser() works in step 4.
  const { error } = await supabaseClient.auth.verifyOtp({
    email: forgotEmail,
    token,
    type: "recovery"
  });

  setButtonLoading("forgotStep3Btn", false);

  if (error) {
    showFieldError("forgotOtpError", error.message || "Invalid or expired code. Request a new one.");
    return;
  }

  const np = document.getElementById("forgotNewPass");
  const cp = document.getElementById("forgotConfirmPass");
  if (np) np.value = "";
  if (cp) cp.value = "";
  checkForgotPasswordStrength("");

  forgotGoToStep(4);
}

// STEP 4 – Update the password.
async function handleForgotSetPassword() {
  const newPass     = (document.getElementById("forgotNewPass")?.value     || "");
  const confirmPass = (document.getElementById("forgotConfirmPass")?.value || "");

  clearFieldError("forgotNewPassError");
  clearFieldError("forgotConfirmPassError");

  if (!newPass || newPass.length < 8) {
    showFieldError("forgotNewPassError", "Password must be at least 8 characters.");
    return;
  }
  if (newPass !== confirmPass) {
    showFieldError("forgotConfirmPassError", "Passwords do not match.");
    return;
  }

  setButtonLoading("forgotStep4Btn", true);
  const { error } = await supabaseClient.auth.updateUser({ password: newPass });
  setButtonLoading("forgotStep4Btn", false);

  if (error) {
    showFieldError("forgotNewPassError", error.message || "Failed to update password.");
    return;
  }

  showToast("Password updated successfully! Redirecting to login...", "success");
  setTimeout(() => {
    forgotEmail = "";
    forgotName  = "";
    forgotGoToStep(1);
    switchTab("login");
  }, 1800);
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

function toBarangayDisplay(raw) {
  return String(raw || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("Sto Tomas", "Santo Tomas")
    .replace(/^/, "Barangay ");
}

function setButtonLoading(buttonId, isLoading) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  const textEl    = btn.querySelector(".btn-text");
  const loadingEl = btn.querySelector(".btn-loading");

  textEl?.classList.toggle("d-none", isLoading);
  loadingEl?.classList.toggle("d-none", !isLoading);
  btn.disabled = isLoading;
}

// Unified toast with explicit success / error modes.
function showToast(message, type = "success") {
  const toast     = document.getElementById("authToast");
  const toastMsg  = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("authToastIcon");
  if (!toast || !toastMsg || !toastIcon) return;

  toastMsg.textContent = message;

  toast.classList.remove("success", "error");
  if (type === "error") {
    toast.classList.add("error");
    toastIcon.className = "fas fa-circle-exclamation";
  } else {
    toast.classList.add("success");
    toastIcon.className = "fas fa-check-circle";
  }

  toast.classList.remove("d-none");
  setTimeout(() => toast.classList.add("d-none"), 4500);
}
