import { Router } from "express";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import { Student } from "../models/Student.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

const systemFields = new Set([
  "rollNo", "enrollmentNo", "registrationNo", "name", "email", "phone", "batch", "admissionYear", "passingYear",
  "department", "course", "program", "branch", "semester", "section", "cgpa", "percentage", "tenthPercentage",
  "twelfthPercentage", "diplomaPercentage", "activeBacklogs", "totalBacklogs", "attendance", "category", "gender",
  "placementStatus", "resumeUrl"
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
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferSystemField(header) {
  const key = normalizeHeader(header);
  if (key.includes("enrollment")) return "enrollmentNo";
  if (key.includes("registration") || key === "regno") return "registrationNo";
  if (key.includes("roll")) return "rollNo";
  if (key.includes("student") || key.includes("name")) return "name";
  if (key.includes("email") || key.includes("mail")) return "email";
  if (key.includes("phone") || key.includes("mobile")) return "phone";
  if (key.includes("batch")) return "batch";
  if (key.includes("admission")) return "admissionYear";
  if (key.includes("passing")) return "passingYear";
  if (key.includes("department")) return "department";
  if (key.includes("branch")) return "branch";
  if (key.includes("course")) return "course";
  if (key.includes("program")) return "program";
  if (key.includes("semester") || key === "sem") return "semester";
  if (key.includes("section")) return "section";
  if (key.includes("cgpa")) return "cgpa";
  if (key.includes("attendance")) return "attendance";
  if (key.includes("activebacklog")) return "activeBacklogs";
  if (key.includes("totalbacklog")) return "totalBacklogs";
  if (key.includes("backlog")) return "backlogs";
  if (key.includes("category")) return "category";
  if (key.includes("gender")) return "gender";
  if (key.includes("placement")) return "placementStatus";
  if (key.includes("resume")) return "resumeUrl";
  return "customFields";
}

function effectiveMapping(row, mapping = {}) {
  const finalMapping = { ...mapping };
  for (const header of Object.keys(row)) {
    if (!finalMapping[header] || finalMapping[header] === "customFields") {
      const inferred = inferSystemField(header);
      if (inferred !== "customFields") finalMapping[header] = inferred;
    }
  }
  return finalMapping;
}

function buildStudentPayload(row, mapping, connectionId, rowNumber) {
  const payload = { customFields: {}, source: { connection: connectionId, rowNumber, lastSeenAt: new Date(), lastSyncedAt: new Date() }, sourceStatus: "SYNCED" };
  const usableMapping = effectiveMapping(row, mapping);
  for (const [sheetColumn, systemField] of Object.entries(usableMapping)) {
    const raw = sanitizeCell(row[sheetColumn]);
    if (!systemField || systemField === "customFields") {
      payload.customFields[sheetColumn] = raw;
    } else if (systemFields.has(systemField)) {
      payload[systemField] = raw;
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (!Object.keys(usableMapping).includes(key) || usableMapping[key] === "customFields") payload.customFields[key] = sanitizeCell(value);
  }
  ["semester", "cgpa", "attendance", "backlogs", "activeBacklogs", "totalBacklogs", "admissionYear", "passingYear", "percentage", "tenthPercentage", "twelfthPercentage", "diplomaPercentage"].forEach((field) => {
    if (field in payload) payload[field] = normalizeNumber(payload[field]);
  });
  payload.backlogs = payload.backlogs ?? payload.activeBacklogs ?? 0;
  payload.department = payload.department || payload.branch || "Unmapped";
  payload.program = payload.program || payload.course || payload.branch || "Unmapped";
  payload.semester = payload.semester || 1;
  payload.cgpa = payload.cgpa ?? 0;
  payload.attendance = payload.attendance ?? 0;
  payload.name = payload.name || "Unnamed Student";
  payload.rollNo = payload.rollNo || payload.enrollmentNo || payload.registrationNo || payload.email;
  payload.studentId = payload.enrollmentNo || payload.registrationNo || payload.rollNo || payload.email || crypto.randomUUID();
  payload.source.rowHash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return payload;
}

function studentMatch(payload) {
  if (payload.enrollmentNo) return { enrollmentNo: payload.enrollmentNo };
  if (payload.registrationNo) return { registrationNo: payload.registrationNo };
  if (payload.rollNo) return { rollNo: payload.rollNo, department: payload.department };
  if (payload.email) return { email: payload.email };
  return { studentId: payload.studentId };
}

async function fetchCsv(connection) {
  const url = `https://docs.google.com/spreadsheets/d/${connection.sheetId}/export?format=csv&gid=${connection.gid || "0"}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Sheet is not accessible. Check sharing permissions.");
  return response.text();
}

router.use(requireAuth);

router.get("/connection", requireRole("HOD"), async (_req, res) => {
  const connection = await SpreadsheetConnection.findOne().sort({ updatedAt: -1 });
  const logs = connection ? await SpreadsheetSyncLog.find({ connection: connection._id }).sort({ createdAt: -1 }).limit(10) : [];
  res.json({ connection, logs });
});

router.post("/connection", requireRole("HOD"), async (req, res) => {
  const parsed = z.object({
    sheetUrl: z.string().url(),
    worksheetName: z.string().optional(),
    columnMapping: z.record(z.string()).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid Google Sheet URL is required" });

  const sheetId = extractSheetId(parsed.data.sheetUrl);
  if (!sheetId) return res.status(400).json({ message: "This does not look like a valid Google Sheet link" });

  const connection = await SpreadsheetConnection.create({
    sheetUrl: parsed.data.sheetUrl,
    sheetId,
    gid: extractGid(parsed.data.sheetUrl),
    worksheetName: parsed.data.worksheetName || "Sheet1",
    columnMapping: parsed.data.columnMapping || {},
    createdBy: req.user._id
  });
  await writeAudit({ actor: req.user._id, action: "SHEET_CONNECTED", entity: "SpreadsheetConnection", entityId: connection._id });
  res.status(201).json(connection);
});

router.post("/connection/test", requireRole("HOD"), async (req, res) => {
  const sheetId = extractSheetId(req.body.sheetUrl || "");
  if (!sheetId) return res.status(400).json({ message: "Valid Google Sheet URL is required" });
  const connection = { sheetId, gid: extractGid(req.body.sheetUrl) };
  const csv = await fetchCsv(connection);
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  res.json({ headers: rows.length ? Object.keys(rows[0]) : [], sampleRows: rows.slice(0, 5), totalRows: rows.length });
});

router.post("/connection/:id/sync", requireRole("HOD"), async (req, res) => {
  const connection = await SpreadsheetConnection.findById(req.params.id);
  if (!connection) return res.status(404).json({ message: "Sheet connection not found" });
  const log = await SpreadsheetSyncLog.create({ connection: connection._id, startedBy: req.user._id });
  const summary = { totalRows: 0, successfulRows: 0, failedRows: 0, newRecords: 0, updatedRecords: 0, unchangedRecords: 0, duplicateRecords: 0, conflictCount: 0 };
  const errors = [];

  try {
    const csv = await fetchCsv(connection);
    const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    summary.totalRows = rows.length;
    const seenIds = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = buildStudentPayload(rows[index], Object.fromEntries(connection.columnMapping || []), connection._id, index + 2);
        const match = studentMatch(payload);
        const seenKey = JSON.stringify(match);
        if (seenIds.has(seenKey)) {
          summary.duplicateRecords += 1;
          continue;
        }
        seenIds.add(seenKey);
        const existing = await Student.findOne(match);
        if (!existing) {
          await Student.create({ ...payload, createdBy: req.user._id });
          summary.newRecords += 1;
        } else if (existing.source?.rowHash === payload.source.rowHash) {
          existing.sourceStatus = "SYNCED";
          existing.source.lastSeenAt = new Date();
          await existing.save();
          summary.unchangedRecords += 1;
        } else {
          await Student.updateOne({ _id: existing._id }, { $set: payload });
          summary.updatedRecords += 1;
        }
        summary.successfulRows += 1;
      } catch (error) {
        summary.failedRows += 1;
        errors.push({ row: index + 2, message: error.message });
      }
    }

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
});

export default router;
