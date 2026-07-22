import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, Bell, BriefcaseBusiness, CheckCircle2, ChevronLeft, ChevronRight, Database, Eye, FileSearch, FileSpreadsheet,
  FileDown, Gauge, GraduationCap, Home, LayoutDashboard, ListChecks, LogOut, Percent, RefreshCcw, Save, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserCog, UserPlus, Users, UsersRound, X
} from "lucide-react";
import { api, API_URL } from "../api.js";
import { assetUrl } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const hodNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "eligibility", label: "Eligibility Lists", icon: ListChecks },
  { id: "drives", label: "Drives & Reports", icon: BriefcaseBusiness },
  { id: "managers", label: "Managers", icon: UsersRound },
  { id: "records", label: "Records", icon: Database },
  { id: "profile", label: "Profile", icon: UserCog }
];

const makerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "eligibility", label: "Eligibility Lists", icon: ListChecks },
  { id: "master-data", label: "Master Data", icon: Database },
  { id: "drives", label: "My Drives", icon: BriefcaseBusiness },
  { id: "profile", label: "Profile", icon: UserCog }
];

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
  driveDate: "Drive Date",
  batch: "Batch",
  course: "Course",
  program: "Program",
  semester: "Semester"
};

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
  const [active, setActive] = useState("dashboard");
  const [driveInitialTab, setDriveInitialTab] = useState("drives");
  const [selectedEligibilityList, setSelectedEligibilityList] = useState(null);
  const isHod = user.role === "HOD";
  const nav = isHod ? hodNav : makerNav;

  return (
    <main className="app-shell">
      <RoleSidebar nav={nav} active={active} setActive={setActive} user={user} logout={logout} />
      <section className="workspace">
        {active === "dashboard" && <DashboardHome user={user} setActive={setActive} setDriveInitialTab={setDriveInitialTab} />}
        {active === "managers" && isHod && <ManagersPage />}
        {active === "records" && isHod && <RecordsPage />}
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

function RoleSidebar({ nav, active, setActive, user, logout }) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar pro desktop-sidebar">
        <div className="brand-lockup compact">
          <img src="/logo.png" alt="Eligibility Flow logo" />
          <div>
            <h1>Eligibility Flow</h1>
            <p>{user.role === "HOD" ? "Administration" : "List Maker"}</p>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => setActive(item.id)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="ghost signout" onClick={logout} title="Sign out"><LogOut size={17} /> Sign Out</button>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`mobile-nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => setActive(item.id)}
              title={item.label}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button className="mobile-nav-item" onClick={logout} title="Sign Out">
          <LogOut size={22} />
          <span>Logout</span>
        </button>
      </nav>
    </>
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  const { user } = useAuth();
  const avatarSrc = assetUrl(user?.profileImage);
  const initials = (user?.name || user?.email || "U").slice(0, 1).toUpperCase();
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {subtitle && <p className="subtle">{subtitle}</p>}
      </div>
      <div className="topbar-actions">
        {children}
        <div className="header-profile" title={user?.name || "Profile"}>
          {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{initials}</span>}
        </div>
      </div>
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
    const token = localStorage.getItem("eligibleFlowToken");
    const response = await fetch(`${API_URL}/records/students/export?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Unable to download report");
    }
    const blob = await response.blob();
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
                  <strong>Drives & Reports</strong>
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
  let cursor = 0;
  const chartFill = total
    ? `conic-gradient(${data.map((item, index) => {
      const size = ((Number(item.value) || 0) / total) * 100;
      const segment = `${colors[index % colors.length]} ${cursor}% ${cursor + size}%`;
      cursor += size;
      return segment;
    }).join(", ")})`
    : "conic-gradient(#dbe5eb 0 100%)";

  return (
    <>
      <PageHeader eyebrow="Analytics" title={title}>
        <button className="soft" onClick={close}><ChevronLeft size={17} /> Back to Dashboard</button>
      </PageHeader>
      <section className="panel analytics-detail">
        <div className="analytics-hero">
          <div className="donut-chart large" style={{ "--chart-fill": chartFill }}>
            <span>{total}</span>
            <small>Total</small>
          </div>
          <div className="analytics-summary">
            <h3>{title}</h3>
            <p className="subtle">Detailed graphical view with totals, percentage split, and ranked data.</p>
            <div className="analytics-kpis">
              <Mini label="Total Records" value={total} />
              <Mini label="Groups" value={data.length} />
              <Mini label="Highest Count" value={max} />
            </div>
          </div>
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
          <h3><Search size={19} /> Student Search & HOD Reports</h3>
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
  const [form, setForm] = useState({ name: "", email: "", personalEmail: "", password: "" });
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setManagers(await api("/users"));
  }
  useEffect(() => { load(); }, []);

  function resetManagerForm() {
    setForm({ name: "", email: "", personalEmail: "", password: "" });
    setEditingId("");
  }

  function editManager(manager) {
    setEditingId(manager.id);
    setForm({
      name: manager.name || "",
      email: manager.email || "",
      personalEmail: manager.personalEmail || "",
      password: ""
    });
    setMessage("");
  }

  async function saveManager(event) {
    event.preventDefault();
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    await api(editingId ? `/users/${editingId}` : "/users", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    const wasEditing = Boolean(editingId);
    resetManagerForm();
    setMessage(wasEditing ? "Manager account updated" : "Manager account created as LIST_MAKER");
    load();
  }

  async function toggleManager(manager) {
    await api(`/users/${manager.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active: !manager.active })
    });
    setMessage(`${manager.name} is now ${manager.active ? "inactive" : "active"}`);
    load();
  }

  async function deleteManager(manager) {
    const confirmed = window.confirm(`Delete ${manager.name}'s List Maker account? This removes login access but keeps historical records.`);
    if (!confirmed) return;

    await api(`/users/${manager.id}`, { method: "DELETE" });
    if (editingId === manager.id) resetManagerForm();
    setMessage(`${manager.name}'s account was deleted`);
    load();
  }

  return (
    <>
      <PageHeader eyebrow="Manager Administration" title="Managers" subtitle="Create and manage List Maker accounts only">
        <button><UserPlus size={17} /> Create Manager</button>
      </PageHeader>
      {message && <div className="notice">{message}</div>}
      <section className="panel">
        <h3>{editingId ? "Edit Manager" : "Create Manager"}</h3>
        <form className="manager-simple-form" onSubmit={saveManager}>
          {["name", "email", "personalEmail"].map((field) => (
            <label key={field}>{labelFor(field)}<input type={field.includes("Email") || field === "email" ? "email" : "text"} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={["name", "email"].includes(field)} /></label>
          ))}
          <label>{editingId ? "New Password (optional)" : "Initial Password"}<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingId} minLength={editingId && !form.password ? undefined : 8} /></label>
          <button><Save size={17} /> {editingId ? "Update List Maker" : "Save List Maker"}</button>
          {editingId && <button className="soft" type="button" onClick={resetManagerForm}><X size={17} /> Cancel</button>}
        </form>
      </section>

      <section className="panel" style={{ marginTop: "22px", overflow: "visible" }}>
        <h3 style={{ margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
          <UsersRound size={18} /> Registered List Makers
        </h3>
        <DataTable
          className="managers-table"
          columns={["Name", "Official Email", "Personal Email", "Status", "Last Login", "Created", "Actions"]}
          rows={managers.map((m) => [
            <div key={m.id} className="manager-name-cell">
              <div className="header-profile manager-avatar" title={m.name}>
                {m.profileImage ? <img src={assetUrl(m.profileImage)} alt="" /> : <span style={{ fontSize: "12px" }}>{m.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <strong>{m.name}</strong>
            </div>,
            m.email,
            m.personalEmail || "-",
            <span key={`${m.id}-status`} className={`status ${m.active ? "approved" : "rejected"}`}>{m.active ? "Active" : "Inactive"}</span>,
            m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "-",
            new Date(m.createdAt).toLocaleDateString(),
            <div key={`${m.id}-actions`} className="manager-actions">
              <button className="soft manager-action-btn" onClick={() => editManager(m)}><Settings2 size={14} /> Edit</button>
              <button className={`manager-action-btn ${m.active ? "soft danger-action" : "soft"}`} onClick={() => toggleManager(m)}>{m.active ? "Deactivate" : "Activate"}</button>
              <button className="soft danger-action manager-action-btn" onClick={() => deleteManager(m)}><Trash2 size={14} /> Delete</button>
            </div>
          ])}
        />
      </section>
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

function DriveWisePage({ user, initialTab = "drives" }) {
  const [drives, setDrives] = useState([]);
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

  const isMaker = user.role === "LIST_MAKER";

  const filteredDrives = drives.filter((drive) => {
    const text = [drive.companyName, drive.jobRole, drive.packageCtc, drive.driveType].join(" ").toLowerCase();
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
      setDrives(await api("/drives"));
      setRequests(await api("/drives/access-requests/list"));
      if (user.role === "HOD") {
        setStuckOff(await api("/drives/reports/stuck-off"));
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

  return (
    <>
      <PageHeader 
        eyebrow="Drive Workflow" 
        title={isMaker ? "Upload Drive Sheet" : "Drives & Reports"} 
        subtitle={isMaker ? "Upload one attendance sheet; drives are created automatically from the Company column" : "Manage drives, approvals, and view analytics reports"} 
      />

      {!isMaker && (
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
        </>
      )}

      {/* RENDER DRIVES TAB */}
      {(isMaker || activeTab === "drives") && (
        <>
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
          <section className="drive-grid">
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
            {!drives.length && <EmptyState message="No drives created yet" />}
            {!!drives.length && !filteredDrives.length && <EmptyState icon={Search} message="No matching drive found" />}
          </section>
          {user.role === "HOD" && <StuckOffReport items={stuckOff} />}
        </>
      )}

      {/* RENDER HOD REPORTS TAB */}
      {!isMaker && activeTab === "reports" && (
        <section className="panel reports-panel" style={{ padding: "20px", display: "grid", gap: "24px" }}>
          <div className="reports-heading-row">
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}><BarChart3 size={22} /> Attendance & Selection Representation of Company Processes</h3>
              <p className="subtle">Comprehensive statistics of present/absent ratios, total eligible students, registered students, and student selections by company drives.</p>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            {displayReports.map((rep) => {
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            <BreakdownCard title="Department Wise" rows={reportOptions.byDepartment || []} labelKey="department" />
            <BreakdownCard title="Batch Wise" rows={reportOptions.byBatch || []} labelKey="batch" />
            <BreakdownCard title="Stream Wise" rows={reportOptions.byProgram || []} labelKey="program" />
          </div>

          <ReportBreakdownTables
            departmentRows={reportOptions.byDepartment || []}
            batchRows={reportOptions.byBatch || []}
            programRows={reportOptions.byProgram || []}
          />

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
            <h3 style={{ margin: 0 }}>List Maker Access Requests</h3>
            <p className="subtle">Review and manage sheet edit approvals and re-upload permissions submitted by list makers.</p>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            {requests.filter(r => r.status === "PENDING").map((req) => (
              <div key={req._id} className="request-card" style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "16px", display: "grid", gap: "12px", textAlign: "left", background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                  <div style={{ background: "var(--light-bg)", borderRadius: "6px", padding: "12px", border: "1px solid var(--line)" }}>
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
                    placeholder="Enter HOD remarks/feedback (optional)..." 
                    value={decisionNotes[req._id] || ""} 
                    onChange={(e) => setDecisionNotes({ ...decisionNotes, [req._id]: e.target.value })}
                    rows={2}
                    style={{ width: "100%", fontSize: "13px", padding: "8px" }}
                  />
                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
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
                    <th style={{ padding: "8px", textAlign: "left" }}>HOD Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.filter(r => r.status !== "PENDING").map((req) => (
                    <tr key={req._id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px", textAlign: "left" }}>{new Date(req.approvedAt || req.updatedAt).toLocaleString()}</td>
                      <td style={{ padding: "8px", textAlign: "left" }}>{req.requester?.name}</td>
                      <td style={{ padding: "8px", textAlign: "left" }}>{req.drive?.companyName}</td>
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
                      <td style={{ padding: "8px", textAlign: "left" }}>{req.requestReason}</td>
                      <td style={{ padding: "8px", textAlign: "left", color: "var(--muted)" }}>{req.remarks || "-"}</td>
                    </tr>
                  ))}
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

function ConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm, onCancel, onDone, onError }) {
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
    <div className="app-dialog-overlay">
      <div className="app-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="app-dialog-actions">
          <button className="soft" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="danger-action" type="button" onClick={runConfirm} disabled={busy}>{busy ? "Working..." : confirmLabel}</button>
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

function ReportBreakdownTables({ departmentRows, batchRows, programRows }) {
  const sections = [
    { title: "Department Wise Report", rows: departmentRows, keyName: "department" },
    { title: "Batch Wise Report", rows: batchRows, keyName: "batch" },
    { title: "Stream Wise Report", rows: programRows, keyName: "program" }
  ];

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
        body: JSON.stringify({ driveId: drive._id, type: "REUPLOAD_SHEET", reason: "List Maker requested permission to re-upload the attendance sheet." })
      });
      setCardMessage("Re-upload request sent to HOD.");
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
              Re-upload Pending HOD Approval
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
      const normalizedText = result.normalization?.normalized ? ` Cleaned ${result.normalization.blockCount} block(s) into an aligned sheet.` : "";
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
      if (submitPath === "/drives/attendance-rows" && file) {
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
              <strong>Auto-aligned messy sheet</strong>
              <span>{preview.normalization.blockCount} block(s) detected</span>
              <span>{preview.normalization.cleanRows} clean row(s)</span>
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
      setMessage("Edit approval request submitted to HOD successfully!");
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
    const token = localStorage.getItem("eligibleFlowToken") || localStorage.getItem("token");
    const params = new URLSearchParams({
      format: downloadFormat,
      columns: selectedHeaders.join(",")
    });
    const response = await fetch(`${API_URL}/drives/sheets/${sheetId}/download?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      setMessage("Unable to download this sheet");
      return;
    }
    const blob = await response.blob();
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

  return createPortal(
    <div className="sheet-preview-modal-overlay">
      <div className="sheet-preview-modal">
        <div className="sheet-preview-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {requireApproval && <p className="subtle" style={{ margin: "4px 0 0 0", fontSize: "12px" }}>Edit cells and click 'Request HOD Approval' when finished.</p>}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {requireApproval && hasChanges && !showRequestForm && (
              <button onClick={() => setShowRequestForm(true)} style={{ background: "var(--orange)", color: "white" }}>Request HOD Approval</button>
            )}
            <button className="soft" onClick={onClose}><X size={17} /> Close</button>
          </div>
        </div>

        {showRequestForm && (
          <div className="request-reason-banner" style={{ background: "var(--orange-bg)", padding: "14px", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--orange)", fontSize: "14px" }}>HOD Approval Required for Edits</h4>
            <p style={{ margin: "0 0 10px 0", fontSize: "12px" }}>Please explain why these modifications are needed. Edits will be applied once approved.</p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input 
                type="text" 
                placeholder="Reason for changes (e.g. Corrected roll number attendance)..." 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                style={{ flex: 1, padding: "8px", fontSize: "13px" }}
              />
              <button onClick={submitEditRequest} disabled={busy || !reason.trim()}>{busy ? "Submitting..." : "Submit to HOD"}</button>
              <button className="soft" onClick={() => setShowRequestForm(false)}>Cancel</button>
            </div>
            {message && <p style={{ margin: "6px 0 0 0", fontSize: "12px", fontWeight: "bold" }}>{message}</p>}
          </div>
        )}

        {message && !showRequestForm && (
          <div className="notice" style={{ margin: "10px" }}>{message}</div>
        )}

        <div className="sheet-preview-modal-body">
          {sheetId && (
            <div className="sheet-download-panel">
              <div>
                <strong>Download Sheet</strong>
                <p className="subtle">Choose format and columns for the downloaded file.</p>
              </div>
              <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value)}>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
                <option value="json">JSON</option>
              </select>
              <div className="sheet-column-picker">
                <button className="soft" type="button" onClick={() => setSelectedHeaders(headers)}>All Columns</button>
                <button className="soft" type="button" onClick={() => setSelectedHeaders([])}>Clear</button>
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

function ProfilePage({ user }) {
  const { updateProfile, uploadProfilePhoto } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", personalEmail: user.personalEmail || "", phone: user.phone || "", profileImage: user.profileImage || "" });
  const [message, setMessage] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    const updated = await updateProfile(form);
    setForm({ name: updated.name || "", email: updated.email || "", personalEmail: updated.personalEmail || "", phone: updated.phone || "", profileImage: updated.profileImage || "" });
    setMessage("Profile updated successfully");
  }

  async function changePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const updated = await uploadProfilePhoto(file);
    setForm((current) => ({ ...current, profileImage: updated.profileImage || "" }));
    setMessage("Profile photo uploaded successfully");
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" subtitle="Security and institutional profile details" />
      {message && <div className="notice">{message}</div>}
      <section className="panel profile-card">
        <div className="profile-photo-wrap">
          <div className="profile-photo-frame">
            <img className="profile-photo" src={assetUrl(form.profileImage) || "/logo.png"} alt="Profile" />
          </div>
          <div className="profile-summary">
            <div>
              <h3>{form.name || "User Profile"}</h3>
              <span>{user.role === "HOD" ? "Administration Profile" : "List Maker Profile"}</span>
            </div>
            <p>{form.email}</p>
          </div>
          <label className="upload-photo-button">Upload Photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changePhoto} /></label>
        </div>
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-form-heading">
            <h3>Profile Information</h3>
            <p>Keep your account details updated for dashboard and report access.</p>
          </div>
          <label className="full-span">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Official Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Personal Email<input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></label>
          <label>Phone Number<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add phone number" /></label>
          <button><Save size={17} /> Save Profile</button>
        </form>
      </section>
    </>
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
    const token = localStorage.getItem("eligibleFlowToken");
    const response = await fetch(`${API_URL}/eligibility/${initialList._id}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${list.name.replace(/[^a-z0-9]/gi, "_")}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
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
        <button className="soft" onClick={exportList}><FileDown size={17} /> Export Excel</button>
        {!isHod && list.status === "DRAFT" && <button onClick={finalizeList} disabled={loading}><Save size={17} /> Finalize List</button>}
      </PageHeader>
      {message && <div className={message.toLowerCase().includes("success") ? "notice" : "notice error"}>{message}</div>}
      
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
  return (
    <section className="panel stuck-report">
      <h3>Struck Off Risk Report</h3>
      <p className="subtle">Not registered means overall absent for that drive. If a registered student is present in any one process, the drive counts as overall present. Students absent in 2 or more drives are shown here for HOD review.</p>
      {!items.length ? <EmptyState message="No Struck Off risk students yet" /> : (
        <div className="report-list">
          {items.map((item) => (
            <article key={item.student?._id || item.student?.studentId}>
              <div>
                <h4>{item.student?.name || "Unknown Student"}</h4>
                <p>{item.student?.rollNo || item.student?.enrollmentNo || "-"} - {item.student?.department || "-"} - {item.student?.batch || "-"}</p>
              </div>
              <strong>{item.absentDriveCount} absent drives</strong>
              <span>{item.reason}</span>
              <ul>
                {item.drives.map((drive, index) => <li key={index}>{drive.companyName || "Drive"}: {drive.reason}</li>)}
              </ul>
            </article>
          ))}
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
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
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
              if (restrictionEdits.length > 0) {
                return (
                  <div className="override-history-box" style={{ marginTop: "15px", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", background: "#f8fafc" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "var(--muted)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "800", textTransform: "uppercase" }}>
                      <RefreshCcw size={14} /> Manual Override History
                    </h4>
                    <div style={{ display: "grid", gap: "8px", textAlign: "left", fontSize: "12px" }}>
                      {restrictionEdits.map((edit, index) => (
                        <div key={index} style={{ padding: "6px 8px", background: "white", border: "1px solid var(--line)", borderRadius: "6px" }}>
                          <span style={{ color: "var(--muted)" }}>{new Date(edit.editedAt).toLocaleString()}</span> — 
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
                      <span>{row.drive?.jobRole || "Role not set"}{row.drive?.createdBy?.name ? ` • Uploaded by ${row.drive.createdBy.name}` : ""}</span>
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
                        {round.notes && <small>{round.notes}</small>}
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

        <section className="student-panel">
          <div className="section-heading">
            <h3>Additional Information</h3>
            <p>Unmapped sheet fields preserved for review.</p>
          </div>
          <pre>{JSON.stringify(currentStudent.customFields || {}, null, 2)}</pre>
        </section>
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
