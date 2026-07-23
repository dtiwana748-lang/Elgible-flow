import { Router } from "express";
import { z } from "zod";
import xlsx from "xlsx";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { AttendanceSheet } from "../models/AttendanceSheet.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { writeAudit } from "../utils/audit.js";
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";

const router = Router();

function formatCgpa(value) {
  if (value === undefined || value === null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : "";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-GB");
}

function normalizeDisplayStatus(student) {
  const stuckOff = student.driveRestriction?.status === "STUCK_OFF" ||
    ["stuck off", "struck off", "stuck_off", "struck_off"].includes(String(student.status || "").toLowerCase());
  return stuckOff ? "Struck Off" : (student.status || "");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query) {
  const filter = query.includeAll === "true" ? {} : {
    "source.connection": { $exists: true, $ne: null },
    sourceStatus: { $nin: ["MISSING_FROM_SOURCE", "ARCHIVED_FROM_SOURCE"] }
  };
  ["batch", "department", "branch", "course", "program", "semester", "category", "placementStatus", "status", "sourceStatus", "passingYear", "admissionYear"].forEach((field) => {
    if (query[field]) filter[field] = ["semester", "passingYear", "admissionYear"].includes(field) ? Number(query[field]) : query[field];
  });
  if (query.cgpaMin || query.cgpaMax) filter.cgpa = { ...(query.cgpaMin ? { $gte: Number(query.cgpaMin) } : {}), ...(query.cgpaMax ? { $lte: Number(query.cgpaMax) } : {}) };
  if (query.attendanceMin || query.attendanceMax) filter.attendance = { ...(query.attendanceMin ? { $gte: Number(query.attendanceMin) } : {}), ...(query.attendanceMax ? { $lte: Number(query.attendanceMax) } : {}) };
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search).trim(), "i");
    filter.$or = [
      { grNo: regex },
      { universityId: regex },
      { studentId: regex },
      { rollNo: regex },
      { enrollmentNo: regex },
      { registrationNo: regex },
      { name: regex },
      { email: regex },
      { phone: regex },
      { fatherContactNo: regex },
      { department: regex },
      { branch: regex },
      { course: regex },
      { program: regex }
    ];
  }
  return filter;
}

async function scopedMasterFilter(query) {
  const filter = buildFilter(query);
  if (query.includeAll === "true") return filter;
  const connectionIds = await SpreadsheetConnection.distinct("_id");
  filter["source.connection"] = connectionIds.length ? { $in: connectionIds } : { $in: [] };
  return filter;
}

router.get("/students", requireAuth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 200);
  const sortBy = req.query.sortBy || "updatedAt";
  const sortDir = req.query.sortDir === "asc" ? 1 : -1;
  const filter = await scopedMasterFilter(req.query);
  const projection = "grNo universityId studentId rollNo enrollmentNo registrationNo name gender dob email phone fatherContactNo college department branch course program batch specialization semester section cgpa attendance activeBacklogs totalBacklogs tenthPercentage tenthPassingYear twelfthPercentage twelfthPassingYear diplomaPercentage graduationPercentage pgStreams semesters placementStatus domicileCity domicileState address sourceStatus driveRestriction status updatedAt passingYear backlogs resumeUrl";
  const [items, total] = await Promise.all([
    Student.find(filter).select(projection).sort({ [sortBy]: sortDir }).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.get("/students/export", requireAuth, requireRole("HOD"), async (req, res) => {
  const filter = await scopedMasterFilter(req.query);
  const students = await Student.find(filter)
    .select("grNo enrollmentNo rollNo status passingYear name gender dob email universityId phone fatherContactNo domicileCity domicileState address college branch specialization semester tenthPercentage tenthPassingYear twelfthPercentage twelfthPassingYear graduationPercentage pgStreams semesters backlogs activeBacklogs cgpa driveRestriction resumeUrl")
    .sort({ passingYear: 1, branch: 1, name: 1 })
    .lean();

  const headers = [
    "GR.No.", "Enrollment_No", "Student_Roll No", "Status", "Pass Out Year", "Student_Name",
    "Gender", "DOB", "Student_Email_ID", "University Id", "Student_Contact No.",
    "Student's Father_Contact No.", "Domcile City", "Domcile State", "Address", "College",
    "Branch", "Specialization (MBA)", "Current Semester", "Class 10 %", "Paasing year 10th",
    "Class 12 %", "Paasing year 12th", "Graduation % (For PG Students)", "P.G Streams",
    "Sem 1%", "Status_Sem1", "Sem 2%", "Status_Sem2", "Sem 3%", "Status_Sem3",
    "Sem4 %", "Status_Sem4", "Sem 5 %", "Status_Sem5", "Sem 6%", "Status_Sem6",
    "Sem 7%", "Status_Sem7", "Sem8", "Status_Sem8", "Backlogs", "Average (CGPA)",
    "Updated Resumes"
  ];

  const rows = students.map((student) => ({
    "GR.No.": student.grNo || "",
    Enrollment_No: student.enrollmentNo || "",
    "Student_Roll No": student.rollNo || "",
    Status: normalizeDisplayStatus(student),
    "Pass Out Year": student.passingYear || "",
    Student_Name: student.name || "",
    Gender: student.gender || "",
    DOB: formatDate(student.dob),
    Student_Email_ID: student.email || "",
    "University Id": student.universityId || "",
    "Student_Contact No.": student.phone || "",
    "Student's Father_Contact No.": student.fatherContactNo || "",
    "Domcile City": student.domicileCity || "",
    "Domcile State": student.domicileState || "",
    Address: student.address || "",
    College: student.college || "",
    Branch: student.branch || "",
    "Specialization (MBA)": student.specialization || "",
    "Current Semester": student.semester || "",
    "Class 10 %": student.tenthPercentage ?? "",
    "Paasing year 10th": student.tenthPassingYear || "",
    "Class 12 %": student.twelfthPercentage ?? "",
    "Paasing year 12th": student.twelfthPassingYear || "",
    "Graduation % (For PG Students)": student.graduationPercentage ?? "",
    "P.G Streams": student.pgStreams || "",
    "Sem 1%": student.semesters?.["1"]?.percentage ?? "",
    Status_Sem1: student.semesters?.["1"]?.status || "",
    "Sem 2%": student.semesters?.["2"]?.percentage ?? "",
    Status_Sem2: student.semesters?.["2"]?.status || "",
    "Sem 3%": student.semesters?.["3"]?.percentage ?? "",
    Status_Sem3: student.semesters?.["3"]?.status || "",
    "Sem4 %": student.semesters?.["4"]?.percentage ?? "",
    Status_Sem4: student.semesters?.["4"]?.status || "",
    "Sem 5 %": student.semesters?.["5"]?.percentage ?? "",
    Status_Sem5: student.semesters?.["5"]?.status || "",
    "Sem 6%": student.semesters?.["6"]?.percentage ?? "",
    Status_Sem6: student.semesters?.["6"]?.status || "",
    "Sem 7%": student.semesters?.["7"]?.percentage ?? "",
    Status_Sem7: student.semesters?.["7"]?.status || "",
    Sem8: student.semesters?.["8"]?.percentage ?? "",
    Status_Sem8: student.semesters?.["8"]?.status || "",
    Backlogs: student.backlogs ?? student.activeBacklogs ?? "",
    "Average (CGPA)": formatCgpa(student.cgpa),
    "Updated Resumes": student.resumeUrl || ""
  }));

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(Math.max(header.length + 4, 12), 34)
  }));
  worksheet["!rows"] = [{ hpt: 24 }, ...rows.map(() => ({ hpt: 21 }))];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!pageSetup"] = { paperSize: 9, orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  worksheet["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  xlsx.utils.book_append_sheet(workbook, worksheet, "Updated Master Data");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="updated-master-students-${Date.now()}.xlsx"`);
  res.send(buffer);
});

router.get("/students/:id", requireAuth, async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate("createdBy approvedBy", "name email role")
    .populate("localEdits.editedBy", "name email role");
  if (!student) return res.status(404).json({ message: "Student not found" });
  const driveRows = await DriveStudent.find({ student: student._id })
    .populate({
      path: "drive",
      select: "companyName jobRole packageCtc driveDate approvalStatus driveStatus createdBy",
      populate: {
        path: "createdBy",
        select: "name email role"
      }
    })
    .sort({ updatedAt: -1 })
    .lean();
  const driveIds = driveRows.map((row) => row.drive?._id).filter(Boolean);
  const sheets = driveIds.length
    ? await AttendanceSheet.find({ drive: { $in: driveIds } })
      .select("drive preparedByNames")
      .sort({ createdAt: -1 })
      .lean()
    : [];
  const officersByDrive = sheets.reduce((map, sheet) => {
    const driveId = sheet.drive?.toString();
    if (!driveId || map.has(driveId)) return map;
    map.set(driveId, (sheet.preparedByNames || []).filter(Boolean));
    return map;
  }, new Map());
  const enrichedDriveRows = driveRows.map((row) => ({
    ...row,
    preparedByNames: officersByDrive.get(row.drive?._id?.toString()) || []
  }));
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
    driveRows: enrichedDriveRows
  });
  res.json({ student, driveSummary });
});

router.patch("/students/:id/drive-restriction", requireAuth, requireRole("HOD"), async (req, res) => {
  const parsed = z.object({
    status: z.enum(["CLEAR", "STUCK_OFF"]),
    reason: z.string().max(400).optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid Struck Off status is required" });

  const existing = await Student.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: "Student not found" });

  const displayStatus = parsed.data.status === "STUCK_OFF" ? "Struck Off" : "Active";
  const restrictionReason = parsed.data.reason || (parsed.data.status === "STUCK_OFF" ? "Marked Struck Off by HOD review." : "Cleared by HOD review.");
  const student = await Student.findByIdAndUpdate(req.params.id, {
    $set: {
      status: displayStatus,
      "driveRestriction.status": parsed.data.status,
      "driveRestriction.reason": restrictionReason,
      ...(parsed.data.status === "CLEAR" ? { "driveRestriction.clearedAt": new Date() } : {}),
      "driveRestriction.updatedAt": new Date()
    },
    $push: {
      localEdits: {
        field: "driveRestriction.status",
        previousValue: existing.driveRestriction?.status || "CLEAR",
        newValue: parsed.data.status,
        reason: restrictionReason,
        editedBy: req.user._id
      }
    }
  }, { new: true });

  await triggerSpreadsheetUpdate(student, { statusOnly: true });
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
  triggerSpreadsheetUpdate(student);
  await writeAudit({ actor: req.user._id, action: "STUDENT_EDITED", entity: "Student", entityId: student._id, reason: parsed.data.reason, metadata: parsed.data.updates });
  res.json(student);
});

router.delete("/students", requireAuth, requireRole("HOD"), async (req, res) => {
  try {
    const result = await Student.deleteMany({});
    await DriveStudent.deleteMany({});
    await writeAudit({
      actor: req.user._id,
      action: "ALL_STUDENTS_DELETED",
      entity: "Student",
      reason: "Cleared all students to re-sync from Google Sheet"
    });
    res.json({ message: `Deleted ${result.deletedCount} students and reset all drive mappings` });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete students", error: error.message });
  }
});

export default router;
