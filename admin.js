// =====================================
// BINAN CITY HUB - ADMIN DASHBOARD JS
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

// Admin bootstrap: secure gate -> role-aware UI -> scoped data load -> panel render.
document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  setHeaderDate();
  initSidebarNav();
  initMobileSidebar();
  initNotificationButton();
  initFormHandlers();

  const allowed = await enforceAdminAccess();
  if (!allowed) return;

  renderAdminIdentity();
  applyRoleScopedUI();

  await loadAdminData();
  renderSettingsFormValues();
  renderAllPanels();
  initCharts();

  console.log("Binan City Hub - Admin Dashboard Initialized");
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
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id,role,barangay,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  currentProfile = profile || null;
  currentRole = normalizeRole(metaRole || profile?.role);
  currentBarangayName = String(metaBarangay || profile?.barangay || "").trim();

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

  if (isSuperAdmin()) {
    setText("adminPanelSub", "City-Wide Controller · All 24 barangays");
    setText("roleModeTitle", "City-Wide Controller");
    setText("roleModeDesc", "Global operations across all barangays and system users.");
    if (roleLabel) roleLabel.textContent = "Super Admin";
    if (roleContext) roleContext.textContent = "City-Wide";
    if (usersHeading) usersHeading.textContent = "All System Users";
    if (docsHeading) docsHeading.textContent = "City-Wide Document Queue";
    if (annHeading) annHeading.textContent = "City-Wide News Hub";
    if (verifyHint) verifyHint.textContent = "Verification controls are available in Barangay Admin scope.";

    if (barangayNavItem) barangayNavItem.style.display = "";
    if (settingsNavItem) settingsNavItem.style.display = "";
    if (settingsPanel) settingsPanel.style.display = "";
    if (settingsCityCard) settingsCityCard.style.display = "";
    if (settingsPortalCard) settingsPortalCard.style.display = "";
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
    loadPortalSettings()
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
      .select("id,resident_id,request_type,barangay,created_at,status")
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
    date: formatDate(new Date(r.created_at)),
    status: mapDocStatus(r.status)
  }));
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
      .select("id,category,location,description,status,created_at,resident_id,barangay")
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
    status: mapReportStatus(r.status)
  }));
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
  renderBarangayTable();
  renderUsersTable();
  renderDocRequestsTable();
  renderIssueReportsTable();
  renderWorkersTable();
  renderAnnouncementsGrid();
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
  const pendingDocs = docRequests.filter((r) => r.status === "Pending" || r.status === "Processing").length;
  const pendingIssues = issueReports.filter((r) => r.status === "Pending" || r.status === "Processing").length;

  setText("navBarangayCount", String(barangays.length));
  setText("navDocPendingCount", String(pendingDocs));
  setText("navIssuePendingCount", String(pendingIssues));
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
    });
  });
}

function showPanel(panelId) {
  // Defense in depth: block direct function calls to restricted panels.
  if (isBarangayAdmin() && (panelId === "barangays" || panelId === "settings")) {
    panelId = "overview";
    showAdminToast("This section is available only to Super Admin accounts.");
  }

  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("panel-" + panelId)?.classList.add("active");

  document.querySelectorAll(".admin-nav-link").forEach((l) => l.classList.remove("active"));
  document.querySelector(`[data-panel="${panelId}"]`)?.classList.add("active");

  const titles = {
    overview: ["Overview", "Bi\u00f1an City Hub Administrative Dashboard"],
    barangays: ["Barangays", "Manage and monitor all 24 barangays of Bi\u00f1an City"],
    users: ["Users / Residents", "View and manage registered users"],
    documents: ["Document Requests", "Review and process document applications"],
    announcements: ["Announcements", "Manage official city and barangay announcements"],
    reports: ["Issue Reports", "Review community-submitted infrastructure reports"],
    workers: ["Workers Registry", "Manage the skilled worker directory"],
    settings: ["Settings", "System configuration and admin account"]
  };

  const title = titles[panelId] || ["Admin", ""];
  document.getElementById("adminPanelTitle").textContent = title[0];
  document.getElementById("adminPanelSub").textContent = title[1];

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

function renderOverviewTable() {
  const tbody = document.getElementById("overviewRequestsBody");
  if (!tbody) return;

  tbody.innerHTML = docRequests.slice(0, 5).map((r) => `
    <tr>
      <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${escapeHtml(r.barangay)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${statusPill(r.status)}</td>
      <td>
        ${r.status === "Pending" ? `<button class="tbl-btn tbl-btn-approve" onclick="setDocumentStatus('${r.id}','approved')"><i class="fas fa-check"></i> Approve</button>` : ""}
        <button class="tbl-btn tbl-btn-view" onclick="showAdminToast('Viewing request ${r.ref}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `).join("");
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

function renderUsersTable(filter = "") {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  const roleScoped = isSuperAdmin()
    ? usersData
    : usersData.filter((u) => u.role === "resident");

  const filtered = filter
    ? roleScoped.filter((u) => `${u.first} ${u.last} ${u.email}`.toLowerCase().includes(filter.toLowerCase()))
    : roleScoped;

  tbody.innerHTML = filtered.map((u, i) => {
    const fullName = `${escapeHtml(u.first)} ${escapeHtml(u.last)}`;
    const verifyAction = isBarangayAdmin() && !u.isVerified
      ? `<button class="tbl-btn tbl-btn-approve" onclick="verifyResident('${u.id}')"><i class="fas fa-check"></i> Verify</button>`
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
        ${verifyAction}
        <button class="tbl-btn tbl-btn-view" onclick="showAdminToast('Viewing user ${fullName}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>`;
  }).join("");

  const countEl = document.getElementById("userCount");
  if (countEl) countEl.textContent = `${filtered.length} users`;
}

function filterUsers() {
  renderUsersTable(document.getElementById("userSearch").value || "");
}

function renderDocRequestsTable(typeFilter = "", statusFilter = "") {
  const tbody = document.getElementById("docRequestsBody");
  if (!tbody) return;

  let filtered = [...docRequests];
  if (typeFilter) filtered = filtered.filter((r) => r.type === typeFilter);
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);

  tbody.innerHTML = filtered.map((r) => {
    const showQueueActions = isBarangayAdmin() || isSuperAdmin();
    const canProcess = ["Pending", "Processing"].includes(r.status);
    const canDelete = ["Approved", "Rejected", "Completed", "Archived"].includes(r.status);
    const safeId   = escapeAttr(r.id);
    const safeDoc  = escapeAttr(r.type);
    const safeName = escapeAttr(r.name);
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
        ${showQueueActions && canProcess ? `<button class="tbl-btn tbl-btn-approve" onclick="setDocumentStatus('${safeId}','approved')"><i class="fas fa-check"></i> Approve</button>` : ""}
        ${showQueueActions && canProcess ? `<button class="tbl-btn tbl-btn-delete" onclick="setDocumentStatus('${safeId}','rejected')"><i class="fas fa-xmark"></i> Reject</button>` : ""}
        ${showQueueActions ? `<button class="tbl-btn tbl-btn-view" onclick="setDocumentStatus('${safeId}','completed')"><i class="fas fa-box-archive"></i> Archive</button>` : ""}
        ${showQueueActions ? `<button class="tbl-btn tbl-btn-message" onclick="openMessageResidentModal('${safeId}','${safeDoc}','${safeName}','${safeEmail}','${safeStatus}')"><i class="fas fa-envelope"></i> Message</button>` : ""}
        ${showQueueActions && canDelete ? `<button class="tbl-btn tbl-btn-delete" onclick="deleteDocumentRequest('${safeId}')"><i class="fas fa-trash"></i> Delete</button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

function filterDocuments() {
  renderDocRequestsTable(
    document.getElementById("docTypeFilter").value,
    document.getElementById("docStatusFilter").value
  );
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
    Approved:  `Hi ${residentName},\n\nYour ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) has been APPROVED and is now ready for pick-up at the Barangay Hall.\n\nPlease bring a valid ID when claiming your document.\n\nThank you,\n${adminName}\nBiñan City Hub`,
    Rejected:  `Hi ${residentName},\n\nWe regret to inform you that your ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) could not be processed at this time.\n\nPlease visit the Barangay Hall for further assistance or resubmit with the required documents.\n\nThank you,\n${adminName}\nBiñan City Hub`,
    Pending:   `Hi ${residentName},\n\nYour ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}) is currently being reviewed. We will notify you once it is ready.\n\nThank you for your patience.\n\n${adminName}\nBiñan City Hub`,
    default:   `Hi ${residentName},\n\nThis is an update regarding your ${docName} request (Ref: ${String(docId).slice(0,8).toUpperCase()}).\n\n[Write your message here]\n\n${adminName}\nBiñan City Hub`
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
                  || `Update on your ${msgResidentContext.doc} request – Biñan City Hub`;
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
      // User request: "when the admin messages the user the track timeline will be in completed stage"
      // But we shouldn't mark "Rejected" documents as "Completed".
      if (msgResidentContext.status !== "Rejected" && msgResidentContext.status !== "rejected") {
        await supabaseClient.from("document_requests")
          .update({ status: "completed" })
          .eq("id", msgResidentContext.id);
      }
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
      : `${canDelete ? deleteBtn : `<button class="tbl-btn tbl-btn-view" onclick="showIssueDetails('${r.id}')"><i class="fas fa-eye"></i> View</button>`}`;

    return `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.description)}</td>
      <td>${escapeHtml(r.barangay || "-")}</td>
      <td>${escapeHtml(r.reporter)}</td>
      <td>${escapeHtml(r.date)}</td>
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
  document.getElementById("issueLocation").textContent = escapeHtml(issue.location || "-");
  document.getElementById("issueDescription").textContent = issue.description || "-";
  document.getElementById("issueBarangay").textContent = escapeHtml(issue.barangay || "-");
  document.getElementById("issueReporter").textContent = escapeHtml(issue.reporter || "-");
  document.getElementById("issueDate").textContent = escapeHtml(issue.date || "-");
  document.getElementById("issueStatus").textContent = escapeHtml(issue.status || "-");

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
    </tr>
  `).join("");
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

      const scope = isBarangayAdmin() ? getScopedBarangay() : (barangay === "All" ? "City-Wide" : barangay);
      const { error } = await supabaseClient.from("announcements").insert({
        title,
        category,
        barangay_scope: scope,
        content,
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
    const typeMap = {};
    docRequests.forEach((r) => { typeMap[r.type] = (typeMap[r.type] || 0) + 1; });

    const labels = Object.keys(typeMap);
    const values = Object.values(typeMap);

    new Chart(typeCtx, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["No Data"],
        datasets: [{ data: values.length ? values : [1], backgroundColor: ["#1a3a52", "#d4a574", "#2c5282", "#4cde80"], borderWidth: 3, borderColor: "#fff" }]
      },
      options: { responsive: true, cutout: "65%", plugins: { legend: { position: "bottom" } } }
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
























































