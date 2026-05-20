// =====================================
// BARANGAY HUB - ADMIN DASHBOARD JS
// =====================================
// Purpose:
// - Provide operational tools for super_admin and barangay_admin roles.
// - Render management data directly from Supabase tables/views.
// Why this design:
// - Role checks happen before panel load.
// - Barangay admins are automatically scope-filtered to assigned barangay.

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let currentRole = "resident";
let currentBarangayName = "";

let barangays = [];
let usersData = [];
let docRequests = [];
let announcements = [];
let issueReports = [];
let workersRegistry = [];
let portalSettings = null;
let docTemplates = [];
let adminInvites = [];
let fillDocContext = { reqId: null, barangay: "", docType: "", residentName: "", ref: "", purpose: "", phone: "", templateUrl: null, templateFileName: "" };

// Admin bootstrap: secure gate -> role-aware UI -> scoped data load -> panel render.
document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  setHeaderDate();
  initSidebarNav();
  initMobileSidebar();
  initNotificationButton();
  initFormHandlers();
  initAdminInviteHandlers();
  const allowed = await enforceAdminAccess();
  if (!allowed) return;

  renderAdminIdentity();
  applyRoleScopedUI();

  await loadAdminData();
  renderSettingsFormValues();
  renderAllPanels();
  initCharts();

  console.log("Barangay Hub - Admin Dashboard Initialized");
});

// Rejects non-admin users early and resolves role/barangay from auth metadata.
async function enforceAdminAccess() {
  if (!supabaseClient) {
    showAdminToast("Supabase is not configured. Update supabase-config.js.");
    return false;
  }

  // Required by design: read the authenticated user from Supabase Auth.
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  currentUser = user;

  // Metadata-first role resolution for unified dashboard behavior.
  const metaRole = normalizeRole(user.user_metadata?.role);
  const metaBarangay =
    user.user_metadata?.barangay_name ||
    user.user_metadata?.barangay ||
    user.app_metadata?.barangay_name ||
    user.app_metadata?.barangay ||
    "";

  // Profile fallback keeps compatibility with existing schema/RLS role storage.
  const { data: profile, error: errProf } = await supabaseClient
    .from("profiles")
    .select("id,role,barangay,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  if (errProf) {
    alert("Admin DB Error: " + errProf.message);
  }

  currentProfile = profile || null;
  // Prioritize profile table data since it is easily updated via Supabase Table Editor
  currentRole = normalizeRole(profile?.role || metaRole);
  currentBarangayName = String(profile?.barangay || metaBarangay || "").trim();

  if (currentRole !== "super_admin" && currentRole !== "barangay_admin") {
    window.location.href = "index.html";
    return false;
  }

  if (currentRole === "barangay_admin" && !currentBarangayName) {
    showAdminToast("Barangay Admin account is missing barangay metadata.");
    window.location.href = "index.html";
    return false;
  }

  return true;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function isSuperAdmin() {
  return currentRole === "super_admin";
}

function isBarangayAdmin() {
  return currentRole === "barangay_admin";
}

function getScopedBarangay() {
  return currentBarangayName || currentProfile?.barangay || "";
}

function looksLikeMissingColumn(error, columnName) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes(String(columnName || "").toLowerCase());
}

// Role-aware UI toggles keep one dashboard shell while switching operator context.
function applyRoleScopedUI() {
  const roleLabel = document.getElementById("adminRoleLabel");
  const roleContext = document.getElementById("adminRoleContext");
  const usersHeading = document.getElementById("usersPanelHeading");
  const docsHeading = document.getElementById("docsPanelHeading");
  const annHeading = document.getElementById("annPanelHeading");
  const verifyHint = document.getElementById("residentVerifyHint");

  const barangayNavItem = document.querySelector('.admin-nav-link[data-panel="barangays"]')?.closest("li");
  const settingsNavItem = document.getElementById("navSettingsItem");
  const settingsPanel = document.getElementById("panel-settings");
  const settingsCityCard = document.getElementById("settingsCityCard");
  const settingsPortalCard = document.getElementById("settingsPortalCard");

  const docBrgyFilter = document.getElementById("docBarangayFilter");
  const issueBrgyFilter = document.getElementById("issueBarangayFilter");

  if (isSuperAdmin()) {
    setText("adminPanelSub", "City-Wide Controller · All 24 barangays");
    setText("roleModeTitle", "City-Wide Controller");
    setText("roleModeDesc", "Monitoring all barangays. Document processing is handled by each Barangay Admin.");
    if (roleLabel) roleLabel.textContent = "Super Admin";
    if (roleContext) roleContext.textContent = "City-Wide";
    if (usersHeading) usersHeading.textContent = "All System Users";
    if (docsHeading) docsHeading.textContent = "City-Wide Document Monitor (Read-Only)";
    if (annHeading) annHeading.textContent = "City-Wide News Hub";
    if (verifyHint) verifyHint.textContent = "Verification controls are available in Barangay Admin scope.";

    if (barangayNavItem) barangayNavItem.style.display = "";
    if (settingsNavItem) settingsNavItem.style.display = "";
    if (settingsPanel) settingsPanel.style.display = "";
    if (settingsCityCard) settingsCityCard.style.display = "";
    if (settingsPortalCard) settingsPortalCard.style.display = "";
    // Show Admin Invites nav (super admin only)
    const adminInvitesNavItem = document.getElementById("navAdminInvitesItem");
    if (adminInvitesNavItem) adminInvitesNavItem.style.display = "";

    if (docBrgyFilter) docBrgyFilter.style.display = "";
    if (issueBrgyFilter) issueBrgyFilter.style.display = "";
    return;
  }

  const scopedBarangay = getScopedBarangay();
  setText("adminPanelSub", `Local Action Center · ${scopedBarangay}`);
  setText("roleModeTitle", "Local Action Center");
  setText("roleModeDesc", `Operations scoped to ${scopedBarangay}.`);
  if (roleLabel) roleLabel.textContent = "Barangay Admin";
  if (roleContext) roleContext.textContent = scopedBarangay;
  if (usersHeading) usersHeading.textContent = `Resident Verification · ${scopedBarangay}`;
  if (docsHeading) docsHeading.textContent = `Document Processing Queue · ${scopedBarangay}`;
  if (annHeading) annHeading.textContent = `Local News Hub · ${scopedBarangay}`;
  if (verifyHint) verifyHint.textContent = "Verify resident accounts for this barangay.";

  // Barangay admins cannot access city-wide controllers or system settings.
  if (barangayNavItem) barangayNavItem.style.display = "none";
  if (settingsNavItem) settingsNavItem.style.display = "none";
  if (settingsPanel) settingsPanel.style.display = "none";

  // Keep account details editable while hiding city-only settings cards.
  if (settingsCityCard) settingsCityCard.style.display = "none";
  if (settingsPortalCard) settingsPortalCard.style.display = "none";

  if (docBrgyFilter) docBrgyFilter.style.display = "none";
  if (issueBrgyFilter) issueBrgyFilter.style.display = "none";
}
// Loads all admin datasets concurrently for responsive dashboard startup.
async function loadAdminData() {
  await Promise.all([
    loadBarangays(),
    loadResidents(),
    loadDocRequests(),
    loadAnnouncements(),
    loadIssueReports(),
    loadWorkers(),
    loadPortalSettings(),
    loadDocTemplates(),
    loadAdminInvites(),
    loadServiceRequests()
  ]);
}

// Optional site configuration record; if table does not exist yet we keep form defaults.
async function loadPortalSettings() {
  const { data, error } = await supabaseClient
    .from("portal_settings")
    .select("city_name,province,contact_email,contact_phone,primary_barangay,launch_date,project_status")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    const missingTable = msg.includes("portal_settings") && msg.includes("does not exist");
    if (!missingTable) showAdminToast(error.message);
    portalSettings = null;
    return;
  }

  portalSettings = data || null;
}

async function loadBarangays() {
  const { data } = await supabaseClient
    .from("v_barangay_analytics")
    .select("id,name,captain,status,residents,docs,workers,notes,created_at")
    .order("name", { ascending: true });

  barangays = (data || []).map((b) => ({
    id: b.id,
    name: b.name,
    captain: b.captain || "-",
    users: Number(b.residents || 0),
    status: b.status || "pending",
    added: b.created_at ? formatDate(new Date(b.created_at)) : "-",
    notes: b.notes || ""
  }));

  if (isBarangayAdmin()) {
    const scoped = getScopedBarangay().toLowerCase();
    barangays = barangays.filter((b) => String(b.name || "").toLowerCase() === scoped);
  }
}

// Pulls system users (super_admin) or scoped residents (barangay_admin).
async function loadResidents() {
  const scopedBarangay = getScopedBarangay();

  const buildProfilesQuery = (barangayColumn, includeVerified = true) => {
    let query = supabaseClient
      .from("profiles")
      .select(includeVerified
        ? "id,full_name,email,phone,barangay,created_at,role,is_verified"
        : "id,full_name,email,phone,barangay,created_at,role")
      .order("created_at", { ascending: false });

    if (isBarangayAdmin()) {
      query = query.eq("role", "resident");
      if (barangayColumn) query = query.eq(barangayColumn, scopedBarangay);
    }

    return query;
  };

  // Primary implementation requested: barangay_name scope for barangay admin.
  let { data, error } = await buildProfilesQuery(isBarangayAdmin() ? "barangay_name" : null, true);

  // Schema compatibility fallback: older schema may still use `barangay` and/or omit `is_verified`.
  if (error && isBarangayAdmin() && looksLikeMissingColumn(error, "barangay_name")) {
    ({ data, error } = await buildProfilesQuery("barangay", true));
  }
  if (error && looksLikeMissingColumn(error, "is_verified")) {
    ({ data, error } = await buildProfilesQuery(isBarangayAdmin() ? "barangay_name" : null, false));
    if (error && isBarangayAdmin() && looksLikeMissingColumn(error, "barangay_name")) {
      ({ data, error } = await buildProfilesQuery("barangay", false));
    }
  }
  if (error) {
    showAdminToast(error.message);
    usersData = [];
    return;
  }

  usersData = (data || []).map((u) => {
    const parsed = parseName(u.full_name);
    const resolvedBarangay = u.barangay || "-";
    const isVerified = Boolean(u.is_verified);

    return {
      id: u.id,
      first: parsed.first,
      last: parsed.last,
      email: u.email,
      phone: u.phone || "-",
      barangay: resolvedBarangay,
      registered: formatDate(new Date(u.created_at)),
      role: u.role,
      isVerified,
      status: isVerified ? "Verified" : "Pending Verification"
    };
  });
}

// Loads document requests and resolves resident names for table readability.
async function loadDocRequests() {
  const scopedBarangay = getScopedBarangay();

  const buildDocQuery = (barangayColumn) => {
    let query = supabaseClient
      .from("document_requests")
      .select("id,resident_id,request_type,barangay,purpose,address,photo_url,created_at,status,processed_at,notified_at")
      .order("created_at", { ascending: false });

    if (isBarangayAdmin() && barangayColumn) {
      query = query.eq(barangayColumn, scopedBarangay);
    }

    return query;
  };

  let { data, error } = await buildDocQuery(isBarangayAdmin() ? "barangay_name" : null);
  if (error && isBarangayAdmin() && looksLikeMissingColumn(error, "barangay_name")) {
    ({ data, error } = await buildDocQuery("barangay"));
  }
  if (error) {
    showAdminToast(error.message);
    docRequests = [];
    return;
  }

  const residentIds = [...new Set((data || []).map((r) => r.resident_id).filter(Boolean))];
  const { data: profiles } = residentIds.length
    ? await supabaseClient.from("profiles").select("id,full_name,email").in("id", residentIds)
    : { data: [] };

  const nameMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));
  const emailMap = new Map((profiles || []).map((p) => [p.id, p.email]));

  docRequests = (data || []).map((r) => ({
    id: r.id,
    ref: String(r.id).slice(0, 8).toUpperCase(),
    residentId: r.resident_id,
    name: nameMap.get(r.resident_id) || "Resident",
    residentEmail: emailMap.get(r.resident_id) || "",
    type: r.request_type,
    barangay: r.barangay || "-",
    address: r.address || "",
    purpose: r.purpose || "",
    photo_url: r.photo_url || null,
    date: formatDate(new Date(r.created_at)),
    status: mapDocStatus(r.status),
    processedAt: r.processed_at || null,
    notifiedAt:  r.notified_at  || null
  }));
  populateDocBarangayFilter();
  populateDocTypeFilter();
}

// Super admin sees all; barangay admin sees city-wide + scoped local announcements.
async function loadAnnouncements() {
  let query = supabaseClient
    .from("announcements")
    .select("id,title,category,barangay_scope,content,published_at")
    .order("published_at", { ascending: false })
    .limit(100);

  if (isBarangayAdmin()) {
    const scopedBarangay = getScopedBarangay();
    query = query.or(`barangay_scope.eq.City-Wide,barangay_scope.eq.${scopedBarangay}`);
  }

  const { data, error } = await query;
  if (error) {
    showAdminToast(error.message);
    announcements = [];
    return;
  }

  announcements = (data || []).map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category || "General",
    barangay: a.barangay_scope || "City-Wide",
    content: a.content,
    date: formatDate(new Date(a.published_at))
  }));
}

async function loadIssueReports() {
  const scopedBarangay = getScopedBarangay();

  const buildReportsQuery = (barangayColumn) => {
    let query = supabaseClient
      .from("issue_reports")
      .select("id,category,location,description,status,created_at,resident_id,barangay,photo_url,updated_at,priority")
      .order("created_at", { ascending: false });

    if (isBarangayAdmin() && barangayColumn) {
      query = query.eq(barangayColumn, scopedBarangay);
    }

    return query;
  };

  let { data, error } = await buildReportsQuery(isBarangayAdmin() ? "barangay_name" : null);
  if (error && isBarangayAdmin() && looksLikeMissingColumn(error, "barangay_name")) {
    ({ data, error } = await buildReportsQuery("barangay"));
  }
  if (error) {
    showAdminToast(error.message);
    issueReports = [];
    return;
  }

  const residentIds = [...new Set((data || []).map((r) => r.resident_id).filter(Boolean))];
  const { data: profiles } = residentIds.length
    ? await supabaseClient.from("profiles").select("id,full_name").in("id", residentIds)
    : { data: [] };

  const nameMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));

  issueReports = (data || []).map((r) => ({
    id: r.id,
    category: r.category,
    location: r.location,
    description: r.description,
    reporter: nameMap.get(r.resident_id) || "Resident",
    barangay: r.barangay,
    date: formatDate(new Date(r.created_at)),
    status: mapReportStatus(r.status),
    photoUrl: r.photo_url || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    priority: r.priority || "medium"
  }));

  const priorityWeight = { high: 3, medium: 2, low: 1 };
  issueReports.sort((a, b) => {
    const isCompletedA = a.status === "Completed" ? 1 : 0;
    const isCompletedB = b.status === "Completed" ? 1 : 0;
    if (isCompletedA !== isCompletedB) {
      return isCompletedA - isCompletedB;
    }
    const pA = priorityWeight[String(a.priority).toLowerCase()] || 2;
    const pB = priorityWeight[String(b.priority).toLowerCase()] || 2;
    if (pB !== pA) {
      return pB - pA;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  populateIssueBarangayFilter();
}

function deprecatedFormatDuration(startISO, endISO) {
  try {
    if (!startISO || !endISO) return "—";
    const start = new Date(startISO);
    const end = new Date(endISO);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";
    
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return "—"; 
    
    const diffMins = Math.floor(diffMs / 1000 / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    } else {
      return `${diffMins}m`;
    }
  } catch (e) {
    return "—";
  }
}

async function loadWorkers() {
  const scopedBarangay = getScopedBarangay();

  const buildWorkersQuery = (barangayColumn) => {
    let query = supabaseClient
      .from("workers")
      .select("id,full_name,service_category,category,contact_phone,contact_email,rating_avg,is_active,barangay")
      .order("full_name", { ascending: true });

    if (isBarangayAdmin() && barangayColumn) {
      query = query.eq(barangayColumn, scopedBarangay);
    }

    return query;
  };

  let { data, error } = await buildWorkersQuery(isBarangayAdmin() ? "barangay_name" : null);
  if (error && isBarangayAdmin() && looksLikeMissingColumn(error, "barangay_name")) {
    ({ data, error } = await buildWorkersQuery("barangay"));
  }
  if (error) {
    showAdminToast(error.message);
    workersRegistry = [];
    return;
  }

  workersRegistry = (data || []).map((w) => ({
    id: w.id,
    name: w.full_name,
    specialty: w.service_category,
    barangay: w.barangay || "",
    phone: w.contact_phone || "-",
    email: w.contact_email || "",
    rating: Number(w.rating_avg || 0).toFixed(1),
    status: w.is_active ? "Active" : "Pending"
  }));
}

function renderAdminIdentity() {
  const fullName =
    currentProfile?.full_name ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    "Administrator";

  // Use auth email first to avoid stale profile.email values.
  const email = currentUser?.email || currentProfile?.email || "-";

  setText("adminSidebarName", fullName);
  setText("adminSidebarEmail", email);

  const adminNameInput = document.getElementById("settingsAdminName");
  const adminEmailInput = document.getElementById("settingsAdminEmail");
  if (adminNameInput) adminNameInput.value = fullName;
  if (adminEmailInput) adminEmailInput.value = email;

  renderSettingsFormValues();
}

// Keeps settings cards database-driven instead of static placeholder values.
function renderSettingsFormValues() {
  const cityName = document.getElementById("settingsCityName");
  const province = document.getElementById("settingsProvince");
  const contactEmail = document.getElementById("settingsContactEmail");
  const contactPhone = document.getElementById("settingsContactPhone");
  const primaryBarangay = document.getElementById("settingsPrimaryBarangay");
  const launchDate = document.getElementById("settingsLaunchDate");
  const projectStatus = document.getElementById("settingsProjectStatus");

  if (cityName) cityName.value = portalSettings?.city_name || "Biñan City";
  if (province) province.value = portalSettings?.province || "Laguna";
  if (contactEmail) contactEmail.value = portalSettings?.contact_email || "hub@binan.gov.ph";
  if (contactPhone) contactPhone.value = portalSettings?.contact_phone || "(049) 123-4567";
  if (primaryBarangay) primaryBarangay.value = portalSettings?.primary_barangay || "Barangay Poblacion";
  if (launchDate) launchDate.value = portalSettings?.launch_date || "2026-01-01";
  if (projectStatus) projectStatus.value = portalSettings?.project_status || "Active";
}

function renderAllPanels() {
  renderOverviewStats();
  renderSidebarBadges();
  renderBarangaySummary();
  renderNotifIndicator();
  renderOverviewTable();
  renderOverviewReports();
  renderBarangayTable();
  renderUsersTable();
  renderDocRequestsTable();
  renderIssueReportsTable();
  renderWorkersTable();
  renderAnnouncementsGrid();
  renderDocTemplatesPanel();
  renderInvitesTable();
  renderAnalyticsPanel();
}

// =============================================================================
// ADMIN INVITE MANAGEMENT (Super Admin Only)
// =============================================================================

/** Fetches all invites from admin_invites and refreshes the panel. */
async function loadAdminInvites() {
  if (!isSuperAdmin()) return;

  const { data, error } = await supabaseClient
    .from("admin_invites")
    .select("id, email, barangay, note, created_at, used_at")
    .order("created_at", { ascending: false });

  if (error) {
    // Gracefully handle missing table (migration not run yet)
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("admin_invites") && msg.includes("does not exist")) {
      adminInvites = [];
      renderInvitesTable();
      showAdminToast("Run supabase-admin-invites.sql first to enable this feature.");
    } else {
      showAdminToast(error.message);
    }
    return;
  }

  adminInvites = data || [];
  renderInvitesTable();
  updateInviteSummary();
  updateInviteNavBadge();
}

function updateInviteSummary() {
  const pending = adminInvites.filter(i => !i.used_at).length;
  const used    = adminInvites.filter(i =>  i.used_at).length;
  setText("invitePendingCountCard", String(pending));
  setText("inviteUsedCountCard",   String(used));
  setText("inviteTotalCountCard",  String(adminInvites.length));
}

function updateInviteNavBadge() {
  const pending = adminInvites.filter(i => !i.used_at).length;
  setText("navInvitePendingCount", String(pending));
}

function renderInvitesTable() {
  const tbody  = document.getElementById("invitesTableBody");
  if (!tbody) return;

  const filter = document.getElementById("inviteStatusFilter")?.value || "";
  let list = adminInvites;
  if (filter === "pending") list = list.filter(i => !i.used_at);
  if (filter === "used")    list = list.filter(i =>  i.used_at);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">No invites found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((inv, i) => {
    const isPending = !inv.used_at;
    const statusHtml = isPending
      ? `<span class="status-pill pending">Pending</span>`
      : `<span class="status-pill active">Used</span>`;
    const usedAt = inv.used_at
      ? formatDate(new Date(inv.used_at))
      : `<span style="color:var(--text-muted)">—</span>`;
    const deleteBtn = isPending
      ? `<button class="tbl-btn tbl-btn-delete" onclick="cancelAdminInvite('${escapeAttr(inv.id)}')" title="Cancel invite"><i class="fas fa-trash"></i></button>`
      : `<span style="color:var(--text-muted);font-size:12px">—</span>`;

    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(inv.email)}</strong></td>
      <td>${escapeHtml(inv.barangay)}</td>
      <td style="max-width:180px;white-space:normal;font-size:12px;color:var(--text-muted)">${escapeHtml(inv.note || "—")}</td>
      <td>${formatDate(new Date(inv.created_at))}</td>
      <td>${statusHtml}</td>
      <td>${usedAt}</td>
      <td>${deleteBtn}</td>
    </tr>`;
  }).join("");
}

/** Opens the create invite modal and populates barangay dropdown from loaded data. */
function openCreateInviteModal() {
  if (!isSuperAdmin()) return;

  // Clear previous values
  const form = document.getElementById("createInviteForm");
  if (form) form.reset();
  setText("inviteEmailError", "");
  setText("inviteBarangayError", "");

  // Populate barangay dropdown from already-loaded barangays
  const sel = document.getElementById("inviteBarangay");
  if (sel) {
    sel.innerHTML = `<option value="">— Select Barangay —</option>`
      + barangays.map(b => `<option value="${escapeAttr(b.name)}">${escapeHtml(b.name)}</option>`).join("");
  }

  openModal("createInviteModalOverlay");
}

/** Submits the create invite form to Supabase admin_invites. */
async function submitCreateInvite(e) {
  e.preventDefault();

  const email    = document.getElementById("inviteEmail")?.value.trim().toLowerCase();
  const barangay = document.getElementById("inviteBarangay")?.value;
  const note     = document.getElementById("inviteNote")?.value.trim();
  const btn      = document.getElementById("btnSubmitInvite");

  // Validation
  let valid = true;
  if (!email) {
    setText("inviteEmailError", "Email is required."); valid = false;
  } else { setText("inviteEmailError", ""); }

  if (!barangay) {
    setText("inviteBarangayError", "Please select a barangay."); valid = false;
  } else { setText("inviteBarangayError", ""); }

  if (!valid) return;

  // Disable submit while saving
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`; }

  const { error } = await supabaseClient
    .from("admin_invites")
    .insert({ email, barangay, note: note || null });

  if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-envelope"></i> Send Invite`; }

  if (error) {
    if (String(error.message).includes("unique") || String(error.code) === "23505") {
      setText("inviteEmailError", "An invite for this email already exists.");
    } else {
      showAdminToast(error.message);
    }
    return;
  }

  closeModal("createInviteModalOverlay");
  showAdminToast(`Invite created for ${email}`);
  await loadAdminInvites();
}

/** Soft-cancel (delete) a pending invite. */
async function cancelAdminInvite(id) {
  if (!id) return;

  // Inline confirm in the table row button — ask via toast-style confirm
  if (!window.confirm("Cancel this invite? The person will no longer be auto-promoted when they sign up.")) return;

  const { error } = await supabaseClient
    .from("admin_invites")
    .delete()
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
  } else {
    showAdminToast("Invite cancelled.");
    await loadAdminInvites();
  }
}

function renderOverviewStats() {
  const residents = usersData.filter((u) => u.role === "resident").length;
  const requests = docRequests.length;
  const workers = workersRegistry.length;
  const pendingDocs = docRequests.filter((r) => r.status === "Pending" || r.status === "Processing").length;
  const resolvedReports = issueReports.filter((r) => r.status === "Completed").length;
  const pendingReports = issueReports.filter((r) => r.status === "Pending" || r.status === "Processing").length;
  const activeWorkers = workersRegistry.filter((w) => w.status === "Active").length;

  setText("statResidents", residents.toLocaleString());
  setText("statDocRequests", requests.toLocaleString());
  setText("statWorkers", workers.toLocaleString());
  setText("statPendingReports", pendingReports.toLocaleString());

  setText("statResidentsTrend", isSuperAdmin() ? "City-wide resident count" : "Scoped resident count");
  setText("statDocTrend", `${pendingDocs} pending`);
  setText("statWorkersTrend", `${activeWorkers} active`);
  setText("statReportsTrend", `${resolvedReports} resolved`);
}

function renderSidebarBadges() {
  const pendingDocs    = docRequests.filter((r) => r.status === "Pending" || r.status === "Processing").length;
  const pendingIssues  = issueReports.filter((r) => r.status === "Pending" || r.status === "Processing").length;
  const pendingServReq = (window.serviceRequests || []).filter((r) => r.status === "pending").length;
  // Count residents that still need admin verification.
  const pendingVerifs  = usersData.filter((u) => u.role === "resident" && !u.isVerified).length;

  setText("navBarangayCount", String(barangays.length));
  setText("navDocPendingCount", String(pendingDocs));
  setText("navIssuePendingCount", String(pendingIssues));

  const srBadge = document.getElementById("navServiceRequestCount");
  if (srBadge) {
    srBadge.textContent = String(pendingServReq);
    srBadge.style.display = pendingServReq > 0 ? "" : "none";
  }

  // Show pending-verification count badge on the Users nav item.
  const verifBadge = document.getElementById("navPendingVerifCount");
  if (verifBadge) {
    verifBadge.textContent = String(pendingVerifs);
    verifBadge.style.display = pendingVerifs > 0 ? "" : "none";
  }
}

function renderBarangaySummary() {
  const active = barangays.filter((b) => b.status === "active").length;
  const pending = barangays.filter((b) => b.status !== "active").length;

  setText("activeBrgyCount", String(active));
  setText("pendingBrgyCount", String(pending));
  setText("totalBrgyCount", String(barangays.length));
}

function renderNotifIndicator() {
  const dot = document.getElementById("notifDot");
  if (!dot) return;

  const hasPending =
    docRequests.some((r) => r.status === "Pending" || r.status === "Processing") ||
    issueReports.some((r) => r.status === "Pending" || r.status === "Processing");
  dot.style.display = hasPending ? "inline-flex" : "none";
}

// Render and display the notifications modal with recent issues and pending documents
function renderNotifications() {
  const recentIssuesDiv = document.getElementById("notifRecentIssues");
  const pendingDocsDiv = document.getElementById("notifPendingDocs");
  const lastUpdatedSpan = document.getElementById("notifLastUpdated");
  
  if (!recentIssuesDiv || !pendingDocsDiv) return;

  // Get recent issue reports (last 5, sorted by date)
  const recentIssues = issueReports
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  // Get pending document requests (status = Pending or Processing)
  const pendingDocs = docRequests.filter((r) => r.status === "Pending" || r.status === "Processing");

  // Render recent issues
  if (recentIssues.length === 0) {
    recentIssuesDiv.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 12px; background: var(--light-bg); border-radius: 6px;"><i class="fas fa-check-circle" style="color: var(--accent-gold); margin-right: 6px;"></i>No recent issues</div>';
  } else {
    recentIssuesDiv.innerHTML = recentIssues.map((issue) => `
      <div style="padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; background: #f8fafb;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <strong style="color: var(--primary-navy);">${escapeHtml(issue.category)}</strong>
          ${statusPill(issue.status)}
        </div>
        <p style="margin: 0; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">
          <strong>Location:</strong> ${escapeHtml(issue.location)}
        </p>
        <p style="margin: 0; font-size: 13px; color: var(--text-dark); margin-bottom: 6px; max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(issue.description)}
        </p>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-top: 8px;">
          <span><strong>${escapeHtml(issue.barangay || "-")}</strong> · Reported by ${escapeHtml(issue.reporter)}</span>
          <span>${escapeHtml(issue.date)}</span>
        </div>
      </div>
    `).join("");
  }

  // Render pending documents
  if (pendingDocs.length === 0) {
    pendingDocsDiv.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 12px; background: var(--light-bg); border-radius: 6px;"><i class="fas fa-check-circle" style="color: var(--accent-gold); margin-right: 6px;"></i>No pending document requests</div>';
  } else {
    pendingDocsDiv.innerHTML = pendingDocs.map((doc) => `
      <div style="padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; background: #f8fafb;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <div style="font-size: 12px; color: var(--accent-gold); font-weight: 600; margin-bottom: 4px;">${escapeHtml(doc.ref)}</div>
            <strong style="color: var(--primary-navy); font-size: 14px;">${escapeHtml(doc.type)}</strong>
          </div>
          ${statusPill(doc.status)}
        </div>
        <p style="margin: 0; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">
          <strong>Requested by:</strong> ${escapeHtml(doc.name)}
        </p>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-top: 8px;">
          <span><strong>${escapeHtml(doc.barangay)}</strong></span>
          <span>${escapeHtml(doc.date)}</span>
        </div>
      </div>
    `).join("");
  }

  // Update last updated time
  if (lastUpdatedSpan) {
    lastUpdatedSpan.textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
}

// Initialize notification button click handler
function initNotificationButton() {
  const notifBtn = document.querySelector(".admin-notif-btn");
  if (notifBtn) {
    notifBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      renderNotifications();
      openModal("notificationsModalOverlay");
    });
  }
}

function setHeaderDate() {
  const dateEl = document.getElementById("headerDate");
  if (!dateEl) return;
  dateEl.textContent = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function initSidebarNav() {
  document.querySelectorAll(".admin-nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const panel = this.getAttribute("data-panel");
      if (panel) showPanel(panel);
      // Close sidebar on mobile after navigation
      closeMobileSidebar();
    });
  });
}

// === Mobile Sidebar ===
function openMobileSidebar() {
  document.getElementById("adminSidebar")?.classList.add("open");
  document.getElementById("sidebarOverlay")?.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeMobileSidebar() {
  if (window.innerWidth >= 992) return; // only on mobile
  document.getElementById("adminSidebar")?.classList.remove("open");
  document.getElementById("sidebarOverlay")?.classList.remove("show");
  document.body.style.overflow = "";
}

function initMobileSidebar() {
  document.getElementById("sidebarToggleBtn")?.addEventListener("click", openMobileSidebar);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeMobileSidebar);
  document.getElementById("sidebarOverlay")?.addEventListener("click", closeMobileSidebar);
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 992) closeMobileSidebar();
  });
}

function showPanel(panelId) {
  // Defense in depth: block direct function calls to restricted panels.
  if (isBarangayAdmin() && (panelId === "barangays" || panelId === "settings" || panelId === "admin-invites")) {
    panelId = "overview";
    showAdminToast("This section is available only to Super Admin accounts.");
  }

  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("panel-" + panelId)?.classList.add("active");

  document.querySelectorAll(".admin-nav-link").forEach((l) => l.classList.remove("active"));
  document.querySelector(`[data-panel="${panelId}"]`)?.classList.add("active");

  const titles = {
    overview: ["Overview", "Barangay Hub Administrative Dashboard"],
    analytics: ["Analytics", "Live portal statistics — documents, residents, workers"],
    barangays: ["Barangays", "Manage and monitor all 24 barangays of the City"],
    users: ["Users / Residents", "View and manage registered users"],
    documents: ["Document Requests", "Review and process document applications"],
    announcements: ["Announcements", "Manage official city and barangay announcements"],
    reports: ["Issue Reports", "Review community-submitted infrastructure reports"],
    workers: ["Workers Registry", "Manage the skilled worker directory"],
    doctemplates: ["Document Templates", "Upload and manage per-barangay document templates"],
    settings: ["Settings", "System configuration and admin account"],
    "admin-invites": ["Admin Invites", "Pre-approve barangay admin accounts"],
    "health-schedules": ["Health Schedules", "Manage weekly health center activities"]
  };

  const title = titles[panelId] || ["Admin", ""];
  document.getElementById("adminPanelTitle").textContent = title[0];
  document.getElementById("adminPanelSub").textContent = title[1];

  // Lazy-load analytics on first visit to the panel
  if (panelId === "analytics") {
    renderAnalyticsPanel();
  }

  // Lazy-load health schedules on visit
  if (panelId === "health-schedules") {
    populateHealthScheduleBarangays();
    loadHealthSchedules();
  }

  closeMobileSidebar();
}

function initMobileSidebar() {
  document.getElementById("sidebarToggleBtn")?.addEventListener("click", openMobileSidebar);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeMobileSidebar);
  document.getElementById("sidebarOverlay")?.addEventListener("click", closeMobileSidebar);
}

function openMobileSidebar() {
  document.getElementById("adminSidebar")?.classList.add("open");
  document.getElementById("sidebarOverlay")?.classList.add("show");
}

function closeMobileSidebar() {
  document.getElementById("adminSidebar")?.classList.remove("open");
  document.getElementById("sidebarOverlay")?.classList.remove("show");
}

function statusPill(status) {
  const map = {
    Active: "active",
    Pending: "pending",
    Processing: "processing",
    Completed: "completed",
    Approved: "active",
    Archived: "completed",
    Verified: "active",
    "Pending Verification": "pending",
    Rejected: "rejected"
  };
  const cls = map[status] || "pending";
  return `<span class="status-pill ${cls}">${status}</span>`;
}

function priorityBadge(priority) {
  const p = String(priority || "medium").toLowerCase();
  if (p === "high") {
    return `<span class="priority-badge high"><i class="fas fa-circle-exclamation"></i> High</span>`;
  }
  if (p === "low") {
    return `<span class="priority-badge low"><i class="fas fa-circle-info"></i> Low</span>`;
  }
  return `<span class="priority-badge medium"><i class="fas fa-circle-minus"></i> Medium</span>`;
}

function buildIssueTimingBadge(createdAt, updatedAt, status) {
  if (status !== "Completed") {
    return `<span style="font-size:12px;color:var(--text-muted)">In Progress</span>`;
  }

  if (!createdAt || !updatedAt) {
    return `<span style="font-size:12px;color:var(--text-muted)">—</span>`;
  }

  const start = new Date(createdAt);
  const end = new Date(updatedAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return `<span style="font-size:12px;color:var(--text-muted)">—</span>`;
  }

  const pStr = fmtTime(start);
  const nStr = fmtTime(end);

  const diffMs = end.getTime() - start.getTime();
  const duration = formatDuration(diffMs);

  return `<div class="timing-badge timing-complete">
            <div class="timing-range">
              <span class="timing-time">${pStr}</span>
              <i class="fas fa-arrow-right timing-arrow"></i>
              <span class="timing-time">${nStr}</span>
            </div>
            <span class="timing-duration">${duration}</span>
          </div>`;
}

function renderOverviewTable() {
  const tbody = document.getElementById("overviewRequestsBody");
  if (!tbody) return;

  if (!docRequests || !docRequests.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No recent document requests.</td></tr>`;
    return;
  }

  tbody.innerHTML = docRequests.slice(0, 5).map((r) => {
    const safeId = escapeAttr(r.id);
    let actionBtn = "";
    // Super admin sees read-only — only barangay admins can process
    if (isBarangayAdmin()) {
      if (r.status === "Pending") {
        actionBtn = `<button class="tbl-btn tbl-btn-approve" onclick="markAsProcessing('${safeId}')"><i class="fas fa-play"></i> Process</button>`;
      } else if (r.status === "Processing") {
        actionBtn = `<button class="tbl-btn tbl-btn-edit" onclick="openFillDocModal('${safeId}')"><i class="fas fa-file-signature"></i> Edit Doc</button>`;
      }
    }
    return `
    <tr>
      <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${statusPill(r.status)}</td>
      <td>${actionBtn || '<span style="font-size:11px;color:var(--text-muted)">—</span>'}</td>
    </tr>`;
  }).join("");
}

function renderOverviewReports() {
  const tbody = document.getElementById("overviewReportsBody");
  if (!tbody) return;

  if (!issueReports || !issueReports.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No recent issue reports.</td></tr>`;
    return;
  }

  tbody.innerHTML = issueReports.slice(0, 5).map((r) => {
    const safeId = escapeAttr(r.id);
    let actionBtn = `<button class="tbl-btn tbl-btn-view" onclick="showIssueDetails('${safeId}')"><i class="fas fa-eye"></i> View</button>`;
    
    return `
    <tr>
      <td><strong>${escapeHtml(r.category)}</strong></td>
      <td>${priorityBadge(r.priority)}</td>
      <td><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(r.location)}</span></td>
      <td>${statusPill(r.status)}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join("");
}

function renderBarangayTable(filter = "") {
  const tbody = document.getElementById("barangayTableBody");
  if (!tbody) return;

  const filtered = filter
    ? barangays.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : barangays;

  tbody.innerHTML = filtered.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(b.name)}</strong>${b.notes ? `<br><small style="color:var(--text-muted)">${escapeHtml(b.notes)}</small>` : ""}</td>
      <td>${escapeHtml(b.captain)}</td>
      <td>${Number(b.users).toLocaleString()}</td>
      <td>${statusPill(b.status === "active" ? "Active" : "Pending")}</td>
      <td>${escapeHtml(b.added)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="tbl-btn tbl-btn-edit" onclick="openEditBarangayModal('${b.id}')"><i class="fas fa-pen"></i></button>
        ${b.status === "pending" ? `<button class="tbl-btn tbl-btn-approve" onclick="activateBarangay('${b.id}')"><i class="fas fa-circle-check"></i> Activate</button>` : ""}
        <button class="tbl-btn tbl-btn-delete" onclick="deleteBarangay('${b.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join("");

  const pendingCount = document.getElementById("pendingBrgyCount");
  if (pendingCount) pendingCount.textContent = String(barangays.filter((b) => b.status === "pending").length);
}

function filterBarangays() {
  renderBarangayTable(document.getElementById("barangaySearch").value || "");
}

function renderUsersTable(filter = "", statusFilter = "") {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  let roleScoped = isSuperAdmin()
    ? usersData
    : usersData.filter((u) => u.role === "resident");

  // Status filter: verified / pending
  if (statusFilter === "verified") {
    roleScoped = roleScoped.filter((u) => u.isVerified);
  } else if (statusFilter === "pending") {
    roleScoped = roleScoped.filter((u) => !u.isVerified);
  }

  const filtered = filter
    ? roleScoped.filter((u) => `${u.first} ${u.last} ${u.email}`.toLowerCase().includes(filter.toLowerCase()))
    : roleScoped;

  tbody.innerHTML = filtered.map((u, i) => {
    const fullName = `${escapeHtml(u.first)} ${escapeHtml(u.last)}`;
    // Barangay admins see Verify + Reject for unverified residents.
    // Super admins see the list read-only (they manage higher-level tasks).
    const verifyBtn = (isBarangayAdmin() || isSuperAdmin()) && !u.isVerified && u.role === "resident"
      ? `<button class="tbl-btn tbl-btn-approve" onclick="verifyResident('${u.id}')" title="Approve account"><i class="fas fa-check"></i> Approve</button>`
      : "";
    const rejectBtn = (isBarangayAdmin() || isSuperAdmin()) && !u.isVerified && u.role === "resident"
      ? `<button class="tbl-btn tbl-btn-delete" onclick="rejectResident('${u.id}')" title="Reject & delete account"><i class="fas fa-ban"></i> Reject</button>`
      : "";

    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${fullName}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.barangay)}</td>
      <td>${escapeHtml(u.registered)}</td>
      <td>${escapeHtml(formatRoleLabel(u.role))}</td>
      <td>${statusPill(u.status)}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap;">
        ${verifyBtn}
        ${rejectBtn}
        <button class="tbl-btn tbl-btn-view" onclick="openViewResidentModal('${u.id}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>`;
  }).join("");

  const countEl = document.getElementById("userCount");
  if (countEl) countEl.textContent = `${filtered.length} users`;
}

function filterUsers() {
  renderUsersTable(
    document.getElementById("userSearch")?.value || "",
    document.getElementById("userStatusFilter")?.value || ""
  );
}

// ─────────────────────────────────────────────────────────────
// RESIDENT VERIFICATION ACTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Approves a resident account by setting is_verified = true.
 * Called from both the users table "Approve" button and the
 * View Resident modal's action button.
 */
async function verifyResident(id) {
  if (!id) return;

  const user = usersData.find(u => u.id === id);
  const name = user ? `${user.first} ${user.last}` : "this resident";

  if (!window.confirm(`Approve the account for ${name}? They will be able to log in immediately.`)) return;

  const { error } = await supabaseClient
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", id);

  if (error) {
    showAdminToast(`Failed to approve: ${error.message}`);
    return;
  }

  showAdminToast(`✅ Account approved for ${name}.`);

  // Close modal if open, then reload residents and refresh all panels.
  closeModal("viewResidentModalOverlay");
  await loadResidents();
  renderAllPanels();
}

/**
 * Rejects a resident by deleting their profile row (cascades to auth.users
 * via the on-delete-cascade FK, removing the account entirely).
 * Only admins scoped to the same barangay can do this (RLS enforced in DB).
 */
async function rejectResident(id) {
  if (!id) return;

  const user = usersData.find(u => u.id === id);
  const name = user ? `${user.first} ${user.last}` : "this resident";

  if (!window.confirm(
    `Reject and DELETE the account for ${name}?\n\nThis is permanent — the resident will need to sign up again.`
  )) return;

  // Delete the profile row; the ON DELETE CASCADE on auth.users will remove the auth record too.
  const { error } = await supabaseClient
    .from("profiles")
    .delete()
    .eq("id", id);

  if (error) {
    showAdminToast(`Failed to reject: ${error.message}`);
    return;
  }

  showAdminToast(`Account for ${name} has been rejected and removed.`);
  closeModal("viewResidentModalOverlay");
  await loadResidents();
  renderAllPanels();
}

function openViewResidentModal(id) {
  const user = usersData.find(u => u.id === id);
  if (!user) return;

  const fullName = `${user.first} ${user.last}`;
  document.getElementById("vrName").textContent = fullName;
  document.getElementById("vrEmail").textContent = user.email || "-";
  document.getElementById("vrPhone").textContent = user.phone || "-";
  document.getElementById("vrBarangay").textContent = user.barangay || "-";
  document.getElementById("vrRegistered").textContent = user.registered || "-";
  document.getElementById("vrStatus").innerHTML = statusPill(user.status);

  const actionContainer = document.getElementById("vrActionContainer");
  if ((isBarangayAdmin() || isSuperAdmin()) && !user.isVerified && user.role === "resident") {
    actionContainer.innerHTML = `
      <button type="button" class="btn-admin-primary" onclick="verifyResident('${user.id}')">
        <i class="fas fa-check"></i> Approve
      </button>
      <button type="button" class="btn-admin-danger" onclick="rejectResident('${user.id}')">
        <i class="fas fa-ban"></i> Reject
      </button>`;
  } else {
    actionContainer.innerHTML = "";
  }

  // Reset the doc section to loading state while we fetch signed URLs
  const verifyDocEl = document.getElementById("vrVerifyDoc");
  if (verifyDocEl) verifyDocEl.innerHTML = `<span style="color:rgba(0,0,0,0.4);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading...</span>`;

  document.getElementById("viewResidentModalOverlay").style.display = "flex";

  // Fetch the stored document paths and generate short-lived signed URLs (5 min)
  // from the private bucket so admin can review without the files being public.
  fetchResidentDocUrls(id, verifyDocEl);
}

async function fetchResidentDocUrls(userId, verifyDocEl) {
  if (!supabaseClient) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("verification_doc_url")
    .eq("id", userId)
    .maybeSingle();

  // Helper: render a document thumbnail or a "not uploaded" badge
  function renderDocSlot(container, path, label, isPdf) {
    if (!container) return;
    if (!path) {
      container.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:6px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:6px 10px;font-size:12px;color:#856404;">
          <i class="fas fa-exclamation-triangle"></i> No ${label} uploaded
        </div>`;
      return;
    }
    const { data: signed } = supabaseClient.storage
      .from("resident-verification-docs")
      .createSignedUrl(path, 300); // 5-minute expiry

    // createSignedUrl is synchronous in the JS SDK v2 when called this way;
    // for async-safe usage we handle it as a promise.
    supabaseClient.storage
      .from("resident-verification-docs")
      .createSignedUrl(path, 300)
      .then(({ data: s, error: e }) => {
        if (e || !s?.signedUrl) {
          container.innerHTML = `<span style="color:#e74c3c;font-size:13px"><i class="fas fa-times-circle"></i> Could not load document.</span>`;
          return;
        }
        if (isPdf) {
          container.innerHTML = `
            <a href="${s.signedUrl}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:7px;background:#f1f3f4;border:1px solid #dde3ec;border-radius:8px;padding:8px 12px;font-size:13px;color:#1a3a52;text-decoration:none;font-weight:600;">
              <i class="fas fa-file-pdf" style="color:#e74c3c;font-size:16px"></i> View PDF (opens in new tab)
            </a>`;
        } else {
          container.innerHTML = `
            <a href="${s.signedUrl}" target="_blank" rel="noopener" title="Click to view full image">
              <img src="${s.signedUrl}" alt="${label}"
                   style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid #dde3ec;object-fit:cover;cursor:zoom-in;transition:opacity 0.2s;"
                   onerror="this.parentElement.innerHTML='<span style=color:#e74c3c;font-size:13px><i class=fas fa-times-circle></i> Image could not be loaded.</span>'" />
            </a>`;
        }
      });
  }

  const verifyPath = profile?.verification_doc_url || null;
  const isPdf = verifyPath && verifyPath.toLowerCase().endsWith(".pdf");

  renderDocSlot(verifyDocEl, verifyPath, "Verification Document", isPdf);
}

function renderDocRequestsTable() {
  const tbody = document.getElementById("docRequestsBody");
  if (!tbody) return;

  const typeFilter = document.getElementById("docTypeFilter")?.value || "";
  const statusFilter = document.getElementById("docStatusFilter")?.value || "";
  const barangayFilter = document.getElementById("docBarangayFilter")?.value || "";
  const term = (document.getElementById("docSearch")?.value || "").trim().toLowerCase();

  let filtered = [...docRequests];
  if (typeFilter) filtered = filtered.filter((r) => r.type === typeFilter);
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (barangayFilter) filtered = filtered.filter((r) => String(r.barangay) === barangayFilter);
  if (term) {
    filtered = filtered.filter((r) => {
      const blob = `${r.ref} ${r.name} ${r.type} ${r.barangay}`.toLowerCase();
      return blob.includes(term);
    });
  }

  // ── SUPER ADMIN: read-only view grouped by barangay ──────────────────────
  if (isSuperAdmin()) {
    // Update column header to "Processing Time"
    const table = document.getElementById("docRequestsBody")?.closest("table");
    const headers = table?.querySelectorAll("thead th");
    if (headers && headers.length >= 7) headers[6].textContent = "Processing Time";

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:22px;margin-bottom:8px;display:block"></i>No document requests found.</td></tr>`;
      return;
    }

    // Group by barangay
    const groups = {};
    filtered.forEach(r => {
      const key = r.barangay || "Unknown Barangay";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const sortedBarangays = Object.keys(groups).sort();

    tbody.innerHTML = sortedBarangays.map(brgyName => {
      const rows = groups[brgyName];
      const pendingCount = rows.filter(r => r.status === "Pending").length;
      const processingCount = rows.filter(r => r.status === "Processing").length;

      const groupHeader = `
        <tr class="brgy-group-header">
          <td colspan="7">
            <div class="brgy-group-header-inner">
              <div>
                <i class="fas fa-map-marker-alt" style="color:var(--accent-gold);margin-right:8px"></i>
                <strong>${escapeHtml(brgyName)}</strong>
              </div>
              <div class="brgy-group-badges">
                <span class="status-pill pending" style="font-size:11px">${pendingCount} Pending</span>
                <span class="status-pill processing" style="font-size:11px">${processingCount} Processing</span>
                <span style="font-size:11px;color:var(--text-muted);font-weight:600">${rows.length} total</span>
              </div>
            </div>
          </td>
        </tr>`;

      const dataRows = rows.map(r => `
        <tr>
          <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
          <td><strong>${escapeHtml(r.name)}</strong></td>
          <td>${escapeHtml(r.type)}</td>
          <td>${escapeHtml(r.barangay)}</td>
          <td>${escapeHtml(r.date)}</td>
          <td>${statusPill(r.status)}</td>
          <td>${buildTimingBadge(r.processedAt, r.notifiedAt)}</td>
        </tr>`).join("");

      return groupHeader + dataRows;
    }).join("");

    return;
  }

  // ── BARANGAY ADMIN: full action buttons ───────────────────────────────────
  tbody.innerHTML = filtered.map((r) => {
    const isPending     = r.status === "Pending";
    const isProcessing  = r.status === "Processing";
    const canArchive    = r.status === "Approved";
    const canDelete     = ["Approved", "Rejected", "Completed", "Archived"].includes(r.status);
    const canRedownload = ["Approved", "Completed", "Archived"].includes(r.status) &&
                          docTemplates.some(t => t.barangay_name === r.barangay && t.document_type === r.type);
    const safeId    = escapeAttr(r.id);
    const safeDoc   = escapeAttr(r.type);
    const safeName  = escapeAttr(r.name);
    const safeEmail = escapeAttr(r.residentEmail || "");
    const safeStatus = escapeAttr(r.status);

    return `
    <tr>
      <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${escapeHtml(r.barangay)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${statusPill(r.status)}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap;">
        ${isPending ? `<button class="tbl-btn tbl-btn-approve" onclick="markAsProcessing('${safeId}')"><i class="fas fa-play"></i> Process</button>` : ""}
        ${isProcessing ? `<button class="tbl-btn tbl-btn-edit" onclick="openFillDocModal('${safeId}')"><i class="fas fa-file-signature"></i> Edit Doc</button>` : ""}
        ${isProcessing ? `<button class="tbl-btn tbl-btn-delete" onclick="setDocumentStatus('${safeId}','rejected')"><i class="fas fa-xmark"></i> Reject</button>` : ""}
        ${canArchive ? `<button class="tbl-btn tbl-btn-view" onclick="setDocumentStatus('${safeId}','completed')"><i class="fas fa-box-archive"></i> Archive</button>` : ""}
        ${canRedownload ? `<button class="tbl-btn tbl-btn-edit" onclick="openFillDocModal('${safeId}', true)" title="Re-download filled document"><i class="fas fa-download"></i> Download Doc</button>` : ""}
        <button class="tbl-btn tbl-btn-message" onclick="openMessageResidentModal('${safeId}','${safeDoc}','${safeName}','${safeEmail}','${safeStatus}')"><i class="fas fa-envelope"></i> Message</button>
        ${canDelete ? `<button class="tbl-btn tbl-btn-delete" onclick="deleteDocumentRequest('${safeId}')"><i class="fas fa-trash"></i> Delete</button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

function filterDocuments() {
  renderDocRequestsTable();
}

// Moves request status through approve/reject/archive queue; policy-controlled in DB via RLS.
async function setDocumentStatus(id, status) {
  const { error } = await supabaseClient
    .from("document_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadDocRequests();
  renderAllPanels();

  const label = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "archived";
  showAdminToast(`Document request ${label}.`);
}

async function deleteDocumentRequest(id) {
  if (!confirm("Are you sure you want to permanently delete this document request?")) return;

  const { data, error } = await supabaseClient
    .from("document_requests")
    .delete()
    .eq("id", id)
    .select();

  if (error) {
    showAdminToast(error.message);
    return;
  }

  // If data is empty, the RLS policy blocked the deletion (0 rows affected)
  if (!data || data.length === 0) {
    showAdminToast("Permission denied. Could not delete document (RLS block).");
    return;
  }

  await loadDocRequests();
  renderAllPanels();
  showAdminToast("Document request deleted permanently.");
}

// ── Message Resident ────────────────────────────────────────────────────────

let msgResidentContext = { id: null, email: "", doc: "", name: "", status: "" };

// Pre-fills the modal with context-aware default message templates.
function openMessageResidentModal(docId, docName, residentName, residentEmail, currentStatus) {
  msgResidentContext = { id: docId, email: residentEmail, doc: docName, name: residentName, status: currentStatus };

  document.getElementById("msgResidentTo").textContent = residentEmail || "(no email on file)";
  document.getElementById("msgResidentName").textContent = residentName;

  // Build a helpful default message based on the current document status.
  const adminName = currentProfile?.full_name || "Barangay Admin";
  const templates = {
    Approved:  `Hi ${residentName},\n\nYour ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) has been APPROVED and is now ready for pick-up at the Barangay Hall.\n\nPlease bring a valid ID when claiming your document.\n\nThank you,\n${adminName}\nBarangay Hub`,
    Rejected:  `Hi ${residentName},\n\nWe regret to inform you that your ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) could not be processed at this time.\n\nPlease visit the Barangay Hall for further assistance or resubmit with the required documents.\n\nThank you,\n${adminName}\nBarangay Hub`,
    Pending:   `Hi ${residentName},\n\nYour ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) is currently being reviewed. We will notify you once it is ready.\n\nThank you for your patience.\n\n${adminName}\nBarangay Hub`,
    default:   `Hi ${residentName},\n\nThis is an update regarding your ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}).\n\n[Write your message here]\n\n${adminName}\nBarangay Hub`
  };

  const textarea = document.getElementById("msgResidentBody");
  if (textarea) textarea.value = templates[currentStatus] || templates.default;

  openModal("messageResidentModalOverlay");
}

function closeMessageResidentModal() {
  closeModal("messageResidentModalOverlay");
}

// Sends a mailto: link (opens admin's email client) and saves message to DB for audit trail.
async function sendMessageToResident() {
  const body   = (document.getElementById("msgResidentBody")?.value || "").trim();
  const subject = document.getElementById("msgResidentSubject")?.value?.trim()
                  || `Update on your ${msgResidentContext.doc} request – Barangay Hub`;
  const email  = msgResidentContext.email;

  if (!body) {
    showAdminToast("Please write a message before sending.");
    return;
  }
  if (!email) {
    showAdminToast("This resident does not have an email address on file.");
    return;
  }

  // Trigger the OS default email client via a hidden anchor — window.open causes a blank tab in Chrome.
  const mailtoLink = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const a = document.createElement("a");
  a.href = mailtoLink;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Also persist the message to the DB for an audit trail.
  if (supabaseClient) {
    const { error } = await supabaseClient.from("admin_messages").insert({
      document_request_id: msgResidentContext.id || null,
      recipient_email: email,
      subject,
      message: body,
      sent_by: currentUser?.id || null,
      created_at: new Date().toISOString()
    });
    if (error) {
      console.warn("admin_messages insert failed (table may not exist yet):", error.message);
    } else if (msgResidentContext.id) {
      // Save notified_at timestamp for processing time tracking
      const notifiedNow = new Date().toISOString();
      const updatePayload = { notified_at: notifiedNow };
      // Mark as completed unless it was rejected
      if (msgResidentContext.status !== "Rejected" && msgResidentContext.status !== "rejected") {
        updatePayload.status = "completed";
      }
      await supabaseClient.from("document_requests")
        .update(updatePayload)
        .eq("id", msgResidentContext.id);
      filterDocuments(); // refresh admin table
    }
  }

  closeMessageResidentModal();
  showAdminToast(`Message sent to ${email}.`);
}

async function verifyResident(profileId) {
  const { error } = await supabaseClient
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", profileId);

  if (error) {
    if (looksLikeMissingColumn(error, "is_verified")) {
      showAdminToast("Add `is_verified` to profiles table to enable resident verification.");
      return;
    }

    showAdminToast(error.message);
    return;
  }

  await loadResidents();
  renderAllPanels();
  showAdminToast("Resident verified successfully.");
}

function populateIssueBarangayFilter() {
  const filter = document.getElementById("issueBarangayFilter");
  if (!filter) return;

  if (isBarangayAdmin()) {
    filter.innerHTML = `<option value="${escapeHtml(getScopedBarangay())}">${escapeHtml(getScopedBarangay())}</option>`;
    filter.value = getScopedBarangay();
    return;
  }

  const previous = filter.value;
  const uniqueBarangays = [...new Set(issueReports.map((r) => String(r.barangay || "-").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  filter.innerHTML = `<option value="">All Barangays</option>${uniqueBarangays
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;

  if (previous && uniqueBarangays.includes(previous)) {
    filter.value = previous;
  }
}

function populateDocBarangayFilter() {
  const filter = document.getElementById("docBarangayFilter");
  if (!filter) return;

  if (isBarangayAdmin()) {
    filter.innerHTML = `<option value="${escapeHtml(getScopedBarangay())}">${escapeHtml(getScopedBarangay())}</option>`;
    filter.value = getScopedBarangay();
    return;
  }

  const previous = filter.value;
  const uniqueBarangays = [...new Set(docRequests.map((r) => String(r.barangay || "-").trim()).filter((b) => b && b !== "-"))]
    .sort((a, b) => a.localeCompare(b));

  filter.innerHTML = `<option value="">All Barangays</option>${uniqueBarangays
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;

  if (previous && uniqueBarangays.includes(previous)) {
    filter.value = previous;
  }
}

function populateDocTypeFilter() {
  const filter = document.getElementById("docTypeFilter");
  if (!filter) return;

  const previous = filter.value;
  const uniqueTypes = [...new Set(docRequests.map((r) => String(r.type || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  filter.innerHTML = `<option value="">All Document Types</option>${uniqueTypes
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    .join("")}`;

  if (previous && uniqueTypes.includes(previous)) {
    filter.value = previous;
  }
}

function filterIssueReports() {
  renderIssueReportsTable();
}

function renderIssueReportsTable() {
  const tbody = document.getElementById("issueReportsBody");
  if (!tbody) return;

  const term = (document.getElementById("issueSearch")?.value || "").trim().toLowerCase();
  const category = (document.getElementById("issueCategoryFilter")?.value || "").trim();
  const barangayFilter = (document.getElementById("issueBarangayFilter")?.value || "").trim();

  let filtered = [...issueReports];

  if (term) {
    filtered = filtered.filter((r) => {
      const blob = `${r.category} ${r.location} ${r.description} ${r.reporter} ${r.barangay}`.toLowerCase();
      return blob.includes(term);
    });
  }

  if (category) filtered = filtered.filter((r) => r.category === category);
  if (barangayFilter) filtered = filtered.filter((r) => String(r.barangay) === barangayFilter);

  // ── SUPER ADMIN: read-only view grouped by barangay ──────────────────────
  if (isSuperAdmin()) {
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:22px;margin-bottom:8px;display:block"></i>No issue reports found.</td></tr>`;
      return;
    }

    // Group by barangay
    const groups = {};
    filtered.forEach(r => {
      const key = r.barangay || "Unknown Barangay";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const sortedBarangays = Object.keys(groups).sort();

    tbody.innerHTML = sortedBarangays.map(brgyName => {
      const rows = groups[brgyName];
      const pendingCount = rows.filter(r => r.status === "Pending").length;
      const processingCount = rows.filter(r => r.status === "Processing").length;
      const completedCount = rows.filter(r => r.status === "Completed").length;

      const groupHeader = `
        <tr class="brgy-group-header">
          <td colspan="11">
            <div class="brgy-group-header-inner">
              <div>
                <i class="fas fa-map-marker-alt" style="color:var(--accent-gold);margin-right:8px"></i>
                <strong>${escapeHtml(brgyName)}</strong>
              </div>
              <div class="brgy-group-badges">
                <span class="status-pill pending" style="font-size:11px">${pendingCount} Pending</span>
                <span class="status-pill processing" style="font-size:11px">${processingCount} Processing</span>
                <span class="status-pill completed" style="font-size:11px">${completedCount} Resolved</span>
                <span style="font-size:11px;color:var(--text-muted);font-weight:600">${rows.length} total</span>
              </div>
            </div>
          </td>
        </tr>`;

      const dataRows = rows.map((r, i) => {
        const actionButtons = `<button class="tbl-btn tbl-btn-view" onclick="showIssueDetails('${r.id}')"><i class="fas fa-eye"></i> View</button>`;

        return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${priorityBadge(r.priority)}</td>
          <td>${escapeHtml(r.location)}</td>
          <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.description)}</td>
          <td>${escapeHtml(r.barangay || "-")}</td>
          <td>${escapeHtml(r.reporter)}</td>
          <td>${escapeHtml(r.date)}</td>
          <td>${buildIssueTimingBadge(r.createdAt, r.updatedAt, r.status)}</td>
          <td>${statusPill(r.status)}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;">${actionButtons}</td>
        </tr>`;
      }).join("");

      return groupHeader + dataRows;
    }).join("");

    return;
  }

  // ── BARANGAY ADMIN: flat list with action buttons ──────────────────────
  tbody.innerHTML = filtered.map((r, i) => {
    const canDelete = r.status === "Completed";
    const deleteBtn = canDelete
      ? `<button class="tbl-btn tbl-btn-delete" onclick="deleteIssueReport('${r.id}')"><i class="fas fa-trash"></i> Delete</button>`
      : "";

    const actionButtons = isBarangayAdmin()
      ? `<button class="tbl-btn tbl-btn-view" onclick="showIssueDetails('${r.id}')"><i class="fas fa-eye"></i> View</button>
         ${r.status !== "Processing" && r.status !== "Completed" ? `<button class="tbl-btn tbl-btn-approve" onclick="setIssueStatus('${r.id}','processing')"><i class="fas fa-play"></i> Process</button>` : ""}
         ${r.status !== "Completed" ? `<button class="tbl-btn tbl-btn-view" onclick="setIssueStatus('${r.id}','resolved')"><i class="fas fa-circle-check"></i> Resolve</button>` : ""}
         ${deleteBtn}`
      : `<button class="tbl-btn tbl-btn-view" onclick="showIssueDetails('${r.id}')"><i class="fas fa-eye"></i> View</button>`;

    return `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${priorityBadge(r.priority)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.description)}</td>
      <td>${escapeHtml(r.barangay || "-")}</td>
      <td>${escapeHtml(r.reporter)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${buildIssueTimingBadge(r.createdAt, r.updatedAt, r.status)}</td>
      <td>${statusPill(r.status)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">${actionButtons}</td>
    </tr>
  `;
  }).join("");
}

async function setIssueStatus(id, status) {
  if (!isBarangayAdmin()) {
    showAdminToast("Only the assigned Barangay Admin can update issue status.");
    return;
  }

  const { error } = await supabaseClient
    .from("issue_reports")
    .update({ status })
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadIssueReports();
  renderAllPanels();
  showAdminToast(status === "resolved" ? "Issue marked as resolved." : "Issue moved to processing.");
}

async function deleteIssueReport(id) {
  if (!isBarangayAdmin()) {
    showAdminToast("Only Barangay Admins can delete issues.");
    return;
  }
  const record = issueReports.find((r) => String(r.id) === String(id));
  if (!record) return;

  if (record.status !== "Completed") {
    showAdminToast("Only resolved issues can be deleted.");
    return;
  }

  const { error } = await supabaseClient
    .from("issue_reports")
    .delete()
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadIssueReports();
  renderAllPanels();
  showAdminToast("Resolved issue removed from the queue.");
}

function showIssueDetails(id) {
  const issue = issueReports.find((r) => String(r.id) === String(id));
  if (!issue) {
    showAdminToast("Issue not found.");
    return;
  }

  // Populate modal fields with issue data
  document.getElementById("issueCategory").textContent = escapeHtml(issue.category || "-");
  const priorityEl = document.getElementById("issuePriority");
  if (priorityEl) {
    priorityEl.innerHTML = priorityBadge(issue.priority);
  }
  document.getElementById("issueLocation").textContent = escapeHtml(issue.location || "-");
  document.getElementById("issueDescription").textContent = issue.description || "-";
  document.getElementById("issueBarangay").textContent = escapeHtml(issue.barangay || "-");
  document.getElementById("issueReporter").textContent = escapeHtml(issue.reporter || "-");
  document.getElementById("issueDate").textContent = escapeHtml(issue.date || "-");
  document.getElementById("issueStatus").textContent = escapeHtml(issue.status || "-");

  const photoEl = document.getElementById("issuePhoto");
  const noPhotoEl = document.getElementById("issueNoPhoto");

  if (issue.photoUrl) {
    photoEl.src = issue.photoUrl;
    photoEl.style.display = "inline-block";
    noPhotoEl.style.display = "none";
  } else {
    photoEl.src = "";
    photoEl.style.display = "none";
    noPhotoEl.style.display = "block";
  }

  // Open the modal
  openModal("viewIssueModalOverlay");
}

function renderWorkersTable(filter = "") {
  const tbody = document.getElementById("workersAdminBody");
  if (!tbody) return;

  const filtered = filter
    ? workersRegistry.filter((w) => `${w.name} ${w.specialty} ${w.phone}`.toLowerCase().includes(filter.toLowerCase()))
    : workersRegistry;

  tbody.innerHTML = filtered.map((w, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(w.name)}</strong></td>
      <td>${escapeHtml(w.specialty)}</td>
      <td>${escapeHtml(w.barangay || "-")}</td>
      <td>${escapeHtml(w.phone)}</td>
      <td><span style="color:#f39c12">&#9733;</span> ${escapeHtml(w.rating)}</td>
      <td>${statusPill(w.status)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="tbl-btn tbl-btn-edit" onclick="openEditWorkerModal('${w.id}')"><i class="fas fa-pen"></i></button>
        <button class="tbl-btn tbl-btn-delete" onclick="deleteWorker('${w.id}')"><i class="fas fa-trash"></i></button>
      </td>
      <td>
        <button class="tbl-btn tbl-btn-approve" onclick="openLogServiceModal('${w.id}','${escapeAttr(w.name)}')" title="Log a completed service for this worker">
          <i class="fas fa-clipboard-check"></i> Log
        </button>
      </td>
    </tr>
  `).join("");
}

// ══════════════════════════════════════════════════════════════════════
// SERVICE RECORDS — Log a completed service so resident can rate worker
// ══════════════════════════════════════════════════════════════════════

function openLogServiceModal(workerId, workerName) {
  document.getElementById("logServiceWorkerId").value = workerId;
  document.getElementById("logServiceWorkerName").value = workerName;
  document.getElementById("logServiceDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("logServiceDescription").value = "";
  document.getElementById("logServiceResidentError").textContent = "";

  // Populate the residents dropdown scoped to this barangay
  const residentSel = document.getElementById("logServiceResidentId");
  residentSel.innerHTML = `<option value="">Select resident...</option>` +
    usersData
      .filter(u => u.role === "resident" || !u.role)
      .map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.first + " " + u.last)} — ${escapeHtml(u.email)}</option>`)
      .join("");

  openModal("logServiceModalOverlay");
}

async function submitServiceRecord() {
  const workerId    = document.getElementById("logServiceWorkerId").value;
  const residentId  = document.getElementById("logServiceResidentId").value;
  const serviceDate = document.getElementById("logServiceDate").value;
  const description = document.getElementById("logServiceDescription").value.trim();
  const errEl       = document.getElementById("logServiceResidentError");

  errEl.textContent = "";

  if (!residentId) {
    errEl.textContent = "Please select a resident.";
    return;
  }

  const btn = document.getElementById("logServiceSubmitBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

  const { error } = await supabaseClient.from("service_records").upsert(
    {
      worker_id:    workerId,
      resident_id:  residentId,
      service_date: serviceDate,
      description:  description || null,
      logged_by:    currentUser.id
    },
    { onConflict: "worker_id,resident_id" }
  );

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-clipboard-check"></i> Log Service'; }

  if (error) {
    showAdminToast("Failed to log service: " + error.message);
    return;
  }

  closeModal("logServiceModalOverlay");
  showAdminToast("Service logged! Resident can now rate this worker.");
}

function filterWorkers() {
  renderWorkersTable(document.getElementById("workerSearch")?.value || "");
}

function canManageWorkerRecord(workerBarangay) {
  if (isSuperAdmin()) return true;
  const scoped = String(getScopedBarangay() || "").trim().toLowerCase();
  const target = String(workerBarangay || "").trim().toLowerCase();
  return scoped && scoped === target;
}

function renderAnnouncementsGrid() {
  const grid = document.getElementById("announcementsAdminGrid");
  if (!grid) return;

  grid.innerHTML = announcements.map((a) => `
    <div class="ann-admin-card">
      <div class="ann-card-tag">${escapeHtml(a.category)}</div>
      <h5>${escapeHtml(a.title)}</h5>
      <p>${escapeHtml(a.content)}</p>
      <div class="ann-card-footer">
        <span class="ann-card-date"><i class="fas fa-calendar-alt" style="color:var(--accent-gold)"></i> ${escapeHtml(a.date)}</span>
        <div class="ann-card-actions">
          <button class="tbl-btn tbl-btn-delete" onclick="deleteAnnouncement('${a.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join("");
}

function openAddBarangayModal() {
  document.getElementById("addBarangayForm").reset();
  document.getElementById("brgNameError").textContent = "";
  openModal("addBarangayModalOverlay");
}

function openEditBarangayModal(id) {
  const brgy = barangays.find((b) => String(b.id) === String(id));
  if (!brgy) return;

  document.getElementById("editBrgId").value = brgy.id;
  document.getElementById("editBrgName").value = brgy.name;
  document.getElementById("editBrgCaptain").value = brgy.captain === "-" ? "" : brgy.captain;
  document.getElementById("editBrgStatus").value = brgy.status;
  document.getElementById("editBrgNotes").value = brgy.notes;
  openModal("editBarangayModalOverlay");
}

async function deleteBarangay(id) {
  const { error } = await supabaseClient.from("barangays").delete().eq("id", id);
  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadBarangays();
  renderAllPanels();
  showAdminToast("Barangay removed successfully.");
}

async function activateBarangay(id) {
  const { error } = await supabaseClient.from("barangays").update({ status: "active" }).eq("id", id);
  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadBarangays();
  renderAllPanels();
  showAdminToast("Barangay activated successfully.");
}

async function deleteAnnouncement(id) {
  const { error } = await supabaseClient.from("announcements").delete().eq("id", id);
  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadAnnouncements();
  renderAllPanels();
  showAdminToast("Announcement deleted.");
}

function openAddWorkerModal() {
  const form = document.getElementById("addWorkerForm");
  if (form) {
    form.reset();
    form.dataset.mode = "add";
    delete form.dataset.workerId;
  }

  const modalTitle = document.querySelector("#addWorkerModal .admin-modal-header h4");
  const submitButton = document.querySelector("#addWorkerForm button[type='submit']");
  if (modalTitle) modalTitle.innerHTML = "<i class=\"fas fa-briefcase\"></i> Add Worker";
  if (submitButton) submitButton.innerHTML = "<i class=\"fas fa-plus\"></i> Add Worker";

  populateWorkerBarangayOptions("");

  openModal("addWorkerModalOverlay");
}

function populateWorkerBarangayOptions(selectedBarangay = "") {
  const barangaySelect = document.getElementById("workerBarangay");
  if (!barangaySelect) return;

  const sourceBarangays = barangays.some((b) => String(b.status).toLowerCase() === "active")
    ? barangays.filter((b) => String(b.status).toLowerCase() === "active")
    : barangays;

  const options = sourceBarangays
    .map((b) => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`)
    .join("");
  barangaySelect.innerHTML = `<option value="">Select Barangay</option>${options}`;

  if (isBarangayAdmin()) {
    barangaySelect.value = getScopedBarangay() || "";
    barangaySelect.setAttribute("disabled", "disabled");
    return;
  }

  barangaySelect.removeAttribute("disabled");
  if (selectedBarangay) barangaySelect.value = selectedBarangay;
}

function openEditWorkerModal(id) {
  const worker = workersRegistry.find((w) => String(w.id) === String(id));
  if (!worker) {
    showAdminToast("Worker record not found.");
    return;
  }
  if (!canManageWorkerRecord(worker.barangay)) {
    showAdminToast("You can edit workers only within your assigned barangay.");
    return;
  }

  const form = document.getElementById("addWorkerForm");
  if (!form) return;

  form.dataset.mode = "edit";
  form.dataset.workerId = String(worker.id);

  document.getElementById("workerFullName").value = worker.name || "";
  document.getElementById("workerSpecialty").value = worker.specialty || "";
  document.getElementById("workerPhone").value = worker.phone === "-" ? "" : (worker.phone || "");
  document.getElementById("workerEmail").value = worker.email || "";
  document.getElementById("workerStatus").value = worker.status === "Active" ? "active" : "pending";

  populateWorkerBarangayOptions(worker.barangay || "");

  const modalTitle = document.querySelector("#addWorkerModal .admin-modal-header h4");
  const submitButton = document.querySelector("#addWorkerForm button[type='submit']");
  if (modalTitle) modalTitle.innerHTML = "<i class=\"fas fa-pen\"></i> Edit Worker";
  if (submitButton) submitButton.innerHTML = "<i class=\"fas fa-save\"></i> Save Changes";

  openModal("addWorkerModalOverlay");
}

async function deleteWorker(id) {
  const worker = workersRegistry.find((w) => String(w.id) === String(id));
  if (!worker) {
    showAdminToast("Worker record not found.");
    return;
  }
  if (!canManageWorkerRecord(worker.barangay)) {
    showAdminToast("You can delete workers only within your assigned barangay.");
    return;
  }

  const confirmed = window.confirm(`Delete worker "${worker.name}" from registry?`);
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("workers")
    .delete()
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadWorkers();
  renderAllPanels();
  showAdminToast("Worker deleted successfully.");
}

// Binds CRUD form submissions for barangays and announcements.
function initFormHandlers() {
  const addBrgyForm = document.getElementById("addBarangayForm");
  if (addBrgyForm) {
    addBrgyForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = document.getElementById("brgName").value.trim();
      const captain = document.getElementById("brgCaptain").value.trim();
      const status = document.getElementById("brgStatus").value;
      const notes = document.getElementById("brgNotes").value.trim();

      if (!name) {
        document.getElementById("brgNameError").textContent = "Barangay name is required.";
        return;
      }

      const { error } = await supabaseClient.from("barangays").insert({
        name,
        captain: captain || null,
        status,
        notes: notes || null
      });

      if (error) {
        showAdminToast(error.message);
        return;
      }

      await loadBarangays();
      renderAllPanels();
      closeModal("addBarangayModalOverlay");
      showAdminToast(`${name} added successfully.`);
    });
  }

  const editBrgyForm = document.getElementById("editBarangayForm");
  if (editBrgyForm) {
    editBrgyForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const id = document.getElementById("editBrgId").value;
      const payload = {
        name: document.getElementById("editBrgName").value.trim(),
        captain: document.getElementById("editBrgCaptain").value.trim() || null,
        status: document.getElementById("editBrgStatus").value,
        notes: document.getElementById("editBrgNotes").value.trim() || null
      };

      const { error } = await supabaseClient.from("barangays").update(payload).eq("id", id);

      if (error) {
        showAdminToast(error.message);
        return;
      }

      await loadBarangays();
      renderAllPanels();
      closeModal("editBarangayModalOverlay");
      showAdminToast("Barangay updated successfully.");
    });
  }

  const addAnnForm = document.getElementById("addAnnouncementForm");
  if (addAnnForm) {
    addAnnForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = document.getElementById("annTitle").value.trim();
      const category = document.getElementById("annCategory").value;
      const barangay = document.getElementById("annBarangay").value;
      const content = document.getElementById("annContent").value.trim();

      if (!title || !content) return;
      
      const fileInput = document.getElementById("annMedia");
      const file = fileInput?.files[0];
      let mediaUrl = null;
      let mediaType = null;

      if (file) {
        showAdminToast("Uploading media...");
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from("announcements-media")
          .upload(fileName, file, { upsert: false });

        if (uploadError) {
          showAdminToast("Upload failed: " + uploadError.message);
          return;
        }

        const { data: urlData } = supabaseClient.storage
          .from("announcements-media")
          .getPublicUrl(fileName);
        
        if (urlData && urlData.publicUrl) {
          mediaUrl = urlData.publicUrl;
          mediaType = file.type.startsWith("video/") ? "video" : "image";
        }
      }

      const scope = isBarangayAdmin() ? getScopedBarangay() : (barangay === "All" ? "City-Wide" : barangay);
      const { error } = await supabaseClient.from("announcements").insert({
        title,
        category,
        barangay_scope: scope,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        published_at: new Date().toISOString(),
        created_by: currentUser.id
      });

      if (error) {
        showAdminToast(error.message);
        return;
      }

      await loadAnnouncements();
      renderAllPanels();
      closeModal("addAnnouncementModalOverlay");
      showAdminToast("Announcement published successfully.");
    });
  }

  const addWorkerForm = document.getElementById("addWorkerForm");
  if (addWorkerForm) {
    addWorkerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const mode = addWorkerForm.dataset.mode || "add";
      const workerId = addWorkerForm.dataset.workerId || "";
      const fullName = document.getElementById("workerFullName").value.trim();
      const specialty = document.getElementById("workerSpecialty").value.trim();
      const selectedBarangay = document.getElementById("workerBarangay").value;
      const barangay = isBarangayAdmin() ? (getScopedBarangay() || "") : selectedBarangay;
      const phone = document.getElementById("workerPhone").value.trim();
      const email = document.getElementById("workerEmail").value.trim();
      const status = document.getElementById("workerStatus").value;

      if (!fullName || !specialty || !barangay) {
        showAdminToast("Full name, specialty, and barangay are required.");
        return;
      }

      const payload = {
        full_name: fullName,
        service_category: specialty,
        category: "blue-collar",
        barangay,
        contact_phone: phone || null,
        contact_email: email || null,
        is_active: status === "active",
        created_by: currentUser.id
      };

      let error = null;
      if (mode === "edit" && workerId) {
        const existing = workersRegistry.find((w) => String(w.id) === String(workerId));
        if (existing && !canManageWorkerRecord(existing.barangay)) {
          showAdminToast("You can edit workers only within your assigned barangay.");
          return;
        }

        const updatePayload = { ...payload };
        delete updatePayload.created_by;

        ({ error } = await supabaseClient
          .from("workers")
          .update(updatePayload)
          .eq("id", workerId));
      } else {
        ({ error } = await supabaseClient.from("workers").insert(payload));
      }

      if (error) {
        showAdminToast(error.message);
        return;
      }

      await loadWorkers();
      renderAllPanels();
      closeModal("addWorkerModalOverlay");
      showAdminToast(mode === "edit" ? "Worker updated successfully." : "Worker added successfully.");
    });
  }

  // Super Admin city configuration save handler.
  const citySettingsForm = document.getElementById("citySettingsForm");
  if (citySettingsForm) {
    citySettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isSuperAdmin()) {
        showAdminToast("Only Super Admin can update city settings.");
        return;
      }

      const payload = {
        id: 1,
        city_name: document.getElementById("settingsCityName")?.value.trim() || "Biñan City",
        province: document.getElementById("settingsProvince")?.value.trim() || "Laguna",
        contact_email: document.getElementById("settingsContactEmail")?.value.trim() || null,
        contact_phone: document.getElementById("settingsContactPhone")?.value.trim() || null
      };

      const { error } = await supabaseClient.from("portal_settings").upsert(payload, { onConflict: "id" });
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("portal_settings") && msg.includes("does not exist")) {
          showAdminToast("Create table portal_settings first, then save again.");
          return;
        }
        showAdminToast(error.message);
        return;
      }

      await loadPortalSettings();
      renderSettingsFormValues();
      showAdminToast("City settings updated.");
    });
  }

  // Super Admin portal configuration save handler.
  const portalSettingsForm = document.getElementById("portalSettingsForm");
  if (portalSettingsForm) {
    portalSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isSuperAdmin()) {
        showAdminToast("Only Super Admin can update portal settings.");
        return;
      }

      const payload = {
        id: 1,
        primary_barangay: document.getElementById("settingsPrimaryBarangay")?.value.trim() || null,
        launch_date: document.getElementById("settingsLaunchDate")?.value || null,
        project_status: document.getElementById("settingsProjectStatus")?.value || "Active"
      };

      const { error } = await supabaseClient.from("portal_settings").upsert(payload, { onConflict: "id" });
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("portal_settings") && msg.includes("does not exist")) {
          showAdminToast("Create table portal_settings first, then save again.");
          return;
        }
        showAdminToast(error.message);
        return;
      }

      await loadPortalSettings();
      renderSettingsFormValues();
      showAdminToast("Portal settings updated.");
    });
  }

  // Profile/account update for both admin roles.
  const adminAccountForm = document.getElementById("adminAccountForm");
  if (adminAccountForm) {
    adminAccountForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = document.getElementById("settingsAdminName")?.value.trim();
      const newPassword = document.getElementById("settingsAdminPassword")?.value || "";

      if (!fullName) {
        showAdminToast("Admin name is required.");
        return;
      }

      const profilePayload = { full_name: fullName };
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update(profilePayload)
        .eq("id", currentUser.id);

      if (profileError) {
        showAdminToast(profileError.message);
        return;
      }

      if (newPassword) {
        const { error: pwdError } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (pwdError) {
          showAdminToast(pwdError.message);
          return;
        }
      }

      const { data: refreshed } = await supabaseClient
        .from("profiles")
        .select("id,role,barangay,full_name,email")
        .eq("id", currentUser.id)
        .maybeSingle();

      currentProfile = refreshed || currentProfile;
      renderAdminIdentity();
      const pwdInput = document.getElementById("settingsAdminPassword");
      if (pwdInput) pwdInput.value = "";

      showAdminToast(newPassword ? "Account and password updated." : "Account updated.");
    });
  }
}
function initCharts() {
  const docCtx = document.getElementById("adminDocChart");
  if (docCtx) {
    const monthly = lastSixMonths();
    const total = monthly.map((m) => docRequests.filter((r) => r.date.includes(m.label)).length);
    const completed = monthly.map((m) => docRequests.filter((r) => r.date.includes(m.label) && r.status === "Completed").length);

    new Chart(docCtx, {
      type: "bar",
      data: {
        labels: monthly.map((m) => m.label),
        datasets: [
          { label: "Document Requests", data: total, backgroundColor: "rgba(26, 58, 82, 0.8)", borderRadius: 8, borderSkipped: false },
          { label: "Completed", data: completed, backgroundColor: "rgba(212, 165, 116, 0.7)", borderRadius: 8, borderSkipped: false }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: "top" } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
  }

  const typeCtx = document.getElementById("adminTypeChart");
  if (typeCtx) {
    const typeMap = {
      "Barangay ID": 0,
      "Barangay Clearance": 0,
      "Job Seeker Cert.": 0,
      "Indigency Certificate": 0,
      "Residency Certificate": 0
    };

    docRequests.forEach((r) => {
      let t = "Job Seeker Cert.";
      const v = String(r.type || "").toLowerCase();
      if (v.includes("barangay id") || v === "id") t = "Barangay ID";
      else if (v.includes("clearance")) t = "Barangay Clearance";
      else if (v.includes("indigency")) t = "Indigency Certificate";
      else if (v.includes("residency")) t = "Residency Certificate";

      if (typeMap[t] !== undefined) {
        typeMap[t] += 1;
      }
    });

    const labels = Object.keys(typeMap);
    const values = Object.values(typeMap);
    const chartColors = ["#1a3a52", "#d4a574", "#4cde80", "#9b59b6", "#e67e22"];

    new Chart(typeCtx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 3, borderColor: "#fff" }]
      },
      options: { responsive: true, cutout: "65%", plugins: { legend: { position: "bottom" } } }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// ANALYTICS PANEL — Dedicated analytics view for admin dashboard
// ══════════════════════════════════════════════════════════════════════

let _anlChartsInited = false;
let _anlAnalyticsData = {
  docTrend: { labels: [], id: [], clearance: [], seeker: [], indigency: [], residency: [] },
  docType:  { labels: [], values: [] },
  skills:   { labels: [], values: [] },
  totals:   { residents: 0, docs: 0, workers: 0, issues: 0 }
};

async function loadAnalyticsPanelData() {
  if (!supabaseClient) return;

  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const scope = getScopedBarangay();
  const applyScope = (q) => (!isSuperAdmin() && scope) ? q.eq("barangay", scope) : q;
  const applyScopeName = (q) => (!isSuperAdmin() && scope) ? q.eq("name", scope) : q;

  const [docsRes, workersRes, profilesCount, docsCount, workersCount, issuesCount, barangaysRes] = await Promise.all([
    applyScope(supabaseClient.from("document_requests").select("request_type,created_at").gte("created_at", since.toISOString())),
    applyScope(supabaseClient.from("workers").select("service_category").eq("is_active", true)),
    applyScope(supabaseClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "resident")),
    applyScope(supabaseClient.from("document_requests").select("id", { count: "exact", head: true }).in("status", ["approved","completed","archived"])),
    applyScope(supabaseClient.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true)),
    applyScope(supabaseClient.from("issue_reports").select("id", { count: "exact", head: true }).neq("status", "resolved")),
    applyScopeName(supabaseClient.from("v_barangay_analytics").select("name,residents,docs,workers,status").order("name", { ascending: true }))
  ]);

  const docs   = docsRes.data   || [];
  const skills = workersRes.data || [];

  // Totals
  _anlAnalyticsData.totals = {
    residents: profilesCount.count || 0,
    docs:      docsCount.count     || 0,
    workers:   workersCount.count  || 0,
    issues:    issuesCount.count   || 0
  };

  // Monthly buckets
  const monthBuckets = anlMakeLastMonthBuckets(6);
  docs.forEach((row) => {
    const key = anlMonthKey(new Date(row.created_at));
    if (!monthBuckets[key]) return;
    const t = anlNormalizeDocType(row.request_type);
    if (t === "id")        monthBuckets[key].id        += 1;
    if (t === "clearance") monthBuckets[key].clearance += 1;
    if (t === "seeker")    monthBuckets[key].seeker    += 1;
    if (t === "indigency") monthBuckets[key].indigency += 1;
    if (t === "residency") monthBuckets[key].residency += 1;
  });

  _anlAnalyticsData.docTrend.labels    = Object.values(monthBuckets).map(m => m.label);
  _anlAnalyticsData.docTrend.id        = Object.values(monthBuckets).map(m => m.id);
  _anlAnalyticsData.docTrend.clearance = Object.values(monthBuckets).map(m => m.clearance);
  _anlAnalyticsData.docTrend.seeker    = Object.values(monthBuckets).map(m => m.seeker);
  _anlAnalyticsData.docTrend.indigency = Object.values(monthBuckets).map(m => m.indigency);
  _anlAnalyticsData.docTrend.residency = Object.values(monthBuckets).map(m => m.residency);

  // Type aggregation
  const typeAgg = { "Barangay ID": 0, "Barangay Clearance": 0, "Job Seeker Cert.": 0, "Indigency Certificate": 0, "Residency Certificate": 0 };
  docs.forEach((row) => {
    const t = anlNormalizeDocType(row.request_type);
    if (t === "id")        typeAgg["Barangay ID"]             += 1;
    if (t === "clearance") typeAgg["Barangay Clearance"]      += 1;
    if (t === "seeker")    typeAgg["Job Seeker Cert."]        += 1;
    if (t === "indigency") typeAgg["Indigency Certificate"]   += 1;
    if (t === "residency") typeAgg["Residency Certificate"]   += 1;
  });
  _anlAnalyticsData.docType.labels = Object.keys(typeAgg);
  _anlAnalyticsData.docType.values = Object.values(typeAgg);

  // Skills
  const skillMap = {};
  skills.forEach((row) => {
    const key = row.service_category || "Other";
    skillMap[key] = (skillMap[key] || 0) + 1;
  });
  const topSkills = Object.entries(skillMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  _anlAnalyticsData.skills.labels = topSkills.map(i => i[0]);
  _anlAnalyticsData.skills.values = topSkills.map(i => i[1]);

  // Barangay list
  _anlAnalyticsData.barangays = (barangaysRes.data || []).map(b => ({
    name:     b.name,
    residents: Number(b.residents || 0),
    docs:      Number(b.docs      || 0),
    workers:   Number(b.workers   || 0),
    status:    b.status || "pending"
  }));
}

function anlNormalizeDocType(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("clearance"))  return "clearance";
  if (s.includes("seeker") || s.includes("job")) return "seeker";
  if (s.includes("indigency"))  return "indigency";
  if (s.includes("residency"))  return "residency";
  return "id";
}

function anlMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function anlMakeLastMonthBuckets(count) {
  const now = new Date();
  const buckets = {};
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = anlMonthKey(d);
    const label = d.toLocaleDateString("en-US", { month: "short" });
    buckets[key] = { label, id: 0, clearance: 0, seeker: 0, indigency: 0, residency: 0 };
  }
  return buckets;
}

async function renderAnalyticsPanel() {
  // Stat cards
  setText("anlStatResidents", String(barangays.reduce((s, b) => s + (b.users || 0), 0) || docRequests.length && 0 || "—"));
  setText("anlStatDocs",      String(docRequests.length));
  setText("anlStatWorkers",   String(workersRegistry.length));
  setText("anlStatIssues",    String(issueReports.filter(r => r.status !== "Completed").length));

  // Use real counts if available from Supabase (load on demand)
  if (supabaseClient && !_anlChartsInited) {
    try {
      await loadAnalyticsPanelData();
      // Now update stat cards with accurate counts
      setText("anlStatResidents", String(_anlAnalyticsData.totals.residents));
      setText("anlStatDocs",      String(_anlAnalyticsData.totals.docs));
      setText("anlStatWorkers",   String(_anlAnalyticsData.totals.workers));
      setText("anlStatIssues",    String(_anlAnalyticsData.totals.issues));

      // Update legacy trends
      document.getElementById("anlStatResidentsTrend").innerHTML = `<i class="fas fa-arrow-up"></i> ${_anlAnalyticsData.totals.residents} this month`;
      document.getElementById("anlStatDocsTrend").innerHTML = `<i class="fas fa-arrow-up"></i> ${_anlAnalyticsData.totals.docs} this month`;
      document.getElementById("anlStatWorkersTrend").innerHTML = `<i class="fas fa-arrow-up"></i> ${_anlAnalyticsData.totals.workers} this month`;
      document.getElementById("anlStatIssuesTrend").innerHTML = `<i class="fas fa-arrow-up"></i> ${_anlAnalyticsData.totals.issues} pending`;


      // Barangay coverage table
      renderAnlBarangayTable();
      // Charts
      initAnalyticsCharts();
      _anlChartsInited = true;
    } catch(e) {
      console.warn("Analytics panel data load failed:", e);
    }
  } else if (_anlChartsInited) {
    // Already loaded — just refresh the table
    renderAnlBarangayTable();
  }

  // Update role context label
  const ctx = document.getElementById("analyticsRoleContext");
  if (ctx) ctx.textContent = isSuperAdmin() ? "City-Wide" : (getScopedBarangay() || "Barangay");

  // Update dynamic scope labels
  const covSub = document.getElementById("anlCoverageSub");
  const scopeChip = document.getElementById("anlScopeChip");
  if (isSuperAdmin()) {
    if (covSub) covSub.innerHTML = "All 24 barangays of Bi&ntilde;an City";
    if (scopeChip) scopeChip.textContent = "City-Wide Service Area";
  } else {
    const bName = getScopedBarangay() || "Your Barangay";
    if (covSub) covSub.textContent = `Filtered view for ${bName}`;
    if (scopeChip) scopeChip.textContent = `Primary Service Area: ${bName}`;
  }
}

function renderAnlBarangayTable() {
  const tbody = document.getElementById("anlBarangayTableBody");
  if (!tbody) return;

  const rows = _anlAnalyticsData.barangays || barangays;
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No barangay data available.</td></tr>`;
    return;
  }

  const statusColors = { active: "#27ae60", pending: "#f39c12", soon: "#3498db" };
  const statusLabel  = { active: "Live", pending: "Pending", soon: "Coming Soon" };

  tbody.innerHTML = rows.map(b => {
    const sc = b.status || "pending";
    const color = statusColors[sc] || statusColors.pending;
    const label = statusLabel[sc]  || "Pending";
    return `<tr>
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${Number(b.residents || b.users || 0).toLocaleString()}</td>
      <td>${Number(b.docs || 0).toLocaleString()}</td>
      <td>${Number(b.workers || 0).toLocaleString()}</td>
      <td><span class="status-pill" style="background:${color}22;color:${color}">${label}</span></td>
    </tr>`;
  }).join("");
}

let _anlChartInstances = {};

function initAnalyticsCharts() {
  // Destroy previous instances to avoid canvas reuse errors
  Object.values(_anlChartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  _anlChartInstances = {};

  const d = _anlAnalyticsData;
  const trendLabels = d.docTrend.labels.length ? d.docTrend.labels : ["-","-","-","-","-","-"];

  // Line chart — document request trends
  const tCtx = document.getElementById("anlDocTrendChart");
  if (tCtx) {
    _anlChartInstances.trend = new Chart(tCtx, {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          { label: "Barangay ID",      data: d.docTrend.id,        borderColor: "#d4a574", backgroundColor: "rgba(212,165,116,0.08)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Barangay Clearance",data: d.docTrend.clearance, borderColor: "#5dade2", backgroundColor: "rgba(93,173,226,0.07)",  fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Job Seeker Cert.", data: d.docTrend.seeker,    borderColor: "#4cde80", backgroundColor: "rgba(76,222,128,0.07)",  fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Indigency Cert.",  data: d.docTrend.indigency, borderColor: "#9b59b6", backgroundColor: "rgba(155,89,182,0.07)",  fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Residency Cert.",  data: d.docTrend.residency, borderColor: "#e67e22", backgroundColor: "rgba(230,126,34,0.07)",  fill: true, tension: 0.42, borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "rgba(30,45,61,0.8)", boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { color: "rgba(30,45,61,0.6)" } }, x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { color: "rgba(30,45,61,0.6)" } } }
      }
    });
  }

  // Doughnut chart — request types
  const dCtx = document.getElementById("anlDocTypeChart");
  if (dCtx) {
    const chartColors = ["#d4a574","#5dade2","#4cde80","#9b59b6","#e67e22"];
    const labels = d.docType.labels.length ? d.docType.labels : ["Barangay ID","Barangay Clearance","Job Seeker Cert.","Indigency Certificate","Residency Certificate"];
    const values = d.docType.values.length ? d.docType.values : [0,0,0,0,0];

    _anlChartInstances.donut = new Chart(dCtx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 2, borderColor: "#ffffff" }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false } } }
    });

    const total = values.reduce((acc, n) => acc + n, 0) || 1;
    const legend = document.getElementById("anlDocTypeLegend");
    if (legend) {
      legend.innerHTML = labels.map((label, idx) => {
        const pct = Math.round((values[idx] / total) * 100);
        const color = chartColors[idx % chartColors.length];
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="color:rgba(30,45,61,0.7);flex:1">${label}</span><span style="color:#1e293b;font-weight:700">${pct}%</span></div>`;
      }).join("");
    }
  }

  // Bar chart — skills
  const sCtx = document.getElementById("anlSkillsChart");
  if (sCtx) {
    _anlChartInstances.skills = new Chart(sCtx, {
      type: "bar",
      data: {
        labels: d.skills.labels.length ? d.skills.labels : ["No Data"],
        datasets: [{ label: "Workers", data: d.skills.values.length ? d.skills.values : [0], backgroundColor: "rgba(212,165,116,0.75)", borderRadius: 7, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: "rgba(30,45,61,0.6)" } }, y: { grid: { color: "rgba(0,0,0,0.05)" }, beginAtZero: true, ticks: { color: "rgba(30,45,61,0.6)" } } }
      }
    });
  }
}

function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add("show");
  overlay.style.display = "flex";
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove("show");
  overlay.style.display = "none";
}

function openAddAnnouncementModal() {
  document.getElementById("addAnnouncementForm")?.reset();

  const barangayField = document.getElementById("annBarangay");
  if (barangayField) {
    if (isBarangayAdmin()) {
      barangayField.innerHTML = `<option value="${escapeHtml(getScopedBarangay())}">${escapeHtml(getScopedBarangay())}</option>`;
      barangayField.value = getScopedBarangay();
      barangayField.setAttribute("disabled", "disabled");
    } else {
      barangayField.removeAttribute("disabled");
    }
  }

  openModal("addAnnouncementModalOverlay");
}

document.querySelectorAll(".admin-modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

let toastTimer = null;
function showAdminToast(msg) {
  const toast = document.getElementById("adminToast");
  const msgEl = document.getElementById("adminToastMsg");
  if (!toast || !msgEl) return;

  msgEl.textContent = msg;
  toast.classList.remove("d-none");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("d-none"), 3500);
}


function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatRoleLabel(role) {
  const value = String(role || "resident").toLowerCase();
  if (value === "super_admin") return "Super Admin";
  if (value === "barangay_admin") return "Barangay Admin";
  return "Resident";
}

function parseName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/);
  return { first: parts[0] || "Resident", last: parts.slice(1).join(" ") };
}

function mapDocStatus(status) {
  const v = String(status || "").toLowerCase();
  if (v === "submitted" || v === "pending") return "Pending";
  if (v === "reviewing" || v === "processing") return "Processing";
  if (v === "approved") return "Approved";
  if (v === "completed" || v === "archived") return "Archived";
  if (v === "rejected") return "Rejected";
  return "Pending";
}

function mapReportStatus(status) {
  const v = String(status || "").toLowerCase();
  if (v === "processing") return "Processing";
  if (v === "resolved") return "Completed";
  return "Pending";
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function lastSixMonths() {
  const arr = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({ label: d.toLocaleDateString("en-US", { month: "short" }) });
  }
  return arr;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Escapes values for safe use inside HTML attribute strings (single-quote delimited onclick args).
function escapeAttr(value) {
  return String(value || "").replaceAll("'", "\\'").replaceAll('"', "&quot;");
}

// ══════════════════════════════════════════════════════════════════════
// DOCUMENT TEMPLATES — load, render, upload, delete
// ══════════════════════════════════════════════════════════════════════

async function loadDocTemplates() {
  let query = supabaseClient
    .from("document_templates")
    .select("id,barangay_id,barangay_name,document_type,template_file_url,template_file_path,template_file_name,created_at")
    .order("created_at", { ascending: false });

  if (isBarangayAdmin()) {
    query = query.eq("barangay_name", getScopedBarangay());
  }

  const { data, error } = await query;
  if (error) {
    // Silently ignore if table doesn't exist yet
    const msg = String(error.message || "").toLowerCase();
    if (!msg.includes("document_templates")) showAdminToast(error.message);
    docTemplates = [];
    return;
  }
  docTemplates = data || [];

  // For super admin: populate and show the barangay selector
  if (isSuperAdmin()) {
    initDocTemplateBarangayFilter();
  }
}

function initDocTemplateBarangayFilter() {
  const sel = document.getElementById("doctplBarangayFilter");
  const uploadBtn = document.getElementById("doctplUploadBtn");
  if (!sel) return;

  // Collect unique barangay names from loaded templates + master barangays list
  const fromTemplates = docTemplates.map(t => t.barangay_name).filter(Boolean);
  const fromList = barangays.map(b => b.name).filter(Boolean);
  const allNames = [...new Set([...fromList, ...fromTemplates])].sort();

  const currentVal = sel.value;
  sel.innerHTML = `<option value="">— Select a Barangay —</option>` +
    allNames.map(n => `<option value="${escapeHtml(n)}"${n === currentVal ? " selected" : ""}>${escapeHtml(n)}</option>`).join("");

  sel.style.display = "block";

  // Lock upload button until a barangay is chosen
  const chosen = sel.value;
  if (uploadBtn) uploadBtn.style.display = chosen ? "" : "none";
}

function renderDocTemplatesPanel() {
  const grid = document.getElementById("docTemplatesGrid");
  if (!grid) return;

  const typeFilter = document.getElementById("doctplTypeFilter")?.value || "";
  const uploadBtn = document.getElementById("doctplUploadBtn");

  // ── Determine which barangay to display ──────────────────────────────
  let scopedBarangay;
  if (isBarangayAdmin()) {
    scopedBarangay = getScopedBarangay();
  } else if (isSuperAdmin()) {
    // Super admin must pick a barangay from the dropdown
    scopedBarangay = document.getElementById("doctplBarangayFilter")?.value || "";
    if (uploadBtn) uploadBtn.style.display = scopedBarangay ? "" : "none";
    if (!scopedBarangay) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
        <i class="fas fa-building" style="font-size:32px;margin-bottom:12px;display:block;"></i>
        <strong>Select a barangay above</strong> to view and manage its document templates.
      </div>`;
      return;
    }
  }

  // Group templates by document type for display
  const docTypes = [
    "Barangay Clearance",
    "Barangay ID",
    "Job Seeker Cert.",
    "Indigency Certificate",
    "Residency Certificate"
  ];

  const typesToShow = typeFilter ? [typeFilter] : docTypes;

  // Always filter by the resolved scopedBarangay
  const scopedTemplates = docTemplates.filter(t => t.barangay_name === scopedBarangay);

  grid.innerHTML = typesToShow.map(docType => {
    const tpl = scopedTemplates.find(t => t.document_type === docType);
    const typeColor = {
      "Barangay Clearance": "#1a3a52",
      "Barangay ID": "#2c5282",
      "Job Seeker Cert.": "#276749",
      "Indigency Certificate": "#744210",
      "Residency Certificate": "#553c9a"
    }[docType] || "#1a3a52";

    if (tpl) {
      return `
      <div class="doc-template-card has-template">
        <div class="doc-template-type-bar" style="background:${typeColor}">
          <i class="fas fa-file-word"></i>
          <span>${escapeHtml(docType)}</span>
        </div>
        <div class="doc-template-body">
          <div class="doc-template-filename"><i class="fas fa-file-alt" style="color:${typeColor};margin-right:6px"></i>${escapeHtml(tpl.template_file_name || "template.docx")}</div>
          ${!isBarangayAdmin() ? `<div class="doc-template-brgy"><i class="fas fa-map-marker-alt" style="color:var(--text-muted);margin-right:4px"></i>${escapeHtml(tpl.barangay_name)}</div>` : ""}
          <div class="doc-template-date"><i class="fas fa-calendar-alt" style="color:var(--text-muted);margin-right:4px"></i>Uploaded ${formatDate(new Date(tpl.created_at))}</div>
        </div>
        <div class="doc-template-actions">
          <a class="tbl-btn tbl-btn-view" href="${escapeHtml(tpl.template_file_url)}" target="_blank" title="Download template">
            <i class="fas fa-download"></i> Download
          </a>
          <button class="tbl-btn tbl-btn-edit" onclick="openUploadTemplateModal('${escapeAttr(docType)}','${escapeAttr(tpl.barangay_name)}')" title="Replace template">
            <i class="fas fa-arrows-rotate"></i> Replace
          </button>
          <button class="tbl-btn tbl-btn-delete" onclick="deleteDocTemplate('${escapeAttr(tpl.id)}','${escapeAttr(tpl.template_file_path || '')}')" title="Delete template">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
    } else {
      const safeType = escapeAttr(docType);
      return `
      <div class="doc-template-card no-template">
        <div class="doc-template-type-bar" style="background:${typeColor}">
          <i class="fas fa-file-word"></i>
          <span>${escapeHtml(docType)}</span>
        </div>
        <div class="doc-template-body">
          <div class="doc-template-empty">
            <i class="fas fa-cloud-upload-alt" style="font-size:22px;color:#cbd5e0;margin-bottom:8px"></i>
            <p>No template uploaded yet</p>
          </div>
        </div>
        <div class="doc-template-actions">
          <button class="tbl-btn tbl-btn-approve" onclick="openUploadTemplateModal('${safeType}','${escapeAttr(isBarangayAdmin() ? scopedBarangay : '')}')">
            <i class="fas fa-upload"></i> Upload Template
          </button>
        </div>
      </div>`;
    }
  }).join("");
}

function openUploadTemplateModal(presetDocType = "", presetBarangay = "") {
  // Reset form
  const docTypeEl = document.getElementById("tplDocType");
  const barangayEl = document.getElementById("tplBarangaySelect");
  const fileNameEl = document.getElementById("tplFileName");
  const fileInput = document.getElementById("tplFileInput");
  const docTypeErr = document.getElementById("tplDocTypeError");

  // If no preset barangay was passed, infer it from context
  if (!presetBarangay) {
    if (isBarangayAdmin()) {
      presetBarangay = getScopedBarangay();
    } else if (isSuperAdmin()) {
      presetBarangay = document.getElementById("doctplBarangayFilter")?.value || "";
    }
  }
  const brgyErr = document.getElementById("tplBarangayError");
  const fileErr = document.getElementById("tplFileError");

  if (fileInput) fileInput.value = "";
  if (fileNameEl) fileNameEl.textContent = "";
  if (docTypeErr) docTypeErr.textContent = "";
  if (brgyErr) brgyErr.textContent = "";
  if (fileErr) fileErr.textContent = "";

  // Populate barangay options
  if (barangayEl) {
    if (isBarangayAdmin()) {
      const b = getScopedBarangay();
      barangayEl.innerHTML = `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
      barangayEl.value = b;
      barangayEl.setAttribute("disabled", "disabled");
    } else {
      const opts = barangays.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join("");
      barangayEl.innerHTML = `<option value="">Select barangay...</option>${opts}`;
      barangayEl.removeAttribute("disabled");
      if (presetBarangay) barangayEl.value = presetBarangay;
    }
  }

  if (docTypeEl && presetDocType) docTypeEl.value = presetDocType;

  openModal("uploadTemplateModalOverlay");
}

function onTemplateFileSelected(input) {
  const file = input.files[0];
  const fileNameEl = document.getElementById("tplFileName");
  const fileErr = document.getElementById("tplFileError");

  if (!file) {
    if (fileNameEl) fileNameEl.textContent = "";
    return;
  }

  if (!file.name.endsWith(".docx")) {
    if (fileErr) fileErr.textContent = "Only .docx files are supported.";
    input.value = "";
    if (fileNameEl) fileNameEl.textContent = "";
    return;
  }

  if (fileErr) fileErr.textContent = "";
  if (fileNameEl) fileNameEl.textContent = "✓ " + file.name;
}

async function handleTemplateUpload() {
  const docType = document.getElementById("tplDocType")?.value;
  const barangayName = document.getElementById("tplBarangaySelect")?.value;
  const fileInput = document.getElementById("tplFileInput");
  const file = fileInput?.files[0];
  let valid = true;

  document.getElementById("tplDocTypeError").textContent = "";
  document.getElementById("tplBarangayError").textContent = "";
  document.getElementById("tplFileError").textContent = "";

  if (!docType) { document.getElementById("tplDocTypeError").textContent = "Please select a document type."; valid = false; }
  if (!barangayName) { document.getElementById("tplBarangayError").textContent = "Please select a barangay."; valid = false; }
  if (!file) { document.getElementById("tplFileError").textContent = "Please select a .docx file."; valid = false; }
  if (!valid) return;

  const uploadBtn = document.getElementById("tplUploadBtn");
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; }

  // Find barangay record
  const brgyRecord = barangays.find(b => b.name === barangayName);
  if (!brgyRecord) {
    showAdminToast("Barangay not found in database.");
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Save'; }
    return;
  }

  // Upload file to Supabase Storage
  const safeType = docType.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const safeBrgy = barangayName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filePath = `${safeBrgy}/${safeType}.docx`;

  const { error: storageError } = await supabaseClient.storage
    .from("document-templates")
    .upload(filePath, file, { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

  if (storageError) {
    showAdminToast("Upload failed: " + storageError.message);
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Save'; }
    return;
  }

  // Get public URL
  const { data: urlData } = supabaseClient.storage.from("document-templates").getPublicUrl(filePath);
  const publicUrl = urlData?.publicUrl || "";

  // Upsert record in document_templates table
  const { error: dbError } = await supabaseClient
    .from("document_templates")
    .upsert({
      barangay_id: brgyRecord.id,
      barangay_name: barangayName,
      document_type: docType,
      template_file_url: publicUrl,
      template_file_path: filePath,
      template_file_name: file.name,
      created_by: currentUser.id
    }, { onConflict: "barangay_id,document_type" });

  if (dbError) {
    showAdminToast("DB save failed: " + dbError.message);
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Save'; }
    return;
  }

  await loadDocTemplates();
  renderDocTemplatesPanel();
  closeModal("uploadTemplateModalOverlay");
  showAdminToast(`Template for "${docType}" uploaded successfully.`);

  if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Save'; }
}

async function deleteDocTemplate(templateId, filePath) {
  if (!confirm("Delete this template? This action cannot be undone.")) return;

  // Delete from Storage if path is known
  if (filePath) {
    await supabaseClient.storage.from("document-templates").remove([filePath]);
  }

  const { error } = await supabaseClient
    .from("document_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadDocTemplates();
  renderDocTemplatesPanel();
  showAdminToast("Template deleted.");
}

// ══════════════════════════════════════════════════════════════════════
// PROCESS FLOW — markAsProcessing, openFillDocModal, generateFilledDocx
// ══════════════════════════════════════════════════════════════════════

async function markAsProcessing(docId) {
  const now = new Date().toISOString();
  const { error } = await supabaseClient
    .from("document_requests")
    .update({ status: "reviewing", processed_at: now })
    .eq("id", docId);

  if (error) { showAdminToast(error.message); return; }

  await loadDocRequests();
  renderAllPanels();
  showAdminToast("Request moved to Processing. Resident notified on their dashboard.");
}

async function openFillDocModal(reqId, redownload = false) {
  const req = docRequests.find(r => String(r.id) === String(reqId));
  if (!req) { showAdminToast("Request not found."); return; }

  // Find matching template for this barangay + doc type
  const tpl = docTemplates.find(
    t => t.barangay_name === req.barangay && t.document_type === req.type
  );

  // Find barangay captain
  const brgy = barangays.find(b => b.name === req.barangay);
  const captainName = brgy?.captain && brgy.captain !== "-" ? brgy.captain : "";

  // Find resident profile for extra fields
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("full_name,phone,barangay,age")
    .eq("id", req.residentId)
    .maybeSingle();

  const dateObj = new Date();
  const day = dateObj.getDate();
  const month = dateObj.toLocaleDateString("en-PH", { month: "long" });
  const year = dateObj.getFullYear();
  const dayOrdinal = day + (day > 0 ? ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10] : '');
  const dateFormal = `${dayOrdinal} day of ${month}, ${year}`;
  const today = dateObj.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  fillDocContext = {
    reqId,
    barangay: req.barangay,
    docType: req.type,
    residentName: req.name,
    ref: req.ref,
    purpose: "",  // not stored in request — editable
    phone: profile?.phone || "",
    templateUrl: tpl?.template_file_url || null,
    templateFileName: tpl?.template_file_name || "",
    photoUrl: req.photo_url || null
  };

  // Populate header
  document.getElementById("fillDocResidentName").textContent = req.name;
  document.getElementById("fillDocType").textContent = req.type;
  document.getElementById("fillDocRef").textContent = req.ref;

  // Toggle resident photo display
  const photoWrap = document.getElementById("fillDocPhotoWrap");
  const photoImg = document.getElementById("fillDocPhotoImg");
  if (photoWrap && photoImg) {
    if (req.photo_url) {
      photoImg.src = req.photo_url;
      photoWrap.style.display = "flex";
    } else {
      photoWrap.style.display = "none";
      photoImg.src = "";
    }
  }
  document.getElementById("fillDocSubtitle").textContent =
    tpl ? `Template: ${tpl.template_file_name}` : "No template found — approve without document";

  const noTplDiv = document.getElementById("fillDocNoTemplate");
  const fieldsSection = document.getElementById("fillDocFieldsSection");
  const downloadBtn = document.getElementById("fillDocDownloadBtn");

  if (!tpl) {
    // No template — show warning, hide fields + download
    if (noTplDiv) { noTplDiv.style.display = "block"; document.getElementById("fillDocNoTplBarangay").textContent = req.barangay; }
    if (fieldsSection) fieldsSection.style.display = "none";
    if (downloadBtn) downloadBtn.style.display = "none";
  } else {
    if (noTplDiv) noTplDiv.style.display = "none";
    if (fieldsSection) fieldsSection.style.display = "block";
    if (downloadBtn) downloadBtn.style.display = "";

    // Build editable fields grid
    const fields = [
      { key: "resident_name",  label: "Resident Name",    value: req.name, readonly: true },
      { key: "age",            label: "Age",              value: profile?.age || "" },
      { key: "date_today",     label: "Date",              value: today, readonly: true },
      { key: "date_formal",    label: "Formal Date",       value: dateFormal, readonly: true },
      { key: "day_ordinal",    label: "Day (Ordinal)",     value: dayOrdinal, readonly: true },
      { key: "month",          label: "Month",             value: month, readonly: true },
      { key: "year",           label: "Year",              value: String(year), readonly: true },
      { key: "barangay_name",  label: "Barangay",          value: req.barangay, readonly: true },
      { key: "captain_name",   label: "Barangay Captain",  value: captainName, readonly: true },
      { key: "purpose",        label: "Purpose",           value: req.purpose || "", readonly: true },
      { key: "ref_no",         label: "Reference No.",     value: req.ref, readonly: true },
      { key: "address",        label: "Address",           value: req.address || profile?.barangay || req.barangay, readonly: true },
      { key: "phone",          label: "Phone",             value: profile?.phone || "" },
      { key: "document_type",  label: "Document Type",     value: req.type, readonly: true },
      { key: "photo_url",      label: "Photo URL",         value: req.photo_url || "", readonly: true }
    ];

    const grid = document.getElementById("fillDocFieldsGrid");
    if (grid) {
      grid.innerHTML = fields.map(f => `
        <div class="fill-doc-field-row">
          <label class="fill-doc-field-label">${escapeHtml(f.label)}</label>
          <input type="text" class="admin-input fill-doc-field-input"
                 data-key="${escapeHtml(f.key)}"
                 value="${escapeHtml(f.value)}"
                 placeholder="${escapeHtml(f.label)}"
                 ${f.readonly ? 'readonly style="background-color: #f1f3f4; color: #7f8c8d; cursor: not-allowed; opacity: 0.8;"' : ''}>
        </div>
      `).join("");
    }
  }

  // Show/hide approve & reject buttons based on mode
  const approveBtn = document.getElementById("fillDocApproveBtn");
  const rejectBtn  = document.getElementById("fillDocRejectBtn");
  const alreadyApprovedBanner = document.getElementById("fillDocAlreadyApproved");

  if (redownload) {
    // Download-only mode: request already approved
    if (approveBtn) approveBtn.style.display = "none";
    if (rejectBtn)  rejectBtn.style.display  = "none";
    if (alreadyApprovedBanner) alreadyApprovedBanner.style.display = "flex";
  } else {
    if (approveBtn) approveBtn.style.display = "";
    if (rejectBtn)  rejectBtn.style.display  = "";
    if (alreadyApprovedBanner) alreadyApprovedBanner.style.display = "none";
  }

  openModal("fillDocModalOverlay");
}

function getFilledDocFields() {
  const inputs = document.querySelectorAll(".fill-doc-field-input");
  const data = {};
  inputs.forEach(inp => { data[inp.dataset.key] = inp.value || ""; });
  return data;
}

async function generateFilledDocx() {
  if (!fillDocContext.templateUrl) {
    showAdminToast("No template available for this document type.");
    return;
  }

  const btn = document.getElementById("fillDocDownloadBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'; }

  try {
    // 1. Download the template .docx (which is just a ZIP file), using a cache-buster
    const cacheBustedUrl = new URL(fillDocContext.templateUrl);
    cacheBustedUrl.searchParams.append("t", Date.now());
    const response = await fetch(cacheBustedUrl.toString());
    if (!response.ok) throw new Error("Could not download template file. Make sure the bucket is public.");
    const arrayBuffer = await response.arrayBuffer();

    // 2. Open the ZIP and read the main document XML
    const zip = new PizZip(arrayBuffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) throw new Error("Invalid .docx file: word/document.xml not found.");

    let xml = xmlFile.asText();

    // 3. Pre-process: Word sometimes splits {{ placeholder }} text across multiple
    //    XML <w:r> run elements (e.g. due to spell-check markers). This step
    //    collapses those splits so replacement works even on "damaged" templates.
    //    It removes any XML tags found between {{ and }} so the placeholder
    //    becomes a single plain string again.
    xml = xml.replace(/\{((?:<[^>]+>|\s)*)\{((?:[^{}]|<[^>]+>|\s)*?)\}((?:<[^>]+>|\s)*)\}/g, (match) => {
      return match.replace(/<[^>]+>|\s+/g, ""); // strip XML tags and spaces inside {{ }}
    });

    // 4. Replace each {{key}} with its XML-safe value
    const fieldValues = getFilledDocFields();
    Object.entries(fieldValues).forEach(([key, value]) => {
      const safe = String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      xml = xml.split(`{{${key}}}`).join(safe);
    });

    // 5. Write modified XML back and generate blob
    zip.file("word/document.xml", xml);
    const out = zip.generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    // 6. Trigger download via FileSaver
    const safeType = fillDocContext.docType.replace(/[^a-z0-9]/gi, "_");
    const safeRef  = fillDocContext.ref;
    saveAs(out, `${safeType}_${safeRef}_filled.docx`);
    showAdminToast("Document downloaded successfully!");

  } catch (err) {
    showAdminToast("Error generating document: " + err.message);
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Download .docx'; }
  }
}

async function approveFromFillModal() {
  if (!fillDocContext.reqId) return;
  const { error } = await supabaseClient
    .from("document_requests")
    .update({ status: "approved" })
    .eq("id", fillDocContext.reqId);

  if (error) { showAdminToast(error.message); return; }

  closeModal("fillDocModalOverlay");
  await loadDocRequests();
  renderAllPanels();
  showAdminToast("Request approved.");
}

async function rejectFromFillModal() {
  if (!fillDocContext.reqId) return;
  if (!confirm("Reject this document request?")) return;

  const { error } = await supabaseClient
    .from("document_requests")
    .update({ status: "rejected" })
    .eq("id", fillDocContext.reqId);

  if (error) { showAdminToast(error.message); return; }

  closeModal("fillDocModalOverlay");
  await loadDocRequests();
  renderAllPanels();
  showAdminToast("Request rejected.");
}

/**
 * Binds form submit events that cannot use inline onsubmit attributes
 * (because the handler functions are defined after DOMContentLoaded).
 * Called early during bootstrap so the forms are ready before data loads.
 */
function initAdminInviteHandlers() {
  // Create Admin Invite form
  document.getElementById("createInviteForm")
    ?.addEventListener("submit", submitCreateInvite);

  // Any other forms that need JS binding can be added here.
}






































// ══════════════════════════════════════════════════════════════════════
// PROCESSING TIME HELPERS — super admin document monitor
// ══════════════════════════════════════════════════════════════════════

/**
 * Converts milliseconds into a human-readable "Xh Ym" or "Zm" string.
 */
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 1) return "< 1 min";
  const hours = Math.floor(totalMins / 60);
  const mins  = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0)              return `${hours}h`;
  return `${mins}m`;
}

/**
 * Formats a Date into a short time string like "9:00 AM".
 */
function fmtTime(date) {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Builds the timing badge HTML for the super admin document monitor.
 * Shows the time range from Process → Message and the elapsed duration.
 *
 * Possible states:
 *  - Neither processed nor notified  → "Not yet processed"
 *  - Processed but not notified yet  → "Processing since HH:MM AM"
 *  - Both timestamps present         → "HH:MM AM → HH:MM AM (1h 5m)"
 */
function buildTimingBadge(processedAt, notifiedAt) {
  // Not yet started
  if (!processedAt) {
    return `<span class="timing-badge timing-none">
              <i class="fas fa-clock"></i> Not yet processed
            </span>`;
  }

  const pTime = new Date(processedAt);
  const pStr  = fmtTime(pTime);

  // Processed but resident not yet notified
  if (!notifiedAt) {
    return `<span class="timing-badge timing-processing">
              <i class="fas fa-spinner fa-spin" style="font-size:10px"></i>
              Processing since <strong>${pStr}</strong>
            </span>`;
  }

  // Both timestamps — show full range
  const nTime    = new Date(notifiedAt);
  const nStr     = fmtTime(nTime);
  const duration = formatDuration(nTime - pTime);

  return `<div class="timing-badge timing-complete">
            <div class="timing-range">
              <span class="timing-time">${pStr}</span>
              <i class="fas fa-arrow-right timing-arrow"></i>
              <span class="timing-time">${nStr}</span>
            </div>
            <span class="timing-duration">${duration}</span>
          </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// SERVICE REQUESTS — Resident-Initiated Job Completion Verification
// ══════════════════════════════════════════════════════════════════════

window.serviceRequests = [];

async function loadServiceRequests() {
  const { data, error } = await supabaseClient
    .from("service_requests")
    .select("id,worker_id,resident_id,worker_name,resident_name,note,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (!msg.includes("does not exist") && !msg.includes("service_requests")) {
      showAdminToast("Service requests: " + error.message);
    }
    window.serviceRequests = [];
    return;
  }

  window.serviceRequests = (data || []).map((r) => ({
    id:           r.id,
    workerId:     r.worker_id,
    residentId:   r.resident_id,
    workerName:   r.worker_name || "Unknown Worker",
    residentName: r.resident_name || "Unknown Resident",
    note:         r.note || "-",
    status:       r.status,
    date:         r.created_at ? formatDate(new Date(r.created_at)) : "-"
  }));

  renderPendingVerifications();
  renderSidebarBadges();
}

function renderPendingVerifications() {
  const tbody = document.getElementById("pendingVerifBody");
  const badge = document.getElementById("pendingVerifBadge");
  if (!tbody) return;

  const pending = (window.serviceRequests || []).filter((r) => r.status === "pending");

  if (badge) {
    badge.textContent = String(pending.length);
    badge.style.display = pending.length > 0 ? "" : "none";
  }

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">
      <i class="fas fa-check-circle" style="color:#4cde80;margin-right:6px;"></i> No pending verifications
    </td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.residentName)}</strong></td>
      <td>${escapeHtml(r.workerName)}</td>
      <td style="max-width:200px;white-space:normal;font-size:12px;color:var(--text-muted);">${escapeHtml(r.note)}</td>
      <td style="color:var(--text-muted);font-size:12px;">${escapeHtml(r.date)}</td>
      <td style="display:flex;gap:6px;">
        <button class="tbl-btn tbl-btn-approve" onclick="approveServiceRequest('${r.id}','${r.workerId}','${r.residentId}')" title="Approve">
          <i class="fas fa-check"></i> Approve
        </button>
        <button class="tbl-btn tbl-btn-delete" onclick="rejectServiceRequest('${r.id}')" title="Reject">
          <i class="fas fa-times"></i> Reject
        </button>
      </td>
    </tr>
  `).join("");
}

async function approveServiceRequest(reqId, workerId, residentId) {
  if (!confirm("Approve this service request? The resident will be able to rate the worker.")) return;

  const { error: recErr } = await supabaseClient.from("service_records").upsert(
    { worker_id: workerId, resident_id: residentId, service_date: new Date().toISOString().split("T")[0], logged_by: currentUser.id },
    { onConflict: "worker_id,resident_id" }
  );
  if (recErr) { showAdminToast("Failed to create service record: " + recErr.message); return; }

  const { error: reqErr } = await supabaseClient
    .from("service_requests")
    .update({ status: "approved", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq("id", reqId);
  if (reqErr) { showAdminToast("Failed to update request: " + reqErr.message); return; }

  showAdminToast("Approved! The resident can now rate this worker.");
  await loadServiceRequests();
}

async function rejectServiceRequest(reqId) {
  if (!confirm("Reject this service request?")) return;

  const { error } = await supabaseClient
    .from("service_requests")
    .update({ status: "rejected", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq("id", reqId);
  if (error) { showAdminToast("Failed to reject: " + error.message); return; }

  showAdminToast("Request rejected.");
  await loadServiceRequests();
}










// ==========================================
// HEALTH CENTER SCHEDULES LOGIC
// ==========================================
let allHealthSchedules = [];

function populateHealthScheduleBarangays() {
  const sel = document.getElementById("hsBarangay");
  if (!sel) return;
  
  if (sel.options.length <= 1) {
    if (isBarangayAdmin()) {
      const brgy = getScopedBarangay();
      sel.innerHTML = `<option value="${brgy}" selected>${brgy}</option>`;
      sel.disabled = true;
    } else {
      const list = barangays.map(b => b.name);
      list.sort().forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        sel.appendChild(opt);
      });
    }
  }
}

async function loadHealthSchedules() {
  const tbody = document.getElementById("healthSchedulesTableBody");
  if (!tbody) return;

  if (!supabaseClient) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-dim);">Supabase not connected.</td></tr>';
    return;
  }

  try {
    let query = supabaseClient.from("health_schedules").select("*").order("sort_order", { ascending: true }).order("barangay", { ascending: true });
    
    // If regular barangay admin, only fetch their own
    if (isBarangayAdmin()) {
      query = query.eq("barangay", getScopedBarangay());
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    allHealthSchedules = data || [];
    renderHealthSchedules(allHealthSchedules);
  } catch (error) {
    console.error("Error loading health schedules:", error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #ef4444;">Failed to load schedules.</td></tr>';
  }
}

function renderHealthSchedules(list) {
  const tbody = document.getElementById("healthSchedulesTableBody");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 30px; color: var(--text-dim);">No schedules found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => {
    return `
      <tr>
        <td style="font-weight: 500;">${escapeHtml(item.barangay)}</td>
        <td style="color: var(--gold); font-weight: 500;">${escapeHtml(item.day_of_week)}</td>
        <td>${escapeHtml(item.activity)}</td>
        <td style="text-align: center;">
          <button class="btn-admin-danger" onclick="deleteHealthSchedule('${item.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterHealthSchedules() {
  const query = (document.getElementById("hsSearchInput")?.value || "").toLowerCase();
  if (!query) {
    renderHealthSchedules(allHealthSchedules);
    return;
  }
  const filtered = allHealthSchedules.filter(s => 
    s.barangay.toLowerCase().includes(query) || 
    s.day_of_week.toLowerCase().includes(query) || 
    s.activity.toLowerCase().includes(query)
  );
  renderHealthSchedules(filtered);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("healthScheduleForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const barangay = document.getElementById("hsBarangay").value;
      const day_of_week = document.getElementById("hsDayOfWeek").value;
      const activity = document.getElementById("hsActivity").value.trim();
      
      if (!barangay || !day_of_week || !activity) {
        showAdminToast("Please fill all fields.", "error");
        return;
      }
      
      // Simple sort_order logic (Monday=1, Sunday=7)
      const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
      const sort_order = days.indexOf(day_of_week) + 1;

      try {
        const { error } = await supabaseClient.from("health_schedules").insert({
          barangay, day_of_week, activity, sort_order
        });
        
        if (error) throw error;
        
        showAdminToast("Schedule added successfully!", "success");
        form.reset();
        loadHealthSchedules(); // Reload table
      } catch (err) {
        console.error("Add schedule error:", err);
        showAdminToast("Failed to add schedule: " + err.message, "error");
      }
    });
  }
});

window.deleteHealthSchedule = async function(id) {
  if (!confirm("Are you sure you want to delete this schedule entry?")) return;
  
  try {
    const { error } = await supabaseClient.from("health_schedules").delete().eq("id", id);
    if (error) throw error;
    
    showAdminToast("Schedule deleted.", "success");
    loadHealthSchedules(); // Reload table
  } catch (err) {
    console.error("Delete schedule error:", err);
    showAdminToast("Failed to delete schedule.", "error");
  }
};
