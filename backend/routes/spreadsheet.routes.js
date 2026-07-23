import { Router } from "express";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import { Student } from "../models/Student.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { writeAudit } from "../utils/audit.js";
import { calculateCGPA } from "../utils/studentRules.js";
import { runBackgroundSync } from "../utils/autoSync.js";
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";

const router = Router();

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const systemFields = new Set([
  "rollNo", "enrollmentNo", "registrationNo", "grNo", "universityId", "name", "email", "phone",
  "fatherContactNo", "batch", "admissionYear", "passingYear", "department", "course", "program",
  "branch", "specialization", "semester", "section", "cgpa", "percentage", "tenthPercentage",
  "tenthPassingYear", "twelfthPercentage", "twelfthPassingYear", "diplomaPercentage",
  "graduationPercentage", "pgStreams", "backlogs", "activeBacklogs", "totalBacklogs", "attendance",
  "category", "gender", "dob", "domicileCity", "domicileState", "address", "college",
  "placementStatus", "resumeUrl", "status"
]);

function extractSheetId(sheetUrl) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1];
}

function extractGid(sheetUrl) {
  return sheetUrl.match(/[?&#]gid=(\d+)/)?.[1] || "0";
}

function sanitizeCell(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  let clean = String(value).trim();
  if (/^(n\/?a|nil|none|no)$/i.test(clean)) return 0;
  if (clean.includes("%")) {
    clean = clean.replace(/%/g, "").trim();
  }
  clean = clean.replace(/,/g, "");
  const numericMatch = clean.match(/-?\d+(\.\d+)?/);
  if (numericMatch) clean = numericMatch[0];
  const number = Number(clean);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferSystemField(header) {
  const key = normalizeHeader(header);
  if (key === "status") return "status";
  if (key.includes("grno")) return "grNo";
  if (key.includes("universityid")) return "universityId";
  if (key.includes("enrollment")) return "enrollmentNo";
  if (key.includes("registration") || key === "regno") return "registrationNo";
  if (key.includes("roll")) return "rollNo";
  if (key.includes("studentname") || key.includes("student_name")) return "name";
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
  if (key === "currentsemester" || key === "semester" || key === "sem") return "semester";
  if (key.includes("section")) return "section";
  if (key.includes("average") && key.includes("cgpa")) return "cgpa";
  if (key.includes("cgpa")) return "cgpa";
  if (key.includes("attendance")) return "attendance";
  if (key.includes("activebacklog") || key.includes("currentbacklog") || key.includes("livebacklog") || key.includes("pendingbacklog")) return "activeBacklogs";
  if (key.includes("totalbacklog") || key.includes("overallbacklog") || key.includes("historybacklog")) return "totalBacklogs";
  if (key.includes("backlog")) return "backlogs";
  if ((key.includes("active") || key.includes("current") || key.includes("live") || key.includes("pending")) && key.includes("arrear")) return "activeBacklogs";
  if ((key.includes("total") || key.includes("overall") || key.includes("history")) && key.includes("arrear")) return "totalBacklogs";
  if (key.includes("arrear") || key.includes("backpaper") || key.includes("atkt") || key === "kt") return "backlogs";
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
    if (key.includes("passing") || key.includes("paasing") || key.includes("year")) return "tenthPassingYear";
    return "tenthPercentage";
  }
  if (key.includes("class12") || key.includes("12th")) {
    if (key.includes("passing") || key.includes("paasing") || key.includes("year")) return "twelfthPassingYear";
    return "twelfthPercentage";
  }
  if (key.includes("diploma")) return "diplomaPercentage";
  if (key.includes("graduation")) return "graduationPercentage";
  if (key.includes("pgstreams") || key.includes("pgstream")) return "pgStreams";
  if (key.includes("placement")) return "placementStatus";
  if (key.includes("resume")) return "resumeUrl";
  
  // Check for semester percentage/status
  const semMatch = key.match(/sem(\d+)/);
  if (semMatch) {
    const semNum = semMatch[1];
    if (key.includes("status") || key.includes("statussem")) return `semester.${semNum}.status`;
    return `semester.${semNum}.percentage`;
  }
  
  return "customFields";
}

function effectiveMapping(row, mapping = {}) {
  const finalMapping = { ...mapping };
  for (const header of Object.keys(row)) {
    const inferred = inferSystemField(header);
    if (finalMapping[header] === "semester" && inferred.startsWith("semester.")) {
      finalMapping[header] = inferred;
      continue;
    }
    if (!finalMapping[header] || finalMapping[header] === "customFields") {
      if (inferred !== "customFields") finalMapping[header] = inferred;
    }
  }
  return finalMapping;
}

function parseDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  if (!str) return undefined;
  
  // Try standard JS Date parsing first
  const d = new Date(str);
  if (Number.isFinite(d.getTime())) return d;
  
  // Handle DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    const part0 = Number(parts[0]);
    const part1 = Number(parts[1]);
    const part2 = Number(parts[2]);
    
    if (parts[2].length === 4 && part0 >= 1 && part0 <= 31 && part1 >= 1 && part1 <= 12) {
      // DD-MM-YYYY
      return new Date(part2, part1 - 1, part0);
    }
    if (parts[0].length === 4 && part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31) {
      // YYYY-MM-DD
      return new Date(part0, part1 - 1, part2);
    }
  }
  return undefined;
}

function buildStudentPayload(row, mapping, connection, rowNumber) {
  const payload = {
    customFields: {},
    semesters: {},
    source: {
      connection: connection._id,
      rowNumber,
      lastSeenAt: new Date(),
      lastSyncedAt: new Date()
    },
    sourceStatus: "SYNCED"
  };
  
  const usableMapping = effectiveMapping(row, mapping);
  
  // Process each mapped column
  for (const [sheetColumn, systemField] of Object.entries(usableMapping)) {
    const raw = sanitizeCell(row[sheetColumn]);
    if (systemField === "status") {
      payload._sheetStatusColumnSeen = true;
    }
    if (!systemField || systemField === "customFields") {
      payload.customFields[sheetColumn] = raw;
    } else if (systemField.startsWith("semester.")) {
      // Handle semester subfields
      const parts = systemField.split(".");
      const semNum = parts[1];
      const subField = parts[2];
      if (!payload.semesters[semNum]) {
        payload.semesters[semNum] = {};
      }
      if (subField === "percentage") {
        payload.semesters[semNum][subField] = normalizeNumber(raw);
      } else {
        payload.semesters[semNum][subField] = raw;
      }
    } else if (systemFields.has(systemField)) {
      if (systemField === "dob") {
        payload[systemField] = parseDate(raw);
      } else {
        payload[systemField] = raw;
      }
    }
  }
  
  // Add any remaining columns as custom fields
  for (const [key, value] of Object.entries(row)) {
    if (!Object.keys(usableMapping).includes(key) || usableMapping[key] === "customFields") {
      payload.customFields[key] = sanitizeCell(value);
    }
  }
  
  // Normalize number fields
  const numericFields = [
    "semester", "cgpa", "attendance", "backlogs", "activeBacklogs", "totalBacklogs",
    "admissionYear", "passingYear", "percentage", "tenthPercentage", "tenthPassingYear",
    "twelfthPercentage", "twelfthPassingYear", "diplomaPercentage", "graduationPercentage"
  ];
  numericFields.forEach(field => {
    if (field in payload) payload[field] = normalizeNumber(payload[field]);
  });
  if (!Number.isInteger(payload.semester) || payload.semester < 1 || payload.semester > 12) {
    delete payload.semester;
  }
  
  // Calculate CGPA from semesters
  const cgpaResult = calculateCGPA(payload);
  payload.cgpa = payload.cgpa ?? cgpaResult.average;
  
  // Scale down CGPA if entered as a percentage (e.g. > 10)
  if (payload.cgpa !== undefined && payload.cgpa !== null && payload.cgpa > 10) {
    payload.cgpa = payload.cgpa / 10;
  }
  
  // Fallback values
  payload.course = payload.course || payload.branch || "Unmapped";
  payload.batch = connection.batch || payload.batch || payload.passingYear || "Unmapped";
  payload.activeBacklogs = payload.activeBacklogs ?? payload.backlogs ?? 0;
  payload.totalBacklogs = payload.totalBacklogs ?? payload.backlogs ?? 0;
  payload.backlogs = payload.backlogs ?? payload.activeBacklogs ?? 0;
  payload.department = payload.department || payload.branch || "Unmapped";
  payload.program = payload.program || payload.course || payload.branch || "Unmapped";
  payload.semester = payload.semester || 1;
  payload.attendance = payload.attendance ?? 0;
  payload.name = payload.name || "Unnamed Student";
  payload.rollNo = payload.rollNo || payload.enrollmentNo || payload.registrationNo || payload.email;
  // Use row number + connection ID to guarantee uniqueness, even if other fields are missing!
  payload.studentId = payload.enrollmentNo || payload.registrationNo || payload.grNo || payload.universityId || payload.rollNo || payload.email || `${connection._id.toString()}-row-${rowNumber}`;
  payload.source.rowHash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  removeBlankUniqueIdentifiers(payload);
  
  return payload;
}

function removeBlankUniqueIdentifiers(payload) {
  for (const field of ["rollNo", "enrollmentNo", "registrationNo", "grNo", "universityId", "email"]) {
    if (payload[field] !== undefined && payload[field] !== null && !String(payload[field]).trim()) {
      delete payload[field];
    }
  }
  if (!payload.studentId || !String(payload.studentId).trim()) {
    payload.studentId = `${payload.source.connection.toString()}-row-${payload.source.rowNumber}`;
  }
  payload.source.rowHash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function finalizeStudentPayload(payload) {
  delete payload._sheetStatusColumnSeen;
  removeBlankUniqueIdentifiers(payload);
}

function studentMatch(payload) {
  if (payload.grNo) return { grNo: payload.grNo }; // Check grNo first (most unique)
  if (payload.universityId) return { universityId: payload.universityId };
  if (payload.enrollmentNo) return { enrollmentNo: payload.enrollmentNo };
  if (payload.registrationNo) return { registrationNo: payload.registrationNo };
  if (payload.rollNo && payload.department && payload.department !== "Unmapped") {
    return { rollNo: payload.rollNo, department: payload.department };
  }
  if (payload.rollNo) return { rollNo: payload.rollNo }; // If department is Unmapped, just use rollNo
  if (payload.email) return { email: payload.email };
  return { studentId: payload.studentId };
}

function sourceStatusIntent(payload) {
  const normalizedStatus = String(payload.status || "").trim().toLowerCase();
  if (normalizedStatus === "noc") return "NOC";
  if (["stuck off", "struck off", "stuck_off", "struck_off"].includes(normalizedStatus)) return "STUCK_OFF";
  if (normalizedStatus === "active" || normalizedStatus === "clear") return "CLEAR";
  if (payload._sheetStatusColumnSeen && !normalizedStatus) return "CLEAR";
  return null;
}

function applySheetStatusIntent(payload, existing) {
  const intent = sourceStatusIntent(payload);
  if (!intent) return;

  if (intent === "NOC") {
    if (String(existing?.status || "").trim().toUpperCase() === "NOC") {
      payload.status = "NOC";
      payload.driveRestriction = existing.driveRestriction;
    } else {
      payload.status = existing?.status || "Active";
    }
    return;
  }

  if (String(existing?.status || "").trim().toUpperCase() === "NOC") {
    payload.status = "NOC";
    payload.driveRestriction = existing.driveRestriction;
    return;
  }

  if (intent === "STUCK_OFF") {
    payload.status = "Struck Off";
    payload.driveRestriction = {
      ...(payload.driveRestriction || {}),
      status: "STUCK_OFF",
      reason: "Marked Struck Off from synced master sheet status column.",
      updatedAt: new Date()
    };
  } else if (intent === "CLEAR") {
    payload.status = "Active";
    payload.driveRestriction = {
      ...(payload.driveRestriction || {}),
      status: "CLEAR",
      reason: "Marked clear from synced master sheet status column.",
      updatedAt: new Date(),
      clearedAt: new Date()
    };
  }
}

function preserveManualNoc(payload, existing) {
  if (String(existing?.status || "").trim().toUpperCase() !== "NOC") return false;
  if (sourceStatusIntent(payload) === "NOC") return false;

  payload.status = "NOC";
  payload.driveRestriction = existing.driveRestriction;
  payload.source.rowHash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return true;
}

function preserveAttendanceRestriction(payload, existing) {
  if (String(existing?.status || "").trim().toUpperCase() === "NOC") return false;
  if (!existing?.driveRestriction || existing.driveRestriction.status !== "STUCK_OFF") return false;
  if (sourceStatusIntent(payload)) return false;

  payload.driveRestriction = existing.driveRestriction;
  payload.status = existing.status || "Struck Off";
  payload.source.rowHash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return true;
}

async function fetchCsv(connection) {
  const url = `https://docs.google.com/spreadsheets/d/${connection.sheetId}/export?format=csv&gid=${connection.gid || "0"}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("Google Sheet is not accessible. Please set sharing to anyone with the link can view, then test again.");
    error.status = 400;
    throw error;
  }
  return response.text();
}

// Webhook endpoint for live real-time sync from Google Sheets
router.post("/webhook-sync", asyncHandler(async (req, res) => {
  const { sheetId, batch } = req.query;
  const filter = {};
  if (sheetId) filter.sheetId = sheetId;
  if (batch) filter.batch = batch;

  const connections = await SpreadsheetConnection.find(filter);
  if (!connections.length) {
    return res.status(404).json({ message: "No matching spreadsheet connection found" });
  }

  // Trigger sync asynchronously in background
  runBackgroundSync();
  res.json({ message: "Sync triggered via live spreadsheet webhook", matchedConnections: connections.length });
}));

router.use(requireAuth);

router.get("/connection", requireRole("HOD"), asyncHandler(async (_req, res) => {
  const connections = await SpreadsheetConnection.find().sort({ batch: 1 }).lean();
  const logs = await SpreadsheetSyncLog.find().sort({ createdAt: -1 }).limit(10);
  const connectionsWithCounts = await Promise.all(connections.map(async (connection) => ({
    ...connection,
    syncedRecordCount: await Student.countDocuments({
      "source.connection": connection._id,
      sourceStatus: { $nin: ["MISSING_FROM_SOURCE", "ARCHIVED_FROM_SOURCE"] }
    })
  })));
  res.json({ connections: connectionsWithCounts, logs });
}));

router.post("/connection", requireRole("HOD"), asyncHandler(async (req, res) => {
  const parsed = z.object({
    sheetUrl: z.string().url(),
    appsScriptUrl: z.string().url().optional().or(z.literal("")),
    worksheetName: z.string().optional(),
    batch: z.string().min(1),
    columnMapping: z.record(z.string()).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid Google Sheet URL and Batch are required" });

  const sheetId = extractSheetId(parsed.data.sheetUrl);
  if (!sheetId) return res.status(400).json({ message: "This does not look like a valid Google Sheet link" });

  // Delete any existing connection for this batch to prevent duplicates
  await SpreadsheetConnection.deleteMany({ batch: parsed.data.batch });

  const connection = await SpreadsheetConnection.create({
    name: `Master Student Sheet - ${parsed.data.batch}`,
    batch: parsed.data.batch,
    sheetUrl: parsed.data.sheetUrl,
    appsScriptUrl: parsed.data.appsScriptUrl || undefined,
    sheetId,
    gid: extractGid(parsed.data.sheetUrl),
    worksheetName: parsed.data.worksheetName || "Sheet1",
    columnMapping: parsed.data.columnMapping || {},
    createdBy: req.user._id
  });
  await writeAudit({ actor: req.user._id, action: "SHEET_CONNECTED", entity: "SpreadsheetConnection", entityId: connection._id });
  res.status(201).json(connection);
}));

router.put("/connection/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const parsed = z.object({
    sheetUrl: z.string().url(),
    appsScriptUrl: z.string().url().optional().or(z.literal("")),
    worksheetName: z.string().optional(),
    batch: z.string().min(1),
    columnMapping: z.record(z.string()).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid Google Sheet URL and Batch are required" });

  const sheetId = extractSheetId(parsed.data.sheetUrl);
  if (!sheetId) return res.status(400).json({ message: "This does not look like a valid Google Sheet link" });

  const duplicate = await SpreadsheetConnection.findOne({ batch: parsed.data.batch, _id: { $ne: req.params.id } });
  if (duplicate) return res.status(409).json({ message: `Batch ${parsed.data.batch} already has a connected sheet` });

  const connection = await SpreadsheetConnection.findByIdAndUpdate(req.params.id, {
    name: `Master Student Sheet - ${parsed.data.batch}`,
    batch: parsed.data.batch,
    sheetUrl: parsed.data.sheetUrl,
    appsScriptUrl: parsed.data.appsScriptUrl || undefined,
    sheetId,
    gid: extractGid(parsed.data.sheetUrl),
    worksheetName: parsed.data.worksheetName || "Sheet1",
    columnMapping: parsed.data.columnMapping || {}
  }, { new: true });
  if (!connection) return res.status(404).json({ message: "Connection not found" });

  await writeAudit({ actor: req.user._id, action: "SHEET_CONNECTION_UPDATED", entity: "SpreadsheetConnection", entityId: connection._id });
  res.json(connection);
}));

router.delete("/connection/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const connection = await SpreadsheetConnection.findByIdAndDelete(req.params.id);
  if (!connection) return res.status(404).json({ message: "Connection not found" });
  const students = await Student.find({ "source.connection": connection._id }).select("_id").lean();
  const studentIds = students.map((student) => student._id);
  const [studentDelete, driveStudentDelete] = await Promise.all([
    Student.deleteMany({ _id: { $in: studentIds } }),
    DriveStudent.deleteMany({ student: { $in: studentIds } }),
    SpreadsheetSyncLog.deleteMany({ connection: connection._id })
  ]);
  await writeAudit({
    actor: req.user._id,
    action: "SHEET_DISCONNECTED",
    entity: "SpreadsheetConnection",
    entityId: connection._id,
    metadata: {
      deletedStudents: studentDelete.deletedCount || 0,
      deletedDriveMappings: driveStudentDelete.deletedCount || 0
    }
  });
  res.json({ message: `Connection disconnected successfully. Removed ${studentDelete.deletedCount || 0} imported students.` });
}));

router.post("/connection/test", requireRole("HOD"), asyncHandler(async (req, res) => {
  const sheetId = extractSheetId(req.body.sheetUrl || "");
  if (!sheetId) return res.status(400).json({ message: "Valid Google Sheet URL is required" });
  const connection = { sheetId, gid: extractGid(req.body.sheetUrl) };
  const csv = await fetchCsv(connection);
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  res.json({ headers: rows.length ? Object.keys(rows[0]) : [], sampleRows: rows.slice(0, 5), totalRows: rows.length });
}));

router.post("/connection/:id/sync", requireRole("HOD"), asyncHandler(async (req, res) => {
  const connection = await SpreadsheetConnection.findById(req.params.id);
  if (!connection) return res.status(404).json({ message: "Sheet connection not found" });
  const log = await SpreadsheetSyncLog.create({ connection: connection._id, startedBy: req.user._id });
  const summary = { totalRows: 0, successfulRows: 0, failedRows: 0, newRecords: 0, updatedRecords: 0, unchangedRecords: 0, duplicateRecords: 0, conflictCount: 0 };
  const errors = [];

  try {
    const csv = await fetchCsv(connection);
    const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    console.log("CSV parsed successfully! Number of rows:", rows.length);
    summary.totalRows = rows.length;

    console.log("=== STARTING SYNC ===");
    console.log("Connection columnMapping:", connection.columnMapping);
    
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = buildStudentPayload(rows[index], connection.columnMapping || {}, connection, index + 2);
        const match = studentMatch(payload);
        
        if (index < 5) { // Log first 5 payloads for debugging
          console.log(`Row ${index + 2} - Payload:`, payload);
          console.log(`Row ${index + 2} - Match criteria:`, match);
        }
        
        const existing = await Student.findOne(match);
        applySheetStatusIntent(payload, existing);
        const preservedNoc = existing ? preserveManualNoc(payload, existing) : false;
        const preservedRestriction = !preservedNoc && existing ? preserveAttendanceRestriction(payload, existing) : false;
        finalizeStudentPayload(payload);
        
        if (!existing) {
          await Student.create({ ...payload, createdBy: req.user._id });
          summary.newRecords += 1;
          if (summary.newRecords <= 5) console.log(`Created new student for row ${index + 2}`);
        } else if (existing.source?.rowHash === payload.source.rowHash) {
          existing.sourceStatus = "SYNCED";
          existing.source.lastSeenAt = new Date();
          await existing.save();
          summary.unchangedRecords += 1;
        } else {
          await Student.updateOne({ _id: existing._id }, { $set: payload });
          if (preservedRestriction) {
            const updatedStudent = await Student.findById(existing._id);
            await triggerSpreadsheetUpdate(updatedStudent, { statusOnly: true, skipNoc: true });
          }
          summary.updatedRecords += 1;
        }
        
        summary.successfulRows += 1;
        
        if (summary.successfulRows % 100 === 0) {
          console.log(`Processed ${summary.successfulRows} rows so far...`);
        }
      } catch (error) {
        summary.failedRows += 1;
        errors.push({ row: index + 2, message: error.message });
        if (summary.failedRows <= 20) { // Log first 20 errors
          console.error(`Error processing row ${index + 2}:`, error.message, error.stack);
        }
      }
    }
    
    console.log("=== SYNC FINAL SUMMARY ===");
    console.log(summary);
    if (errors.length > 0) console.log("Errors:", errors);

    await Student.updateMany({ "source.connection": connection._id, "source.lastSeenAt": { $lt: log.startedAt } }, { $set: { sourceStatus: "MISSING_FROM_SOURCE" } });
    connection.lastSyncAt = new Date();
    connection.lastSummary = summary;
    await connection.save();
    log.status = "COMPLETED";
    log.summary = summary;
    log.errors = errors;
    log.finishedAt = new Date();
    await log.save();
    await writeAudit({ actor: req.user._id, action: "SHEET_SYNCED", entity: "SpreadsheetConnection", entityId: connection._id, metadata: summary });
    res.json({ summary, errors });
  } catch (error) {
    log.status = "FAILED";
    log.errors = [{ message: error.message }];
    log.finishedAt = new Date();
    await log.save();
    res.status(400).json({ message: error.message });
  }
}));

export default router;
