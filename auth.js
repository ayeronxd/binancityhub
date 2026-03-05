// =====================================
// BINAN CITY HUB - AUTH PAGE SCRIPT
// =====================================
// Purpose:
// - Handle login/signup with Supabase Auth.
// - Resolve role after login and route users to the correct experience.
// Why this design:
// - Authentication and authorization are separated:
//   Auth identity from Supabase Auth, role from `profiles` table.

let supabaseClient = null;

// Initialize client + form handlers as soon as auth page is ready.
document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  if (window.location.hash === "#signup") {
    switchTab("signup");
  }

  bindForms();
  await loadBarangayOptions();
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

function switchTab(tab) {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const loginTabBtn = document.getElementById("loginTabBtn");
  const signupTabBtn = document.getElementById("signupTabBtn");

  if (tab === "login") {
    loginForm.classList.remove("d-none");
    signupForm.classList.add("d-none");
    loginTabBtn.classList.add("active");
    signupTabBtn.classList.remove("active");
    history.replaceState(null, null, "#login");
  } else {
    loginForm.classList.add("d-none");
    signupForm.classList.remove("d-none");
    loginTabBtn.classList.remove("active");
    signupTabBtn.classList.add("active");
    history.replaceState(null, null, "#signup");
  }
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

const signupPasswordInput = document.getElementById("signupPassword");
if (signupPasswordInput) {
  signupPasswordInput.addEventListener("input", function () {
    checkPasswordStrength(this.value);
  });
}

function checkPasswordStrength(password) {
  const bars = ["sb1", "sb2", "sb3", "sb4"];
  const label = document.getElementById("strengthLabel");

  bars.forEach((id) => {
    const bar = document.getElementById(id);
    if (bar) bar.className = "strength-bar";
  });

  if (!password) {
    if (label) label.textContent = "Enter a password";
    return;
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const levels = ["", "active-weak", "active-fair", "active-good", "active-strong"];
  const labelTexts = ["", "Weak", "Fair", "Good", "Strong"];
  const labelColors = ["", "#e74c3c", "#f39c12", "#3498db", "#27ae60"];

  for (let i = 0; i < score; i += 1) {
    const bar = document.getElementById(bars[i]);
    if (bar) bar.classList.add(levels[score]);
  }

  if (label) {
    label.textContent = labelTexts[score] || "";
    label.style.color = labelColors[score] || "rgba(255,255,255,0.4)";
  }
}

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

// Validates credentials, signs in via Supabase, then redirects by role.
async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
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

// Creates resident account and persists profile attributes used by portal features.
async function handleSignup() {
  const firstName = document.getElementById("signupFirstName").value.trim();
  const lastName = document.getElementById("signupLastName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const phone = document.getElementById("signupPhone").value.trim();
  const barangayRaw = document.getElementById("signupBarangay").value;
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("signupConfirmPassword").value;
  const agreeTerms = document.getElementById("agreeTerms").checked;

  clearAllErrors(["signupFirstName", "signupLastName", "signupEmail", "signupPhone", "signupBarangay", "signupPassword", "signupConfirmPassword", "agreeTerms"]);

  let valid = true;
  if (!firstName || firstName.length < 2) {
    showFieldError("signupFirstNameError", "Enter your first name.");
    valid = false;
  }
  if (!lastName || lastName.length < 2) {
    showFieldError("signupLastNameError", "Enter your last name.");
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError("signupEmailError", "Enter a valid email address.");
    valid = false;
  }
  if (!phone || !/^[0-9]{10,11}$/.test(phone)) {
    showFieldError("signupPhoneError", "Enter a valid phone number (10-11 digits).");
    valid = false;
  }
  if (!barangayRaw) {
    showFieldError("signupBarangayError", "Please select your barangay.");
    valid = false;
  }
  if (!password || password.length < 8) {
    showFieldError("signupPasswordError", "Password must be at least 8 characters.");
    valid = false;
  }
  if (password !== confirmPassword) {
    showFieldError("signupConfirmPasswordError", "Passwords do not match.");
    valid = false;
  }
  if (!agreeTerms) {
    showFieldError("agreeTermsError", "You must agree to the Terms & Conditions.");
    valid = false;
  }
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
    options: {
      data: {
        full_name: fullName,
        barangay,
        phone
      }
    }
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

  const textEl = btn.querySelector(".btn-text");
  const loadingEl = btn.querySelector(".btn-loading");

  textEl?.classList.toggle("d-none", isLoading);
  loadingEl?.classList.toggle("d-none", !isLoading);
  btn.disabled = isLoading;
}

// Unified toast with explicit success/error modes to avoid misleading feedback.
function showToast(message, type = "success") {
  const toast = document.getElementById("authToast");
  const toastMsg = document.getElementById("toastMessage");
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
  setTimeout(() => toast.classList.add("d-none"), 4000);
}



