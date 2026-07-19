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

function formatCgpa(value) {
  if (value === undefined || value === null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : "";
}

// Get unique master data options for courses, departments, batches, programs
router.get("/options/master-data", requireAuth, async (req, res) => {
  const [courses, departments, batches, programs] = await Promise.all([
    Student.distinct("course"),
    Student.distinct("department"),
    Student.distinct("batch"),
    Student.distinct("program"),
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
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  
  const [items, total] = await Promise.all([
    EligibilityList.find(filter)
      .populate("createdBy", "name email")
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit),
    EligibilityList.countDocuments(filter)
  ]);
  
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// Get single eligibility list with students
router.get("/:id", requireAuth, async (req, res) => {
  const list = await EligibilityList.findById(req.params.id)
    .populate("createdBy", "name email")
    .populate("eligibleStudents", "rollNo name email department course batch cgpa")
    .populate("notEligibleStudents", "rollNo name email department course batch cgpa");
  
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
    const drive = await Drive.findOne({ companyName: list.companyName });
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
    return {
      ...(student.toObject ? student.toObject() : student),
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
  const students = await Student.find({}).lean();
  
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
    companyName: parsed.data.companyName,
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
  await eligibilityList.populate("eligibleStudents notEligibleStudents", "rollNo name email department course batch cgpa");
  
  res.status(201).json(eligibilityList);
});

// Export eligibility list to Excel
router.get("/:id/export", requireAuth, async (req, res) => {
  const list = await EligibilityList.findById(req.params.id)
    .populate("eligibleStudents", "rollNo name email department batch cgpa");
  
  if (!list) return res.status(404).json({ message: "List not found" });
  
  const eligibleStudents = list.eligibleStudents || [];
  const rows = eligibleStudents.map(student => ({
    "Roll No": student.rollNo || "",
    "Name": student.name || "",
    "Email": student.email || "",
    "Department": student.department || "",
    "Batch": student.batch || "",
    "CGPA": formatCgpa(student.cgpa)
  }));
  
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 34 },
    { wch: 22 },
    { wch: 12 },
    { wch: 10 }
  ];
  if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  xlsx.utils.book_append_sheet(workbook, worksheet, "Eligible Students");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="eligibility-list-${list.name.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}.xlsx"`);
  res.send(buffer);
});

// Finalize list
router.patch("/:id/finalize", requireAuth, async (req, res) => {
  const list = await EligibilityList.findById(req.params.id);
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
