// ============================================
// BARANGAY HUB - MAIN.JS (Supabase-backed)
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
  totals: { residents: 0, docs: 0, workers: 0, unresolvedReports: 0, barangays: 0 },
  docTrend: { labels: [], id: [], clearance: [], seeker: [], indigency: [], residency: [] },
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
  setupChangePasswordForm();
  setupStatusBarClock();

  await initAuthState();
  checkUrlHash();
  await loadPortalData();
  populateWorkerFilters();
  populateReportBarangayOptions();

  renderHeroStats();
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
    await loadNotifications();
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
    .select("id,full_name,email,phone,barangay,role,created_at")
    .eq("id", currentUser.id)
    .maybeSingle();

  currentProfile = profile || null;
  const parsedName = parseFullName(profile?.full_name || currentUser.user_metadata?.full_name || "Resident");

  const resolvedBarangay = profile?.barangay || currentUser.user_metadata?.barangay || "Barangay Poblacion";
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
    id:        row.id,
    name:      row.full_name || row.name || "Worker",
    specialty: row.service_category || row.category || "General",
    barangay:  row.barangay || "",
    phone:     row.contact_phone || "",
    email:     row.contact_email || "",
    rating:    Number(row.rating_avg || 0),
    reviews:   Number(row.reviews_count || 0)
  }));
}

async function loadAnnouncements() {
  const { data } = await supabaseClient
    .from("announcements")
    .select("id,title,content,category,barangay_scope,published_at,media_url,media_type")
    .order("published_at", { ascending: false })
    .limit(20);

  announcementsData = (data || []).map((a) => ({
    id: a.id,
    category: a.category || (a.barangay_scope || "General"),
    title: a.title,
    date: formatDate(new Date(a.published_at || Date.now())),
    content: a.content,
    media_url: a.media_url,
    media_type: a.media_type,
    barangay: a.barangay_scope,
    likes: [],
    commentsCount: 0
  }));

  const annIds = announcementsData.map(a => a.id);
  if (annIds.length > 0 && supabaseClient) {
    try {
      const { data: allLikes } = await supabaseClient
        .from("announcement_likes")
        .select("announcement_id, resident_id")
        .in("announcement_id", annIds);

      const likesMap = {};
      annIds.forEach(id => { likesMap[id] = []; });
      if (allLikes) {
        allLikes.forEach(l => {
          if (likesMap[l.announcement_id]) {
            likesMap[l.announcement_id].push(l.resident_id);
          }
        });
      }

      const { data: allComments } = await supabaseClient
        .from("announcement_comments")
        .select("announcement_id")
        .in("announcement_id", annIds);

      const commentsMap = {};
      annIds.forEach(id => { commentsMap[id] = 0; });
      if (allComments) {
        allComments.forEach(c => {
          commentsMap[c.announcement_id] = (commentsMap[c.announcement_id] || 0) + 1;
        });
      }

      announcementsData.forEach(a => {
        a.likes = likesMap[a.id] || [];
        a.commentsCount = commentsMap[a.id] || 0;
      });
    } catch (e) {
      console.error("Error loading likes or comments for announcements:", e);
    }
  }
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
    unresolvedReports: reportsCount.count || 0,
    barangays: (barangaysRes.data || []).length
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
    .select("category,location,status,created_at,barangay")
    .order("created_at", { ascending: false })
    .limit(20);

  reportsData = (data || []).map((r) => ({
    category: r.category,
    location: r.location,
    barangay: r.barangay || "—",
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
    if (type === "indigency") monthBuckets[key].indigency += 1;
    if (type === "residency") monthBuckets[key].residency += 1;
  });

  analyticsData.docTrend.labels = Object.values(monthBuckets).map((m) => m.label);
  analyticsData.docTrend.id = Object.values(monthBuckets).map((m) => m.id);
  analyticsData.docTrend.clearance = Object.values(monthBuckets).map((m) => m.clearance);
  analyticsData.docTrend.seeker = Object.values(monthBuckets).map((m) => m.seeker);
  analyticsData.docTrend.indigency = Object.values(monthBuckets).map((m) => m.indigency);
  analyticsData.docTrend.residency = Object.values(monthBuckets).map((m) => m.residency);

  const typeAgg = { "Barangay ID": 0, "Barangay Clearance": 0, "Job Seeker Cert.": 0, "Indigency Certificate": 0, "Residency Certificate": 0 };
  docs.forEach((row) => {
    const type = normalizeDocType(row.request_type);
    if (type === "id") typeAgg["Barangay ID"] += 1;
    if (type === "clearance") typeAgg["Barangay Clearance"] += 1;
    if (type === "seeker") typeAgg["Job Seeker Cert."] += 1;
    if (type === "indigency") typeAgg["Indigency Certificate"] += 1;
    if (type === "residency") typeAgg["Residency Certificate"] += 1;
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

function renderHeroStats() {
  const totals = analyticsData.totals;
  const fmt = (n) => Number(n || 0).toLocaleString();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("heroStatResidents", fmt(totals.residents));
  set("heroStatDocs",      fmt(totals.docs));
  set("heroStatWorkers",   fmt(totals.workers));
  set("heroStatBarangays",  fmt(totals.barangays));
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
    rawStatus: row.status
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
  switchTab("home");
  showToast("Logged out successfully.");
  setText("topbarUserName", "-");
  setText("mobUserName", "-");
}

function checkUrlHash() {
  const hash = window.location.hash.replace("#", "");
  const validTabs = ["home", "analytics", "workers", "documents", "announcements", "issues", "myportal"];
  if (!hash || !validTabs.includes(hash)) return;

  // Avoid stale guest modal when session is already authenticated.
  if (hash === "myportal" && currentUser) {
    closeLoginModal();
  }

  // Map old 'analytics' hash to 'home'
  switchTab(hash === "analytics" ? "home" : hash);
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

  // Apply immediately and on resize – uses inline !important to beat
  // body.logged-in .user-only { display: unset !important } specificity.
  applyMobileTopbar();
  window.addEventListener("resize", applyMobileTopbar);
}

// Controls which topbar elements show on mobile vs desktop.
// Inline style.setProperty with 'important' wins over any class-based rule.
function applyMobileTopbar() {
  const mobile = window.innerWidth <= 768;
  const ua    = document.getElementById("userTopbarActions");
  const ga    = document.querySelector(".topbar-actions.guest-only");
  const tnav  = document.getElementById("mainNav");
  const hb    = document.getElementById("hamburger");

  if (mobile) {
    ua?.style.setProperty("display", "none", "important");
    ga?.style.setProperty("display", "none", "important");
    tnav?.style.setProperty("display", "none", "important");
    hb?.style.setProperty("display", "flex", "important");
  } else {
    ua?.style.removeProperty("display");
    ga?.style.removeProperty("display");
    tnav?.style.removeProperty("display");
    hb?.style.removeProperty("display");
  }
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

  const targetTab = "tab-" + tabId;

  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById(targetTab);
  if (panel) {
    panel.classList.add("active");
  }

  document.querySelectorAll(".tnav-link[data-tab]").forEach((l) => {
    l.classList.toggle("active", l.getAttribute("data-tab") === tabId);
  });

  history.replaceState(null, null, "#" + tabId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Quick-doc-btn handler: navigates to the document request section.
// For guests, it first requires login.
function handleDocAction(docType) {
  if (!currentUser) {
    requireLogin("portal");
    return;
  }
  switchTab("documents");
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
  const indySeries = analyticsData.docTrend.indigency.length ? analyticsData.docTrend.indigency : [0, 0, 0, 0, 0, 0];
  const resSeries = analyticsData.docTrend.residency.length ? analyticsData.docTrend.residency : [0, 0, 0, 0, 0, 0];

  const tCtx = document.getElementById("docTrendChart");
  if (tCtx) {
    new Chart(tCtx, {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          { label: "Barangay ID", data: idSeries, borderColor: "#d4a574", backgroundColor: "rgba(212,165,116,0.08)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Barangay Clearance", data: clearSeries, borderColor: "#5dade2", backgroundColor: "rgba(93,173,226,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Job Seeker Cert.", data: seekerSeries, borderColor: "#4cde80", backgroundColor: "rgba(76,222,128,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Indigency Cert.", data: indySeries, borderColor: "#9b59b6", backgroundColor: "rgba(155,89,182,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 },
          { label: "Residency Cert.", data: resSeries, borderColor: "#e67e22", backgroundColor: "rgba(230,126,34,0.07)", fill: true, tension: 0.42, borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "rgba(255,255,255,0.55)", boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,0.4)" } }, x: { ticks: { color: "rgba(255,255,255,0.4)" } } }
      }
    });
  }

  const dCtx = document.getElementById("docTypeChart");
  if (dCtx) {
    const labels = analyticsData.docType.labels.length ? analyticsData.docType.labels : ["Barangay ID", "Barangay Clearance", "Job Seeker Cert.", "Indigency Certificate", "Residency Certificate"];
    const values = analyticsData.docType.values.length ? analyticsData.docType.values : [0, 0, 0, 0, 0];
    const chartColors = ["#d4a574", "#5dade2", "#4cde80", "#9b59b6", "#e67e22"];

    new Chart(dCtx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 3, borderColor: "#0f2236" }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false } } }
    });

    const total = values.reduce((acc, n) => acc + n, 0) || 1;
    const legend = document.getElementById("docTypeLegend");
    if (legend) {
      legend.innerHTML = labels.map((label, idx) => {
        const pct = Math.round((values[idx] / total) * 100);
        const color = chartColors[idx % chartColors.length];
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
        maintainAspectRatio: false,
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

  const LIMIT = 5;
  const buildRow = (b) => {
    const p = pillMap[b.status] || pillMap.pending;
    return `<tr>
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${Number(b.residents || 0).toLocaleString()}</td>
      <td>${Number(b.docs || 0).toLocaleString()}</td>
      <td>${Number(b.workers || 0).toLocaleString()}</td>
      <td><span class="tpill ${p.cls}">${p.label}</span></td>
    </tr>`;
  };

  const visible = barangaysData.slice(0, LIMIT);
  const hidden  = barangaysData.slice(LIMIT);

  tbody.innerHTML = visible.map(buildRow).join("");

  // Remove any old toggle row
  const existingToggle = document.getElementById("barangayTableToggleRow");
  if (existingToggle) existingToggle.remove();

  if (hidden.length > 0) {
    // Inject hidden rows
    const hiddenRows = hidden.map(buildRow).join("");
    const toggleRow = document.createElement("tr");
    toggleRow.id = "barangayTableToggleRow";
    toggleRow.innerHTML = `<td colspan="5" style="text-align:center;padding:8px 0">
      <button onclick="toggleBarangayRows(this)" style="
        background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);
        color:var(--text-muted);font-size:12px;font-weight:600;padding:5px 18px;
        border-radius:8px;cursor:pointer;">
        <i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${hidden.length} more barangay${hidden.length > 1 ? 's' : ''}
      </button>
    </td>`;
    tbody.appendChild(toggleRow);

    // Store hidden rows for the toggle to reveal
    tbody.dataset.hiddenRows = hiddenRows;
    tbody.dataset.hiddenCount = hidden.length;
  }
}

function toggleBarangayRows(btn) {
  const tbody = document.getElementById("barangayTableBody");
  if (!tbody) return;
  const toggleRow = document.getElementById("barangayTableToggleRow");
  const isCollapsed = btn.innerHTML.includes("fa-chevron-down");

  if (isCollapsed) {
    // Insert hidden rows before the toggle row
    toggleRow.insertAdjacentHTML("beforebegin", tbody.dataset.hiddenRows || "");
    btn.innerHTML = `<i class="fas fa-chevron-up" style="margin-right:5px"></i>Show less`;
  } else {
    // Remove all rows except the first 5 and the toggle row
    const rows = [...tbody.querySelectorAll("tr")];
    rows.slice(5).forEach(r => { if (r.id !== "barangayTableToggleRow") r.remove(); });
    btn.innerHTML = `<i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${tbody.dataset.hiddenCount} more barangay${Number(tbody.dataset.hiddenCount) > 1 ? 's' : ''}`;
  }
}

function buildAnnCard(a) {
  const isLiked = currentUser && a.likes && a.likes.includes(currentUser.id);
  const likesCount = a.likes ? a.likes.length : 0;
  const commentsCount = a.commentsCount || 0;

  const mediaHtml = a.media_url 
    ? (a.media_type === 'video' 
        ? `<div class="fb-media-wrapper"><video controls src="${escapeAttr(a.media_url)}" style="width:100%;max-height:500px;background:#000;display:block;"></video></div>`
        : `<div class="fb-media-wrapper" onclick="openAnnouncement('${escapeHtml(a.id)}', event)"><img src="${escapeAttr(a.media_url)}" alt="Attachment" style="width:100%;object-fit:cover;max-height:500px;display:block;cursor:pointer;"></div>`)
    : '';

  return `
  <div class="ann-card fb-layout">
    <div class="fb-card-header" onclick="openAnnouncement('${escapeHtml(a.id)}', event)">
      <div class="fb-avatar">
        <i class="fas fa-bullhorn"></i>
      </div>
      <div class="fb-meta">
        <div class="fb-publisher">${escapeHtml(a.barangay || 'City-Wide')} Hub <i class="fas fa-check-circle verified-badge"></i></div>
        <div class="fb-date">${escapeHtml(a.date)} &middot; <i class="fas fa-globe-americas"></i></div>
      </div>
      <div class="fb-category-badge">${escapeHtml(a.category)}</div>
    </div>
    
    <div class="fb-card-body" onclick="openAnnouncement('${escapeHtml(a.id)}', event)">
      <div class="fb-title">${escapeHtml(a.title)}</div>
      <p class="fb-content">${escapeHtml(a.content)}</p>
    </div>

    ${mediaHtml}

    <div class="fb-card-footer">
      <div class="fb-stats-row" onclick="openAnnouncement('${escapeHtml(a.id)}', event)">
        <span><i class="fas fa-thumbs-up" style="color:var(--t-blue);margin-right:4px"></i> ${likesCount} ${likesCount === 1 ? 'Like' : 'Likes'}</span>
        <span>${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}</span>
      </div>
      <div class="fb-actions-row">
        <button class="fb-action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLikeFromFeed('${escapeHtml(a.id)}', event)">
          <i class="${isLiked ? 'fas' : 'far'} fa-thumbs-up"></i> Like
        </button>
        <button class="fb-action-btn" onclick="openAnnouncement('${escapeHtml(a.id)}', event)">
          <i class="far fa-comment-alt"></i> Comment
        </button>
      </div>
    </div>
  </div>`;
}

// === INTERACTIVE ANNOUNCEMENTS LOGIC ===
let currentOpenAnnId = null;
let currentAnnIsLiked = false;

async function openAnnouncement(id, event) {
  if (event) event.stopPropagation();
  const ann = announcementsData.find(a => a.id === id);
  if (!ann) return;
  
  currentOpenAnnId = id;
  setText("annModalTitle", ann.title);
  setText("annModalDate", ann.date);
  setText("annModalCategory", ann.category);

  const contentEl = document.getElementById("annModalContent");
  const seeMoreBtn = document.getElementById("annModalSeeMoreBtn");

  if (contentEl) {
      const MAX_CHARS = 250;
      let isCollapsed = false;
      
      if (ann.content.length > MAX_CHARS) {
          isCollapsed = true;
          contentEl.textContent = ann.content.substring(0, MAX_CHARS) + "...";
          
          if (seeMoreBtn) {
              seeMoreBtn.style.display = "inline-block";
              seeMoreBtn.textContent = "See more...";
              seeMoreBtn.onclick = () => {
                  isCollapsed = !isCollapsed;
                  if (isCollapsed) {
                      contentEl.textContent = ann.content.substring(0, MAX_CHARS) + "...";
                      seeMoreBtn.textContent = "See more...";
                  } else {
                      contentEl.textContent = ann.content;
                      seeMoreBtn.textContent = "See less";
                  }
              };
          }
      } else {
          contentEl.textContent = ann.content;
          if (seeMoreBtn) {
              seeMoreBtn.style.display = "none";
          }
      }
  }

  const mediaContainer   = document.getElementById("annModalMedia");       // desktop left pane
  const mediaInline      = document.getElementById("annModalMediaInline"); // mobile inline body
  const modalCard        = document.getElementById("announcementModalCard");

  const isMobile = window.innerWidth <= 800;

  // Build separate HTML for each context — inline style sizes differ
  let desktopMediaHtml = "";
  let mobileMediaHtml  = "";
  if (ann.media_url) {
    if (ann.media_type === 'video') {
      desktopMediaHtml = `<video controls src="${escapeAttr(ann.media_url)}" style="width:100%;height:100%;object-fit:contain;background:#000;display:block;"></video>`;
      mobileMediaHtml  = `<video controls src="${escapeAttr(ann.media_url)}" style="width:100%;height:auto;max-height:300px;object-fit:cover;background:#000;display:block;"></video>`;
    } else {
      desktopMediaHtml = `<img src="${escapeAttr(ann.media_url)}" alt="Attachment" style="width:100%;height:100%;object-fit:contain;display:block;cursor:pointer;" onclick="openLightbox('${escapeAttr(ann.media_url)}')">`;
      mobileMediaHtml  = `<img src="${escapeAttr(ann.media_url)}" alt="Attachment" style="width:100%;height:auto;max-height:300px;object-fit:cover;display:block;cursor:pointer;" onclick="openLightbox('${escapeAttr(ann.media_url)}')">`;
    }
  }

  // ── Desktop left pane ────────────────────────────────────────
  if (mediaContainer) {
    if (ann.media_url && !isMobile) {
      mediaContainer.innerHTML = desktopMediaHtml;
      mediaContainer.style.display = "flex";
    } else {
      mediaContainer.innerHTML = "";
      mediaContainer.style.display = "none";
    }
  }

  // no-media class: only when the announcement truly has no media
  if (modalCard) {
    if (ann.media_url) {
      modalCard.classList.remove("no-media");
    } else {
      modalCard.classList.add("no-media");
    }
  }

  // ── Mobile inline body (caption → IMAGE → likes → comments) ──
  if (mediaInline) {
    if (ann.media_url && isMobile) {
      mediaInline.innerHTML = mobileMediaHtml;
      mediaInline.style.display = "block";
    } else {
      mediaInline.innerHTML = "";
      mediaInline.style.display = "none";
    }
  }

  document.getElementById("announcementModalOverlay").classList.add("open");
  document.getElementById("annLikeCount").innerText = "0";
  document.getElementById("annCommentsList").innerHTML = "";

  // Clean up like state
  const likeBtn  = document.getElementById("annLikeBtn");
  const likeIcon = document.getElementById("annLikeIcon");
  likeBtn.classList.remove("liked");
  likeIcon.classList.remove("fas");
  likeIcon.classList.add("far");
  currentAnnIsLiked = false;

  // Reset scroll to top BEFORE loading so the image is visible from the start
  const modalBody = document.querySelector("#announcementModalCard .ig-modal-body");
  if (modalBody) modalBody.scrollTop = 0;

  await loadAnnouncementSocials(id);

  // Safety net: reset scroll again after comments paint so any flex-layout shift
  // doesn't push the image out of view
  requestAnimationFrame(() => {
    if (modalBody) modalBody.scrollTop = 0;
  });
}

function closeAnnouncementModal() {
  document.getElementById("announcementModalOverlay").classList.remove("open");
  currentOpenAnnId = null;
  // Clear both media containers on close
  const mediaContainer = document.getElementById("annModalMedia");
  const mediaInline    = document.getElementById("annModalMediaInline");
  if (mediaContainer) { mediaContainer.innerHTML = ""; mediaContainer.style.display = "none"; }
  if (mediaInline)    { mediaInline.innerHTML = "";    mediaInline.style.display = "none"; }
}

function openLightbox(src) {
  const lightbox = document.getElementById("lightboxModal");
  const img = document.getElementById("lightboxImage");
  if (lightbox && img) {
    img.src = src;
    lightbox.classList.add("open");
  }
}

function closeLightbox() {
  const lightbox = document.getElementById("lightboxModal");
  const img = document.getElementById("lightboxImage");
  if (lightbox && img) {
    lightbox.classList.remove("open");
    setTimeout(() => { img.src = ""; }, 200); // clear src after animation
  }
}

let activeReplyParentId = null;
// Stores edit_history arrays keyed by comment id for the history modal.
const _commentHistoryCache = {};

function setReplyParent(parentId, name) {
  activeReplyParentId = parentId;
  
  // Show reply banner
  const banner = document.getElementById("annReplyBanner");
  const bannerText = document.getElementById("annReplyBannerText");
  if (banner && bannerText) {
    bannerText.innerHTML = `Replying to <strong style="color:var(--gold)">${escapeHtml(name)}</strong>`;
    banner.style.display = "flex";
  }
  
  const input = document.getElementById("annCommentInput");
  input.placeholder = "Write your reply...";
  input.focus();
}

function clearReplyParent() {
  activeReplyParentId = null;
  
  // Hide reply banner
  const banner = document.getElementById("annReplyBanner");
  if (banner) banner.style.display = "none";
  
  const input = document.getElementById("annCommentInput");
  if (input) input.placeholder = "Write a comment...";
}

async function loadAnnouncementSocials(id) {
  if (!supabaseClient) return;

  // Load likes
  try {
    const { data: likesData, error: lErr } = await supabaseClient
      .from("announcement_likes")
      .select("resident_id")
      .eq("announcement_id", id);
      
    if (!lErr && likesData) {
      document.getElementById("annLikeCount").innerText = likesData.length;
      if (currentUser && likesData.find(l => l.resident_id === currentUser.id)) {
        currentAnnIsLiked = true;
        const likeBtn = document.getElementById("annLikeBtn");
        const likeIcon = document.getElementById("annLikeIcon");
        likeBtn.classList.add("liked");
        likeIcon.classList.remove("far");
        likeIcon.classList.add("fas");
      }
    }
  } catch (e) {}

  // Load comments
  try {
    const { data: commentsData, error: cErr } = await supabaseClient
      .from("announcement_comments")
      .select(`
        id, content, created_at, parent_id, resident_id,
        is_deleted, edited_at, edit_history,
        profiles:resident_id ( full_name )
      `)
      .eq("announcement_id", id)
      .order("created_at", { ascending: true });

    if (!cErr && commentsData) {
      renderAnnComments(commentsData);
    }
  } catch (e) {}
}

/**
 * Recursively builds a threaded comment node for any depth level.
 * Supports soft-delete (replies preserved), edit history, and owner actions.
 * @param {Object} comment - The comment object from Supabase
 * @param {Object} commentMap - id -> comment lookup
 * @param {Object} childrenMap - parent_id -> child array lookup
 * @param {number} depth - Current nesting depth (0 = root)
 */
function buildCommentNode(comment, commentMap, childrenMap, depth) {
  const isDeleted = !!comment.is_deleted;
  const name = comment.profiles ? comment.profiles.full_name : "Resident";
  const d = new Date(comment.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isOwn = !!(currentUser && comment.resident_id === currentUser.id);
  const isEdited = !isDeleted && !!comment.edited_at;
  const safeId = escapeHtml(comment.id);

  // Cache edit history for the modal
  if (isEdited && comment.edit_history) {
    _commentHistoryCache[comment.id] = comment.edit_history;
  }

  // "Replying to" tag — shows [deleted] if parent was soft-deleted
  let replyToTag = "";
  if (comment.parent_id && commentMap[comment.parent_id]) {
    const parent = commentMap[comment.parent_id];
    const isParentDeleted = !!parent.is_deleted;
    const parentName = isParentDeleted ? "[deleted]" : (parent.profiles?.full_name || "Resident");
    replyToTag = `<div class="ann-reply-to-tag${isParentDeleted ? ' parent-deleted' : ''}"><i class="fas fa-reply"></i> <span>${escapeHtml(parentName)}</span></div>`;
  }

  // Build children recursively regardless of deleted state
  const children = childrenMap[comment.id] || [];
  const childrenHtml = children.map(child => buildCommentNode(child, commentMap, childrenMap, depth + 1)).join("");

  const isReply = depth > 0;
  const depthClass = isReply ? `ann-comment-item reply-depth-${Math.min(depth, 3)}` : "ann-comment-item";

  // ── DELETED COMMENT ──────────────────────────────────────────
  if (isDeleted) {
    return `
    <div class="ann-comment-thread ${isReply ? 'is-reply' : ''}">
      <div class="${depthClass} ann-comment-deleted-state">
        ${replyToTag}
        <div class="ann-deleted-msg"><i class="fas fa-circle-minus"></i> This comment was deleted.</div>
      </div>
      ${childrenHtml ? `<div class="ann-replies-list">${childrenHtml}</div>` : ""}
    </div>`;
  }

  // ── EDITED BADGE ─────────────────────────────────────────────
  const editedBadge = isEdited
    ? `<button class="ann-edited-badge" onclick="showCommentEditHistory('${safeId}')" title="See edit history"><i class="fas fa-pen-square"></i> edited</button>`
    : "";

  // ── OWNER ACTIONS (edit + delete, visible on hover) ──────────
  const ownerActions = isOwn
    ? `<div class="ann-owner-actions" id="ann-actions-${safeId}">
         <button class="ann-action-btn ann-edit-btn" onclick="startEditComment('${safeId}')" title="Edit"><i class="fas fa-pen"></i></button>
         <button class="ann-action-btn ann-delete-btn" onclick="deleteComment('${safeId}')" title="Delete"><i class="fas fa-trash"></i></button>
       </div>`
    : "";

  return `
    <div class="ann-comment-thread ${isReply ? 'is-reply' : ''}">
      <div class="${depthClass}" id="ann-bubble-${safeId}">
        ${replyToTag}
        <div class="ann-comment-header">
          <strong class="ann-commenter-name">${escapeHtml(name)}</strong>
          <div class="ann-comment-header-right">
            ${editedBadge}
            <span class="ann-comment-time">${d}</span>
            ${ownerActions}
          </div>
        </div>
        <div id="ann-body-${safeId}" data-content="${escapeAttr(comment.content)}">
          <p class="ann-comment-body">${escapeHtml(comment.content)}</p>
        </div>
        <button class="ann-reply-btn" id="ann-reply-btn-${safeId}" onclick="setReplyParent('${safeId}', '${escapeHtml(name)}')"><i class="fas fa-reply"></i> Reply</button>
      </div>
      ${childrenHtml ? `<div class="ann-replies-list">${childrenHtml}</div>` : ""}
    </div>`;
}

function renderAnnComments(comments) {
  const container = document.getElementById("annCommentsList");
  if (!comments || comments.length === 0) {
    container.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-size:13px;text-align:center;padding:10px 0;">No comments yet. Be the first to share your thoughts!</div>`;
    return;
  }
  
  // Build lookup maps for O(n) rendering of arbitrary depth trees
  const commentMap = {};
  const childrenMap = {};
  
  comments.forEach(c => {
    commentMap[c.id] = c;
    if (c.parent_id) {
      if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
      childrenMap[c.parent_id].push(c);
    }
  });
  
  // Only render root-level comments (parent_id is null)
  const rootComments = comments.filter(c => !c.parent_id);
  
  const html = rootComments.map(c => buildCommentNode(c, commentMap, childrenMap, 0)).join("");
  container.innerHTML = html;
}

// =============================================================================
// COMMENT EDIT / DELETE / HISTORY
// =============================================================================

/** Enters inline edit mode for a comment bubble. */
function startEditComment(id) {
  const bodyEl   = document.getElementById(`ann-body-${id}`);
  const actionsEl = document.getElementById(`ann-actions-${id}`);
  const replyBtn  = document.getElementById(`ann-reply-btn-${id}`);
  if (!bodyEl) return;

  const currentContent = bodyEl.dataset.content ||
    bodyEl.querySelector('.ann-comment-body')?.textContent || '';
  bodyEl.dataset.originalContent = currentContent;

  bodyEl.innerHTML = `
    <textarea id="ann-edit-input-${id}" class="ann-edit-textarea">${escapeHtml(currentContent)}</textarea>
    <div class="ann-edit-btns">
      <button class="ann-edit-save-btn" onclick="saveEditComment('${id}')"><i class='fas fa-check'></i> Save</button>
      <button class="ann-edit-cancel-btn" onclick="cancelEditComment('${id}')"><i class='fas fa-times'></i> Cancel</button>
    </div>`;

  if (actionsEl) actionsEl.style.display = 'none';
  if (replyBtn)  replyBtn.style.display  = 'none';
  document.getElementById(`ann-edit-input-${id}`)?.focus();
}

/** Restores the original comment content, cancelling the edit state. */
function cancelEditComment(id) {
  const bodyEl    = document.getElementById(`ann-body-${id}`);
  const actionsEl = document.getElementById(`ann-actions-${id}`);
  const replyBtn  = document.getElementById(`ann-reply-btn-${id}`);
  if (!bodyEl) return;

  const original = bodyEl.dataset.originalContent || bodyEl.dataset.content || '';
  bodyEl.innerHTML = `<p class="ann-comment-body">${escapeHtml(original)}</p>`;

  if (actionsEl) actionsEl.style.display = '';
  if (replyBtn)  replyBtn.style.display  = '';
}

/**
 * Saves an edited comment:
 *   - Fetches the existing edit_history from Supabase
 *   - Pushes the old content into the array
 *   - Updates content, edited_at, and edit_history
 */
async function saveEditComment(id) {
  if (!currentUser || !supabaseClient) return;

  const bodyEl  = document.getElementById(`ann-body-${id}`);
  const inputEl = document.getElementById(`ann-edit-input-${id}`);
  if (!bodyEl || !inputEl) return;

  const newContent = inputEl.value.trim();
  if (!newContent) { showToast('Comment cannot be empty.', 'error'); return; }

  const oldContent = bodyEl.dataset.originalContent || '';

  // Fetch current history before appending
  const { data: existing } = await supabaseClient
    .from('announcement_comments')
    .select('edit_history')
    .eq('id', id)
    .maybeSingle();

  const history = Array.isArray(existing?.edit_history) ? existing.edit_history : [];
  history.push({ content: oldContent, edited_at: new Date().toISOString() });

  const { error } = await supabaseClient
    .from('announcement_comments')
    .update({
      content: newContent,
      edited_at: new Date().toISOString(),
      edit_history: history
    })
    .eq('id', id);

  if (error) {
    showToast('Failed to save edit.', 'error');
  } else {
    showToast('Comment updated.');
    loadAnnouncementSocials(currentOpenAnnId);
  }
}

/**
 * Soft-deletes a comment: marks is_deleted=true so replies are preserved
 * but the content is replaced with a "deleted" placeholder in the UI.
 * Shows an inline Yes/No confirm instead of a browser dialog.
 */
function deleteComment(id) {
  if (!currentUser || !supabaseClient) return;

  const actionsEl = document.getElementById(`ann-actions-${id}`);
  if (!actionsEl) return;

  // Replace action buttons with inline confirmation
  actionsEl.innerHTML = `
    <span style="font-size:11px;color:rgba(255,255,255,0.45);margin-right:2px;">Delete?</span>
    <button class="ann-action-btn ann-confirm-yes" onclick="_confirmDeleteComment('${id}')" title="Confirm"><i class="fas fa-check"></i></button>
    <button class="ann-action-btn" onclick="_cancelDeleteComment('${id}')" title="Cancel"><i class="fas fa-times"></i></button>`;
}

function _cancelDeleteComment(id) {
  const actionsEl = document.getElementById(`ann-actions-${id}`);
  if (!actionsEl) return;
  actionsEl.innerHTML = `
    <button class="ann-action-btn ann-edit-btn" onclick="startEditComment('${id}')" title="Edit"><i class="fas fa-pen"></i></button>
    <button class="ann-action-btn ann-delete-btn" onclick="deleteComment('${id}')" title="Delete"><i class="fas fa-trash"></i></button>`;
}

async function _confirmDeleteComment(id) {
  const { error } = await supabaseClient
    .from('announcement_comments')
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) {
    showToast('Failed to delete comment.', 'error');
    _cancelDeleteComment(id);
  } else {
    showToast('Comment deleted.');
    loadAnnouncementSocials(currentOpenAnnId);
  }
}

/**
 * Opens the edit-history modal for the given comment id.
 * History is keyed in _commentHistoryCache, set during renderAnnComments.
 */
function showCommentEditHistory(id) {
  const modal = document.getElementById('commentEditHistoryModal');
  const list  = document.getElementById('commentEditHistoryList');
  if (!modal || !list) return;

  const history = _commentHistoryCache[id] || [];

  if (!history.length) {
    list.innerHTML = `<p style="color:rgba(255,255,255,0.35);text-align:center;font-size:13px;padding:16px 0;">No edit history found for this comment.</p>`;
  } else {
    // Display most-recent first (the last push = last edit = most recent earlier version)
    const items = [...history].reverse();
    list.innerHTML = items.map((entry, i) => {
      const vNum = history.length - i;
      const ts = new Date(entry.edited_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      return `
      <div class="edit-history-entry">
        <div class="edit-history-meta">
          <span class="edit-history-ver">v${vNum}</span>
          <span class="edit-history-time">${ts}</span>
        </div>
        <p class="edit-history-content">${escapeHtml(entry.content)}</p>
      </div>`;
    }).join('');
  }

  modal.classList.add('open');
}

function closeCommentEditHistoryModal() {
  document.getElementById('commentEditHistoryModal')?.classList.remove('open');
}

// -----------------------------------------------------------------------------
// FEATURE: Interactive Community Announcements (Likes & Comments)
// -----------------------------------------------------------------------------

/**
 * Toggles the "Like" status of the currently open announcement.
 * - Guards against unauthenticated guests.
 * - Optimistically updates the UI counter and icon before server response for responsiveness.
 * - Interfaces securely with `announcement_likes` Supabase table via RLS.
 */
async function toggleAnnouncementLike() {
  if (!currentUser) return requireLogin("like announcements");
  if (!currentOpenAnnId) return;

  const btn = document.getElementById("annLikeBtn");
  const icon = document.getElementById("annLikeIcon");
  const countEl = document.getElementById("annLikeCount");
  let count = parseInt(countEl.innerText) || 0;

  const ann = announcementsData.find(a => a.id === currentOpenAnnId);

  if (currentAnnIsLiked) {
    // Unliking: Revert UI state immediately (optimistic UI)
    btn.classList.remove("liked");
    icon.classList.remove("fas");
    icon.classList.add("far");
    countEl.innerText = Math.max(0, count - 1);
    currentAnnIsLiked = false;
    
    if (ann) {
      if (!ann.likes) ann.likes = [];
      ann.likes = ann.likes.filter(id => id !== currentUser.id);
    }
    renderAnnouncementsPage();
    renderPortalAnnouncementsMini();
    renderAnnouncementsSidebar();

    // Perform secure delete constrained by RLS (user can only delete their own like)
    await supabaseClient.from("announcement_likes")
      .delete()
      .eq("announcement_id", currentOpenAnnId)
      .eq("resident_id", currentUser.id);
  } else {
    // Liking: Update UI state immediately
    btn.classList.add("liked");
    icon.classList.remove("far");
    icon.classList.add("fas");
    countEl.innerText = count + 1;
    currentAnnIsLiked = true;
    
    if (ann) {
      if (!ann.likes) ann.likes = [];
      if (!ann.likes.includes(currentUser.id)) {
        ann.likes.push(currentUser.id);
      }
    }
    renderAnnouncementsPage();
    renderPortalAnnouncementsMini();
    renderAnnouncementsSidebar();

    // Perform secure insert
    await supabaseClient.from("announcement_likes")
      .insert({ announcement_id: currentOpenAnnId, resident_id: currentUser.id });
  }
}

async function toggleLikeFromFeed(annId, event) {
  if (event) event.stopPropagation();
  if (!currentUser) return requireLogin("like announcements");

  const ann = announcementsData.find(a => a.id === annId);
  if (!ann) return;

  if (!ann.likes) ann.likes = [];
  const isAlreadyLiked = ann.likes.includes(currentUser.id);

  // Optimistic UI updates
  if (isAlreadyLiked) {
    ann.likes = ann.likes.filter(id => id !== currentUser.id);
  } else {
    ann.likes.push(currentUser.id);
  }

  // Re-render feed elements immediately for responsiveness
  renderAnnouncementsPage();
  renderPortalAnnouncementsMini();
  renderAnnouncementsSidebar();

  // If the same announcement details modal is currently open, update its elements
  if (currentOpenAnnId === annId) {
    currentAnnIsLiked = !isAlreadyLiked;
    const countEl = document.getElementById("annLikeCount");
    const modalBtn = document.getElementById("annLikeBtn");
    const modalIcon = document.getElementById("annLikeIcon");
    if (countEl) countEl.innerText = ann.likes.length;
    if (modalBtn && modalIcon) {
      if (currentAnnIsLiked) {
        modalBtn.classList.add("liked");
        modalIcon.classList.remove("far");
        modalIcon.classList.add("fas");
      } else {
        modalBtn.classList.remove("liked");
        modalIcon.classList.remove("fas");
        modalIcon.classList.add("far");
      }
    }
  }

  try {
    if (isAlreadyLiked) {
      await supabaseClient
        .from("announcement_likes")
        .delete()
        .eq("announcement_id", annId)
        .eq("resident_id", currentUser.id);
    } else {
      await supabaseClient
        .from("announcement_likes")
        .insert({
          announcement_id: annId,
          resident_id: currentUser.id
        });
    }
  } catch (err) {
    // Revert state on error
    if (isAlreadyLiked) {
      ann.likes.push(currentUser.id);
    } else {
      ann.likes = ann.likes.filter(id => id !== currentUser.id);
    }
    renderAnnouncementsPage();
    renderPortalAnnouncementsMini();
    renderAnnouncementsSidebar();
    showToast("Error updating like status", "error");
  }
}

// ─────────────────────────────────────────────────────────────
// PROFANITY FILTER — Client-side Layer 1
// Auto-censors prohibited words before they reach the database.
// The database trigger (Layer 2) provides a server-side backup
// that cannot be bypassed even by direct API calls.
// ─────────────────────────────────────────────────────────────

const PROFANITY_LIST = [
  // English
  "fuck", "f*ck", "fucker", "fucking", "fucked", "fck",
  "shit", "sh*t", "shitty", "bullshit",
  "bitch", "b*tch", "bitches",
  "asshole", "ass", "a**hole",
  "bastard", "damn", "crap",
  "cunt", "c*nt", "dick", "cock", "pussy",
  "whore", "slut", "retard", "idiot", "moron", "stupid",
  "nigger", "nigga", "faggot", "fag",
  // Filipino / Tagalog
  "putang ina", "putangina", "puta", "p*ta", "puta",
  "gago", "gaga", "bobo", "boba",
  "tangina", "tang ina", "tanginamo",
  "leche", "letse",
  "tarantado", "tanga", "ulol",
  "pakyu", "pak yu", "pakyo",
  "hudas", "inutil",
  "hayop", "hayop ka",
  "hinayupak", "putik",
  "lintik", "kingina", "kingkong",
  "putang", "inamo", "ina mo",
  "kingina mo", "kingina",
  "anak ng puta", "anakng puta",
  "shet", "sh*t",
  "amputa", "ampota",
];

/**
 * Replaces profane words/phrases in a string with asterisks.
 * Uses whole-word and phrase matching, case-insensitive.
 * Returns the cleaned string and a flag indicating if any censoring occurred.
 */
function applyProfanityFilter(text) {
  let cleaned = text;
  let wasCensored = false;

  // Sort by length descending so multi-word phrases are matched first
  const sorted = [...PROFANITY_LIST].sort((a, b) => b.length - a.length);

  for (const word of sorted) {
    // Escape special regex characters in the phrase
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match whole word/phrase, case-insensitive, with word boundaries or spaces
    const pattern = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "gi");
    if (pattern.test(cleaned)) {
      wasCensored = true;
      cleaned = cleaned.replace(pattern, (match) => "*".repeat(match.length));
    }
  }

  return { cleaned, wasCensored };
}

/**
 * Submits a new comment to an announcement.
 * - Ensures input contains text to prevent empty payloads.
 * - Applies client-side profanity filter before sending.
 * - Disables input during network transaction to prevent spamming.
 */
async function postAnnouncementComment() {
  if (!currentUser) return requireLogin("comment on announcements");
  if (!currentOpenAnnId) return;

  const input = document.getElementById("annCommentInput");
  const rawText = input.value.trim();
  if (!rawText) return;

  // Layer 1: Apply client-side profanity filter
  const { cleaned: text, wasCensored } = applyProfanityFilter(rawText);

  // Disable user input to prevent duplicate submission clicks
  input.disabled = true;

  const payload = {
    announcement_id: currentOpenAnnId,
    resident_id: currentUser.id,
    content: text
  };

  // Append parent ID if this is a nested reply
  if (activeReplyParentId) {
    payload.parent_id = activeReplyParentId;
  }

  // Submit securely to Supabase (Layer 2 DB trigger also runs server-side)
  const { error } = await supabaseClient.from("announcement_comments").insert(payload);

  // Re-enable and reset on success
  input.disabled = false;
  if (error) {
    showToast("Failed to post comment.", "error");
  } else {
    input.value = "";
    clearReplyParent();
    if (wasCensored) {
      showToast("Your comment was posted. Some language was filtered.", "success");
    }
    // Dispatch full reload of comments to pull new data including user profile name
    loadAnnouncementSocials(currentOpenAnnId);
  }
}

function renderAnnouncementsSidebar() {
  const el = document.getElementById("announcementsFeed");
  if (!el) return;

  const LIMIT = 3;
  const all = announcementsData;
  const visible = all.slice(0, LIMIT);
  const hidden  = all.slice(LIMIT);

  let html = visible.map(buildAnnCard).join("");

  if (hidden.length > 0) {
    const hiddenHtml = hidden.map(buildAnnCard).join("");
    html += `
      <div id="annSidebarExtra" style="display:none">${hiddenHtml}</div>
      <button onclick="toggleAnnSidebar(this)" style="
        width:100%;margin:6px 0 2px;padding:7px 0;background:rgba(255,255,255,0.04);
        border:1px solid var(--glass-border);border-radius:8px;color:var(--text-muted);
        font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.3px;
        transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
        <i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${hidden.length} more announcement${hidden.length > 1 ? 's' : ''}
      </button>`;
  }

  el.innerHTML = html;
}

function toggleAnnSidebar(btn) {
  const extra = document.getElementById("annSidebarExtra");
  if (!extra) return;
  const isHidden = extra.style.display === "none";
  extra.style.display = isHidden ? "block" : "none";
  btn.innerHTML = isHidden
    ? `<i class="fas fa-chevron-up" style="margin-right:5px"></i>Show less`
    : `<i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${announcementsData.length - 3} more announcement${announcementsData.length - 3 > 1 ? 's' : ''}`;
}

function renderAnnouncementsPage() {
  const el = document.getElementById("communityAnnouncementsFeed");
  if (!el) return;
  
  const LIMIT = 2;
  const all = announcementsData;
  const visible = all.slice(0, LIMIT);
  const hidden  = all.slice(LIMIT);

  let html = visible.map(buildAnnCard).join("");

  if (hidden.length > 0) {
    const hiddenHtml = hidden.map(buildAnnCard).join("");
    html += `
      <div id="annPageExtra" style="display:none">${hiddenHtml}</div>
      <button onclick="toggleAnnPage(this)" style="
        width:100%;margin:12px 0 2px;padding:9px 0;background:rgba(255,255,255,0.04);
        border:1px solid var(--glass-border);border-radius:8px;color:var(--text-muted);
        font-size:12.5px;font-weight:600;cursor:pointer;letter-spacing:0.3px;
        transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
        <i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${hidden.length} more announcement${hidden.length > 1 ? 's' : ''}
      </button>`;
  }

  el.innerHTML = html;
}

window.toggleAnnPage = function(btn) {
  const extra = document.getElementById("annPageExtra");
  if (!extra) return;
  const isHidden = extra.style.display === "none";
  extra.style.display = isHidden ? "block" : "none";
  btn.innerHTML = isHidden
    ? `<i class="fas fa-chevron-up" style="margin-right:5px"></i>Show less`
    : `<i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${announcementsData.length - 2} more announcement${announcementsData.length - 2 > 1 ? 's' : ''}`;
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
    <div class="top-worker-item" onclick="handleWorkerContact('${escapeAttr(w.name)}','${escapeAttr(w.specialty)}','${escapeAttr(w.phone)}','${escapeAttr(w.email)}','${escapeAttr(w.id || '')}')">
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
    grid.innerHTML = "<tr><td colspan=\"4\" style=\"text-align:center;padding:40px;color:var(--text-dim)\">No workers match your filters.</td></tr>";
    return;
  }

  grid.innerHTML = workers.map((w) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;color:var(--gold);">
            <i class="fas fa-user"></i>
          </div>
          <span style="font-weight:500;color:var(--text-main);">${escapeHtml(w.name)}</span>
        </div>
      </td>
      <td style="color:var(--text-dim);">${escapeHtml(w.specialty)}</td>
      <td style="color:var(--text-main);"><i class="fas fa-location-dot" style="color:var(--text-dim); margin-right:6px;"></i>${escapeHtml(w.barangay || "Unassigned")}</td>
      <td>
        <button class="btn-gold" style="padding:6px 14px;font-size:12px;" onclick="handleWorkerContact('${escapeAttr(w.name)}','${escapeAttr(w.specialty)}','${escapeAttr(w.phone)}','${escapeAttr(w.email)}','${escapeAttr(w.id || '')}')">
          <i class="fas fa-address-book"></i> Contact
        </button>
      </td>
    </tr>
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

async function handleWorkerContact(name, specialty, phone, email, workerId) {
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
  if (purposeWrap) purposeWrap.style.display = "block";

  const photoWrap = document.getElementById("applyPhotoWrap");
  if (photoWrap) {
    photoWrap.style.display = (docName === "Barangay ID") ? "block" : "none";
    const photoInput = document.getElementById("applyPhoto");
    if (photoInput) {
      photoInput.required = (docName === "Barangay ID");
    }
  }

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
      showToast("Please login to update your profile.", "error");
      return;
    }

    const fullName = document.getElementById("profileEditFullName")?.value.trim() || "";
    const barangay = document.getElementById("profileEditBarangay")?.value.trim() || "";
    const phone = document.getElementById("profileEditPhone")?.value.trim() || null;

    if (!fullName || !barangay) {
      showToast("Full name and barangay are required.", "error");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...'; }

    try {
      let payload = { full_name: fullName, barangay, phone };
      let { error } = await supabaseClient.from("profiles").update(payload).eq("id", currentUser.id);

      if (error && String(error.message || "").toLowerCase().includes("column") && String(error.message || "").toLowerCase().includes("barangay")) {
        payload = { full_name: fullName, barangay_name: barangay, phone };
        ({ error } = await supabaseClient.from("profiles").update(payload).eq("id", currentUser.id));
      }

      if (error) {
        showToast(error.message, "error");
        return;
      }

      const { data: refreshed } = await supabaseClient
        .from("profiles")
        .select("id,full_name,email,phone,barangay,role,created_at")
        .eq("id", currentUser.id)
        .maybeSingle();

      currentProfile = refreshed || currentProfile;

      const parsedName = parseFullName(currentProfile?.full_name || fullName);
      const resolvedBarangay = currentProfile?.barangay || barangay;
      applyLoggedInUI({
        firstName: parsedName.firstName,
        lastName: parsedName.lastName,
        email: currentProfile?.email || currentUser.email,
        barangay: resolvedBarangay,
        memberSince: currentProfile?.created_at
      });

      closeProfileModal();
      showToast("Profile updated successfully.");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
  });
}

function openProfileModal() {
  const nameInput = document.getElementById("profileEditFullName");
  const emailInput = document.getElementById("profileEditEmail");
  const barangayInput = document.getElementById("profileEditBarangay");
  const phoneInput = document.getElementById("profileEditPhone");

  if (nameInput) nameInput.value = currentProfile?.full_name || [currentUser?.user_metadata?.full_name, currentUser?.user_metadata?.name].find(Boolean) || "";
  if (emailInput) emailInput.value = currentUser?.email || currentProfile?.email || "";
  if (barangayInput) barangayInput.value = currentProfile?.barangay || currentUser?.user_metadata?.barangay || "";
  if (phoneInput) phoneInput.value = currentProfile?.phone || "";

  document.getElementById("profileModal")?.classList.add("open");
}

function closeProfileModal() {
  document.getElementById("profileModal")?.classList.remove("open");
}

function showChangePasswordForm() {
  closeProfileModal();
  document.getElementById("changePasswordModal")?.classList.add("open");
  document.getElementById("changePasswordForm")?.reset();
}

function closeChangePasswordModal() {
  document.getElementById("changePasswordModal")?.classList.remove("open");
}

// Sends a password-reset email to the currently signed-in user's address.
// Because the user IS logged in, we know their email — no redirect needed.
async function openPortalForgotPassword() {
  if (!supabaseClient || !currentUser) {
    showToast("Please make sure you are logged in.", "error");
    return;
  }

  const email = currentUser.email;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/login.html#reset"
  });

  if (error) {
    showToast(error.message || "Failed to send reset email.", "error");
    return;
  }

  closeChangePasswordModal();
  showToast(`Password reset email sent to ${email}. Check your inbox and follow the link.`);
}

function setupChangePasswordForm() {
  document.getElementById("changePasswordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser || !supabaseClient) {
      showToast("Please login to change password.", "error");
      return;
    }

    const currentPassword = document.getElementById("currentPassword")?.value || "";
    const newPassword = document.getElementById("newPassword")?.value || "";
    const confirmPassword = document.getElementById("confirmNewPassword")?.value || "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("All password fields are required.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters.", "error");
      return;
    }

    if (currentPassword === newPassword) {
      showToast("New password must be different from current password.", "error");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...'; }

    try {
      // First, verify the current password by attempting to sign in
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      });

      if (signInError) {
        showToast("Current password is incorrect.", "error");
        return;
      }

      // If verification succeeds, update the password
      const { error: updateError } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        showToast(updateError.message || "Failed to update password.", "error");
        return;
      }

      // Clear the form and close modal
      document.getElementById("changePasswordForm")?.reset();
      closeChangePasswordModal();
      showToast("Password changed successfully.");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
  });
}

// Resident document request submit handler (insert -> refresh tracker).
function setupApplyForm() {
  document.getElementById("applyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser || !supabaseClient) {
      showToast("Please login to submit applications.", "error");
      return;
    }

    const fullName = (document.getElementById("applyFullName")?.value || "").trim();
    const address = (document.getElementById("applyAddress")?.value || "").trim();
    const purpose = (document.getElementById("applyPurpose")?.value || "").trim();

    if (!fullName) {
      showToast("Full Name is required.", "error");
      return;
    }
    if (!address) {
      showToast("Address is required.", "error");
      return;
    }
    if (!purpose) {
      showToast("Purpose is required.", "error");
      return;
    }

    let photoUrl = null;
    const photoInput = document.getElementById("applyPhoto");
    const file = photoInput?.files ? photoInput.files[0] : null;

    if (applyModalDocName === "Barangay ID" && !file) {
      showToast("Photo is required for Barangay ID request.", "error");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...'; }

    try {
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from("issue-reports")
          .upload(fileName, file, { upsert: false });

        if (uploadError) {
          showToast("Photo upload failed: " + uploadError.message, "error");
          return;
        }

        const { data: urlData } = supabaseClient.storage
          .from("issue-reports")
          .getPublicUrl(fileName);

        if (urlData && urlData.publicUrl) {
          photoUrl = urlData.publicUrl;
        }
      }

      // Update local profile full_name if it is different or empty, to keep data consistent.
      if (currentProfile && currentProfile.full_name !== fullName) {
        await supabaseClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", currentUser.id);
        currentProfile.full_name = fullName;
      }

      const { error } = await supabaseClient.from("document_requests").insert({
        resident_id: currentUser.id,
        barangay: currentProfile?.barangay || currentUser?.user_metadata?.barangay || "Barangay Poblacion",
        address: address,
        request_type: applyModalDocName,
        purpose,
        photo_url: photoUrl,
        status: "submitted"
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      closeApplyModal();
      await loadUserApplications();
      renderUserApplications();
      renderDocRecentApps();
      renderPortalStatCards();
      showToast(`${applyModalDocName} application submitted.`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
  });
}

function renderUserApplications() {
  const tbody = document.getElementById("userApplicationsBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Approved: "processing", Completed: "active", Resolved: "active" };

  tbody.innerHTML = userApplications.map((a) => `
    <tr>
      <td><strong>${escapeHtml(a.doc)}</strong></td>
      <td style="color:rgba(255,255,255,0.45)">${escapeHtml(a.date)}</td>
      <td><span class="tpill ${pillMap[a.status] || "pending"}">${escapeHtml(a.status)}</span></td>
      <td><button class="track-btn" onclick="openTrackModal('${escapeAttrJs(a.id)}','${escapeAttrJs(a.doc)}','${escapeAttrJs(a.date)}','${escapeAttrJs(a.status)}','${escapeAttrJs(a.rawStatus)}')"><i class="fas fa-map-marker-alt"></i> Track</button></td>
    </tr>
  `).join("");
}

function renderDocRecentApps() {
  const tbody = document.getElementById("docRecentAppsBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Approved: "processing", Completed: "active" };
  tbody.innerHTML = userApplications.slice(0, 3).map((a) => `
    <tr>
      <td><strong>${escapeHtml(a.doc)}</strong></td>
      <td style="color:rgba(255,255,255,0.45)">${escapeHtml(a.date)}</td>
      <td><span class="tpill ${pillMap[a.status] || "pending"}">${escapeHtml(a.status)}</span></td>
      <td><button class="track-btn" onclick="openTrackModal('${escapeAttrJs(a.id)}','${escapeAttrJs(a.doc)}','${escapeAttrJs(a.date)}','${escapeAttrJs(a.status)}','${escapeAttrJs(a.rawStatus)}')"><i class="fas fa-map-marker-alt"></i> Track</button></td>
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

    const barangay = document.getElementById("reportBarangay")?.value;
    const category = document.getElementById("reportCategory")?.value;
    const location = document.getElementById("reportLocation")?.value;
    const description = document.getElementById("reportDescription")?.value || "";

    if (!barangay) {
      showToast("Please select a barangay.", "error");
      return;
    }

    if (!category) {
      showToast("Please select a category.", "error");
      return;
    }

    if (!location || !location.trim()) {
      showToast("Please provide a location.", "error");
      return;
    }

    if (category === "Other" && !description.trim()) {
      showToast("Please provide a description for the 'Other' category.", "error");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Uploading...'; }

    try {
      const fileInput = document.getElementById("reportPhoto");
      const file = fileInput?.files[0];
      let photoUrl = null;

      if (!file) {
        showToast("Please upload a photo for verification.", "error");
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("issue-reports")
        .upload(fileName, file, { upsert: false });

      if (uploadError) {
        showToast("Photo upload failed: " + uploadError.message, "error");
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        return;
      }

      const { data: urlData } = supabaseClient.storage
        .from("issue-reports")
        .getPublicUrl(fileName);
      
      if (urlData && urlData.publicUrl) {
        photoUrl = urlData.publicUrl;
      }

      const { error } = await supabaseClient.from("issue_reports").insert({
        resident_id: currentUser.id,
        category,
        location,
        description,
        status: "pending",
        barangay,
        photo_url: photoUrl
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      e.target.reset();
      await loadIssueReports();
      populateReportBarangayOptions();
      renderReportsTable();
      showToast("Issue report submitted successfully.");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
  });
}

async function populateReportBarangayOptions() {
  if (!supabaseClient) return;

  const select = document.getElementById("reportBarangay");
  if (!select) return;

  const { data } = await supabaseClient
    .from("barangays")
    .select("name")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (!data?.length) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">Select barangay...</option>';
  data.forEach((item) => {
    const display = item.name;
    const value = display;

    select.insertAdjacentHTML("beforeend", `<option value="${value}">${display}</option>`);
  });

  if (currentValue) {
    select.value = currentValue;
  }
}


function renderReportsTable() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  const pillMap = { Pending: "pending", Processing: "processing", Resolved: "active" };
  const buildRow = (r) => `
    <tr>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td style="text-align:left;padding-left:0"><span style="font-size:11px;background:rgba(212,165,116,0.12);color:var(--gold);border:1px solid rgba(212,165,116,0.25);border-radius:10px;padding:2px 8px;white-space:nowrap;display:inline-block;"><i class="fas fa-map-marker-alt" style="margin-right:4px;font-size:10px;"></i>${escapeHtml(r.barangay)}</span></td>
      <td style="color:rgba(255,255,255,0.4)">${escapeHtml(r.date)}</td>
      <td><span class="tpill ${pillMap[r.status] || "pending"}">${escapeHtml(r.status)}</span></td>
    </tr>`;

  const LIMIT = 5;
  const visible = reportsData.slice(0, LIMIT);
  const hidden  = reportsData.slice(LIMIT);

  tbody.innerHTML = visible.map(buildRow).join("");

  const existingToggle = document.getElementById("reportsTableToggleRow");
  if (existingToggle) existingToggle.remove();

  if (hidden.length > 0) {
    const toggleRow = document.createElement("tr");
    toggleRow.id = "reportsTableToggleRow";
    toggleRow.innerHTML = `<td colspan="5" style="text-align:center;padding:8px 0">
      <button onclick="toggleReportRows(this)" style="
        background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);
        color:var(--text-muted);font-size:12px;font-weight:600;padding:5px 18px;
        border-radius:8px;cursor:pointer;">
        <i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${hidden.length} more report${hidden.length > 1 ? "s" : ""}
      </button>
    </td>`;
    tbody.appendChild(toggleRow);
    tbody.dataset.hiddenRows = hidden.map(buildRow).join("");
    tbody.dataset.hiddenCount = hidden.length;
  }
}

function toggleReportRows(btn) {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;
  const toggleRow = document.getElementById("reportsTableToggleRow");
  const isCollapsed = btn.innerHTML.includes("fa-chevron-down");

  if (isCollapsed) {
    toggleRow.insertAdjacentHTML("beforebegin", tbody.dataset.hiddenRows || "");
    btn.innerHTML = `<i class="fas fa-chevron-up" style="margin-right:5px"></i>Show less`;
  } else {
    [...tbody.querySelectorAll("tr")].slice(5).forEach(r => { if (r.id !== "reportsTableToggleRow") r.remove(); });
    btn.innerHTML = `<i class="fas fa-chevron-down" style="margin-right:5px"></i>Show ${tbody.dataset.hiddenCount} more report${Number(tbody.dataset.hiddenCount) > 1 ? "s" : ""}`;
  }
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
  if (e.target.id === "rateWorkerModal") closeRateWorkerModal();
  if (e.target.id === "markJobDoneModal") closeMarkJobDoneModal();
  if (e.target.id === "profileModal") closeProfileModal();
  if (e.target.id === "changePasswordModal") closeChangePasswordModal();
  if (e.target.id === "announcementModal") closeAnnouncementModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeLoginModal();
  closeApplyModal();
  closeContactModal();
  closeMarkJobDoneModal();
  closeProfileModal();
  closeChangePasswordModal();
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
function showToast(msg, type = "success") {
  const el = document.getElementById("portalToast");
  const span = document.getElementById("portalToastMsg");
  if (!el || !span) return;

  span.textContent = msg;

  const icon = el.querySelector("i");
  if (type === "error") {
      el.classList.add("error");
      if (icon) icon.className = "fas fa-exclamation-circle";
  } else {
      el.classList.remove("error");
      if (icon) icon.className = "fas fa-check-circle";
  }

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
  if (v.includes("barangay id") || v === "id") return "id";
  if (v.includes("clearance")) return "clearance";
  if (v.includes("indigency")) return "indigency";
  if (v.includes("residency")) return "residency";
  return "seeker";
}

function mapDocStatus(status) {
  const v = String(status || "").toLowerCase();
  if (v === "submitted" || v === "pending") return "Pending";
  if (v === "reviewing" || v === "processing") return "Processing";
  if (v === "approved") return "Approved";
  if (v === "completed" || v === "archived") return "Completed";
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
      seeker: 0,
      indigency: 0,
      residency: 0
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

// ─────────────────────────────────────────────────────────────
// NOTIFICATION BELL SYSTEM
// ─────────────────────────────────────────────────────────────

let notifData = [];          // all admin_messages for this user
let notifPanelOpen = false;

// Loads messages from admin_messages table addressed to current user.
async function loadNotifications() {
  if (!supabaseClient || !currentUser) return;

  const email = currentUser.email;
  if (!email) return;

  const { data, error } = await supabaseClient
    .from("admin_messages")
    .select("id, subject, message, created_at, document_request_id, read_at")
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[Notifications] Could not load admin_messages:", error.message);
    return;
  }

  notifData = data || [];
  renderNotifBell();
}

// Updates the bell badge count with unread messages.
function renderNotifBell() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;

  const unread = notifData.filter((n) => !n.read_at).length;

  if (unread > 0) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.remove("d-none");
  } else {
    badge.classList.add("d-none");
  }
}

function toggleNotifPanel() {
  notifPanelOpen ? closeNotifPanel() : openNotifPanel();
}

function openNotifPanel() {
  const panel   = document.getElementById("notifPanel");
  const overlay = document.getElementById("notifOverlay");
  if (!panel) return;

  renderNotifPanel();
  panel.classList.add("open");
  overlay?.classList.add("active");
  notifPanelOpen = true;

  // Optimistically mark all as read in the UI after 1.5 s (they've seen them).
  setTimeout(markAllNotifRead, 1500);
}

function closeNotifPanel() {
  const panel   = document.getElementById("notifPanel");
  const overlay = document.getElementById("notifOverlay");
  panel?.classList.remove("open");
  overlay?.classList.remove("active");
  notifPanelOpen = false;
}

// Renders the list of notifications inside the panel.
function renderNotifPanel() {
  const body  = document.getElementById("notifPanelBody");
  const empty = document.getElementById("notifEmpty");
  if (!body) return;

  if (!notifData.length) {
    if (empty) empty.classList.remove("d-none");
    return;
  }
  if (empty) empty.classList.add("d-none");

  const items = notifData.map((n) => {
    const isUnread = !n.read_at;
    const when = n.created_at
      ? new Date(n.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";

    const onClick = n.document_request_id ? `onclick="openTrackFromNotif('${escapeAttrJs(n.document_request_id)}')" style="cursor:pointer;"` : '';

    return `
      <div class="notif-item${isUnread ? " unread" : ""}" ${onClick}>
        <div class="notif-item-icon"><i class="fas fa-envelope-open-text"></i></div>
        <div class="notif-item-content">
          <div class="notif-item-subject">${escapeHtml(n.subject || "Message from Barangay")}</div>
          <div class="notif-item-body">${escapeHtml((n.message || "").substring(0, 120))}${(n.message || "").length > 120 ? "…" : ""}</div>
          <div class="notif-item-time"><i class="fas fa-clock"></i> ${when}</div>
        </div>
        ${isUnread ? '<span class="notif-unread-dot"></span>' : ""}
      </div>`;
  }).join("");

  // Keep empty placeholder in the DOM but hidden, then prepend items.
  body.innerHTML = items + (notifData.length ? "" : "");
  if (empty) body.appendChild(empty);
}

// Marks all notifications as read in Supabase and updates the bell.
async function markAllNotifRead() {
  const unreadIds = notifData.filter((n) => !n.read_at).map((n) => n.id);
  if (!unreadIds.length) return;

  if (supabaseClient) {
    await supabaseClient
      .from("admin_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }

  // Update local state.
  notifData = notifData.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
  renderNotifBell();
  renderNotifPanel();
}

function openTrackFromNotif(docId) {
  closeNotifPanel();
  const doc = userApplications.find(a => a.id === docId);
  if (doc) {
    openTrackModal(doc.id, doc.doc, doc.date, doc.status, doc.rawStatus);
  } else {
    // If it's an old document not in the regular list, we just fetch it real quick.
    supabaseClient.from("document_requests").select("id, request_type, status, created_at").eq("id", docId).single()
      .then(({data}) => {
         if (data) {
            const dateStr = formatDate(new Date(data.created_at));
            openTrackModal(data.id, data.request_type, dateStr, mapDocStatus(data.status), data.status);
         }
      });
  }
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT TRACK MODAL
// ─────────────────────────────────────────────────────────────

// Status → which timeline step is active (1-indexed).
const STATUS_STEP_MAP = {
  submitted: 1,
  pending:   1,
  processing: 2,
  reviewing: 2,
  under_review: 2,
  approved: 3,
  completed: 4,
  archived: 4,
  rejected: 2   // stops at Processing; dot turns red
};

async function openTrackModal(docId, docName, docDate, statusLabel, rawStatus) {
  // Populate header.
  setText("trackDocTitle", docName);
  setText("trackDocDate", docDate);

  // Status pill.
  const pillMap = { Pending: "pending", Processing: "processing", Approved: "processing", Completed: "active", Rejected: "rejected" };
  const statusEl = document.getElementById("trackDocStatus");
  if (statusEl) {
    statusEl.innerHTML = `<span class="tpill ${pillMap[statusLabel] || "pending"}">${escapeHtml(statusLabel)}</span>`;
  }

  // Timeline.
  const isRejected = rawStatus === "rejected";
  const step = isRejected ? 2 : (STATUS_STEP_MAP[rawStatus] || 1);

  // Restore defaults (in case last viewed doc was rejected)
  const step2Label = document.querySelector('#tStep2 .ts-label');
  if (step2Label) step2Label.textContent = "Processing";
  ['tLine2', 'tStep3', 'tLine3', 'tStep4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });

  [1, 2, 3, 4].forEach((n) => {
    const stepEl = document.getElementById(`tStep${n}`);
    const lineEl = document.getElementById(`tLine${n}`);

    stepEl?.classList.remove("ts-active", "ts-done", "ts-rejected");
    lineEl?.classList.remove("tl-done");

    if (isRejected && n === step) {
      stepEl?.classList.add("ts-rejected");
      if (step2Label) step2Label.textContent = "Rejected";

      // Hide subsequent steps so the timeline ends cleanly at Rejected
      ['tLine2', 'tStep3', 'tLine3', 'tStep4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
    } else if (n < step) {
      stepEl?.classList.add("ts-done");
      if (lineEl) lineEl.classList.add("tl-done");
    } else if (n === step) {
      // If completed (step 4), show it as done (checked), else show it as active (pulsing ring)
      if (step === 4) {
        stepEl?.classList.add("ts-done");
      } else {
        stepEl?.classList.add("ts-active");
      }
    }
  });

  // Open the modal.
  document.getElementById("trackModal")?.classList.add("open");

  // Load admin messages for this document.
  await loadTrackMessages(docId);
}

async function loadTrackMessages(docId) {
  const container = document.getElementById("trackMessages");
  if (!container) return;

  if (!supabaseClient || !docId) {
    container.innerHTML = `<div class="track-no-msg"><i class="fas fa-comment-slash"></i>No messages yet</div>`;
    return;
  }

  container.innerHTML = `<div style="text-align:center;padding:12px;color:rgba(255,255,255,0.3)"><i class="fas fa-spinner fa-spin"></i></div>`;

  const { data, error } = await supabaseClient
    .from("admin_messages")
    .select("subject, message, created_at, sent_by")
    .eq("document_request_id", docId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Track Messages] Supabase error:", error.message, error.details);
    container.innerHTML = `<div class="track-no-msg"><i class="fas fa-exclamation-circle"></i>Could not load messages (${escapeHtml(error.message)})</div>`;
    return;
  }

  if (!data || !data.length) {
    container.innerHTML = `<div class="track-no-msg"><i class="fas fa-comment-slash"></i>No messages yet</div>`;
    return;
  }

  container.innerHTML = data.map((m) => {
    const when = m.created_at
      ? new Date(m.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
      : "";
    return `
      <div class="track-msg-item">
        <div class="tmi-subject"><i class="fas fa-envelope" style="color:var(--gold);margin-right:5px"></i>${escapeHtml(m.subject || "Message")}</div>
        <div class="tmi-body">${escapeHtml(m.message || "")}</div>
        <div class="tmi-meta"><i class="fas fa-user-tie"></i> Barangay Admin &middot; ${when}</div>
      </div>`;
  }).join("");
}

function closeTrackModal() {
  document.getElementById("trackModal")?.classList.remove("open");
}

// Safe string escape for JS onclick attribute values.
function escapeAttrJs(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}







// ==========================================
// HEALTH CENTER WIDGET LOGIC
// ==========================================

async function initHealthWidget() {
  const select = document.getElementById("healthCenterBarangaySelect");
  const content = document.getElementById("healthScheduleContent");
  if (!select || !content) return;

  // Function to load the options from Supabase barangays table (or a distinct list)
  async function loadBarangayOptions() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from("health_schedules").select("barangay").order("barangay");
      if (!error && data) {
         // Get unique barangays that actually have schedules
         const unique = [...new Set(data.map(d => d.barangay))];
         if (unique.length > 0) {
            select.innerHTML = '<option value="">Select Barangay...</option>';
            unique.forEach(b => {
               const opt = document.createElement("option");
               opt.value = b;
               opt.textContent = b;
               select.appendChild(opt);
            });
         }
      }
    } catch (err) {}
  }

  async function renderSchedule() {
    const brgy = select.value;
    if (!brgy) {
      content.innerHTML = '<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;">Please select your barangay to view local health center schedules.</div>';
      return;
    }

    if (!supabaseClient) {
      content.innerHTML = '<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;">Database connection not established.</div>';
      return;
    }

    content.innerHTML = '<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;"><i class="fas fa-circle-notch fa-spin"></i> Loading schedule...</div>';

    try {
      const { data, error } = await supabaseClient.from("health_schedules")
        .select("*")
        .eq("barangay", brgy)
        .order("sort_order", { ascending: true });
        
      if (error) throw error;
      
      if (!data || data.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;">No schedule posted for this barangay yet.</div>';
        return;
      }
      
      let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
      data.forEach(function(item) {
        html += '<div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 10px 12px; display: flex; align-items:flex-start; gap: 10px;">' +
          '<div style="min-width: 75px; font-weight: 600; color: var(--gold); font-size: 12.5px; padding-top: 2px;">' + escapeHtml(item.day_of_week) + '</div>' +
          '<div style="font-size: 13px; color: var(--text-main); line-height: 1.4;">' + escapeHtml(item.activity) + '</div>' +
          '</div>';
      });
      html += '</div>';
      content.innerHTML = html;
    } catch (err) {
      console.error("Failed to fetch health schedule:", err);
      content.innerHTML = '<div style="text-align:center; padding: 20px 0; color: #ef4444; font-size: 13px;">Failed to load schedule.</div>';
    }
  }

  select.addEventListener("change", renderSchedule);
  
  await loadBarangayOptions();

  // Wait a tiny bit for user session to initialize if logged in
  setTimeout(() => {
    const userStr = localStorage.getItem("bch_user_session");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && user.barangay) {
          const exists = Array.from(select.options).some(opt => opt.value === user.barangay);
          if (exists) {
            select.value = user.barangay;
            renderSchedule();
          }
        }
      } catch (e) {}
    }
  }, 500);
}

document.addEventListener("DOMContentLoaded", initHealthWidget);
