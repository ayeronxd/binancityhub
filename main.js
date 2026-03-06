// ============================================
// BINAN CITY HUB - MAIN.JS (Supabase-backed)
// ============================================
// Purpose:
// - Power the public + resident portal using direct Supabase queries (serverless).
// - Keep all dashboard numbers and lists database-driven (no static production arrays).
// Why this design:
// - Single source of truth (database) prevents stale UI values.
// - Role and ownership controls are enforced by RLS, not only by frontend checks.

const BCH_USER_KEY = "bch_user";
const BCH_WORKER_BROWSE_PREFIX = "bch_worker_browse_";

// Session user from Supabase Auth. Null means guest mode.
let currentUser = null;
let currentProfile = null;
let pendingAction = null;
let supabaseClient = null;

// Data stores hydrated from Supabase, then consumed by render functions.
let workersData = [];
let announcementsData = [];
let barangaysData = [];
let reportsData = [];
let userApplications = [];

let analyticsData = {
  totals: { residents: 0, docs: 0, workers: 0, unresolvedReports: 0 },
  docTrend: { labels: [], id: [], clearance: [], seeker: [] },
  docType: { labels: [], values: [] },
  skills: { labels: [], values: [] },
  kpiTrends: {
    residents: { cls: "neutral", icon: "minus", text: "No data yet" },
    docs: { cls: "neutral", icon: "minus", text: "No data yet" },
    workers: { cls: "neutral", icon: "minus", text: "No data yet" },
    issues: { cls: "neutral", icon: "minus", text: "No data yet" }
  }
};

// Boot order intentionally loads auth first, then data, then renders.
document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.getBchSupabaseClient ? window.getBchSupabaseClient() : null;

  setupTopbarScroll();
  setupHamburger();
  setupTabNav();
  setupWorkerFilters();
  setupReportForm();
  setupApplyForm();
  setupProfileForm();
  setupStatusBarClock();

  await initAuthState();
  checkUrlHash();
  await loadPortalData();
  populateWorkerFilters();

  animateCounters();
  renderAnalyticsCharts();
  renderBarangayTable();
  renderTopWorkersSidebar();
  renderAnnouncementsSidebar();
  renderAnnouncementsPage();
  renderReportsTable();
  renderWorkers(workersData);
  updateWorkerCount(workersData.length);

  if (currentUser) {
    await loadUserApplications();
    renderUserApplications();
    renderPortalAnnouncementsMini();
    renderDocRecentApps();
    renderPortalStatCards();
  }
});

// Resolves current session and profile to decide guest vs authenticated UI state.
async function initAuthState() {
  if (!supabaseClient) {
    // Fallback for local development while keys are not set.
    try {
      const stored = localStorage.getItem(BCH_USER_KEY);
      if (stored) {
        currentUser = JSON.parse(stored);
        applyLoggedInUI(currentUser);
      }
    } catch (_err) {
      localStorage.removeItem(BCH_USER_KEY);
    }
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data?.session?.user || null;

  if (!currentUser) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id,full_name,email,phone,barangay,barangay_name,role,created_at")
    .eq("id", currentUser.id)
    .maybeSingle();

  currentProfile = profile || null;
  const parsedName = parseFullName(profile?.full_name || currentUser.user_metadata?.full_name || "Resident");

  const resolvedBarangay = profile?.barangay_name || profile?.barangay || currentUser.user_metadata?.barangay_name || currentUser.user_metadata?.barangay || "Barangay Poblacion";
  const viewUser = {
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    email: profile?.email || currentUser.email,
    barangay: resolvedBarangay,
    memberSince: profile?.created_at
  };

  applyLoggedInUI(viewUser);
  closeLoginModal();
}

// Loads all portal modules in parallel for faster first render.
async function loadPortalData() {
  if (!supabaseClient) {
    workersData = [];
    announcementsData = [];
    barangaysData = [];
    reportsData = [];
    resetAnalyticsCountersToZero();
    showToast("Set Supabase credentials in supabase-config.js to load live data.");
    return;
  }

  await Promise.all([
    loadWorkers(),
    loadAnnouncements(),
    loadBarangaysAndMetrics(),
    loadIssueReports(),
    loadChartData()
  ]);
}

async function loadWorkers() {
  const { data } = await supabaseClient
    .from("workers")
    .select("id,full_name,service_category,category,barangay,contact_phone,contact_email,rating_avg,reviews_count,is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  workersData = (data || []).map((row) => ({
    id: row.id,
    name: row.full_name,
    specialty: row.service_category,
    barangay: row.barangay || "Unassigned",
    category: row.category || "blue-collar",
    phone: row.contact_phone || "N/A",
    email: row.contact_email || "N/A",
    rating: Number(row.rating_avg || 0),
    reviews: Number(row.reviews_count || 0)
  }));
}

async function loadAnnouncements() {
  const { data } = await supabaseClient
    .from("announcements")
    .select("id,title,content,category,barangay_scope,published_at")
    .order("published_at", { ascending: false })
    .limit(20);

  announcementsData = (data || []).map((a) => ({
    id: a.id,
    category: a.category || (a.barangay_scope || "General"),
    title: a.title,
    date: formatDate(new Date(a.published_at || Date.now())),
    content: a.content
  }));
}

// Aggregates top cards + barangay table from SQL view/table counts.
async function loadBarangaysAndMetrics() {
  const { previousStart, currentStart, nextStart } = monthBoundaries();

  const [
    barangaysRes,
    profilesCount,
    docsCount,
    workersCount,
    reportsCount,
    residentsCurrentMonth,
    residentsPreviousMonth,
    docsCurrentMonth,
    docsPreviousMonth,
    workersCurrentMonth,
    workersPreviousMonth,
    issuesCurrentMonth,
    issuesPreviousMonth
  ] = await Promise.all([
    supabaseClient.from("v_barangay_analytics").select("name,residents,docs,workers,status").order("name", { ascending: true }),
    supabaseClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "resident"),
    supabaseClient.from("document_requests").select("id", { count: "exact", head: true }).in("status", ["approved", "completed", "archived"]),
    supabaseClient.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseClient.from("issue_reports").select("id", { count: "exact", head: true }).neq("status", "resolved"),
    supabaseClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "resident").gte("created_at", currentStart.toISOString()).lt("created_at", nextStart.toISOString()),
    supabaseClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "resident").gte("created_at", previousStart.toISOString()).lt("created_at", currentStart.toISOString()),
    supabaseClient.from("document_requests").select("id", { count: "exact", head: true }).in("status", ["approved", "completed", "archived"]).gte("created_at", currentStart.toISOString()).lt("created_at", nextStart.toISOString()),
    supabaseClient.from("document_requests").select("id", { count: "exact", head: true }).in("status", ["approved", "completed", "archived"]).gte("created_at", previousStart.toISOString()).lt("created_at", currentStart.toISOString()),
    supabaseClient.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true).gte("created_at", currentStart.toISOString()).lt("created_at", nextStart.toISOString()),
    supabaseClient.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true).gte("created_at", previousStart.toISOString()).lt("created_at", currentStart.toISOString()),
    supabaseClient.from("issue_reports").select("id", { count: "exact", head: true }).gte("created_at", currentStart.toISOString()).lt("created_at", nextStart.toISOString()),
    supabaseClient.from("issue_reports").select("id", { count: "exact", head: true }).gte("created_at", previousStart.toISOString()).lt("created_at", currentStart.toISOString())
  ]);

  barangaysData = (barangaysRes.data || []).map((b) => ({
    name: b.name,
    residents: Number(b.residents || 0),
    docs: Number(b.docs || 0),
    workers: Number(b.workers || 0),
    status: b.status || "pending"
  }));

  analyticsData.totals = {
    residents: profilesCount.count || 0,
    docs: docsCount.count || 0,
    workers: workersCount.count || 0,
    unresolvedReports: reportsCount.count || 0
  };

  analyticsData.kpiTrends = {
    residents: buildMoMTrend(residentsCurrentMonth.count || 0, residentsPreviousMonth.count || 0),
    docs: buildMoMTrend(docsCurrentMonth.count || 0, docsPreviousMonth.count || 0),
    workers: buildMoMTrend(workersCurrentMonth.count || 0, workersPreviousMonth.count || 0),
    issues: buildMoMTrend(issuesCurrentMonth.count || 0, issuesPreviousMonth.count || 0, {
      lowerIsBetter: true,
      labelSuffix: "reports vs last month"
    })
  };

  setCounterTargetByIndex(0, analyticsData.totals.residents);
  setCounterTargetByIndex(1, analyticsData.totals.docs);
  setCounterTargetByIndex(2, analyticsData.totals.workers);
  setCounterTargetByIndex(3, analyticsData.totals.unresolvedReports);
  renderAnalyticsTrends();
}

async function loadIssueReports() {
  const { data } = await supabaseClient
    .from("issue_reports")
    .select("category,location,status,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  reportsData = (data || []).map((r) => ({
    category: r.category,
    location: r.location,
    status: mapReportStatus(r.status),
    date: formatDate(new Date(r.created_at))
  }));
}

// Builds chart datasets from recent operational records.
async function loadChartData() {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const [docsRes, workersRes] = await Promise.all([
    supabaseClient
      .from("document_requests")
      .select("request_type,created_at")
      .gte("created_at", since.toISOString()),
    supabaseClient
      .from("workers")
      .select("service_category")
      .eq("is_active", true)
  ]);

  const docs = docsRes.data || [];
  const skills = workersRes.data || [];

  const monthBuckets = makeLastMonthBuckets(6);
  docs.forEach((row) => {
    const key = monthKey(new Date(row.created_at));
    if (!monthBuckets[key]) return;

    const type = normalizeDocType(row.request_type);
    if (type === "id") monthBuckets[key].id += 1;
    if (type === "clearance") monthBuckets[key].clearance += 1;
    if (type === "seeker") monthBuckets[key].seeker += 1;
  });

  analyticsData.docTrend.labels = Object.values(monthBuckets).map((m) => m.label);
  analyticsData.docTrend.id = Object.values(monthBuckets).map((m) => m.id);
  analyticsData.docTrend.clearance = Object.values(monthBuckets).map((m) => m.clearance);
  analyticsData.docTrend.seeker = Object.values(monthBuckets).map((m) => m.seeker);

  const typeAgg = { "Barangay ID": 0, "Barangay Clearance": 0, "Job Seeker Cert.": 0 };
  docs.forEach((row) => {
    const type = normalizeDocType(row.request_type);
    if (type === "id") typeAgg["Barangay ID"] += 1;
    if (type === "clearance") typeAgg["Barangay Clearance"] += 1;
    if (type === "seeker") typeAgg["Job Seeker Cert."] += 1;
  });
  analyticsData.docType.labels = Object.keys(typeAgg);
  analyticsData.docType.values = Object.values(typeAgg);

  const skillMap = {};
  skills.forEach((row) => {
    const key = row.service_category || "Other";
    skillMap[key] = (skillMap[key] || 0) + 1;
  });

  const topSkills = Object.entries(skillMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  analyticsData.skills.labels = topSkills.map((i) => i[0]);
  analyticsData.skills.values = topSkills.map((i) => i[1]);
}

function monthBoundaries() {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { previousStart, currentStart, nextStart };
}

function buildMoMTrend(currentValue, previousValue, options = {}) {
  const lowerIsBetter = Boolean(options.lowerIsBetter);
  const labelSuffix = options.labelSuffix || "vs last month";

  if (currentValue === 0 && previousValue === 0) {
    return { cls: "neutral", icon: "minus", text: "No activity yet" };
  }

  if (previousValue === 0) {
    return {
      cls: lowerIsBetter ? "down" : "up",
      icon: "arrow-up",
      text: `${currentValue} this month`
    };
  }

  const delta = currentValue - previousValue;
  const pct = (delta / previousValue) * 100;
  if (Math.abs(pct) < 0.5) {
    return { cls: "neutral", icon: "minus", text: "Stable vs last month" };
  }

  const isIncrease = pct > 0;
  const good = lowerIsBetter ? !isIncrease : isIncrease;
  const cls = good ? "up" : "down";
  const icon = isIncrease ? "arrow-up" : "arrow-down";
  const sign = isIncrease ? "+" : "-";
  const rounded = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Number(Math.abs(pct).toFixed(1));

  return { cls, icon, text: `${sign}${rounded}% ${labelSuffix}` };
}

function setTrendBadge(id, trend) {
  const el = document.getElementById(id);
  if (!el) return;

  const cls = trend?.cls || "neutral";
  const icon = trend?.icon || "minus";
  const text = trend?.text || "No data yet";

  el.classList.remove("up", "down", "neutral");
  el.classList.add("sc-trend", cls);
  el.innerHTML = `<i class="fas fa-${icon}"></i> ${escapeHtml(text)}`;
}

function renderAnalyticsTrends() {
  setTrendBadge("trendResidents", analyticsData.kpiTrends.residents);
  setTrendBadge("trendDocs", analyticsData.kpiTrends.docs);
  setTrendBadge("trendWorkers", analyticsData.kpiTrends.workers);
  setTrendBadge("trendIssues", analyticsData.kpiTrends.issues);
}

function resetAnalyticsTrendsToDefault() {
  analyticsData.kpiTrends = {
    residents: { cls: "neutral", icon: "minus", text: "No data yet" },
    docs: { cls: "neutral", icon: "minus", text: "No data yet" },
    workers: { cls: "neutral", icon: "minus", text: "No data yet" },
    issues: { cls: "neutral", icon: "minus", text: "No data yet" }
  };
  renderAnalyticsTrends();
}

async function loadUserApplications() {
  if (!currentUser || !supabaseClient) return;

  const { data } = await supabaseClient
    .from("document_requests")
    .select("id,request_type,status,created_at")
    .eq("resident_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  userApplications = (data || []).map((row) => ({
    id: row.id,
    doc: row.request_type,
    date: formatDate(new Date(row.created_at)),
    status: mapDocStatus(row.status),
    action: row.status === "approved" || row.status === "completed" ? "Download" : "View Details"
  }));
}

// Applies authenticated display state and profile snippets in the UI.
function applyLoggedInUI(user) {
  document.body.classList.add("logged-in");
  const firstName = user.firstName || "Resident";

  setText("topbarUserName", firstName);
  setText("mobUserName", firstName);
  setText("portalWelcomeName", firstName);
  setText("portalUserBarangay", user.barangay || "Barangay Poblacion");
  setText("profileName", `${user.firstName || ""} ${user.lastName || ""}`.trim() || firstName);
  setText("profileEmail", user.email || "-");
  setText("profileBarangay", user.barangay || "Barangay Poblacion");

  const memberSince = user.memberSince ? new Date(user.memberSince).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : "-";
  setText("profileMemberSince", memberSince);
}

async function doLogout() {
  localStorage.removeItem(BCH_USER_KEY);

  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  currentUser = null;
  currentProfile = null;
  renderPortalStatCards();
  document.body.classList.remove("logged-in");
  switchTab("analytics");
  showToast("Logged out successfully.");
  setText("topbarUserName", "-");
  setText("mobUserName", "-");
}

function checkUrlHash() {
  const hash = window.location.hash.replace("#", "");
  const validTabs = ["analytics", "workers", "documents", "community", "myportal"];
  if (!hash || !validTabs.includes(hash)) return;

  // Avoid stale guest modal when session is already authenticated.
  if (hash === "myportal" && currentUser) {
    closeLoginModal();
  }

  switchTab(hash);
}

function setupTopbarScroll() {
  window.addEventListener("scroll", () => {
    document.getElementById("topbar")?.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

function setupHamburger() {
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("mobileNav")?.classList.toggle("open");
  });
}

function closeMobile() {
  document.getElementById("mobileNav")?.classList.remove("open");
}

function setupTabNav() {
  document.querySelectorAll(".tnav-link[data-tab]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(link.getAttribute("data-tab"));
      closeMobile();
    });
  });
}

// Tab guard: blocks protected portal tab for guests and prompts authentication.
function switchTab(tabId) {
  if (tabId === "myportal" && !currentUser) {
    requireLogin("portal");
    return;
  }

  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-" + tabId)?.classList.add("active");

  document.querySelectorAll(".tnav-link[data-tab]").forEach((l) => {
    l.classList.toggle("active", l.getAttribute("data-tab") === tabId);
  });

  history.replaceState(null, null, "#" + tabId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCounterTargetByIndex(index, value) {
  const el = document.querySelectorAll(".counter")[index];
  if (!el) return;
  el.setAttribute("data-target", String(Math.max(0, Number(value || 0))));
  el.textContent = "0";
}

function animateCounters() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.getAttribute("data-target") || "0", 10);
      let start = null;
      const tick = (ts) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / 1200, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(e * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      obs.unobserve(el);
    });
  }, { threshold: 0.4 });

  document.querySelectorAll(".counter").forEach((el) => obs.observe(el));
}

// Renders Chart.js visuals using live DB-derived analyticsData.
function renderAnalyticsCharts() {
  const trendLabels = analyticsData.docTrend.labels.length ? analyticsData.docTrend.labels : ["-", "-", "-", "-", "-", "-"];
  const idSeries = analyticsData.docTrend.id.length ? analyticsData.docTrend.id : [0, 0, 0, 0, 0, 0];
  const clearSeries = analyticsData.docTrend.clearance.length ? analyticsData.docTrend.clearance : [0, 0, 0, 0, 0, 0];
  const seekerSeries = analyticsData.docTrend.seeker.length ? analyticsData.docTrend.seeker : [0, 0, 0, 0, 0, 0];

  const tCtx = document.getElementById("docTrendChart");
  if (tCtx) {
    new Chart(tCtx, {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          { label: "Barangay ID", data: idSeries, borderColor: "#d4a574", backgroundColor: "rgba(212,165,116,0.08)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Barangay Clearance", data: clearSeries, borderColor: "#5dade2", backgroundColor: "rgba(93,173,226,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Job Seeker Cert.", data: seekerSeries, borderColor: "#4cde80", backgroundColor: "rgba(76,222,128,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "rgba(255,255,255,0.55)" } } },
        scales: { y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,0.4)" } }, x: { ticks: { color: "rgba(255,255,255,0.4)" } } }
      }
    });
  }

  const dCtx = document.getElementById("docTypeChart");
  if (dCtx) {
    const labels = analyticsData.docType.labels.length ? analyticsData.docType.labels : ["Barangay ID", "Barangay Clearance", "Job Seeker Cert."];
    const values = analyticsData.docType.values.length ? analyticsData.docType.values : [0, 0, 0];

    new Chart(dCtx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: ["#d4a574", "#5dade2", "#4cde80"], borderWidth: 3, borderColor: "#0f2236" }] },
      options: { responsive: true, cutout: "68%", plugins: { legend: { display: false } } }
    });

    const total = values.reduce((acc, n) => acc + n, 0) || 1;
    const legend = document.getElementById("docTypeLegend");
    if (legend) {
      legend.innerHTML = labels.map((label, idx) => {
        const pct = Math.round((values[idx] / total) * 100);
        const color = ["#d4a574", "#5dade2", "#4cde80"][idx % 3];
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="color:rgba(255,255,255,0.5);flex:1">${label}</span><span style="color:#fff;font-weight:700">${pct}%</span></div>`;
      }).join("");
    }
  }

  const sCtx = document.getElementById("skillsChart");
  if (sCtx) {
    new Chart(sCtx, {
      type: "bar",
      data: {
        labels: analyticsData.skills.labels.length ? analyticsData.skills.labels : ["No Data"],
        datasets: [{ label: "Workers", data: analyticsData.skills.values.length ? analyticsData.skills.values : [0], backgroundColor: "rgba(212,165,116,0.75)", borderRadius: 7, borderSkipped: false }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: "rgba(255,255,255,0.4)" } }, y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,0.4)" } } }
      }
    });
  }
}

function renderBarangayTable() {
  const tbody = document.getElementById("barangayTableBody");
  if (!tbody) return;

  const pillMap = {
    active: { cls: "active", label: "Live" },
    pending: { cls: "pending", label: "Pending" },
    soon: { cls: "soon", label: "Coming Soon" }
  };

  tbody.innerHTML = barangaysData.map((b) => {
    const p = pillMap[b.status] || pillMap.pending;
    return `<tr>
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${Number(b.residents || 0).toLocaleString()}</td>
      <td>${Number(b.docs || 0).toLocaleString()}</td>
      <td>${Number(b.workers || 0).toLocaleString()}</td>
      <td><span class="tpill ${p.cls}">${p.label}</span></td>
    </tr>`;
  }).join("");
}

function buildAnnCard(a) {
  return `<div class="ann-card">
    <span class="ann-card-tag">${escapeHtml(a.category)}</span>
    <p class="ann-card-title">${escapeHtml(a.title)}</p>
    <p class="ann-card-date"><i class="fas fa-calendar-alt"></i> ${escapeHtml(a.date)}</p>
    <p class="ann-card-content">${escapeHtml(a.content)}</p>
  </div>`;
}

function renderAnnouncementsSidebar() {
  const el = document.getElementById("announcementsFeed");
  if (el) el.innerHTML = announcementsData.slice(0, 3).map(buildAnnCard).join("");
}

function renderAnnouncementsPage() {
  const el = document.getElementById("communityAnnouncementsFeed");
  if (el) el.innerHTML = announcementsData.map(buildAnnCard).join("");
}

function renderPortalAnnouncementsMini() {
  const el = document.getElementById("portalAnnouncementsMini");
  if (el) el.innerHTML = announcementsData.slice(0, 3).map(buildAnnCard).join("");
}

function renderTopWorkersSidebar() {
  const el = document.getElementById("topWorkersList");
  if (!el) return;

  const top = [...workersData]
    .sort((a, b) => {
      const scoreA = Number(a.reviews || 0) > 0 ? Number(a.rating || 0) : -1;
      const scoreB = Number(b.reviews || 0) > 0 ? Number(b.rating || 0) : -1;
      return scoreB - scoreA;
    })
    .slice(0, 5);

  el.innerHTML = top.map((w) => `
    <div class="top-worker-item" onclick="handleWorkerContact('${escapeAttr(w.name)}','${escapeAttr(w.specialty)}','${escapeAttr(w.phone)}','${escapeAttr(w.email)}')">
      <div class="tw-avatar"><i class="fas fa-user"></i></div>
      <div class="tw-info">
        <span class="tw-name">${escapeHtml(w.name)}</span>
        <span class="tw-spec">${escapeHtml(w.specialty)}</span>
      </div>
      <span class="tw-rating">${Number(w.reviews || 0) > 0 ? Number(w.rating || 0).toFixed(1) : "-"}</span>
    </div>
  `).join("");
}

function renderWorkers(workers) {
  const grid = document.getElementById("workerDirectory");
  if (!grid) return;

  if (!workers.length) {
    grid.innerHTML = "<div style=\"grid-column:1/-1;text-align:center;padding:60px 0;color:rgba(255,255,255,0.22)\">No workers match your filters.</div>";
    return;
  }

  grid.innerHTML = workers.map((w) => `
    <div class="worker-card">
      <div class="worker-info">
        <div class="worker-avatar"><i class="fas fa-user"></i></div>
        <p class="worker-name">${escapeHtml(w.name)}</p>
        <p class="worker-specialty">${escapeHtml(w.specialty)}</p>
        <span class="worker-category">${escapeHtml(w.barangay || "Unassigned Barangay")}</span>
        <div class="worker-rating">${Number(w.reviews || 0) > 0 ? `${Number(w.rating || 0).toFixed(1)} · <span style="color:rgba(255,255,255,0.3)">${Number(w.reviews || 0)} reviews</span>` : "<span style='color:rgba(255,255,255,0.45)'>No ratings yet</span>"}</div>
      </div>
      <div class="worker-contact">
        <button class="btn-contact" onclick="handleWorkerContact('${escapeAttr(w.name)}','${escapeAttr(w.specialty)}','${escapeAttr(w.phone)}','${escapeAttr(w.email)}')"><i class="fas fa-phone"></i> Call</button>
        <button class="btn-contact" onclick="handleWorkerContact('${escapeAttr(w.name)}','${escapeAttr(w.specialty)}','${escapeAttr(w.phone)}','${escapeAttr(w.email)}')"><i class="fas fa-envelope"></i> Email</button>
      </div>
    </div>
  `).join("");
}

function updateWorkerCount(n) {
  setText("workerCount", String(n));
  setText("workerFilterCount", `${n} workers`);
}

function setupWorkerFilters() {
  ["workerSearch", "categoryFilter", "specialtyFilter"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", applyWorkerFilters);
    document.getElementById(id)?.addEventListener("change", applyWorkerFilters);
  });
}

function populateWorkerFilters() {
  const barangayFilter = document.getElementById("categoryFilter");
  const specialtyFilter = document.getElementById("specialtyFilter");
  if (!barangayFilter || !specialtyFilter) return;

  const activeBarangays = [...new Set(
    barangaysData
      .filter((b) => String(b.status || "").toLowerCase() === "active")
      .map((b) => String(b.name || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const fallbackBarangays = [...new Set(workersData.map((w) => String(w.barangay || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const barangayOptions = activeBarangays.length ? activeBarangays : fallbackBarangays;

  const prevBarangay = barangayFilter.value;
  barangayFilter.innerHTML = `<option value="">All Barangays</option>${barangayOptions
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;
  if (prevBarangay && barangayOptions.includes(prevBarangay)) barangayFilter.value = prevBarangay;

  const specialties = [...new Set(workersData.map((w) => String(w.specialty || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const prevSpecialty = specialtyFilter.value;
  specialtyFilter.innerHTML = `<option value="">All Specialties</option>${specialties
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;
  if (prevSpecialty && specialties.some((s) => s.toLowerCase() === prevSpecialty.toLowerCase())) {
    specialtyFilter.value = prevSpecialty;
  }
}

function applyWorkerFilters() {
  const term = (document.getElementById("workerSearch")?.value || "").toLowerCase();
  const cat = document.getElementById("categoryFilter")?.value || "";
  const spec = document.getElementById("specialtyFilter")?.value || "";

  const filtered = workersData.filter((w) => {
    const ms = w.name.toLowerCase().includes(term) || w.specialty.toLowerCase().includes(term);
    const mc = !cat || String(w.barangay || "").toLowerCase() === String(cat).toLowerCase();
    const msp = !spec || w.specialty.toLowerCase() === spec.toLowerCase();
    return ms && mc && msp;
  });

  renderWorkers(filtered);
  updateWorkerCount(filtered.length);
}

function handleWorkerContact(name, specialty, phone, email) {
  if (!currentUser) {
    requireLogin("contact");
    return;
  }

  setText("contactName", name);
  setText("contactSpec", specialty);
  setText("contactPhoneTxt", phone);
  setText("contactEmailTxt", email);
  incrementWorkerBrowseCount();
  renderPortalStatCards();

  const phoneEl = document.getElementById("contactPhone");
  const emailEl = document.getElementById("contactEmail");
  if (phoneEl) phoneEl.href = "tel:" + phone;
  if (emailEl) emailEl.href = "mailto:" + email;

  document.getElementById("contactModal")?.classList.add("open");
}

function closeContactModal() {
  document.getElementById("contactModal")?.classList.remove("open");
}

function handleDocAction(docName) {
  if (!currentUser) {
    requireLogin("apply");
    return;
  }
  openApplyModal(docName);
}

let applyModalDocName = "";

function openApplyModal(docName) {
  applyModalDocName = docName;
  setText("applyModalTitle", `Apply - ${docName}`);
  setText("applyModalSub", `Fill in the required details for your ${docName} request.`);

  const purposeWrap = document.getElementById("applyPurposeWrap");
  if (purposeWrap) purposeWrap.style.display = docName.toLowerCase().includes("clearance") ? "block" : "none";

  if (currentProfile) {
    const nameInput = document.getElementById("applyFullName");
    const emailInput = document.getElementById("applyEmail");
    if (nameInput && !nameInput.value) nameInput.value = currentProfile.full_name || "";
    if (emailInput && !emailInput.value) emailInput.value = currentProfile.email || currentUser?.email || "";
  }

  document.getElementById("applyModal")?.classList.add("open");
}

function closeApplyModal() {
  document.getElementById("applyModal")?.classList.remove("open");
  document.getElementById("applyForm")?.reset();
}

// Profile editor keeps resident details editable from My Portal.
function setupProfileForm() {
  document.getElementById("profileEditBtn")?.addEventListener("click", () => {
    if (!currentUser) {
      requireLogin("portal");
      return;
    }
    openProfileModal();
  });

  document.getElementById("profileEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser || !supabaseClient) {
      showToast("Please login to update your profile.");
      return;
    }

    const fullName = document.getElementById("profileEditFullName")?.value.trim() || "";
    const barangay = document.getElementById("profileEditBarangay")?.value.trim() || "";
    const phone = document.getElementById("profileEditPhone")?.value.trim() || null;

    if (!fullName || !barangay) {
      showToast("Full name and barangay are required.");
      return;
    }

    let payload = { full_name: fullName, barangay, phone };
    let { error } = await supabaseClient.from("profiles").update(payload).eq("id", currentUser.id);

    if (error && String(error.message || "").toLowerCase().includes("column") && String(error.message || "").toLowerCase().includes("barangay")) {
      payload = { full_name: fullName, barangay_name: barangay, phone };
      ({ error } = await supabaseClient.from("profiles").update(payload).eq("id", currentUser.id));
    }

    if (error) {
      showToast(error.message);
      return;
    }

    const { data: refreshed } = await supabaseClient
      .from("profiles")
      .select("id,full_name,email,phone,barangay,barangay_name,role,created_at")
      .eq("id", currentUser.id)
      .maybeSingle();

    currentProfile = refreshed || currentProfile;

    const parsedName = parseFullName(currentProfile?.full_name || fullName);
    const resolvedBarangay = currentProfile?.barangay_name || currentProfile?.barangay || barangay;
    applyLoggedInUI({
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      email: currentProfile?.email || currentUser.email,
      barangay: resolvedBarangay,
      memberSince: currentProfile?.created_at
    });

    closeProfileModal();
    showToast("Profile updated successfully.");
  });
}

function openProfileModal() {
  const nameInput = document.getElementById("profileEditFullName");
  const emailInput = document.getElementById("profileEditEmail");
  const barangayInput = document.getElementById("profileEditBarangay");
  const phoneInput = document.getElementById("profileEditPhone");

  if (nameInput) nameInput.value = currentProfile?.full_name || [currentUser?.user_metadata?.full_name, currentUser?.user_metadata?.name].find(Boolean) || "";
  if (emailInput) emailInput.value = currentUser?.email || currentProfile?.email || "";
  if (barangayInput) barangayInput.value = currentProfile?.barangay_name || currentProfile?.barangay || currentUser?.user_metadata?.barangay_name || currentUser?.user_metadata?.barangay || "";
  if (phoneInput) phoneInput.value = currentProfile?.phone || "";

  document.getElementById("profileModal")?.classList.add("open");
}

function closeProfileModal() {
  document.getElementById("profileModal")?.classList.remove("open");
}

// Resident document request submit handler (insert -> refresh tracker).
function setupApplyForm() {
  document.getElementById("applyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser || !supabaseClient) {
      showToast("Please login to submit applications.");
      return;
    }

    const purpose = document.getElementById("applyPurpose")?.value || "General request";
    const { error } = await supabaseClient.from("document_requests").insert({
      resident_id: currentUser.id,
      barangay: currentProfile?.barangay || "Barangay Poblacion",
      request_type: applyModalDocName,
      purpose,
      status: "submitted"
    });

    if (error) {
      showToast(error.message);
      return;
    }

    closeApplyModal();
    await loadUserApplications();
    renderUserApplications();
    renderDocRecentApps();
    renderPortalStatCards();
    showToast(`${applyModalDocName} application submitted.`);
  });
}

function renderUserApplications() {
  const tbody = document.getElementById("userApplicationsBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Completed: "active", Resolved: "active" };

  tbody.innerHTML = userApplications.map((a) => `
    <tr>
      <td><strong>${escapeHtml(a.doc)}</strong></td>
      <td style="color:rgba(255,255,255,0.45)">${escapeHtml(a.date)}</td>
      <td><span class="tpill ${pillMap[a.status] || "pending"}">${escapeHtml(a.status)}</span></td>
      <td><button class="gc-link-btn">${escapeHtml(a.action)}</button></td>
    </tr>
  `).join("");
}

function renderDocRecentApps() {
  const tbody = document.getElementById("docRecentAppsBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Completed: "active" };
  tbody.innerHTML = userApplications.slice(0, 3).map((a) => `
    <tr>
      <td><strong>${escapeHtml(a.doc)}</strong></td>
      <td style="color:rgba(255,255,255,0.45)">${escapeHtml(a.date)}</td>
      <td><span class="tpill ${pillMap[a.status] || "pending"}">${escapeHtml(a.status)}</span></td>
      <td><button class="gc-link-btn">${escapeHtml(a.action)}</button></td>
    </tr>
  `).join("");
}

// Community issue report submit handler (insert -> refresh reports table).
function setupReportForm() {
  document.getElementById("reportForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      requireLogin("report");
      return;
    }

    const category = document.getElementById("reportCategory")?.value || "General";
    const location = document.getElementById("reportLocation")?.value || "Not specified";
    const description = document.getElementById("reportDescription")?.value || "";

    const { error } = await supabaseClient.from("issue_reports").insert({
      resident_id: currentUser.id,
      category,
      location,
      description,
      status: "pending",
      barangay: currentProfile?.barangay || "Barangay Poblacion"
    });

    if (error) {
      showToast(error.message);
      return;
    }

    e.target.reset();
    await loadIssueReports();
    renderReportsTable();
    showToast("Issue report submitted successfully.");
  });
}

function renderReportsTable() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Resolved: "active" };
  tbody.innerHTML = reportsData.map((r) => `
    <tr>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td style="color:rgba(255,255,255,0.4)">${escapeHtml(r.date)}</td>
      <td><span class="tpill ${pillMap[r.status] || "pending"}">${escapeHtml(r.status)}</span></td>
    </tr>
  `).join("");
}

const loginModalCopy = {
  apply: { icon: "fas fa-file-pen", title: "Login to Apply", desc: "Create an account to submit document requests and track their status." },
  contact: { icon: "fas fa-address-book", title: "Login to Contact Workers", desc: "Login to view worker contact details." },
  report: { icon: "fas fa-triangle-exclamation", title: "Login to Submit Report", desc: "Login to submit issue reports and monitor resolution progress." },
  portal: { icon: "fas fa-user-circle", title: "Login to View My Portal", desc: "Login to access your personal profile and application history." },
  default: { icon: "fas fa-lock", title: "Login Required", desc: "Please login or create an account to continue." }
};

function requireLogin(action = "default") {
  pendingAction = action;
  const copy = loginModalCopy[action] || loginModalCopy.default;

  document.getElementById("modalIco").innerHTML = `<i class="${copy.icon}"></i>`;
  setText("modalTitle", copy.title);
  setText("modalDesc", copy.desc);
  showLoginModal();
}

function showLoginModal() { document.getElementById("loginModal")?.classList.add("open"); }
function closeLoginModal() { document.getElementById("loginModal")?.classList.remove("open"); }

document.addEventListener("click", (e) => {
  if (e.target.id === "loginModal") closeLoginModal();
  if (e.target.id === "applyModal") closeApplyModal();
  if (e.target.id === "contactModal") closeContactModal();
  if (e.target.id === "profileModal") closeProfileModal();

});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeLoginModal();
  closeApplyModal();
  closeContactModal();
  closeProfileModal();
  closeMobile();
});

function setupStatusBarClock() {
  const el = document.getElementById("statusBarTime");
  if (!el) return;

  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  tick();
  setInterval(tick, 1000);
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("portalToast");
  const span = document.getElementById("portalToastMsg");
  if (!el || !span) return;

  span.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(d) {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeDocType(typeValue) {
  const v = String(typeValue || "").toLowerCase();
  if (v.includes("id")) return "id";
  if (v.includes("clearance")) return "clearance";
  return "seeker";
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
  if (v === "resolved") return "Resolved";
  return "Pending";
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function makeLastMonthBuckets(n) {
  const map = {};
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - (n - 1));

  for (let i = 0; i < n; i += 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() + i, 1);
    const key = monthKey(date);
    map[key] = {
      label: date.toLocaleDateString("en-PH", { month: "short" }),
      id: 0,
      clearance: 0,
      seeker: 0
    };
  }

  return map;
}

function parseFullName(fullName) {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) return { firstName: "Resident", lastName: "" };

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "");
}







function resetAnalyticsCountersToZero() {
  setCounterTargetByIndex(0, 0);
  setCounterTargetByIndex(1, 0);
  setCounterTargetByIndex(2, 0);
  setCounterTargetByIndex(3, 0);
  resetAnalyticsTrendsToDefault();
}





















function getWorkerBrowseStorageKey() {
  if (!currentUser?.id) return "";
  return `${BCH_WORKER_BROWSE_PREFIX}${currentUser.id}`;
}

function getWorkerBrowseCount() {
  try {
    const key = getWorkerBrowseStorageKey();
    if (!key) return 0;
    return Math.max(0, parseInt(localStorage.getItem(key) || "0", 10) || 0);
  } catch (_err) {
    return 0;
  }
}

function incrementWorkerBrowseCount() {
  try {
    const key = getWorkerBrowseStorageKey();
    if (!key) return;
    const next = getWorkerBrowseCount() + 1;
    localStorage.setItem(key, String(next));
  } catch (_err) {
    // noop: localStorage may be disabled in strict browser mode
  }
}

function renderPortalStatCards() {
  const totalApps = userApplications.length;
  const pending = userApplications.filter((a) => a.status === "Pending" || a.status === "Processing").length;
  const completed = userApplications.filter((a) => a.status === "Completed").length;
  const workersBrowsed = currentUser ? getWorkerBrowseCount() : 0;

  setText("portalStatApplications", String(totalApps));
  setText("portalStatPending", String(pending));
  setText("portalStatCompleted", String(completed));
  setText("portalStatWorkersBrowsed", String(workersBrowsed));
}





