import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import { Student } from "../models/Student.js";
import { calculateCGPA } from "./studentRules.js";
import { triggerSpreadsheetUpdate } from "./spreadsheetSync.js";
import crypto from "crypto";
import { parse } from "csv-parse/sync";

const systemFields = new Set([
  "rollNo", "enrollmentNo", "registrationNo", "grNo", "universityId", "name", "email", "phone",
  "fatherContactNo", "batch", "admissionYear", "passingYear", "department", "course", "program",
  "branch", "specialization", "semester", "section", "cgpa", "percentage", "tenthPercentage",
  "tenthPassingYear", "twelfthPercentage", "twelfthPassingYear", "diplomaPercentage",
  "graduationPercentage", "pgStreams", "backlogs", "activeBacklogs", "totalBacklogs", "attendance",
  "category", "gender", "dob", "domicileCity", "domicileState", "address", "college",
  "placementStatus", "resumeUrl", "status"
]);

function sanitizeCell(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  let clean = String(value).trim();
  
  const upper = clean.toUpperCase();
  if (upper.includes("AWAITED") || upper.includes("RE-APPEAR") || upper.includes("RP") || upper.includes("RA") || upper.includes("FAIL")) {
    return clean;
  }
  
  if (/^(n\/?a|nil|none|no)$/i.test(clean)) return 0;
  if (clean.includes("%")) {
    clean = clean.replace(/%/g, "").trim();
  }
  clean = clean.replace(/,/g, "");
  
  if (/[a-zA-Z]/.test(clean) && !/^\s*-?\d+(\.\d+)?\s*$/.test(clean)) {
    return value;
  }

  const numericMatch = clean.match(/-?\d+(\.\d+)?/);
  if (numericMatch) clean = numericMatch[0];
  const number = Number(clean);
  return Number.isFinite(number) ? number : value;
}

function applyNumberConstraints(payload) {
  const numberRules = {
    semester: { min: 1, max: 12, fallback: 1 },
    cgpa: { min: 0, max: 100, fallback: 0 },
    attendance: { min: 0, max: 100, fallback: 0 },
    backlogs: { min: 0, fallback: 0 },
    activeBacklogs: { min: 0, fallback: 0 },
    totalBacklogs: { min: 0, fallback: 0 },
    admissionYear: { min: 1900 },
    passingYear: { min: 1900 },
    percentage: { min: 0, max: 100 },
    tenthPercentage: { min: 0, max: 100 },
    tenthPassingYear: { min: 1900 },
    twelfthPercentage: { min: 0, max: 100 },
    twelfthPassingYear: { min: 1900 },
    diplomaPercentage: { min: 0, max: 100 },
    graduationPercentage: { min: 0, max: 100 }
  };

  for (const [field, rule] of Object.entries(numberRules)) {
    if (!(field in payload)) continue;
    const number = Number(payload[field]);
    if (!Number.isFinite(number)) {
      if (rule.fallback !== undefined) payload[field] = rule.fallback;
      else delete payload[field];
      continue;
    }
    const min = rule.min ?? -Infinity;
    const max = rule.max ?? Infinity;
    if (number < min || number > max) {
      if (rule.fallback !== undefined) payload[field] = rule.fallback;
      else delete payload[field];
      continue;
    }
    payload[field] = number;
  }
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
  if (key.includes("currentsemester") || key.includes("semester") || key === "sem") return "semester";
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
    if (!finalMapping[header] || finalMapping[header] === "customFields") {
      const inferred = inferSystemField(header);
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
  
  const d = new Date(str);
  if (Number.isFinite(d.getTime())) return d;
  
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    const part0 = Number(parts[0]);
    const part1 = Number(parts[1]);
    const part2 = Number(parts[2]);
    
    if (parts[2].length === 4 && part0 >= 1 && part0 <= 31 && part1 >= 1 && part1 <= 12) {
      return new Date(part2, part1 - 1, part0);
    }
    if (parts[0].length === 4 && part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31) {
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
  
  for (const [sheetColumn, systemField] of Object.entries(usableMapping)) {
    const raw = sanitizeCell(row[sheetColumn]);
    if (systemField === "status") {
      payload._sheetStatusColumnSeen = true;
    }
    if (!systemField || systemField === "customFields") {
      payload.customFields[sheetColumn] = raw;
    } else if (systemField.startsWith("semester.")) {
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
  
  for (const [key, value] of Object.entries(row)) {
    if (!Object.keys(usableMapping).includes(key) || usableMapping[key] === "customFields") {
      payload.customFields[key] = sanitizeCell(value);
    }
  }
  
  const numericFields = [
    "semester", "cgpa", "attendance", "backlogs", "activeBacklogs", "totalBacklogs",
    "admissionYear", "passingYear", "percentage", "tenthPercentage", "tenthPassingYear",
    "twelfthPercentage", "twelfthPassingYear", "diplomaPercentage", "graduationPercentage"
  ];
  numericFields.forEach(field => {
    if (field in payload) payload[field] = normalizeNumber(payload[field]);
  });
  
  const cgpaResult = calculateCGPA(payload);
  payload.cgpa = payload.cgpa ?? cgpaResult.average;
  
  if (payload.cgpa !== undefined && payload.cgpa !== null && payload.cgpa > 10) {
    payload.cgpa = payload.cgpa / 10;
  }
  
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
  payload.studentId = payload.enrollmentNo || payload.registrationNo || payload.grNo || payload.universityId || payload.rollNo || payload.email || `${connection._id.toString()}-row-${rowNumber}`;
  applyNumberConstraints(payload);
  const normalizedStatus = String(payload.status || "").trim().toLowerCase();
  if (["stuck off", "struck off", "stuck_off", "struck_off"].includes(normalizedStatus)) {
    payload.driveRestriction = {
      ...(payload.driveRestriction || {}),
      status: "STUCK_OFF",
      reason: "Marked Struck Off from synced master sheet status column.",
      updatedAt: new Date()
    };
  } else if (normalizedStatus === "active" || normalizedStatus === "clear") {
    payload.driveRestriction = {
      ...(payload.driveRestriction || {}),
      status: "CLEAR",
      reason: "Marked clear from synced master sheet status column.",
      updatedAt: new Date()
    };
  }
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

function studentMatchConditions(payload) {
  const conditions = [];
  if (payload.grNo) conditions.push({ grNo: payload.grNo });
  if (payload.universityId) conditions.push({ universityId: payload.universityId });
  if (payload.enrollmentNo) conditions.push({ enrollmentNo: payload.enrollmentNo });
  if (payload.registrationNo) conditions.push({ registrationNo: payload.registrationNo });
  if (payload.rollNo && payload.department && payload.department !== "Unmapped") {
    conditions.push({ rollNo: payload.rollNo, department: payload.department });
  }
  if (payload.rollNo) conditions.push({ rollNo: payload.rollNo });
  if (payload.email) conditions.push({ email: payload.email });
  if (payload.studentId) conditions.push({ studentId: payload.studentId });
  return conditions;
}

function studentMatch(payload) {
  if (payload.grNo) return { grNo: payload.grNo };
  if (payload.universityId) return { universityId: payload.universityId };
  if (payload.enrollmentNo) return { enrollmentNo: payload.enrollmentNo };
  if (payload.registrationNo) return { registrationNo: payload.registrationNo };
  if (payload.rollNo && payload.department && payload.department !== "Unmapped") {
    return { rollNo: payload.rollNo, department: payload.department };
  }
  if (payload.rollNo) return { rollNo: payload.rollNo };
  if (payload.email) return { email: payload.email };
  return { studentId: payload.studentId };
}

async function findExistingStudent(payload) {
  const primaryMatch = studentMatch(payload);
  let existing = await Student.findOne(primaryMatch);
  if (existing) return existing;
  const conditions = studentMatchConditions(payload);
  return conditions.length ? Student.findOne({ $or: conditions }) : null;
}

async function fetchCsv(connection) {
  const url = `https://docs.google.com/spreadsheets/d/${connection.sheetId}/export?format=csv&gid=${connection.gid || "0"}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Sheet is not accessible. Check sharing permissions.");
  return response.text();
}

export async function runBackgroundSync() {
  console.log("[AutoSync] Starting background synchronization of Google Sheets...");
  try {
    const connections = await SpreadsheetConnection.find();
    if (!connections.length) {
      console.log("[AutoSync] No spreadsheet connections found. Skipping.");
      return;
    }
    
    for (const connection of connections) {
      console.log(`[AutoSync] Syncing batch: ${connection.batch} (${connection.name})...`);
      const log = await SpreadsheetSyncLog.create({ 
        connection: connection._id,
        startedBy: connection.createdBy || null
      });
      const summary = { totalRows: 0, successfulRows: 0, failedRows: 0, newRecords: 0, updatedRecords: 0, unchangedRecords: 0, duplicateRecords: 0, conflictCount: 0 };
      const errors = [];
      
      try {
        const csv = await fetchCsv(connection);
        const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
        summary.totalRows = rows.length;
        
        for (let index = 0; index < rows.length; index += 1) {
          try {
            const row = rows[index];
            const hasData = Object.values(row).some(val => val && String(val).trim().length > 0);
            if (!hasData) continue;

            const payload = buildStudentPayload(row, connection.columnMapping || {}, connection, index + 2);
            if (payload.name === "Unnamed Student" && !payload.rollNo && !payload.email && !payload.grNo && !payload.universityId) {
              continue;
            }

            const existing = await findExistingStudent(payload);
            applySheetStatusIntent(payload, existing);
            const preservedNoc = existing ? preserveManualNoc(payload, existing) : false;
            const preservedRestriction = !preservedNoc && existing ? preserveAttendanceRestriction(payload, existing) : false;
            finalizeStudentPayload(payload);
            
            if (!existing) {
              await Student.create({ ...payload, createdBy: connection.createdBy || null });
              summary.newRecords += 1;
            } else if (existing.source?.rowHash === payload.source.rowHash) {
              existing.sourceStatus = "SYNCED";
              existing.source.lastSeenAt = new Date();
              await existing.save();
              if (preservedRestriction) {
                await triggerSpreadsheetUpdate(existing, { statusOnly: true, skipNoc: true });
              }
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
          } catch (error) {
            summary.failedRows += 1;
            errors.push({ row: index + 2, message: error.message });
          }
        }
        
        await Student.updateMany({ "source.connection": connection._id, "source.lastSeenAt": { $lt: log.startedAt } }, { $set: { sourceStatus: "MISSING_FROM_SOURCE" } });
        connection.lastSyncAt = new Date();
        connection.lastSummary = summary;
        connection.status = "CONNECTED";
        await connection.save();
        
        log.status = "COMPLETED";
        log.summary = summary;
        log.errors = errors;
        log.finishedAt = new Date();
        await log.save();
        console.log(`[AutoSync] Completed sync for ${connection.name}. Success: ${summary.successfulRows}, Failed: ${summary.failedRows}`);
      } catch (error) {
        log.status = "FAILED";
        log.errors = [{ message: error.message }];
        log.finishedAt = new Date();
        await log.save();
        
        connection.status = "ERROR";
        await connection.save();
        console.error(`[AutoSync] Failed to sync connection ${connection._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[AutoSync] Global auto-sync error:", error);
  }
}

export function startAutoSyncInterval(intervalMs = 5 * 60 * 1000) {
  // Sync every 5 minutes by default
  setInterval(runBackgroundSync, intervalMs);
  console.log(`[AutoSync] Background auto-sync scheduled every ${intervalMs / 1000 / 60} minutes.`);
}
