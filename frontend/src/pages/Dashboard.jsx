import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, Bell, BriefcaseBusiness, CheckCircle2, ChevronLeft, ChevronRight, Database, Eye, FileSearch, FileSpreadsheet,
  Crop, FileDown, Gauge, GraduationCap, Home, Info, KeyRound, LayoutDashboard, ListChecks, LogOut, MoveHorizontal, MoveVertical, Percent, RefreshCcw, Save, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserCog, UserPlus, Users, UsersRound, X, ZoomIn, Calendar, Target
} from "lucide-react";
import { api, downloadApiFile } from "../api.js";
import { assetUrl } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const plannerReportCache = new Map();
const PLANNER_REPORT_CACHE_MS = 20 * 1000;

function getPlannerReport(cacheKey, academicYear = "", force = false) {
  const key = `${cacheKey}:${academicYear || "latest"}`;
  const cached = plannerReportCache.get(key);
  if (!force && cached && Date.now() - cached.createdAt < PLANNER_REPORT_CACHE_MS) return cached.promise;
  const request = api(`/drives/planner/report${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ""}`);
  plannerReportCache.set(key, { createdAt: Date.now(), promise: request });
  request.catch(() => {
    if (plannerReportCache.get(key)?.promise === request) plannerReportCache.delete(key);
  });
  return request;
}

function invalidatePlannerReports() {
  plannerReportCache.clear();
}

const hodNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "managers", label: "Manager", icon: UsersRound },
  { id: "planner", label: "Planner", icon: FileSpreadsheet },
  { id: "requests", label: "Requests", icon: FileSearch },
  { id: "profile", label: "Profile", icon: UserCog }
];

const makerNav = (user) => {
  const designation = String(user?.designation || "").toLowerCase();
  if (designation.includes("higher")) {
    return [
      { id: "dashboard", label: "Overview", icon: LayoutDashboard },
      { id: "report-cards", label: "Reports", icon: BarChart3 }
    ];
  }
  return [
    { id: "report-cards", label: "Reports", icon: BarChart3 },
    { id: "planner", label: "My Placement Sheet", icon: FileSpreadsheet },
    { id: "target-planner", label: "Target Planner", icon: Target },
    { id: "edit-requests", label: "Edit Requests", icon: FileSearch },
    { id: "profile", label: "Profile", icon: UserCog }
  ];
};

const fieldLabels = {
  name: "Full Name",
  email: "Email Address",
  personalEmail: "Personal Email",
  employeeId: "Employee ID",
  phone: "Phone Number",
  department: "Department",
  designation: "Designation",
  assignedBatches: "Assigned Batches",
  companyName: "Company Name",
  jobRole: "Job Role",
  driveType: "Drive Type",
  packageCtc: "Package / CTC",
  dateFloated: "Date of Floated",
  dateOfDrive: "Date of Drive",
  finalSelectionDate: "Final Selection Date",
  driveDate: "Drive Date",
  batch: "Batch",
  course: "Course",
  program: "Program",
  semester: "Semester"
};

const eligibilityExportFieldGroups = [
  {
    label: "Student identity",
    fields: [
      ["srNo", "Sr No"], ["rollNo", "Roll No"], ["enrollmentNo", "Enrollment No"],
      ["registrationNo", "Registration No"], ["grNo", "GR No"], ["universityId", "University ID"],
      ["studentId", "Student ID"], ["name", "Student Name"]
    ]
  },
  {
    label: "Contact details",
    fields: [
      ["email", "Email"], ["phone", "Phone Number"], ["fatherContactNo", "Father Contact No"],
      ["address", "Address"], ["domicileCity", "Domicile City"], ["domicileState", "Domicile State"]
    ]
  },
  {
    label: "Course and batch",
    fields: [
      ["department", "Department"], ["course", "Course"], ["program", "Program"], ["branch", "Branch"],
      ["specialization", "Specialization"], ["batch", "Batch"], ["admissionYear", "Admission Year"],
      ["passingYear", "Passing Year"], ["semester", "Semester"], ["section", "Section"], ["college", "College"]
    ]
  },
  {
    label: "Academic details",
    fields: [
      ["cgpa", "CGPA"], ["percentage", "Percentage"], ["tenthPercentage", "10th Percentage"],
      ["tenthPassingYear", "10th Passing Year"], ["twelfthPercentage", "12th Percentage"],
      ["twelfthPassingYear", "12th Passing Year"], ["graduationPercentage", "Graduation Percentage"],
      ["diplomaPercentage", "Diploma Percentage"], ["pgStreams", "PG Stream"], ["attendance", "Attendance"],
      ["backlogs", "Backlogs"], ["activeBacklogs", "Active Backlogs"], ["totalBacklogs", "Total Backlogs"]
    ]
  },
  {
    label: "Personal and status",
    fields: [
      ["category", "Category"], ["gender", "Gender"], ["dob", "Date of Birth"],
      ["placementStatus", "Placement Status"], ["status", "Student Status"],
      ["eligibilityStatus", "Eligibility Status"], ["eligibilityReasons", "Eligibility Details / Reasons"]
    ]
  }
];
const defaultEligibilityExportFields = ["srNo", "rollNo", "enrollmentNo", "name", "email", "department", "course", "batch", "cgpa"];

function labelFor(field) {
  return fieldLabels[field] || field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formatCgpa(value) {
  if (value === undefined || value === null || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isHod = user.role === "HOD";
  const isHigherAuthority = String(user.designation || "").toLowerCase().includes("higher");
  const [driveInitialTab, setDriveInitialTab] = useState("drives");
  const [selectedEligibilityList, setSelectedEligibilityList] = useState(null);
  const nav = isHod ? hodNav : makerNav(user);
  const defaultActive = isHod || isHigherAuthority ? "dashboard" : "report-cards";
  const [active, setActiveState] = useState(() => {
    const saved = isHigherAuthority ? "" : localStorage.getItem(`placement-report-active-${user.role}`);
    return nav.some(item => item.id === saved) ? saved : defaultActive;
  });
  const [pendingPlannerRequests, setPendingPlannerRequests] = useState(0);
  const setActive = (next) => {
    localStorage.setItem(`placement-report-active-${user.role}`, next);
    setActiveState(next);
  };

  useEffect(() => {
    if (!nav.some(item => item.id === active)) setActive(defaultActive);
  }, [active, defaultActive, nav]);

  useEffect(() => {
    if (!isHod) return;
    let activeRequest = true;
    api("/drives/planner/edit-requests/pending-count")
      .then(data => {
        if (activeRequest) setPendingPlannerRequests(data.count || 0);
      })
      .catch(() => {
        if (activeRequest) setPendingPlannerRequests(0);
      });
    return () => { activeRequest = false; };
  }, [isHod, active]);

  return (
    <main className="app-shell">
      <RoleSidebar nav={nav} active={active} setActive={setActive} user={user} logout={logout} pendingPlannerRequests={pendingPlannerRequests} />
      <section className={`workspace ${isHigherAuthority && (active === "dashboard" || active === "growth") ? "has-authority-overview" : ""} ${(active === "report-cards" || (active === "dashboard" && !isHigherAuthority)) ? "has-prc-v2" : ""}`}>
        {active === "dashboard" && <PlacementPlannerPage user={user} pageType="dashboard" />}
        {active === "managers" && isHod && <ManagersPage />}
        {active === "report-cards" && <PlacementPlannerPage user={user} pageType="report-cards" />}
        {active === "edit-requests" && <PlacementPlannerPage user={user} pageType="edit-requests" />}
        {active === "target-planner" && <PlacementPlannerPage user={user} pageType="target-planner" />}
        {active === "planner" && <PlacementPlannerPage user={user} pageType="planner" />}
        {active === "requests" && isHod && <PlannerRequestsPage />}
        {active === "student-requests" && (isHod ? <StudentRequestsPage /> : <DriveWisePage user={user} initialTab="requests" />)}
        {active === "eligibility" && <EligibilityListsPage setSelectedList={setSelectedEligibilityList} setActive={setActive} isHod={isHod} />}
        {active === "create-eligibility" && !isHod && <CreateEligibilityListPage onComplete={(list) => { setSelectedEligibilityList(list); setActive("eligibility"); }} />}
        {active === "view-eligibility" && selectedEligibilityList && <EligibilityListDetailPage list={selectedEligibilityList} back={() => setActive("eligibility")} isHod={isHod} />}
        {active === "master-data" && !isHod && <MasterDataReadOnlyPage />}
        {active === "drives" && <DriveWisePage user={user} initialTab={driveInitialTab} />}
        {active === "profile" && <ProfilePage user={user} />}
      </section>
    </main>
  );
}
function RoleSidebar({ nav, active, setActive, user, logout, pendingPlannerRequests = 0 }) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const isHigherAuthority = String(user?.designation || "").toLowerCase().includes("higher");
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar pro desktop-sidebar">
        <div className="brand-lockup compact">
          <img src="/logo.png" alt="Placement Report logo" />
          <div>
            <h1>Placement Report</h1>
            <p>{user.role === "HOD" ? "Head Workspace" : (user.designation || "Placement Team")}</p>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            const showRequestDot = item.id === "requests" && pendingPlannerRequests > 0;
            return (
              <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => setActive(item.id)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
                {showRequestDot && <i className="nav-request-dot" aria-label={`${pendingPlannerRequests} pending requests`} />}
              </button>
            );
          })}
        </nav>
        {!isHigherAuthority && <button className="ghost signout" onClick={() => setConfirmSignOut(true)} title="Sign out"><LogOut size={17} /> Sign Out</button>}
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const showRequestDot = item.id === "requests" && pendingPlannerRequests > 0;
          return (
            <button
              key={item.id}
              className={`mobile-nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => setActive(item.id)}
              title={item.label}
            >
              <Icon size={22} />
              <span>{item.label}</span>
              {showRequestDot && <i className="nav-request-dot" aria-label={`${pendingPlannerRequests} pending requests`} />}
            </button>
          );
        })}
      </nav>
      {confirmSignOut && (
        <ConfirmDialog
          title="Sign out of Placement Report?"
          message="You will leave the workspace and return to the secure login page."
          confirmLabel="Sign Out"
          cancelLabel="Stay Signed In"
          icon={LogOut}
          onConfirm={logout}
          onCancel={() => setConfirmSignOut(false)}
          onDone={() => setConfirmSignOut(false)}
        />
      )}
    </>
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  const { user, logout } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const avatarSrc = assetUrl(user?.profileImage);
  const initials = (user?.name || user?.email || "U").slice(0, 1).toUpperCase();
  const isHigherAuthority = String(user?.designation || "").toLowerCase().includes("higher");
  return (
    <header className="topbar">
      {!isHigherAuthority && <button className="mobile-header-logout" type="button" onClick={() => setConfirmSignOut(true)} title="Sign out" aria-label="Sign out">
        <LogOut size={19} />
      </button>}
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p className="subtle">{subtitle}</p>}
      </div>
      <div className="topbar-actions">
        {children}
        <div className="header-profile" title={user?.name || "Profile"}>
          {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{initials}</span>}
        </div>
      </div>
      {confirmSignOut && (
        <ConfirmDialog
          title="Sign out of Placement Report?"
          message="You will leave the workspace and return to the secure login page."
          confirmLabel="Sign Out"
          cancelLabel="Stay Signed In"
          icon={LogOut}
          onConfirm={logout}
          onCancel={() => setConfirmSignOut(false)}
          onDone={() => setConfirmSignOut(false)}
        />
      )}
    </header>
  );
}

function DashboardHome({ user, setActive, setDriveInitialTab }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  const [students, setStudents] = useState({ items: [], total: 0 });
  const [studentError, setStudentError] = useState("");
  const [studentFilters, setStudentFilters] = useState({ search: "", department: "", course: "", program: "", batch: "", semester: "" });
  const [selected, setSelected] = useState(null);
  const [chartDetail, setChartDetail] = useState(null);

  async function load() {
    setError("");
    try {
      const summary = await api("/dashboard/summary");
      setData(summary);
      if (user.role === "HOD") {
        const requests = await api("/drives/access-requests/list");
        setPendingAccessCount((requests || []).filter((request) => request.status === "PENDING").length);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = data?.stats || {};
  const isHod = user.role === "HOD";
  const profileName = user.name || user.email || user.role;
  const filterOptions = {
    department: (data?.charts?.studentsByDepartment || []).map((item) => item._id).filter(Boolean),
    course: (data?.charts?.studentsByCourse || []).map((item) => item._id).filter(Boolean),
    program: (data?.charts?.studentsByProgram || []).map((item) => item._id).filter(Boolean),
    batch: (data?.charts?.studentsByBatch || []).map((item) => item._id).filter(Boolean),
    semester: Array.from({ length: 12 }, (_, index) => String(index + 1))
  };

  async function searchStudents(event) {
    event?.preventDefault();
    setStudentError("");
    const query = new URLSearchParams(
      Object.entries({ ...studentFilters, page: 1, limit: 8 }).filter(([, value]) => value !== "")
    ).toString();
    try {
      setStudents(await api(`/records/students?${query}`));
    } catch (err) {
      setStudentError(err.message);
    }
  }

  async function viewStudent(id) {
    setSelected(await api(`/records/students/${id}`));
  }

  async function updateSelectedRestriction(status, reason) {
    const studentId = selected?.student?._id || selected?._id;
    if (!studentId) return;
    const updated = await api(`/records/students/${studentId}/drive-restriction`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason })
    });
    setSelected((current) => {
      const base = current || {};
      return {
        ...base,
        student: updated,
        driveSummary: {
          ...(base.driveSummary || {}),
          stuckOffStatus: updated.driveRestriction?.status || "CLEAR",
          stuckOffReason: updated.driveRestriction?.reason || "",
          stuckOffUpdatedAt: updated.driveRestriction?.updatedAt || null
        }
      };
    });
    searchStudents();
  }

  async function downloadStudents() {
    const query = new URLSearchParams(Object.entries(studentFilters).filter(([, value]) => value !== "")).toString();
    const blob = await downloadApiFile(`/records/students/export?${query}`);
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `students-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  if (chartDetail) {
    return (
      <ChartDetailView
        title={chartDetail.title}
        data={chartDetail.data || []}
        close={() => setChartDetail(null)}
      />
    );
  }

  if (!isHod) {
    const lmStats = stats || {};
    const totalChecked = lmStats.totalCheckedStudents || 0;
    const totalEligible = lmStats.totalEligibleStudents || 0;
    const eligibilityRatio = safeNumber(lmStats.eligibilityRatio);
    const registeredRatio = safeNumber(lmStats.registeredRatio);
    const presentRate = safeNumber(lmStats.presentRate);
    return (
      <>
        <PageHeader
          eyebrow="Drive Workspace"
          title="Dashboard"
          subtitle="Overview of your created eligibility lists and drives"
        >
          <button onClick={load}><RefreshCcw size={17} /> Refresh</button>
        </PageHeader>
        {error && <ErrorState message={error} />}

        <section className="metrics wide" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <StatCard 
            icon={ListChecks} 
            label="Eligibility Lists Created" 
            value={lmStats.totalListsCreated || 0} 
            support="Your created lists" 
            onClick={() => setActive("eligibility")} 
          />
          <StatCard 
            icon={Percent} 
            label="Eligibility Ratio" 
            value={`${eligibilityRatio}%`} 
            support="Eligible / Checked students" 
          />
          <StatCard 
            icon={CheckCircle2} 
            label="Registration Ratio" 
            value={`${registeredRatio}%`} 
            support="Registered / Eligible students" 
          />
          <StatCard 
            icon={Users} 
            label="Drive Present Rate" 
            value={`${presentRate}%`} 
            support="Present / Registered students" 
          />
        </section>

        {/* Dynamic Rates charts (pure CSS gradients) for their overall metrics */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginTop: "20px" }}>
          {/* Eligibility Rate Chart */}
          <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--green)" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Overall Eligibility Rate</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
              <div className="donut-chart" style={{ width: "110px", height: "110px", background: `conic-gradient(var(--green) ${eligibilityRatio}%, var(--red) ${eligibilityRatio}% 100%)` }}>
                <span style={{ fontSize: "20px", fontWeight: "900" }}>{eligibilityRatio}%</span>
                <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Eligible</small>
              </div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                  <span style={{ color: "var(--muted)" }}>Total Checked</span>
                  <strong>{totalChecked}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--green)" }}>
                  <span>Eligible Pool</span>
                  <strong>{totalEligible}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Registration Rate Chart */}
          <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--blue)" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Overall Registration Rate</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
              <div className="donut-chart" style={{ width: "110px", height: "110px", background: `conic-gradient(var(--blue) ${registeredRatio}%, #e2e8f0 ${registeredRatio}% 100%)` }}>
                <span style={{ fontSize: "20px", fontWeight: "900" }}>{registeredRatio}%</span>
                <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Registered</small>
              </div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                  <span style={{ color: "var(--muted)" }}>Eligible Pool</span>
                  <strong>{lmStats.eligiblePool || 0}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--blue)" }}>
                  <span>Registered</span>
                  <strong>{lmStats.registeredCount || 0}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Chart */}
          <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--orange)" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Overall Attendance Rate</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
              <div className="donut-chart" style={{ width: "110px", height: "110px", background: `conic-gradient(var(--green) ${presentRate}%, var(--red) ${presentRate}% 100%)` }}>
                <span style={{ fontSize: "20px", fontWeight: "900" }}>{presentRate}%</span>
                <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Present</small>
              </div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                  <span style={{ color: "var(--muted)" }}>Registered Pool</span>
                  <strong>{lmStats.registeredCount || 0}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--green)" }}>
                  <span>Presents</span>
                  <strong>{lmStats.presents || 0}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)" }}>
                  <span>Absents</span>
                  <strong>{lmStats.absents || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {selected && <StudentDrawer payload={selected} close={() => setSelected(null)} onUpdateRestriction={updateSelectedRestriction} />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={isHod ? `Welcome back, ${profileName}` : "Drive Workspace"}
        title="Dashboard"
        subtitle={isHod ? "" : "Drive workspace and eligibility workflow"}
      >
        <button
          className={`icon-button soft notification-button ${pendingAccessCount ? "has-alert" : ""}`}
          title={pendingAccessCount ? `${pendingAccessCount} pending access request${pendingAccessCount === 1 ? "" : "s"}` : "No pending access requests"}
          onClick={() => {
            setDriveInitialTab?.("requests");
            setActive("drives");
          }}
        >
          <Bell size={18} />
          {!!pendingAccessCount && <span>{pendingAccessCount}</span>}
        </button>
        <button onClick={load}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      {error && <ErrorState message={error} />}
      {/* Feature Quick Launchpad */}
      <section className="panel feature-launchpad hod-feature-panel">
        <div className="feature-launchpad-heading">
          <h3><Sparkles size={18} /> Feature Quick Launchpad</h3>
          <p className="subtle">Access new features directly, including backlog filters, sheet approvals, reports, and Google Sheets bi-directional sync setup.</p>
        </div>
        
        <div className={`quick-launch-grid ${isHod ? "quick-launch-grid-three" : "quick-launch-grid-two"}`}>
          {isHod ? (
            <>
              <button type="button" onClick={() => setActive("drives")} className="quick-launch-card quick-launch-blue">
                <BriefcaseBusiness size={20} />
                <span>
                  <strong>Placement Report</strong>
                  <small>Drive statistics, selections, and attendance sheets</small>
                </span>
              </button>
              <button type="button" onClick={() => setActive("records")} className="quick-launch-card quick-launch-orange">
                <Settings2 size={20} />
                <span>
                  <strong>Bi-Directional Sync</strong>
                  <small>Configure real-time Google Sheets write-backs</small>
                </span>
              </button>
              <button type="button" onClick={() => setActive("eligibility")} className="quick-launch-card quick-launch-green">
                <ListChecks size={20} />
                <span>
                  <strong>Eligibility Lists</strong>
                  <small>Review and finalize placement office lists</small>
                </span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setActive("eligibility")} className="quick-launch-card quick-launch-blue">
                <ListChecks size={20} />
                <span>
                  <strong>Create Eligibility List</strong>
                  <small>Use Active Backlogs Max for flexible shortlists</small>
                </span>
              </button>
              <button type="button" onClick={() => setActive("drives")} className="quick-launch-card quick-launch-orange">
                <FileSpreadsheet size={20} />
                <span>
                  <strong>Edit Sheets & Re-upload</strong>
                  <small>Edit spreadsheets or request re-upload access</small>
                </span>
              </button>
            </>
          )}
        </div>
      </section>
      <section className="metrics wide">
        <StatCard icon={FileSpreadsheet} label="Total Student Records" value={stats.totalStudents || 0} support="All synced master records" maxValue={stats.totalStudents || 0} onClick={() => setActive("records")} />
        <StatCard icon={CheckCircle2} label="Total Active" value={stats.totalActive || 0} support="Active students in sheet" maxValue={stats.totalStudents || 0} />
        <StatCard icon={ShieldCheck} label="Total Struck Off" value={stats.totalStuckOff || 0} support="Status column marked Struck Off" maxValue={stats.totalStudents || 0} />
        <StatCard icon={Gauge} label="Students with NOC" value={stats.totalNoc || 0} support="Students having NOC status" maxValue={stats.totalStudents || 0} />
      </section>
      {isHod && (
        <StudentSearchPanel
          filters={studentFilters}
          setFilters={setStudentFilters}
          options={filterOptions}
          students={students}
          error={studentError}
          onSearch={searchStudents}
          onView={viewStudent}
          onDownload={downloadStudents}
        />
      )}
      <section className="chart-grid">
        <SimpleChart title="Students by Department" data={data?.charts?.studentsByDepartment} onViewAll={() => setChartDetail({ title: "Students by Department", data: data?.charts?.studentsByDepartment })} />
        <SimpleChart title="Students by Course" data={data?.charts?.studentsByCourse} onViewAll={() => setChartDetail({ title: "Students by Course", data: data?.charts?.studentsByCourse })} />
        <SimpleChart title="Students by Batch" data={data?.charts?.studentsByBatch} onViewAll={() => setChartDetail({ title: "Students by Batch", data: data?.charts?.studentsByBatch })} />
        <SimpleChart title="Students by Program" data={data?.charts?.studentsByProgram} onViewAll={() => setChartDetail({ title: "Students by Program", data: data?.charts?.studentsByProgram })} />
        <SimpleChart title="Eligibility Status Distribution" data={data?.charts?.eligibilityDistribution} onViewAll={() => setChartDetail({ title: "Eligibility Status Distribution", data: data?.charts?.eligibilityDistribution })} />
      </section>
      {selected && <StudentDrawer payload={selected} close={() => setSelected(null)} onUpdateRestriction={updateSelectedRestriction} />}
    </>
  );
}

function ChartDetailView({ title, data, close }) {
  const values = data.map((item) => Number(item.value) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 1);
  const colors = ["#006d78", "#e85d26", "#35aa4a", "#f0ad1f", "#0d86a5", "#7a5cff", "#c94a42", "#536174"];
  const topData = data.slice(0, 12);

  return (
    <>
      <PageHeader eyebrow="Analytics" title={title}>
        <button className="soft" onClick={close}><ChevronLeft size={17} /> Back to Dashboard</button>
      </PageHeader>
      <section className="panel analytics-detail">
        <div className="analytics-hero graph-layout">
          <div className="analytics-summary">
            <h3>{title}</h3>
            <p className="subtle">Detailed graphical view with totals, percentage split, and ranked data.</p>
            <div className="analytics-kpis">
              <Mini label="Total Records" value={total} />
              <Mini label="Groups" value={data.length} />
              <Mini label="Highest Count" value={max} />
            </div>
          </div>
          {!topData.length ? <EmptyState message="No data available yet" /> : (
            <div className="analytics-column-chart" aria-label={`${title} column chart`}>
              {topData.map((item, index) => {
                const value = Number(item.value) || 0;
                const percent = total ? Math.round((value / total) * 100) : 0;
                const height = Math.max(8, Math.round((value / max) * 100));
                return (
                  <div className="analytics-column" key={item._id || `group-${index}`}>
                    <strong>{value}</strong>
                    <div className="analytics-column-track">
                      <span
                        style={{
                          height: `${height}%`,
                          background: colors[index % colors.length]
                        }}
                      />
                    </div>
                    <em>{percent}%</em>
                    <small title={item._id || "Unknown"}>{item._id || "Unknown"}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!data.length ? <EmptyState message="No data available yet" /> : (
          <div className="analytics-bars">
            {data.map((item, index) => {
              const value = Number(item.value) || 0;
              const percent = total ? Math.round((value / total) * 100) : 0;
              return (
                <article className="analytics-row" key={item._id || "Unknown"}>
                  <div>
                    <i style={{ background: colors[index % colors.length] }} />
                    <strong>{item._id || "Unknown"}</strong>
                  </div>
                  <span>{value} students</span>
                  <div className="analytics-track"><b style={{ width: `${(value / max) * 100}%`, background: colors[index % colors.length] }} /></div>
                  <em>{percent}%</em>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function StudentSearchPanel({ filters, setFilters, options, students, error, onSearch, onView, onDownload }) {
  const [downloadError, setDownloadError] = useState("");

  async function handleDownload() {
    setDownloadError("");
    try {
      await onDownload();
    } catch (err) {
      setDownloadError(err.message);
    }
  }

  return (
    <section className="panel dashboard-search-panel">
      <div className="search-panel-heading">
        <div>
          <h3><Search size={19} /> Student Search & Head Reports</h3>
          <p className="subtle">Search by student name, roll number, enrollment number, email, department, or program. Filter department-wise, course-wise, batch-wise, and semester-wise.</p>
        </div>
        <button className="download-report" onClick={handleDownload}><FileDown size={17} /> Download Excel</button>
      </div>
      <form className="dashboard-student-search" onSubmit={onSearch}>
        <label className="searchbox student-main-search" aria-label="Search student">
          <Search size={18} />
          <input placeholder="Enter student name or roll number" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </label>
        {["department", "course", "program", "batch", "semester"].map((field) => (
          <label key={field}>
            {labelFor(field)}
            <select value={filters[field]} onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}>
              <option value="">All {field === "batch" ? "Batches" : field === "semester" ? "Semesters" : `${labelFor(field)}s`}</option>
              {(options[field] || []).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ))}
        <button><Search size={17} /> Search</button>
      </form>
      {(error || downloadError) && <ErrorState message={error || downloadError} />}
      <div className="student-result-grid">
        {students.items.map((student) => (
          <article className="student-result-card" key={student._id}>
            <div className="student-result-top">
              <span className="student-avatar small">{(student.name || "S").slice(0, 1).toUpperCase()}</span>
              <div>
                <h4>{student.name}</h4>
                <p>{student.rollNo || student.enrollmentNo || "-"} - {student.batch || "Batch not set"}</p>
              </div>
            </div>
            <div className="student-result-details">
              <Mini label="Department" value={student.department || "-"} />
              <Mini label="Course" value={student.course || "-"} />
              <Mini label="Program" value={student.program || "-"} />
              <Mini label="Semester" value={student.semester || "-"} />
            </div>
            <button onClick={() => onView(student._id)}><Eye size={16} /> View Report</button>
          </article>
        ))}
      </div>
      {!students.items.length && <EmptyState icon={FileSearch} message="Search by student name or roll number to view records here" />}
      {!!students.total && <p className="result-count">Showing {students.items.length} of {students.total} matching students</p>}
    </section>
  );
}

function StatCard({ icon: Icon, label, value, support, maxValue, onClick }) {
  const displayValue = typeof value === "string" && value.trim().endsWith("%")
    ? value
    : Number.isFinite(Number(value))
      ? Number(value).toLocaleString()
      : "0";
  const numericValue = Number(value) || 0;
  const numericMax = Number(maxValue) || numericValue || 1;
  const progress = Math.max(0, Math.min(100, Math.round((numericValue / numericMax) * 100)));

  return (
    <button className="metric stat-card" onClick={onClick} type="button">
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{displayValue}</strong>
        <small>{support}</small>
      </div>
      <div className="metric-progress" aria-hidden="true">
        <b style={{ width: `${progress}%` }} />
      </div>
      <Icon className="metric-watermark" size={86} />
    </button>
  );
}

function SimpleChart({ title, data = [], onViewAll }) {
  const values = data.map((item) => Number(item.value) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const colors = ["#006d78", "#e85d26", "#35aa4a", "#f0ad1f", "#0d86a5", "#7a5cff", "#c94a42", "#536174"];
  const visibleData = data.slice(0, 4);
  const hiddenCount = Math.max(data.length - visibleData.length, 0);
  let cursor = 0;
  const segments = data.map((item, index) => {
    const start = cursor;
    const size = total ? ((Number(item.value) || 0) / total) * 100 : 0;
    cursor += size;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  const chartFill = total ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(#dbe5eb 0 100%)";
  return (
    <section className="panel chart-panel">
      <div className="chart-heading">
        <h3>{title.includes("Course") ? <GraduationCap size={22} /> : <BarChart3 size={22} />}{title}</h3>
        <button className="soft view-all-chart" type="button" onClick={onViewAll}>View All</button>
      </div>
      {!data.length ? <EmptyState message="No data available yet" /> : (
        <div className="visual-chart">
          <div className="donut-chart" style={{ "--chart-fill": chartFill }}>
            <span>{total}</span>
            <small>Total</small>
          </div>
          <div className="chart-legend">
            {visibleData.map((item, index) => {
              const value = Number(item.value) || 0;
              const percent = total ? Math.round((value / total) * 100) : 0;
              return (
                <div className="legend-item" key={item._id || "Unknown"}>
                  <i style={{ background: colors[index % colors.length] }} />
                  <span>{item._id || "Unknown"}</span>
                  <strong>{value}</strong>
                  <small>{percent}%</small>
                  <div className="legend-track" aria-hidden="true">
                    <b style={{ width: `${percent}%`, background: colors[index % colors.length] }} />
                  </div>
                </div>
              );
            })}
            {!!hiddenCount && <button className="legend-more" type="button" onClick={onViewAll}>+{hiddenCount} more</button>}
          </div>
        </div>
      )}
    </section>
  );
}
function ManagersPage() {
  const [managers, setManagers] = useState([]);
  const [managerSearch, setManagerSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", personalEmail: "", password: "", designation: "Outreach Member" });
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [confirmAction, setConfirmAction] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [authorityLink, setAuthorityLink] = useState("");
  const [managerCropPhoto, setManagerCropPhoto] = useState(null);

  function displayAuthorityLink(link) {
    if (!link) return "";
    try {
      const url = new URL(link);
      const isLocalhostLink = ["localhost", "127.0.0.1"].includes(url.hostname);
      if (isLocalhostLink && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
        return `${window.location.origin}${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return link;
    }
    return link;
  }

  async function load() {
    try {
      setManagers(await api("/users"));
    } catch (error) {
      setMessageType("error");
      setMessage(`Unable to load placement officers: ${error.message}`);
    }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (message) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        }
      } catch (e) {
        console.error("Audio playback failed:", e);
      }
      
      const timer = setTimeout(() => {
        setMessage("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  function resetManagerForm() {
    setForm({ name: "", email: "", personalEmail: "", password: "", designation: "Outreach Member" });
    setEditingId("");
    setShowForm(false);
  }

  function editManager(manager) {
    setEditingId(manager.id);
    setForm({
      name: manager.name || "",
      email: manager.email || "",
      personalEmail: manager.personalEmail || "",
      password: "",
      designation: manager.designation || "Placement Officer"
    });
    setMessage("");
    setShowForm(true);
  }

  function changeManagerPhoto(manager, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessageType("error");
      setMessage("Use a PNG, JPG, or WebP image for the profile photo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessageType("error");
      setMessage("Profile photo must be 2MB or smaller.");
      return;
    }
    const current = managerCropPhoto;
    if (current?.url) URL.revokeObjectURL(current.url);
    setManagerCropPhoto({ manager, file, url: URL.createObjectURL(file) });
  }

  function cancelManagerPhotoCrop() {
    if (managerCropPhoto?.url) URL.revokeObjectURL(managerCropPhoto.url);
    setManagerCropPhoto(null);
  }

  async function uploadManagerPhoto(file) {
    if (!managerCropPhoto?.manager?.id) return;
    const body = new FormData();
    body.append("photo", file);
    await api(`/users/${managerCropPhoto.manager.id}/photo`, { method: "POST", body });
    setMessageType("success");
    setMessage(`${managerCropPhoto.manager.name}'s profile photo updated.`);
    cancelManagerPhotoCrop();
    await load();
  }

  async function saveManager(event) {
    event.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      const data = await api(editingId ? `/users/${editingId}` : "/users", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      const wasEditing = Boolean(editingId);
      resetManagerForm();
      setMessageType("success");
      if (data.authorityLink) {
        setAuthorityLink(displayAuthorityLink(data.authorityLink));
        setMessage("Higher Authority account created. Copy the secure link below.");
      } else {
        setMessage(wasEditing ? "Placement Officer account updated successfully." : "Placement Officer account created successfully.");
      }
      await load();
    } catch (error) {
      setMessageType("error");
      setMessage(`Unable to save placement officer: ${error.message}`);
    }
  }

  async function toggleManager(manager) {
    try {
      await api(`/users/${manager.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active: !manager.active })
      });
      setMessageType("success");
      setMessage(`${manager.name} is now ${manager.active ? "inactive" : "active"}.`);
      await load();
    } catch (error) {
      setMessageType("error");
      setMessage(`Unable to update ${manager.name}: ${error.message}`);
    }
  }
  function deleteManager(manager) {
    setConfirmAction({
      title: "Delete placement officer?",
      message: `${manager.name} will immediately lose login access. Their historical drives and records will remain available to the Head.`,
      confirmLabel: "Delete Account",
      cancelLabel: "Keep Account",
      onConfirm: async () => {
        await api(`/users/${manager.id}`, { method: "DELETE" });
        if (editingId === manager.id) resetManagerForm();
        setMessageType("success");
        setMessage(`${manager.name}'s account was deleted successfully.`);
        await load();
      }
    });
  }

  async function generateAuthorityLink(manager) {
    try {
      const result = await api(`/users/${manager.id}/authority-link`, { method: "POST" });
      const newLink = displayAuthorityLink(result.authorityLink);
      setAuthorityLink(newLink);
      
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(newLink);
        } else {
          const input = document.createElement("textarea");
          input.value = newLink;
          input.setAttribute("readonly", "");
          input.style.position = "fixed";
          input.style.left = "-9999px";
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          document.body.removeChild(input);
        }
        setMessageType("success");
        setMessage(`Secure Higher Authority link generated and copied for ${manager.name}.`);
      } catch {
        setMessageType("success");
        setMessage(`Secure Higher Authority link generated for ${manager.name}.`);
      }
    } catch (error) {
      setMessageType("error");
      setMessage(`Unable to generate secure link: ${error.message}`);
    }
  }

  async function copyAuthorityLink() {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(authorityLink);
      } else {
        const input = document.createElement("textarea");
        input.value = authorityLink;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setAuthorityLink("");
      setMessageType("success");
      setMessage("Secure authority link copied.");
    } catch {
      setMessageType("error");
      setMessage("Unable to copy automatically. Select and copy the link manually.");
    }
  }

  const normalizedManagerSearch = managerSearch.trim().toLowerCase();
  const filteredManagers = normalizedManagerSearch
    ? managers.filter((manager) => [
      manager.name,
      manager.email,
      manager.personalEmail,
      manager.designation,
      manager.active ? "active" : "inactive"
    ].some((value) => String(value || "").toLowerCase().includes(normalizedManagerSearch)))
    : managers;

  return (
    <>
      <PageHeader 
        eyebrow={<span className="desktop-only">Team Administration</span>}
        title="Manager" 
        subtitle={
          <>
            <span className="desktop-only">Create and manage Outreach Member and Placement Officer accounts</span>
            <span className="mobile-only">Create and manage</span>
          </>
        }
      >
        <button onClick={() => setShowForm(true)}><UserPlus size={17} /> Add Team Member</button>
      </PageHeader>
      {message && <div className={`notice manager-notice ${messageType === "error" ? "error" : "success"}`} role="status">{message}</div>}
      {authorityLink && (
        <section className="authority-link-panel">
          <div>
            <span className="eyebrow">Higher authority access</span>
            <h3>Secure dashboard link</h3>
            <p>Share this private link only with the intended authority. It opens their overview and report workspace directly.</p>
          </div>
          <input readOnly value={authorityLink} onFocus={(event) => event.target.select()} />
          <button type="button" onClick={copyAuthorityLink}>Copy Link</button>
        </section>
      )}
      
      {showForm && (
        <div className="modal-overlay">
          <section className="manager-form-panel modal-panel">
            <header className="manager-form-header">
              <h3>{editingId ? "Edit Team Member" : "Create Team Member"}</h3>
              <p>{editingId ? "Update the details for this team member below." : "Add a new Placement Officer or Outreach Member to the workspace."}</p>
            </header>
            <form className="premium-manager-form" onSubmit={saveManager}>
              <div className="form-grid-2">
                <label>Full Name<input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                <label>Official Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
                <label>Personal Email (Optional)<input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></label>
                <label>Role<select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}><option>Outreach Member</option><option>Placement Officer</option><option>Higher Authorities</option></select></label>
                <label className="full-width">{editingId || form.designation === "Higher Authorities" ? "New Password (optional)" : "Initial Password"}<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingId && form.designation !== "Higher Authorities"} minLength={(editingId || form.designation === "Higher Authorities") && !form.password ? undefined : 8} maxLength={128} autoComplete="new-password" /><small>Use uppercase, lowercase, number, and special character.</small></label>
              </div>
              <div className="form-actions">
                <button className="btn-primary" type="submit"><Save size={17} /> {editingId ? "Update Team Member" : "Save Team Member"}</button>
                <button className="btn-secondary" type="button" onClick={resetManagerForm}><X size={17} /> Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="panel" style={{ marginTop: "22px", overflow: "visible" }}>
        <div className="manager-list-toolbar">
          <h3>
            <UsersRound size={18} /> Registered Team Members
          </h3>
          <label className="manager-search" aria-label="Search team members">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by name, email, role, or status"
              value={managerSearch}
              onChange={(event) => setManagerSearch(event.target.value)}
            />
            {managerSearch && (
              <button type="button" className="manager-search-clear" onClick={() => setManagerSearch("")} title="Clear search" aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <DataTable
          className="managers-table"
          columns={["Manager Name", "Official Email", "Status", "Actions"]}
          rows={filteredManagers.map((m) => [
            <div key={m.id} className="manager-name-cell">
              <div className="header-profile manager-avatar" title={m.name}>
                {m.profileImage ? <img src={assetUrl(m.profileImage)} alt="" /> : <span style={{ fontSize: "12px" }}>{m.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="manager-name-details">
                <strong>{m.name}</strong>
                <span className="manager-sub-detail">{m.designation || "Placement Officer"}</span>
                <span className="manager-sub-detail">{m.personalEmail || "No personal email"}</span>
              </div>
            </div>,
            m.email,
            <span key={`${m.id}-status`} className={`status ${m.active ? "approved" : "rejected"}`}>{m.active ? "Active" : "Inactive"}</span>,
            <div key={`${m.id}-actions`} className="manager-actions">
              <button className="soft manager-action-btn" onClick={() => editManager(m)}><Settings2 size={14} /> Edit</button>
              {m.designation === "Higher Authorities" && <label className="soft manager-action-btn manager-photo-action"><Crop size={14} /> Photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => changeManagerPhoto(m, event)} /></label>}
              {m.designation === "Higher Authorities" && <button className="soft manager-action-btn" onClick={() => generateAuthorityLink(m)}><ShieldCheck size={14} /> Link</button>}
              <button className={`manager-action-btn ${m.active ? "soft danger-action" : "soft"}`} onClick={() => toggleManager(m)}>{m.active ? "Deactivate" : "Activate"}</button>
              <button className="soft danger-action manager-action-btn" onClick={() => deleteManager(m)}><Trash2 size={14} /> Delete</button>
            </div>
          ])}
        />
        {!filteredManagers.length && (
          <div className="manager-search-empty">
            No team members match "{managerSearch.trim()}". Try a name, email, role, or status.
          </div>
        )}
      </section>
      {confirmAction && (
        <ConfirmDialog
          {...confirmAction}
          onCancel={() => setConfirmAction(null)}
          onDone={() => setConfirmAction(null)}
          onError={(errorMessage) => {
            setMessageType("error");
            setMessage(`Unable to delete account: ${errorMessage}`);
          }}
        />
      )}
      {managerCropPhoto && (
        <ProfilePhotoCropper
          source={managerCropPhoto}
          onCancel={cancelManagerPhotoCrop}
          onUpload={uploadManagerPhoto}
        />
      )}
      {message && <div className={`manager-notice ${messageType}`} role="status">{message}</div>}
    </>
  );
}

function RecordsPage() {
  const [connections, setConnections] = useState([]);
  const [newBatch, setNewBatch] = useState("2027");
  const [logs, setLogs] = useState([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [appsScriptUrl, setAppsScriptUrl] = useState("");
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [students, setStudents] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ search: "", batch: "", department: "", course: "", program: "", semester: "", page: 1, limit: 50 });
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [syncResult, setSyncResult] = useState(null);
  const [showSyncGuide, setShowSyncGuide] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString(), [filters]);

  async function loadConnection() {
    const data = await api("/spreadsheets/connection");
    setConnections(data.connections || []);
    setLogs(data.logs || []);
  }
  async function loadStudents() {
    setLoadError("");
    try {
      setStudents(await api(`/records/students?${query}`));
    } catch (err) {
      setLoadError(err.message);
    }
  }
  useEffect(() => { loadConnection(); }, []);
  useEffect(() => { loadStudents(); }, [query]);

  // Helper function to auto-map columns (matches backend logic)
  function inferFrontend(header) {
    const key = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key === "status") return "status";
    if (key.includes("grno")) return "grNo";
    if (key.includes("universityid")) return "universityId";
    if (key.includes("enrollment")) return "enrollmentNo";
    if (key.includes("registration")) return "registrationNo";
    if (key.includes("roll")) return "rollNo";
    if (key.includes("studentname") || key.includes("student_name") || key.includes("name")) return "name";
    if (key.includes("email") || key.includes("mail")) return "email";
    if (key.includes("father") && (key.includes("phone") || key.includes("contact") || key.includes("mobile"))) return "fatherContactNo";
    if (key.includes("phone") || key.includes("mobile") || key.includes("contact")) return "phone";
    if (key.includes("batch")) return "batch";
    if (key.includes("admission")) return "admissionYear";
    if (key.includes("passout") || key.includes("passingyear")) return "passingYear";
    if (key.includes("department")) return "department";
    if (key.includes("branch")) return "branch";
    if (key.includes("course")) return "course";
    if (key.includes("program")) return "program";
    if (key.includes("specialization")) return "specialization";
    if (key.includes("currentsemester") || key.includes("semester") || key === "sem") return "semester";
    if (key.includes("section")) return "section";
    if (key.includes("average") && key.includes("cgpa")) return "cgpa";
    if (key.includes("cgpa")) return "cgpa";
    if (key.includes("attendance")) return "attendance";
    if (key.includes("activebacklog")) return "activeBacklogs";
    if (key.includes("totalbacklog")) return "totalBacklogs";
    if (key.includes("backlog")) return "backlogs";
    if (key.includes("category")) return "category";
    if (key.includes("gender")) return "gender";
    if (key.includes("dob")) return "dob";
    if (key.includes("domicile") || key.includes("domcile")) {
      if (key.includes("city")) return "domicileCity";
      if (key.includes("state")) return "domicileState";
    }
    if (key.includes("address")) return "address";
    if (key.includes("college")) return "college";
    if (key.includes("class10") || key.includes("10th")) {
      if (key.includes("passing")) return "tenthPassingYear";
      if (key.includes("paasing")) return "tenthPassingYear";
      return "tenthPercentage";
    }
    if (key.includes("class12") || key.includes("12th")) {
      if (key.includes("passing")) return "twelfthPassingYear";
      if (key.includes("paasing")) return "twelfthPassingYear";
      return "twelfthPercentage";
    }
    if (key.includes("diploma")) return "diplomaPercentage";
    if (key.includes("graduation")) return "graduationPercentage";
    if (key.includes("pgstreams") || key.includes("pgstream")) return "pgStreams";
    if (key.includes("placement")) return "placementStatus";
    if (key.includes("resume")) return "resumeUrl";
    
    const semMatch = key.match(/sem(\d+)/);
    if (semMatch) {
      const semNum = semMatch[1];
      if (key.includes("status") || key.includes("statussem")) return `semester.${semNum}.status`;
      return `semester.${semNum}.percentage`;
    }

    return "customFields";
  }

  async function testSheet() {
    const data = await api("/spreadsheets/connection/test", { method: "POST", body: JSON.stringify({ sheetUrl }) });
    setHeaders(data.headers);
    const auto = {};
    data.headers.forEach((header) => {
      auto[header] = inferFrontend(header);
    });
    setMapping(auto);
    setMessage(`Preview loaded: ${data.totalRows} rows detected`);
  }
  async function saveConnection() {
    if (!newBatch) {
      setMessage("Please select a batch first");
      return;
    }
    await api("/spreadsheets/connection", { 
      method: "POST", 
      body: JSON.stringify({ sheetUrl, appsScriptUrl, batch: newBatch, columnMapping: mapping }) 
    });
    setMessage(`Google Sheet connection saved for batch ${newBatch}`);
    setHeaders([]);
    setSheetUrl("");
    setAppsScriptUrl("");
    await loadConnection();
  }
  async function syncNow(id) {
    setMessage("Syncing batch, please wait...");
    const data = await api(`/spreadsheets/connection/${id}/sync`, { method: "POST" });
    setSyncResult(data);
    setMessage(`Sync completed: ${data.summary.successfulRows} rows saved`);
    loadConnection();
    loadStudents();
  }
  async function deleteConnection(id) {
    setConfirmAction({
      title: "Disconnect Spreadsheet",
      message: "Disconnect this spreadsheet? Students from this connection will be removed from the active records view.",
      confirmLabel: "Disconnect",
      onConfirm: async () => {
        const data = await api(`/spreadsheets/connection/${id}`, { method: "DELETE" });
        setMessage(data.message);
        await loadConnection();
      }
    });
  }

  async function clearAllStudents() {
    setConfirmAction({
      title: "Clear All Students",
      message: "Delete all student records from the website? This cannot be undone.",
      confirmLabel: "Clear Students",
      onConfirm: async () => {
        const data = await api("/records/students", { method: "DELETE" });
        setMessage(data.message);
        loadStudents();
      }
    });
  }
  async function viewStudent(id) {
    setSelected(await api(`/records/students/${id}`));
  }

  async function updateSelectedRestriction(status, reason) {
    const studentId = selected?.student?._id || selected?._id;
    if (!studentId) return;
    const updated = await api(`/records/students/${studentId}/drive-restriction`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason })
    });
    setSelected((current) => {
      const base = current || {};
      return {
        ...base,
        student: updated,
        driveSummary: {
          ...(base.driveSummary || {}),
          stuckOffStatus: updated.driveRestriction?.status || "CLEAR",
          stuckOffReason: updated.driveRestriction?.reason || "",
          stuckOffUpdatedAt: updated.driveRestriction?.updatedAt || null
        }
      };
    });
    loadStudents();
  }

  return (
    <>
      <PageHeader eyebrow="Master Data" title="Records" subtitle="Google Sheet is the source; MongoDB keeps permanent student records">
        <button onClick={loadStudents}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      {message && <div className="notice">{message}</div>}
      {loadError && <ErrorState message={loadError} />}
      <section className="panel source-card">
        <h3><FileSpreadsheet size={18} /> Connected Batch Master Sheets</h3>
        {connections.length === 0 ? (
          <p style={{ padding: "10px", color: "#64748b", margin: "0" }}>No Google Sheets connected yet. Add one below.</p>
        ) : (
          <div className="connections-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {connections.map((conn) => {
              const lastSyncStr = conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : "-";
              const sheetCols = Object.keys(conn.columnMapping || {}).length || 0;
              return (
                <div key={conn._id} className="connection-row" style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "15px", background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h4 style={{ margin: "0 0 5px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="badge" style={{ background: "#3b82f6", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" }}>Batch {conn.batch}</span>
                        {conn.name}
                      </h4>
                      <p style={{ margin: "0", fontSize: "12px", color: "#64748b", wordBreak: "break-all" }}>{conn.sheetUrl}</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <button className="button-sm" onClick={() => syncNow(conn._id)}>Sync Now</button>
                      <button className="button-sm danger" onClick={() => deleteConnection(conn._id)}>Disconnect</button>
                      {conn.sheetUrl && <a className="button-link button-sm" href={conn.sheetUrl} target="_blank" rel="noreferrer">Open Sheet</a>}
                    </div>
                  </div>
                  <div className="source-stats" style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "10px" }}>
                    <Mini label="Status" value={conn.status || "CONNECTED"} />
                    <Mini label="Mapped Columns" value={sheetCols} />
                    <Mini label="Total Rows" value={conn.lastSummary?.totalRows || 0} />
                    <Mini label="New Records" value={conn.lastSummary?.newRecords || 0} />
                    <Mini label="Updated" value={conn.lastSummary?.updatedRecords || 0} />
                    <Mini label="Last Sync" value={lastSyncStr} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="system-column-note" style={{ marginTop: "20px" }}>
          <ShieldCheck size={17} />
          <span>Struck Off is maintained by Eligibility Flow from drive attendance logic and shown here as Yes or No.</span>
        </div>

        <div className="connection-form-section" style={{ marginTop: "25px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h4 style={{ margin: 0 }}>Connect New Student Sheet</h4>
            <button className="soft button-sm" onClick={() => setShowSyncGuide(!showSyncGuide)}>
              {showSyncGuide ? "Hide Sync Guide" : "Bi-Directional Setup Guide"}
            </button>
          </div>

          {showSyncGuide && (
            <div className="sync-guide-box" style={{ background: "var(--light-bg)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", marginBottom: "16px", fontSize: "13px", lineHeight: "1.5", textAlign: "left" }}>
              <h5 style={{ margin: "0 0 8px 0", color: "var(--ink)" }}>How to set up Bi-Directional Live Sync:</h5>
              <ol style={{ paddingLeft: "20px", margin: "0 0 12px 0", display: "grid", gap: "6px" }}>
                <li>Open your Google Sheet, click on <strong>Extensions</strong> &rarr; <strong>Apps Script</strong>.</li>
                <li>Delete any code in the editor, and paste the following Apps Script:
                  <pre style={{ background: "rgba(0,0,0,0.04)", padding: "10px", borderRadius: "4px", overflowX: "auto", fontSize: "11px", margin: "6px 0", maxHeight: "150px" }}>{`function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (payload.action === "update") {
      var rowNumber = payload.rowNumber;
      var rowData = payload.data;
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      for (var col = 0; col < headers.length; col++) {
        var header = headers[col];
        var mappedField = payload.mapping[header] || header;
        if (rowData[header] !== undefined) {
          sheet.getRange(rowNumber, col + 1).setValue(rowData[header]);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}`}</pre>
                </li>
                <li>Click <strong>Deploy</strong> &rarr; <strong>New Deployment</strong>. Select type <strong>Web App</strong>.</li>
                <li>Configure: Execute as: <strong>Me</strong>, Who has access: <strong>Anyone</strong>. Click Deploy.</li>
                <li>Copy the <strong>Web App URL</strong> and paste it into the <em>Google Apps Script Web App URL</em> field below.</li>
                <li><strong>Instant Webhook Sync (Optional)</strong>: To sync changes instantly from Sheet to master data, add an <code>onChange</code> trigger in Google Apps Script that pings <code>{window.location.origin}/api/spreadsheets/webhook-sync?sheetId=YOUR_SHEET_ID</code> on any edit!</li>
              </ol>
            </div>
          )}

          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <select 
                value={newBatch} 
                onChange={(e) => setNewBatch(e.target.value)} 
                style={{ height: "40px", fontSize: "14px", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "white", maxWidth: "160px" }}
              >
                {["2024", "2025", "2026", "2027", "2028", "2029", "2030"].map((b) => (
                  <option key={b} value={b}>Batch {b}</option>
                ))}
              </select>
              <input 
                style={{ height: "40px", fontSize: "14px", flex: 1 }}
                placeholder="Google Sheet CSV Link or URL" 
                value={sheetUrl} 
                onChange={(e) => setSheetUrl(e.target.value)} 
              />
              <input 
                style={{ height: "40px", fontSize: "14px", flex: 1 }}
                placeholder="Google Apps Script Web App URL (for live write-back)" 
                value={appsScriptUrl} 
                onChange={(e) => setAppsScriptUrl(e.target.value)} 
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={testSheet} className="soft" style={{ height: "40px", minWidth: "140px" }}>Test & Preview</button>
              <button onClick={saveConnection} disabled={!headers.length} style={{ height: "40px", minWidth: "150px" }}>Save Connection</button>
              <button onClick={clearAllStudents} className="danger" style={{ height: "40px", minWidth: "160px" }}>Clear All Students</button>
            </div>
          </div>
        </div>

        {!!headers.length && (
          <div style={{ marginTop: "20px" }}>
            <h5 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: "600", color: "#334155" }}>Map Columns for Batch {newBatch}</h5>
            <div className="mapping-grid">
              {headers.map((header) => (
                <label key={header}>{header}
                  <select value={mapping[header] || "customFields"} onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}>
                    {[
                      "customFields", 
                      "grNo", "universityId", 
                      "rollNo", "enrollmentNo", "registrationNo", 
                      "name", "email", "phone", "fatherContactNo", 
                      "batch", "admissionYear", "passingYear", 
                      "department", "course", "program", "branch", "specialization", 
                      "semester", "section", 
                      "cgpa", "percentage", 
                      "tenthPercentage", "tenthPassingYear", 
                      "twelfthPercentage", "twelfthPassingYear", 
                      "diplomaPercentage", "graduationPercentage", "pgStreams",
                      ...Array.from({length:8}, (_,i) => `semester.${i+1}.percentage`),
                      ...Array.from({length:8}, (_,i) => `semester.${i+1}.status`),
                      "activeBacklogs", "totalBacklogs", "attendance", 
                      "category", "gender", "dob", "domicileCity", "domicileState", "address", "college",
                      "placementStatus", "resumeUrl"
                    ].map((field) => <option key={field} value={field}>{field}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
      <FilterBar filters={filters} setFilters={setFilters} />
      <section className="table-wrap" style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "max-content", borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {[
                "GR No", "Roll No", "Enrollment No", "University ID", "Status", "Pass Out Year", "Name", "Gender", "DOB", "Mail", 
                "Phone", "Father's Phone", "Domicile City", "Domicile State", "Address", "College", "Branch", "Specialization", "Program", "Course", 
                "Semester", "CGPA", "Attendance", "10th %", "10th Year", "12th %", "12th Year", "Graduation %", "PG Streams", 
                "Sem 1 %", "Sem 2 %", "Sem 3 %", "Sem 4 %", "Sem 5 %", "Sem 6 %", "Sem 7 %", "Sem 8 %", 
                "Backlogs", "Resume", "Struck Off", "Actions"
              ].map((col, i) => (
                <th key={i} style={{ 
                  padding: "10px 12px", 
                  textAlign: "left", 
                  borderBottom: "2px solid #e2e8f0", 
                  fontSize: "12px", 
                  fontWeight: "700", 
                  color: "#334155",
                  whiteSpace: "nowrap"
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.items.map((s, idx) => {
              const stuckOff = s.driveRestriction?.status === "STUCK_OFF" || ["stuck off", "struck off", "stuck_off", "struck_off"].includes(String(s.status || "").toLowerCase());
              return (
                <tr key={s._id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.grNo || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.rollNo}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.enrollmentNo || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.universityId || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.status || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.passingYear || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.name}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.gender || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.dob ? new Date(s.dob).toLocaleDateString() : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.email || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.phone || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.fatherContactNo || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.domicileCity || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.domicileState || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.address || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.college || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.branch || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.specialization || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.program || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.course || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semester}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{formatCgpa(s.cgpa)}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.attendance}%</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.tenthPercentage != null ? s.tenthPercentage : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.tenthPassingYear || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.twelfthPercentage != null ? s.twelfthPercentage : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.twelfthPassingYear || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.graduationPercentage != null ? s.graduationPercentage : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.pgStreams || "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["1"]?.percentage != null ? `${s.semesters["1"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["2"]?.percentage != null ? `${s.semesters["2"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["3"]?.percentage != null ? `${s.semesters["3"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["4"]?.percentage != null ? `${s.semesters["4"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["5"]?.percentage != null ? `${s.semesters["5"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["6"]?.percentage != null ? `${s.semesters["6"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["7"]?.percentage != null ? `${s.semesters["7"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.semesters?.["8"]?.percentage != null ? `${s.semesters["8"].percentage}%` : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>{s.backlogs != null ? s.backlogs : "-"}</td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>
                    {s.resumeUrl ? <a href={s.resumeUrl} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "underline" }}>View</a> : "-"}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>
                    <span className={`status ${stuckOff ? "rejected" : "approved"}`}>{stuckOff ? "Yes" : "No"}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>
                    <button onClick={() => viewStudent(s._id)}><Eye size={16} /> View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="pagination">
        <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
        <span>{students.total} records - Page {filters.page} of {students.pages || 1}</span>
        <button disabled={filters.page >= students.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button>
      </div>
      {selected && <StudentDrawer payload={selected} close={() => setSelected(null)} onUpdateRestriction={updateSelectedRestriction} />}
      {confirmAction && (
        <ConfirmDialog
          {...confirmAction}
          onCancel={() => setConfirmAction(null)}
          onDone={() => setConfirmAction(null)}
          onError={(errorMessage) => setMessage(errorMessage)}
        />
      )}
      {!!logs.length && <section className="panel"><h3>Sync History</h3><ActivityTimeline items={logs.map((log) => ({ action: `Sync ${log.status}`, createdAt: log.createdAt, metadata: log.summary }))} /></section>}
    </>
  );
}

function FilterBar({ filters, setFilters }) {
  return (
    <section className="toolbar records-filter">
      <label className="searchbox"><Search size={18} /><input placeholder="Search students..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></label>
      {["batch", "department", "course", "program", "semester"].map((field) => <input key={field} placeholder={labelFor(field)} value={filters[field]} onChange={(e) => setFilters({ ...filters, [field]: e.target.value, page: 1 })} />)}
      <button className="soft" onClick={() => setFilters({ search: "", batch: "", department: "", course: "", program: "", semester: "", page: 1, limit: 50 })}><Settings2 size={17} /> Clear</button>
    </section>
  );
}

function PlacementPlannerPage({ user, pageType = "dashboard" }) {
  const currentYear = new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
  const defaultBatchForYear = value => {
    const match = String(value || currentYear).match(/^(\d{4})(?:-(\d{4}))?/);
    if (!match) return "2027";
    return match[2] || String(Number(match[1]) + 1);
  };
  const [report, setReport] = useState(null);
  const [year, setYear] = useState("");
  const [uploadYear, setUploadYear] = useState(currentYear);
  const batchYearOptions = Array.from({ length: 11 }, (_, index) => String(2025 + index));
  const [uploadBatch, setUploadBatch] = useState(defaultBatchForYear(currentYear));
  const [uploadSheetName, setUploadSheetName] = useState("");
  const [plannerSheetUrl, setPlannerSheetUrl] = useState("");
  const [plannerAppsScriptUrl, setPlannerAppsScriptUrl] = useState("");
  const [showPlannerScript, setShowPlannerScript] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showLinkPreviewCard, setShowLinkPreviewCard] = useState(false);
  const [replaceYearData, setReplaceYearData] = useState(false);
  const [managerUsers, setManagerUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestRecordId, setRequestRecordId] = useState("");
  const [requestField, setRequestField] = useState("companyName");
  const [requestValue, setRequestValue] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [confirmRemovePlanner, setConfirmRemovePlanner] = useState(false);
  const [confirmSourceDelete, setConfirmSourceDelete] = useState(null);
  const [showPlannerUpload, setShowPlannerUpload] = useState(false);
  const [historyPreviewSource, setHistoryPreviewSource] = useState("");
  const [historyPreviewSearch, setHistoryPreviewSearch] = useState("");
  const [historyEditSource, setHistoryEditSource] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState("ALL");
  const [selectedBatch, setSelectedBatch] = useState(pageType === "dashboard" ? defaultBatchForYear(currentYear) : "ALL");
  const isHead = user.role === "HOD";
  const isHigherAuthority = String(user.designation || "").toLowerCase().includes("higher");

  const overview = pageType === "dashboard";

  async function load(selectedYear = year, force = false) {
    try {
      const data = await getPlannerReport(user._id || user.id || user.email || "planner", selectedYear, force);
      setReport(data); setYear(data.academicYear || selectedYear);
    } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!isHead) return;
    api("/users").then((items) => setManagerUsers(items || [])).catch(() => setManagerUsers([]));
  }, [isHead]);

  async function uploadPlanner(event) {
    event.preventDefault();
    if (!plannerSheetUrl.trim()) return;
    setBusy(true); setMessage("");
    try {
      const result = await api("/drives/planner/import-url", {
        method: "POST",
        body: JSON.stringify({ sheetUrl: plannerSheetUrl, appsScriptUrl: plannerAppsScriptUrl, academicYear: uploadYear, batch: uploadBatch, sheetName: uploadSheetName, replaceYear: String(replaceYearData) })
      });
      invalidatePlannerReports(); setMessage(result.message); setYear(uploadYear); setSelectedBatch(uploadBatch); await load(uploadYear, true); setPreview(null); setPreviewSearch(""); setShowPlannerUpload(false);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function previewPlannerLink() {
    setPreview(null);
    setPreviewSearch("");
    if (!plannerSheetUrl.trim()) return;
    setPreviewLoading(true);
    try {
      setPreview(await api("/drives/planner/preview-url", { method: "POST", body: JSON.stringify({ sheetUrl: plannerSheetUrl }) }));
      setShowLinkPreviewCard(true);
    } catch (error) {
      setPreview({ error: error.message, rows: [], columns: [] });
      setShowLinkPreviewCard(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function removePlannerYear() {
    setBusy(true); setMessage("");
    try {
      const targetYear = year || uploadYear;
      const batchQuery = selectedBatch !== "ALL" ? `&batch=${encodeURIComponent(selectedBatch)}` : "";
      const result = await api(`/drives/planner/records?academicYear=${encodeURIComponent(targetYear)}${batchQuery}`, { method: "DELETE" });
      invalidatePlannerReports(); setMessage(result.message); await load(targetYear, true);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function removePlannerSource() {
    if (!confirmSourceDelete?.sourceFile) return;
    setBusy(true); setMessage("");
    try {
      const result = await api(`/drives/planner/source?sourceFile=${encodeURIComponent(confirmSourceDelete.sourceFile)}&academicYear=${encodeURIComponent(year || uploadYear)}`, { method: "DELETE" });
      setMessage(result.message);
      if (historyEditSource === confirmSourceDelete.sourceFile) setHistoryEditSource("");
      if (historyPreviewSource === confirmSourceDelete.sourceFile) setHistoryPreviewSource("");
      invalidatePlannerReports(); await load(year, true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncPlannerSource(item) {
    if (!item?.sourceSheetUrl) {
      setMessage("This source is not linked to a Google Sheet URL.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const result = await api("/drives/planner/import-url", {
        method: "POST",
        body: JSON.stringify({
          sheetUrl: item.sourceSheetUrl,
          appsScriptUrl: item.plannerAppsScriptUrl || "",
          academicYear: year || uploadYear,
          batch: item.batches?.length === 1 ? item.batches[0] : "",
          sheetName: item.sourceFile,
          replaceYear: "false"
        })
      });
      setMessage(`${result.message}. Latest Google Sheet changes are now in the app.`);
      invalidatePlannerReports(); await load(year, true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadPlannerSheet(rowsOverride, filenameSuffix) {
    const rows = rowsOverride || visibleRecords || [];
    if (!rows.length) {
      setMessage("No planner rows available to download for the selected filters.");
      return;
    }
    const columns = [
      ["ron", "RON"], ["placementOfficer", "Placement Officer"], ["companyCategory", "Company Category"], ["leadBy", "Lead By"],
      ["dateFloated", "Date of Floated"], ["dateOfDrive", "Date of Drive"], ["companyName", "Company Name"], ["jobProfile", "Job Profile"], ["packageText", "Package"],
      ["branch", "Branch"], ["mode", "Mode"], ["batch", "Batch"], ["totalEligible", "Total Eligible"],
      ["totalRegistered", "Total Reg Count"], ["dateSharedWithHr", "Date Shared With HR"], ["dataShared", "Data Shared Yes / No"],
      ["round1Date", "Round 1 Date"], ["round2Date", "Round 2 Date"], ["shortlistedDate", "Shortlisted Date"],
      ["finalSelectionDate", "Final Selection Date"], ["selections", "No. of Selections"], ["actualStatus", "Actual Status"], ["resultSharedBackend", "Result to be Share With Backend Yes/ No"], ["remarks", "Remarks"]
    ];
    const csvValue = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      columns.map(([, label]) => csvValue(label)).join(","),
      ...rows.map(record => columns.map(([key]) => csvValue(record[key])).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `planner-${filenameSuffix || `${year || uploadYear}-${selectedBatch === "ALL" ? "all-batches" : selectedBatch}`}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function requestCorrection(record, payload) {
    const reason = payload?.reason || window.prompt(`What should be corrected for ${record.companyName}?`);
    if (!reason) return;
    try { await api(`/drives/planner/records/${record._id}/edit-request`, { method: "POST", body: JSON.stringify({ ...payload, reason }) }); setMessage("Correction request sent to the Head."); await load(year, true); }
    catch (error) { setMessage(error.message); }
  }

  async function submitPlannerEditRequest(event) {
    event.preventDefault();
    const record = visibleRecords.find(item => item._id === requestRecordId) || visibleRecords[0];
    if (!record) {
      setMessage("No planner row is available for an edit request.");
      return;
    }
    const currentValue = String(record[requestField] ?? "");
    await requestCorrection(record, {
      field: requestField,
      currentValue,
      requestedValue: requestValue,
      reason: requestReason
    });
    setRequestValue("");
    setRequestReason("");
  }

  async function decideRequest(id, status) {
    try {
      const result = await api(`/drives/planner/edit-requests/${id}/decision`, { method: "POST", body: JSON.stringify({ status }) });
      if (result?.blocked) {
        setMessage(result.message || "Google Sheet write-back was blocked. Request was not approved.");
        return;
      }
      setMessage(`Request ${status.toLowerCase()}.`);
      invalidatePlannerReports(); await load(year, true);
    }
    catch (error) { setMessage(error.message); }
  }

  const normalizePerson = value => {
    const cleaned = String(value || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
    if (!cleaned) return "";
    if (cleaned.includes("jagdeep")) return "jagdeep";
    if (cleaned.includes("drashti") || cleaned.includes("drashti shamra") || cleaned.includes("drashti sharma")) return "drashti";
    if (cleaned.includes("garima") || cleaned.includes("gramia")) return "garima";
    if (cleaned.includes("abhilasha") || cleaned.includes("abhilasa")) return "abhilasha";
    if (cleaned.includes("evp") || cleaned.includes("sushil") || cleaned.includes("parashar") || cleaned.includes("prashar")) return "sushil parashar";
    if (cleaned.includes("avleen") || cleaned.includes("avaleen")) return "avleen kaur";
    if (cleaned.includes("manish")) return "manish";
    const aliases = {
      "manish sir": "manish",
      "mr manish": "manish",
      "avleen mam": "avleen kaur",
      "avleen maam": "avleen kaur",
      "evp sir": "sushil parashar",
      "mr sushil parashar": "sushil parashar"
    };
    return aliases[cleaned] || cleaned.replace(/^mr\s+/, "");
  };
  const displayPersonName = value => {
    const normalized = normalizePerson(value);
    const manager = managerUsers.find(item => normalizePerson(item.name) === normalized);
    if (manager?.name) return manager.name;
    const labels = {
      jagdeep: "Jagdeep Sharma",
      drashti: "Drashti Sharma",
      garima: "Garima",
      abhilasha: "Abhilasha",
      manish: "Mr. Manish",
      "avleen kaur": "Avleen Kaur",
      "sushil parashar": "Mr. Sushil Parashar"
    };
    return labels[normalized] || String(value || "Unassigned").trim();
  };
  const normalizePackageLpa = value => {
    const raw = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    const number = raw ? Number(raw[0]) : Number(value);
    if (!Number.isFinite(number)) return 0;
    if (number > 100000) return Number((number / 100000).toFixed(2));
    if (number > 1000) return Number((number / 100000).toFixed(2));
    return number;
  };
  const summarizePlannerRows = list => {
    const closed = list.filter(r => /closed|complete|selected/i.test(r.actualStatus || ""));
    const inProcess = list.filter(r => /process|open|ongoing|pending|floated/i.test(r.actualStatus || ""));
    return {
      floated: list.length,
      closed: closed.length,
      inProcess: inProcess.length,
      selections: list.reduce((sum, r) => sum + (r.selections || 0), 0),
      eligible: list.reduce((sum, r) => sum + (r.totalEligible || 0), 0),
      registered: list.reduce((sum, r) => sum + (r.totalRegistered || 0), 0),
      highestPackage: Math.max(0, ...list.map(r => normalizePackageLpa(r.packageLpa || r.packageText || r.package)))
    };
  };
  const plannerSerial = value => {
    const match = String(value ?? "").match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  };
  const sortPlannerRecords = list => [...(list || [])].sort((a, b) => {
    const sheetCompare = String(a.sourceSheetId || "").localeCompare(String(b.sourceSheetId || ""));
    if (sheetCompare) return sheetCompare;
    const tabCompare = String(a.sourceSheetGid || "").localeCompare(String(b.sourceSheetGid || ""));
    if (tabCompare) return tabCompare;
    return (Number(a.sourceRow || 0) - Number(b.sourceRow || 0))
      || (plannerSerial(a.ron) - plannerSerial(b.ron))
      || String(a.ron || "").localeCompare(String(b.ron || ""), undefined, { numeric: true });
  });
  const allRecords = sortPlannerRecords(report?.records || []);
  const allComparisonRecords = sortPlannerRecords(report?.comparisonRecords || allRecords);
  const recordBatchName = record => String(record.batch || record.academicYear || "").trim();
  const batchOptions = [...new Set([...allRecords, ...allComparisonRecords].map(recordBatchName).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selectedBatchRecords = allRecords.filter(record => recordBatchName(record) === selectedBatch);
  const selectedBatchFallbackRecords = allComparisonRecords.filter(record => recordBatchName(record) === selectedBatch);
  const filteredRecords = sortPlannerRecords(
    selectedBatch === "ALL" ? allRecords : (selectedBatchRecords.length ? selectedBatchRecords : selectedBatchFallbackRecords)
  );
  const filteredComparisonRecords = sortPlannerRecords(allComparisonRecords);
  const managerRoleRank = name => {
    const manager = managerUsers.find(item => normalizePerson(item.name) === normalizePerson(name));
    const designation = String(manager?.designation || "").toLowerCase();
    if (designation.includes("outreach")) return 0;
    if (designation.includes("placement")) return 1;
    if (designation.includes("higher")) return 2;
    return 3;
  };
  const groupNames = [...new Set([
      ...managerUsers.map(manager => manager.name).filter(Boolean),
      ...filteredRecords.flatMap(record => [record.placementOfficer, record.leadBy]).filter(Boolean)
    ])].reduce((map, name) => {
      const key = normalizePerson(name);
      if (!key) return map;
      if (!map.has(key)) map.set(key, displayPersonName(name));
      return map;
    }, new Map());
  const reportGroups = isHead
    ? [...groupNames.entries()].map(([managerKey, name]) => {
      const records = filteredRecords.filter(record => (
        normalizePerson(record.placementOfficer) === managerKey || normalizePerson(record.leadBy) === managerKey
      ));
      const comparisonRecords = filteredComparisonRecords.filter(record => (
        normalizePerson(record.placementOfficer) === managerKey || normalizePerson(record.leadBy) === managerKey
      ));
      return { name, summary: summarizePlannerRows(records), records, comparisonRecords: comparisonRecords.length ? comparisonRecords : allComparisonRecords };
    }).sort((a, b) => managerRoleRank(a.name) - managerRoleRank(b.name) || a.name.localeCompare(b.name))
    : [{
      name: user.name,
      summary: summarizePlannerRows(filteredRecords),
      records: filteredRecords,
      comparisonRecords: allComparisonRecords.filter(record => (
        normalizePerson(record.placementOfficer) === normalizePerson(user.name) || normalizePerson(record.leadBy) === normalizePerson(user.name)
      )),
      outreach: user.designation?.toLowerCase().includes("outreach")
    }];
  const allGroups = reportGroups;
  
  const groups = selectedOfficer === "ALL" ? allGroups : allGroups.filter(g => g.name === selectedOfficer);
  const [expandedReportGroups, setExpandedReportGroups] = useState({});
  const visibleRecords = selectedOfficer === "ALL" ? filteredRecords : (groups[0]?.records || []);
  const summary = summarizePlannerRows(visibleRecords);
  const uploadedYearOptions = (report?.years || []).map(String).filter(Boolean);
  const yearOptions = (uploadedYearOptions.length ? uploadedYearOptions : [year || currentYear])
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const sheetHistory = Object.values(filteredRecords.reduce((map, record) => {
    const key = record.sourceFile || "Uploaded planner file";
    if (!map[key]) map[key] = { sourceFile: key, sourceSheetUrl: record.sourceSheetUrl || "", plannerAppsScriptUrl: record.plannerAppsScriptUrl || "", rows: 0, firstRow: record.sourceRow || 0, lastRow: record.sourceRow || 0, batches: new Set(), officers: new Set(), uploadedAt: record.createdAt || record.updatedAt || "" };
    map[key].rows += 1;
    if (record.batch) map[key].batches.add(String(record.batch));
    if (record.placementOfficer) map[key].officers.add(String(record.placementOfficer));
    if (record.createdAt && (!map[key].uploadedAt || new Date(record.createdAt) < new Date(map[key].uploadedAt))) map[key].uploadedAt = record.createdAt;
    if (record.sourceRow) {
      map[key].firstRow = Math.min(map[key].firstRow || record.sourceRow, record.sourceRow);
      map[key].lastRow = Math.max(map[key].lastRow || record.sourceRow, record.sourceRow);
    }
    return map;
  }, {})).map(item => ({ ...item, batches: [...item.batches], officers: [...item.officers] }))
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  const visibleSheetHistory = sheetHistory.filter(item => !historySearch.trim() || [
    item.sourceFile,
    item.batches.join(" "),
    item.officers.join(" "),
    formatDateTime(item.uploadedAt)
  ].join(" ").toLowerCase().includes(historySearch.trim().toLowerCase()));
  const previewRows = (preview?.rows || []).filter(row => !previewSearch.trim() || Object.values(row).join(" ").toLowerCase().includes(previewSearch.trim().toLowerCase()));
  const previewColumns = (preview?.columns || []).slice(0, 8);
  const historyPreviewRows = filteredRecords
    .filter(record => (record.sourceFile || "Uploaded planner file") === historyPreviewSource)
    .filter(record => !historyPreviewSearch.trim() || placementSheetColumns.some(([key]) => String(record[key] ?? "").toLowerCase().includes(historyPreviewSearch.trim().toLowerCase())));
  const historyPreviewColumns = placementSheetColumns.slice(0, 10);
  const requestFieldOptions = [
    "companyName", "jobProfile", "placementOfficer", "leadBy", "dateFloated", "dateOfDrive", "batch", "actualStatus", "finalSelectionDate",
    "totalEligible", "totalRegistered", "selections", "packageText", "remarks"
  ];
  const requestRows = visibleRecords.filter(record => !requestSearch.trim() || [
    record.companyName, record.jobProfile, record.placementOfficer, record.leadBy, record.batch, record.actualStatus
  ].join(" ").toLowerCase().includes(requestSearch.trim().toLowerCase()));
  const selectedRequestRecord = visibleRecords.find(item => item._id === requestRecordId) || requestRows[0] || visibleRecords[0];
  const requestHistory = report?.requests || [];
  const pendingRequests = requestHistory.filter(item => item.status === "PENDING").length;
  const plannerAppsScriptTemplate = `function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/20\\d{2}/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStrict(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

var PLANNER_COLUMN_LAYOUTS = {
  "2026": ["ron", "placementOfficer", "companyCategory", "leadBy", "companyName", "jobProfile", "packageText", "branch", "mode", "dateFloated", "dateOfDrive", "batch", "totalEligible", "totalRegistered", "dataShared", "round1Date", "round2Date", "shortlistedDate", "finalSelectionDate", "actualStatus", "resultSharedBackend", "remarks"],
  "2027": ["ron", "placementOfficer", "companyCategory", "leadBy", "dateFloated", "companyName", "jobProfile", "packageText", "branch", "mode", "batch", "totalEligible", "totalRegistered", "dateSharedWithHr", "dataShared", "round1Date", "round2Date", "shortlistedDate", "selections", "actualStatus", "resultSharedBackend", "remarks"],
  "2028": ["ron", "placementOfficer", "companyCategory", "leadBy", "companyName", "jobProfile", "packageText", "branch", "mode", "dateFloated", "dateOfDrive", "batch", "totalEligible", "totalRegistered", "dataShared", "round1Date", "round2Date", "shortlistedDate", "finalSelectionDate", "actualStatus", "resultSharedBackend", "remarks"],
  "2029": ["ron", "placementOfficer", "companyCategory", "leadBy", "dateFloated", "companyName", "jobProfile", "packageText", "branch", "mode", "dateOfDrive", "batch", "totalEligible", "totalRegistered", "dataShared", "round1Date", "round2Date", "shortlistedDate", "finalSelectionDate", "actualStatus", "resultSharedBackend", "remarks"]
};

function findColumn(headers, aliases) {
  var wanted = (aliases || []).map(normalizeHeader).filter(Boolean);
  var exact = headers.findIndex(function(header) {
    return wanted.indexOf(normalizeHeader(header)) >= 0;
  });
  if (exact >= 0) return exact;
  return headers.findIndex(function(header) {
    var key = normalizeHeader(header);
    return key && wanted.some(function(alias) {
      return key === alias || key.indexOf(alias) >= 0 || alias.indexOf(key) >= 0;
    });
  });
}

function layoutColumn(headers, field, batch) {
  var batchYears = String(batch || "").match(/20\\d{2}/g) || [];
  var batchYear = batchYears[batchYears.length - 1];
  var layout = batchYear && PLANNER_COLUMN_LAYOUTS[batchYear];
  if (!layout) return -1;
  var startIndex = headers.findIndex(function(header) {
    return ["sr", "ron", "sno", "srno", "serial", "serialno"].indexOf(normalizeHeader(header)) >= 0;
  });
  var fieldIndex = layout.indexOf(field);
  if (fieldIndex < 0) return -1;
  var column = (startIndex >= 0 ? startIndex : 0) + fieldIndex;
  return column < headers.length ? column : -1;
}

function plannerColumn(headers, field, aliases, batch) {
  var column = findColumn(headers, aliases || [field]);
  return column >= 0 ? column : layoutColumn(headers, field, batch);
}

function findHeaderRow(matrix) {
  return matrix.findIndex(function(row) {
    var keys = row.map(normalizeHeader).filter(Boolean);
    var joined = keys.join(" ");
    return keys.some(function(key) { return key.indexOf("company") >= 0; }) &&
      (joined.indexOf("placement") >= 0 ||
       joined.indexOf("job") >= 0 ||
       joined.indexOf("profile") >= 0 ||
       joined.indexOf("package") >= 0 ||
       joined.indexOf("status") >= 0);
  });
}

function selectPlannerSheet(spreadsheet, payload) {
  var expectedBatch = normalizeStrict(payload.expectedBatch || "");
  var byName = payload.sheetName ? spreadsheet.getSheetByName(String(payload.sheetName)) : null;
  if (byName && (!expectedBatch || normalizeStrict(byName.getName()).indexOf(expectedBatch) >= 0)) return byName;

  var byGid = spreadsheet.getSheets().find(function(sheet) {
    return String(sheet.getSheetId()) === String(payload.sheetGid || "");
  });
  if (byGid && (!expectedBatch || normalizeStrict(byGid.getName()).indexOf(expectedBatch) >= 0)) return byGid;

  if (expectedBatch) {
    return spreadsheet.getSheets().find(function(sheet) {
      return normalizeStrict(sheet.getName()).indexOf(expectedBatch) >= 0;
    }) || null;
  }
  return byName || byGid || null;
}

function doGet() {
  return respond({ ok: true, message: "Placify planner write-back script is deployed." });
}

function doPost(e) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return respond({ ok: false, message: "Sheet is busy. Try saving again." });

  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (payload.action !== "plannerUpdate") return respond({ ok: false, message: "Unknown action" });

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = selectPlannerSheet(spreadsheet, payload);
    if (!sheet) return respond({ ok: false, message: "Batch tab not found. Open the exact batch tab URL and relink it in Placify." });

    var expectedBatch = normalizeStrict(payload.expectedBatch || "");
    if (expectedBatch && normalizeStrict(sheet.getName()).indexOf(expectedBatch) < 0) {
      return respond({ ok: false, message: "Sheet tab mismatch. Edit blocked to protect another batch tab.", selectedSheet: sheet.getName() });
    }

    var matrix = sheet.getDataRange().getValues();
    var headerRowIndex = findHeaderRow(matrix);
    if (headerRowIndex < 0) return respond({ ok: false, message: "Header row not found in selected tab." });

    var rowNumber = Number(payload.rowNumber);
    if (!Number.isFinite(rowNumber) || rowNumber <= headerRowIndex + 1 || rowNumber > sheet.getLastRow()) {
      return respond({ ok: false, message: "Invalid source row. Relink/sync this batch tab." });
    }

    var headers = matrix[headerRowIndex].map(String);
    var rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

    var srColumn = findColumn(headers, ["sr", "ron", "s no", "sr no", "serial", "serial no"]);
    var batchColumn = findColumn(headers, ["batch", "passing batch", "academic batch"]);
    var companyColumn = findColumn(headers, ["company name", "company", "employer", "organisation", "organization"]);

    var rowSr = srColumn >= 0 ? String(rowValues[srColumn] || "").trim() : "";
    var rowBatch = batchColumn >= 0 ? String(rowValues[batchColumn] || "").trim() : "";
    var rowCompany = companyColumn >= 0 ? String(rowValues[companyColumn] || "").trim() : "";

    if (payload.expectedRon && rowSr && normalizeStrict(rowSr) !== normalizeStrict(payload.expectedRon)) {
      return respond({ ok: false, message: "Row serial mismatch. Relink/sync this batch tab before editing.", selectedSheet: sheet.getName(), rowNumber: rowNumber });
    }
    if (payload.expectedBatch && rowBatch && normalizeStrict(rowBatch).indexOf(normalizeStrict(payload.expectedBatch)) < 0) {
      return respond({ ok: false, message: "Batch mismatch. Edit blocked to protect another batch.", selectedSheet: sheet.getName(), rowBatch: rowBatch });
    }
    if (payload.expectedCompanyName && rowCompany && normalizeHeader(rowCompany) !== normalizeHeader(payload.expectedCompanyName)) {
      return respond({ ok: false, message: "Company mismatch. Relink/sync this batch tab before editing.", selectedSheet: sheet.getName(), rowCompany: rowCompany });
    }

    var updatedColumns = 0;
    var skippedFields = [];
    Object.keys(payload.data || {}).forEach(function(field) {
      var column = plannerColumn(headers, field, (payload.aliases && payload.aliases[field]) || [field], payload.expectedBatch || sheet.getName());
      if (column >= 0) {
        sheet.getRange(rowNumber, column + 1).setValue(payload.data[field]);
        updatedColumns++;
      } else {
        skippedFields.push(field);
      }
    });

    if (!updatedColumns) return respond({ ok: false, message: "No matching columns found for this edit.", skippedFields: skippedFields, selectedSheet: sheet.getName() });
    SpreadsheetApp.flush();
    return respond({ ok: true, selectedSheet: sheet.getName(), rowNumber: rowNumber, updatedColumns: updatedColumns, skippedFields: skippedFields });
  } catch (error) {
    return respond({ ok: false, message: error && error.message ? error.message : String(error) });
  } finally {
    lock.releaseLock();
  }
}`;
  return <>
    <PageHeader eyebrow={pageType === "growth" ? "Batch Progress" : (overview ? <span className="desktop-only">Head Performance Workspace</span> : (pageType === "edit-requests" ? "Planner Corrections" : (pageType === "report-cards" ? "Report Cards" : (pageType === "target-planner" ? "Target Tracking" : <span className="desktop-only">Year-wise Planner</span>))))} title={pageType === "growth" ? "Placement Progress Overview" : (overview ? <span className="desktop-only">Placement Performance Dashboard</span> : (pageType === "edit-requests" ? "Edit Requests" : (pageType === "report-cards" ? "Officer Report Cards" : (pageType === "target-planner" ? "Target Planner" : <><span className="desktop-only">Placement Planner &amp; Linked Sheets</span><span className="mobile-only">Planner &amp; Sheets</span></>))))} subtitle={pageType === "growth" ? "Current batch progress is shown as completion and activity, without incomplete-year comparison deltas" : (pageType === "edit-requests" ? "Request a correction for any planner row and track its status" : (pageType === "target-planner" ? "View your targets and current achievement flow" : (overview ? <span className="desktop-only">All figures are calculated directly from the linked company tracker</span> : "All figures are calculated directly from the linked company tracker")))}>
      {isHead && pageType === "planner" && <button type="button" onClick={() => { const nextYear = year || currentYear; setUploadYear(nextYear); setUploadBatch(selectedBatch !== "ALL" ? selectedBatch : defaultBatchForYear(nextYear)); setUploadSheetName(""); setPlannerSheetUrl(""); setPlannerAppsScriptUrl(""); setPreview(null); setPreviewSearch(""); setShowLinkPreviewCard(false); setShowPlannerUpload(true); }}><FileSpreadsheet size={17} /> Link Sheet</button>}
    </PageHeader>
    {pageType !== "growth" && <div className={`planner-yearbar ${pageType === "dashboard" ? "dashboard-filterbar" : ""}`}>
      <label>Batch
        <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}>
          <option value="ALL">All Batches</option>
          {batchOptions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {isHead && (pageType === "dashboard" || pageType === "report-cards" || pageType === "planner") && (
        <label>Placement Officer
          <select value={selectedOfficer} onChange={e => setSelectedOfficer(e.target.value)}>
            <option value="ALL">All Officers</option>
            {allGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </label>
      )}
      {pageType !== "dashboard" && <span className="planner-source"><ShieldCheck size={16}/> Verified from linked Google Sheet</span>}
    </div>}

    {pageType === "edit-requests" && <section className="edit-request-page">
      <div className="edit-request-builder">
        <div>
          <span className="eyebrow">New request</span>
          <h3>Request planner field correction</h3>
          <p>Select the row and field that should be changed. Your request goes to the Head with full status tracking.</p>
        </div>
        <form onSubmit={submitPlannerEditRequest}>
          <label className="edit-request-search">Search planner row
            <div><Search size={16} /><input value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Search company, role, batch, status" /></div>
          </label>
          <label>Planner row
            <select value={selectedRequestRecord?._id || ""} onChange={event => setRequestRecordId(event.target.value)} required>
              {requestRows.map(record => <option key={record._id} value={record._id}>{record.companyName || "Unnamed company"} Â· {record.jobProfile || "No role"} Â· {record.batch || "No batch"}</option>)}
            </select>
          </label>
          <label>Field to change
            <select value={requestField} onChange={event => { setRequestField(event.target.value); setRequestValue(""); }} required>
              {requestFieldOptions.map(field => <option key={field} value={field}>{labelFor(field)}</option>)}
            </select>
          </label>
          <label>Current value
            <input value={selectedRequestRecord ? String(selectedRequestRecord[requestField] ?? "") : ""} readOnly />
          </label>
          <label>Requested value
            <input value={requestValue} onChange={event => setRequestValue(event.target.value)} placeholder="Enter corrected value" required />
          </label>
          <label className="wide">Reason
            <textarea value={requestReason} onChange={event => setRequestReason(event.target.value)} placeholder="Explain why this correction is needed" required minLength={5} />
          </label>
          <button disabled={!selectedRequestRecord || !requestValue || !requestReason}><FileSearch size={17} /> Send Edit Request</button>
        </form>
      </div>
      <div className="edit-request-history-panel">
        <div>
          <span className="eyebrow">Status history</span>
          <h3>{pendingRequests} pending request{pendingRequests === 1 ? "" : "s"}</h3>
        </div>
        <div className="edit-request-history-list">
          {requestHistory.map(item => (
            <article key={item._id}>
              <span className={`request-status ${String(item.status || "").toLowerCase()}`}>{item.status}</span>
              <strong>{item.record?.companyName || "Planner row"}</strong>
              <p>{item.field ? `${labelFor(item.field)}: ${item.currentValue || "-"} -> ${item.requestedValue || "-"}` : item.reason}</p>
              <small>{item.reason}</small>
            </article>
          ))}
          {!requestHistory.length && <EmptyState icon={FileSearch} message="No edit requests sent yet" />}
        </div>
      </div>
    </section>}

    {false && isHead && pageType === "planner" && <section className="planner-sheet-status">
      <div>
        <span className="eyebrow">Current planner sheet</span>
        <h3>{year || uploadYear} Â· {selectedBatchLabel}</h3>
        <p>{visibleRecords.length ? `${visibleRecords.length} rows loaded from ${activeSourceCount} uploaded source${activeSourceCount === 1 ? "" : "s"}.` : "No sheet is uploaded for this selection yet."}</p>
      </div>
      <div className="planner-status-actions">
        <button type="button" className="soft" onClick={() => downloadPlannerSheet()} disabled={!visibleRecords.length}><FileDown size={17} /> Download Sheet</button>
        <button type="button" className="soft" onClick={() => { setUploadYear(year || currentYear); setUploadBatch(selectedBatch !== "ALL" ? selectedBatch : "2026"); setUploadSheetName(sheetHistory[0]?.sourceFile || ""); setPreview(null); setPreviewSearch(""); setReplaceYearData(true); setShowPlannerUpload(true); }}><RefreshCcw size={17} /> Update Sheet</button>
        <button type="button" className="danger planner-remove-data" onClick={() => setConfirmRemovePlanner(true)} disabled={!visibleRecords.length || busy}><Trash2 size={17} /> Remove</button>
      </div>
    </section>}

    {showPlannerUpload && createPortal(
      <div className="modal-overlay planner-upload-overlay">
        <section className="planner-upload-modal modal-panel">
          <header>
            <div>
              <span className="eyebrow">Planner link</span>
              <h3>Link Google planner sheet</h3>
              <p>Connect the Google Sheet so planner data can sync both ways.</p>
            </div>
            <div className="planner-link-header-actions">
              <button type="button" className="soft" onClick={previewPlannerLink} disabled={!plannerSheetUrl.trim() || previewLoading}><Eye size={17}/>{previewLoading ? "Reading..." : "Preview"}</button>
              <button type="submit" form="planner-link-form" disabled={busy || !plannerSheetUrl.trim()}><FileSpreadsheet size={17}/>{busy ? "Linking..." : "Link Sheet"}</button>
              <button type="button" className="soft" onClick={() => setShowPlannerUpload(false)}>Cancel</button>
            </div>
          </header>
          <form id="planner-link-form" onSubmit={uploadPlanner} className="planner-file-form">
            <label className="planner-sheet-name">Sheet name
              <input value={uploadSheetName} onChange={e => setUploadSheetName(e.target.value)} placeholder="Example: 2026 MBA Planner" required />
            </label>
            <label>Batch
              <select value={uploadBatch} onChange={e => setUploadBatch(e.target.value)} required>
                {[...new Set([...batchYearOptions, ...batchOptions])].map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="planner-script-box">
              <div className="planner-script-guide">
                <div>
                  <strong>Bidirectional setup guide</strong>
                  <span>Open the Google Sheet file, go to Extensions &gt; Apps Script, paste this script once for the file, deploy it as a Web app, then paste the Web App URL below.</span>
                </div>
                <button type="button" className="soft" onClick={() => setShowPlannerScript(value => !value)}><FileSearch size={16} /> {showPlannerScript ? "Hide" : "Show"} Sheet Script</button>
              </div>
              {showPlannerScript && <textarea readOnly value={plannerAppsScriptTemplate} />}
            </div>
            <label className="planner-file-input">Google Sheet tab link
              <input value={plannerSheetUrl} onChange={e => { setPlannerSheetUrl(e.target.value); setPreview(null); }} placeholder="Open the exact batch tab, then paste its URL with gid=..." required />
            </label>
            <label className="planner-file-input">Apps Script Web App URL
              <input value={plannerAppsScriptUrl} onChange={e => setPlannerAppsScriptUrl(e.target.value)} placeholder="Paste deployed Apps Script web app URL for write-back" />
            </label>
            <p className="planner-import-hint"><Info size={16} /> Paste the exact tab URL for the batch sheet. The Apps Script URL can be reused for other tabs in the same Google Sheet file.</p>
            {preview?.error && <p className="planner-preview-error">{preview.error}</p>}
          </form>
        </section>
      </div>,
      document.body
    )}

    {showLinkPreviewCard && createPortal(
      <div className="modal-overlay planner-link-preview-overlay">
        <section className="planner-link-preview-card modal-panel">
          <header>
            <div>
              <span className="eyebrow">Sheet preview</span>
              <h3>{preview?.fileName || uploadSheetName || "Linked Google Sheet"}</h3>
              <p>{preview?.rowCount != null ? `${preview.rowCount} rows detected from the linked sheet.` : "Preview the linked Google Sheet before saving."}</p>
            </div>
            <button type="button" className="icon-button soft" onClick={() => setShowLinkPreviewCard(false)} aria-label="Close preview"><X size={18} /></button>
          </header>
          <div className="planner-link-preview-toolbar">
            <label className="planner-preview-search"><Search size={15} /><input value={previewSearch} onChange={e => setPreviewSearch(e.target.value)} placeholder="Search preview rows" disabled={!preview?.rows?.length} /></label>
            <button type="button" className="soft" onClick={previewPlannerLink} disabled={!plannerSheetUrl.trim() || previewLoading}><RefreshCcw size={15} /> {previewLoading ? "Reading..." : "Refresh Preview"}</button>
          </div>
          {preview?.error && <p className="planner-preview-error">{preview.error}</p>}
          {!preview?.error && previewColumns.length > 0 && (
            <div className="planner-preview-table planner-link-preview-table">
              <table>
                <thead><tr>{previewColumns.map(column => <th key={column}>{column}</th>)}</tr></thead>
                <tbody>
                  {previewRows.slice(0, 40).map((row, index) => <tr key={index}>{previewColumns.map(column => <td key={column} title={String(row[column] ?? "")}>{String(row[column] ?? "-")}</td>)}</tr>)}
                  {!previewRows.length && <tr><td colSpan={previewColumns.length}>No preview rows match this search.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>,
      document.body
    )}
    
    {message && <ToastMessage toast={{ type: /unable|failed|required|no planner|error/i.test(message) ? "error" : "success", message }} onClose={() => setMessage("")} />}

    {isHead && pageType === "planner" && !!sheetHistory.length && (
      <section className="planner-history-panel">
        <div className="planner-history-intro">
          <span className="eyebrow">Import history</span>
          <h3>Linked planner sources</h3>
          <p>{sheetHistory.length} linked source{sheetHistory.length === 1 ? "" : "s"} for {year || uploadYear}</p>
        </div>
        <div className="planner-history-content">
          <label className="planner-history-search"><Search size={16} /><input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search sheet, batch, date" /></label>
          <div className="planner-history-list">
          {visibleSheetHistory.map(item => (
            <article key={item.sourceFile}>
              <FileSpreadsheet size={18} />
              <div>
                <strong>{item.sourceFile}</strong>
                <small>Uploaded {formatDateTime(item.uploadedAt)}</small>
                <span>{item.rows} rows imported{item.firstRow ? `, sheet rows ${item.firstRow}-${item.lastRow}` : ""}{item.batches.length ? ` Â· Batch ${item.batches.join(", ")}` : ""}</span>
              </div>
              <div className="planner-history-actions">
                <button type="button" className="soft" onClick={() => { setHistoryPreviewSearch(""); setHistoryPreviewSource(item.sourceFile); }}><Eye size={15} /> Preview</button>
                {item.sourceSheetUrl && <a className="soft button-link" href={item.sourceSheetUrl} target="_blank" rel="noreferrer"><FileSpreadsheet size={15} /> Open</a>}
                {item.sourceSheetUrl && <button type="button" className="soft" onClick={() => syncPlannerSource(item)} disabled={busy}><RefreshCcw size={15} /> Sync</button>}
                <button type="button" className="soft" onClick={() => setHistoryEditSource(historyEditSource === item.sourceFile ? "" : item.sourceFile)}><Save size={15} /> Edit</button>
                <button type="button" className="soft" onClick={() => {
                  const sourceRows = filteredRecords.filter(record => (record.sourceFile || "Uploaded planner file") === item.sourceFile);
                  downloadPlannerSheet(sourceRows, item.sourceFile.replace(/[^a-z0-9_-]+/gi, "_"));
                }}><FileDown size={15} /> Download</button>
                <button type="button" className="soft danger-action" onClick={() => setConfirmSourceDelete(item)} disabled={busy}><Trash2 size={15} /> Delete</button>
              </div>
            </article>
          ))}
          {!visibleSheetHistory.length && <EmptyState icon={Search} message="No linked sheets match this search" />}
          </div>
        </div>
      </section>
    )}

    {historyEditSource && isHead && pageType === "planner" && (
      <section className="editable-planner-section planner-source-editor">
        <EditablePlacementSheet
          year={year}
          memberName={historyEditSource}
          records={filteredRecords.filter(record => (record.sourceFile || "Uploaded planner file") === historyEditSource)}
          onReload={() => load(year)}
          onClose={() => setHistoryEditSource("")}
        />
      </section>
    )}

    {historyPreviewSource && createPortal(
      <div className="modal-overlay planner-upload-overlay">
        <section className="planner-upload-modal modal-panel planner-history-preview-modal">
          <header>
            <div>
              <span className="eyebrow">Sheet preview</span>
              <h3>{historyPreviewSource}</h3>
              <p>{historyPreviewRows.length} imported planner rows{historyPreviewSearch.trim() ? " matching search" : ""}</p>
            </div>
            <div className="history-preview-header-tools">
              <label className="planner-preview-search history-preview-search"><Search size={16} /><input value={historyPreviewSearch} onChange={event => setHistoryPreviewSearch(event.target.value)} placeholder="Search company, officer, batch, status" /></label>
              <button type="button" className="soft" onClick={() => { setHistoryPreviewSource(""); setHistoryPreviewSearch(""); }}>Close</button>
            </div>
          </header>
          <div className="planner-preview-table history-preview-table">
            <table>
              <thead><tr>{historyPreviewColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>
                {historyPreviewRows.slice(0, 80).map(record => (
                  <tr key={record._id}>
                    {historyPreviewColumns.map(([key]) => <td key={`${record._id}-${key}`} title={String(record[key] ?? "")}>{String(record[key] ?? "-")}</td>)}
                  </tr>
                ))}
                {!historyPreviewRows.length && <tr><td colSpan={historyPreviewColumns.length}>No rows match this preview search.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>,
      document.body
    )}

    {confirmRemovePlanner && (
      <ConfirmDialog
        title={`Remove planner data for ${selectedBatch === "ALL" ? year || uploadYear : `${selectedBatch} in ${year || uploadYear}`}?`}
        message="This removes imported planner rows from the app. Your original Excel, CSV, or Google Sheet file will not be changed."
        confirmLabel="Remove Data"
        cancelLabel="Keep Data"
        icon={Trash2}
        onConfirm={removePlannerYear}
        onCancel={() => setConfirmRemovePlanner(false)}
        onDone={() => setConfirmRemovePlanner(false)}
        onError={setMessage}
      />
    )}
    
    {isHead && report?.requests?.some(item => item.status === "PENDING") && pageType === "planner" && <section className="planner-requests"><h3>Pending report corrections</h3>{report.requests.filter(item => item.status === "PENDING").map(item => <article key={item._id}><div><strong>{item.requester?.name} Â· {item.record?.companyName}</strong><p>{item.reason}</p></div><button onClick={() => decideRequest(item._id, "APPROVED")}>Approve</button><button className="soft" onClick={() => decideRequest(item._id, "REJECTED")}>Reject</button></article>)}</section>}
    
    {confirmSourceDelete && (
      <ConfirmDialog
        title={`Delete ${confirmSourceDelete.sourceFile}?`}
        message={`This removes ${confirmSourceDelete.rows} imported planner rows from this uploaded source. Other uploaded sources stay unchanged.`}
        confirmLabel="Delete Sheet"
        cancelLabel="Keep Sheet"
        icon={Trash2}
        onConfirm={removePlannerSource}
        onCancel={() => setConfirmSourceDelete(null)}
        onDone={() => setConfirmSourceDelete(null)}
        onError={setMessage}
      />
    )}

    {isHigherAuthority && pageType === "dashboard" && <AuthorityOverview summary={summary} records={visibleRecords} />}

    {isHigherAuthority && pageType === "growth" && <AuthorityOverview summary={summarizePlannerRows(allComparisonRecords)} records={allComparisonRecords} compactIntro />}

    {(pageType === "report-cards" || (pageType === "dashboard" && !isHigherAuthority)) && (
      <section className="planner-groups" style={{ marginTop: '2rem' }}>
        {groups.map((group, index) => {
          const reportKey = `${group.outreach}-${group.name}-${index}`;
          const collapsed = !expandedReportGroups[reportKey];
          return <PlannerReportCard key={reportKey} group={group} year={year} selectedBatch={selectedBatch} collapsed={collapsed} onToggleExpanded={() => setExpandedReportGroups(current => ({ ...current, [reportKey]: !current[reportKey] }))} canEdit={isHead} canRequest={!isHead} requests={report?.requests || []} onRequest={requestCorrection} onReload={() => load(year)} />;
        })}
        {!groups.length && <EmptyState icon={FileSpreadsheet} message="Upload a planner sheet to generate year-wise report cards" />}
      </section>
    )}

    {((isHead && pageType === "dashboard") || pageType === "target-planner") && !isHigherAuthority && (
      <DashboardTargetPlanner groups={groups} year={year} selectedBatch={selectedBatch} selectedOfficer={selectedOfficer} readOnly={!isHead} />
    )}

    {((isHead && selectedOfficer !== "ALL") || !isHead) && pageType === "planner" && (
      <section className="editable-planner-section" style={{ marginTop: '2rem' }}>
        <EditablePlacementSheet
          year={year}
          memberName={isHead ? selectedOfficer : (groups[0]?.name || user.name)}
          records={isHead ? groups.find(group => group.name === selectedOfficer)?.records || [] : groups[0]?.records || []}
          onReload={() => load(year)}
          canEdit={isHead}
          canRequest={!isHead}
        />
      </section>
    )}
  </>;
}

function DashboardTargetPlanner({ groups, year, selectedBatch, selectedOfficer = "ALL", readOnly = false }) {
  const [editMode, setEditMode] = useState(false);
  const [targetOverrides, setTargetOverrides] = useState({});
  const [savedTargets, setSavedTargets] = useState([]);
  const [targetScope, setTargetScope] = useState(selectedOfficer !== "ALL" ? "selected" : "all");
  const [targetMessage, setTargetMessage] = useState("");
  const [savingTargets, setSavingTargets] = useState(false);
  const [detail, setDetail] = useState(null);
  const quarters = [
    { key: "julSep", label: "Jul-Sep", months: [6, 7, 8] },
    { key: "octDec", label: "Oct-Dec", months: [9, 10, 11] },
    { key: "janMar", label: "Jan-Mar", months: [0, 1, 2] },
    { key: "aprJun", label: "April-Jun", months: [3, 4, 5] }
  ];
  const visibleGroups = groups.filter(group => (group.records || []).length);
  const rows = visibleGroups.flatMap(group => (group.records || []).map(record => ({ ...record, __owner: group.name })));
  const officerNames = visibleGroups.map(group => group.name).join(", ");
  const activeOfficerNames = targetScope === "selected" && selectedOfficer !== "ALL" ? [selectedOfficer] : visibleGroups.map(group => group.name).filter(Boolean);
  const canSaveSelected = selectedOfficer !== "ALL" && visibleGroups.some(group => group.name === selectedOfficer);
  const selectedYear = selectedBatch && selectedBatch !== "ALL" ? selectedBatch : String(year || "").split("-").at(-1);
  useEffect(() => {
    setTargetScope(selectedOfficer !== "ALL" ? "selected" : "all");
  }, [selectedOfficer]);
  useEffect(() => {
    if (!year) return;
    let activeRequest = true;
    api(`/drives/planner/targets?academicYear=${encodeURIComponent(year)}`)
      .then(res => {
        if (activeRequest) setSavedTargets(Array.isArray(res.targets) ? res.targets : []);
      })
      .catch(() => {
        if (activeRequest) setSavedTargets([]);
      });
    return () => { activeRequest = false; };
  }, [year, targetMessage]);
  const parseDate = value => {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  const quarterFor = record => {
    const date = parseDate(record.dateFloated || record.dateOfDrive || record.finalSelectionDate);
    if (!date) return quarters[0];
    return quarters.find(quarter => quarter.months.includes(date.getMonth())) || quarters[0];
  };
  const packageBand = record => {
    const raw = String(record.packageText || record.packageLpa || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    let value = raw ? Number(raw[0]) : Number(record.packageLpa || 0);
    if (!Number.isFinite(value)) value = 0;
    if (value > 1000) value = value / 100000;
    if (value >= 15) return "zsd";
    if (value >= 10) return "sd";
    if (value >= 5) return "aPlus";
    return "a";
  };
  const closed = record => /closed|complete|selected/i.test(record.actualStatus || "");
  const quarterRows = quarter => rows.filter(record => quarterFor(record).key === quarter.key);
  const bandCount = (list, band) => list.filter(record => packageBand(record) === band).length;
  const rowSet = (quarter, filter = () => true) => quarterRows(quarter).filter(filter);
  const sectionRows = quarters.map(quarter => {
    const list = quarterRows(quarter);
    const closedList = list.filter(closed);
    return {
      quarter,
      target: rowSet(quarter),
      achieved: rowSet(quarter, closed),
      zsd: rowSet(quarter, record => packageBand(record) === "zsd"),
      sd: rowSet(quarter, record => packageBand(record) === "sd"),
      aPlus: rowSet(quarter, record => packageBand(record) === "aPlus"),
      a: rowSet(quarter, record => packageBand(record) === "a"),
      achievedZsd: rowSet(quarter, record => closed(record) && packageBand(record) === "zsd"),
      achievedSd: rowSet(quarter, record => closed(record) && packageBand(record) === "sd"),
      achievedAPlus: rowSet(quarter, record => closed(record) && packageBand(record) === "aPlus"),
      achievedA: rowSet(quarter, record => closed(record) && packageBand(record) === "a"),
      floated: rowSet(quarter),
      closed: rowSet(quarter, closed),
      delay: rowSet(quarter, record => !closed(record) && parseDate(record.dateFloated)),
      sales: rowSet(quarter, record => !String(record.companyCategory || record.remarks || "").toLowerCase().includes("core")),
      core: rowSet(quarter, record => String(record.companyCategory || record.remarks || "").toLowerCase().includes("core"))
    };
  });
  const targetKeys = ["zsd", "sd", "aPlus", "a"];
  const savedTargetFor = (quarterLabel, key) => {
    if (key === "target") return ["zsd", "sd", "aPlus", "a"].reduce((sum, band) => sum + savedTargetFor(quarterLabel, band), 0);
    const matchingTargets = savedTargets.filter(target => activeOfficerNames.some(name => String(target.outreachMember || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()));
    return matchingTargets.reduce((sum, target) => sum + Number(target.quarters?.[quarterLabel]?.targetAllotted?.[key] || 0), 0);
  };
  const valueFor = (item, key, mode) => {
    const overrideKey = `${item.quarter.key}:${key}`;
    if (mode === "target" && targetOverrides[overrideKey] !== undefined) return Number(targetOverrides[overrideKey] || 0);
    if (mode === "target") return savedTargetFor(item.quarter.label, key);
    return item[key]?.length || 0;
  };
  const recordsFor = (item, key) => item[key] || [];
  const total = (key, mode) => sectionRows.reduce((sum, item) => sum + valueFor(item, key, mode), 0);
  const totalRecords = key => sectionRows.flatMap(item => recordsFor(item, key));
  const columnsByMode = {
    target: [
      ["target", "Target Allotted"],
      ["zsd", "ZSD Companies (>=15 LPA)"],
      ["sd", "SD Companies (Between 10-15 LPA)"],
      ["aPlus", "A+ (Between 5-10 LPA)"],
      ["a", "A (Between 3-5 LPA)"]
    ],
    achieved: [
      ["achieved", "Target Achieved"],
      ["achievedZsd", "ZSD Companies (>=15 LPA)"],
      ["achievedSd", "SD Companies (Between 10-15 LPA)"],
      ["achievedAPlus", "A+ (Between 5-10 LPA)"],
      ["achievedA", "A (Between 3-5 LPA)"]
    ],
    stats: [
      ["floated", "Floated Companies"],
      ["closed", "Closed Companies"],
      ["delay", "Delay in Closure"],
      ["sales", "Sales"],
      ["core", "Core"]
    ]
  };
  const openDetail = (title, records) => setDetail({ title, records });
  const updateOverride = (quarterKey, key, value) => {
    setTargetOverrides(prev => ({ ...prev, [`${quarterKey}:${key}`]: value }));
  };
  const targetPayloadFor = item => ({
    targetAllotted: {
      zsd: valueFor(item, "zsd", "target"),
      sd: valueFor(item, "sd", "target"),
      aPlus: valueFor(item, "aPlus", "target"),
      a: valueFor(item, "a", "target")
    },
    targetAchieved: {
      zsd: item.achievedZsd.length,
      sd: item.achievedSd.length,
      aPlus: item.achievedAPlus.length,
      a: item.achievedA.length
    },
    floated: item.floated.length,
    closed: item.closed.length,
    delayInClosure: item.delay.length,
    sales: item.sales.length,
    core: item.core.length
  });
  const savePlannerTargets = async () => {
    if (!activeOfficerNames.length) {
      setTargetMessage("Select at least one placement officer before saving targets.");
      return;
    }
    setSavingTargets(true);
    setTargetMessage("");
    try {
      for (const item of sectionRows) {
        await api("/drives/planner/targets", {
          method: "POST",
          body: JSON.stringify({
            academicYear: year,
            memberNames: activeOfficerNames,
            quarter: item.quarter.label,
            targetData: targetPayloadFor(item)
          })
        });
      }
      setTargetMessage(`Saved planner targets for ${activeOfficerNames.length === 1 ? activeOfficerNames[0] : `${activeOfficerNames.length} officers`}.`);
      setSavedTargets(prev => {
        const memberSet = new Set(activeOfficerNames.map(name => String(name).trim().toLowerCase()));
        const remaining = prev.filter(target => !memberSet.has(String(target.outreachMember || "").trim().toLowerCase()));
        const created = activeOfficerNames.map(outreachMember => ({
          academicYear: year,
          outreachMember,
          quarters: sectionRows.reduce((map, item) => ({ ...map, [item.quarter.label]: targetPayloadFor(item) }), {})
        }));
        return [...remaining, ...created];
      });
      setEditMode(false);
    } catch (err) {
      setTargetMessage(err.message || "Unable to save planner targets.");
    } finally {
      setSavingTargets(false);
    }
  };
  const renderValueCell = (item, mode, key, label) => {
    const value = valueFor(item, key, mode);
    if (editMode && mode === "target" && targetKeys.includes(key)) {
      return (
        <input
          className="target-edit-input"
          type="number"
          min="0"
          value={value}
          onChange={event => updateOverride(item.quarter.key, key, event.target.value)}
          aria-label={`${item.quarter.label} ${label}`}
        />
      );
    }
    return (
      <button type="button" className="target-count-button" onClick={() => mode === "target" ? null : openDetail(`${item.quarter.label} - ${label}`, recordsFor(item, key))}>
        {value || ""}
      </button>
    );
  };
  const renderSection = (title, mode) => (
    <table>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th>Month wise</th>
          {columnsByMode[mode].map(([, label]) => <th key={label}>{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {sectionRows.map(item => (
          <tr key={`${mode}-${item.quarter.key}`}>
            <td>{item.quarter.label}</td>
            {columnsByMode[mode].map(([key, label]) => <td key={key}>{renderValueCell(item, mode, key, label)}</td>)}
          </tr>
        ))}
        <tr className="grand-total">
          <td>Grand Total</td>
          {columnsByMode[mode].map(([key, label]) => (
            <td key={key}>
              <button type="button" className="target-count-button total" onClick={() => mode === "target" ? null : openDetail(`Grand Total - ${label}`, totalRecords(key))}>
                {total(key, mode) || ""}
              </button>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );

  return (
    <section className="dashboard-target-planner">
      <header>
        <div>
          <h3>Target Planner for year {year || selectedYear}</h3>
          {!readOnly && (
            <div className="target-planner-actions">
              <select value={targetScope} onChange={event => setTargetScope(event.target.value)} aria-label="Target update scope">
                <option value="selected" disabled={!canSaveSelected}>Update selected officer</option>
                <option value="all">Update all visible officers</option>
              </select>
              {editMode && <button type="button" className="target-edit-toggle" onClick={savePlannerTargets} disabled={savingTargets}>{savingTargets ? "Saving..." : "Save Targets"}</button>}
              <button type="button" className="target-edit-toggle" onClick={() => setEditMode(value => !value)}>{editMode ? "Cancel" : "Edit Targets"}</button>
            </div>
          )}
        </div>
        <p>Head-assigned targets are shown with live achievement and closure data{selectedBatch !== "ALL" ? ` for batch ${selectedBatch}` : ""}.</p>
        <strong>Annual Allotted Target of {total("target", "target")} companies to following members: {officerNames || "No officers selected"}</strong>
        {targetMessage && <span className="target-planner-message">{targetMessage}</span>}
      </header>
      <div className="target-planner-table-wrap">
        {renderSection("Target Allotted", "target")}
        {renderSection("Target Achieved", "achieved")}
        {renderSection("Closure Flow", "stats")}
      </div>
      {detail && createPortal(
        <div className="modal-overlay report-detail-overlay">
          <section className="target-detail-modal modal-panel">
            <header>
              <div>
                <span className="eyebrow">Planner rows</span>
                <h3>{detail.title}</h3>
                <p>{detail.records.length} compan{detail.records.length === 1 ? "y" : "ies"} behind this number.</p>
              </div>
              <button type="button" className="soft" onClick={() => setDetail(null)}><X size={17} /> Close</button>
            </header>
            <div className="target-detail-table">
              <table>
                <thead><tr><th>Company</th><th>Officer</th><th>Lead By</th><th>Category</th><th>Package</th><th>Status</th><th>Selections</th></tr></thead>
                <tbody>
                  {detail.records.map(record => (
                    <tr key={record._id || `${record.companyName}-${record.ron}`}>
                      <td>{record.companyName || "-"}</td>
                      <td>{record.placementOfficer || "-"}</td>
                      <td>{record.leadBy || "-"}</td>
                      <td>{record.companyCategory || "-"}</td>
                      <td>{record.packageText || record.packageLpa || "-"}</td>
                      <td>{record.actualStatus || "-"}</td>
                      <td>{record.selections || 0}</td>
                    </tr>
                  ))}
                  {!detail.records.length && <tr><td colSpan="7">No company rows are linked to this value.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}

function PlannerMetric({ label, value, active, onClick }) {
  return (
    <button type="button" className={`planner-metric-card ${active ? "active" : ""}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function AuthorityOverview({ summary = {}, records, compactIntro = false }) {
  const [activeMetric, setActiveMetric] = useState("floated");
  const [searchTerm, setSearchTerm] = useState("");
  const detailPanelRef = useRef(null);
  const allRows = records || [];
  const numberValue = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };
  const isClosed = record => /closed|complete|completed|selected/i.test(record.actualStatus || record.status || "");
  const isInProcess = record => /process|open|ongoing|pending|floated|active/i.test(record.actualStatus || record.status || "");
  const packageLabel = record => record.packageText || (record.packageLpa ? `${record.packageLpa} LPA` : "-");
  const targetValue = record => numberValue(record.companyTarget ?? record.targetCompanies ?? record.targetCompanyCount ?? record.totalTargetCompanies ?? record.totalCompaniesTarget ?? record.target ?? 1);
  const textForSearch = record => [
    record.companyName,
    record.jobProfile,
    record.placementOfficer,
    record.leadBy,
    record.packageText,
    record.batch,
    record.actualStatus
  ].join(" ").toLowerCase();
  const filteredBySearch = rows => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(record => textForSearch(record).includes(query));
  };

  const completedRows = allRows.filter(isClosed);
  const inProcessRows = allRows.filter(record => isInProcess(record) && !isClosed(record));
  const selectionRows = allRows.filter(record => numberValue(record.selections) > 0);
  const targetTotal = allRows.reduce((sum, record) => sum + targetValue(record), 0);
  const selectionTotal = allRows.reduce((sum, record) => sum + numberValue(record.selections), 0);
  const progressPercent = allRows.length ? Math.round((completedRows.length / allRows.length) * 100) : 0;
  const highestPackage = summary.highestPackage || Math.max(0, ...allRows.map(record => {
    const raw = String(record.packageText || record.packageLpa || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    let value = raw ? Number(raw[0]) : Number(record.packageLpa || 0);
    if (!Number.isFinite(value)) value = 0;
    return value > 1000 ? Number((value / 100000).toFixed(2)) : value;
  }));

  const metricCards = [
    { key: "target", label: "Total Target", value: targetTotal.toLocaleString(), icon: Gauge, tone: "blue", rows: allRows, hint: "Total targeted companies counted from planner rows" },
    { key: "floated", label: "Total Floated", value: allRows.length.toLocaleString(), icon: BriefcaseBusiness, tone: "red", rows: allRows, hint: "All company opportunities currently visible" },
    { key: "progress", label: "Progress", value: `${progressPercent}%`, icon: Percent, tone: "green", rows: inProcessRows, hint: `${completedRows.length} completed from ${allRows.length} floated` },
    { key: "completed", label: "Completed", value: completedRows.length.toLocaleString(), icon: CheckCircle2, tone: "purple", rows: completedRows, hint: "Closed or completed placement activities" },
    { key: "selections", label: "Selections", value: selectionTotal.toLocaleString(), icon: Users, tone: "orange", rows: selectionRows, hint: "Rows where student selections are recorded" }
  ];
  const activeCard = metricCards.find(item => item.key === activeMetric) || metricCards[1];
  const matchingRows = filteredBySearch(activeCard.rows);
  const detailRows = matchingRows.slice(0, 18);
  const tableRows = matchingRows.slice(0, 50);
  useEffect(() => {
    if (!searchTerm.trim()) return;
    const timer = window.setTimeout(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchTerm, activeMetric]);
  return (
    <section className="authority-overview-panel authority-overview-redesign">
      <div className="authority-command-panel">
        <div>
          <span className="eyebrow">{compactIntro ? "Live progress" : "Authority overview"}</span>
          <h3>Overall placement performance</h3>
          <p>Review targets, floated companies, progress, completed drives, selections, registrations, and packages from the linked planner data.</p>
        </div>
        <label className="authority-search-box">
          <Search size={18} />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search company, role, officer, batch, status..."
            aria-label="Search overview details"
          />
        </label>
      </div>

      <div className="authority-kpi-grid">
        {metricCards.map(({ key, label, value, icon: Icon, tone, hint }) => (
          <button type="button" key={key} className={`authority-kpi-card ${activeMetric === key ? "active" : ""} tone-${tone}`} onClick={() => setActiveMetric(key)}>
            <span className="authority-kpi-icon"><Icon size={21} /></span>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      <div className="authority-detail-panel" ref={detailPanelRef}>
        <header>
          <div>
            <span className="eyebrow">Drill down</span>
            <h3>{activeCard.label} details</h3>
            <p>{matchingRows.length} matching row{matchingRows.length === 1 ? "" : "s"} shown from current planner data. Highest package: {highestPackage || 0} LPA.</p>
          </div>
          <span className="authority-detail-count">{searchTerm.trim() ? matchingRows.length.toLocaleString() : activeCard.value}</span>
        </header>
        <div className="authority-detail-grid">
          {detailRows.map((record) => (
            <article key={record._id || `${record.companyName}-${record.jobProfile}-${record.batch}`} className="authority-detail-card">
              <div>
                <strong title={record.companyName}>{record.companyName || "-"}</strong>
                <span title={record.jobProfile}>{record.jobProfile || "-"}</span>
              </div>
              <dl>
                <div><dt>Officer</dt><dd>{record.placementOfficer || record.leadBy || "-"}</dd></div>
                <div><dt>Batch</dt><dd>{record.batch || "-"}</dd></div>
                <div><dt>Target</dt><dd>{targetValue(record).toLocaleString()}</dd></div>
                <div><dt>Selections</dt><dd>{numberValue(record.selections).toLocaleString()}</dd></div>
              </dl>
              <footer>
                <span className={`authority-status-pill ${isClosed(record) ? "closed" : "active"}`}>{record.actualStatus || "-"}</span>
                <span>{packageLabel(record)}</span>
              </footer>
            </article>
          ))}
          {!detailRows.length && <EmptyState icon={FileSearch} message="No matching placement details found" />}
        </div>
      </div>

      <div className="authority-company-table">
        <header>
          <div>
            <span className="eyebrow">Detailed rows</span>
            <h3>{activeCard.label} report table</h3>
          </div>
        </header>
        <div className="authority-table-scroll">
          <table>
            <thead>
              <tr><th>Company</th><th>Job Profile</th><th>Officer</th><th>Package</th><th>Batch</th><th>Status</th><th>Selections</th></tr>
            </thead>
            <tbody>
              {tableRows.map((record) => (
                <tr key={record._id}>
                  <td title={record.companyName}>{record.companyName || "-"}</td>
                  <td title={record.jobProfile}>{record.jobProfile || "-"}</td>
                  <td title={record.placementOfficer || record.leadBy}>{record.placementOfficer || record.leadBy || "-"}</td>
                  <td title={record.packageText}>{record.packageText || `${record.packageLpa || 0} LPA`}</td>
                  <td>{record.batch || "-"}</td>
                  <td>{record.actualStatus || "-"}</td>
                  <td>{record.selections || 0}</td>
                </tr>
              ))}
              {!tableRows.length && <tr><td colSpan="7">No placement rows found for this selection.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ReportRows({ rows }) {
  return (
    <div className="prc-v2-rows">
      {rows.map(([label, value]) => (
        <div className="prc-v2-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function PlannerRequestsPage() {
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [showAllPending, setShowAllPending] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  async function load() {
    try {
      setReport(await api("/drives/planner/report"));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function decideRequest(id, status) {
    setBusyId(id);
    setMessage("");
    try {
      const result = await api(`/drives/planner/edit-requests/${id}/decision`, { method: "POST", body: JSON.stringify({ status }) });
      if (result?.blocked) {
        setMessage(result.message || "Google Sheet write-back was blocked. Request was not approved.");
        return;
      }
      setMessage(status === "APPROVED" ? "Request approved and planner data updated." : "Request rejected.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  const requests = report?.requests || [];
  const filteredRequests = requests.filter(item => !requestSearch.trim() || [
    item.status,
    item.record?.companyName,
    item.requester?.name,
    item.field ? labelFor(item.field) : "",
    item.currentValue,
    item.requestedValue,
    item.reason,
    formatDateTime(item.createdAt),
    formatDateTime(item.reviewedAt)
  ].join(" ").toLowerCase().includes(requestSearch.trim().toLowerCase()));
  const pending = filteredRequests.filter(item => item.status === "PENDING");
  const history = filteredRequests.filter(item => item.status !== "PENDING");
  const pendingVisible = showAllPending ? pending : pending.slice(0, 3);
  const historyVisible = showAllHistory ? history : history.slice(0, 3);
  const renderRequest = item => {
    const companyTitle = item.record?.companyName || item.companyName || item.record?.jobProfile || "";
    const rowOwner = item.record?.placementOfficer || item.record?.leadBy || item.requester?.name || "planner row";
    return (
      <article key={item._id} className="request-history-card">
        <div>
          <div className="request-card-topline">
            <span className={`request-status ${String(item.status || "").toLowerCase()}`}>{item.status}</span>
            <small>{formatDateTime(item.createdAt)}</small>
          </div>
          <h3 title={companyTitle || rowOwner}>{companyTitle || `${labelFor(item.field || "field")} correction`}</h3>
          {item.field && <div className="request-field-change">
            <span>{labelFor(item.field)}</span>
            <strong>{item.currentValue || "-"}</strong>
            <strong>{item.requestedValue || "-"}</strong>
          </div>}
          <p>{item.reason || "No correction note provided."}</p>
          <small className="request-meta-line">{item.requester?.name || "Manager"} requested this for {rowOwner}{item.reviewedAt ? ` Â· Reviewed ${formatDateTime(item.reviewedAt)}` : ""}</small>
        </div>
        {item.status === "PENDING" && (
          <div className="request-card-actions">
            <button onClick={() => decideRequest(item._id, "APPROVED")} disabled={busyId === item._id}>Approve</button>
            <button className="soft" onClick={() => decideRequest(item._id, "REJECTED")} disabled={busyId === item._id}>Reject</button>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Correction Requests" title="Planner Requests" subtitle="Review manager correction requests and keep a clear decision history" />
      {message && <ToastMessage toast={{ type: /unable|failed|required|error/i.test(message) ? "error" : "success", message }} onClose={() => setMessage("")} />}
      <section className="request-search-panel">
        <label className="planner-history-search"><Search size={16} /><input value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Search company, manager, field, status, reason" /></label>
      </section>
      <section className="requests-page-grid">
        <div>
          <span className="eyebrow">Needs action</span>
          <h2>Pending requests</h2>
          <div className="request-list">
            {pendingVisible.map(renderRequest)}
            {!pending.length && <EmptyState icon={FileSearch} message="No pending correction requests" />}
          </div>
          {pending.length > 3 && (
            <div className="request-view-more">
              <button type="button" className="soft" onClick={() => setShowAllPending(value => !value)}>
                {showAllPending ? "Show less" : `View more (${pending.length - 3})`}
              </button>
              <span>Showing {pendingVisible.length} of {pending.length}</span>
            </div>
          )}
        </div>
        <div>
          <span className="eyebrow">History</span>
          <h2>Reviewed requests</h2>
          <div className="request-list">
            {historyVisible.map(renderRequest)}
            {!history.length && <EmptyState icon={ListChecks} message="No reviewed requests yet" />}
          </div>
          {history.length > 3 && (
            <div className="request-view-more">
              <button type="button" className="soft" onClick={() => setShowAllHistory(value => !value)}>
                {showAllHistory ? "Show less" : `View more (${history.length - 3})`}
              </button>
              <span>Showing {historyVisible.length} of {history.length}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function PlannerReportCard({ group, year, selectedBatch = "ALL", collapsed = false, onToggleExpanded, canEdit, canRequest, requests = [], onRequest, onReload }) {
  const [activeSummary, setActiveSummary] = useState("");
  const [activeChartDetail, setActiveChartDetail] = useState("");
  const [summarySearch, setSummarySearch] = useState("");
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [detailColumns, setDetailColumns] = useState(["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus"]);
  const [detailDrafts, setDetailDrafts] = useState({});
  const [detailMessage, setDetailMessage] = useState("");
  const [savingDetailId, setSavingDetailId] = useState("");
  const [editRequestDraft, setEditRequestDraft] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const rows = group.records || [];
  const comparisonRows = group.comparisonRecords?.length ? group.comparisonRecords : rows;
  const s = group.summary || {};
  const requestFields = [
    "companyName", "jobProfile", "placementOfficer", "leadBy", "dateFloated", "dateOfDrive", "batch", "actualStatus", "finalSelectionDate",
    "totalEligible", "totalRegistered", "selections", "packageText", "remarks"
  ];
  const requestsByRecord = useMemo(() => requests.reduce((map, item) => {
    const recordId = String(item.record?._id || item.record || "");
    if (!recordId) return map;
    (map[recordId] ||= []).push(item);
    return map;
  }, {}), [requests]);
  
  // Calculate metrics
  const categoryCount = label => rows.filter(row => String(row.companyCategory || "").toLowerCase().includes(label)).length;
  const coreCount = categoryCount("core");
  const salesCount = rows.filter(row => !String(row.companyCategory || "").toLowerCase().includes("core")).length;
  const totalCategory = coreCount + salesCount || 1;
  const salesPct = Math.round((salesCount / totalCategory) * 100);
  const corePct = 100 - salesPct;

  const totalSelections = s.selections || 0;
  const targetAllotted = rows.length;
  const overallAchievement = Math.round((s.closed / Math.max(1, targetAllotted)) * 100);
  
  const nilSelections = useMemo(() => rows.filter(r => r.selections === 0 && r.actualStatus?.toLowerCase().includes("closed")).length, [rows]);
  const withSelections = useMemo(() => rows.filter(r => r.selections > 0 && r.actualStatus?.toLowerCase().includes("closed")).length, [rows]);
  const totalClosed = s.closed || 1;
  
  const closureNilPct = Math.round((nilSelections / totalClosed) * 100);
  const closureWithPct = Math.round((withSelections / totalClosed) * 100);
  const summarizeRows = (list) => {
    const closed = list.filter(r => /closed|complete|selected/i.test(r.actualStatus || ""));
    const sales = list.filter(row => String(row.companyCategory || row.remarks || "").toLowerCase().includes("sales")).length;
    const core = list.filter(row => String(row.companyCategory || row.remarks || "").toLowerCase().includes("core")).length;
    const selected = list.reduce((sum, row) => sum + (row.selections || 0), 0);
    const nil = list.filter(r => r.selections === 0 && /closed|complete|selected/i.test(r.actualStatus || "")).length;
    const withSel = list.filter(r => r.selections > 0 && /closed|complete|selected/i.test(r.actualStatus || "")).length;
    const closedCount = closed.length || 1;
    return {
      floated: list.length,
      closed: closed.length,
      selected,
      sales,
      core,
      nil,
      withSel,
      target: list.length,
      achievedPct: Math.round((closed.length / Math.max(1, list.length)) * 100),
      nilPct: Math.round((nil / closedCount) * 100),
      withPct: Math.round((withSel / closedCount) * 100)
    };
  };
  const batchNumber = value => {
    const matches = String(value || "").match(/20\d{2}/g) || [];
    return matches.length ? Number(matches[matches.length - 1]) : 0;
  };
  const rowBatchName = row => String(row.batch || row.academicYear || "").trim();
  const activeBatchFromYear = value => {
    const matches = String(value || "").match(/20\d{2}/g) || [];
    return matches.length ? matches[matches.length - 1] : "";
  };
  const batchNames = [...new Set(comparisonRows.map(rowBatchName).filter(Boolean))]
    .sort((a, b) => batchNumber(b) - batchNumber(a) || a.localeCompare(b, undefined, { numeric: true }));
  const selectedBatchYear = selectedBatch !== "ALL" ? activeBatchFromYear(selectedBatch) : "";
  const activeBatch = selectedBatchYear || activeBatchFromYear(year);
  const batchOneName = (activeBatch && batchNames.find(name => batchNumber(name) === Number(activeBatch))) || batchNames[0] || activeBatch || "";
  const batchTwoName = batchNames.find(name => name !== batchOneName && batchNumber(name) < batchNumber(batchOneName))
    || batchNames.find(name => name !== batchOneName)
    || "";
  const batchTitle = value => String(value).toLowerCase().startsWith("batch") ? String(value).toUpperCase() : `BATCH ${value}`;
  const batchOneRows = comparisonRows.filter(row => batchNumber(rowBatchName(row)) === batchNumber(batchOneName));
  const batchTwoRows = comparisonRows.filter(row => batchNumber(rowBatchName(row)) === batchNumber(batchTwoName));
  const batchOne = summarizeRows(batchOneRows.length ? batchOneRows : rows.filter(row => batchNumber(rowBatchName(row)) === batchNumber(batchOneName)));
  const batchTwo = summarizeRows(batchTwoRows);
  const hasPastBatch = Boolean(batchTwoName);
  const pctOfMax = value => `${Math.max(5, Math.min(100, Math.round((Number(value || 0) / Math.max(1, targetAllotted, totalSelections, s.floated || 0)) * 100)))}%`;
  const metricSeries = [
    { key: "overall", label: "Overall Since Inception", className: "dark", data: { target: targetAllotted, floated: s.floated || 0, closed: s.closed || 0, selected: totalSelections, sales: salesCount, core: coreCount, achievedPct: overallAchievement, nilPct: closureNilPct, withPct: closureWithPct } },
    { key: "batch-one", label: batchOneName || "Selected Batch", className: "mid", data: batchOne },
    ...(hasPastBatch ? [{ key: "batch-two", label: batchTwoName, className: "light", data: batchTwo }] : [])
  ];
  const performanceMetrics = [
    ["Target", "target"],
    ["Overall Companies", "floated"],
    ["Closed", "closed"],
    ["Selected Students", "selected"],
    ["Sales Selections", "sales"],
    ["Core Selections", "core"]
  ];
  const closureMetrics = [
    ["Closed Target Achieved", "achievedPct"],
    ["Closure Nil Selection %", "nilPct"],
    ["Closure with Selection %", "withPct"]
  ];
  const activeChartTitle = activeChartDetail === "performance" ? "Performance Overview" : activeChartDetail === "closure" ? "Closure Performance" : "";
  const salesInsight = salesCount >= coreCount ? "Sales-led performance" : "Core-led performance";
  const summaryCards = useMemo(() => [
    {
      key: "target",
      icon: Crop,
      value: targetAllotted,
      label: "Target",
      text: "Annual placement target set for overall companies.",
      defaultFields: ["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus", "totalEligible", "totalRegistered"],
      filter: record => record,
      note: `${targetAllotted} total planner rows are counted as the current target set.`
    },
    {
      key: "achievement",
      icon: BriefcaseBusiness,
      value: `${overallAchievement}%`,
      label: "Overall Achievement",
      text: `${s.closed || 0} companies closed against the target.`,
      defaultFields: ["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus", "finalSelectionDate", "selections", "remarks"],
      filter: record => /closed|complete|selected/i.test(record.actualStatus || ""),
      note: `${s.closed || 0} closed companies out of ${targetAllotted || 0} target rows.`
    },
    {
      key: "students",
      icon: GraduationCap,
      value: totalSelections,
      label: "Students Selected",
      text: "Strong student interest and engagement.",
      defaultFields: ["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus", "totalEligible", "totalRegistered", "selections"],
      filter: record => Number(record.selections || 0) > 0,
      note: `${totalSelections} total selections from rows where selections are greater than zero.`
    },
    {
      key: "sales",
      icon: Users,
      value: salesCount,
      label: "Sales Selections",
      text: "Primary strength in sales domain placements.",
      defaultFields: ["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus", "selections", "packageText", "remarks"],
      filter: record => !String(record.companyCategory || "").toLowerCase().includes("core"),
      note: `${salesCount} rows are treated as sales/non-core placement rows.`
    },
    {
      key: "core",
      icon: ShieldCheck,
      value: coreCount,
      label: "Core Selections",
      text: "Focused effort on high-potential core opportunities.",
      defaultFields: ["companyName", "jobProfile", "placementOfficer", "leadBy", "batch", "actualStatus", "selections", "packageText", "remarks"],
      filter: record => String(record.companyCategory || "").toLowerCase().includes("core"),
      note: `${coreCount} rows are marked as core placement opportunities.`
    }
  ], [coreCount, nilSelections, overallAchievement, s.closed, salesCount, targetAllotted, totalSelections, withSelections]);
  const activeSummaryCard = useMemo(() => summaryCards.find(card => card.key === activeSummary), [activeSummary, summaryCards]);
  const availableDetailColumns = useMemo(() => [
    ["companyName", "Company"], ["jobProfile", "Job Profile"], ["placementOfficer", "Officer"], ["leadBy", "Lead By"],
    ["batch", "Batch"], ["actualStatus", "Status"], ["dateFloated", "Date Floated"], ["dateOfDrive", "Drive Date"],
    ["finalSelectionDate", "Final Selection Date"], ["totalEligible", "Eligible"], ["totalRegistered", "Registered"],
    ["selections", "Selections"], ["packageText", "Package"], ["remarks", "Remarks"]
  ], []);
  const visibleDetailColumns = useMemo(() => availableDetailColumns.filter(([key]) => detailColumns.includes(key)), [availableDetailColumns, detailColumns]);
  const openSummary = (card) => {
    if (activeSummary === card.key) {
      setActiveSummary("");
      setShowColumnPicker(false);
      return;
    }
    setDetailColumns(card.defaultFields);
    setSummarySearch("");
    setShowColumnPicker(false);
    setActiveSummary(card.key);
  };
  const downloadDetailExcel = () => {
    const xmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));
    const cells = (values) => values.map(value => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`).join("");
    const spreadsheet = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEscape(activeSummaryCard?.label || "Report")}"><Table><Row>${cells(visibleDetailColumns.map(([, label]) => label))}</Row>${summaryRows.map(record => `<Row>${cells(visibleDetailColumns.map(([key]) => record[key] ?? ""))}</Row>`).join("")}</Table></Worksheet></Workbook>`;
    const blob = new Blob([spreadsheet], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${String(activeSummaryCard?.label || "placement-report").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };
  const summaryRows = useMemo(() => (
    activeSummaryCard
      ? rows
        .filter(activeSummaryCard.filter)
        .filter(record => [record.companyName, record.jobProfile, record.placementOfficer, record.leadBy, record.actualStatus, record.batch].join(" ").toLowerCase().includes(summarySearch.toLowerCase()))
      : []
  ), [activeSummaryCard, rows, summarySearch]);
  const detailField = (record, key) => detailDrafts[record._id]?.[key] ?? (record[key] ?? "");
  const detailInput = (record, key, type = "text") => (
    <input
      type={type}
      title={String(detailField(record, key) || "")}
      value={detailField(record, key)}
      onChange={event => updateDetailDraft(record, key, event.target.value)}
      onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveDetailRecord(record);
        }
      }}
    />
  );
  const updateDetailDraft = (record, key, value) => {
    setDetailDrafts(prev => ({ ...prev, [record._id]: { ...(prev[record._id] || {}), [key]: value } }));
  };
  const saveDetailRecord = async (record) => {
    const changes = detailDrafts[record._id];
    if (!changes) return;
    setSavingDetailId(record._id);
    setDetailMessage("");
    try {
      const result = await api(`/drives/planner/records/${record._id}`, { method: "PATCH", body: JSON.stringify(changes) });
      if (result?.blocked) {
        setDetailMessage(result.message || "Google Sheet write-back was blocked. App data was not changed.");
        return;
      }
      setDetailDrafts(prev => {
        const next = { ...prev };
        delete next[record._id];
        return next;
      });
      setDetailMessage(`Saved ${record.companyName || "planner row"}`);
      await onReload?.();
    } catch (error) {
      setDetailMessage(error.message);
    } finally {
      setSavingDetailId("");
    }
  };
  const openEditRequest = (record) => {
    const field = "companyName";
    setEditRequestDraft({
      record,
      field,
      currentValue: String(record[field] ?? ""),
      requestedValue: "",
      reason: ""
    });
  };
  const changeRequestField = (field) => {
    setEditRequestDraft(prev => ({ ...prev, field, currentValue: String(prev.record?.[field] ?? ""), requestedValue: "" }));
  };
  const submitEditRequest = async (event) => {
    event.preventDefault();
    if (!editRequestDraft?.record) return;
    setRequestBusy(true);
    try {
      await onRequest?.(editRequestDraft.record, {
        field: editRequestDraft.field,
        currentValue: editRequestDraft.currentValue,
        requestedValue: editRequestDraft.requestedValue,
        reason: editRequestDraft.reason
      });
      setEditRequestDraft(null);
    } finally {
      setRequestBusy(false);
    }
  };
  const downloadPdfReport = () => {
    const escapeHtml = (value) => String(value ?? "-").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
    const reportRows = (title, values) => `<section class="metric-card"><h2>${escapeHtml(title)}</h2><table><tbody>${values.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table></section>`;
    const documentTitle = `${group.name || "Placement"} Placement Officer Report`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setDetailMessage("Your browser blocked the PDF window. Allow pop-ups and try again.");
      return;
    }
    printWindow.opener = null;
    const overallRows = [
      ["Target", targetAllotted], ["Overall Companies", s.floated || 0], ["Closed", s.closed || 0], ["Closed Target Achieved", `${overallAchievement}%`],
      ["Closure Nil Selection %", `${closureNilPct}%`], ["Closure with Selection %", `${closureWithPct}%`], ["Company closed with Nil Selections", nilSelections], ["Companies with Selection", withSelections], ["Selected Students", totalSelections], ["Core Companies", coreCount], ["Sales Companies", salesCount]
    ];
    const batchRows = (batch) => [["Target", batch.target], ["Overall Companies", batch.floated], ["Closed", batch.closed], ["Closed Target Achieved", `${batch.achievedPct}%`], ["Closure Nil Selection %", `${batch.nilPct}%`], ["Closure with Selection %", `${batch.withPct}%`], ["Company closed with Nil Selections", batch.nil], ["Companies with Selection", batch.withSel], ["Selected Students", batch.selected], ["Core Companies", batch.core], ["Sales Companies", batch.sales]];
    const reportDate = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    const seriesBars = (key) => metricSeries.map(series => `<div class="bar-set"><div class="bar ${series.className}" style="height:${Math.max(5, Math.min(100, Math.round((Number(series.data[key] || 0) / Math.max(1, targetAllotted, totalSelections, s.floated || 0)) * 100)))}%"><span>${escapeHtml(series.data[key] || 0)}</span></div></div>`).join("");
    const performanceChart = `<section class="chart-card"><h2>PERFORMANCE OVERVIEW</h2><div class="legend">${metricSeries.map(series => `<span><i class="${series.className}"></i>${escapeHtml(series.label)}</span>`).join("")}</div><div class="bar-chart">${performanceMetrics.map(([label, key]) => `<div class="chart-column"><div class="bar-stack">${seriesBars(key)}</div><strong>${escapeHtml(label)}</strong></div>`).join("")}</div><p>Performance is calculated from the selected officer's linked planner rows.</p></section>`;
    const closureChart = `<section class="chart-card"><h2>CLOSURE PERFORMANCE (%)</h2><div class="legend">${metricSeries.map(series => `<span><i class="${series.className}"></i>${escapeHtml(series.label)}</span>`).join("")}</div><div class="closure-grid">${closureMetrics.map(([label, key]) => `<article><div class="ring" style="--ring:${Math.max(0, Math.min(100, Number(metricSeries[0].data[key] || 0)))}"><b>${escapeHtml(metricSeries[0].data[key] || 0)}%</b></div><strong>${escapeHtml(label)}</strong><small>Overall since inception</small></article>`).join("")}</div></section>`;
    const bottomPanels = `<div class="bottom-grid"><section class="info-card sales-card"><h2>SALES VS CORE FOCUS</h2><div class="focus-row"><b>${salesPct}%</b><div><strong>Sales Companies · ${salesCount}</strong><p>Primary strength and key focus area.</p></div></div><div class="focus-row core"><b>${corePct}%</b><div><strong>Core Companies · ${coreCount}</strong><p>Selective focus on high-potential opportunities.</p></div></div></section><section class="info-card"><h2>KEY HIGHLIGHTS</h2><ul><li><b>${escapeHtml(salesInsight)}.</b> ${salesCount} sales and ${coreCount} core companies.</li><li><b>${s.closed || 0} companies closed</b> out of ${s.floated || 0} floated companies.</li><li><b>${closureNilPct}% nil-selection closure</b> needs conversion attention.</li><li><b>${totalSelections} total selections.</b> Focus remains on quality placements.</li></ul></section><section class="info-card action-card"><h2>KEY TAKEAWAYS &amp; ACTION PLAN</h2><ul><li>Increase closure with selection through student readiness.</li><li>Reduce nil selections with stronger pre-qualification.</li><li>Expand high-converting sales opportunities.</li><li>Build long-term core-domain relationships.</li><li>Maintain consistent follow-ups.</li></ul></section></div>`;
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(documentTitle)}</title><style>
      @page{size:A4 portrait;margin:13mm 12mm 14mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#10233e;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:100%;break-inside:avoid;page-break-inside:avoid}.page-one{page-break-after:always}.page-two{break-before:avoid;page-break-before:avoid;page-break-after:auto}.report-header{display:flex;justify-content:space-between;gap:18px;padding:18px 20px;background:#071b3a;color:#fff;border-radius:12px}.eyebrow{color:#f49aa7;font-size:9px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase}.report-header h1{margin:5px 0;font-size:25px;line-height:1.08}.report-header h1 span{display:block;font-size:15px;font-weight:600;color:#cce5fa;margin-top:5px}.report-header p{margin:0;color:#d8eafb;font-size:10px}.header-chip{align-self:center;padding:9px 12px;border:1px solid #7eb8e7;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap}.section-title{margin:14px 0 0;padding:8px;background:#dff4ff;border:1px solid #b8def1;border-bottom:0;border-radius:9px 9px 0 0;color:#0c4a82;text-align:center;font-size:11px;letter-spacing:1.4px}.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:9px;border:1px solid #b8def1;border-radius:0 0 9px 9px}.summary article{min-height:91px;padding:10px;border:1px solid #a9d5ed;border-radius:8px;background:#fff}.summary span{display:block;color:#36516d;font-size:9px;font-weight:800;text-transform:uppercase}.summary strong{display:block;margin:8px 0 5px;color:#08284f;font-size:23px}.summary small{display:block;color:#597086;font-size:8.5px;line-height:1.3}.table-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}.metric-card,.chart-card,.info-card{overflow:hidden;border:1px solid #9fdbf4;border-radius:9px;background:#fff;break-inside:avoid;page-break-inside:avoid}.metric-card h2,.chart-card h2,.info-card h2{margin:0;padding:9px 8px;background:#dff4ff;color:#06447e;text-align:center;font-size:9.5px;letter-spacing:.65px}.metric-card table{width:100%;border-collapse:collapse;table-layout:fixed}.metric-card th,.metric-card td{padding:6px 7px;border-bottom:1px solid #dce9f1;font-size:8.4px;line-height:1.15}.metric-card th{width:73%;color:#39536d;text-align:left;font-weight:600}.metric-card td{width:27%;color:#071b3a;text-align:right;font-weight:800;white-space:nowrap}.metric-card tr:last-child>*{border-bottom:0}.foot{margin:9px 2px 0;color:#61758a;font-size:8.5px}.charts{display:grid;grid-template-columns:1.22fr .98fr;gap:10px;margin-top:0}.chart-card{min-height:270px}.legend{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:8px 9px 2px;color:#486078;font-size:8px;font-weight:700}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:9px;height:9px;border-radius:2px}.dark{background:#071b3a}.mid{background:#0a5ea8}.light{background:#53b4e5}.bar-chart{height:171px;display:flex;align-items:stretch;justify-content:space-around;gap:5px;margin:6px 10px 0;padding:0 4px;border-bottom:1px solid #a9c7dc}.chart-column{display:flex;flex:1;min-width:0;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}.bar-stack{height:136px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}.bar-set{height:100%;display:flex;align-items:flex-end}.bar{position:relative;width:12px;min-height:7px;border-radius:3px 3px 0 0}.bar span{position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);font-size:7px;font-weight:800;color:#233a56}.chart-column>strong{min-height:24px;color:#405a74;font-size:7.5px;line-height:1.15;text-align:center}.chart-card>p{margin:6px 10px 8px;color:#62778a;font-size:8px;text-align:center}.closure-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:18px 10px}.closure-grid article{text-align:center}.ring{--ring:0;position:relative;display:grid;place-items:center;width:70px;height:70px;margin:0 auto 8px;border-radius:50%;background:conic-gradient(#071b3a calc(var(--ring) * 1%),#dcecf5 0)}.ring:before{content:"";position:absolute;width:53px;height:53px;border-radius:50%;background:#fff}.ring b{position:relative;z-index:1;color:#071b3a;font-size:13px}.closure-grid strong{display:block;color:#334d67;font-size:8px;line-height:1.25}.closure-grid small{display:block;margin-top:4px;color:#7a8b9b;font-size:7px}.bottom-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px;break-inside:avoid;page-break-inside:avoid}.info-card{min-height:178px}.info-card h2{background:#dff4ff}.info-card ul{margin:0;padding:9px 13px 10px 24px;color:#405a73}.info-card li{margin:0 0 7px;font-size:8px;line-height:1.3}.info-card li:last-child{margin-bottom:0}.sales-card{padding-bottom:7px}.focus-row{display:flex;align-items:center;gap:8px;margin:8px 10px;padding-bottom:8px;border-bottom:1px solid #dce9f1}.focus-row:last-child{border-bottom:0}.focus-row>b{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:#071b3a;color:#fff;font-size:9px}.focus-row.core>b{background:#0a5ea8}.focus-row strong{color:#183a62;font-size:8.5px}.focus-row p{margin:3px 0 0;color:#63788d;font-size:7.5px;line-height:1.25}.action-card h2{background:#071b3a;color:#fff}.action-card li{color:#334d67}@media print{.page-one{page-break-after:always}.page-two{page-break-before:avoid;page-break-after:auto}.metric-card,.chart-card,.info-card{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="page page-one"><header class="report-header"><div><div class="eyebrow">Placement Report</div><h1>${escapeHtml(group.name)}<span>Placement Officer Report</span></h1><p>Batch: ${escapeHtml(selectedBatch === "ALL" ? "All Batches" : selectedBatch)} · Generated ${escapeHtml(reportDate)}</p></div><div class="header-chip">Data as on ${escapeHtml(reportDate)}</div></header><h2 class="section-title">PROFESSIONAL SUMMARY</h2><section class="summary">${summaryCards.map(card => `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.text)}</small></article>`).join("")}</section><main class="table-grid">${reportRows("Overall Performance Since Inception", overallRows)}${reportRows(batchTitle(batchOneName), batchRows(batchOne))}${reportRows(hasPastBatch ? batchTitle(batchTwoName) : "PAST BATCH", hasPastBatch ? batchRows(batchTwo) : [["Status", "No data available"]])}</main><p class="foot">This report is calculated directly from the linked company tracker.</p></div><div class="page page-two"><div class="charts">${performanceChart}${closureChart}</div>${bottomPanels}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    requestAnimationFrame(() => printWindow.print());
  };
  return (
    <article className={`prc-v2-container ${collapsed ? "prc-v2-card-collapsed" : ""}`}>
      {/* HEADER */}
      <header className="prc-v2-header">
        <div className="prc-v2-header-left">
          <div className="prc-v2-avatar">
            <UserCog size={36} color="white" />
          </div>
          <div className="prc-v2-title">
            <h2>{group.name}</h2>
            <p>Placement Performance Dashboard</p>
          </div>
        </div>
        <div className="prc-v2-header-right">
          <Calendar size={18} />
          <span>Data as on {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        </div>
      </header>

      {/* PROFESSIONAL SUMMARY */}
      <div className="prc-v2-section-header">PROFESSIONAL SUMMARY</div>
      <div className="prc-v2-summary-row">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.key}
              className={`prc-v2-summary-box ${activeSummary === card.key ? "active" : ""}`}
              data-tooltip={`Calculated from planner rows: ${card.note}`}
              title={`Open the ${card.label} report. ${card.note}`}
              aria-haspopup="dialog"
              aria-label={`Open dedicated ${card.label} report`}
              onClick={() => openSummary(card)}
            >
              <div className="prc-v2-summary-icon"><Icon size={24} /></div>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
              <p>{card.text}</p>
            </button>
          );
        })}
      </div>
      <div className="prc-v2-summary-actions">
        <button type="button" className="prc-v2-pdf" onClick={downloadPdfReport}><FileDown size={17} /> Download PDF</button>
        <button type="button" className="prc-v2-expand" onClick={onToggleExpanded} aria-label={`${collapsed ? "Open" : "Collapse"} ${group.name}'s report`} title={collapsed ? "Open full report" : "Show summary only"}>
          <span>{collapsed ? "View full report" : "Show summary"}</span><ChevronRight size={22} />
        </button>
      </div>
      {activeSummaryCard && createPortal(
        <div className="modal-overlay report-detail-overlay">
          <section className="report-summary-detail modal-panel">
          <header>
            <div>
              <span className="eyebrow">Report details</span>
              <h3>{activeSummaryCard.label}</h3>
              <p>{activeSummaryCard.note}</p>
            </div>
            <label className="stat-search"><Search size={16} /><input value={summarySearch} onChange={event => setSummarySearch(event.target.value)} placeholder="Search company, officer, batch, status" /></label>
            <div className="report-detail-actions">
              <div className="detail-column-picker">
                <button type="button" className="soft" onClick={() => setShowColumnPicker(value => !value)}><Settings2 size={16} /> Fields</button>
                {showColumnPicker && <div className="detail-column-menu">
                  <strong>Display fields</strong>
                  {availableDetailColumns.map(([key, label]) => <label key={key}><input type="checkbox" checked={detailColumns.includes(key)} onChange={() => setDetailColumns(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} /> {label}</label>)}
                </div>}
              </div>
              <button type="button" className="soft detail-excel-download" onClick={downloadDetailExcel} disabled={!visibleDetailColumns.length}><FileDown size={16} /> Excel</button>
              <button type="button" className="soft report-detail-close" onClick={() => { setActiveSummary(""); setSummarySearch(""); setShowColumnPicker(false); }}><X size={17} /> Close</button>
            </div>
          </header>
          {detailMessage && <div className={`notice ${/blocked|failed|unable|not changed/i.test(detailMessage) ? "error-notice" : "success-notice"}`}>{detailMessage}</div>}
          <div className="report-detail-kpis">
            <article><span>{activeSummaryCard.label}</span><strong>{activeSummaryCard.value}</strong></article>
            <article><span>Total rows shown</span><strong>{summaryRows.length}</strong></article>
            <article><span>Total selections</span><strong>{summaryRows.reduce((sum, record) => sum + Number(record.selections || 0), 0)}</strong></article>
            <article><span>Closed rows</span><strong>{summaryRows.filter(record => /closed|complete|selected/i.test(record.actualStatus || "")).length}</strong></article>
          </div>
          <div className="stat-detail-table">
            <table>
              <thead><tr>{visibleDetailColumns.map(([key, label]) => <th key={key}>{label}</th>)}{(canEdit || canRequest) && <th>Action / Request</th>}</tr></thead>
              <tbody>
                {summaryRows.map(record => {
                  const recordRequests = requestsByRecord[String(record._id)] || [];
                  const latestRequest = recordRequests[0];
                  return (
                    <tr key={record._id}>
                      {visibleDetailColumns.map(([key]) => <td key={key} title={String(record[key] ?? "-")}>{canEdit ? detailInput(record, key, ["totalEligible", "totalRegistered", "selections"].includes(key) ? "number" : "text") : (record[key] ?? "-")}</td>)}
                      {canEdit && <td><button className="detail-save-btn" disabled={!detailDrafts[record._id] || savingDetailId === record._id} onClick={() => saveDetailRecord(record)}><Save size={14} /> {savingDetailId === record._id ? "Saving" : "Save"}</button></td>}
                      {canRequest && <td className="request-action-cell">
                        {latestRequest && <span className={`request-status ${String(latestRequest.status || "").toLowerCase()}`}>{latestRequest.status} {latestRequest.field ? `Â· ${labelFor(latestRequest.field)}` : ""}</span>}
                        <button type="button" className="soft detail-request-btn" onClick={() => openEditRequest(record)}><FileSearch size={14} /> Request Edit</button>
                      </td>}
                    </tr>
                  );
                })}
                {!summaryRows.length && <tr><td colSpan={visibleDetailColumns.length + ((canEdit || canRequest) ? 1 : 0)}>No rows found for this report stat.</td></tr>}
              </tbody>
            </table>
          </div>
          </section>
        </div>,
        document.body
      )}

      {editRequestDraft && createPortal(
        <div className="modal-overlay edit-request-overlay">
          <section className="edit-request-modal modal-panel">
            <header>
              <div>
                <span className="eyebrow">Edit request</span>
                <h3>{editRequestDraft.record.companyName || "Planner row"}</h3>
                <p>Request a change to one specific field. The Head can approve or reject it from Requests.</p>
              </div>
              <button type="button" className="icon-button soft" onClick={() => setEditRequestDraft(null)} aria-label="Close request"><X size={18} /></button>
            </header>
            <form onSubmit={submitEditRequest}>
              <label>Field to change
                <select value={editRequestDraft.field} onChange={event => changeRequestField(event.target.value)}>
                  {requestFields.map(field => <option key={field} value={field}>{labelFor(field)}</option>)}
                </select>
              </label>
              <label>Current value
                <input value={editRequestDraft.currentValue} readOnly />
              </label>
              <label>Requested value
                <input value={editRequestDraft.requestedValue} onChange={event => setEditRequestDraft(prev => ({ ...prev, requestedValue: event.target.value }))} placeholder="Enter the corrected value" required />
              </label>
              <label>Reason
                <textarea value={editRequestDraft.reason} onChange={event => setEditRequestDraft(prev => ({ ...prev, reason: event.target.value }))} placeholder="Explain why this field should be changed" required minLength={5} />
              </label>
              <div className="edit-request-actions">
                <button disabled={requestBusy}>{requestBusy ? "Sending..." : "Send Request"}</button>
                <button type="button" className="soft" onClick={() => setEditRequestDraft(null)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}

      {activeChartDetail && createPortal(
        <div className="modal-overlay report-detail-overlay">
          <section className="report-chart-detail modal-panel">
            <header>
              <div>
                <span className="eyebrow">Report chart</span>
                <h3>{activeChartTitle}</h3>
                <p>{hasPastBatch ? "Comparing overall, selected batch, and past batch planner data." : "No past batch rows were found, so this detail uses only available planner data."}</p>
              </div>
              <button type="button" className="soft report-detail-close" onClick={() => setActiveChartDetail("")}><X size={17} /> Close</button>
            </header>
            <div className="report-chart-kpis">
              {metricSeries.map(series => (
                <article key={series.key}>
                  <span>{series.label}</span>
                  <strong>{series.data.closed || 0}</strong>
                  <small>closed of {series.data.target || 0} target rows</small>
                </article>
              ))}
            </div>
            <div className="report-chart-detail-grid">
              {(activeChartDetail === "performance" ? performanceMetrics : closureMetrics).map(([label, key]) => (
                <article key={key} className="report-chart-detail-card">
                  <h4>{label}</h4>
                  <div className="report-chart-bars">
                    {metricSeries.map(series => (
                      <div key={series.key}>
                        <span>{series.label}</span>
                        <div className="report-chart-track">
                          <b className={series.className} style={{ width: activeChartDetail === "performance" ? pctOfMax(series.data[key]) : `${Math.min(100, Math.max(0, Number(series.data[key] || 0)))}%` }} />
                        </div>
                        <strong>{series.data[key] || 0}{activeChartDetail === "closure" ? "%" : ""}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>,
        document.body
      )}

      {/* REPORT CARD */}
      <div className="prc-v2-report-grid">
        {/* OVERALL PERFORMANCE */}
        <div className="prc-v2-report-col">
          <div className="prc-v2-section-header dark">OVERALL PERFORMANCE SINCE INCEPTION</div>
          <ReportRows rows={[
            ["Target", targetAllotted],
            ["Overall Companies", s.floated || 0],
            ["Closed", s.closed || 0],
            ["Closed Target Achieved", `${overallAchievement}%`],
            ["Closure Nil Selection %", `${closureNilPct}%`],
            ["Closure with Selection %", `${closureWithPct}%`],
            ["Company closed with Nil Selections", nilSelections],
            ["Companies with Selection", withSelections],
            ["Selected students", totalSelections],
            ["Core Companies", coreCount],
            ["Sales companies", salesCount]
          ]} />
        </div>

        {/* BATCH 2026 */}
        <div className="prc-v2-report-col">
          <div className="prc-v2-section-header dark">{batchTitle(batchOneName)}</div>
          <ReportRows rows={[
            ["Target @12 companies per month", batchOne.target],
            ["Overall Companies", batchOne.floated],
            ["Closed", batchOne.closed],
            ["Closed Target Achieved", `${batchOne.achievedPct}%`],
            ["Closure Nil Selection %", `${batchOne.nilPct}%`],
            ["Closure with Selection %", `${batchOne.withPct}%`],
            ["Company closed with Nil Selections", batchOne.nil],
            ["Companies with Selection", batchOne.withSel],
            ["Selected students", batchOne.selected],
            ["Core Companies", batchOne.core],
            ["Sales companies", batchOne.sales]
          ]} />
        </div>

        {/* BATCH 2 */}
        <div className="prc-v2-report-col">
          <div className="prc-v2-section-header dark">{batchTwoName ? batchTitle(batchTwoName) : "PAST BATCH"}</div>
          <div className="prc-v2-batch-info">
            <Calendar size={20} />
            <div>
              <strong>{batchTwoName || "No past batch rows"}</strong>
              <p>{batchTwoName ? "Calculated from rows matched with this officer in the planner sheet." : "No comparison batch rows are available in the selected planner data."}</p>
            </div>
          </div>
          {hasPastBatch ? <ReportRows rows={[
            ["Target @12 companies per month", batchTwo.target],
            ["Overall Companies", batchTwo.floated],
            ["Closed", batchTwo.closed],
            ["Closed Target Achieved", `${batchTwo.achievedPct}%`],
            ["Closure Nil Selection %", `${batchTwo.nilPct}%`],
            ["Closure with Selection %", `${batchTwo.withPct}%`],
            ["Company closed with Nil Selections", batchTwo.nil],
            ["Companies with Selection", batchTwo.withSel],
            ["Selected students", batchTwo.selected],
            ["Core Companies", batchTwo.core],
            ["Sales companies", batchTwo.sales]
          ]} /> : <EmptyState icon={Calendar} message="No past batch data available for this manager" />}
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="prc-v2-charts-row">
        {/* PERFORMANCE OVERVIEW */}
        <div className="prc-v2-perf-overview">
          <div className="prc-v2-section-header">PERFORMANCE OVERVIEW</div>
          <button type="button" className="prc-v2-chart-open" onClick={() => setActiveChartDetail("performance")} aria-label="Open performance overview details">
          <div className="prc-v2-bar-chart-container">
            {/* Simple CSS-based bar chart approximation */}
            <div className="prc-v2-legend">
              <span><div className="box dark"></div> Overall Since Inception</span>
              <span><div className="box mid"></div> {batchOneName}</span>
              {hasPastBatch && <span><div className="box light"></div> {batchTwoName}</span>}
            </div>
            <div className="prc-v2-bars">
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(targetAllotted)}}><span>{targetAllotted}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.target)}}><span>{batchOne.target}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.target)}}><span>{batchTwo.target}</span></div>}
                <label>Target</label>
              </div>
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(s.floated)}}><span>{s.floated || 0}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.floated)}}><span>{batchOne.floated}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.floated)}}><span>{batchTwo.floated}</span></div>}
                <label>Overall Companies</label>
              </div>
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(s.closed)}}><span>{s.closed || 0}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.closed)}}><span>{batchOne.closed}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.closed)}}><span>{batchTwo.closed}</span></div>}
                <label>Closed</label>
              </div>
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(totalSelections)}}><span>{totalSelections}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.selected)}}><span>{batchOne.selected}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.selected)}}><span>{batchTwo.selected}</span></div>}
                <label>Selected Students</label>
              </div>
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(salesCount)}}><span>{salesCount}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.sales)}}><span>{batchOne.sales}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.sales)}}><span>{batchTwo.sales}</span></div>}
                <label>Sales Selections</label>
              </div>
              <div className="bar-group">
                <div className="bar dark" style={{height: pctOfMax(coreCount)}}><span>{coreCount}</span></div>
                <div className="bar mid" style={{height: pctOfMax(batchOne.core)}}><span>{batchOne.core}</span></div>
                {hasPastBatch && <div className="bar light" style={{height: pctOfMax(batchTwo.core)}}><span>{batchTwo.core}</span></div>}
                <label>Core Selections</label>
              </div>
            </div>
            <p className="prc-v2-perf-footer"><CheckCircle2 size={14}/> Performance is calculated from the selected manager's uploaded planner rows.</p>
          </div>
          </button>
        </div>

        {/* CLOSURE PERFORMANCE */}
        <button type="button" className="prc-v2-closure-perf prc-v2-chart-open" onClick={() => setActiveChartDetail("closure")} aria-label="Open closure performance details">
          <div className="prc-v2-section-header">CLOSURE PERFORMANCE (%)</div>
          <div className="prc-v2-legend">
            <span><div className="box dark"></div> Overall Since Inception</span>
            <span><div className="box mid"></div> {batchOneName}</span>
            {hasPastBatch && <span><div className="box light"></div> {batchTwoName}</span>}
          </div>
          <div className="prc-v2-donuts">
            <div className="donut-col">
              <div className="donut dark" style={{'--pct': overallAchievement}}><span>{overallAchievement}%</span></div>
              <label>Closed Target Achieved</label>
            </div>
            <div className="donut-col">
              <div className="donut dark" style={{'--pct': closureNilPct}}><span>{closureNilPct}%</span></div>
              <label>Closure Nil Selection %</label>
            </div>
            <div className="donut-col">
              <div className="donut dark" style={{'--pct': closureWithPct}}><span>{closureWithPct}%</span></div>
              <label>Closure with Selection %</label>
            </div>
          </div>
        </button>
      </div>

      {/* BOTTOM ROW */}
      <div className="prc-v2-bottom-row">
        {/* SALES VS CORE */}
        <div className="prc-v2-sales-core">
          <div className="prc-v2-section-header">SALES VS CORE FOCUS</div>
          <div className="prc-v2-sales-core-content">
            <div className="donut-row">
              <div className="donut-wrap">
                <div className="donut dark" style={{'--pct': salesPct}}><span>{salesPct}%</span></div>
                <div className="label-wrap">
                  <strong>{salesCount}</strong>
                  <span>Companies</span>
                </div>
              </div>
              <div className="donut-info">
                <strong>Sales Companies</strong>
                <p>Primary strength and key focus area</p>
              </div>
            </div>
            <div className="donut-row">
              <div className="donut-wrap">
                <div className="donut mid" style={{'--pct': corePct}}><span>{corePct}%</span></div>
                <div className="label-wrap">
                  <strong>{coreCount}</strong>
                  <span>Companies</span>
                </div>
              </div>
              <div className="donut-info">
                <strong>Core Companies</strong>
                <p>Selective focus on high-potential core opportunities</p>
              </div>
            </div>
          </div>
          <div className="prc-v2-footer-note">
            <CheckCircle2 size={14}/> Focus on Better Closures. Leverage Sales Strength. Build Core Opportunities. Deliver Consistent Results.
          </div>
        </div>

        {/* HIGHLIGHTS */}
        <div className="prc-v2-highlights">
          <div className="prc-v2-section-header">KEY HIGHLIGHTS</div>
          <ul className="prc-v2-list">
            <li><CheckCircle2 size={16}/> <div><strong>{salesInsight}:</strong><br/>{salesCount} sales companies and {coreCount} core companies.</div></li>
            <li><Info size={16}/> <div><strong>{s.closed || 0} companies closed</strong><br/>out of {s.floated || 0} floated companies.</div></li>
            <li><Info size={16}/> <div><strong>{closureNilPct}% nil-selection closure</strong><br/>needs attention for better conversion.</div></li>
            <li><Users size={16}/> <div><strong>{totalSelections} total selections.</strong><br/>Focus remains on consistent quality placements.</div></li>
          </ul>
        </div>

        {/* ACTION PLAN */}
        <div className="prc-v2-action-plan">
          <div className="prc-v2-section-header dark">KEY TAKEAWAYS & ACTION PLAN</div>
          <ul className="prc-v2-list dark">
            <li><CheckCircle2 size={16}/> <div>Increase closure with selection % by stronger student readiness and engagement.</div></li>
            <li><CheckCircle2 size={16}/> <div>Reduce companies closed with nil selections through better pre-qualification.</div></li>
            <li><CheckCircle2 size={16}/> <div>Continue leveraging strength in Sales domain and expand high-converting opportunities.</div></li>
            <li><CheckCircle2 size={16}/> <div>Build and nurture long-term relationships in Core domain for quality placements.</div></li>
            <li><CheckCircle2 size={16}/> <div>Focus on consistent follow-ups to improve closure percentages.</div></li>
          </ul>
        </div>
      </div>
    </article>
  );
}

function DriveWisePage({ user, initialTab = "drives" }) {
  const [drives, setDrives] = useState([]);
  const [placementOfficers, setPlacementOfficers] = useState([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState(null);
  const [stuckOff, setStuckOff] = useState([]);
  const [requests, setRequests] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab || "drives"); // drives, reports, requests
  const [reportMode, setReportMode] = useState("company");
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState("ALL");
  const [reportFilters, setReportFilters] = useState({ department: "ALL", batch: "ALL", program: "ALL", month: "ALL" });
  const [driveSearch, setDriveSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState({});
  const [selectedDriveIds, setSelectedDriveIds] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showReportInfo, setShowReportInfo] = useState(false);
  const [showAllCompanyCards, setShowAllCompanyCards] = useState(false);

  const isMaker = user.role === "LIST_MAKER";
  const allOfficerCards = useMemo(() => {
    if (isMaker) return [];
    const normalizeOfficerName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const knownOfficers = new Map();
    const accountsByName = new Map();

    placementOfficers.forEach((officer) => {
      const normalizedName = normalizeOfficerName(officer.name);
      const card = { ...officer, cardKey: `account:${officer.id}`, drives: [] };
      knownOfficers.set(card.cardKey, card);
      if (normalizedName) accountsByName.set(normalizedName, card);
    });

    drives.forEach((drive) => {
      const preparedNames = [...new Set(
        (drive.preparedByNames || []).map((name) => String(name || "").trim()).filter(Boolean)
      )];

      if (preparedNames.length) {
        preparedNames.forEach((preparedName) => {
          const normalizedName = normalizeOfficerName(preparedName);
          let card = accountsByName.get(normalizedName);
          if (!card) {
            const cardKey = `prepared:${normalizedName}`;
            card = knownOfficers.get(cardKey);
            if (!card) {
              card = { cardKey, id: cardKey, name: preparedName, email: "", profileImage: "", active: true, drives: [] };
              knownOfficers.set(cardKey, card);
            }
          }
          if (!card.drives.some((item) => item._id === drive._id)) card.drives.push(drive);
        });
        return;
      }

      // Older drives may not contain a Prepared by value, so retain their uploader as a fallback.
      const creator = drive.createdBy;
      if (!creator?._id) return;
      const cardKey = `account:${creator._id}`;
      let card = knownOfficers.get(cardKey);
      if (!card) {
        card = { id: creator._id, ...creator, cardKey, drives: [] };
        knownOfficers.set(cardKey, card);
      }
      card.drives.push(drive);
    });

    return [...knownOfficers.values()]
      .sort((a, b) => b.drives.length - a.drives.length || (a.name || "").localeCompare(b.name || ""));
  }, [drives, placementOfficers, isMaker]);
  const officerCards = allOfficerCards.filter((officer) => (
    [officer.name, officer.email].join(" ").toLowerCase().includes(driveSearch.trim().toLowerCase())
  ));
  const selectedOfficer = allOfficerCards.find((officer) => officer.cardKey === selectedOfficerId);
  const officerDrives = isMaker || !selectedOfficerId ? drives : (selectedOfficer?.drives || []);
  const filteredDrives = officerDrives.filter((drive) => {
    const text = [
      drive.companyName,
      drive.jobRole,
      drive.packageCtc,
      drive.driveType,
      ...(drive.preparedByNames || []),
      drive.createdBy?.name,
      drive.createdBy?.email
    ].join(" ").toLowerCase();
    return text.includes(driveSearch.trim().toLowerCase());
  });
  const filteredDriveIds = filteredDrives.map((drive) => drive._id);
  const allFilteredSelected = filteredDriveIds.length > 0 && filteredDriveIds.every((id) => selectedDriveIds.includes(id));

  async function loadReports(nextFilters = reportFilters) {
    const query = new URLSearchParams(
      Object.entries(nextFilters).filter(([, value]) => value && value !== "ALL")
    ).toString();
    const data = await api(`/drives/reports/drives-summary${query ? `?${query}` : ""}`);
    setReports(data);
    setSelectedCompanyFilter("ALL");
  }

  async function load() {
    setLoading(true);
    try {
      const drivesRequest = api("/drives");
      const officersRequest = user.role === "HOD" ? api("/users") : Promise.resolve([]);
      const [driveData, officerData] = await Promise.all([drivesRequest, officersRequest]);
      setDrives(driveData);
      setPlacementOfficers(officerData);
      setRequests(await api("/drives/access-requests/list"));
      if (user.role === "HOD") {
        const stuckOffReport = await api("/drives/reports/stuck-off");
        setStuckOff(Array.isArray(stuckOffReport) ? stuckOffReport : (stuckOffReport.items || []));
        await loadReports();
      }
    } catch (err) {
      console.error("Error loading drives page data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab || "drives");
  }, [initialTab]);

  useEffect(() => {
    if (user.role === "HOD" && activeTab === "reports") loadReports();
  }, [reportFilters.department, reportFilters.batch, reportFilters.program, reportFilters.month, activeTab]);

  async function handleDecision(requestId, decision) {
    const remarks = decisionNotes[requestId] || "";
    try {
      await api(`/drives/access-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, remarks })
      });
      setDecisionNotes({ ...decisionNotes, [requestId]: "" });
      setToast({ type: "success", message: `Request ${decision.toLowerCase()} successfully.` });
      load();
    } catch (err) {
      setToast({ type: "error", message: `Unable to submit decision: ${err.message}` });
    }
  }

  async function handleDeleteDrive(drive) {
    setConfirmAction({
      title: "Delete Drive",
      message: `Delete ${drive.companyName}? This removes the drive and its attendance rows from the website.`,
      confirmLabel: "Delete Drive",
      onConfirm: async () => {
        await api(`/drives/${drive._id}`, { method: "DELETE" });
        setDrives((current) => current.filter((item) => item._id !== drive._id));
        setSelectedDriveIds((current) => current.filter((id) => id !== drive._id));
        await loadReports();
        setToast({ type: "success", message: `${drive.companyName} deleted.` });
      }
    });
  }

  async function handleDeleteSelectedDrives() {
    if (!selectedDriveIds.length) return;
    setConfirmAction({
      title: "Delete Selected Drives",
      message: `Delete ${selectedDriveIds.length} selected drive(s)? This removes their attendance rows from the website.`,
      confirmLabel: "Delete Selected",
      onConfirm: async () => {
        await api("/drives", {
          method: "DELETE",
          body: JSON.stringify({ driveIds: selectedDriveIds })
        });
        setSelectedDriveIds([]);
        await load();
        setToast({ type: "success", message: "Selected drives deleted." });
      }
    });
  }

  function toggleAllFilteredDrives() {
    if (allFilteredSelected) {
      setSelectedDriveIds((current) => current.filter((id) => !filteredDriveIds.includes(id)));
    } else {
      setSelectedDriveIds((current) => Array.from(new Set([...current, ...filteredDriveIds])));
    }
  }

  async function downloadFilteredReport() {
    if (!displayReports.length) {
      setToast({ type: "error", message: "No report rows available for this filter." });
      return;
    }
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));
    const rowsHtml = displayReports.map((rep) => `
      <tr>
        <td>${escapeHtml(getReportLabel(rep))}</td>
        <td>${escapeHtml(rep.totalEligible)}</td>
        <td>${escapeHtml(rep.totalRegistered)}</td>
        <td>${escapeHtml(rep.totalSelected)}</td>
        <td>${escapeHtml(rep.absent)}</td>
        <td>${escapeHtml(rep.present)}</td>
        <td>${escapeHtml(rep.grandTotal)}</td>
        <td>${escapeHtml(rep.presentPercent)}%</td>
        <td>${escapeHtml(rep.absentPercent)}%</td>
      </tr>
    `).join("");
    const totalHtml = selectedCompanyFilter === "ALL" ? `
      <tr class="total">
        <td>Grand Total</td>
        <td>${reportsTotal.totalEligible}</td>
        <td>${reportsTotal.totalRegistered}</td>
        <td>${reportsTotal.totalSelected}</td>
        <td>${reportsTotal.absent}</td>
        <td>${reportsTotal.present}</td>
        <td>${reportsTotal.grandTotal}</td>
        <td>${reportsTotal.presentPercent}%</td>
        <td>${reportsTotal.absentPercent}%</td>
      </tr>
    ` : "";
    const reportHtml = `
      <!doctype html>
      <html>
        <head>
          <title>DCPD Drive Report</title>
          <style>
            @page { size: A4 landscape; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; color: #102231; font-family: Arial, Helvetica, sans-serif; }
            .page { width: 100%; padding: 0; }
            .header { display: grid; grid-template-columns: 82px 1fr; gap: 18px; align-items: center; border-bottom: 3px solid #00777d; padding-bottom: 14px; margin-bottom: 14px; }
            .logo { width: 72px; height: 72px; display: grid; place-items: center; border: 1px solid #d9e5eb; border-radius: 14px; overflow: hidden; background: #ffffff; }
            .logo img { width: 100%; height: 100%; object-fit: contain; padding: 5px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { margin: 4px 0 0; color: #52657b; font-size: 14px; font-weight: 700; }
            .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
            .meta div { border: 1px solid #d9e5eb; border-radius: 8px; padding: 8px 10px; font-size: 11px; }
            .meta b { display: block; color: #00777d; font-size: 10px; text-transform: uppercase; margin-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.5px; }
            th { background: #00777d; color: #fff; padding: 8px 7px; text-align: center; text-transform: uppercase; }
            th:first-child, td:first-child { text-align: left; width: 25%; }
            td { border: 1px solid #dbe5eb; padding: 7px; text-align: center; vertical-align: middle; }
            tr:nth-child(even) td { background: #f8fbfc; }
            tr.total td { background: #e8f7f3; font-weight: 900; }
            .footer { margin-top: 12px; color: #64748b; font-size: 10px; display: flex; justify-content: space-between; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="header">
              <div class="logo"><img src="${window.location.origin}/logo.png" alt="Eligibility Flow logo" /></div>
              <div>
                <h1>${escapeHtml(activeReportConfig.title)}</h1>
                <h2>Eligibility Flow | DCPD Drive Report</h2>
              </div>
            </section>
            <section class="meta">
              <div><b>Department</b>${escapeHtml(reportFilters.department === "ALL" ? "All Departments" : reportFilters.department)}</div>
              <div><b>Batch</b>${escapeHtml(reportFilters.batch === "ALL" ? "All Batches" : reportFilters.batch)}</div>
              <div><b>Stream</b>${escapeHtml(reportFilters.program === "ALL" ? "All Streams" : reportFilters.program)}</div>
              <div><b>Month</b>${escapeHtml(reportFilters.month === "ALL" ? "All History" : reportFilters.month)}</div>
            </section>
            <section class="meta" style="grid-template-columns: 1fr;">
              <div><b>Report Type</b>${escapeHtml(activeReportConfig.title)}</div>
            </section>
            <table>
              <thead>
                <tr>
                  <th>${escapeHtml(activeReportConfig.label)}</th>
                  <th>Total Eligible</th>
                  <th>Total Registered</th>
                  <th>Total Selected</th>
                  <th>Absent</th>
                  <th>Present</th>
                  <th>Grand Total</th>
                  <th>Present %</th>
                  <th>Absent %</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}${totalHtml}</tbody>
            </table>
            <section class="footer">
              <span>Prepared by ${escapeHtml(user.name || "HOD")}</span>
              <span>Generated on ${new Date().toLocaleString()}</span>
            </section>
          </main>
        </body>
      </html>
    `;
    const oldFrame = document.getElementById("dcpd-report-print-frame");
    oldFrame?.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "dcpd-report-print-frame";
    iframe.title = "DCPD report print frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      iframe.remove();
      setToast({ type: "error", message: "Unable to prepare the PDF report." });
      return;
    }

    frameDocument.open();
    frameDocument.write(reportHtml);
    frameDocument.close();
    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      setTimeout(() => iframe.remove(), 2000);
    }, 350);
    setToast({ type: "success", message: "Print dialog opened. Select Save as PDF." });
  }

  // Filter reports by selected company
  const reportsList = useMemo(() => {
    if (Array.isArray(reports)) return reports;
    if (reports && Array.isArray(reports.summaries)) return reports.summaries;
    return [];
  }, [reports]);

  const reportOptions = reports && !Array.isArray(reports) ? reports : {};

  const reportModeConfig = {
    company: { title: "Company Wise Report", label: "Company Name", key: "companyName", rows: reportsList },
    department: { title: "Department Wise Report", label: "Department", key: "department", rows: reportOptions.byDepartment || [] },
    batch: { title: "Batch Wise Report", label: "Batch", key: "batch", rows: reportOptions.byBatch || [] },
    stream: { title: "Stream Wise Report", label: "Stream", key: "program", rows: reportOptions.byProgram || [] }
  };
  const activeReportConfig = reportModeConfig[reportMode] || reportModeConfig.company;
  const getReportLabel = (row, config = activeReportConfig) => (
    row?.reportLabel ||
    row?.[config.key] ||
    row?.companyName ||
    row?.name ||
    row?._id ||
    "Unmapped"
  );
  const activeReportRows = useMemo(() => {
    const rows = Array.isArray(activeReportConfig.rows) ? activeReportConfig.rows : [];
    return rows.map((row) => ({
      ...row,
      reportLabel: row[activeReportConfig.key] || row.companyName || row.name || row._id || "Unmapped",
      reportId: row.driveId || row[activeReportConfig.key] || row.companyName || "Unmapped"
    }));
  }, [activeReportConfig.rows, activeReportConfig.key]);

  const displayReports = useMemo(() => {
    if (reportMode !== "company") return activeReportRows;
    const sourceRows = selectedCompanyFilter === "ALL" ? reportsList : reportsList.filter(r => r.companyName === selectedCompanyFilter);
    return sourceRows.map((row) => ({
      ...row,
      reportLabel: row.companyName || row.name || row._id || "Unmapped",
      reportId: row.driveId || row.companyName || row.name || row._id || "Unmapped"
    }));
  }, [activeReportRows, reportMode, reportsList, selectedCompanyFilter]);
  const visibleReportCards = reportMode === "company" && selectedCompanyFilter === "ALL" && !showAllCompanyCards
    ? displayReports.slice(0, 6)
    : displayReports;

  // Calculate HOD reports aggregates
  const reportsTotal = useMemo(() => {
    const sourceRows = reportMode === "company" && selectedCompanyFilter === "ALL" ? reportsList : displayReports;
    if (!sourceRows.length) return { present: 0, absent: 0, grandTotal: 0, totalEligible: 0, totalRegistered: 0, totalSelected: 0, presentPercent: 0, absentPercent: 0 };
    const totals = sourceRows.reduce((acc, rep) => {
      acc.present += rep.present || 0;
      acc.absent += rep.absent || 0;
      acc.grandTotal += rep.grandTotal || 0;
      acc.totalEligible += rep.totalEligible || 0;
      acc.totalRegistered += rep.totalRegistered || 0;
      acc.totalSelected += rep.totalSelected || 0;
      return acc;
    }, { present: 0, absent: 0, grandTotal: 0, totalEligible: 0, totalRegistered: 0, totalSelected: 0 });
    totals.presentPercent = totals.grandTotal > 0 ? Math.round((totals.present / totals.grandTotal) * 100) : 0;
    totals.absentPercent = totals.grandTotal > 0 ? Math.round((totals.absent / totals.grandTotal) * 100) : 0;
    return totals;
  }, [displayReports, reportMode, reportsList, selectedCompanyFilter]);

  const activeBreakdownSection = useMemo(() => {
    if (reportMode === "department") return { title: "Department Wise Report", rows: reportOptions.byDepartment || [], keyName: "department" };
    if (reportMode === "batch") return { title: "Batch Wise Report", rows: reportOptions.byBatch || [], keyName: "batch" };
    if (reportMode === "stream") return { title: "Stream Wise Report", rows: reportOptions.byProgram || [], keyName: "program" };
    return null;
  }, [reportMode, reportOptions.byDepartment, reportOptions.byBatch, reportOptions.byProgram]);

  return (
    <>
      <PageHeader 
        eyebrow="Drive Workflow" 
        title={isMaker ? "Upload Placement Sheet" : selectedOfficer ? `${selectedOfficer.name}'s Placement Data` : "Planner & Placement Reports"}
        subtitle={isMaker
          ? "Upload one attendance sheet; drives are created automatically from the Company column"
          : selectedOfficer
            ? `Review and manage all drives uploaded by ${selectedOfficer.name}.`
            : "Select a placement officer to review their uploaded drives and activity"}
      />

      {!isMaker && !selectedOfficerId && (
        <section className="hod-tabs" style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
          <button className={activeTab === "drives" ? "tab-btn active" : "tab-btn soft"} onClick={() => setActiveTab("drives")}>Drives List</button>
          <button className={activeTab === "reports" ? "tab-btn active" : "tab-btn soft"} onClick={() => setActiveTab("reports")}>Attendance & Selection Reports</button>
          <button className={activeTab === "requests" ? "tab-btn active" : "tab-btn soft"} onClick={() => setActiveTab("requests")}>
            Access Requests {requests.filter(r => r.status === "PENDING").length > 0 && <span className="badge-count" style={{ background: "var(--red)", color: "white", padding: "2px 6px", borderRadius: "50%", marginLeft: "6px", fontSize: "11px" }}>{requests.filter(r => r.status === "PENDING").length}</span>}
          </button>
        </section>
      )}

      {isMaker && (
        <>
          <section className="panel guide-panel">
            <div>
              <h3><Sparkles size={18} /> How My Drives Works</h3>
              <p className="subtle">Upload the drive attendance sheet, review the detected rows, then create drives. The system reads student identifiers and process attendance, while the company can be corrected before saving when the sheet is messy.</p>
            </div>
            <div className="guide-steps">
              <div><strong>1. Upload</strong><span>Select the CSV or Excel file received from placement.</span></div>
              <div><strong>2. Preview</strong><span>Check mapped columns and rows before creating drives.</span></div>
              <div><strong>3. Save</strong><span>Created drives update dashboards, reports, and attendance logic.</span></div>
            </div>
          </section>
          <section className="panel upload-sheet-panel">
            <div>
              <h3><FileSpreadsheet size={18} /> Upload Attendance Sheet</h3>
              <p className="subtle">The system reads student identifiers and round attendance from the sheet, including noisy placement formats.</p>
            </div>
            <AttendancePreviewEditor submitPath="/drives/attendance-rows" submitLabel="Upload & Create Drives" onComplete={load} />
          </section>
          <section className="panel upload-format-guide">
            <div className="format-guide-heading">
              <div>
                <span className="eyebrow">Recommended sheet format</span>
                <h3><Info size={18} /> CSV / Excel Upload Guide</h3>
                <p className="subtle">Keep one student on each row. The first row must contain column headings; process columns can be added after Registered.</p>
              </div>
              <button
                className="soft"
                type="button"
                onClick={() => {
                  const csv = [
                    ["Roll No", "Student_Name", "Branches", "Company name", "Eligible", "Registered", "First process", "Second process"],
                    ["22123456", "Aman Singh", "CSE", "Example Company", "Yes", "Yes", "Present", "Qualified"]
                  ].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\r\n");
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                  link.download = "drive-upload-template.csv";
                  link.click();
                  URL.revokeObjectURL(link.href);
                }}
              >
                <FileDown size={17} /> Download Template
              </button>
            </div>
            <div className="format-example-wrap">
              <table className="format-example-table">
                <thead><tr>
                  <th>Roll No</th><th>Student_Name</th><th>Branches</th><th>Company name</th>
                  <th>Eligible</th><th>Registered</th><th>First process</th><th>Second process</th>
                </tr></thead>
                <tbody><tr>
                  <td>22123456</td><td>Aman Singh</td><td>CSE</td><td>Example Company</td>
                  <td>Yes</td><td>Yes</td><td>Present</td><td>Qualified</td>
                </tr></tbody>
              </table>
            </div>
            <div className="format-rules">
              <div><strong>Required for matching</strong><span>Use Roll No for every student. Email may be used as a second reliable identifier.</span></div>
              <div><strong>Company and status</strong><span>Company name, Eligible, and Registered should be filled for every row. Use Yes/No.</span></div>
              <div><strong>Company process fields</strong><span>Add any round after Registeredâ€”such as Aptitude Test, GD, Technical, or HR. Use Present/Absent or Qualified/Not Qualified.</span></div>
              <div><strong>Avoid spreadsheet issues</strong><span>Do not merge cells, add title rows, or leave blank student rows. Save Roll No as Text to preserve leading zeroes.</span></div>
            </div>
          </section>
        </>
      )}

      {/* RENDER DRIVES TAB */}
      {(isMaker || activeTab === "drives") && (
        <>
          {!isMaker && !selectedOfficerId ? (
            <>
              <section className="drive-toolbar">
                <label className="searchbox drive-search" aria-label="Search placement officers">
                  <Search size={18} />
                  <input value={driveSearch} onChange={(event) => setDriveSearch(event.target.value)} placeholder="Search placement officer by name or email" />
                </label>
                <button className="soft" onClick={load} disabled={loading}><RefreshCcw size={17} /> Refresh Officers</button>
              </section>
              <div className="officer-directory-head">
                <div>
                  <span className="officer-directory-icon"><UsersRound size={20} /></span>
                  <div>
                    <h3>Placement Officer Directory</h3>
                    <p>Select an officer to view and manage their drives.</p>
                  </div>
                </div>
                <div className="officer-directory-summary" aria-label={`${allOfficerCards.length} officers and ${drives.length} drives`}>
                  <span><strong>{allOfficerCards.length}</strong> Officers</span>
                  <span><strong>{drives.length}</strong> Total Drives</span>
                </div>
              </div>
              <section className="officer-grid">
                {officerCards.map((officer) => (
                  <button
                    className="officer-card"
                    type="button"
                    key={officer.cardKey}
                    onClick={() => {
                      setSelectedOfficerId(officer.cardKey);
                      setDriveSearch("");
                      setSelectedDriveIds([]);
                    }}
                  >
                    <div className="officer-avatar">
                      {officer.profileImage
                        ? <img src={assetUrl(officer.profileImage)} alt={`${officer.name} profile`} />
                        : <span>{(officer.name || "P").slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div className="officer-card-copy">
                      <div className="officer-role-row">
                        <span className="officer-label">{officer.designation || "Placement Officer"}</span>
                        {officer.active === false && <span className="officer-inactive">Inactive</span>}
                      </div>
                      <h3>{officer.name || "Unnamed Officer"}</h3>
                      <p>{officer.email || "Email not available"}</p>
                      <div className="officer-drive-count">
                        <BriefcaseBusiness size={18} />
                        <strong>{officer.drives.length}</strong>
                        <span>{officer.drives.length === 1 ? "drive uploaded" : "drives uploaded"}</span>
                      </div>
                    </div>
                    <ChevronRight className="officer-card-arrow" size={22} />
                  </button>
                ))}
                {!loading && !placementOfficers.length && !drives.length && <EmptyState message="No placement officers found" />}
                {!loading && (placementOfficers.length > 0 || drives.length > 0) && !officerCards.length && <EmptyState icon={Search} message="No matching placement officer found" />}
              </section>
            </>
          ) : (
            <>
              {!isMaker && (
                <button
                  className="soft officer-back-button"
                  type="button"
                  onClick={() => {
                    setSelectedOfficerId(null);
                    setDriveSearch("");
                    setSelectedDriveIds([]);
                  }}
                >
                  <ChevronLeft size={18} /> Back to Placement Officers
                </button>
              )}
              <section className="drive-toolbar">
                <label className="searchbox drive-search" aria-label="Search drives">
                  <Search size={18} />
                  <input value={driveSearch} onChange={(event) => setDriveSearch(event.target.value)} placeholder="Search drive by company, role, or package" />
                </label>
                {user.role === "HOD" && (
                  <>
                    <button className="soft" type="button" onClick={toggleAllFilteredDrives} disabled={!filteredDrives.length}>
                      <CheckCircle2 size={17} /> {allFilteredSelected ? "Clear Selection" : "Select All"}
                    </button>
                    <button className="soft danger-action" type="button" onClick={handleDeleteSelectedDrives} disabled={!selectedDriveIds.length}>
                      <Trash2 size={17} /> Delete Selected ({selectedDriveIds.length})
                    </button>
                  </>
                )}
                <button className="soft" onClick={load}><RefreshCcw size={17} /> Refresh Drives</button>
              </section>
              <section className="drive-grid drive-list-grid">
                {filteredDrives.map((drive) => (
                  <DriveCard
                    key={drive._id}
                    drive={drive}
                    user={user}
                    refresh={load}
                    requests={requests}
                    onDelete={user.role === "HOD" ? handleDeleteDrive : undefined}
                    selected={selectedDriveIds.includes(drive._id)}
                    onSelect={user.role === "HOD" ? (checked) => {
                      setSelectedDriveIds((current) => checked ? Array.from(new Set([...current, drive._id])) : current.filter((id) => id !== drive._id));
                    } : undefined}
                  />
                ))}
                {!officerDrives.length && <EmptyState message={isMaker ? "No drives created yet" : "This placement officer has not uploaded any drives yet"} />}
                {!!officerDrives.length && !filteredDrives.length && <EmptyState icon={Search} message="No matching drive found" />}
              </section>
              {user.role === "HOD" && <StuckOffReport items={stuckOff} />}
            </>
          )}
        </>
      )}

      {/* RENDER HOD REPORTS TAB */}
      {!isMaker && activeTab === "reports" && (
        <section className="panel reports-panel" style={{ padding: "20px", display: "grid", gap: "24px" }}>
          <div className="reports-heading-row">
            <div className="report-title-row">
              <div>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}><BarChart3 size={22} /> Attendance & Selection Representation of Company Processes</h3>
                <p className="subtle">Comprehensive statistics of present/absent ratios, total eligible students, registered students, and student selections by company drives.</p>
              </div>
              <button className="soft report-info-button" type="button" onClick={() => setShowReportInfo(true)} title="How report counts work">
                <Info size={17} /> Count Logic
              </button>
            </div>
            <div className="report-filter-row">
              <label>Report Type
              <select value={reportMode} onChange={(e) => { setReportMode(e.target.value); setSelectedCompanyFilter("ALL"); }} className="report-company-select">
                <option value="company">Company Wise Report</option>
                <option value="department">Department Wise Report</option>
                <option value="batch">Batch Wise Report</option>
                <option value="stream">Stream Wise Report</option>
              </select>
              </label>
              <label>Department
              <select value={reportFilters.department} onChange={(e) => setReportFilters({ ...reportFilters, department: e.target.value })} className="report-company-select">
                <option value="ALL">All Departments</option>
                {(reportOptions.departments || []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              </label>
              <label>Batch
              <select value={reportFilters.batch} onChange={(e) => setReportFilters({ ...reportFilters, batch: e.target.value })} className="report-company-select">
                <option value="ALL">All Batches</option>
                {(reportOptions.batches || []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              </label>
              <label>Stream
              <select value={reportFilters.program} onChange={(e) => setReportFilters({ ...reportFilters, program: e.target.value })} className="report-company-select">
                <option value="ALL">All Streams</option>
                {(reportOptions.programs || []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              </label>
              <label>Month
              <select value={reportFilters.month} onChange={(e) => setReportFilters({ ...reportFilters, month: e.target.value })} className="report-company-select">
                <option value="ALL">All History</option>
                {(reportOptions.months || []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              </label>
              <button className="soft" type="button" onClick={downloadFilteredReport}><FileDown size={17} /> Download A4 PDF</button>
            </div>
            {reportMode === "company" && <div className="report-company-row">
              <label>Company View</label>
              <select value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)} className="report-company-select">
                <option value="ALL">All Companies (Overall Summary)</option>
                {reportsList.map((r) => <option key={r.driveId} value={r.companyName}>{r.companyName}</option>)}
              </select>
            </div>}
          </div>

          <div className="report-mode-banner">
            <div>
              <strong>{activeReportConfig.title}</strong>
              <span>{displayReports.length} row(s) matched with the current filters.</span>
            </div>
          </div>

          {/* Graphical Bar Chart Representation */}
          <div className="report-card-grid">
            {visibleReportCards.map((rep) => {
              const maxCount = Math.max(rep.totalEligible || 0, rep.totalRegistered || 0, rep.totalSelected || 0, rep.grandTotal || 0, 1);
              return (
                <div key={rep.reportId} className="report-visual-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, color: "var(--ink)", fontSize: "16px" }}>{getReportLabel(rep)}</h4>
                    <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "600" }}>{reportMode === "company" ? (rep.jobRole || "Auto-created from sheet") : activeReportConfig.label}</span>
                  </div>
                  
                  {/* Visual Multi-Bar Chart */}
                  <div className="visual-chart-group">
                    <div className="bar-representation">
                      <span>Eligible</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(rep.totalEligible / maxCount) * 100}%`, background: "#0284c7" }} />
                      </div>
                      <span className="bar-label">{rep.totalEligible}</span>
                    </div>

                    <div className="bar-representation">
                      <span>Registered</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(rep.totalRegistered / maxCount) * 100}%`, background: "#f59e0b" }} />
                      </div>
                      <span className="bar-label">{rep.totalRegistered}</span>
                    </div>

                    <div className="bar-representation">
                      <span>Selected</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(rep.totalSelected / maxCount) * 100}%`, background: "#10b981" }} />
                      </div>
                      <span className="bar-label">{rep.totalSelected}</span>
                    </div>
                  </div>

                  {/* Attendance Ratio Bar */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "12px", display: "grid", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "#64748b" }}>Attendance Ratio:</span>
                      <strong>
                        <span style={{ color: "#16a34a" }}>{rep.present} Present ({rep.presentPercent}%)</span> / <span style={{ color: "#dc2626" }}>{rep.absent} Absent ({rep.absentPercent}%)</span>
                      </strong>
                    </div>
                    <div style={{ height: "10px", background: "#fee2e2", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${rep.presentPercent}%`, background: "#16a34a", height: "100%", transition: "width 0.5s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!displayReports.length && <EmptyState message={`No ${activeReportConfig.title.toLowerCase()} data available for this filter`} />}
          </div>
          {reportMode === "company" && selectedCompanyFilter === "ALL" && displayReports.length > 6 && (
            <div className="report-view-more">
              <button className="soft" type="button" onClick={() => setShowAllCompanyCards((current) => !current)}>
                {showAllCompanyCards ? "Show only 6 drives" : `View all drives (${displayReports.length})`}
              </button>
              <span>
                {showAllCompanyCards
                  ? `Showing all ${displayReports.length} company drives`
                  : `Showing 6 of ${displayReports.length} company drives`}
              </span>
            </div>
          )}

          {activeBreakdownSection && (
            <ReportBreakdownTables sections={[activeBreakdownSection]} />
          )}

          {/* Table Representation matching Image 5 format */}
          <div className="report-table-wrap" style={{ overflowX: "auto" }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>{activeReportConfig.label}</th>
                  <th>Total Eligible</th>
                  <th>Total Registered</th>
                  <th>Total Selected</th>
                  <th>Absent</th>
                  <th>Present</th>
                  <th>Grand Total</th>
                  <th>Present %</th>
                  <th>Absent %</th>
                </tr>
              </thead>
              <tbody>
                {displayReports.map((rep) => (
                  <tr key={rep.reportId}>
                    <td style={{ fontWeight: "bold" }}>{getReportLabel(rep)}</td>
                    <td>{rep.totalEligible}</td>
                    <td>{rep.totalRegistered}</td>
                    <td>{rep.totalSelected}</td>
                    <td style={{ color: "#dc2626", fontWeight: "600" }}>{rep.absent}</td>
                    <td style={{ color: "#16a34a", fontWeight: "600" }}>{rep.present}</td>
                    <td style={{ fontWeight: "bold" }}>{rep.grandTotal}</td>
                    <td><span className="percent-pill present">{rep.presentPercent}%</span></td>
                    <td><span className="percent-pill absent">{rep.absentPercent}%</span></td>
                  </tr>
                ))}
                
                {/* Grand Total Green Row matching Image 5 */}
                {selectedCompanyFilter === "ALL" && (
                  <tr className="total-row">
                    <td>Grand Total</td>
                    <td>{reportsTotal.totalEligible}</td>
                    <td>{reportsTotal.totalRegistered}</td>
                    <td>{reportsTotal.totalSelected}</td>
                    <td>{reportsTotal.absent}</td>
                    <td>{reportsTotal.present}</td>
                    <td>{reportsTotal.grandTotal}</td>
                    <td><span className="percent-pill present" style={{ background: "#ffffff", color: "#137333" }}>{reportsTotal.presentPercent}%</span></td>
                    <td><span className="percent-pill absent" style={{ background: "#ffffff", color: "#c5221f" }}>{reportsTotal.absentPercent}%</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* RENDER HOD REQUESTS TAB */}
      {!isMaker && activeTab === "requests" && (
        <section className="panel requests-panel" style={{ padding: "20px", display: "grid", gap: "20px" }}>
          <div>
            <h3 style={{ margin: 0 }}>Placement Officer Access Requests</h3>
            <p className="subtle">Review and manage sheet edit approvals and re-upload permissions submitted by Placement Officers.</p>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            {requests.filter(r => r.status === "PENDING").map((req) => (
              <div key={req._id} className="request-card" style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", display: "grid", gap: "12px", textAlign: "left", background: "white" }}>
                <div className="request-card-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge" style={{ background: req.type === "EDIT_SHEET" ? "rgba(232, 93, 38, 0.1)" : "rgba(13, 134, 165, 0.1)", color: req.type === "EDIT_SHEET" ? "var(--orange)" : "var(--blue)", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>
                    {req.type === "EDIT_SHEET" ? "SHEET EDIT APPROVAL" : "RE-UPLOAD ACCESS"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>{new Date(req.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <strong>Drive:</strong> {req.drive?.companyName} ({req.drive?.jobRole})<br />
                  <strong>Submitted By:</strong> {req.requester?.name} ({req.requester?.email})<br />
                  <strong>Reason:</strong> "{req.requestReason}"
                </div>

                {/* Show proposed edits diff table if type is EDIT_SHEET */}
                {req.type === "EDIT_SHEET" && req.proposedChanges && req.proposedChanges.length > 0 && (
                  <div className="request-changes" style={{ background: "var(--light-bg)", borderRadius: "6px", padding: "12px", border: "1px solid var(--line)" }}>
                    <h5 style={{ margin: "0 0 8px 0" }}>Proposed Cell Modifications:</h5>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--line)", background: "rgba(0,0,0,0.03)" }}>
                          <th style={{ padding: "6px", textAlign: "left" }}>Roll No</th>
                          <th style={{ padding: "6px", textAlign: "left" }}>Student Name</th>
                          <th style={{ padding: "6px", textAlign: "left" }}>Field</th>
                          <th style={{ padding: "6px", textAlign: "center" }}>Original</th>
                          <th style={{ padding: "6px", textAlign: "center" }}>New</th>
                        </tr>
                      </thead>
                      <tbody>
                        {req.proposedChanges.map((change, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "6px", textAlign: "left" }}>{change.rollNo}</td>
                            <td style={{ padding: "6px", textAlign: "left" }}>{change.studentName}</td>
                            <td style={{ padding: "6px", textAlign: "left", fontWeight: "bold" }}>{change.field}</td>
                            <td style={{ padding: "6px", textAlign: "center", color: "var(--red)", background: "rgba(235, 87, 87, 0.05)" }}>{change.oldValue}</td>
                            <td style={{ padding: "6px", textAlign: "center", color: "var(--green)", background: "rgba(39, 174, 96, 0.05)", fontWeight: "bold" }}>{change.newValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                  <textarea 
                    placeholder="Enter Head remarks/feedback (optional)..."
                    value={decisionNotes[req._id] || ""} 
                    onChange={(e) => setDecisionNotes({ ...decisionNotes, [req._id]: e.target.value })}
                    rows={2}
                    style={{ width: "100%", fontSize: "13px", padding: "8px" }}
                  />
                  <div className="request-decision-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button className="soft" onClick={() => handleDecision(req._id, "REJECTED")} style={{ color: "var(--red)" }}>Reject Request</button>
                    <button onClick={() => handleDecision(req._id, "APPROVED")}>Approve Request</button>
                  </div>
                </div>
              </div>
            ))}
            {requests.filter(r => r.status === "PENDING").length === 0 && <EmptyState message="No pending access requests" />}
          </div>

          {/* REQUEST HISTORY TABLE */}
          <div style={{ marginTop: "30px" }}>
            <h4>Approval & Edit History</h4>
            <p className="subtle">Detailed log of past approvals, sheet edits, and re-uploads with timestamps and outcomes.</p>
            <div className="report-table-wrap" style={{ overflowX: "auto", marginTop: "12px" }}>
              <table className="preview-table" style={{ width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--line)" }}>
                    <th style={{ padding: "8px", textAlign: "left" }}>Time</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Requester</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Drive</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Type</th>
                    <th style={{ padding: "8px", textAlign: "center" }}>Status</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Reason</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Head Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.filter(r => r.status !== "PENDING").map((req) => {
                    const changes = req.proposedChanges || [];
                    return (
                      <tr key={req._id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px", textAlign: "left" }}>{new Date(req.approvedAt || req.updatedAt).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "left" }}>{req.requester?.name || "-"}</td>
                        <td style={{ padding: "8px", textAlign: "left" }}>{req.drive?.companyName || "-"}</td>
                        <td style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>{req.type === "EDIT_SHEET" ? "Edit Sheet" : "Re-upload"}</td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <span className="badge" style={{ 
                            background: req.status === "REJECTED" ? "rgba(235, 87, 87, 0.1)" : "rgba(39, 174, 96, 0.1)", 
                            color: req.status === "REJECTED" ? "var(--red)" : "var(--green)", 
                            padding: "2px 6px", borderRadius: "4px" 
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px", textAlign: "left" }}>
                          <strong>{req.requestReason}</strong>
                          {changes.length > 0 && (
                            <div className="history-change-list">
                              {changes.slice(0, 4).map((change, index) => (
                                <span key={`${change.rowIndex}-${change.field}-${index}`}>
                                  {change.rollNo || "Row"} - {change.field}: "{String(change.oldValue ?? "-")}" to "{String(change.newValue ?? "-")}"
                                </span>
                              ))}
                              {changes.length > 4 && <span>+{changes.length - 4} more update(s)</span>}
                            </div>
                          )}
                          {!changes.length && req.type === "REUPLOAD_SHEET" && <small className="history-change-note">Re-upload permission was requested for the drive attendance sheet.</small>}
                        </td>
                        <td style={{ padding: "8px", textAlign: "left", color: "var(--muted)" }}>{req.remarks || "-"}</td>
                      </tr>
                    );
                  })}
                  {requests.filter(r => r.status !== "PENDING").length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px" }}>No history found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      {toast && <ToastMessage toast={toast} onClose={() => setToast(null)} />}
      {confirmAction && (
        <ConfirmDialog
          {...confirmAction}
          onCancel={() => setConfirmAction(null)}
          onDone={() => setConfirmAction(null)}
          onError={(message) => setToast({ type: "error", message })}
        />
      )}
      {showReportInfo && <ReportLogicDialog onClose={() => setShowReportInfo(false)} />}
    </>
  );
}

function ToastMessage({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3200);
    return () => clearTimeout(timer);
  }, [onClose]);

  return createPortal(
    <div className={`app-toast ${toast.type === "error" ? "error" : "success"}`}>
      <span>{toast.message}</span>
      <button className="soft" type="button" onClick={onClose}><X size={15} /></button>
    </div>,
    document.body
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", icon: Icon = Trash2, onConfirm, onCancel, onDone, onError }) {
  const [busy, setBusy] = useState(false);

  async function runConfirm() {
    setBusy(true);
    try {
      await onConfirm?.();
      onDone?.();
    } catch (err) {
      onError?.(err.message || "Action failed");
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="app-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="app-dialog confirm-dialog">
        <div className="confirm-dialog-icon" aria-hidden="true"><Icon size={22} /></div>
        <div className="confirm-dialog-copy">
          <h3 id="confirm-dialog-title">{title}</h3>
          <p>{message}</p>
        </div>
        <div className="app-dialog-actions">
          <button className="soft" type="button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="danger-button" type="button" onClick={runConfirm} disabled={busy}>{busy ? "Please wait..." : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReportLogicDialog({ onClose }) {
  return createPortal(
    <div className="app-dialog-overlay">
      <div className="app-dialog report-logic-dialog">
        <div className="report-logic-header">
          <h3><Info size={18} /> Attendance & Count Logic</h3>
          <button className="soft icon-button" type="button" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="report-logic-body">
          <section>
            <h4>Attendance Logic</h4>
            <ul>
              <li><strong>Overall Present:</strong> a student is counted present when any uploaded process/round is marked Present or Qualified.</li>
              <li><strong>Overall Absent:</strong> a student is counted absent when they are not registered, or when all uploaded processes are absent/not qualified/disqualified/withdrawn.</li>
              <li><strong>Pending:</strong> registered students with no uploaded process attendance are not counted as present or absent.</li>
            </ul>
          </section>
          <section>
            <h4>Report Count Logic</h4>
            <ul>
              <li><strong>Total Eligible:</strong> drive-student rows where eligibility status is Eligible.</li>
              <li><strong>Total Registered:</strong> rows where registration status is Registered.</li>
              <li><strong>Total Selected:</strong> rows where final outcome is Selected or Placed.</li>
              <li><strong>Present:</strong> rows with Overall Present after attendance logic is applied.</li>
              <li><strong>Absent:</strong> rows with Overall Absent after attendance logic is applied.</li>
              <li><strong>Grand Total:</strong> Present + Absent.</li>
              <li><strong>Present %:</strong> Present divided by Grand Total.</li>
              <li><strong>Absent %:</strong> Absent divided by Grand Total.</li>
            </ul>
          </section>
          <p>Department, Batch, Stream, Month, and Company filters recalculate the same counts only for matching student and drive records.</p>
        </div>
        <div className="app-dialog-actions">
          <button type="button" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function BreakdownCard({ title, rows, labelKey }) {
  const topRows = (rows || []).slice(0, 8);
  const maxValue = Math.max(...topRows.map((row) => row.grandTotal || row.totalEligible || 0), 1);
  return (
    <div className="report-visual-card">
      <h4 style={{ margin: "0 0 12px 0" }}>{title}</h4>
      <div style={{ display: "grid", gap: "10px" }}>
        {topRows.map((row) => {
          const label = row[labelKey] || "Unmapped";
          const value = row.grandTotal || row.totalEligible || 0;
          const width = Math.max(4, Math.round((value / maxValue) * 100));
          return (
            <div key={label} className="bar-representation" style={{ gridTemplateColumns: "90px 1fr 48px" }}>
              <span title={label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${width}%`, background: "#0d86a5" }} />
              </div>
              <span className="bar-label">{value}</span>
            </div>
          );
        })}
        {!topRows.length && <p className="subtle" style={{ margin: 0 }}>No filtered data available</p>}
      </div>
    </div>
  );
}

function ReportBreakdownTables({ sections }) {
  return (
    <div className="report-breakdown-tables">
      {sections.map((section) => (
        <div key={section.title} className="report-breakdown-table">
          <h4>{section.title}</h4>
          <div className="report-table-wrap">
            <table className="report-table compact">
              <thead>
                <tr>
                  <th>{section.keyName === "program" ? "Stream" : labelFor(section.keyName)}</th>
                  <th>Total Eligible</th>
                  <th>Total Registered</th>
                  <th>Total Selected</th>
                  <th>Absent</th>
                  <th>Present</th>
                  <th>Present %</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row[section.keyName] || "Unmapped"}>
                    <td style={{ fontWeight: 700 }}>{row[section.keyName] || "Unmapped"}</td>
                    <td>{row.totalEligible}</td>
                    <td>{row.totalRegistered}</td>
                    <td>{row.totalSelected}</td>
                    <td style={{ color: "#dc2626", fontWeight: 600 }}>{row.absent}</td>
                    <td style={{ color: "#16a34a", fontWeight: 600 }}>{row.present}</td>
                    <td><span className="percent-pill present">{row.presentPercent}%</span></td>
                  </tr>
                ))}
                {!section.rows.length && (
                  <tr><td colSpan={7} style={{ textAlign: "center" }}>No data for this filter</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function DriveCard({ drive, user, refresh, requests = [], onDelete, selected = false, onSelect }) {
  const [showSheetList, setShowSheetList] = useState(false);
  const [cardMessage, setCardMessage] = useState("");

  const hasApprovedReupload = requests.some(r => r.drive?._id === drive._id && r.type === "REUPLOAD_SHEET" && r.status === "APPROVED");
  const hasPendingReupload = requests.some(r => r.drive?._id === drive._id && r.type === "REUPLOAD_SHEET" && r.status === "PENDING");

  async function requestReupload() {
    try {
      await api("/drives/access-requests", {
        method: "POST",
        body: JSON.stringify({ driveId: drive._id, type: "REUPLOAD_SHEET", reason: "Placement Officer requested permission to re-upload the attendance sheet." })
      });
      setCardMessage("Re-upload request sent to Head.");
      refresh();
    } catch (err) {
      setCardMessage(`Unable to request re-upload: ${err.message}`);
    }
  }

  return (
    <article className="drive-card">
      <div className="drive-card-header">
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {user.role === "HOD" && (
              <input
                className="drive-select-checkbox"
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelect?.(event.target.checked)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${drive.companyName}`}
              />
            )}
            <BriefcaseBusiness size={18} style={{ color: "var(--blue)" }} />
            {drive.companyName}
          </h3>
          <p>{drive.jobRole === "Auto-created from sheet" ? "Created from uploaded attendance sheet" : `${drive.jobRole || "Role not set"}${drive.packageCtc ? ` - ${drive.packageCtc}` : ""}`}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="status approved" style={{ background: "#dcfce7", color: "#15803d", fontWeight: "700" }}>Active</span>
          {user.role === "HOD" && (
            <button className="soft danger-action" type="button" onClick={() => onDelete?.(drive)} title="Delete drive">
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>
      <div className="drive-stats">
        <Mini label="Eligible" value={drive.stats?.eligibleStudents || 0} />
        <Mini label="Registered" value={drive.stats?.registeredStudents || 0} />
        <Mini label="Not Registered" value={drive.stats?.nonRegisteredStudents || 0} />
      </div>
      {cardMessage && <div className={cardMessage.toLowerCase().includes("unable") ? "notice error compact-notice" : "notice compact-notice"}>{cardMessage}</div>}
      {user.role === "LIST_MAKER" && (
        <>
          {hasApprovedReupload ? (
            <AttendancePreviewEditor
              compact
              title="Update Existing Drive Sheet (Approved)"
              submitPath={`/drives/${drive._id}/attendance-rows`}
              submitLabel="Upload Again"
              onComplete={refresh}
            />
          ) : hasPendingReupload ? (
            <button className="soft font-medium" disabled style={{ marginBottom: "10px", width: "100%", cursor: "not-allowed", opacity: 0.7 }}>
              Re-upload Pending Head Approval
            </button>
          ) : (
            <button className="soft warning-action font-medium" onClick={requestReupload} style={{ marginBottom: "10px", width: "100%", color: "var(--orange)" }}>
              Request Re-upload Access
            </button>
          )}
          <button className="soft" onClick={() => setShowSheetList(true)} style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
            <FileSpreadsheet size={17} /> View Uploaded Sheets
          </button>
        </>
      )}
      {user.role !== "LIST_MAKER" && (
        <button className="soft" onClick={() => setShowSheetList(true)} style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
          <FileSpreadsheet size={17} /> View Uploaded Sheets
        </button>
      )}
      
      {/* Sheet List Modal */}
      {showSheetList && (
        <DriveSheetList 
          driveId={drive._id} 
          user={user}
          onClose={() => setShowSheetList(false)} 
        />
      )}
    </article>
  );
}

// New Component for Viewing Drive Sheets
function DriveSheetList({ driveId, user, onClose }) {
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  async function loadSheets() {
    setLoading(true);
    setError("");
    try {
      const data = await api(`/drives/${driveId}/sheets`);
      setSheets(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSheets();
  }, [driveId]);

  async function deleteSheet(sheet, event) {
    event.stopPropagation();
    setConfirmAction({
      title: "Delete Uploaded Sheet",
      message: `Delete "${sheet.fileName}"? Drive attendance will be recalculated from remaining sheets.`,
      confirmLabel: "Delete Sheet",
      onConfirm: async () => {
        await api(`/drives/sheets/${sheet._id}`, { method: "DELETE" });
        if (selectedSheet?._id === sheet._id) setSelectedSheet(null);
        await loadSheets();
        setNotice({ type: "success", message: "Uploaded sheet deleted and attendance recalculated." });
      }
    });
  }

  const filteredRows = useMemo(() => {
    if (!selectedSheet) return [];
    const compName = selectedSheet.drive?.companyName;
    if (!compName) return selectedSheet.rows || [];
    return (selectedSheet.rows || []).filter(row => {
      const keys = Object.keys(row || {});
      const companyKey = keys.find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        return norm.includes("companyname") || norm === "company";
      });
      if (!companyKey) return true;
      return String(row[companyKey] || "").trim().toLowerCase() === compName.trim().toLowerCase();
    });
  }, [selectedSheet]);

  return createPortal(
    <>
      <div className="sheet-list-overlay">
        <div className="sheet-list-modal">
          <div className="sheet-list-header">
            <h3>Uploaded Sheets</h3>
            <button className="soft" onClick={onClose}><X size={17} /> Close</button>
          </div>
          <div className="sheet-list-body">
            {error && <div className="notice error">{error}</div>}
            {loading && <div className="notice">Loading...</div>}
            {!loading && !sheets.length && <EmptyState message="No sheets uploaded yet" />}
            {!loading && sheets.map((sheet) => (
              <div key={sheet._id} className="sheet-list-item" onClick={() => setSelectedSheet(sheet)}>
                <div>
                  <h4>{sheet.fileName}</h4>
                  <p>Uploaded by {sheet.uploadedBy?.name || "Unknown"} on {new Date(sheet.createdAt).toLocaleString()}</p>
                  <p><strong>Prepared by:</strong> {(sheet.preparedByNames || []).length ? sheet.preparedByNames.join(", ") : "Placement Officer not found in sheet"}</p>
                  <p>{sheet.rowCount || sheet.rows?.length || 0} rows{sheet.isSnapshot ? " - current drive data" : ""}</p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Eye size={20} />
                  {user?.role === "HOD" && <button className="soft danger-action" type="button" onClick={(event) => deleteSheet(sheet, event)}><Trash2 size={15} /> Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* View Selected Sheet Modal */}
      {selectedSheet && (
        <SheetPreviewModal 
          title={`${selectedSheet.fileName}${selectedSheet.drive?.companyName ? ` - ${selectedSheet.drive.companyName}` : ""}`}
          headers={selectedSheet.headers || []}
          rows={filteredRows}
          editable={user?.role === "LIST_MAKER"}
          requireApproval={user?.role === "LIST_MAKER"}
          driveId={driveId}
          sheetId={selectedSheet._id}
          onClose={() => setSelectedSheet(null)}
          onComplete={loadSheets}
        />
      )}
      {notice && <ToastMessage toast={notice} onClose={() => setNotice(null)} />}
      {confirmAction && (
        <ConfirmDialog
          {...confirmAction}
          onCancel={() => setConfirmAction(null)}
          onDone={() => setConfirmAction(null)}
          onError={(message) => setNotice({ type: "error", message })}
        />
      )}
    </>
    , document.body
  );
}

function AttendancePreviewEditor({ submitPath, submitLabel, onComplete, compact = false, title = "CSV or Excel Sheet", requireCompanyName = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState({ headers: [], rows: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const hasPreview = preview.rows.length > 0;
  const inlinePreviewRows = preview.rows.slice(0, 200);

  async function previewFile(nextFile = file) {
    if (!nextFile) return;
    if (requireCompanyName && !companyName.trim()) {
      setMessage("Enter the company name before previewing the formatted sheet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", nextFile);
      if (companyName.trim()) body.append("companyName", companyName.trim());
      const result = await api("/drives/attendance-preview", { method: "POST", body });
      setPreview({
        headers: result.headers || [],
        rows: result.rows || [],
        totalRowCount: result.totalRowCount || result.rows?.length || 0,
        companyCount: result.companyCount || 0,
        companies: result.companies || [],
        normalization: result.normalization || null,
        notice: result.notice || "",
        truncated: Boolean(result.truncated)
      });
      const companyText = result.companyCount ? ` across ${result.companyCount} companies` : "";
      const truncationText = result.truncated ? " Preview is limited, but upload will process the full file." : "";
      const normalizedText = result.normalization?.mode === "FLAT_TABLE"
        ? ` Read ${result.normalization.cleanRows} data row(s) from one standard table.`
        : result.normalization?.normalized ? ` Cleaned ${result.normalization.blockCount} block(s) into an aligned sheet.` : "";
      setMessage(`Preview ready: ${result.totalRowCount || result.rows?.length || 0} rows${companyText}.${normalizedText}${truncationText}`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateCell(rowIndex, header, value) {
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row, index) => (index === rowIndex ? { ...row, [header]: value } : row))
    }));
  }

  async function submitRows() {
    if (!hasPreview && !file) return;
    if (requireCompanyName && !companyName.trim()) {
      setMessage("Enter the company name before creating drives from this sheet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let result;
      if (submitPath === "/drives/attendance-rows" && file && preview.truncated) {
        const body = new FormData();
        body.append("file", file);
        if (companyName.trim()) body.append("companyName", companyName.trim());
        result = await api("/drives/attendance-sheet", { method: "POST", body });
      } else {
        result = await api(submitPath, {
          method: "POST",
          body: JSON.stringify({ rows: preview.rows, companyName: companyName.trim() || undefined })
        });
      }
      const review = result.errors?.length
        ? ` ${result.errors.length} rows need review: ${result.errors.slice(0, 3).map((item) => `row ${item.row} ${item.message}`).join("; ")}`
        : "";
      const driveText = result.drives ? ` Created/updated ${result.drives.length} drives.` : "";
      setMessage(`${driveText} Matched ${result.matched || 0} students. Present ${result.present || 0}, absent ${result.absent || 0}.${review}`);
      setFile(null);
      setPreview({ headers: [], rows: [] });
      onComplete?.();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function clearPreview() {
    setFile(null);
    setPreview({ headers: [], rows: [] });
    if (requireCompanyName) setCompanyName("");
    setMessage("");
  }

  return (
    <div className={`attendance-preview-editor ${compact ? "compact" : ""}`}>
      {requireCompanyName && (
        <div className="formatter-company-box">
          <label>Company Name
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Enter company name manually, e.g. Iutron"
            />
          </label>
          <p className="subtle">This name will be used for all formatted rows. The formatter will not depend on company text inside the uploaded sheet.</p>
        </div>
      )}
      <div className="sheet-upload-row preview-upload-row">
        <label>{title}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] || null;
              setFile(nextFile);
              if (nextFile) previewFile(nextFile);
            }}
          />
        </label>
        <button className="soft" type="button" onClick={() => previewFile()} disabled={!file || busy || (requireCompanyName && !companyName.trim())}><Eye size={17} /> Preview</button>
        <button type="button" onClick={submitRows} disabled={!hasPreview || busy || (requireCompanyName && !companyName.trim())}><FileSpreadsheet size={17} /> {submitLabel}</button>
      </div>
      {hasPreview && (
        <div className="sheet-preview-card">
          {preview.normalization?.normalized && (
            <div className="normalization-summary">
              <strong>{preview.normalization.mode === "FLAT_TABLE" ? "Standard table detected" : "Auto-aligned messy sheet"}</strong>
              <span>{preview.normalization.mode === "FLAT_TABLE" ? "1 table detected" : `${preview.normalization.blockCount} block(s) detected`}</span>
              <span>{preview.normalization.cleanRows} data row(s)</span>
              {preview.normalization.mode === "FLAT_TABLE" && <span>{preview.normalization.originalRows} spreadsheet row(s), including headings</span>}
              {!!preview.normalization.preparedByNames?.length && <span>Prepared by {preview.normalization.preparedByNames.join(", ")}</span>}
            </div>
          )}
          {preview.notice && <div className="notice compact-notice">{preview.notice}</div>}
          <div className="preview-summary">
            <strong>
              {preview.totalRowCount || preview.rows.length} rows
              {preview.companyCount ? ` across ${preview.companyCount} companies` : ""}
              {preview.truncated ? ` (${preview.rows.length} shown)` : ""}
            </strong>
            {preview.normalization?.rescuedRows ? <span className="subtle">{preview.normalization.rescuedRows} row(s) recovered by noisy-sheet scan</span> : null}
            <div className="preview-actions">
              <button className="soft" type="button" onClick={() => setShowFullPreview(true)}>Full View</button>
              <button className="soft" type="button" onClick={clearPreview}>Clear</button>
            </div>
          </div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {inlinePreviewRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.headers.map((header) => (
                      <td key={header}>
                        <input value={row[header] ?? ""} onChange={(event) => updateCell(rowIndex, header, event.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > inlinePreviewRows.length && (
            <p className="subtle" style={{ margin: "10px 0 0 0" }}>Showing first {inlinePreviewRows.length} rows here. Open Full View for more.</p>
          )}
        </div>
      )}
      {message && <div className={message.toLowerCase().includes("invalid") || message.toLowerCase().includes("required") || message.toLowerCase().includes("unable") ? "notice error" : "notice"}>{message}</div>}
      
      {/* Full Preview Modal */}
      {showFullPreview && (
        <SheetPreviewModal 
          title="Sheet Preview"
          headers={preview.headers}
          rows={preview.rows}
          editable={true}
          onUpdateCell={updateCell}
          onClose={() => setShowFullPreview(false)}
        />
      )}
    </div>
  );
}

// New Sheet Preview Modal Component
function SheetPreviewModal({ title, headers, rows: initialRows, editable = false, requireApproval = false, driveId, sheetId, onClose, onUpdateCell, onComplete }) {
  const [rows, setRows] = useState(initialRows);
  const [reason, setReason] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(300);
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const [selectedHeaders, setSelectedHeaders] = useState(headers);

  useEffect(() => {
    setRows(initialRows);
    setVisibleLimit(300);
    setSelectedHeaders(headers);
  }, [initialRows, headers]);

  const hasChanges = useMemo(() => {
    if (!requireApproval) return false;
    for (let i = 0; i < rows.length; i++) {
      const orig = initialRows[i];
      const curr = rows[i];
      for (const key of headers) {
        if ((orig[key] ?? "") !== (curr[key] ?? "")) {
          return true;
        }
      }
    }
    return false;
  }, [rows, initialRows, headers, requireApproval]);

  function handleChange(rowIndex, header, value) {
    if (requireApproval) {
      setRows(prev => prev.map((row, idx) => idx === rowIndex ? { ...row, [header]: value } : row));
    } else {
      onUpdateCell?.(rowIndex, header, value);
    }
  }

  async function submitEditRequest() {
    if (!reason.trim()) {
      setMessage("Please enter a reason for the edit request");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const proposedChanges = [];
      for (let i = 0; i < rows.length; i++) {
        const orig = initialRows[i];
        const curr = rows[i];
        const rollNo = orig["Roll No"] || orig["ROLL NO"] || "";
        const studentName = orig["Student Name"] || orig["STUDENT_NAME"] || "";
        for (const key of headers) {
          if ((orig[key] ?? "") !== (curr[key] ?? "")) {
            proposedChanges.push({
              rowIndex: i,
              rollNo,
              studentName,
              field: key,
              oldValue: orig[key] ?? "",
              newValue: curr[key] ?? ""
            });
          }
        }
      }
      await api("/drives/access-requests", {
        method: "POST",
        body: JSON.stringify({
          driveId,
          type: "EDIT_SHEET",
          sheetId,
          reason: reason.trim(),
          proposedChanges,
          updatedRows: rows
        })
      });
      setMessage("Edit approval request submitted to Head successfully!");
      setReason("");
      setTimeout(() => {
        setShowRequestForm(false);
        onClose();
        onComplete?.();
      }, 2000);
    } catch (err) {
      setMessage("Failed: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSheet() {
    if (!sheetId) return;
    const params = new URLSearchParams({
      format: downloadFormat,
      columns: selectedHeaders.join(",")
    });
    let blob;
    try {
      blob = await downloadApiFile(`/drives/sheets/${sheetId}/download?${params}`);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9_-]+/gi, "_")}.${downloadFormat}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`Sheet downloaded as ${downloadFormat.toUpperCase()}`);
  }

  const currentRows = requireApproval ? rows : initialRows;
  const visibleRows = currentRows.slice(0, visibleLimit);
  const attendanceSummary = useMemo(() => {
    const normalizeKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const registrationHeader = headers.find((header) => ["registration", "registrationstatus", "registered", "register"].includes(normalizeKey(header)));
    const metaKeys = [
      "sr", "srno", "sno", "slno", "serial", "serialno", "index", "no",
      "gender", "sex", "branch", "branches", "department", "course", "program", "batch",
      "company", "companyname", "eligible", "eligibility", "elgible", "registered",
      "registration", "registrationstatus", "register", "remark", "remarks", "note", "notes",
      "campus", "campusname"
    ];
    const processHeaders = headers.filter((header) => {
      const key = normalizeKey(header);
      if (!key || /^column\d+$/.test(key) || metaKeys.includes(key)) return false;
      if (["roll", "enrollment", "registration", "regno", "email", "mail", "name", "student"].some((part) => key.includes(part))) return false;
      return true;
    });
    const processStatus = (value) => {
      const text = String(value || "").trim().toLowerCase();
      if (!text) return null;
      if (["present", "p", "yes", "y", "1", "qualified", "selected"].includes(text)) return "PRESENT";
      if (["absent", "a", "no", "n", "0", "not present", "notpresent", "defaulter", "default"].includes(text)) return "ABSENT";
      if (text.includes("not present") || text.includes("absent") || text.includes("not qualified") || text.includes("defaulter")) return "ABSENT";
      if (text.includes("present") || text.includes("qualified") || text.includes("selected")) return "PRESENT";
      return null;
    };
    const isRegistered = (value) => {
      const text = String(value || "").trim().toLowerCase();
      if (!text || text.includes("not registered") || text.includes("notregistered") || text.includes("unregistered") || ["no", "n", "0", "false"].includes(text)) return false;
      return ["registered", "yes", "y", "1", "true"].includes(text);
    };
    const result = { total: currentRows.length, registered: 0, notRegistered: 0, present: 0, absent: 0, pending: 0, processCount: processHeaders.length };
    currentRows.forEach((row) => {
      const registered = registrationHeader ? isRegistered(row[registrationHeader]) : false;
      if (!registered) {
        result.notRegistered += 1;
        result.absent += 1;
        return;
      }
      result.registered += 1;
      const statuses = processHeaders.map((header) => processStatus(row[header])).filter(Boolean);
      if (statuses.includes("PRESENT")) result.present += 1;
      else if (statuses.includes("ABSENT")) result.absent += 1;
      else result.pending += 1;
    });
    return result;
  }, [currentRows, headers]);

  return createPortal(
    <div className="sheet-preview-modal-overlay">
      <div className="sheet-preview-modal">
        <div className="sheet-preview-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {requireApproval && <p className="subtle" style={{ margin: "4px 0 0 0", fontSize: "12px" }}>Edit cells and click 'Request Head Approval' when finished.</p>}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {requireApproval && hasChanges && !showRequestForm && (
              <button onClick={() => setShowRequestForm(true)} style={{ background: "var(--orange)", color: "white" }}>Request Head Approval</button>
            )}
            <button className="soft" onClick={onClose}><X size={17} /> Close</button>
          </div>
        </div>

        {showRequestForm && (
          <div className="request-reason-banner" style={{ background: "var(--orange-bg)", padding: "14px", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--orange)", fontSize: "14px" }}>Head Approval Required for Edits</h4>
            <p style={{ margin: "0 0 10px 0", fontSize: "12px" }}>Please explain why these modifications are needed. Edits will be applied once approved.</p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input 
                type="text" 
                placeholder="Reason for changes (e.g. Corrected roll number attendance)..." 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                style={{ flex: 1, padding: "8px", fontSize: "13px" }}
              />
              <button onClick={submitEditRequest} disabled={busy || !reason.trim()}>{busy ? "Submitting..." : "Submit to Head"}</button>
              <button className="soft" onClick={() => setShowRequestForm(false)}>Cancel</button>
            </div>
            {message && <p style={{ margin: "6px 0 0 0", fontSize: "12px", fontWeight: "bold" }}>{message}</p>}
          </div>
        )}

        {message && !showRequestForm && (
          <div className="notice" style={{ margin: "10px" }}>{message}</div>
        )}

        <div className="sheet-preview-modal-body">
          <section className="sheet-attendance-summary">
            <div className="sheet-attendance-summary-heading">
              <div>
                <span className="eyebrow">Calculated from uploaded rows</span>
                <h4>Registration & Overall Attendance</h4>
              </div>
              <p>Not registered = absent. Registered + present/qualified in any process = overall present. Registered + all marked processes absent/not qualified = overall absent.</p>
            </div>
            <div className="sheet-attendance-metrics">
              <div><span>Total Students</span><strong>{attendanceSummary.total}</strong></div>
              <div className="registered"><span>Registered</span><strong>{attendanceSummary.registered}</strong></div>
              <div className="not-registered"><span>Not Registered</span><strong>{attendanceSummary.notRegistered}</strong></div>
              <div className="present"><span>Overall Present</span><strong>{attendanceSummary.present}</strong></div>
              <div className="absent"><span>Overall Absent</span><strong>{attendanceSummary.absent}</strong></div>
              <div className="pending"><span>Pending Process</span><strong>{attendanceSummary.pending}</strong></div>
            </div>
          </section>
          {sheetId && (
            <div className="sheet-download-panel">
              <div className="sheet-download-heading">
                <strong>Download Sheet</strong>
                <p className="subtle">Choose format and columns for the downloaded file.</p>
              </div>
              <label className="sheet-format-select">File Format
                <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value)}>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <div className="sheet-column-section">
                <div className="sheet-column-controls">
                  <span>Columns <strong>{selectedHeaders.length}/{headers.length}</strong></span>
                  <div>
                    <button className="soft" type="button" onClick={() => setSelectedHeaders(headers)}>Select All</button>
                    <button className="soft" type="button" onClick={() => setSelectedHeaders([])}>Clear</button>
                  </div>
                </div>
                <div className="sheet-column-picker">
                  {headers.map((header) => (
                    <label key={header}>
                      <input
                        type="checkbox"
                        checked={selectedHeaders.includes(header)}
                        onChange={(event) => {
                          setSelectedHeaders((current) => event.target.checked ? [...current, header] : current.filter((item) => item !== header));
                        }}
                      />
                      {header}
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" onClick={downloadSheet} disabled={!selectedHeaders.length}><FileDown size={17} /> Download</button>
            </div>
          )}
          <div className="notice" style={{ marginBottom: "12px" }}>
            Showing {visibleRows.length} of {currentRows.length} rows. Use Show More for larger sheets.
          </div>
          <div className="preview-table-wrap full-size">
            <table className="preview-table">
              <thead>
                <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {headers.map((header) => (
                      <td key={header}>
                        {editable ? (
                          <input 
                            value={row[header] ?? ""} 
                            onChange={(event) => handleChange(rowIndex, header, event.target.value)} 
                          />
                        ) : (
                          <span>{row[header] ?? ""}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {currentRows.length > visibleLimit && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: "12px" }}>
              <button className="soft" type="button" onClick={() => setVisibleLimit((value) => value + 300)}>Show More Rows</button>
            </div>
          )}
        </div>
      </div>
    </div>
    , document.body
  );
}

function StudentRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [remarks, setRemarks] = useState({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    try {
      setRequests(await api(`/student-portal/requests?status=${status}`));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => { load(); }, [status]);

  async function viewProof(request) {
    try {
      const blob = await downloadApiFile(`/student-portal/requests/${request._id}/proof`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function decide(requestId, decision) {
    setBusyId(requestId);
    setMessage("");
    try {
      const result = await api(`/student-portal/requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, remarks: remarks[requestId] || "" })
      });
      const syncText = decision === "APPROVED" ? ` Write-back: ${result.writeBackStatus}.` : "";
      setMessage(`Request ${decision.toLowerCase()} successfully.${syncText}`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Request Centre" title="Requests" subtitle="Review placement data, supporting proof, and pending update requests">
        <button className="soft" onClick={load}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      {message && <div className={message.includes("successfully") ? "notice" : "notice error"}>{message}</div>}
      <section className="student-request-toolbar">
        {["PENDING", "APPROVED", "REJECTED", "ALL"].map((item) => (
          <button key={item} className={status === item ? "" : "soft"} onClick={() => setStatus(item)}>{item.replace("_", " ")}</button>
        ))}
      </section>
      <section className="student-request-list">
        {!requests.length ? <EmptyState message={`No ${status === "ALL" ? "" : status.toLowerCase()} student correction requests`} /> : requests.map((request) => (
          <article key={request._id} className="student-request-card">
            <header>
              <div className="manager-name-cell">
                <div className="header-profile manager-avatar"><span>{request.studentName?.slice(0, 1).toUpperCase()}</span></div>
                <div><h3>{request.studentName}</h3><p>{request.rollNo} Â· {request.student?.department || request.student?.branch || "-"}</p></div>
              </div>
              <div><span className={`status ${request.status === "PENDING" ? "pending" : request.status === "APPROVED" ? "approved" : "rejected"}`}>{request.status}</span><small>{formatDateTime(request.createdAt)}</small></div>
            </header>
            <div className="student-request-message"><strong>Student explanation</strong><p>{request.message}</p></div>
            <div className="student-request-changes">
              {request.changes.map((change) => (
                <div key={change.field}>
                  <strong>{change.label}</strong>
                  <span><small>Current value</small>{change.currentValue === null || change.currentValue === undefined || change.currentValue === "" ? "-" : String(change.currentValue)}</span>
                  <span className="requested"><small>Requested value</small>{String(change.requestedValue)}</span>
                </div>
              ))}
            </div>
            <div className="student-request-proof">
              <button className="soft" onClick={() => viewProof(request)}><Eye size={17} /> View Supporting Proof</button>
              <span>{request.proofOriginalName}</span>
            </div>
            {request.status === "PENDING" ? (
              <div className="student-request-decision">
                <label>Head remarks
                  <textarea rows={2} value={remarks[request._id] || ""} onChange={(event) => setRemarks({ ...remarks, [request._id]: event.target.value })} placeholder="Add verification notes or rejection reason" />
                </label>
                <button className="soft danger-action" disabled={busyId === request._id} onClick={() => decide(request._id, "REJECTED")}>Reject</button>
                <button disabled={busyId === request._id} onClick={() => decide(request._id, "APPROVED")}><CheckCircle2 size={17} /> Approve & Update</button>
              </div>
            ) : (
              <div className="student-request-review">
                <span>Reviewed by {request.reviewedBy?.name || "Head"} on {formatDateTime(request.reviewedAt)}</span>
                <span>Sheet write-back: <strong>{request.writeBackStatus}</strong></span>
                {request.hodRemarks && <p>{request.hodRemarks}</p>}
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}

function ProfilePage({ user }) {
  const { updateProfile, uploadProfilePhoto } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", designation: user.designation || "", email: user.email || "", personalEmail: user.personalEmail || "", phone: user.phone || "", profileImage: user.profileImage || "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loginLogs, setLoginLogs] = useState([]);
  const [loginLogsError, setLoginLogsError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [cropPhoto, setCropPhoto] = useState(null);
  const canEditOfficialEmail = user.role === "HOD";

  useEffect(() => {
    if (!canEditOfficialEmail) return;
    api("/auth/me/login-logs")
      .then((data) => {
        setLoginLogs(data.logs || []);
        setLoginLogsError("");
      })
      .catch((error) => setLoginLogsError(error.message || "Unable to load login history."));
  }, [canEditOfficialEmail]);

  function formatLoginDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  async function saveProfile(event) {
    event.preventDefault();
    try {
      const updated = await updateProfile(form);
      setForm({ name: updated.name || "", designation: updated.designation || "", email: updated.email || "", personalEmail: updated.personalEmail || "", phone: updated.phone || "", profileImage: updated.profileImage || "" });
      setMessageType("success");
      setMessage("Profile updated successfully");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessageType("error");
      setMessage("New password and confirm password must match.");
      return;
    }
    try {
      await api("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessageType("success");
      setMessage("Password updated successfully.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    }
  }

  function changePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setCropPhoto({ file, url: URL.createObjectURL(file) });
    event.target.value = "";
  }

  function closeCropPhoto() {
    if (cropPhoto?.url) URL.revokeObjectURL(cropPhoto.url);
    setCropPhoto(null);
  }

  async function uploadCroppedPhoto(file) {
    const updated = await uploadProfilePhoto(file);
    setForm((current) => ({ ...current, profileImage: updated.profileImage || "" }));
    setMessageType("success");
    setMessage("Profile photo cropped and uploaded successfully");
    closeCropPhoto();
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" subtitle="Security and institutional profile details" />
      {message && <div className={`notice ${messageType === "error" ? "error" : "success"}`}>{message}</div>}
      <section className="panel profile-card">
        <div className="profile-photo-wrap">
          <div className="profile-photo-frame">
            <img className="profile-photo" src={assetUrl(form.profileImage) || "/logo.png"} alt="Profile" />
          </div>
          <div className="profile-summary">
            <div>
              <h3>{form.name || "User Profile"}</h3>
              <span>{form.designation || (user.role === "HOD" ? "Administration" : "Placement Officer")}</span>
            </div>
            <p>{form.email}</p>
          </div>
          <label className="upload-photo-button"><Crop size={16} /> Upload & Crop Photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changePhoto} /></label>
        </div>
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-form-heading">
            <h3>Profile Information</h3>
            <p>Keep your account details updated for dashboard and report access.</p>
          </div>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Professional Role / Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Placement Officer or Assistant Professor" maxLength={80} /></label>
          <label>Official Email<input type="email" value={form.email} onChange={(e) => canEditOfficialEmail && setForm({ ...form, email: e.target.value })} required readOnly={!canEditOfficialEmail} className={!canEditOfficialEmail ? "locked-profile-input" : ""} title={!canEditOfficialEmail ? "Only the Head can change official email addresses" : undefined} /><small>{canEditOfficialEmail ? "Head access can update the official login email." : "Only the Head can change official email addresses."}</small></label>
          <label>Personal Email<input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></label>
          <label>Phone Number<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add phone number" /></label>
          <button><Save size={17} /> Save Profile</button>
        </form>
      </section>
      <section className="panel profile-card password-profile-card">
        <div className="profile-photo-wrap password-guidance">
          <div className="profile-summary">
            <div>
              <h3><KeyRound size={22} /> Change Password</h3>
              <span>Use a strong password every time</span>
            </div>
            <p>Suggested format: at least 8 characters with uppercase, lowercase, number, and special character.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={savePassword}>
          <div className="profile-form-heading">
            <h3>Account Password</h3>
            <p>For safety, confirm your current password before setting a new one.</p>
          </div>
          <label>Current Password<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required autoComplete="current-password" /></label>
          <label>New Strong Password<input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          <label>Confirm New Password<input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          <button><ShieldCheck size={17} /> Update Password</button>
        </form>
      </section>
      {canEditOfficialEmail && (
        <section className="panel profile-login-logs">
          <div className="profile-form-heading">
            <h3>Head Login History</h3>
            <p>Recent sign-ins for this Head account. A new sign-in automatically replaces any older active session.</p>
          </div>
          {loginLogsError ? (
            <p className="error">{loginLogsError}</p>
          ) : loginLogs.length ? (
            <div className="login-log-list">
              {loginLogs.map((log, index) => (
                <article className="login-log-item" key={`${log.at}-${index}`}>
                  <div>
                    <strong>{formatLoginDate(log.at)}</strong>
                    <span>{log.ipAddress || "-"}</span>
                  </div>
                  <p>{log.userAgent || "-"}</p>
                  {log.current && <span className="current-session-badge">Current session</span>}
                </article>
              ))}
            </div>
          ) : (
            <p className="subtle">No login history has been recorded yet.</p>
          )}
        </section>
      )}
      {cropPhoto && (
        <ProfilePhotoCropper
          source={cropPhoto}
          onCancel={closeCropPhoto}
          onUpload={uploadCroppedPhoto}
        />
      )}
    </>
  );
}

function ProfilePhotoCropper({ source, onCancel, onUpload }) {
  const [dimensions, setDimensions] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const previewSize = viewportWidth <= 640
    ? Math.round(Math.min(260, Math.max(190, viewportWidth - 56, viewportHeight * 0.34)))
    : Math.min(320, Math.max(220, viewportWidth - 62));

  const placement = useMemo(() => {
    if (!dimensions) return null;
    const baseScale = Math.max(previewSize / dimensions.width, previewSize / dimensions.height);
    const scale = baseScale * zoom;
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    const maxX = Math.max(0, (width - previewSize) / 2);
    const maxY = Math.max(0, (height - previewSize) / 2);
    return {
      width,
      height,
      left: (previewSize - width) / 2 + (positionX / 100) * maxX,
      top: (previewSize - height) / 2 + (positionY / 100) * maxY
    };
  }, [dimensions, zoom, positionX, positionY]);

  function resetCrop() {
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
  }

  async function cropAndUpload() {
    if (!dimensions) return;
    setSaving(true);
    setError("");
    try {
      const outputSize = 512;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      const image = new Image();
      image.src = source.url;
      await image.decode();

      const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
      const scale = baseScale * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const maxX = Math.max(0, (width - outputSize) / 2);
      const maxY = Math.max(0, (height - outputSize) / 2);
      const left = (outputSize - width) / 2 + (positionX / 100) * maxX;
      const top = (outputSize - height) / 2 + (positionY / 100) * maxY;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, left, top, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Unable to prepare the cropped image.");
      const baseName = source.file.name.replace(/\.[^.]+$/, "") || "profile-photo";
      await onUpload(new File([blob], `${baseName}-cropped.jpg`, { type: "image/jpeg" }));
    } catch (cropError) {
      setError(cropError.message || "Unable to crop and upload this photo.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-dialog-overlay photo-crop-overlay" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
      <div className="app-dialog photo-crop-dialog">
        <div className="photo-crop-heading">
          <div>
            <span className="eyebrow">Profile photo</span>
            <h3 id="photo-crop-title"><Crop size={20} /> Crop and position</h3>
            <p>Center your face inside the circle. The final image will be saved as a high-quality square.</p>
          </div>
          <button className="icon-soft" type="button" onClick={onCancel} aria-label="Close photo cropper"><X size={18} /></button>
        </div>

        <div className="photo-crop-content">
          <div className="photo-crop-stage" style={{ width: previewSize, height: previewSize }}>
            <img
              src={source.url}
              alt="Crop preview"
              draggable="false"
              onLoad={(event) => setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              })}
              style={placement ? {
                width: placement.width,
                height: placement.height,
                left: placement.left,
                top: placement.top
              } : undefined}
            />
            <span className="photo-crop-guide" aria-hidden="true" />
          </div>

          <div className="photo-crop-controls">
            <label>
              <span><ZoomIn size={17} /> Zoom <strong>{Math.round(zoom * 100)}%</strong></span>
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <label>
              <span><MoveHorizontal size={17} /> Horizontal position</span>
              <input type="range" min="-100" max="100" step="1" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} />
            </label>
            <label>
              <span><MoveVertical size={17} /> Vertical position</span>
              <input type="range" min="-100" max="100" step="1" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} />
            </label>
            <button className="soft photo-crop-reset" type="button" onClick={resetCrop}><RefreshCcw size={16} /> Reset crop</button>
          </div>
        </div>

        {error && <div className="notice error compact-notice">{error}</div>}
        <div className="app-dialog-actions photo-crop-actions">
          <button className="soft" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" onClick={cropAndUpload} disabled={saving || !dimensions}>
            <Crop size={17} /> {saving ? "Uploading..." : "Crop & Upload"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MasterDataReadOnlyPage() {
  const [students, setStudents] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ search: "", batch: "", department: "", course: "", program: "", semester: "", page: 1, limit: 50 });
  const [error, setError] = useState("");

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString(), [filters]);

  async function loadStudents() {
    setError("");
    try {
      setStudents(await api(`/records/students?${query}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadStudents(); }, [query]);

  return (
    <>
      <PageHeader eyebrow="Master Data" title="Master Data (Read Only)" subtitle="View student master records; no edits allowed" />
      <FilterBar filters={filters} setFilters={setFilters} />
      {error && <ErrorState message={error} />}
      <DataTable
        columns={["Roll No", "Enrollment No", "Name", "Mail", "Phone", "Department", "Course", "CGPA", "Batch", "Struck Off"]}
        rows={students.items.map((s) => {
          const stuckOff = s.driveRestriction?.status === "STUCK_OFF" || ["stuck off", "struck off", "stuck_off", "struck_off"].includes(String(s.status || "").toLowerCase());
          return [
            s.rollNo,
            s.enrollmentNo || s.registrationNo || s.universityId || "-",
            s.name,
            s.email || "-",
            s.phone || "-",
            s.department,
            s.course || "-",
            formatCgpa(s.cgpa),
            s.batch || "-",
            <span className={`status ${stuckOff ? "rejected" : "approved"}`}>{stuckOff ? "Yes" : "No"}</span>
          ];
        })}
      />
      <div className="pagination">
        <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
        <span>{students.total} records - Page {filters.page} of {students.pages || 1}</span>
        <button disabled={filters.page >= students.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button>
      </div>
    </>
  );
}

function EligibilityListsPage({ setSelectedList, setActive, isHod = false }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadLists() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/eligibility");
      setLists(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLists(); }, []);

  return (
    <>
      <PageHeader eyebrow="Eligibility" title="Eligibility Lists" subtitle="Create and manage eligibility lists for drives">
        {!isHod && <button onClick={() => setActive("create-eligibility")}><ListChecks size={17} /> Create New List</button>}
        <button onClick={loadLists}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      <section className="panel guide-panel">
        <div>
          <h3><ListChecks size={18} /> How Eligibility Lists Work</h3>
          <p className="subtle">Create a list by applying CGPA, backlog, attendance, batch, department, and program rules on master student records. Open a list to verify eligible and not eligible students before finalizing it for the placement office.</p>
        </div>
        <div className="guide-steps">
          <div><strong>1. Create Criteria</strong><span>Select the academic filters and minimum eligibility rules.</span></div>
          <div><strong>2. Review Students</strong><span>Use Sheet Preview, Eligible, and Not Eligible tabs to inspect the result.</span></div>
          <div><strong>3. Finalize</strong><span>Finalize only after the list is checked; HOD can review approved records.</span></div>
        </div>
      </section>
      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Loading...</div>}
      <section className="panel" style={{ overflow: "visible" }}>
        {!lists.length ? <EmptyState message="No eligibility lists created yet" /> : (
          <DataTable
            className="eligibility-lists-table"
            columns={["List Name", "Company / Drive", "Total Synced", "Eligible Count", "Not Eligible", "Status", "Created By", "Created On", "Action"]}
            rows={lists.map(list => {
              const companyLabel = list.companyName || list.name || "-";
              return [
                <strong>{list.name}</strong>,
                companyLabel !== "-" ? `${companyLabel} ${list.jobRole ? `(${list.jobRole})` : ""}` : "-",
                list.eligibilityBreakdown?.totalChecked || 0,
                <span style={{ color: "var(--green)", fontWeight: "bold" }}>{list.eligibilityBreakdown?.totalEligible || 0}</span>,
                <span style={{ color: "var(--red)", fontWeight: "bold" }}>{list.eligibilityBreakdown?.totalNotEligible || 0}</span>,
                <span className={`status ${list.status === "FINALIZED" ? "approved" : "pending"}`}>{list.status}</span>,
                list.createdBy?.name || list.createdBy?.email || "Unknown",
                formatDateTime(list.createdAt),
                <button 
                  className="soft" 
                  onClick={() => { setSelectedList(list); setActive("view-eligibility"); }}
                  style={{ minHeight: "32px", padding: "0 10px" }}
                >
                  <Eye size={14} /> View Details
                </button>
              ];
            })}
          />
        )}
      </section>
    </>
  );
}

function CreateEligibilityListPage({ onComplete }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    companyName: "",
    jobRole: "",
    cgpaMin: "",
    tenthPercentageMin: "",
    twelfthPercentageMin: "",
    courses: [],
    departments: [],
    batches: [],
    program: "",
    attendanceMin: "",
    allowStuckOff: false,
    activeBacklogsMax: ""
  });
  const [options, setOptions] = useState({ courses: [], departments: [], batches: [], programs: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    async function loadOptions() {
      try {
        const data = await api("/eligibility/options/master-data");
        setOptions(data);
      } catch (err) {
        console.error("Failed to load options:", err);
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        companyName: form.companyName.trim(),
        jobRole: form.jobRole.trim(),
        courses: form.courses,
        departments: form.departments,
        batches: form.batches,
        program: form.program,
        allowStuckOff: form.allowStuckOff
      };
      ["cgpaMin", "tenthPercentageMin", "twelfthPercentageMin", "attendanceMin", "activeBacklogsMax"].forEach((field) => {
        if (form[field] !== "") payload[field] = Number(form[field]);
      });
      const result = await api("/eligibility", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Eligibility list created successfully");
      onComplete(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleMultiSelect = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  return (
    <>
      <PageHeader eyebrow="Eligibility" title="Create Eligibility List" subtitle="Create from synced master data fields">
        <button className="soft" onClick={() => onComplete(null)}><ChevronLeft size={17} /> Back</button>
      </PageHeader>
      {message && <div className={message.toLowerCase().includes("success") ? "notice" : "notice error"}>{message}</div>}
      <section className="panel eligibility-form-panel">
        {optionsLoading ? (
          <div className="notice">Loading options...</div>
        ) : (
          <form className="eligibility-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3>List Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="listName">List Name</label>
                  <input id="listName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label htmlFor="companyName">Company Name</label>
                  <input id="companyName" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Example: Gemini AI" required />
                </div>
                <div className="form-group">
                  <label htmlFor="jobRole">Drive / Job Role</label>
                  <input id="jobRole" value={form.jobRole} onChange={(e) => setForm({ ...form, jobRole: e.target.value })} placeholder="Example: Software Developer" />
                </div>
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Master Data Criteria</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Program</label>
                  <select value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                    <option value="">All Programs</option>
                    {options.programs.map(program => <option key={program} value={program}>{program}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row criteria-picker-row">
                <div className="form-group multi-select-group">
                  <label>Course / Degree</label>
                  <div className="multi-select-container course-options">
                    {options.courses.map(course => (
                      <label key={course} className="multi-select-item">
                        <input
                          type="checkbox"
                          checked={form.courses.includes(course)}
                          onChange={() => handleMultiSelect("courses", course)}
                        />
                        <span>{course}</span>
                      </label>
                    ))}
                    {options.courses.length === 0 && <span className="subtle">No courses in master data</span>}
                  </div>
                </div>
                <div className="form-group multi-select-group">
                  <label>Department / Branch</label>
                  <div className="multi-select-container department-options">
                    {options.departments.map(dept => (
                      <label key={dept} className="multi-select-item">
                        <input
                          type="checkbox"
                          checked={form.departments.includes(dept)}
                          onChange={() => handleMultiSelect("departments", dept)}
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                    {options.departments.length === 0 && <span className="subtle">No departments in master data</span>}
                  </div>
                </div>
                <div className="form-group multi-select-group">
                  <label>Batches</label>
                  <div className="multi-select-container">
                    {options.batches.map(batch => (
                      <label key={batch} className="multi-select-item">
                        <input
                          type="checkbox"
                          checked={form.batches.includes(batch)}
                          onChange={() => handleMultiSelect("batches", batch)}
                        />
                        <span>{batch}</span>
                      </label>
                    ))}
                    {options.batches.length === 0 && <span className="subtle">No batches in master data</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Optional Filters</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="cgpaMin">CGPA Min</label>
                  <input id="cgpaMin" type="number" step="0.1" min="0" max="10" value={form.cgpaMin} onChange={(e) => setForm({ ...form, cgpaMin: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="tenthPercentageMin">10th Marks % Min</label>
                  <input id="tenthPercentageMin" type="number" step="0.1" min="0" max="100" value={form.tenthPercentageMin} onChange={(e) => setForm({ ...form, tenthPercentageMin: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="twelfthPercentageMin">12th Marks % Min</label>
                  <input id="twelfthPercentageMin" type="number" step="0.1" min="0" max="100" value={form.twelfthPercentageMin} onChange={(e) => setForm({ ...form, twelfthPercentageMin: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Attendance % Min</label>
                  <input type="number" min="0" max="100" value={form.attendanceMin} onChange={(e) => setForm({ ...form, attendanceMin: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="activeBacklogsMax">Active Backlogs Max</label>
                  <input id="activeBacklogsMax" type="number" min="0" max="50" value={form.activeBacklogsMax} onChange={(e) => setForm({ ...form, activeBacklogsMax: e.target.value })} />
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={form.allowStuckOff} onChange={(e) => setForm({ ...form, allowStuckOff: e.target.checked })} />
                    Allow Struck Off Students
                  </label>
                </div>
              </div>
            </div>

            <div className="form-submit-row">
              <button type="submit" disabled={loading}><ListChecks size={17} /> {loading ? "Creating List..." : "Create Eligibility List"}</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

function EligibilityListDetailPage({ list: initialList, back, isHod = false }) {
  const [list, setList] = useState(initialList);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSubTab, setActiveSubTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showExportBuilder, setShowExportBuilder] = useState(false);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exportScope, setExportScope] = useState("eligible");
  const [selectedExportFields, setSelectedExportFields] = useState(defaultEligibilityExportFields);
  const [exporting, setExporting] = useState(false);

  async function loadList() {
    setLoading(true);
    try {
      const data = await api(`/eligibility/${initialList._id}`);
      setList(data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function finalizeList() {
    setLoading(true);
    try {
      const data = await api(`/eligibility/${initialList._id}/finalize`, { method: "PATCH" });
      setList(data);
      setMessage("List finalized successfully");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function exportList() {
    if (!selectedExportFields.length) {
      setMessage("Select at least one field to download.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const params = new URLSearchParams({
        fields: selectedExportFields.join(","),
        scope: exportScope,
        format: exportFormat
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const blob = await downloadApiFile(`/eligibility/${initialList._id}/export?${params}`);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${list.name.replace(/[^a-z0-9]/gi, "_")}-${exportScope}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setMessage(`Download successful: ${exportScope === "all" ? "all checked" : exportScope === "notEligible" ? "not eligible" : "eligible"} students with ${selectedExportFields.length} selected fields.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setExporting(false);
    }
  }

  function toggleExportField(field) {
    setSelectedExportFields((current) => (
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    ));
  }

  function openExportBuilder() {
    setExportScope(activeSubTab === "not-eligible" ? "notEligible" : activeSubTab === "all" ? "all" : "eligible");
    setShowExportBuilder(true);
  }

  useEffect(() => { loadList(); }, [initialList._id]);

  function categorizeReasons(reasonsMap) {
    const categories = {
      "Less CGPA": 0,
      "Backlogs Limit Exceeded": 0,
      "Struck Off": 0,
      "Less Attendance": 0,
      "Restricted Course/Branch/Batch": 0,
      "Other Reasons": 0
    };
    
    if (!reasonsMap) return categories;
    
    const entries = reasonsMap instanceof Map ? reasonsMap.entries() : Object.entries(reasonsMap);
    for (const [reason, count] of entries) {
      const r = reason.toLowerCase();
      if (r.includes("cgpa")) {
        categories["Less CGPA"] += count;
      } else if (r.includes("backlog")) {
        categories["Backlogs Limit Exceeded"] += count;
      } else if (r.includes("stuck") || r.includes("struck")) {
        categories["Struck Off"] += count;
      } else if (r.includes("attendance")) {
        categories["Less Attendance"] += count;
      } else if (r.includes("eligible") || r.includes("restricted") || r.includes("course") || r.includes("branch") || r.includes("batch") || r.includes("department") || r.includes("program")) {
        categories["Restricted Course/Branch/Batch"] += count;
      } else {
        categories["Other Reasons"] += count;
      }
    }
    return categories;
  }

  function getDisplayReasons(student) {
    const isElig = student.isEligible !== undefined ? student.isEligible : (student.eligibilityStatus === "Eligible");
    let list = student.reasons || [];
    if (!isElig && (list.length === 0 || list.includes("Meets all eligibility criteria") || list.includes("Meets all criteria"))) {
      return ["Student was Struck Off at list creation time"];
    }
    return list;
  }

  const categories = categorizeReasons(list.eligibilityBreakdown?.reasons);
  const regSummary = list.registrationSummary || { registered: 0, notRegistered: 0, total: 0, present: 0, absent: 0, pendingAttendance: 0 };

  const totalChecked = list.eligibilityBreakdown?.totalChecked || 0;
  const totalEligible = list.eligibilityBreakdown?.totalEligible || 0;
  const totalNotEligible = list.eligibilityBreakdown?.totalNotEligible || 0;
  
  const eligiblePct = totalChecked ? Math.round((totalEligible / totalChecked) * 100) : 0;
  const regPct = regSummary.total ? Math.round((regSummary.registered / regSummary.total) * 100) : 0;

  const attendedCount = (regSummary.present || 0) + (regSummary.absent || 0) + (regSummary.pendingAttendance || 0);
  const presentPct = attendedCount ? Math.round((regSummary.present / attendedCount) * 100) : 0;
  const absentPct = attendedCount ? Math.round((regSummary.absent / attendedCount) * 100) : 0;
  const pendingPct = attendedCount ? Math.round((regSummary.pendingAttendance / attendedCount) * 100) : 0;

  const attendanceConicGradient = `conic-gradient(var(--green) ${presentPct}%, var(--red) ${presentPct}% ${presentPct + absentPct}%, var(--yellow) ${presentPct + absentPct}% 100%)`;

  const searchTermClean = searchTerm.trim().toLowerCase();

  const allStudentsCombined = useMemo(() => {
    const eligibleMapped = (list.eligibleStudents || []).map(s => ({
      ...s,
      isEligible: true,
      eligibilityStatus: "Eligible",
      reasons: ["Meets all criteria"]
    }));
    const ineligibleMapped = (list.notEligibleStudents || []).map(s => ({
      ...s,
      isEligible: false,
      eligibilityStatus: "Not Eligible",
      registrationStatus: "N/A"
    }));
    
    const combined = [...eligibleMapped, ...ineligibleMapped];
    if (!searchTermClean) return combined;
    return combined.filter(s => 
      String(s.name || "").toLowerCase().includes(searchTermClean) ||
      String(s.rollNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.enrollmentNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.registrationNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.universityId || "").toLowerCase().includes(searchTermClean) ||
      String(s.email || "").toLowerCase().includes(searchTermClean) ||
      String(s.department || "").toLowerCase().includes(searchTermClean) ||
      String(s.course || "").toLowerCase().includes(searchTermClean)
    );
  }, [list.eligibleStudents, list.notEligibleStudents, searchTermClean]);

  const filteredEligible = useMemo(() => {
    const eligibleMapped = (list.eligibleStudents || []).map(s => ({
      ...s,
      isEligible: true,
      eligibilityStatus: "Eligible"
    }));
    if (!searchTermClean) return eligibleMapped;
    return eligibleMapped.filter(s => 
      String(s.name || "").toLowerCase().includes(searchTermClean) ||
      String(s.rollNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.enrollmentNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.registrationNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.universityId || "").toLowerCase().includes(searchTermClean) ||
      String(s.email || "").toLowerCase().includes(searchTermClean) ||
      String(s.department || "").toLowerCase().includes(searchTermClean) ||
      String(s.course || "").toLowerCase().includes(searchTermClean)
    );
  }, [list.eligibleStudents, searchTermClean]);

  const filteredNotEligible = useMemo(() => {
    const ineligibleMapped = (list.notEligibleStudents || []).map(s => ({
      ...s,
      isEligible: false,
      eligibilityStatus: "Not Eligible"
    }));
    if (!searchTermClean) return ineligibleMapped;
    return ineligibleMapped.filter(s => 
      String(s.name || "").toLowerCase().includes(searchTermClean) ||
      String(s.rollNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.enrollmentNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.registrationNo || "").toLowerCase().includes(searchTermClean) ||
      String(s.universityId || "").toLowerCase().includes(searchTermClean) ||
      String(s.email || "").toLowerCase().includes(searchTermClean) ||
      String(s.department || "").toLowerCase().includes(searchTermClean) ||
      String(s.course || "").toLowerCase().includes(searchTermClean)
    );
  }, [list.notEligibleStudents, searchTermClean]);

  const allColumns = ["Sr No", "Roll No", "Enrollment No", "Name", "Email", "Department", "Course", "Batch", "CGPA", "Eligibility Status", "Details / Reason"];

  const eligibleColumns = ["Sr No", "Roll No", "Enrollment No", "Name", "Email", "Department", "Course", "Batch", "CGPA"];

  return (
    <>
      <PageHeader eyebrow="Eligibility" title={list.name} subtitle={list.description || "No description"}>
        <button className="soft" onClick={back}><ChevronLeft size={17} /> Back to Lists</button>
        <button className="soft" onClick={openExportBuilder}><FileDown size={17} /> Custom Download</button>
        {!isHod && list.status === "DRAFT" && <button onClick={finalizeList} disabled={loading}><Save size={17} /> Finalize List</button>}
      </PageHeader>
      {message && <div className={message.toLowerCase().includes("success") ? "notice" : "notice error"}>{message}</div>}

      {showExportBuilder && (
        <section className="panel eligibility-export-builder">
          <div className="eligibility-export-heading">
            <div>
              <span className="eyebrow">Customizable student file</span>
              <h3><FileDown size={19} /> Choose Fields to Download</h3>
              <p className="subtle">Select any fields available in Master Data. The current search text is also applied to the downloaded file.</p>
            </div>
            <button className="icon-button soft" type="button" onClick={() => setShowExportBuilder(false)} aria-label="Close custom download"><X size={18} /></button>
          </div>
          <div className="eligibility-export-controls">
            <label>Students
              <select value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
                <option value="eligible">Eligible students</option>
                <option value="notEligible">Not eligible students</option>
                <option value="all">All checked students</option>
              </select>
            </label>
            <label>File format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>
            <div className="export-selection-actions">
              <button className="soft" type="button" onClick={() => setSelectedExportFields(eligibilityExportFieldGroups.flatMap((group) => group.fields.map(([field]) => field)))}>Select All</button>
              <button className="soft" type="button" onClick={() => setSelectedExportFields(defaultEligibilityExportFields)}>Recommended</button>
              <button className="soft" type="button" onClick={() => setSelectedExportFields([])}>Clear</button>
            </div>
          </div>
          <div className="eligibility-field-groups">
            {eligibilityExportFieldGroups.map((group) => (
              <fieldset key={group.label}>
                <legend>{group.label}</legend>
                <div>
                  {group.fields.map(([field, label]) => (
                    <label key={field} className="export-field-option">
                      <input type="checkbox" checked={selectedExportFields.includes(field)} onChange={() => toggleExportField(field)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="eligibility-export-footer">
            <span><strong>{selectedExportFields.length}</strong> fields selected{searchTerm.trim() ? ` Â· Search filter: â€œ${searchTerm.trim()}â€` : ""}</span>
            <button type="button" onClick={exportList} disabled={!selectedExportFields.length || exporting}>
              <FileDown size={17} /> {exporting ? "Preparing..." : `Download ${exportFormat.toUpperCase()}`}
            </button>
          </div>
        </section>
      )}
      
      <div style={{ background: "white", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", marginTop: "14px", fontSize: "14px", textAlign: "left" }}>
        <strong>List Info:</strong> Created by <strong>{list.createdBy?.name || list.createdBy?.email || "Unknown"}</strong>.
      </div>

      {/* Advanced Rate Analytics Section */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginTop: "20px" }}>
        {/* Eligibility Donut */}
        <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--green)" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Eligibility Rate</h3>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
            <div className="donut-chart" style={{ width: "110px", height: "110px", background: `conic-gradient(var(--green) ${eligiblePct}%, var(--red) ${eligiblePct}% 100%)` }}>
              <span style={{ fontSize: "20px", fontWeight: "900" }}>{eligiblePct}%</span>
              <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Eligible</small>
            </div>
            <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                <span style={{ color: "var(--muted)" }}>Total Checked</span>
                <strong>{totalChecked}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--green)" }}>
                <span>Eligible</span>
                <strong>{totalEligible}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)" }}>
                <span>Ineligible</span>
                <strong>{totalNotEligible}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Registration Donut */}
        {!isHod && list.companyName && (
          <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--blue)" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Registration Rate</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
              <div className="donut-chart" style={{ width: "110px", height: "110px", background: `conic-gradient(var(--blue) ${regPct}%, #e2e8f0 ${regPct}% 100%)` }}>
                <span style={{ fontSize: "20px", fontWeight: "900" }}>{regPct}%</span>
                <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Registered</small>
              </div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                  <span style={{ color: "var(--muted)" }}>Eligible Pool</span>
                  <strong>{regSummary.total}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--blue)" }}>
                  <span>Registered</span>
                  <strong>{regSummary.registered}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}>
                  <span>Unregistered</span>
                  <strong>{regSummary.notRegistered}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attendance Donut */}
        {!isHod && list.companyName && regSummary.registered > 0 && (
          <div className="panel chart-panel" style={{ margin: 0, padding: "20px", display: "grid", gap: "16px", borderTop: "4px solid var(--orange)" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--ink)", textAlign: "left" }}>Attendance Rate</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
              <div className="donut-chart" style={{ width: "110px", height: "110px", background: attendanceConicGradient }}>
                <span style={{ fontSize: "20px", fontWeight: "900" }}>{presentPct}%</span>
                <small style={{ fontSize: "9px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>Present</small>
              </div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                  <span style={{ color: "var(--muted)" }}>Registered Pool</span>
                  <strong>{regSummary.registered}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--green)" }}>
                  <span>Present</span>
                  <strong>{regSummary.present}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)" }}>
                  <span>Absent</span>
                  <strong>{regSummary.absent}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--yellow)" }}>
                  <span>Pending</span>
                  <strong>{regSummary.pendingAttendance}</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {list.eligibilityBreakdown?.totalNotEligible > 0 && (
        <section className="panel" style={{ marginTop: "20px" }}>
          <h3 style={{ margin: "0 0 15px 0", fontSize: "18px", textAlign: "left" }}>Ineligibility Breakdown (Reasons)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "15px" }}>
            {Object.entries(categories).map(([category, count]) => {
              if (count === 0) return null;
              return (
                <div key={category} className="mini" style={{ 
                  borderTop: `4px solid ${
                    category === "Less CGPA" ? "var(--blue)" :
                    category === "Backlogs Limit Exceeded" ? "var(--orange)" :
                    category === "Struck Off" ? "var(--red)" :
                    category === "Less Attendance" ? "var(--yellow)" : "var(--muted)"
                  }`,
                  padding: "12px",
                  textAlign: "center"
                }}>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--muted)" }}>{category}</span>
                  <strong style={{ fontSize: "24px", color: "var(--ink)", margin: "4px 0", display: "block" }}>{count}</strong>
                  <span style={{ fontSize: "11px", textTransform: "none", color: "#64748b" }}>students failed</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tabs and Search Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", margin: "25px 0 12px 0", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button 
            className={activeSubTab === "all" ? "button" : "soft"} 
            onClick={() => setActiveSubTab("all")}
            style={{ minHeight: "38px", paddingInline: "14px" }}
          >
            Sheet Preview ({allStudentsCombined.length} / {totalChecked})
          </button>
          <button 
            className={activeSubTab === "eligible" ? "button" : "soft"} 
            onClick={() => setActiveSubTab("eligible")}
            style={{ minHeight: "38px", paddingInline: "14px" }}
          >
            Eligible ({list.eligibleStudents?.length || 0})
          </button>
          <button 
            className={activeSubTab === "not-eligible" ? "button" : "soft"} 
            onClick={() => setActiveSubTab("not-eligible")}
            style={{ minHeight: "38px", paddingInline: "14px" }}
          >
            Not Eligible ({list.notEligibleStudents?.length || 0})
          </button>
        </div>
        <label className="searchbox" style={{ width: "300px", margin: 0 }} aria-label="Search student">
          <Search size={18} />
          <input 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            placeholder="Search by name, roll, dept..." 
            style={{ minHeight: "38px", fontSize: "14px" }}
          />
        </label>
      </div>

      {activeSubTab === "all" && (
        <section className="panel" style={{ marginTop: "10px" }}>
          <h3 style={{ textAlign: "left" }}>Sheet Preview (All Checked Students)</h3>
          {!allStudentsCombined.length ? <EmptyState message="No students match the search term" /> : (
            <DataTable
              className="eligible-students-table"
              columns={allColumns}
              rows={allStudentsCombined.map((student, index) => {
                const rowData = [
                  index + 1,
                  student.rollNo || "-",
                  student.enrollmentNo || student.registrationNo || student.universityId || "-",
                  student.name,
                  student.email || "-",
                  student.department || "-",
                  student.course || "-",
                  student.batch || "-",
                  formatCgpa(student.cgpa),
                  <span className={`status ${student.isEligible ? "approved" : "rejected"}`}>{student.eligibilityStatus}</span>
                ];
                rowData.push(
                  student.isEligible ? (
                    <span style={{ color: "var(--muted)" }}>Meets all criteria</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "11px", color: "var(--red)", textAlign: "left" }}>
                      {getDisplayReasons(student).map((reason, rIdx) => <li key={rIdx}>{reason}</li>)}
                    </ul>
                  )
                );
                return rowData;
              })}
            />
          )}
        </section>
      )}

      {activeSubTab === "eligible" && (
        <section className="panel" style={{ marginTop: "10px" }}>
          <h3 style={{ textAlign: "left" }}>Eligible Students</h3>
          {!filteredEligible.length ? <EmptyState message="No eligible students found matching the search" /> : (
            <DataTable
              className="eligible-students-table"
              columns={eligibleColumns}
              rows={filteredEligible.map((student, index) => {
                const rowData = [
                  index + 1,
                  student.rollNo || "-",
                  student.enrollmentNo || student.registrationNo || student.universityId || "-",
                  student.name,
                  student.email || "-",
                  student.department || "-",
                  student.course || "-",
                  student.batch || "-",
                  formatCgpa(student.cgpa)
                ];
                return rowData;
              })}
            />
          )}
        </section>
      )}

      {activeSubTab === "not-eligible" && (
        <section className="panel" style={{ marginTop: "10px" }}>
          <h3 style={{ textAlign: "left" }}>Not Eligible Students</h3>
          {!filteredNotEligible.length ? <EmptyState message="No ineligible students found matching the search" /> : (
            <DataTable
              className="eligible-students-table"
              columns={["Sr No", "Roll No", "Enrollment No", "Name", "Email", "Department", "Course", "Batch", "CGPA", "Reason(s)"]}
              rows={filteredNotEligible.map((student, index) => [
                index + 1,
                student.rollNo || "-",
                student.enrollmentNo || student.registrationNo || student.universityId || "-",
                student.name,
                student.email || "-",
                student.department || "-",
                student.course || "-",
                student.batch || "-",
                formatCgpa(student.cgpa),
                <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "12px", color: "var(--red)", textAlign: "left" }}>
                  {getDisplayReasons(student).map((reason, rIdx) => <li key={rIdx}>{reason}</li>)}
                </ul>
              ])}
            />
          )}
        </section>
      )}
    </>
  );
}

function StuckOffReport({ items }) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <section className="panel stuck-report">
      <h3>Struck Off Risk Report</h3>
      <p className="subtle">Not registered means overall absent for that drive. If a registered student is present in any one process, the drive counts as overall present. Students absent in 2 or more drives are shown here for HOD review.</p>
      {!rows.length ? <EmptyState message="No Struck Off risk students yet" /> : (
        <div className="stuck-report-table-wrap">
          <table className="report-table stuck-report-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll / Enrollment</th>
                <th>Department</th>
                <th>Batch</th>
                <th>Absent Drives</th>
                <th>Status</th>
                <th>Drive Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.student?._id || item.student?.studentId}>
                  <td style={{ fontWeight: 800 }}>{item.student?.name || "Unknown Student"}</td>
                  <td>{item.student?.rollNo || item.student?.enrollmentNo || "-"}</td>
                  <td>{item.student?.department || "-"}</td>
                  <td>{item.student?.batch || "-"}</td>
                  <td style={{ fontWeight: 800 }}>{item.absentDriveCount}</td>
                  <td>
                    <span className={`percent-pill ${item.status === "STUCK_OFF" ? "absent" : "present"}`}>
                      {item.status === "STUCK_OFF" ? "Struck Off" : "Watch"}
                    </span>
                  </td>
                  <td>
                    <div className="stuck-drive-list">
                      {(item.drives || []).map((drive, index) => (
                        <span key={`${drive.companyName}-${index}`}>
                          <strong>{drive.companyName || "Drive"}</strong>: {drive.overallAttendanceStatus?.replaceAll("_", " ") || "Pending"}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DataTable({ columns, rows, className = "" }) {
  return (
    <section className={`table-wrap ${className}`}>
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} data-label={columns[cellIndex] || `Field ${cellIndex + 1}`}>{cell}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function StudentDrawer({ payload, close, onUpdateRestriction, readOnly = false }) {
  const { user } = useAuth();
  const isHod = user?.role === "HOD";
  const student = payload.student || payload;
  const [currentStudent, setCurrentStudent] = useState(student);
  const summary = payload.driveSummary || {};
  const isStuckOff = currentStudent.driveRestriction?.status === "STUCK_OFF" || 
                     ["stuck off", "struck off", "stuck_off", "struck_off"].includes(String(currentStudent.status || "").toLowerCase()) || 
                     summary.stuckOffStatus === "STUCK_OFF";
  const [status, setStatus] = useState(isStuckOff ? "STUCK_OFF" : "CLEAR");
  const [reason, setReason] = useState(
    currentStudent.driveRestriction?.reason || 
    summary.stuckOffReason || 
    (isStuckOff ? "Stuck off from master sheet status column." : "")
  );
  const [message, setMessage] = useState("");
  const [driveSearch, setDriveSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState("");

  const stuckOff = status === "STUCK_OFF";
  const filteredDriveRows = (summary.driveRows || []).filter((row) => {
    const text = [
      row.drive?.companyName,
      row.drive?.jobRole,
      row.registrationStatus,
      row.overallAttendanceStatus,
      ...(row.roundHistory || []).map((round) => `${round.roundName} ${round.status}`)
    ].join(" ").toLowerCase();
    return text.includes(driveSearch.trim().toLowerCase());
  });
  const restrictionEdits = (currentStudent.localEdits || []).filter((edit) => edit.field === "driveRestriction.status");

  async function saveRestriction(event) {
    event.preventDefault();
    if (readOnly) return;
    await onUpdateRestriction(status, reason);
    setMessage(status === "CLEAR" ? "Student status changed to Active." : "Student marked as Struck Off.");
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (editReason.trim().length < 3) {
      setEditError("Please enter a valid edit reason (at least 3 characters)");
      return;
    }
    setEditError("");
    try {
      const updated = await api(`/records/students/${currentStudent._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          updates: editForm,
          reason: editReason
        })
      });
      setCurrentStudent(updated);
      setIsEditing(false);
      setMessage("Student details updated successfully");
    } catch (err) {
      setEditError(err.message || "Failed to save student edits");
    }
  }

  return (
    <aside className="student-card-overlay">
      <button className="student-card-backdrop" onClick={close} aria-label="Close student preview" />
      <section className="student-card-modal">
        <div className={`student-hero ${stuckOff ? "is-stuck" : "is-clear"}`}>
          <div className="student-avatar">{(currentStudent.name || "S").slice(0, 1).toUpperCase()}</div>
          <div className="student-title-block">
            <span className={`status ${stuckOff ? "rejected" : "approved"}`}>{stuckOff ? "Struck Off" : "Clear for drives"}</span>
            <h2>{currentStudent.name}</h2>
            <p>{currentStudent.rollNo || currentStudent.enrollmentNo || currentStudent.studentId || "-"} - {currentStudent.department || "-"} - {currentStudent.program || "-"}</p>
          </div>
          <button className="student-close" onClick={close}>Close</button>
        </div>

        <div className="student-card-body">
          <section className="student-panel drive-status-panel">
            <div className="section-heading">
              <h3>Drive Status</h3>
              <p>Attendance summary calculated from uploaded drive sheets.</p>
            </div>
            <div className="student-stat-grid">
              <Mini label="Eligible Drives" value={summary.eligibleDrives ?? 0} />
              <Mini label="Registered" value={summary.registeredDrives ?? 0} />
              <Mini label="Present Drives" value={summary.presentDrives ?? 0} />
              <Mini label="Absent Drives" value={summary.absentDrives ?? currentStudent.driveRestriction?.absentDriveCount ?? 0} />
              <Mini label="Total Drives" value={summary.totalDrives ?? 0} />
              <Mini label="Struck Off" value={stuckOff ? "Yes" : "No"} />
            </div>
            {message && <div className="inline-success">{message}</div>}
            {!readOnly && <form className="restriction-form" onSubmit={saveRestriction}>
              <label>HOD Status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="CLEAR">Active / Clear for next drives</option>
                  <option value="STUCK_OFF">Stuck off from next drives</option>
                </select>
              </label>
              <label>Reason
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for HOD review or override" />
              </label>
              <button style={{ height: "42px" }}><Save size={17} /> Update Status</button>
            </form>}

            {/* Absent Drive History contributing to Struck Off */}
            {(() => {
              const absentDrives = (summary.driveRows || []).filter(row => row.overallAttendanceStatus === "OVERALL_ABSENT");
              if (absentDrives.length > 0) {
                return (
                  <div className="absent-history-box" style={{ marginTop: "18px", padding: "14px", border: "1px dashed var(--red)", borderRadius: "8px", background: "#fdf3f2" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "var(--red)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "800" }}>
                      <ShieldCheck size={16} /> ABSENT HISTORY CONTRIBUTING TO STUCK-OFF
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12.5px", color: "#7f1d1d", textAlign: "left" }}>
                      {absentDrives.map((row, index) => (
                        <li key={index} style={{ marginBottom: "5px" }}>
                          <strong>{row.drive?.companyName}</strong> ({row.drive?.jobRole || "Drive"} on {row.drive?.driveDate ? new Date(row.drive.driveDate).toLocaleDateString() : "date not set"}) - <em>{row.overallAttendanceReason || "Absent without recorded reason"}</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return null;
            })()}

            {/* HOD Status Override History (Timeline from localEdits) */}
            {(() => {
              const restrictionEdits = (currentStudent.localEdits || []).filter(edit => edit.field === "driveRestriction.status");
              if (false && restrictionEdits.length > 0) {
                return (
                  <div className="override-history-box" style={{ marginTop: "15px", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", background: "#f8fafc" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "var(--muted)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "800", textTransform: "uppercase" }}>
                      <RefreshCcw size={14} /> Manual Override History
                    </h4>
                    <div style={{ display: "grid", gap: "8px", textAlign: "left", fontSize: "12px" }}>
                      {restrictionEdits.map((edit, index) => (
                        <div key={index} style={{ padding: "6px 8px", background: "white", border: "1px solid var(--line)", borderRadius: "6px" }}>
                          <span style={{ color: "var(--muted)" }}>{new Date(edit.editedAt).toLocaleString()}</span> â€” 
                          Changed status to <strong>{edit.newValue}</strong> by <strong>{edit.editedBy?.name || edit.editedBy?.email || "System"}</strong>. 
                          {edit.reason && <p style={{ margin: "4px 0 0 0", color: "#475569" }}><em>Reason: {edit.reason}</em></p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </section>

          <section className="student-panel">
            <div className="section-heading">
              <div>
                <h3>Student Details</h3>
                <p>Master data synced from the connected sheet.</p>
              </div>
              {isHod && !readOnly && !isEditing && (
                <button className="soft button-sm" onClick={() => {
                  setIsEditing(true);
                  setEditForm({
                    name: currentStudent.name || "",
                    grNo: currentStudent.grNo || "",
                    rollNo: currentStudent.rollNo || "",
                    enrollmentNo: currentStudent.enrollmentNo || "",
                    universityId: currentStudent.universityId || "",
                    gender: currentStudent.gender || "",
                    email: currentStudent.email || "",
                    phone: currentStudent.phone || "",
                    fatherContactNo: currentStudent.fatherContactNo || "",
                    college: currentStudent.college || "",
                    branch: currentStudent.branch || "",
                    specialization: currentStudent.specialization || "",
                    program: currentStudent.program || "",
                    course: currentStudent.course || "",
                    semester: currentStudent.semester || 1,
                    batch: currentStudent.batch || "",
                    cgpa: currentStudent.cgpa || 0,
                    attendance: currentStudent.attendance || 0,
                    domicileCity: currentStudent.domicileCity || "",
                    domicileState: currentStudent.domicileState || "",
                    address: currentStudent.address || "",
                    semesters: currentStudent.semesters || {}
                  });
                  setEditReason("");
                  setEditError("");
                }}>Edit Details</button>
              )}
            </div>
            {!isEditing ? (
              <div className="student-detail-grid">
                <Mini label="GR No" value={currentStudent.grNo || "-"} />
                <Mini label="Roll No" value={currentStudent.rollNo} />
                <Mini label="Enrollment No" value={currentStudent.enrollmentNo || "-"} />
                <Mini label="University ID" value={currentStudent.universityId || "-"} />
                <Mini label="Name" value={currentStudent.name} />
                <Mini label="Gender" value={currentStudent.gender || "-"} />
                <Mini label="Date of Birth" value={currentStudent.dob ? new Date(currentStudent.dob).toLocaleDateString() : "-"} />
                <Mini label="Mail" value={currentStudent.email || "-"} />
                <Mini label="Phone" value={currentStudent.phone || "-"} />
                <Mini label="Father's Phone" value={currentStudent.fatherContactNo || "-"} />
                <Mini label="College" value={currentStudent.college || "-"} />
                <Mini label="Department" value={currentStudent.department} />
                <Mini label="Branch" value={currentStudent.branch || "-"} />
                <Mini label="Specialization" value={currentStudent.specialization || "-"} />
                <Mini label="Program" value={currentStudent.program || "-"} />
                <Mini label="Course" value={currentStudent.course || "-"} />
                <Mini label="Semester" value={currentStudent.semester} />
                <Mini label="Batch" value={currentStudent.batch || "-"} />
                <Mini label="Admission Year" value={currentStudent.admissionYear || "-"} />
                <Mini label="Passing Year" value={currentStudent.passingYear || "-"} />
                <Mini label="CGPA" value={formatCgpa(currentStudent.cgpa)} />
                <Mini label="Attendance" value={`${currentStudent.attendance}%`} />
                <Mini label="10th %" value={currentStudent.tenthPercentage != null ? currentStudent.tenthPercentage : "-"} />
                <Mini label="10th Passing Year" value={currentStudent.tenthPassingYear || "-"} />
                <Mini label="12th %" value={currentStudent.twelfthPercentage != null ? currentStudent.twelfthPercentage : "-"} />
                <Mini label="12th Passing Year" value={currentStudent.twelfthPassingYear || "-"} />
                <Mini label="Diploma %" value={currentStudent.diplomaPercentage != null ? currentStudent.diplomaPercentage : "-"} />
                <Mini label="Graduation %" value={currentStudent.graduationPercentage != null ? currentStudent.graduationPercentage : "-"} />
                <Mini label="PG Streams" value={currentStudent.pgStreams || "-"} />
                <Mini label="Active Backlogs" value={currentStudent.activeBacklogs != null ? currentStudent.activeBacklogs : "-"} />
                <Mini label="Total Backlogs" value={currentStudent.totalBacklogs != null ? currentStudent.totalBacklogs : "-"} />
                <Mini label="Category" value={currentStudent.category || "-"} />
                <Mini label="Domicile City" value={currentStudent.domicileCity || "-"} />
                <Mini label="Domicile State" value={currentStudent.domicileState || "-"} />
                <Mini label="Address" value={currentStudent.address || "-"} style={{ gridColumn: "span 5" }} />
                <Mini label="Placement Status" value={currentStudent.placementStatus || "-"} />
              </div>
            ) : (
              <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: "20px" }}>
                <div className="student-detail-grid">
                  <label>GR No<input value={editForm.grNo || ""} onChange={(e) => setEditForm({ ...editForm, grNo: e.target.value })} /></label>
                  <label>Roll No<input value={editForm.rollNo || ""} onChange={(e) => setEditForm({ ...editForm, rollNo: e.target.value })} required /></label>
                  <label>Enrollment No<input value={editForm.enrollmentNo || ""} onChange={(e) => setEditForm({ ...editForm, enrollmentNo: e.target.value })} /></label>
                  <label>University ID<input value={editForm.universityId || ""} onChange={(e) => setEditForm({ ...editForm, universityId: e.target.value })} /></label>
                  <label>Full Name<input value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></label>
                  <label>Gender<input value={editForm.gender || ""} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} /></label>
                  <label>Mail<input type="email" value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></label>
                  <label>Phone<input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></label>
                  <label>Father's Phone<input value={editForm.fatherContactNo || ""} onChange={(e) => setEditForm({ ...editForm, fatherContactNo: e.target.value })} /></label>
                  <label>College<input value={editForm.college || ""} onChange={(e) => setEditForm({ ...editForm, college: e.target.value })} /></label>
                  <label>Branch<input value={editForm.branch || ""} onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })} /></label>
                  <label>Specialization<input value={editForm.specialization || ""} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} /></label>
                  <label>Program<input value={editForm.program || ""} onChange={(e) => setEditForm({ ...editForm, program: e.target.value })} /></label>
                  <label>Course<input value={editForm.course || ""} onChange={(e) => setEditForm({ ...editForm, course: e.target.value })} /></label>
                  <label>Semester<input type="number" value={editForm.semester || 1} onChange={(e) => setEditForm({ ...editForm, semester: Number(e.target.value) })} /></label>
                  <label>Batch<input value={editForm.batch || ""} onChange={(e) => setEditForm({ ...editForm, batch: e.target.value })} /></label>
                  <label>CGPA<input type="number" step="0.01" value={editForm.cgpa || 0} onChange={(e) => setEditForm({ ...editForm, cgpa: Number(e.target.value) })} /></label>
                  <label>Attendance %<input type="number" value={editForm.attendance || 0} onChange={(e) => setEditForm({ ...editForm, attendance: Number(e.target.value) })} /></label>
                  <label>Domicile City<input value={editForm.domicileCity || ""} onChange={(e) => setEditForm({ ...editForm, domicileCity: e.target.value })} /></label>
                  <label>Domicile State<input value={editForm.domicileState || ""} onChange={(e) => setEditForm({ ...editForm, domicileState: e.target.value })} /></label>
                  <label style={{ gridColumn: "span 3" }}>Address<textarea value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} style={{ width: "100%", padding: "8px", border: "1px solid var(--line)", borderRadius: "8px" }} /></label>
                </div>
                
                {/* Semester Results Edit Grid */}
                <div style={{ marginTop: "15px", borderTop: "1px solid var(--line)", paddingTop: "15px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: "700" }}>Semester Results</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: "12px" }}>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((semNum) => (
                      <div key={semNum} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
                        <strong style={{ fontSize: "13px", color: "#334155", display: "block", marginBottom: "4px" }}>Semester {semNum}</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "6px" }}>
                          <label style={{ gap: "3px" }}>%
                            <input
                              type="number"
                              step="0.01"
                              style={{ minHeight: "34px", padding: "4px 8px", fontSize: "13px" }}
                              value={editForm.semesters?.[semNum]?.percentage ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? "" : Number(e.target.value);
                                setEditForm({
                                  ...editForm,
                                  semesters: {
                                    ...editForm.semesters,
                                    [semNum]: {
                                      ...(editForm.semesters?.[semNum] || {}),
                                      percentage: val
                                    }
                                  }
                                });
                              }}
                            />
                          </label>
                          <label style={{ gap: "3px" }}>Status
                            <select
                              style={{ minHeight: "34px", padding: "4px 8px", fontSize: "13px" }}
                              value={editForm.semesters?.[semNum]?.status ?? ""}
                              onChange={(e) => {
                                setEditForm({
                                  ...editForm,
                                  semesters: {
                                    ...editForm.semesters,
                                    [semNum]: {
                                      ...(editForm.semesters?.[semNum] || {}),
                                      status: e.target.value
                                    }
                                  }
                                });
                              }}
                            >
                              <option value="">N/A</option>
                              <option value="Pass">Pass</option>
                              <option value="Re-Appear">Re-Appear</option>
                              <option value="Result Awaited">Result Awaited</option>
                              <option value="Detained">Detained</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {editError && <div className="error">{editError}</div>}
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: "15px", display: "grid", gap: "10px" }}>
                  <label>Reason for Editing (audit requirement)<input value={editReason} onChange={(e) => setEditReason(e.target.value)} required placeholder="e.g. Corrected name spelling and semesters percentages as per college record" /></label>
                  <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <button type="submit" className="button">Save Details</button>
                    <button type="button" className="soft" onClick={() => setIsEditing(false)}>Cancel</button>
                  </div>
                </div>
              </form>
            )}
          </section>
          
          {!isEditing && currentStudent.semesters && Object.keys(currentStudent.semesters).length > 0 && (
            <section className="student-panel">
              <div className="section-heading">
                <h3>Semester Results</h3>
                <p>Semester-wise percentage and status.</p>
              </div>
              <div className="student-detail-grid">
                {Object.entries(currentStudent.semesters).map(([semNum, semData]) => (
                  <div key={semNum} style={{ gridColumn: "span 1" }}>
                    <h4 style={{ margin: 0, marginBottom: 4, fontSize: 14 }}>Semester {semNum}</h4>
                    <p style={{ margin: 0 }}>
                      {semData.percentage != null ? `${semData.percentage}%` : "N/A"}
                      {semData.status && ` (${semData.status})`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="student-panel">
          <div className="section-heading drive-history-heading">
            <div>
              <h3>Drive History</h3>
              <p>Search company-wise drives and review uploaded round attendance.</p>
            </div>
            <label className="searchbox drive-history-search" aria-label="Search company in drive history">
              <Search size={18} />
              <input value={driveSearch} onChange={(event) => setDriveSearch(event.target.value)} placeholder="Search company or round" />
            </label>
          </div>
          {!summary.driveRows?.length ? <EmptyState message="No drive attendance uploaded yet" /> : (
            <div className="drive-history-list">
              {filteredDriveRows.map((row) => (
                <article key={row._id}>
                  <div className="drive-history-main">
                    <div>
                      <strong>{row.drive?.companyName || "Drive"}</strong>
                      <span>{row.drive?.jobRole || "Role not set"}{row.drive?.createdBy?.name ? ` - Uploaded by ${row.drive.createdBy.name}` : ""}</span>
                      {!!row.preparedByNames?.length && (
                        <span className="officer-line">Placement Officer: {row.preparedByNames.join(", ")}</span>
                      )}
                    </div>
                    <div className="drive-history-statuses">
                      <span className="status">{row.registrationStatus?.replaceAll("_", " ")}</span>
                      <span className={`status ${row.overallAttendanceStatus === "OVERALL_PRESENT" ? "approved" : row.overallAttendanceStatus === "OVERALL_ABSENT" ? "rejected" : ""}`}>{row.overallAttendanceStatus?.replaceAll("_", " ")}</span>
                    </div>
                  </div>
                  <div className="round-history-grid">
                    {row.roundHistory?.length ? row.roundHistory.map((round, index) => (
                      <div className="round-chip" key={`${round.roundName}-${index}`}>
                        <span>{round.roundName || `Round ${index + 1}`}</span>
                        <strong className={round.status === "PRESENT" || round.status === "QUALIFIED" ? "present" : round.status === "ABSENT" || round.status === "NOT_QUALIFIED" || round.status === "DISQUALIFIED" ? "absent" : ""}>{round.status?.replaceAll("_", " ") || "Pending"}</strong>
                      </div>
                    )) : <div className="round-chip empty-round"><span>No uploaded rounds</span><strong>Pending</strong></div>}
                  </div>
                  <p>{row.overallAttendanceReason || "No attendance reason recorded"}</p>
                </article>
              ))}
              {!filteredDriveRows.length && <EmptyState icon={Search} message="No matching company or round found" />}
            </div>
          )}
        </section>

        {!!restrictionEdits.length && (
          <section className="student-panel override-history-box">
            <div className="section-heading">
              <h3><RefreshCcw size={17} /> Manual Override History</h3>
              <p>HOD status changes recorded for this student.</p>
            </div>
            <div className="override-history-list">
              {restrictionEdits.map((edit, index) => (
                <div key={index} className="override-history-item">
                  <span>{new Date(edit.editedAt).toLocaleString()}</span>
                  <p>
                    Changed status to <strong>{edit.newValue}</strong> by <strong>{edit.editedBy?.name || edit.editedBy?.email || "System"}</strong>.
                  </p>
                  {edit.reason && <em>Reason: {edit.reason}</em>}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    </aside>
  );
}

function Mini({ label, value }) {
  return <div className="mini"><span>{label}</span><strong>{value}</strong></div>;
}

function ActivityTimeline({ items }) {
  if (!items.length) return <EmptyState message="No activity yet" />;
  return <div className="activity-list">{items.map((item, index) => <div key={item._id || index}><b>{item.action}</b><span>{item.actor?.name || "System"} - {new Date(item.createdAt).toLocaleString()}</span></div>)}</div>;
}

function EmptyState({ message, icon: Icon = Home }) {
  return <div className="empty-state"><Icon size={34} /><span>{message}</span></div>;
}

function ErrorState({ message }) {
  return <div className="notice error-notice">{message}</div>;
}

const placementSheetColumns = [
  ["ron", "RON", "text"],
  ["placementOfficer", "Placement Officer", "text"],
  ["companyCategory", "Company Category", "text"],
  ["leadBy", "Lead By", "text"],
  ["dateFloated", "Date of Floated", "date"],
  ["dateOfDrive", "Date of Drive", "date"],
  ["companyName", "Company Name", "text"],
  ["jobProfile", "Job Profile", "text"],
  ["packageText", "Package", "text"],
  ["branch", "Branch", "text"],
  ["mode", "Mode (On Campus/ Online/Off Campus)", "text"],
  ["batch", "Batch", "text"],
  ["totalEligible", "Total Eligible", "number"],
  ["totalRegistered", "Total Reg Count", "number"],
  ["dateSharedWithHr", "Date Shared With HR", "date"],
  ["dataShared", "Data Shared Yes / No", "text"],
  ["round1Date", "Round 1 Date", "date"],
  ["round2Date", "Round 2 (if Any) Date", "date"],
  ["shortlistedDate", "Shortlisted Date", "date"],
  ["finalSelectionDate", "Final Selection Date", "date"],
  ["selections", "No. of Selections", "number"],
  ["actualStatus", "Actual Status", "text"],
  ["resultSharedBackend", "Result to be Share With Backend Yes/ No", "text"],
  ["remarks", "Remarks", "text"]
];

function EditablePlacementSheet({ year, memberName, records, onReload, onClose, canEdit = false, canRequest = false }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [requestDraft, setRequestDraft] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const [newRecord, setNewRecord] = useState({ academicYear: year || "", companyName: "", jobProfile: "", packageText: "", companyCategory: "", dateFloated: "", dateOfDrive: "", branch: "", mode: "", batch: "", totalEligible: "", totalRegistered: "", selections: "", actualStatus: "", remarks: "" });

  useEffect(() => {
    setDrafts({});
    setMessage("");
    setRequestDraft(null);
    setRequestMessage("");
    setShowAddRow(false);
    setAddMessage("");
    setNewRecord({ academicYear: year || "", companyName: "", jobProfile: "", packageText: "", companyCategory: "", dateFloated: "", dateOfDrive: "", branch: "", mode: "", batch: "", totalEligible: "", totalRegistered: "", selections: "", actualStatus: "", remarks: "" });
  }, [year, memberName]);

  const normalizeSheetKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const rawDateValue = (record, key) => {
    const rawMap = {
      dateFloated: ["Date of Floated", "Floated Date", "Date Floated"],
      dateOfDrive: ["Date of Drive", "Drive Date"],
      dateSharedWithHr: ["Date Shared With HR"],
      round1Date: ["Round 1 Date", "Round 1"],
      round2Date: ["Round 2 (if Any) Date", "Round 2 Date"],
      shortlistedDate: ["Shortlisted Date"],
      finalSelectionDate: ["Final Selection Date", "Final Selection"]
    };
    const raw = record.raw || {};
    const targetKeys = (rawMap[key] || []).map(normalizeSheetKey);
    const found = Object.entries(raw).find(([rawKey, rawValue]) => targetKeys.includes(normalizeSheetKey(rawKey)) && rawValue !== undefined && rawValue !== null && rawValue !== "");
    return found ? String(found[1]) : "";
  };
  const dateValue = (value, record, key) => {
    const raw = rawDateValue(record, key);
    if (!value) return raw;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getFullYear() < 2000) return raw;
    return date.toISOString().slice(0, 10);
  };
  const fieldValue = (record, key, type) => drafts[record._id]?.[key] ?? (type === "date" ? dateValue(record[key], record, key) : (record[key] ?? ""));
  const updateDraft = (record, key, value) => {
    setDrafts(prev => ({ ...prev, [record._id]: { ...(prev[record._id] || {}), [key]: value } }));
  };
  const openRequest = (record) => {
    setRequestDraft({
      record,
      field: "actualStatus",
      requestedValue: String(record.actualStatus ?? ""),
      reason: ""
    });
    setRequestMessage("");
  };
  const submitRequest = async () => {
    if (!requestDraft?.record) return;
    if (!requestDraft.reason.trim()) {
      setRequestMessage("Please add a reason before sending the request.");
      return;
    }
    setRequestBusy(true);
    setRequestMessage("");
    try {
      await api(`/drives/planner/records/${requestDraft.record._id}/edit-request`, {
        method: "POST",
        body: JSON.stringify({
          reason: requestDraft.reason.trim(),
          field: requestDraft.field,
          currentValue: String(requestDraft.record[requestDraft.field] ?? ""),
          requestedValue: String(requestDraft.requestedValue ?? "")
        })
      });
      setRequestMessage("Request sent to Head successfully.");
      setTimeout(() => {
        setRequestDraft(null);
        setRequestMessage("");
      }, 1500);
    } catch (error) {
      setRequestMessage(error.message);
    } finally {
      setRequestBusy(false);
    }
  };
  const submitNewRecord = async (event) => {
    event.preventDefault();
    if (!newRecord.companyName.trim()) {
      setAddMessage("Company name is required.");
      return;
    }
    setAdding(true);
    setAddMessage("");
    try {
      await api("/drives/planner/records", { method: "POST", body: JSON.stringify({ ...newRecord, academicYear: newRecord.academicYear || year }) });
      setAddMessage("Row added successfully. It is now locked; use Request Change for any correction.");
      setNewRecord({ academicYear: year || "", companyName: "", jobProfile: "", packageText: "", companyCategory: "", dateFloated: "", dateOfDrive: "", branch: "", mode: "", batch: "", totalEligible: "", totalRegistered: "", selections: "", actualStatus: "", remarks: "" });
      await onReload?.();
    } catch (error) { setAddMessage(error.message); }
    finally { setAdding(false); }
  };
  const saveRecordOnEnter = (event, record) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveRecord(record);
  };
  const saveRecord = async (record) => {
    const changes = drafts[record._id];
    if (!changes) return;
    setSavingId(record._id);
    setMessage("");
    let clearMessageSoon = false;
    try {
      const result = await api(`/drives/planner/records/${record._id}`, { method: "PATCH", body: JSON.stringify(changes) });
      if (result?.blocked) {
        setMessage(result.message || "Google Sheet write-back was blocked. App data was not changed.");
        return;
      }
      setDrafts(prev => {
        const next = { ...prev };
        delete next[record._id];
        return next;
      });
      setMessage(`Saved ${record.companyName || "planner row"}`);
      clearMessageSoon = true;
      await onReload?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingId("");
      if (clearMessageSoon) setTimeout(() => setMessage(""), 2600);
    }
  };

  return (
    <div className="editable-planner placement-sheet-editor">
      <div className="editable-planner-header">
        <div>
          <h3>Placement Sheet for {year}</h3>
          <p>{records.length} rows linked to {memberName} by the Placement Officer or Lead By column.</p>
        </div>
        <div className="editable-planner-header-actions">
          {message && <span className="planner-msg">{message}</span>}
          {!canEdit && <button type="button" onClick={() => { setShowAddRow(value => !value); setAddMessage(""); }}><FileSpreadsheet size={16} /> {showAddRow ? "Close Add Form" : "Add New Row"}</button>}
          {onClose && <button type="button" className="soft editable-planner-close" onClick={onClose}><X size={16} /> Close Sheet</button>}
        </div>
      </div>
      {!canEdit && <div className="notice" style={{ marginBottom: "12px" }}>This sheet is read-only for placement officers. Use Request Change to send corrections to Head approval.</div>}
      {!canEdit && showAddRow && <form className="sheet-request-panel placement-add-row-panel" onSubmit={submitNewRecord}>
        <div><strong>Add a placement row</strong><p>Entries are added only to your own sheet. Once saved, they cannot be edited directly.</p></div>
        <div className="form-grid">
          <label>Academic year<input value={newRecord.academicYear} onChange={e => setNewRecord(prev => ({ ...prev, academicYear: e.target.value }))} placeholder="e.g. 2026-2027" required /></label>
          <label>Batch<input value={newRecord.batch} onChange={e => setNewRecord(prev => ({ ...prev, batch: e.target.value }))} placeholder="e.g. 2027" /></label>
          <label>Company name<input value={newRecord.companyName} onChange={e => setNewRecord(prev => ({ ...prev, companyName: e.target.value }))} required /></label>
          <label>Job profile<input value={newRecord.jobProfile} onChange={e => setNewRecord(prev => ({ ...prev, jobProfile: e.target.value }))} /></label>
          <label>Company category<input value={newRecord.companyCategory} onChange={e => setNewRecord(prev => ({ ...prev, companyCategory: e.target.value }))} /></label>
          <label>Package<input value={newRecord.packageText} onChange={e => setNewRecord(prev => ({ ...prev, packageText: e.target.value }))} placeholder="e.g. 6 LPA" /></label>
          <label>Date floated<input type="date" value={newRecord.dateFloated} onChange={e => setNewRecord(prev => ({ ...prev, dateFloated: e.target.value }))} /></label>
          <label>Date of drive<input type="date" value={newRecord.dateOfDrive} onChange={e => setNewRecord(prev => ({ ...prev, dateOfDrive: e.target.value }))} /></label>
          <label>Branch<input value={newRecord.branch} onChange={e => setNewRecord(prev => ({ ...prev, branch: e.target.value }))} /></label>
          <label>Mode<input value={newRecord.mode} onChange={e => setNewRecord(prev => ({ ...prev, mode: e.target.value }))} placeholder="On Campus / Online" /></label>
          <label>Total eligible<input type="number" min="0" value={newRecord.totalEligible} onChange={e => setNewRecord(prev => ({ ...prev, totalEligible: e.target.value }))} /></label>
          <label>Total registered<input type="number" min="0" value={newRecord.totalRegistered} onChange={e => setNewRecord(prev => ({ ...prev, totalRegistered: e.target.value }))} /></label>
          <label>Selections<input type="number" min="0" value={newRecord.selections} onChange={e => setNewRecord(prev => ({ ...prev, selections: e.target.value }))} /></label>
          <label>Current status<input value={newRecord.actualStatus} onChange={e => setNewRecord(prev => ({ ...prev, actualStatus: e.target.value }))} placeholder="Open / Closed / Selected" /></label>
          <label className="wide">Remarks<textarea rows="2" value={newRecord.remarks} onChange={e => setNewRecord(prev => ({ ...prev, remarks: e.target.value }))} /></label>
        </div>
        {addMessage && <div className="notice">{addMessage}</div>}
        <div className="sheet-request-actions"><button type="submit" disabled={adding}>{adding ? "Adding..." : "Add Locked Row"}</button></div>
      </form>}
      <div className="planner-grid-wrap placement-sheet-wrap">
        <table>
          <thead>
            <tr>
              {placementSheetColumns.map(([, label]) => <th key={label}>{label}</th>)}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr key={record._id}>
                {placementSheetColumns.map(([key, label, type]) => (
                  <td key={`${record._id}-${key}`} data-label={label}>
                    {canEdit ? (
                      <input
                        type={type === "date" ? "text" : type}
                        value={fieldValue(record, key, type)}
                        title={String(fieldValue(record, key, type) || "")}
                        placeholder={type === "date" ? "dd-mm-yyyy" : ""}
                        onChange={event => updateDraft(record, key, event.target.value)}
                        onKeyDown={event => saveRecordOnEnter(event, record)}
                      />
                    ) : (
                      <span className="readonly-sheet-cell">{fieldValue(record, key, type) || "-"}</span>
                    )}
                  </td>
                ))}
                <td className="placement-sheet-actions">
                  {canEdit ? (
                    <button onClick={() => saveRecord(record)} disabled={savingId === record._id || !drafts[record._id]}>
                      <Save size={15} /> {savingId === record._id ? "Saving" : "Save"}
                    </button>
                  ) : (
                    <button type="button" className="soft" onClick={() => openRequest(record)}>
                      <FileSearch size={15} /> Request Change
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td colSpan={placementSheetColumns.length + 1}>
                  No planner rows found for {memberName}. Check that the sheet's Placement Officer or Lead By name exactly matches this manager.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!canEdit && requestDraft && (
        <div className="sheet-request-panel placement-change-request-panel">
          <div>
            <strong>Request change for {requestDraft.record.companyName || "this row"}</strong>
            <p>Placement officers can’t edit directly. Submit a correction request to Head approval.</p>
          </div>
          <label>Field
            <select value={requestDraft.field} onChange={(event) => setRequestDraft(prev => ({ ...prev, field: event.target.value }))}>
              {placementSheetColumns.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Requested value
            <input value={requestDraft.requestedValue} onChange={(event) => setRequestDraft(prev => ({ ...prev, requestedValue: event.target.value }))} />
          </label>
          <label>Reason
            <textarea rows="3" value={requestDraft.reason} onChange={(event) => setRequestDraft(prev => ({ ...prev, reason: event.target.value }))} />
          </label>
          {requestMessage && <div className="notice">{requestMessage}</div>}
          <div className="sheet-request-actions">
            <button type="button" onClick={submitRequest} disabled={requestBusy}>{requestBusy ? "Sending..." : "Send Request"}</button>
            <button type="button" className="soft" onClick={() => setRequestDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableTargetPlanner({ year, memberName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  
  const quarters = ["Jul-Sep", "Oct-Dec", "Jan-Mar", "April-Jun"];
  const defaultQuarter = {
    targetAllotted: { zsd: 0, sd: 0, aPlus: 0, a: 0 },
    targetAchieved: { zsd: 0, sd: 0, aPlus: 0, a: 0 },
    floated: 0, closed: 0, delayInClosure: 0, sales: 0, core: 0
  };

  useEffect(() => {
    if (!year || !memberName) return;
    setLoading(true);
    api(`/drives/planner/targets?academicYear=${encodeURIComponent(year)}`)
      .then(res => {
        const targetData = res.targets.find(t => t.outreachMember === memberName);
        setData(targetData?.quarters || {});
        setLoading(false);
      })
      .catch(err => {
        setMessage(err.message);
        setLoading(false);
      });
  }, [year, memberName]);

  const handleChange = (quarter, section, field, value) => {
    setData(prev => {
      const newData = { ...prev };
      if (!newData[quarter]) newData[quarter] = JSON.parse(JSON.stringify(defaultQuarter));
      if (section) {
        newData[quarter][section][field] = Number(value);
      } else {
        newData[quarter][field] = Number(value);
      }
      return newData;
    });
  };

  const handleSave = async (quarter) => {
    setSaving(true);
    setMessage("");
    try {
      const qData = data[quarter] || defaultQuarter;
      await api(`/drives/planner/targets`, {
        method: "POST",
        body: JSON.stringify({ academicYear: year, memberName, quarter, targetData: qData })
      });
      setMessage(`Saved ${quarter} targets`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) return <div>Loading planner grid...</div>;

  const getTotal = (section, field) => quarters.reduce((sum, q) => sum + ((data[q]?.[section]?.[field]) || 0), 0);
  const getFlatTotal = (field) => quarters.reduce((sum, q) => sum + ((data[q]?.[field]) || 0), 0);
  
  const totalAllotted = ["zsd", "sd", "aPlus", "a"].reduce((sum, f) => sum + getTotal("targetAllotted", f), 0);

  return (
    <div className="editable-planner">
      <div className="editable-planner-header">
        <h3>Target Planner for year {year}</h3>
        <p>Annual Alloted Target of {totalAllotted} companies to: {memberName}</p>
        {message && <span className="planner-msg">{message}</span>}
      </div>
      
      <div className="planner-grid-wrap">
        <table>
          <thead>
            <tr>
              <th>Month wise</th>
              <th>Target Alloted</th>
              <th>ZSD Companies<br/>(&gt;=15 LPA)</th>
              <th>SD Companies<br/>(Between 10-15 LPA)</th>
              <th>A+<br/>(Between 5-10LPA)</th>
              <th>A<br/>(Between 3-5LPA)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map(q => {
              const qd = data[q] || defaultQuarter;
              const qt = Object.values(qd.targetAllotted).reduce((a,b)=>a+b, 0);
              return (
                <tr key={`allot-${q}`}>
                  <td>{q}</td>
                  <td>{qt}</td>
                  <td><input type="number" value={qd.targetAllotted.zsd} onChange={e => handleChange(q, 'targetAllotted', 'zsd', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAllotted.sd} onChange={e => handleChange(q, 'targetAllotted', 'sd', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAllotted.aPlus} onChange={e => handleChange(q, 'targetAllotted', 'aPlus', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAllotted.a} onChange={e => handleChange(q, 'targetAllotted', 'a', e.target.value)} /></td>
                  <td><button onClick={() => handleSave(q)} disabled={saving}>Save</button></td>
                </tr>
              )
            })}
            <tr className="grand-total">
              <td>Grand Total</td>
              <td>{totalAllotted}</td>
              <td>{getTotal('targetAllotted', 'zsd')}</td>
              <td>{getTotal('targetAllotted', 'sd')}</td>
              <td>{getTotal('targetAllotted', 'aPlus')}</td>
              <td>{getTotal('targetAllotted', 'a')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Month wise</th>
              <th>Target Achieved</th>
              <th>ZSD Companies<br/>(&gt;=15 LPA)</th>
              <th>SD Companies<br/>(Between 10-15 LPA)</th>
              <th>A+<br/>(Between 5-10LPA)</th>
              <th>A<br/>(Between 3-5LPA)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map(q => {
              const qd = data[q] || defaultQuarter;
              const qt = Object.values(qd.targetAchieved).reduce((a,b)=>a+b, 0);
              return (
                <tr key={`achieve-${q}`}>
                  <td>{q}</td>
                  <td>{qt}</td>
                  <td><input type="number" value={qd.targetAchieved.zsd} onChange={e => handleChange(q, 'targetAchieved', 'zsd', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAchieved.sd} onChange={e => handleChange(q, 'targetAchieved', 'sd', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAchieved.aPlus} onChange={e => handleChange(q, 'targetAchieved', 'aPlus', e.target.value)} /></td>
                  <td><input type="number" value={qd.targetAchieved.a} onChange={e => handleChange(q, 'targetAchieved', 'a', e.target.value)} /></td>
                  <td><button onClick={() => handleSave(q)} disabled={saving}>Save</button></td>
                </tr>
              )
            })}
            <tr className="grand-total">
              <td>Grand Total</td>
              <td>{["zsd", "sd", "aPlus", "a"].reduce((sum, f) => sum + getTotal("targetAchieved", f), 0)}</td>
              <td>{getTotal('targetAchieved', 'zsd')}</td>
              <td>{getTotal('targetAchieved', 'sd')}</td>
              <td>{getTotal('targetAchieved', 'aPlus')}</td>
              <td>{getTotal('targetAchieved', 'a')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Month wise</th>
              <th>Floated Companies</th>
              <th>Closed Companies</th>
              <th>Delay in Closure</th>
              <th>Sales</th>
              <th>Core</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map(q => {
              const qd = data[q] || defaultQuarter;
              return (
                <tr key={`stats-${q}`}>
                  <td>{q}</td>
                  <td><input type="number" value={qd.floated} onChange={e => handleChange(q, null, 'floated', e.target.value)} /></td>
                  <td><input type="number" value={qd.closed} onChange={e => handleChange(q, null, 'closed', e.target.value)} /></td>
                  <td><input type="number" value={qd.delayInClosure} onChange={e => handleChange(q, null, 'delayInClosure', e.target.value)} /></td>
                  <td><input type="number" value={qd.sales} onChange={e => handleChange(q, null, 'sales', e.target.value)} /></td>
                  <td><input type="number" value={qd.core} onChange={e => handleChange(q, null, 'core', e.target.value)} /></td>
                  <td><button onClick={() => handleSave(q)} disabled={saving}>Save</button></td>
                </tr>
              )
            })}
            <tr className="grand-total">
              <td>Grand Total</td>
              <td>{getFlatTotal('floated')}</td>
              <td>{getFlatTotal('closed')}</td>
              <td>{getFlatTotal('delayInClosure')}</td>
              <td>{getFlatTotal('sales')}</td>
              <td>{getFlatTotal('core')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
