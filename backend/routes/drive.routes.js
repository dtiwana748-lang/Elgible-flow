import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { parse } from "csv-parse/sync";
import xlsx from "xlsx";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Drive } from "../models/Drive.js";
import { DriveRound } from "../models/DriveRound.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { Student } from "../models/Student.js";
import { AttendanceSheet } from "../models/AttendanceSheet.js";
import { writeAudit } from "../utils/audit.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { calculateDriveAttendance } from "../utils/driveAttendance.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const driveSchema = z.object({
  companyName: z.string().min(2),
  jobRole: z.string().min(2),
  driveType: z.string().optional(),
  packageCtc: z.string().optional(),
  driveDate: z.string().optional()
});

const editedAttendanceRowsSchema = z.object({
  rows: z.array(z.record(z.any())).min(1).max(1000),
  markMissingAbsent: z.union([z.boolean(), z.string()]).optional()
});

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickColumn(row, names) {
  const entries = Object.entries(row);
  const found = entries.find(([key]) => names.some((name) => normalizeHeader(key).includes(name)));
  return found?.[1];
}

function parseAttendanceRows(file) {
  const name = file.originalname.toLowerCase();
  let rows, headers;
  
  if (name.endsWith(".csv")) {
    rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    // For CSV, extract headers from first row
    const temp = parse(file.buffer, { columns: false, skip_empty_lines: true, trim: true, to_line: 1 });
    headers = temp.length ? temp[0] : [];
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Get headers from first row
    const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    headers = sheetData.length ? sheetData[0].filter(Boolean) : [];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  } else {
    throw new Error("Upload a CSV, XLSX, or XLS attendance file");
  }
  
  return { headers, rows };
}

function normalizeAttendanceStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["present", "p", "yes", "y", "1", "qualified", "selected"].includes(text)) return "PRESENT";
  if (["absent", "a", "no", "n", "0", "not present", "notpresent", "defaulter", "default"].includes(text)) return "ABSENT";
  if (text.includes("not present") || text.includes("notpresent")) return "ABSENT";
  if (text.includes("absent") || text.includes("defaulter") || text.includes("default") || text.includes("not qualified")) return "ABSENT";
  if (text.includes("present") || text.includes("qualified") || text.includes("selected")) return "PRESENT";
  return null;
}

function normalizeRegistrationStatus(value, attendanceStatus) {
  const text = String(value || "").trim().toLowerCase();
  if (["registered", "yes", "y", "1", "present"].includes(text) || attendanceStatus === "PRESENT") return "REGISTERED";
  if (text.includes("not") || text === "no" || text === "n" || text === "0") return "NOT_REGISTERED";
  return attendanceStatus === "ABSENT" ? "NOT_REGISTERED" : "REGISTERED";
}

function buildStudentLookup(row) {
  const enrollmentNo = pickColumn(row, ["enrollment", "universityroll", "universityreg"]);
  const registrationNo = pickColumn(row, ["registration", "regno"]);
  const rollNo = pickColumn(row, ["roll"]);
  const email = pickColumn(row, ["email", "mail"]);
  const name = pickColumn(row, ["name", "studentname"]);
  if (enrollmentNo) return { enrollmentNo: String(enrollmentNo).trim() };
  if (registrationNo) return { registrationNo: String(registrationNo).trim() };
  if (rollNo) return { rollNo: String(rollNo).trim() };
  if (email) return { email: String(email).trim().toLowerCase() };
  if (name) return { name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  return null;
}

function isMetaAttendanceColumn(header) {
  const key = normalizeHeader(header);
  return [
    "roll", "enrollment", "registration", "regno", "email", "mail", "name", "student", "branch", "department",
    "course", "program", "batch", "company", "eligible", "registered", "register"
  ].some((part) => key.includes(part));
}

function getProcessStatuses(row) {
  const processStatuses = Object.entries(row)
    .filter(([header, value]) => !isMetaAttendanceColumn(header) && String(value || "").trim())
    .map(([header, value]) => ({ roundName: header.trim(), status: normalizeAttendanceStatus(value) }))
    .filter((item) => item.status);

  if (processStatuses.length) return processStatuses;

  const genericStatus = pickColumn(row, ["attendance", "status", "present", "presence", "result"]);
  const status = normalizeAttendanceStatus(genericStatus);
  return status ? [{ roundName: "Attendance", status }] : [];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findOrCreateDriveFromRow(row, userId) {
  const companyName = String(pickColumn(row, ["companyname", "company", "organisation", "organization"]) || "").trim();
  if (!companyName) return null;
  const drive = await Drive.findOneAndUpdate(
    { createdBy: userId, companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") },
    {
      $setOnInsert: {
        companyName,
        jobRole: "Auto-created from sheet",
        createdBy: userId,
        approvalStatus: "DRAFT",
        driveStatus: "DRAFT"
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return drive;
}

async function upsertDriveStudentFromAttendanceRow({ drive, row, userId }) {
  const lookup = buildStudentLookup(row);
  if (!lookup) return { error: "No usable student identifier found" };

  const student = await Student.findOne(lookup);
  if (!student) return { error: "Student not found in master records" };

  const registrationValue = pickColumn(row, ["registration", "registered", "register"]);
  const processStatuses = getProcessStatuses(row);
  const anyPresent = processStatuses.some((item) => item.status === "PRESENT");
  const registrationStatus = normalizeRegistrationStatus(registrationValue, anyPresent ? "PRESENT" : "ABSENT");
  const driveStudent = await DriveStudent.findOneAndUpdate(
    { drive: drive._id, student: student._id },
    {
      $setOnInsert: { eligibilityStatus: "ELIGIBLE" },
      $set: {
        registrationStatus,
        roundHistory: processStatuses.map((item) => ({ ...item, notes: "Uploaded from attendance file", markedBy: userId }))
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const attendance = calculateDriveAttendance(driveStudent.registrationStatus, driveStudent.roundHistory || []);
  driveStudent.overallAttendanceStatus = attendance.overallAttendanceStatus;
  driveStudent.overallAttendanceReason = attendance.overallAttendanceReason;
  driveStudent.currentRound = processStatuses.at(-1)?.roundName || "Attendance";
  await driveStudent.save();
  await refreshStudentStuckOff(student._id);
  return { student, driveStudent };
}

async function refreshDriveStats(driveId) {
  const [stats] = await DriveStudent.aggregate([
    { $match: { drive: driveId } },
    {
      $group: {
        _id: "$drive",
        eligibleStudents: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
        ineligibleStudents: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "INELIGIBLE"] }, 1, 0] } },
        registeredStudents: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        nonRegisteredStudents: { $sum: { $cond: [{ $ne: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        totalStudentsConsidered: { $sum: 1 }
      }
    }
  ]);
  await Drive.findByIdAndUpdate(driveId, { stats: stats || {} });
}

async function refreshStudentStuckOff(studentId) {
  const absentDriveCount = await DriveStudent.countDocuments({ student: studentId, overallAttendanceStatus: "OVERALL_ABSENT" });
  const status = absentDriveCount >= 2 ? "STUCK_OFF" : "CLEAR";
  await Student.findByIdAndUpdate(studentId, {
    "driveRestriction.status": status,
    "driveRestriction.absentDriveCount": absentDriveCount,
    "driveRestriction.reason": status === "STUCK_OFF" ? `Absent in ${absentDriveCount} drives. Student is stuck-off from next drives.` : "Student is clear for upcoming drives.",
    "driveRestriction.updatedAt": new Date()
  });
}

async function buildDriveSheetSnapshot(drive) {
  const driveStudents = await DriveStudent.find({ drive: drive._id })
    .populate("student", "rollNo enrollmentNo registrationNo name email department course program batch branch semester")
    .sort({ updatedAt: -1 })
    .lean();

  if (!driveStudents.length) return [];

  const rows = driveStudents.map((item) => {
    const row = {
      "Roll No": item.student?.rollNo || "",
      "Enrollment No": item.student?.enrollmentNo || "",
      "Registration No": item.student?.registrationNo || "",
      "Student Name": item.student?.name || "",
      Email: item.student?.email || "",
      Department: item.student?.department || "",
      Course: item.student?.course || "",
      Program: item.student?.program || "",
      Batch: item.student?.batch || "",
      Branch: item.student?.branch || "",
      Semester: item.student?.semester ?? "",
      Registration: item.registrationStatus || "",
      "Overall Attendance": item.overallAttendanceStatus || "",
      "Attendance Reason": item.overallAttendanceReason || ""
    };

    for (const round of item.roundHistory || []) {
      if (!round?.roundName) continue;
      row[round.roundName] = round.status || "PENDING";
    }

    return row;
  });

  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));

  return [{
    _id: `snapshot-${drive._id}`,
    drive: {
      _id: drive._id,
      companyName: drive.companyName,
      jobRole: drive.jobRole
    },
    uploadedBy: {
      name: drive.createdBy?.name || "System",
      email: drive.createdBy?.email || ""
    },
    fileName: `${drive.companyName}-current-drive-data.xlsx`,
    fileType: "snapshot",
    headers,
    rows,
    rowCount: rows.length,
    createdAt: drive.updatedAt || drive.createdAt || new Date(),
    isSnapshot: true
  }];
}

function parseMarkMissingAbsent(value) {
  return value === true || value === "true";
}

function summarizePreviewRows(rows, providedHeaders) {
  const headers = providedHeaders?.length ? providedHeaders : Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  return { headers, rows };
}

async function processAutoDriveRows(rows, userId, fileName, fileType, headers) {
  const errors = [];
  const touchedDriveIds = new Set();
  const driveSummaries = new Map();
  let matched = 0;
  let present = 0;
  let absent = 0;

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const drive = await findOrCreateDriveFromRow(rows[index], userId);
      if (!drive) {
        errors.push({ row: index + 2, message: "Company name is required to auto-create a drive" });
        continue;
      }
      touchedDriveIds.add(drive._id.toString());
      const existingSummary = driveSummaries.get(drive._id.toString()) || { driveId: drive._id, companyName: drive.companyName, matched: 0, present: 0, absent: 0 };
      driveSummaries.set(drive._id.toString(), existingSummary);

      const result = await upsertDriveStudentFromAttendanceRow({ drive, row: rows[index], userId });
      if (result.error) {
        errors.push({ row: index + 2, companyName: drive.companyName, message: result.error });
        continue;
      }

      const summary = driveSummaries.get(drive._id.toString());
      summary.matched += 1;
      matched += 1;
      if (result.driveStudent.overallAttendanceStatus === "OVERALL_PRESENT") {
        summary.present += 1;
        present += 1;
      }
      if (result.driveStudent.overallAttendanceStatus === "OVERALL_ABSENT") {
        summary.absent += 1;
        absent += 1;
      }
      driveSummaries.set(drive._id.toString(), summary);
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  }

  for (const driveId of touchedDriveIds) {
    await refreshDriveStats(driveId);
  }

  const result = { rows: rows.length, drives: [...driveSummaries.values()], matched, present, absent, errors, touchedDriveCount: touchedDriveIds.size };
  
  // Save the attendance sheet for each touched drive
  for (const driveId of touchedDriveIds) {
    await AttendanceSheet.create({
      drive: driveId,
      uploadedBy: userId,
      fileName,
      fileType,
      headers,
      rows,
      uploadResult: result
    });
  }

  return result;
}

async function processExistingDriveRows({ drive, rows, userId, markMissingAbsent = false, fileName, fileType, headers }) {
  // Filter rows by company name to match the drive's company (e.g. Coforge)
  let processedRows = rows;
  if (drive && drive.companyName) {
    processedRows = rows.filter((row) => {
      const keys = Object.keys(row);
      const companyKey = keys.find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        return norm.includes("companyname") || norm === "company";
      });
      if (!companyKey) return true;
      return String(row[companyKey] || "").trim().toLowerCase() === drive.companyName.trim().toLowerCase();
    });
  }

  const seenStudentIds = new Set();
  const errors = [];
  let matched = 0;
  let present = 0;
  let absent = 0;

  for (let index = 0; index < processedRows.length; index += 1) {
    try {
      const lookup = buildStudentLookup(processedRows[index]);
      if (!lookup) {
        errors.push({ row: index + 2, message: "No usable student identifier found" });
        continue;
      }
      const student = await Student.findOne(lookup);
      if (!student) {
        errors.push({ row: index + 2, message: "Student not found in master records" });
        continue;
      }
      const registrationValue = pickColumn(processedRows[index], ["registration", "registered", "register"]);
      const processStatuses = getProcessStatuses(processedRows[index]);
      const anyPresent = processStatuses.some((item) => item.status === "PRESENT");
      const registrationStatus = normalizeRegistrationStatus(registrationValue, anyPresent ? "PRESENT" : "ABSENT");
      const driveStudent = await DriveStudent.findOneAndUpdate(
        { drive: drive._id, student: student._id },
        {
          $setOnInsert: { eligibilityStatus: "ELIGIBLE" },
          $set: {
            registrationStatus,
            roundHistory: processStatuses.map((item) => ({ ...item, notes: "Uploaded from edited attendance rows", markedBy: userId }))
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      const attendance = calculateDriveAttendance(driveStudent.registrationStatus, driveStudent.roundHistory || []);
      driveStudent.overallAttendanceStatus = attendance.overallAttendanceStatus;
      driveStudent.overallAttendanceReason = attendance.overallAttendanceReason;
      driveStudent.currentRound = processStatuses.at(-1)?.roundName || "Attendance";
      await driveStudent.save();
      await refreshStudentStuckOff(student._id);
      seenStudentIds.add(student._id.toString());
      matched += 1;
      if (driveStudent.overallAttendanceStatus === "OVERALL_PRESENT") present += 1;
      if (driveStudent.overallAttendanceStatus === "OVERALL_ABSENT") absent += 1;
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  }

  if (markMissingAbsent) {
    const existing = await DriveStudent.find({ drive: drive._id, student: { $nin: [...seenStudentIds] } });
    for (const item of existing) {
      item.roundHistory.push({ roundName: "Attendance Upload", status: "ABSENT", notes: "Missing from uploaded attendance file", markedBy: userId });
      const attendance = calculateDriveAttendance(item.registrationStatus, item.roundHistory);
      item.overallAttendanceStatus = attendance.overallAttendanceStatus;
      item.overallAttendanceReason = attendance.overallAttendanceReason;
      item.currentRound = "Attendance Upload";
      await item.save();
      await refreshStudentStuckOff(item.student);
      absent += 1;
    }
  }

  await refreshDriveStats(drive._id);
  
  const result = { rows: processedRows.length, matched, present, absent, errors };
  
  // Save the attendance sheet
  await AttendanceSheet.create({
    drive: drive._id,
    uploadedBy: userId,
    fileName,
    fileType,
    headers,
    rows: processedRows,
    uploadResult: result
  });

  return result;
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  const filter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
  const drives = await Drive.find(filter).populate("createdBy", "name email").sort({ updatedAt: -1 }).lean();
  const driveIds = drives.map((drive) => drive._id);
  const stats = await DriveStudent.aggregate([
    { $match: { drive: { $in: driveIds } } },
    {
      $group: {
        _id: "$drive",
        eligibleStudents: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
        ineligibleStudents: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "INELIGIBLE"] }, 1, 0] } },
        registeredStudents: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        nonRegisteredStudents: { $sum: { $cond: [{ $ne: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        totalStudentsConsidered: { $sum: 1 }
      }
    }
  ]);
  const statsByDrive = new Map(stats.map((item) => [item._id.toString(), item]));
  res.json(drives.map((drive) => ({ ...drive, stats: statsByDrive.get(drive._id.toString()) || drive.stats || {} })));
});

router.post("/", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = driveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Drive details are invalid" });
  const drive = await Drive.create({ ...parsed.data, driveDate: parsed.data.driveDate ? new Date(parsed.data.driveDate) : undefined, createdBy: req.user._id });
  await writeAudit({ actor: req.user._id, action: "DRIVE_CREATED", entity: "Drive", entityId: drive._id });
  res.status(201).json(drive);
});

router.post("/attendance-sheet", requireRole("LIST_MAKER"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Attendance sheet file is required" });
  const { headers, rows } = parseAttendanceRows(req.file);
  const fileName = req.file.originalname;
  const fileType = fileName.split('.').pop().toLowerCase();
  const result = await processAutoDriveRows(rows, req.user._id, fileName, fileType, headers);
  await writeAudit({
    actor: req.user._id,
    action: "DRIVE_SHEET_UPLOADED",
    entity: "Drive",
    metadata: { rows: result.rows, drives: result.touchedDriveCount, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length }
  });

  res.json({ rows: result.rows, drives: result.drives, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors });
});

router.post("/attendance-preview", requireRole("LIST_MAKER"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Attendance sheet file is required" });
  const { headers, rows } = parseAttendanceRows(req.file);
  if (rows.length > 1000) return res.status(400).json({ message: "Preview supports up to 1000 rows. Upload the file directly or split it for editing." });
  res.json(summarizePreviewRows(rows, headers));
});

router.post("/attendance-rows", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = editedAttendanceRowsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Edited attendance rows are invalid" });
  const headers = parsed.data.rows.length ? Object.keys(parsed.data.rows[0]) : [];
  const result = await processAutoDriveRows(parsed.data.rows, req.user._id, "edited-upload.xlsx", "xlsx", headers);
  await writeAudit({
    actor: req.user._id,
    action: "DRIVE_SHEET_EDITED_ROWS_UPLOADED",
    entity: "Drive",
    metadata: { rows: result.rows, drives: result.touchedDriveCount, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length }
  });
  res.json({ rows: result.rows, drives: result.drives, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors });
});

router.post("/:id/submit", requireRole("LIST_MAKER"), async (req, res) => {
  const drive = await Drive.findOneAndUpdate({ _id: req.params.id, createdBy: req.user._id }, { approvalStatus: "PENDING_HOD_APPROVAL", driveStatus: "PENDING_HOD_APPROVAL" }, { new: true });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  await writeAudit({ actor: req.user._id, action: "DRIVE_SUBMITTED", entity: "Drive", entityId: drive._id });
  res.json(drive);
});

router.post("/:id/approval", requireRole("HOD"), async (req, res) => {
  const parsed = z.object({ decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]), remarks: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid approval decision is required" });
  const drive = await Drive.findByIdAndUpdate(req.params.id, {
    approvalStatus: parsed.data.decision,
    driveStatus: parsed.data.decision === "APPROVED" ? "APPROVED" : "DRAFT"
  }, { new: true });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  await writeAudit({ actor: req.user._id, action: `DRIVE_${parsed.data.decision}`, entity: "Drive", entityId: drive._id, metadata: { remarks: parsed.data.remarks } });
  res.json(drive);
});

router.post("/:id/rounds", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = z.object({ roundName: z.string().min(2), roundType: z.string().optional(), roundNumber: z.coerce.number().int().min(1), date: z.string().optional(), venue: z.string().optional(), meetingLink: z.string().optional(), instructions: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Round details are invalid" });
  const drive = await Drive.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  const round = await DriveRound.create({ ...parsed.data, drive: drive._id, date: parsed.data.date ? new Date(parsed.data.date) : undefined, createdBy: req.user._id });
  drive.currentRound = parsed.data.roundName;
  drive.driveStatus = "ROUNDS_IN_PROGRESS";
  await drive.save();
  await writeAudit({ actor: req.user._id, action: "ROUND_CREATED", entity: "DriveRound", entityId: round._id });
  res.status(201).json(round);
});

router.get("/:id/students", async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  if (req.user.role !== "HOD" && drive.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "You cannot access this drive" });
  }
  const students = await DriveStudent.find({ drive: drive._id })
    .populate("student", "studentId rollNo enrollmentNo name batch department course program")
    .sort({ updatedAt: -1 });
  res.json(students);
});

router.post("/:id/students/:studentId/registration", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = z.object({
    registrationStatus: z.enum(["NOT_CONTACTED", "NOTIFIED", "REGISTERED", "NOT_REGISTERED", "DECLINED", "REGISTRATION_PENDING", "REGISTRATION_LINK_ISSUE"]),
    notes: z.string().max(300).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid registration status is required" });

  const drive = await Drive.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });

  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ message: "Student not found" });

  const driveStudent = await DriveStudent.findOneAndUpdate(
    { drive: drive._id, student: student._id },
    {
      $set: {
        registrationStatus: parsed.data.registrationStatus,
        notes: parsed.data.notes,
        registrationDate: parsed.data.registrationStatus === "REGISTERED" ? new Date() : undefined
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const attendance = calculateDriveAttendance(parsed.data.registrationStatus, driveStudent.roundHistory || []);
  driveStudent.overallAttendanceStatus = attendance.overallAttendanceStatus;
  driveStudent.overallAttendanceReason = attendance.overallAttendanceReason;
  await driveStudent.save();
  await writeAudit({ actor: req.user._id, action: "DRIVE_REGISTRATION_UPDATED", entity: "DriveStudent", entityId: driveStudent._id, metadata: parsed.data });
  await refreshDriveStats(drive._id);
  await refreshStudentStuckOff(student._id);
  res.json(driveStudent);
});

router.post("/:id/students/:studentId/round-attendance", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = z.object({
    roundName: z.string().min(2),
    status: z.enum(["PENDING", "PRESENT", "ABSENT", "QUALIFIED", "NOT_QUALIFIED", "ON_HOLD", "WITHDRAWN", "DISQUALIFIED"]),
    notes: z.string().max(300).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid round attendance status is required" });

  const drive = await Drive.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });

  const driveStudent = await DriveStudent.findOne({ drive: drive._id, student: req.params.studentId });
  if (!driveStudent) return res.status(404).json({ message: "Drive student record not found" });

  driveStudent.roundHistory.push({ ...parsed.data, markedBy: req.user._id });
  const attendance = calculateDriveAttendance(driveStudent.registrationStatus, driveStudent.roundHistory);
  driveStudent.overallAttendanceStatus = attendance.overallAttendanceStatus;
  driveStudent.overallAttendanceReason = attendance.overallAttendanceReason;
  driveStudent.currentRound = parsed.data.roundName;
  await driveStudent.save();
  await writeAudit({ actor: req.user._id, action: "ROUND_ATTENDANCE_UPDATED", entity: "DriveStudent", entityId: driveStudent._id, metadata: parsed.data });
  await refreshDriveStats(drive._id);
  await refreshStudentStuckOff(driveStudent.student);
  res.json(driveStudent);
});

router.post("/:id/attendance-upload", requireRole("LIST_MAKER"), upload.single("file"), async (req, res) => {
  const drive = await Drive.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });

  const activeRequest = await AccessRequest.findOne({
    drive: drive._id,
    requester: req.user._id,
    type: "REUPLOAD_SHEET",
    status: "APPROVED"
  });
  if (!activeRequest) {
    return res.status(403).json({ message: "HOD approval is required to upload or update this drive sheet. Please submit an access request." });
  }

  if (!req.file) return res.status(400).json({ message: "Attendance file is required" });

  const markMissingAbsent = parseMarkMissingAbsent(req.body.markMissingAbsent);
  const { headers, rows } = parseAttendanceRows(req.file);
  const fileName = req.file.originalname;
  const fileType = fileName.split('.').pop().toLowerCase();
  const result = await processExistingDriveRows({ drive, rows, userId: req.user._id, markMissingAbsent, fileName, fileType, headers });
  
  activeRequest.status = "COMPLETED";
  await activeRequest.save();

  await writeAudit({ actor: req.user._id, action: "DRIVE_ATTENDANCE_UPLOADED", entity: "Drive", entityId: drive._id, metadata: { rows: result.rows, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length } });
  res.json(result);
});

router.post("/:id/attendance-rows", requireRole("LIST_MAKER"), async (req, res) => {
  const drive = await Drive.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });

  const activeRequest = await AccessRequest.findOne({
    drive: drive._id,
    requester: req.user._id,
    type: "REUPLOAD_SHEET",
    status: "APPROVED"
  });
  if (!activeRequest) {
    return res.status(403).json({ message: "HOD approval is required to upload or update this drive sheet. Please submit an access request." });
  }

  const parsed = editedAttendanceRowsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Edited attendance rows are invalid" });
  const headers = parsed.data.rows.length ? Object.keys(parsed.data.rows[0]) : [];
  const result = await processExistingDriveRows({
    drive,
    rows: parsed.data.rows,
    userId: req.user._id,
    markMissingAbsent: parseMarkMissingAbsent(parsed.data.markMissingAbsent),
    fileName: "edited-upload.xlsx",
    fileType: "xlsx",
    headers
  });

  activeRequest.status = "COMPLETED";
  await activeRequest.save();

  await writeAudit({ actor: req.user._id, action: "DRIVE_ATTENDANCE_EDITED_ROWS_UPLOADED", entity: "Drive", entityId: drive._id, metadata: { rows: result.rows, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length } });
  res.json(result);
});

router.get("/reports/stuck-off", requireRole("HOD"), async (_req, res) => {
  const rows = await DriveStudent.aggregate([
    { $match: { overallAttendanceStatus: "OVERALL_ABSENT" } },
    { $group: { _id: "$student", absentDriveCount: { $sum: 1 }, driveStudentIds: { $push: "$_id" }, reasons: { $push: "$overallAttendanceReason" } } },
    { $match: { absentDriveCount: { $gte: 2 } } },
    { $sort: { absentDriveCount: -1 } }
  ]);
  const details = await DriveStudent.find({ _id: { $in: rows.flatMap((row) => row.driveStudentIds) } })
    .populate("drive", "companyName jobRole driveDate")
    .populate("student", "studentId rollNo enrollmentNo name batch department course program");
  const report = rows.map((row) => {
    const studentRows = details.filter((item) => item.student?._id.toString() === row._id.toString());
    const first = studentRows[0]?.student;
    return {
      student: first,
      absentDriveCount: row.absentDriveCount,
      status: row.absentDriveCount >= 2 ? "STUCK_OFF_RISK" : "CLEAR",
      reason: `Absent in ${row.absentDriveCount} drives. Policy: absent in 2 or more drives is marked as stuck-off risk.`,
      drives: studentRows.map((item) => ({
        companyName: item.drive?.companyName,
        jobRole: item.drive?.jobRole,
        driveDate: item.drive?.driveDate,
        registrationStatus: item.registrationStatus,
        overallAttendanceStatus: item.overallAttendanceStatus,
        reason: item.overallAttendanceReason
      }))
    };
  });
  res.json(report);
});

// New endpoints for attendance sheets
router.get("/:id/sheets", requireAuth, async (req, res) => {
  const drive = await Drive.findById(req.params.id).populate("createdBy", "name email");
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  if (req.user.role !== "HOD" && String(drive.createdBy?._id || drive.createdBy) !== req.user._id.toString()) {
    return res.status(403).json({ message: "You cannot access this drive" });
  }
  
  const sheets = await AttendanceSheet.find({ drive: req.params.id })
    .populate("drive", "companyName jobRole")
    .populate("uploadedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  if (!sheets.length) {
    const snapshotSheets = await buildDriveSheetSnapshot(drive);
    return res.json(snapshotSheets);
  }
  
  res.json(sheets);
});

router.get("/sheets/:id", requireAuth, async (req, res) => {
  const sheet = await AttendanceSheet.findById(req.params.id)
    .populate("uploadedBy", "name email")
    .populate("drive", "companyName jobRole createdBy");
  
  if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  
  const drive = sheet.drive;
  if (req.user.role !== "HOD" && String(drive.createdBy?._id || drive.createdBy) !== req.user._id.toString()) {
    return res.status(403).json({ message: "You cannot access this sheet" });
  }
  
  res.json(sheet);
});

// Get Drive reports summary for HOD
router.get("/reports/drives-summary", requireAuth, requireRole("HOD"), async (req, res) => {
  try {
    const drives = await Drive.find({ driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }).lean();
    const summaries = await Promise.all(
      drives.map(async (drive) => {
        const stats = await DriveStudent.aggregate([
          { $match: { drive: drive._id } },
          {
            $group: {
              _id: "$drive",
              totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
              totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
              totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
              present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
              absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
            }
          }
        ]);
        const rep = stats[0] || { totalEligible: 0, totalRegistered: 0, totalSelected: 0, present: 0, absent: 0 };
        const grandTotal = rep.present + rep.absent;
        const presentPercent = grandTotal > 0 ? Math.round((rep.present / grandTotal) * 100) : 0;
        const absentPercent = grandTotal > 0 ? Math.round((rep.absent / grandTotal) * 100) : 0;
        return {
          driveId: drive._id,
          companyName: drive.companyName,
          jobRole: drive.jobRole,
          packageCtc: drive.packageCtc,
          driveDate: drive.driveDate,
          totalEligible: rep.totalEligible,
          totalRegistered: rep.totalRegistered,
          totalSelected: rep.totalSelected,
          present: rep.present,
          absent: rep.absent,
          grandTotal,
          presentPercent,
          absentPercent
        };
      })
    );
    res.json(summaries.filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Access Requests Routes
// Submit an access request (re-upload or edit sheet)
router.post("/access-requests", requireAuth, async (req, res) => {
  try {
    const { driveId, type, sheetId, reason, proposedChanges, updatedRows } = req.body;
    if (!driveId || !type || !reason) {
      return res.status(400).json({ message: "driveId, type, and reason are required" });
    }
    const drive = await Drive.findById(driveId);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const newRequest = await AccessRequest.create({
      drive: driveId,
      requester: req.user._id,
      type,
      sheet: sheetId || undefined,
      requestReason: reason,
      proposedChanges: proposedChanges || [],
      updatedRows: updatedRows || [],
      status: "PENDING"
    });

    await writeAudit({
      actor: req.user._id,
      action: `ACCESS_REQUEST_SUBMITTED_${type}`,
      entity: "AccessRequest",
      entityId: newRequest._id,
      metadata: { driveId, type, proposedChangesCount: proposedChanges?.length || 0 }
    });

    res.status(201).json(newRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get access requests list
router.get("/access-requests/list", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "HOD" ? {} : { requester: req.user._id };
    const requests = await AccessRequest.find(filter)
      .populate("drive", "companyName jobRole")
      .populate("requester", "name email role")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve/Reject access request (HOD only)
router.post("/access-requests/:id/decision", requireAuth, requireRole("HOD"), async (req, res) => {
  try {
    const { decision, remarks } = req.body; // APPROVED or REJECTED
    if (!decision || !["APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json({ message: "Valid decision (APPROVED or REJECTED) is required" });
    }

    const request = await AccessRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = decision;
    request.remarks = remarks || "";
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();

    if (decision === "APPROVED" && request.type === "EDIT_SHEET") {
      const drive = await Drive.findById(request.drive);
      if (!drive) return res.status(404).json({ message: "Drive not found" });

      const sheet = request.sheet ? await AttendanceSheet.findById(request.sheet) : null;
      
      // Process rows to update student records for this drive
      await processExistingDriveRows({
        drive,
        rows: request.updatedRows,
        userId: request.requester,
        markMissingAbsent: false,
        fileName: sheet ? `edited-${sheet.fileName}` : `${drive.companyName}-edited-data.xlsx`,
        fileType: "xlsx",
        headers: sheet?.headers || (request.updatedRows.length ? Object.keys(request.updatedRows[0]) : [])
      });

      request.status = "COMPLETED";
    }

    await request.save();

    await writeAudit({
      actor: req.user._id,
      action: `ACCESS_REQUEST_${decision}`,
      entity: "AccessRequest",
      entityId: request._id,
      metadata: { remarks }
    });

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
