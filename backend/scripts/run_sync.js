import "dotenv/config";
import { connectDb } from "../config/db.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import { Student } from "../models/Student.js";
import { calculateCGPA } from "../utils/studentRules.js";
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";
import crypto from "crypto";
import { parse } from "csv-parse/sync";
import mongoose from "mongoose";

// Duplicate helper functions from routes to sync cleanly
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

async function fetchCsv(connection) {
  const url = `https://docs.google.com/spreadsheets/d/${connection.sheetId}/export?format=csv&gid=${connection.gid || "0"}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Sheet is not accessible. Check sharing permissions.");
  return response.text();
}

async function runSync() {
  await connectDb();
  const connections = await SpreadsheetConnection.find();
  if (connections.length === 0) {
    console.error("No Spreadsheet Connections found in DB.");
    mongoose.connection.close();
    process.exit(1);
  }
  
  for (const connection of connections) {
    console.log(`\n=== Starting Sync for Batch: ${connection.batch || "Unmapped"} (${connection.name}) ===`);
    console.log("Found connection ID:", connection._id);
    console.log("Sheet URL:", connection.sheetUrl);

    const log = await SpreadsheetSyncLog.create({ connection: connection._id, startedBy: new mongoose.Types.ObjectId("6a5b76765b198b02d0142a1f") }); // Seed user or existing HOD
    const summary = { totalRows: 0, successfulRows: 0, failedRows: 0, newRecords: 0, updatedRecords: 0, unchangedRecords: 0, duplicateRecords: 0, conflictCount: 0 };
    const errors = [];

    try {
      const csv = await fetchCsv(connection);
      const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
      console.log("CSV parsed successfully! Number of rows:", rows.length);
      summary.totalRows = rows.length;

      console.log(`Syncing existing students for connection ${connection._id} without clearing computed drive restrictions.`);

      for (let index = 0; index < rows.length; index += 1) {
        try {
          const payload = buildStudentPayload(rows[index], connection.columnMapping || {}, connection, index + 2);
          const match = studentMatch(payload);
          
              const existing = await Student.findOne(match);
              applySheetStatusIntent(payload, existing);
              const preservedNoc = existing ? preserveManualNoc(payload, existing) : false;
          const preservedRestriction = !preservedNoc && existing ? preserveAttendanceRestriction(payload, existing) : false;
          finalizeStudentPayload(payload);
          if (!existing) {
            await Student.create({ ...payload, createdBy: new mongoose.Types.ObjectId("6a5b76765b198b02d0142a1f") });
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
          if (summary.successfulRows % 200 === 0) {
            console.log(`Processed ${summary.successfulRows} / ${rows.length} rows...`);
          }
        } catch (error) {
          summary.failedRows += 1;
          errors.push({ row: index + 2, message: error.message });
          if (summary.failedRows <= 10) {
            console.error(`Error processing row ${index + 2}:`, error.message);
          }
        }
      }

      console.log("=== SYNC FINAL SUMMARY ===");
      console.log(summary);
      if (errors.length > 0) {
        console.log(`Errors count: ${errors.length}. Sample:`, errors.slice(0, 5));
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
      console.log("Sync log updated in database.");
    } catch (error) {
      console.error("Sync crashed:", error.message);
      log.status = "FAILED";
      log.errors = [{ message: error.message }];
      log.finishedAt = new Date();
      await log.save();
    }
  }
  
  mongoose.connection.close();
  process.exit(0);
}

runSync();
