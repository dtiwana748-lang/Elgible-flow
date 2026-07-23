import { Router } from "express";
import { z } from "zod";
import xlsx from "xlsx";
import { requireAuth } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { EligibilityList } from "../models/EligibilityList.js";
import { Drive } from "../models/Drive.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { filterEligibleStudents, calculateEligibility } from "../utils/studentRules.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();
const masterStudentFilter = {
  "source.connection": { $exists: true, $ne: null },
  sourceStatus: { $nin: ["MISSING_FROM_SOURCE", "ARCHIVED_FROM_SOURCE"] }
};
const ELIGIBILITY_EXPORT_FIELDS = {
  srNo: { label: "Sr No", virtual: true, width: 8 },
  rollNo: { label: "Roll No", width: 18 },
  enrollmentNo: { label: "Enrollment No", width: 18 },
  registrationNo: { label: "Registration No", width: 20 },
  grNo: { label: "GR No", width: 16 },
  universityId: { label: "University ID", width: 18 },
  studentId: { label: "Student ID", width: 18 },
  name: { label: "Student Name", width: 28 },
  email: { label: "Email", width: 34 },
  phone: { label: "Phone Number", width: 18 },
  fatherContactNo: { label: "Father Contact No", width: 20 },
  department: { label: "Department", width: 20 },
  course: { label: "Course", width: 16 },
  program: { label: "Program", width: 18 },
  branch: { label: "Branch", width: 18 },
  specialization: { label: "Specialization", width: 22 },
  batch: { label: "Batch", width: 12 },
  admissionYear: { label: "Admission Year", width: 16 },
  passingYear: { label: "Passing Year", width: 16 },
  semester: { label: "Semester", width: 12 },
  section: { label: "Section", width: 12 },
  cgpa: { label: "CGPA", width: 10 },
  percentage: { label: "Percentage", width: 14 },
  tenthPercentage: { label: "10th Percentage", width: 18 },
  tenthPassingYear: { label: "10th Passing Year", width: 18 },
  twelfthPercentage: { label: "12th Percentage", width: 18 },
  twelfthPassingYear: { label: "12th Passing Year", width: 18 },
  graduationPercentage: { label: "Graduation Percentage", width: 22 },
  diplomaPercentage: { label: "Diploma Percentage", width: 20 },
  pgStreams: { label: "PG Stream", width: 18 },
  attendance: { label: "Attendance", width: 14 },
  backlogs: { label: "Backlogs", width: 12 },
  activeBacklogs: { label: "Active Backlogs", width: 16 },
  totalBacklogs: { label: "Total Backlogs", width: 16 },
  category: { label: "Category", width: 14 },
  gender: { label: "Gender", width: 12 },
  dob: { label: "Date of Birth", width: 16 },
  domicileCity: { label: "Domicile City", width: 18 },
  domicileState: { label: "Domicile State", width: 18 },
  address: { label: "Address", width: 34 },
  college: { label: "College", width: 28 },
  placementStatus: { label: "Placement Status", width: 18 },
  status: { label: "Student Status", width: 16 },
  eligibilityStatus: { label: "Eligibility Status", virtual: true, width: 18 },
  eligibilityReasons: { label: "Eligibility Details / Reasons", virtual: true, width: 42 }
};
const DEFAULT_EXPORT_FIELDS = ["srNo", "rollNo", "enrollmentNo", "name", "email", "department", "course", "batch", "cgpa"];

function formatCgpa(value) {
  if (value === undefined || value === null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : "";
}

// Get unique master data options for courses, departments, batches, programs
router.get("/options/master-data", requireAuth, async (req, res) => {
  const [courses, departments, batches, programs] = await Promise.all([
    Student.distinct("course", masterStudentFilter),
    Student.distinct("department", masterStudentFilter),
    Student.distinct("batch", masterStudentFilter),
    Student.distinct("program", masterStudentFilter),
  ]);
  
  res.json({
    courses: courses.filter(Boolean),
    departments: departments.filter(Boolean),
    batches: batches.filter(Boolean),
    programs: programs.filter(Boolean),
  });
});

// Helper for parsing criteria
const parseCriteria = (body) => {
  return {
    cgpaMin: body.cgpaMin !== undefined ? Number(body.cgpaMin) : 0,
    cgpaMax: body.cgpaMax !== undefined ? Number(body.cgpaMax) : 10,
    tenthPercentageMin: body.tenthPercentageMin !== undefined ? Number(body.tenthPercentageMin) : 0,
    twelfthPercentageMin: body.twelfthPercentageMin !== undefined ? Number(body.twelfthPercentageMin) : 0,
    diplomaPercentageMin: body.diplomaPercentageMin !== undefined ? Number(body.diplomaPercentageMin) : 0,
    courses: body.courses ? (Array.isArray(body.courses) ? body.courses : [body.courses]) : [],
    departments: body.departments ? (Array.isArray(body.departments) ? body.departments : [body.departments]) : [],
    batches: body.batches ? (Array.isArray(body.batches) ? body.batches : [body.batches]) : [],
    program: body.program || null,
    semesterMin: body.semesterMin !== undefined ? Number(body.semesterMin) : 1,
    semesterMax: body.semesterMax !== undefined ? Number(body.semesterMax) : 12,
    activeBacklogsMax: body.activeBacklogsMax !== undefined ? Number(body.activeBacklogsMax) : Infinity,
    totalBacklogsMax: body.totalBacklogsMax !== undefined ? Number(body.totalBacklogsMax) : Infinity,
    attendanceMin: body.attendanceMin !== undefined ? Number(body.attendanceMin) : 0,
    allowStuckOff: Boolean(body.allowStuckOff),
    currentStudentPackage: body.currentStudentPackage !== undefined ? Number(body.currentStudentPackage) : 0,
    requiredPackageMultiple: body.requiredPackageMultiple !== undefined ? Number(body.requiredPackageMultiple) : 1.5,
    requiredPackageCtc: body.requiredPackageCtc !== undefined ? Number(body.requiredPackageCtc) : 0
  };
};

// Get all eligibility lists
router.get("/", requireAuth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 100);
  const sortBy = req.query.sortBy || "createdAt";
  const sortDir = req.query.sortDir === "asc" ? 1 : -1;
  const filter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  
  const [rawItems, total, totalMasterStudents] = await Promise.all([
    EligibilityList.find(filter)
      .populate("createdBy", "name email")
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EligibilityList.countDocuments(filter),
    Student.countDocuments(masterStudentFilter)
  ]);
  const items = await Promise.all(rawItems.map(async (item) => {
    const [totalEligible, totalNotEligible] = await Promise.all([
      Student.countDocuments({ ...masterStudentFilter, _id: { $in: item.eligibleStudents || [] } }),
      Student.countDocuments({ ...masterStudentFilter, _id: { $in: item.notEligibleStudents || [] } })
    ]);
    return {
      ...item,
      eligibilityBreakdown: {
        ...(item.eligibilityBreakdown || {}),
        totalChecked: totalMasterStudents,
        totalEligible,
        totalNotEligible
      }
    };
  }));
  
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// Get single eligibility list with students
router.get("/:id", requireAuth, async (req, res) => {
  const listFilter = req.user.role === "HOD" ? { _id: req.params.id } : { _id: req.params.id, createdBy: req.user._id };
  const list = await EligibilityList.findOne(listFilter)
    .populate("createdBy", "name email")
    .populate({ path: "eligibleStudents", match: masterStudentFilter, select: "rollNo enrollmentNo registrationNo universityId name email department course batch cgpa status driveRestriction" })
    .populate({ path: "notEligibleStudents", match: masterStudentFilter, select: "rollNo enrollmentNo registrationNo universityId name email department course batch cgpa status driveRestriction" });
  
  if (!list) return res.status(404).json({ message: "List not found" });

  let registrationSummary = { 
    registered: 0, 
    notRegistered: 0, 
    total: list.eligibleStudents?.length || 0,
    present: 0,
    absent: 0,
    pendingAttendance: 0
  };
  let driveStudentsMap = {};

  if (list.companyName) {
    const driveFilter = req.user.role === "HOD" ? { companyName: list.companyName } : { companyName: list.companyName, createdBy: list.createdBy };
    const drive = await Drive.findOne(driveFilter);
    if (drive) {
      const eligibleIds = (list.eligibleStudents || []).map(s => s._id);
      const driveStudents = await DriveStudent.find({
        drive: drive._id,
        student: { $in: eligibleIds }
      });
      for (const ds of driveStudents) {
        driveStudentsMap[ds.student.toString()] = ds.registrationStatus;
        if (ds.registrationStatus === "REGISTERED") {
          registrationSummary.registered += 1;
          if (ds.overallAttendanceStatus === "OVERALL_PRESENT") {
            registrationSummary.present += 1;
          } else if (ds.overallAttendanceStatus === "OVERALL_ABSENT") {
            registrationSummary.absent += 1;
          } else {
            registrationSummary.pendingAttendance += 1;
          }
        }
      }
      registrationSummary.notRegistered = registrationSummary.total - registrationSummary.registered;
    }
  }

  // Calculate reasons for ineligibility on the fly
  const criteria = list.criteria || {};
  const notEligibleStudentsWithReasons = (list.notEligibleStudents || []).map(student => {
    const eligibilityResult = calculateEligibility(student.toObject ? student.toObject() : student, criteria);
    return {
      ...(student.toObject ? student.toObject() : student),
      reasons: eligibilityResult.reasons
    };
  });

  // Attach registration status for eligible students on the fly
  const eligibleStudentsWithRegistration = (list.eligibleStudents || []).map(student => {
    const plainStudent = student.toObject ? student.toObject() : student;
    const eligibilityResult = calculateEligibility(plainStudent, criteria);
    return {
      ...plainStudent,
      reasons: eligibilityResult.reasons,
      hasNoc: String(plainStudent.status || "").trim().toUpperCase() === "NOC",
      registrationStatus: driveStudentsMap[student._id.toString()] || "NOT_REGISTERED"
    };
  });

  res.json({
    ...list.toObject(),
    eligibleStudents: eligibleStudentsWithRegistration,
    notEligibleStudents: notEligibleStudentsWithReasons,
    registrationSummary
  });
});

// Create eligibility list (calculate on the fly)
router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({
    name: z.string().min(3).max(200),
    description: z.string().max(1000).optional(),
    companyName: z.string().max(200).optional(),
    jobRole: z.string().max(200).optional(),
    packageCtc: z.union([z.number(), z.string()]).optional(),
    // Criteria
    cgpaMin: z.union([z.number(), z.string()]).optional(),
    cgpaMax: z.union([z.number(), z.string()]).optional(),
    tenthPercentageMin: z.union([z.number(), z.string()]).optional(),
    twelfthPercentageMin: z.union([z.number(), z.string()]).optional(),
    diplomaPercentageMin: z.union([z.number(), z.string()]).optional(),
    courses: z.union([z.array(z.string()), z.string()]).optional(),
    departments: z.union([z.array(z.string()), z.string()]).optional(),
    batches: z.union([z.array(z.string()), z.string()]).optional(),
    program: z.string().optional(),
    semesterMin: z.union([z.number(), z.string()]).optional(),
    semesterMax: z.union([z.number(), z.string()]).optional(),
    activeBacklogsMax: z.union([z.number(), z.string()]).optional(),
    totalBacklogsMax: z.union([z.number(), z.string()]).optional(),
    attendanceMin: z.union([z.number(), z.string()]).optional(),
    allowStuckOff: z.union([z.boolean(), z.string()]).optional(),
    currentStudentPackage: z.union([z.number(), z.string()]).optional(),
    requiredPackageMultiple: z.union([z.number(), z.string()]).optional(),
    requiredPackageCtc: z.union([z.number(), z.string()]).optional()
  }).safeParse(req.body);
  
  if (!parsed.success) {
    console.log("Validation error:", parsed.error);
    return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  }
  
  const criteria = parseCriteria(parsed.data);
  const students = await Student.find(masterStudentFilter).lean();
  
  // Calculate eligibility for all students
  const allResults = filterEligibleStudents(students, criteria);
  
  // Build breakdown
  const breakdown = {
    totalChecked: students.length,
    totalEligible: 0,
    totalNotEligible: 0,
    reasons: {}
  };
  
  for (const result of allResults) {
    if (result.status === "ELIGIBLE") {
      breakdown.totalEligible += 1;
    } else {
      breakdown.totalNotEligible += 1;
      for (const reason of result.reasons) {
        breakdown.reasons[reason] = (breakdown.reasons[reason] || 0) + 1;
      }
    }
  }
  
  // Create list
  const eligibilityList = await EligibilityList.create({
    name: parsed.data.name,
    description: parsed.data.description,
    criteria,
    eligibleStudents: allResults.filter(r => r.status === "ELIGIBLE").map(r => r.student._id),
    notEligibleStudents: allResults.filter(r => r.status === "NOT_ELIGIBLE").map(r => r.student._id),
    eligibilityBreakdown: breakdown,
    createdBy: req.user._id,
    status: "DRAFT",
    companyName: parsed.data.companyName || parsed.data.name,
    jobRole: parsed.data.jobRole,
    packageCtc: parsed.data.packageCtc !== undefined && parsed.data.packageCtc !== "" ? Number(parsed.data.packageCtc) : undefined
  });
  
  await writeAudit({
    actor: req.user._id,
    action: "ELIGIBILITY_LIST_CREATED",
    entity: "EligibilityList",
    entityId: eligibilityList._id,
    metadata: { listName: eligibilityList.name, totalEligible: breakdown.totalEligible }
  });
  
  // Populate students for response
  await eligibilityList.populate("eligibleStudents notEligibleStudents", "rollNo enrollmentNo registrationNo universityId name email department course batch cgpa");
  
  res.status(201).json(eligibilityList);
});

// Export an eligibility list using list-maker selected Master Data columns.
router.get("/:id/export", requireAuth, async (req, res) => {
  const listFilter = req.user.role === "HOD" ? { _id: req.params.id } : { _id: req.params.id, createdBy: req.user._id };
  const list = await EligibilityList.findOne(listFilter).lean();
  
  if (!list) return res.status(404).json({ message: "List not found" });

  const scope = ["eligible", "notEligible", "all"].includes(req.query.scope) ? req.query.scope : "eligible";
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  const requestedFields = String(req.query.fields || "")
    .split(",")
    .map((field) => field.trim())
    .filter((field) => ELIGIBILITY_EXPORT_FIELDS[field]);
  const fields = [...new Set(requestedFields.length ? requestedFields : DEFAULT_EXPORT_FIELDS)];
  if (!fields.length) return res.status(400).json({ message: "Select at least one valid field to export" });

  const eligibleIds = (list.eligibleStudents || []).map(String);
  const notEligibleIds = (list.notEligibleStudents || []).map(String);
  const selectedIds = scope === "eligible" ? eligibleIds : scope === "notEligible" ? notEligibleIds : [...eligibleIds, ...notEligibleIds];
  // Load complete master records so eligibility reasons remain accurate even when
  // the teacher does not include academic fields in the output.
  let students = await Student.find({ ...masterStudentFilter, _id: { $in: selectedIds } }).lean();
  const order = new Map(selectedIds.map((id, index) => [id, index]));
  students.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));

  const search = String(req.query.search || "").trim().toLowerCase();
  if (search) {
    students = students.filter((student) => [
      student.name, student.rollNo, student.enrollmentNo, student.registrationNo,
      student.universityId, student.email, student.department, student.course,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }

  const eligibleIdSet = new Set(eligibleIds);
  const percentageFields = new Set(["cgpa", "percentage", "tenthPercentage", "twelfthPercentage", "graduationPercentage", "diplomaPercentage", "attendance"]);
  const rows = students.map((student, index) => {
    const isEligible = eligibleIdSet.has(String(student._id));
    const eligibility = calculateEligibility(student, list.criteria || {});
    const row = {};
    fields.forEach((field) => {
      const config = ELIGIBILITY_EXPORT_FIELDS[field];
      let value = student[field];
      if (field === "srNo") value = index + 1;
      if (field === "eligibilityStatus") value = isEligible ? "Eligible" : "Not Eligible";
      if (field === "eligibilityReasons") value = isEligible ? "Meets all criteria" : (eligibility.reasons || []).join("; ");
      if (field === "dob" && value) {
        const date = new Date(value);
        value = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
      }
      if (percentageFields.has(field)) value = formatCgpa(value);
      row[config.label] = value ?? "";
    });
    return row;
  });
  
  const workbook = xlsx.utils.book_new();
  const outputHeaders = fields.map((field) => ELIGIBILITY_EXPORT_FIELDS[field].label);
  const worksheet = xlsx.utils.json_to_sheet(rows, { header: outputHeaders });
  worksheet["!cols"] = fields.map((field) => ({ wch: ELIGIBILITY_EXPORT_FIELDS[field].width || 18 }));
  if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  xlsx.utils.book_append_sheet(workbook, worksheet, scope === "all" ? "All Students" : scope === "notEligible" ? "Not Eligible" : "Eligible Students");
  const safeName = list.name.replace(/[^a-z0-9]/gi, "_");
  
  const buffer = format === "csv"
    ? Buffer.from(`\uFEFF${xlsx.utils.sheet_to_csv(worksheet)}`, "utf8")
    : xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${scope}-${Date.now()}.${format}"`);
  res.send(buffer);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const listFilter = req.user.role === "HOD" ? { _id: req.params.id } : { _id: req.params.id, createdBy: req.user._id };
  const list = await EligibilityList.findOne(listFilter);
  if (!list) return res.status(404).json({ message: "List not found" });

  await EligibilityList.deleteOne({ _id: list._id });
  await writeAudit({
    actor: req.user._id,
    action: "ELIGIBILITY_LIST_DELETED",
    entity: "EligibilityList",
    entityId: list._id,
    metadata: { listName: list.name, status: list.status }
  });

  res.json({ message: "Eligibility list deleted successfully" });
});

// Finalize list
router.patch("/:id/finalize", requireAuth, async (req, res) => {
  const list = await EligibilityList.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!list) return res.status(404).json({ message: "List not found" });
  
  list.status = "FINALIZED";
  await list.save();
  
  await writeAudit({
    actor: req.user._id,
    action: "ELIGIBILITY_LIST_FINALIZED",
    entity: "EligibilityList",
    entityId: list._id,
    metadata: { listName: list.name }
  });
  
  await list.populate("eligibleStudents notEligibleStudents", "rollNo name email department course batch cgpa");
  res.json(list);
});

export default router;
