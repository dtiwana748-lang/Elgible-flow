import { Router } from "express";
import { z } from "zod";
import xlsx from "xlsx";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

function buildFilter(query) {
  const filter = {};
  ["batch", "department", "branch", "course", "program", "semester", "category", "placementStatus", "status", "sourceStatus", "passingYear", "admissionYear"].forEach((field) => {
    if (query[field]) filter[field] = ["semester", "passingYear", "admissionYear"].includes(field) ? Number(query[field]) : query[field];
  });
  if (query.cgpaMin || query.cgpaMax) filter.cgpa = { ...(query.cgpaMin ? { $gte: Number(query.cgpaMin) } : {}), ...(query.cgpaMax ? { $lte: Number(query.cgpaMax) } : {}) };
  if (query.attendanceMin || query.attendanceMax) filter.attendance = { ...(query.attendanceMin ? { $gte: Number(query.attendanceMin) } : {}), ...(query.attendanceMax ? { $lte: Number(query.attendanceMax) } : {}) };
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

router.get("/students", requireAuth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 200);
  const sortBy = req.query.sortBy || "updatedAt";
  const sortDir = req.query.sortDir === "asc" ? 1 : -1;
  const filter = buildFilter(req.query);
  const projection = "studentId rollNo enrollmentNo registrationNo name email phone batch department branch course program semester cgpa attendance activeBacklogs totalBacklogs placementStatus sourceStatus driveRestriction status updatedAt";
  const [items, total] = await Promise.all([
    Student.find(filter).select(projection).sort({ [sortBy]: sortDir }).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.get("/students/export", requireAuth, requireRole("HOD"), async (req, res) => {
  const filter = buildFilter(req.query);
  const students = await Student.find(filter)
    .select("name rollNo email phone department course batch semester cgpa driveRestriction")
    .sort({ department: 1, course: 1, program: 1, batch: 1, name: 1 })
    .lean();

  const rows = students.map((student) => ({
    Name: student.name || "",
    "Roll No": student.rollNo || "",
    Email: student.email || "",
    Phone: student.phone || "",
    Department: student.department || "",
    Course: student.course || "",
    CGPA: student.cgpa ?? "",
    Batch: student.batch || "",
    Semester: student.semester || "",
    Status: student.driveRestriction?.status === "STUCK_OFF" ? "Stuck Off" : "Active",
    "Stuck Off": student.driveRestriction?.status === "STUCK_OFF" ? "Yes" : "No"
  }));

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 26 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 }
  ];
  if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  xlsx.utils.book_append_sheet(workbook, worksheet, "Students");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="students-report-${Date.now()}.xlsx"`);
  res.send(buffer);
});

router.get("/students/:id", requireAuth, async (req, res) => {
  const student = await Student.findById(req.params.id).populate("createdBy approvedBy", "name email role");
  if (!student) return res.status(404).json({ message: "Student not found" });
  const driveRows = await DriveStudent.find({ student: student._id })
    .populate("drive", "companyName jobRole packageCtc driveDate approvalStatus driveStatus")
    .sort({ updatedAt: -1 })
    .lean();
  const driveSummary = driveRows.reduce((summary, row) => {
    summary.totalDrives += 1;
    if (row.eligibilityStatus === "ELIGIBLE") summary.eligibleDrives += 1;
    if (row.registrationStatus === "REGISTERED") summary.registeredDrives += 1;
    if (row.overallAttendanceStatus === "OVERALL_PRESENT") summary.presentDrives += 1;
    if (row.overallAttendanceStatus === "OVERALL_ABSENT") summary.absentDrives += 1;
    return summary;
  }, {
    totalDrives: 0,
    eligibleDrives: 0,
    registeredDrives: 0,
    presentDrives: 0,
    absentDrives: 0,
    stuckOffStatus: student.driveRestriction?.status || "CLEAR",
    stuckOffReason: student.driveRestriction?.reason || "",
    stuckOffUpdatedAt: student.driveRestriction?.updatedAt || null,
    driveRows
  });
  res.json({ student, driveSummary });
});

router.patch("/students/:id/drive-restriction", requireAuth, requireRole("HOD"), async (req, res) => {
  const parsed = z.object({
    status: z.enum(["CLEAR", "STUCK_OFF"]),
    reason: z.string().max(400).optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid stuck-off status is required" });

  const student = await Student.findByIdAndUpdate(req.params.id, {
    $set: {
      "driveRestriction.status": parsed.data.status,
      "driveRestriction.reason": parsed.data.reason || (parsed.data.status === "STUCK_OFF" ? "Marked stuck-off by HOD review." : "Cleared by HOD review."),
      "driveRestriction.updatedAt": new Date()
    }
  }, { new: true });
  if (!student) return res.status(404).json({ message: "Student not found" });

  await writeAudit({
    actor: req.user._id,
    action: "STUDENT_STUCK_OFF_STATUS_UPDATED",
    entity: "Student",
    entityId: student._id,
    reason: parsed.data.reason,
    metadata: { status: parsed.data.status }
  });
  res.json(student);
});

router.patch("/students/:id", requireAuth, requireRole("HOD"), async (req, res) => {
  const parsed = z.object({ updates: z.record(z.any()), reason: z.string().min(3).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Updates and edit reason are required" });
  const existing = await Student.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: "Student not found" });
  const localEdits = Object.entries(parsed.data.updates).map(([field, newValue]) => ({
    field,
    previousValue: existing[field],
    newValue,
    reason: parsed.data.reason,
    editedBy: req.user._id
  }));
  const student = await Student.findByIdAndUpdate(req.params.id, { $set: parsed.data.updates, $push: { localEdits: { $each: localEdits } } }, { new: true });
  await writeAudit({ actor: req.user._id, action: "STUDENT_EDITED", entity: "Student", entityId: student._id, reason: parsed.data.reason, metadata: parsed.data.updates });
  res.json(student);
});

export default router;
