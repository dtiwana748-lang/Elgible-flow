import { useMemo, useState } from "react";
import { CheckCircle2, FileText, GraduationCap, Search, Send, ShieldCheck } from "lucide-react";
import { api } from "../api.js";

const detailFields = [
  ["grNo", "GR No"], ["rollNo", "Roll No"], ["enrollmentNo", "Enrollment No"], ["universityId", "University ID"], ["name", "Name"],
  ["gender", "Gender"], ["dob", "Date of Birth"], ["email", "Email"], ["phone", "Phone"], ["fatherContactNo", "Father's Phone"],
  ["college", "College"], ["department", "Department"], ["branch", "Branch"], ["specialization", "Specialization"], ["program", "Program"],
  ["course", "Course"], ["semester", "Current Academic Semester"], ["batch", "Batch"], ["admissionYear", "Admission Year"], ["passingYear", "Passing Year"],
  ["cgpa", "CGPA"], ["attendance", "Attendance"], ["tenthPercentage", "10th %"], ["tenthPassingYear", "10th Passing Year"],
  ["twelfthPercentage", "12th %"], ["twelfthPassingYear", "12th Passing Year"], ["diplomaPercentage", "Diploma %"],
  ["graduationPercentage", "Graduation %"], ["pgStreams", "PG Streams"], ["activeBacklogs", "Active Backlogs"],
  ["totalBacklogs", "Total Backlogs"], ["category", "Category"], ["domicileCity", "Domicile City"],
  ["domicileState", "Domicile State"], ["address", "Address"], ["placementStatus", "Placement Status"]
];

function showValue(field, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (field === "dob") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toLocaleDateString("en-US");
  }
  if (field === "attendance") return `${value}%`;
  return String(value).replaceAll("_", " ");
}

function getStudentValue(student, field) {
  return field.split(".").reduce((value, part) => value?.[part], student);
}

function fieldGuide(field, config) {
  const guides = {
    name: "Enter the full name exactly as shown on official records.",
    email: "Example: student@college.edu",
    phone: "Enter digits only, including the correct country code if applicable.",
    fatherContactNo: "Enter digits only.",
    gender: "Example: Male, Female, Non-binary, or the value used in your official record.",
    dob: "Use MM/DD/YYYY, for example 10/16/2005.",
    semester: "This is your current academic semester, not a semester result. Enter a whole number from 1 to 12.",
    cgpa: "Number from 0 to 10, for example 8.35.",
    attendance: "Percentage from 0 to 100.",
    tenthPercentage: "Percentage from 0 to 100.",
    twelfthPercentage: "Percentage from 0 to 100.",
    diplomaPercentage: "Percentage from 0 to 100.",
    graduationPercentage: "Percentage from 0 to 100.",
    activeBacklogs: "Non-negative whole number, for example 0 or 2.",
    totalBacklogs: "Non-negative whole number, for example 0 or 3.",
    passingYear: "Four-digit year, for example 2027.",
    tenthPassingYear: "Four-digit year, for example 2021.",
    twelfthPassingYear: "Four-digit year, for example 2023."
  };
  if (/^semesters\.[1-8]\.percentage$/.test(field)) return "Enter the result percentage from 0 to 100, for example 89.8.";
  if (/^semesters\.[1-8]\.status$/.test(field)) return "Enter the official result status, for example Pass, Fail, Reappear, or Result Awaited.";
  return guides[field] || `Enter the correct ${config.label.toLowerCase()} exactly as it appears on your supporting document.`;
}

function correctionInputProps(field, config) {
  if (field === "semester") return { type: "number", min: 1, max: 12, step: 1 };
  if (field === "cgpa") return { type: "number", min: 0, max: 10, step: "0.01" };
  if (["attendance", "tenthPercentage", "twelfthPercentage", "diplomaPercentage", "graduationPercentage"].includes(field) || /^semesters\.[1-8]\.percentage$/.test(field)) {
    return { type: "number", min: 0, max: 100, step: "0.01" };
  }
  if (["activeBacklogs", "totalBacklogs"].includes(field)) return { type: "number", min: 0, step: 1 };
  return { type: config.type === "number" ? "number" : "text" };
}

export default function StudentPortal() {
  const [credentials, setCredentials] = useState({ rollNo: "", dob: "" });
  const [student, setStudent] = useState(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [fieldOptions, setFieldOptions] = useState({});
  const [fieldToAdd, setFieldToAdd] = useState("");
  const [selectedFields, setSelectedFields] = useState([]);
  const [requestedValues, setRequestedValues] = useState({});
  const [requestHistory, setRequestHistory] = useState([]);
  const [expandedRequests, setExpandedRequests] = useState([]);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const semesterRows = useMemo(() => Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1);
    return { number, ...(student?.semesters?.[number] || {}) };
  }), [student]);

  async function findRecord(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = await api("/student-portal/lookup", { method: "POST", body: JSON.stringify(credentials) });
      setStudent(result.student);
      setVerificationToken(result.token);
      setFieldOptions(result.correctionFields || {});
      setRequestHistory(result.requests || []);
      setExpandedRequests([]);
      setShowAllRequests(false);
      setSelectedFields([]);
      setRequestedValues({});
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  function addCorrectionField(field) {
    if (!field || selectedFields.includes(field)) return;
    setSelectedFields((current) => [...current, field]);
    setFieldToAdd("");
  }

  function addField() {
    addCorrectionField(fieldToAdd);
  }

  function correctSemesterResult(semesterNumber) {
    addCorrectionField(`semesters.${semesterNumber}.percentage`);
    window.setTimeout(() => document.getElementById("student-correction-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function removeField(field) {
    setSelectedFields((current) => current.filter((item) => item !== field));
    setRequestedValues((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!selectedFields.length || !proof) return setNotice("Select at least one field and upload a proof document.");
    setBusy(true);
    setNotice("");
    try {
      const body = new FormData();
      body.append("verificationToken", verificationToken);
      body.append("message", message);
      body.append("proof", proof);
      body.append("changes", JSON.stringify(selectedFields.map((field) => ({ field, requestedValue: requestedValues[field] ?? "" }))));
      const result = await api("/student-portal/requests", { method: "POST", body });
      setNotice(`${result.message}. Reference: ${result.requestId}`);
      setRequestHistory((current) => [{
        _id: result.requestId, status: result.status, createdAt: result.createdAt,
        changes: result.changes, message, writeBackStatus: result.writeBackStatus
      }, ...current]);
      setSelectedFields([]);
      setRequestedValues({});
      setMessage("");
      setProof(null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="student-portal-page">
      <header className="student-portal-top">
        <div className="student-portal-brand">
          <img src="/logo.png" alt="Eligibility Flow" />
          <span><strong>Eligibility Flow</strong><small>Student Record Portal</small></span>
        </div>
      </header>

      {!student ? (
        <section className="student-lookup-shell">
          <div className="student-lookup-copy">
            <img className="student-lookup-illustration" src="https://i.ibb.co/WvC5QyQv/1380872.png" alt="Student checking an academic record" />
            <div className="student-lookup-overlay">
              <span className="eyebrow">Secure record access</span>
              <h1>View your student record</h1>
              <p>Check your placement master data and request verified corrections.</p>
            </div>
          </div>
          <form className="student-lookup-form" onSubmit={findRecord}>
            <h2>Find My Record</h2>
            <p className="student-form-intro">Enter the Roll Number and Date of Birth stored in your college master record.</p>
            <label>Roll Number<input value={credentials.rollNo} onChange={(e) => setCredentials({ ...credentials, rollNo: e.target.value })} required placeholder="Example: 2330095" /></label>
            <label>Date of Birth<input value={credentials.dob} onChange={(e) => setCredentials({ ...credentials, dob: e.target.value })} required placeholder="MM/DD/YYYY — 10/16/2005" inputMode="numeric" /></label>
            <button disabled={busy}><Search size={18} /> {busy ? "Verifying..." : "View My Details"}</button>
            <div className="student-lookup-trust"><ShieldCheck size={18} /><span>Your details are used only to verify and display your matching record.</span></div>
            {notice && <div className="notice error">{notice}</div>}
          </form>
        </section>
      ) : (
        <div className="student-public-record">
          <section className="student-public-hero">
            <div className="student-public-avatar">{student.name?.slice(0, 1).toUpperCase() || "S"}</div>
            <div>
              <span className={`status ${student.driveRestriction?.status === "STUCK_OFF" ? "rejected" : "approved"}`}>{student.driveRestriction?.status === "STUCK_OFF" ? "Restricted for drives" : "Clear for drives"}</span>
              <h1>{student.name}</h1>
              <p>{student.rollNo} · {student.department || student.branch || "-"} · {student.program || student.course || "-"}</p>
            </div>
            <button className="soft" type="button" onClick={() => {
              setStudent(null);
              setVerificationToken("");
              setRequestHistory([]);
              setExpandedRequests([]);
              setShowAllRequests(false);
              setNotice("");
            }}>Check Another Record</button>
          </section>

          <section className="student-public-panel">
            <div className="student-public-heading"><div><h2>Student Details</h2><p>Master data synced from the connected placement sheet.</p></div><GraduationCap size={28} /></div>
            <div className="student-public-details">
              {detailFields.map(([field, label]) => <div key={field}><span>{label}</span><strong>{showValue(field, student[field])}</strong></div>)}
            </div>
          </section>

          <section className="student-public-panel">
            <div className="student-public-heading"><div><h2>Semester Results</h2><p>Semester-wise percentage and result status.</p></div></div>
            <div className="student-semester-grid">
              {semesterRows.map((semester) => <div key={semester.number}>
                <strong>Semester {semester.number}</strong>
                <span>{semester.percentage == null || semester.percentage === "" ? "N/A" : `${semester.percentage}%`} ({semester.status || "Result Awaited"})</span>
                <button className="semester-correct-link" type="button" onClick={() => correctSemesterResult(semester.number)}>Correct this result</button>
              </div>)}
            </div>
          </section>

          <section className="student-public-panel student-correction-history-panel">
            <div className="student-public-heading"><div><h2>My Correction Requests</h2><p>Track requests submitted for this verified student record.</p></div></div>
            {requestHistory.length ? <>
              <div className="student-request-history">
              {(showAllRequests ? requestHistory : requestHistory.slice(0, 2)).map((request) => {
                const isExpanded = expandedRequests.includes(request._id);
                return (
                <article key={request._id} className={isExpanded ? "expanded" : ""}>
                  <div>
                    <div className="student-request-summary">
                      <strong>Request #{String(request._id).slice(-6).toUpperCase()}</strong>
                      <small>{new Date(request.createdAt).toLocaleString()}</small>
                    </div>
                    <div className="student-request-summary-actions">
                      <span className={`status ${request.status === "APPROVED" ? "approved" : request.status === "REJECTED" ? "rejected" : "pending"}`}>{request.status}</span>
                      <button className="soft student-request-toggle" type="button" onClick={() => setExpandedRequests((current) => current.includes(request._id) ? current.filter((id) => id !== request._id) : [...current, request._id])}>{isExpanded ? "Hide details" : "View details"}</button>
                    </div>
                  </div>
                  {isExpanded && <div className="student-request-expanded">
                  <p className="student-request-explanation"><b>Your message:</b> {request.message}</p>
                  {request.status === "PENDING" && <div className="student-review-time"><strong>Your request is under verification.</strong><span>Thank you for your patience. Our team carefully checks the submitted details and supporting document. Your status is usually updated within 3–5 working days.</span></div>}
                  <div className="student-history-changes">
                    {request.changes?.map((change) => <div key={change.field}>
                      <strong>{fieldOptions[change.field]?.label || change.label || change.field}</strong>
                      <span><small>Existing value</small>{showValue(change.field, change.currentValue)}</span>
                      <span><small>Requested value</small>{showValue(change.field, change.requestedValue)}</span>
                    </div>)}
                  </div>
                  {request.hodRemarks && <p><b>HOD note:</b> {request.hodRemarks}</p>}
                  {request.status === "APPROVED" && <small className="student-sync-state">Master data update: {request.writeBackStatus || "PROCESSING"}{request.writeBackMessage ? ` — ${request.writeBackMessage}` : ""}</small>}
                  </div>}
                </article>
              )})}
              </div>
              {requestHistory.length > 2 && <button className="soft student-show-more" type="button" onClick={() => setShowAllRequests((value) => !value)}>{showAllRequests ? "Show fewer requests" : `View more requests (${requestHistory.length - 2})`}</button>}
            </> : <p className="student-empty-state">You have not submitted any correction requests.</p>}
          </section>

          <section id="student-correction-form" className="student-public-panel correction-panel">
            <div className="student-public-heading"><div><h2>Request a Data Correction</h2><p>Add only the incorrect fields, enter the correct values, and attach proof.</p></div><FileText size={28} /></div>
            <div className="student-review-policy">
              <ShieldCheck size={21} />
              <div><strong>We carefully verify every correction request.</strong><p>After you submit your request, please allow 3–5 working days for verification. We check your requested changes and supporting proof before updating the master record. You can return to this page anytime to view the latest status.</p></div>
            </div>
            <div className="student-correction-help"><strong>Choose the correct field:</strong> “Current Academic Semester” means your present semester (such as 6). For marks such as 89.8, choose “Semester 6 Percentage” or click “Correct this result” above.</div>
            <form onSubmit={submitRequest}>
              <div className="student-correction-builder">
                <label>Field to correct
                  <select value={fieldToAdd} onChange={(event) => setFieldToAdd(event.target.value)}>
                    <option value="">Choose a field</option>
                    {Object.entries(fieldOptions).filter(([field]) => !selectedFields.includes(field)).map(([field, config]) => <option key={field} value={field}>{config.label}</option>)}
                  </select>
                </label>
                <button className="soft" type="button" disabled={!fieldToAdd} onClick={addField}>Add Field</button>
              </div>
              <div className="student-selected-corrections">
                {selectedFields.map((field) => {
                  const config = fieldOptions[field];
                  return <div key={field}>
                    <div><strong>{config.label}</strong><small>Current: {showValue(field, getStudentValue(student, field))}</small></div>
                    <label className="student-correct-value">New value
                      <input {...correctionInputProps(field, config)} value={requestedValues[field] ?? ""} onChange={(event) => setRequestedValues({ ...requestedValues, [field]: event.target.value })} required placeholder={config.type === "date" ? "MM/DD/YYYY" : `Correct ${config.label}`} />
                      <small>{fieldGuide(field, config)}</small>
                    </label>
                    <button className="soft" type="button" onClick={() => removeField(field)}>Remove</button>
                  </div>;
                })}
                {!selectedFields.length && <p className="student-empty-state">No fields added yet.</p>}
              </div>
              <label>Explanation<textarea rows={4} minLength={10} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Clearly explain what is incorrect and why the requested value is correct." /></label>
              <label>Supporting Proof<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setProof(e.target.files?.[0] || null)} required /><small>PDF, JPG, PNG, or WEBP. Maximum 8 MB.</small></label>
              <button disabled={busy || !selectedFields.length}><Send size={17} /> {busy ? "Submitting..." : "Submit Correction Request"}</button>
              {notice && <div className={notice.includes("Reference:") ? "notice" : "notice error"}>{notice}</div>}
            </form>
          </section>
          <footer className="student-portal-footer"><CheckCircle2 size={17} /> Thank you for your patience. Approved changes are applied after the HOD verifies your supporting proof.</footer>
        </div>
      )}
    </main>
  );
}
