import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Database, Eye, FileSearch, FileSpreadsheet,
  FileDown, Gauge, GraduationCap, Home, LayoutDashboard, LogOut, RefreshCcw, Save, Search, Settings2, ShieldCheck, UserCog, UserPlus, UsersRound
} from "lucide-react";
import { api, API_URL } from "../api.js";
import { assetUrl } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const hodNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "managers", label: "Managers", icon: UsersRound },
  { id: "records", label: "Records", icon: Database },
  { id: "profile", label: "Profile", icon: UserCog }
];

const makerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
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

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState("dashboard");
  const isHod = user.role === "HOD";
  const nav = isHod ? hodNav : makerNav;

  return (
    <main className="app-shell">
      <RoleSidebar nav={nav} active={active} setActive={setActive} user={user} logout={logout} />
      <section className="workspace">
        {active === "dashboard" && <DashboardHome user={user} setActive={setActive} />}
        {active === "managers" && isHod && <ManagersPage />}
        {active === "records" && isHod && <RecordsPage />}
        {active === "drives" && !isHod && <DriveWisePage user={user} />}
        {active === "profile" && <ProfilePage user={user} />}
      </section>
    </main>
  );
}

function RoleSidebar({ nav, active, setActive, user, logout }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`sidebar pro ${collapsed ? "collapsed" : ""}`}>
      <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <div className="brand-lockup compact">
        <img src="/logo.png" alt="Eligibility Flow logo" />
        {!collapsed && (
          <div>
            <h1>Eligibility Flow</h1>
            <p>{user.role === "HOD" ? "Administration" : "List Maker"}</p>
          </div>
        )}
      </div>
      <nav>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => setActive(item.id)} title={item.label}>
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <button className="ghost signout" onClick={logout} title="Sign out"><LogOut size={17} /> {!collapsed && "Sign Out"}</button>
    </aside>
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

function DashboardHome({ user, setActive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [students, setStudents] = useState({ items: [], total: 0 });
  const [studentError, setStudentError] = useState("");
  const [studentFilters, setStudentFilters] = useState({ search: "", department: "", course: "", program: "", batch: "", semester: "" });
  const [selected, setSelected] = useState(null);
  const [chartDetail, setChartDetail] = useState(null);

  async function load() {
    setError("");
    try {
      setData(await api("/dashboard/summary"));
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
    setSelected((current) => ({
      ...current,
      student: updated,
      driveSummary: {
        ...(current.driveSummary || {}),
        stuckOffStatus: updated.driveRestriction?.status || "CLEAR",
        stuckOffReason: updated.driveRestriction?.reason || "",
        stuckOffUpdatedAt: updated.driveRestriction?.updatedAt || null
      }
    }));
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

  return (
    <>
      <PageHeader
        eyebrow={isHod ? `Welcome back, ${profileName}` : "Drive Workspace"}
        title="Dashboard"
        subtitle={isHod ? "" : "Drive workspace and eligibility workflow"}
      >
        <button className="icon-button soft" title="Notifications"><Bell size={18} /></button>
        <button onClick={load}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      {error && <ErrorState message={error} />}
      <section className="session-strip">
        <CalendarDays size={20} />
        <span>Current academic session: <strong>2026-27</strong></span>
      </section>
      <section className="metrics wide">
        <StatCard icon={FileSpreadsheet} label="Total Student Records" value={stats.totalStudents || 0} support="All synced master records" onClick={() => setActive("records")} />
        <StatCard icon={CheckCircle2} label="Total Eligible Students" value={stats.eligibleStudents || 0} support="Across all criteria" />
        <StatCard icon={ShieldCheck} label="Registered Students" value={stats.registeredStudents || 0} support="Drive registrations" />
        <StatCard icon={Gauge} label="Non-Registered Students" value={stats.nonRegisteredStudents || 0} support="Pending registration" />
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

function StatCard({ icon: Icon, label, value, support, onClick }) {
  return (
    <button className="metric stat-card" onClick={onClick} type="button">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{Number(value).toLocaleString()}</strong>
      <small>{support}</small>
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
  const [message, setMessage] = useState("");

  async function load() {
    setManagers(await api("/users"));
  }
  useEffect(() => { load(); }, []);

  async function createManager(event) {
    event.preventDefault();
    await api("/users", {
      method: "POST",
      body: JSON.stringify(form)
    });
    setForm({ name: "", email: "", personalEmail: "", password: "" });
    setMessage("Manager account created as LIST_MAKER");
    load();
  }

  return (
    <>
      <PageHeader eyebrow="Manager Administration" title="Managers" subtitle="Create and manage List Maker accounts only">
        <button><UserPlus size={17} /> Create Manager</button>
      </PageHeader>
      {message && <div className="notice">{message}</div>}
      <section className="panel">
        <h3>Create Manager</h3>
        <form className="manager-simple-form" onSubmit={createManager}>
          {["name", "email", "personalEmail"].map((field) => (
            <label key={field}>{labelFor(field)}<input type={field.includes("Email") || field === "email" ? "email" : "text"} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={["name", "email"].includes(field)} /></label>
          ))}
          <label>Initial Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></label>
          <button><UserPlus size={17} /> Save List Maker</button>
        </form>
      </section>
      <DataTable
        columns={["Name", "Official Email", "Personal Email", "Status", "Last Login", "Created"]}
        rows={managers.map((m) => [m.name, m.email, m.personalEmail || "-", m.active ? "Active" : "Inactive", m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "-", new Date(m.createdAt).toLocaleDateString()])}
      />
    </>
  );
}

function RecordsPage() {
  const [connection, setConnection] = useState(null);
  const [logs, setLogs] = useState([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [students, setStudents] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ search: "", batch: "", department: "", course: "", program: "", semester: "", page: 1, limit: 50 });
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString(), [filters]);
  const sheetColumns = headers.length || Object.keys(connection?.columnMapping || {}).length || 0;
  const connectionColumns = connection ? sheetColumns + 1 : 0;
  const lastSync = connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : "-";

  async function loadConnection() {
    const data = await api("/spreadsheets/connection");
    setConnection(data.connection);
    if (data.connection?.sheetUrl) setSheetUrl(data.connection.sheetUrl);
    setLogs(data.logs || []);
  }
  async function loadStudents() {
    setStudents(await api(`/records/students?${query}`));
  }
  useEffect(() => { loadConnection(); }, []);
  useEffect(() => { loadStudents(); }, [query]);

  async function testSheet() {
    const data = await api("/spreadsheets/connection/test", { method: "POST", body: JSON.stringify({ sheetUrl }) });
    setHeaders(data.headers);
    const auto = {};
    data.headers.forEach((header) => {
      const key = header.toLowerCase().replace(/\s+/g, "");
      if (key.includes("roll")) auto[header] = "rollNo";
      else if (key.includes("enrollment")) auto[header] = "enrollmentNo";
      else if (key.includes("registration")) auto[header] = "registrationNo";
      else if (key.includes("name")) auto[header] = "name";
      else if (key.includes("department")) auto[header] = "department";
      else if (key.includes("course")) auto[header] = "course";
      else if (key.includes("program")) auto[header] = "program";
      else if (key.includes("batch")) auto[header] = "batch";
      else if (key.includes("cgpa")) auto[header] = "cgpa";
      else if (key.includes("attendance")) auto[header] = "attendance";
      else auto[header] = "customFields";
    });
    setMapping(auto);
    setMessage(`Preview loaded: ${data.totalRows} rows detected`);
  }
  async function saveConnection() {
    await api("/spreadsheets/connection", { method: "POST", body: JSON.stringify({ sheetUrl, columnMapping: mapping }) });
    setMessage("Google Sheet connection saved");
    await loadConnection();
  }
  async function syncNow() {
    const data = await api(`/spreadsheets/connection/${connection._id}/sync`, { method: "POST" });
    setMessage(`Sync completed: ${data.summary.successfulRows} rows saved`);
    loadConnection();
    loadStudents();
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
    setSelected((current) => ({
      ...current,
      student: updated,
      driveSummary: {
        ...(current.driveSummary || {}),
        stuckOffStatus: updated.driveRestriction?.status || "CLEAR",
        stuckOffReason: updated.driveRestriction?.reason || "",
        stuckOffUpdatedAt: updated.driveRestriction?.updatedAt || null
      }
    }));
    loadStudents();
  }

  return (
    <>
      <PageHeader eyebrow="Master Data" title="Records" subtitle="Google Sheet is the source; MongoDB keeps permanent student records">
        <button onClick={loadStudents}><RefreshCcw size={17} /> Refresh</button>
      </PageHeader>
      {message && <div className="notice">{message}</div>}
      <section className="panel source-card">
        <div className="source-card-header">
          <div>
            <h3><FileSpreadsheet size={18} /> Master Data Source</h3>
            <p>{connection ? connection.sheetUrl : "No Google Sheet connected yet"}</p>
          </div>
          <div className="last-sync-pill">
            <span>Last Sync</span>
            <strong>{lastSync}</strong>
          </div>
        </div>
        <div className="source-stats">
          <Mini label="Status" value={connection?.status || "Not Connected"} />
          <Mini label="Columns" value={connectionColumns || "-"} />
          <Mini label="Rows" value={connection?.lastSummary?.totalRows || 0} />
          <Mini label="New" value={connection?.lastSummary?.newRecords || 0} />
          <Mini label="Updated" value={connection?.lastSummary?.updatedRecords || 0} />
          <Mini label="Conflicts" value={connection?.lastSummary?.conflictCount || 0} />
        </div>
        <div className="system-column-note">
          <ShieldCheck size={17} />
          <span>Stuck Off is maintained by Eligibility Flow from drive attendance logic and shown here as Yes or No.</span>
        </div>
        <div className="sheet-flow">
          <input placeholder="Paste Google Sheet link" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
          <button onClick={testSheet}>Test & Preview</button>
          <button onClick={saveConnection} disabled={!headers.length}>Save Connection</button>
          <button onClick={syncNow} disabled={!connection}>Sync Now</button>
          {connection?.sheetUrl && <a className="button-link" href={connection.sheetUrl} target="_blank" rel="noreferrer">Open Google Sheet</a>}
        </div>
        {!!headers.length && (
          <div className="mapping-grid">
            {headers.map((header) => (
              <label key={header}>{header}
                <select value={mapping[header] || "customFields"} onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}>
                  {["customFields", "rollNo", "enrollmentNo", "registrationNo", "name", "email", "phone", "batch", "admissionYear", "passingYear", "department", "course", "program", "branch", "semester", "section", "cgpa", "percentage", "tenthPercentage", "twelfthPercentage", "diplomaPercentage", "activeBacklogs", "totalBacklogs", "attendance", "category", "gender", "placementStatus", "resumeUrl"].map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
      </section>
      <FilterBar filters={filters} setFilters={setFilters} />
      <DataTable
        columns={["Roll No", "Name", "Mail", "Phone", "Department", "Course", "CGPA", "Attendance", "Batch", "Stuck Off", "Actions"]}
        rows={students.items.map((s) => {
          const stuckOff = s.driveRestriction?.status === "STUCK_OFF";
          return [
            s.rollNo,
            s.name,
            s.email || "-",
            s.phone || "-",
            s.department,
            s.course || "-",
            s.cgpa,
            `${s.attendance}%`,
            s.batch || "-",
            <span className={`status ${stuckOff ? "rejected" : "approved"}`}>{stuckOff ? "Yes" : "No"}</span>,
            <button onClick={() => viewStudent(s._id)}><Eye size={16} /> View</button>
          ];
        })}
      />
      <div className="pagination">
        <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
        <span>{students.total} records - Page {filters.page} of {students.pages || 1}</span>
        <button disabled={filters.page >= students.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button>
      </div>
      {selected && <StudentDrawer payload={selected} close={() => setSelected(null)} onUpdateRestriction={updateSelectedRestriction} />}
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

function DriveWisePage({ user }) {
  const [drives, setDrives] = useState([]);
  const [stuckOff, setStuckOff] = useState([]);
  const [driveSearch, setDriveSearch] = useState("");
  const isMaker = user.role === "LIST_MAKER";
  const filteredDrives = drives.filter((drive) => {
    const text = [drive.companyName, drive.jobRole, drive.packageCtc, drive.driveType].join(" ").toLowerCase();
    return text.includes(driveSearch.trim().toLowerCase());
  });
  async function load() {
    setDrives(await api("/drives"));
    if (user.role === "HOD") setStuckOff(await api("/drives/reports/stuck-off"));
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader eyebrow="Drive Workflow" title={isMaker ? "Upload Drive Sheet" : "Drive Wise"} subtitle={isMaker ? "Upload one attendance sheet; drives are created automatically from the Company column" : "Eligibility, registration and round progress by company drive"} />
      {isMaker && (
        <section className="panel upload-sheet-panel">
          <div>
            <h3><FileSpreadsheet size={18} /> Upload Attendance Sheet</h3>
            <p className="subtle">The system reads company names, student identifiers, registration status, and round attendance from the sheet.</p>
          </div>
          <AttendancePreviewEditor submitPath="/drives/attendance-rows" submitLabel="Upload & Create Drives" onComplete={load} />
        </section>
      )}
      <section className="drive-toolbar">
        <label className="searchbox drive-search" aria-label="Search drives">
          <Search size={18} />
          <input value={driveSearch} onChange={(event) => setDriveSearch(event.target.value)} placeholder="Search drive by company, role, or package" />
        </label>
        <button className="soft" onClick={load}><RefreshCcw size={17} /> Refresh Drives</button>
      </section>
      <section className="drive-grid">
        {filteredDrives.map((drive) => <DriveCard key={drive._id} drive={drive} user={user} refresh={load} />)}
        {!drives.length && <EmptyState message="No drives created yet" />}
        {!!drives.length && !filteredDrives.length && <EmptyState icon={Search} message="No matching drive found" />}
      </section>
      {user.role === "HOD" && <StuckOffReport items={stuckOff} />}
    </>
  );
}

function DriveCard({ drive, user, refresh }) {
  const [showSheetList, setShowSheetList] = useState(false);

  return (
    <article className="drive-card">
      <div className="drive-card-header">
        <div>
          <h3>{drive.companyName}</h3>
          <p>{drive.jobRole === "Auto-created from sheet" ? "Created from uploaded attendance sheet" : `${drive.jobRole || "Role not set"}${drive.packageCtc ? ` - ${drive.packageCtc}` : ""}`}</p>
        </div>
        <span className="status approved">Active</span>
      </div>
      <div className="drive-stats">
        <Mini label="Eligible" value={drive.stats?.eligibleStudents || 0} />
        <Mini label="Registered" value={drive.stats?.registeredStudents || 0} />
        <Mini label="Not Registered" value={drive.stats?.nonRegisteredStudents || 0} />
      </div>
      {user.role === "LIST_MAKER" && (
        <>
          <AttendancePreviewEditor
            compact
            title="Update Existing Drive Sheet"
            submitPath={`/drives/${drive._id}/attendance-rows`}
            submitLabel="Upload Again"
            onComplete={refresh}
          />
          <button className="soft" onClick={() => setShowSheetList(true)}>
            <FileSpreadsheet size={17} /> View Uploaded Sheets
          </button>
        </>
      )}
      
      {/* Sheet List Modal */}
      {showSheetList && (
        <DriveSheetList 
          driveId={drive._id} 
          onClose={() => setShowSheetList(false)} 
        />
      )}
    </article>
  );
}

// New Component for Viewing Drive Sheets
function DriveSheetList({ driveId, onClose }) {
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <>
      <div className="sheet-list-overlay">
        <div className="sheet-list-modal">
          <div className="sheet-list-header">
            <h3>Uploaded Sheets</h3>
            <button className="soft" onClick={onClose}><ChevronLeft size={17} /> Close</button>
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
                  <p>{sheet.rowCount || sheet.rows?.length || 0} rows{sheet.isSnapshot ? " - current drive data" : ""}</p>
                </div>
                <Eye size={20} />
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
          rows={selectedSheet.rows || []}
          editable={false}
          onClose={() => setSelectedSheet(null)}
        />
      )}
    </>
  );
}

function AttendancePreviewEditor({ submitPath, submitLabel, onComplete, compact = false, title = "CSV or Excel Sheet" }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState({ headers: [], rows: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  const hasPreview = preview.rows.length > 0;

  async function previewFile(nextFile = file) {
    if (!nextFile) return;
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", nextFile);
      const result = await api("/drives/attendance-preview", { method: "POST", body });
      setPreview({ headers: result.headers || [], rows: result.rows || [] });
      setMessage(`Preview ready: ${result.rows?.length || 0} rows. Edit any cell before upload.`);
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
    if (!hasPreview) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(submitPath, {
        method: "POST",
        body: JSON.stringify({ rows: preview.rows })
      });
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
    setMessage("");
  }

  return (
    <div className={`attendance-preview-editor ${compact ? "compact" : ""}`}>
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
        <button className="soft" type="button" onClick={() => previewFile()} disabled={!file || busy}><Eye size={17} /> Preview</button>
        <button type="button" onClick={submitRows} disabled={!hasPreview || busy}><FileSpreadsheet size={17} /> {submitLabel}</button>
      </div>
      {hasPreview && (
        <div className="sheet-preview-card">
          <div className="preview-summary">
            <strong>{preview.rows.length} editable rows</strong>
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
                {preview.rows.map((row, rowIndex) => (
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
function SheetPreviewModal({ title, headers, rows, editable = false, onUpdateCell, onClose }) {
  return (
    <div className="sheet-preview-modal-overlay">
      <div className="sheet-preview-modal">
        <div className="sheet-preview-modal-header">
          <h3>{title}</h3>
          <button className="soft" onClick={onClose}><ChevronLeft size={17} /> Close</button>
        </div>
        <div className="sheet-preview-modal-body">
          <div className="preview-table-wrap full-size">
            <table className="preview-table">
              <thead>
                <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {headers.map((header) => (
                      <td key={header}>
                        {editable ? (
                          <input 
                            value={row[header] ?? ""} 
                            onChange={(event) => onUpdateCell?.(rowIndex, header, event.target.value)} 
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
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user }) {
  const { updateProfile, uploadProfilePhoto } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", personalEmail: user.personalEmail || "", profileImage: user.profileImage || "" });
  const [message, setMessage] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    const updated = await updateProfile(form);
    setForm({ name: updated.name || "", email: updated.email || "", personalEmail: updated.personalEmail || "", profileImage: updated.profileImage || "" });
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
          <img className="profile-photo" src={assetUrl(form.profileImage) || "/logo.png"} alt="Profile" />
          <div className="profile-summary">
            <h3>{form.name || "User Profile"}</h3>
            <span>{user.role === "HOD" ? "Administration Profile" : "List Maker Profile"}</span>
            <p>{form.email}</p>
          </div>
          <label className="upload-photo-button">Upload Photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changePhoto} /></label>
        </div>
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-form-heading">
            <h3>Profile Information</h3>
            <p>Keep your account details updated for dashboard and report access.</p>
          </div>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Official Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Personal Email<input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></label>
          <button><Save size={17} /> Save Profile</button>
        </form>
      </section>
    </>
  );
}

function StuckOffReport({ items }) {
  return (
    <section className="panel stuck-report">
      <h3>Stuck-Off Risk Report</h3>
      <p className="subtle">Not registered means overall absent for that drive. If a registered student is present in any one process, the drive counts as overall present. Students absent in 2 or more drives are shown here for HOD review.</p>
      {!items.length ? <EmptyState message="No stuck-off risk students yet" /> : (
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

function DataTable({ columns, rows }) {
  return (
    <section className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </section>
  );
}

function StudentDrawer({ payload, close, onUpdateRestriction, readOnly = false }) {
  const student = payload.student || payload;
  const summary = payload.driveSummary || {};
  const [status, setStatus] = useState(student.driveRestriction?.status || summary.stuckOffStatus || "CLEAR");
  const [reason, setReason] = useState(student.driveRestriction?.reason || summary.stuckOffReason || "");
  const [message, setMessage] = useState("");
  const [driveSearch, setDriveSearch] = useState("");
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
    setMessage(status === "CLEAR" ? "Student status changed to Active." : "Student marked as Stuck Off.");
  }

  return (
    <aside className="student-card-overlay">
      <button className="student-card-backdrop" onClick={close} aria-label="Close student preview" />
      <section className="student-card-modal">
        <div className={`student-hero ${stuckOff ? "is-stuck" : "is-clear"}`}>
          <div className="student-avatar">{(student.name || "S").slice(0, 1).toUpperCase()}</div>
          <div className="student-title-block">
            <span className={`status ${stuckOff ? "rejected" : "approved"}`}>{stuckOff ? "Stuck Off" : "Clear for drives"}</span>
            <h2>{student.name}</h2>
            <p>{student.rollNo || student.enrollmentNo || student.studentId || "-"} - {student.department || "-"} - {student.program || "-"}</p>
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
              <Mini label="Absent Drives" value={summary.absentDrives ?? student.driveRestriction?.absentDriveCount ?? 0} />
              <Mini label="Total Drives" value={summary.totalDrives ?? 0} />
              <Mini label="Stuck Off" value={stuckOff ? "Yes" : "No"} />
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
              <button><Save size={17} /> Update Status</button>
            </form>}
          </section>

          <section className="student-panel">
            <div className="section-heading">
              <h3>Student Details</h3>
              <p>Master data synced from the connected sheet.</p>
            </div>
            <div className="student-detail-grid">
              <Mini label="Roll No" value={student.rollNo} />
              <Mini label="Mail" value={student.email || "-"} />
              <Mini label="Phone" value={student.phone || "-"} />
              <Mini label="Department" value={student.department} />
              <Mini label="CGPA" value={student.cgpa} />
              <Mini label="Attendance" value={`${student.attendance}%`} />
              <Mini label="Batch" value={student.batch || "-"} />
            </div>
          </section>
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
                      <span>{row.drive?.jobRole || "Role not set"}</span>
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
          <pre>{JSON.stringify(student.customFields || {}, null, 2)}</pre>
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
