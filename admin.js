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

let barangays = [];
let usersData = [];
let docRequests = [];
let announcements = [];
let issueReports = [];
let workersRegistry = [];

// Admin bootstrap: secure gate -> data load -> panel render.
document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  setHeaderDate();
  initSidebarNav();
  initMobileSidebar();
  initFormHandlers();

  const allowed = await enforceAdminAccess();
  if (!allowed) return;

  await loadAdminData();
  renderAllPanels();
  initCharts();

  console.log("Binan City Hub - Admin Dashboard Initialized");
});

// Rejects non-admin users early to avoid exposing management UI/data.
async function enforceAdminAccess() {
  if (!supabaseClient) {
    showAdminToast("Supabase is not configured. Update supabase-config.js.");
    return false;
  }

  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  currentUser = user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id,role,barangay")
    .eq("id", user.id)
    .maybeSingle();

  currentProfile = profile;

  if (!profile || (profile.role !== "super_admin" && profile.role !== "barangay_admin")) {
    window.location.href = "index.html";
    return false;
  }

  return true;
}

// Loads all admin datasets concurrently for responsive dashboard startup.
async function loadAdminData() {
  await Promise.all([
    loadBarangays(),
    loadResidents(),
    loadDocRequests(),
    loadAnnouncements(),
    loadIssueReports(),
    loadWorkers()
  ]);
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
}

// Pulls resident profiles; barangay admins only see their own barangay scope.
async function loadResidents() {
  let query = supabaseClient
    .from("profiles")
    .select("id,full_name,email,phone,barangay,created_at,role")
    .eq("role", "resident")
    .order("created_at", { ascending: false })
    .limit(200);

  if (currentProfile?.role === "barangay_admin") {
    query = query.eq("barangay", currentProfile.barangay);
  }

  const { data } = await query;

  usersData = (data || []).map((u) => {
    const parsed = parseName(u.full_name);
    return {
      id: u.id,
      first: parsed.first,
      last: parsed.last,
      email: u.email,
      phone: u.phone || "-",
      barangay: u.barangay,
      registered: formatDate(new Date(u.created_at)),
      status: "active"
    };
  });
}

// Loads document requests and resolves resident names for table readability.
async function loadDocRequests() {
  let query = supabaseClient
    .from("document_requests")
    .select("id,resident_id,request_type,barangay,created_at,status")
    .order("created_at", { ascending: false })
    .limit(200);

  if (currentProfile?.role === "barangay_admin") {
    query = query.eq("barangay", currentProfile.barangay);
  }

  const { data } = await query;

  const residentIds = [...new Set((data || []).map((r) => r.resident_id).filter(Boolean))];
  const { data: profiles } = residentIds.length
    ? await supabaseClient.from("profiles").select("id,full_name").in("id", residentIds)
    : { data: [] };

  const nameMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));

  docRequests = (data || []).map((r) => ({
    id: r.id,
    ref: String(r.id).slice(0, 8).toUpperCase(),
    name: nameMap.get(r.resident_id) || "Resident",
    type: r.request_type,
    barangay: r.barangay,
    date: formatDate(new Date(r.created_at)),
    status: mapDocStatus(r.status)
  }));
}

// Super admin sees all; barangay admin sees City-Wide + assigned barangay announcements.
async function loadAnnouncements() {
  let query = supabaseClient
    .from("announcements")
    .select("id,title,category,barangay_scope,content,published_at")
    .order("published_at", { ascending: false })
    .limit(100);

  if (currentProfile?.role === "barangay_admin") {
    query = query.or(`barangay_scope.eq.City-Wide,barangay_scope.eq.${currentProfile.barangay}`);
  }

  const { data } = await query;

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
  let query = supabaseClient
    .from("issue_reports")
    .select("id,category,location,description,status,created_at,resident_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (currentProfile?.role === "barangay_admin") {
    query = query.eq("barangay", currentProfile.barangay);
  }

  const { data } = await query;

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
    date: formatDate(new Date(r.created_at)),
    status: mapReportStatus(r.status)
  }));
}

async function loadWorkers() {
  let query = supabaseClient
    .from("workers")
    .select("id,full_name,service_category,category,contact_phone,rating_avg,is_active,barangay")
    .order("full_name", { ascending: true })
    .limit(200);

  if (currentProfile?.role === "barangay_admin") {
    query = query.eq("barangay", currentProfile.barangay);
  }

  const { data } = await query;

  workersRegistry = (data || []).map((w) => ({
    id: w.id,
    name: w.full_name,
    specialty: w.service_category,
    category: w.category === "white-collar" ? "White Collar" : "Blue Collar",
    phone: w.contact_phone || "-",
    rating: Number(w.rating_avg || 0).toFixed(1),
    status: w.is_active ? "Active" : "Pending"
  }));
}

function renderAllPanels() {
  renderOverviewTable();
  renderBarangayTable();
  renderUsersTable();
  renderDocRequestsTable();
  renderIssueReportsTable();
  renderWorkersTable();
  renderAnnouncementsGrid();
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
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("panel-" + panelId)?.classList.add("active");

  document.querySelectorAll(".admin-nav-link").forEach((l) => l.classList.remove("active"));
  document.querySelector(`[data-panel="${panelId}"]`)?.classList.add("active");

  const titles = {
    overview: ["Overview", "Biñan City Hub Administrative Dashboard"],
    barangays: ["Barangays", "Manage and monitor all 24 barangays of Biñan City"],
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
        ${r.status === "Pending" ? `<button class="tbl-btn tbl-btn-approve" onclick="approveDoc('${r.id}')"><i class="fas fa-check"></i> Approve</button>` : ""}
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

  const filtered = filter
    ? usersData.filter((u) => `${u.first} ${u.last} ${u.email}`.toLowerCase().includes(filter.toLowerCase()))
    : usersData;

  tbody.innerHTML = filtered.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.first)} ${escapeHtml(u.last)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.barangay)}</td>
      <td>${escapeHtml(u.registered)}</td>
      <td>${statusPill("Active")}</td>
      <td>
        <button class="tbl-btn tbl-btn-view" onclick="showAdminToast('Viewing user ${escapeHtml(u.first)} ${escapeHtml(u.last)}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `).join("");

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

  tbody.innerHTML = filtered.map((r) => `
    <tr>
      <td><code style="font-size:11px;color:var(--accent-gold)">${r.ref}</code></td>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${escapeHtml(r.barangay)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${statusPill(r.status)}</td>
      <td style="display:flex;gap:5px;">
        ${r.status === "Pending" ? `<button class="tbl-btn tbl-btn-approve" onclick="approveDoc('${r.id}')"><i class="fas fa-check"></i> Approve</button>` : ""}
        <button class="tbl-btn tbl-btn-view"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `).join("");
}

function filterDocuments() {
  renderDocRequestsTable(
    document.getElementById("docTypeFilter").value,
    document.getElementById("docStatusFilter").value
  );
}

// Moves request status forward; policy-controlled in DB via RLS.
async function approveDoc(id) {
  const { error } = await supabaseClient
    .from("document_requests")
    .update({ status: "reviewing" })
    .eq("id", id);

  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadDocRequests();
  renderOverviewTable();
  renderDocRequestsTable();
  showAdminToast("Document request marked as processing.");
}

function renderIssueReportsTable() {
  const tbody = document.getElementById("issueReportsBody");
  if (!tbody) return;

  tbody.innerHTML = issueReports.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.description)}</td>
      <td>${escapeHtml(r.reporter)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${statusPill(r.status)}</td>
      <td>
        <button class="tbl-btn tbl-btn-view"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `).join("");
}

function renderWorkersTable() {
  const tbody = document.getElementById("workersAdminBody");
  if (!tbody) return;

  tbody.innerHTML = workersRegistry.map((w, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(w.name)}</strong></td>
      <td>${escapeHtml(w.specialty)}</td>
      <td>${escapeHtml(w.category)}</td>
      <td>${escapeHtml(w.phone)}</td>
      <td><span style="color:#f39c12">★</span> ${escapeHtml(w.rating)}</td>
      <td>${statusPill(w.status)}</td>
      <td><button class="tbl-btn tbl-btn-edit" onclick="showAdminToast('Worker management is available via database records.')"><i class="fas fa-pen"></i></button></td>
    </tr>
  `).join("");
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
  renderBarangayTable();
  showAdminToast("Barangay removed successfully.");
}

async function activateBarangay(id) {
  const { error } = await supabaseClient.from("barangays").update({ status: "active" }).eq("id", id);
  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadBarangays();
  renderBarangayTable();
  showAdminToast("Barangay activated successfully.");
}

async function deleteAnnouncement(id) {
  const { error } = await supabaseClient.from("announcements").delete().eq("id", id);
  if (error) {
    showAdminToast(error.message);
    return;
  }

  await loadAnnouncements();
  renderAnnouncementsGrid();
  showAdminToast("Announcement deleted.");
}

function openAddWorkerModal() {
  showAdminToast("Add worker via database insert is ready. UI form can be added next.");
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
      renderBarangayTable();
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
      renderBarangayTable();
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

      const scope = barangay === "All" ? "City-Wide" : barangay;
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
      renderAnnouncementsGrid();
      closeModal("addAnnouncementModalOverlay");
      showAdminToast("Announcement published successfully.");
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

function parseName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/);
  return { first: parts[0] || "Resident", last: parts.slice(1).join(" ") };
}

function mapDocStatus(status) {
  const v = String(status || "").toLowerCase();
  if (v === "submitted" || v === "pending") return "Pending";
  if (v === "reviewing" || v === "processing") return "Processing";
  if (v === "completed" || v === "approved") return "Completed";
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

