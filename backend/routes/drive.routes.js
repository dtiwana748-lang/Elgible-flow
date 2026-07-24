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
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";
import mongoose from "mongoose";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const STUCK_OFF_ABSENCE_THRESHOLD = 3;

const driveSchema = z.object({
  companyName: z.string().min(2),
  jobRole: z.string().min(2),
  driveType: z.string().optional(),
  packageCtc: z.string().optional(),
  driveDate: z.string().optional()
});

const editedAttendanceRowsSchema = z.object({
  rows: z.array(z.any()).min(1).max(50000),
  markMissingAbsent: z.union([z.boolean(), z.string()]).optional()
});

const deleteDrivesSchema = z.object({
  driveIds: z.array(z.string().min(1)).min(1).max(500)
});

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pdfEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makeSimplePdf({ title, subtitle, metaRows = [], tableHeaders = [], tableRows = [] }) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 34;
  const rowHeight = 18;
  const colWidths = [170, 88, 88, 82, 64, 64, 82, 66, 66];
  const pages = [];
  let lines = [];
  let y = pageHeight - margin;

  function add(text, x, yPos, size = 9, font = "F1", color = "0 0 0") {
    lines.push(`BT ${color} rg /${font} ${size} Tf 1 0 0 1 ${x} ${yPos} Tm (${pdfEscape(text)}) Tj ET`);
  }

  function line(x1, y1, x2, y2) {
    lines.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  function rect(x, yPos, w, h, fill = false) {
    lines.push(`${x} ${yPos} ${w} ${h} re ${fill ? "f" : "S"}`);
  }

  function newPage() {
    pages.push(lines.join("\n"));
    lines = [];
    y = pageHeight - margin;
  }

  function header() {
    lines.push("0.96 0.99 1 rg");
    rect(margin, y - 58, pageWidth - margin * 2, 58, true);
    lines.push("0 0.43 0.47 rg");
    rect(margin, y - 58, 78, 58, true);
    lines.push("0 g");
    add("DCPD", margin + 17, y - 34, 18, "F2", "1 1 1");
    add(title, margin + 94, y - 22, 16, "F2");
    add(subtitle, margin + 94, y - 41, 10);
    y -= 78;
    for (const row of metaRows) {
      add(row, margin, y, 9);
      y -= 14;
    }
    y -= 8;
  }

  function tableHeader() {
    let x = margin;
    lines.push("0 0.47 0.50 rg");
    rect(margin, y - rowHeight + 4, pageWidth - margin * 2, rowHeight, true);
    lines.push("1 1 1 rg");
    tableHeaders.forEach((item, index) => {
      add(item, x + 4, y - 8, 7.5, "F2", "1 1 1");
      x += colWidths[index] || 70;
    });
    lines.push("0 g");
    y -= rowHeight;
  }

  header();
  tableHeader();

  for (const row of tableRows) {
    if (y < margin + rowHeight + 12) {
      newPage();
      header();
      tableHeader();
    }
    let x = margin;
    lines.push(row.isTotal ? "0.90 0.98 0.95 rg" : "1 1 1 rg");
    rect(margin, y - rowHeight + 4, pageWidth - margin * 2, rowHeight, true);
    lines.push("0.82 0.88 0.91 RG");
    line(margin, y - rowHeight + 4, pageWidth - margin, y - rowHeight + 4);
    lines.push("0 g");
    row.cells.forEach((item, index) => {
      const width = colWidths[index] || 70;
      const text = String(item ?? "");
      const clipped = text.length > Math.floor(width / 5) ? `${text.slice(0, Math.max(0, Math.floor(width / 5) - 2))}.` : text;
      add(clipped, x + 4, y - 8, 7.5, row.isTotal ? "F2" : "F1");
      x += width;
    });
    y -= rowHeight;
  }
  pages.push(lines.join("\n"));

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids ${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")} /Count ${pages.length} >>`
  ];
  pages.forEach((content, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObj} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function pickColumn(row, names, excludes = []) {
  const entries = Object.entries(row || {});
  const normExcludes = excludes.map((e) => normalizeHeader(e));

  // 1. First try exact normalized match
  for (const name of names) {
    const target = normalizeHeader(name);
    const found = entries.find(([key]) => {
      const normKey = normalizeHeader(key);
      if (normExcludes.some((ex) => normKey.includes(ex))) return false;
      return normKey === target;
    });
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim()) {
      return found[1];
    }
  }

  // 2. Substring match avoiding excluded words
  for (const name of names) {
    const target = normalizeHeader(name);
    const found = entries.find(([key]) => {
      const normKey = normalizeHeader(key);
      if (normExcludes.some((ex) => normKey.includes(ex))) return false;
      return normKey.includes(target);
    });
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim()) {
      return found[1];
    }
  }

  return undefined;
}

function cleanId(val) {
  if (val === undefined || val === null) return "";
  return String(val)
    .replace(/^\uFEFF/, "")
    .replace(/^['"`]+/, "")
    .replace(/\.0$/, "")
    .replace(/\s+/g, "")
    .trim();
}

function identifierKeys(value) {
  const cleaned = cleanId(value).toLowerCase();
  if (!cleaned) return [];
  const keys = new Set([cleaned]);
  // Excel/CSV exports frequently add or remove leading zeroes from numeric IDs.
  if (/^\d+$/.test(cleaned)) keys.add(cleaned.replace(/^0+(?=\d)/, ""));
  return [...keys];
}

function readAttendanceMatrix(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".csv")) {
    return parse(file.buffer, { columns: false, skip_empty_lines: false, trim: true, relax_column_count: true });
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: true });
    const matrices = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (!rows.some((row) => row.some((cell) => cellText(cell)))) continue;
      if (matrices.length) matrices.push([]);
      matrices.push([`Worksheet: ${sheetName}`]);
      matrices.push(...rows);
    }
    return matrices;
  }
  throw new Error("Upload a CSV, XLSX, or XLS attendance file");
}

function cellText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalAttendanceHeader(header) {
  const key = normalizeHeader(header);
  if (!key) return "";
  if (["sr", "srno", "sno", "slno", "serial", "serialno", "no"].includes(key)) return "Sr No";
  if (key.includes("universityroll") || key.includes("uniroll") || key === "rollno" || key === "rollnumber" || key === "roll") return "Roll No";
  if (key.includes("company")) return "Company Name";
  if (key.includes("campus")) return "Campus Name";
  if (key.includes("studentname") || key === "name" || key.includes("candidatename") || key.includes("fullname") || key.includes("firstname") || key.includes("lastname")) return "Student Name";
  if (key.includes("studentemail") || key.includes("email") || key === "mail") return "Student Email ID";
  if (key === "branch" || key === "branches" || key.includes("stream")) return "Branch";
  if (key === "course" || key.includes("program")) return "Course";
  if (key.includes("eligible") || key.includes("elgible") || key.includes("eligibility")) return "Eligibility";
  if (key.includes("registered") || key === "register") return "Registration";
  if (key.includes("attendance") || key === "present" || key === "presence") return "Attendance";
  return cellText(header);
}

function classifySection(text) {
  const key = normalizeHeader(text);
  if (key.includes("eligible")) return "ELIGIBLE";
  if (key.includes("registered") || key.includes("registration")) return "REGISTERED";
  if (key.includes("shortlisted") || key.includes("round") || key.includes("attendance")) return "PROCESS";
  return "";
}

function isKnownHeader(value) {
  const key = normalizeHeader(value);
  if (!key) return false;
  return [
    "sr", "srno", "sno", "slno", "serial", "serialno", "roll", "rollno", "rollnumber",
    "studentname", "name", "candidatename", "studentemail", "email", "emailid", "mail",
    "branch", "branches", "course", "college", "campus", "campusname", "company", "companyname",
    "eligible", "registered", "register", "attendance", "present", "status", "ppt", "gd", "pi", "hr", "test"
  ].some((part) => key === part || key.includes(part));
}

function segmentHeaderRanges(row) {
  const identityHeaders = row
    .map(canonicalAttendanceHeader)
    .filter((header) => ["Roll No", "Student Name", "Student Email ID"].includes(header));
  // Status values such as "Eligible" and "Registered" occur in every data row.
  // A real table heading must also identify the student columns.
  if (!identityHeaders.length) return [];

  const ranges = [];
  let start = null;
  let known = 0;
  for (let col = 0; col <= row.length; col += 1) {
    const text = cellText(row[col]);
    if (text) {
      if (start === null) start = col;
      if (isKnownHeader(text)) known += 1;
    } else if (start !== null) {
      const end = col - 1;
      if (end - start + 1 >= 2 && known >= 2) ranges.push({ start, end });
      start = null;
      known = 0;
    }
  }
  const nonEmptyIndexes = row
    .map((value, index) => cellText(value) ? index : -1)
    .filter((index) => index >= 0);
  const knownCount = row.filter((value) => isKnownHeader(value)).length;
  const hasRepeatedIdentityHeader = new Set(identityHeaders).size !== identityHeaders.length;
  // Treat one visual header row as one table even when it contains spacer columns.
  // This keeps Registered and process columns attached to Roll No/Student Name.
  // Repeated identifier headings indicate genuinely separate side-by-side tables.
  if (nonEmptyIndexes.length >= 2 && knownCount >= 2 && !hasRepeatedIdentityHeader) {
    return [{ start: nonEmptyIndexes[0], end: nonEmptyIndexes.at(-1) }];
  }
  return ranges;
}

function looksLikeHeaderInRange(row, range) {
  let known = 0;
  let filled = 0;
  let identity = 0;
  for (let col = range.start; col <= range.end; col += 1) {
    const text = cellText(row[col]);
    if (!text) continue;
    filled += 1;
    if (isKnownHeader(text)) known += 1;
    if (["Roll No", "Student Name", "Student Email ID"].includes(canonicalAttendanceHeader(text))) identity += 1;
  }
  return filled >= 2 && known >= 2 && identity >= 1;
}

function findPlacementOfficers(matrix) {
  const names = new Set();
  const rejectedValues = new Set(["result", "status", "name", "eligible", "registered", "notregistered", "inprocess"]);
  for (const row of matrix.slice(0, 8)) {
    for (let col = 0; col < row.length; col += 1) {
      const text = cellText(row[col]);
      if (!normalizeHeader(text).includes("placementofficer")) continue;
      for (let next = col + 1; next < Math.min(row.length, col + 5); next += 1) {
        const value = cellText(row[next]);
        const valueKey = normalizeHeader(value);
        if (value && !rejectedValues.has(valueKey) && !classifySection(value) && !valueKey.includes("date")) {
          names.add(value);
          break;
        }
      }
    }
  }
  return Array.from(names);
}

function inferCompanyName(matrix, fileName, companyOverride = "") {
  if (String(companyOverride || "").trim()) return String(companyOverride).trim();
  const candidates = [];
  const reject = [
    "nameoftheplacementofficer", "placementofficer", "eligiblelist", "shortlistedlist", "registered",
    "registration", "attendance", "round", "dateoffloatingofdrive", "date", "srno", "rollno",
    "studentname", "studentemailid", "course", "branch", "campusname", "result", "status", "inprocess", "nikita"
  ];
  for (const row of matrix.slice(0, 3)) {
    for (const value of row) {
      const text = cellText(value);
      const key = normalizeHeader(text);
      if (!text || text.length < 2 || reject.some((item) => key.includes(item))) continue;
      if (/^\d+$/.test(text) || /\d{1,2}(st|nd|rd|th)?\s+[a-z]+/i.test(text)) continue;
      candidates.push(text);
    }
  }
  if (candidates.length) return candidates.at(-1);
  return String(fileName || "").replace(/\.(xlsx|xls|csv)$/i, "").replace(/[_-]+/g, " ").trim() || "Uploaded Company";
}

function rowHasDataInRange(row, range) {
  for (let col = range.start; col <= range.end; col += 1) {
    if (cellText(row[col])) return true;
  }
  return false;
}

function makeRowIdentity(row) {
  const roll = cleanId(pickColumn(row, ["rollno", "rollnumber", "universityrollnumber", "universityroll"]));
  const email = String(pickColumn(row, ["studentemailid", "studentemail", "emailid", "email", "mail"]) || "").trim().toLowerCase();
  const name = cellText(pickColumn(row, ["studentname", "candidatename", "fullname", "name"])).toLowerCase();
  const company = cellText(pickColumn(row, ["companyname", "company", "organisation", "organization"])).toLowerCase();
  const studentKey = roll
    ? `roll:${roll.toLowerCase()}|name:${name}`
    : email
      ? `email:${email}|name:${name}`
      : name
        ? `name:${name}`
        : "";
  return studentKey ? `${studentKey}|company:${company}` : "";
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cellText(value).toLowerCase());
}

function isLikelyRoll(value) {
  const text = cleanId(value);
  return /^\d{5,12}$/.test(text);
}

function isLikelyCourse(value) {
  const text = cellText(value);
  const key = normalizeHeader(text);
  if (!text || text.length > 22) return false;
  return /^(bt|btech|bte|mca|bca|me|ece|cse|ete|ee|ce|it|ai|ds|mba|bba)/i.test(key) || key.includes("btechece") || key.includes("btechee");
}

function isLikelyNameCell(value) {
  const text = cellText(value);
  const key = normalizeHeader(text);
  if (!text || text.length < 2 || text.length > 60) return false;
  if (isLikelyEmail(text) || isLikelyRoll(text) || isLikelyCourse(text) || isKnownHeader(text)) return false;
  if (key.includes("campus") || key.includes("college") || key.includes("university") || key.includes("mohali")) return false;
  if (key.includes("worksheet") || key.includes("placementofficer") || key.includes("eligiblelist") || key.includes("registered")) return false;
  if (/\d/.test(text)) return false;
  return /[a-z]/i.test(text);
}

function nearestCell(row, anchorIndex, predicate, maxDistance = 5) {
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const leftIndex = anchorIndex - distance;
    const rightIndex = anchorIndex + distance;
    if (leftIndex >= 0 && predicate(row[leftIndex])) return cellText(row[leftIndex]);
    if (rightIndex < row.length && predicate(row[rightIndex])) return cellText(row[rightIndex]);
  }
  return "";
}

function isExplicitRegistrationValue(value) {
  const text = cellText(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return [
    "registered", "not registered", "unregistered",
    "yes", "no", "y", "n", "true", "false", "1", "0"
  ].includes(text);
}

function mergeNormalizedRow(rowMap, orderedKeys, row) {
  const id = makeRowIdentity(row) || `row:${orderedKeys.length + 1}:${cellText(row["Student Name"])}:${cellText(row["Student Email ID"])}`;
  if (!rowMap.has(id)) {
    rowMap.set(id, row);
    orderedKeys.push(id);
    return true;
  }

  const existing = rowMap.get(id);
  for (const [key, value] of Object.entries(row)) {
    if (key === "Registration") {
      const incomingIsExplicit = Boolean(row.__registrationExplicit);
      const existingIsExplicit = Boolean(existing.__registrationExplicit);
      if (value && (incomingIsExplicit || !existing[key])) {
        // A value read from the actual Registration cell is authoritative.
        // It must replace section-inferred values such as "Registered List".
        // When two explicit duplicate rows conflict, retain the first physical
        // row instead of silently moving a later block's value onto this row.
        if (!existingIsExplicit || !existing[key]) existing[key] = value;
      }
      continue;
    }
    if (value && !existing[key]) existing[key] = value;
  }
  if (row.__registrationExplicit) {
    Object.defineProperty(existing, "__registrationExplicit", { value: true, writable: true, configurable: true });
  }
  return false;
}

function markExplicitRegistration(row, isExplicit) {
  if (isExplicit) {
    Object.defineProperty(row, "__registrationExplicit", { value: true, writable: true, configurable: true });
  }
  return row;
}

function rescueRowsFromNoisyMatrix(cleanedMatrix, fallbackCompany, rowMap, orderedKeys) {
  let rescued = 0;
  for (let rowIndex = 0; rowIndex < cleanedMatrix.length; rowIndex += 1) {
    const row = cleanedMatrix[rowIndex] || [];
    const rowText = row.map(cellText).join(" ");
    if (!rowText || looksLikeHeaderInRange(row, { start: 0, end: Math.max(row.length - 1, 0) })) continue;

    const emailIndexes = row.map((value, index) => isLikelyEmail(value) ? index : -1).filter((index) => index >= 0);
    const rollIndexes = row.map((value, index) => isLikelyRoll(value) ? index : -1).filter((index) => index >= 0);
    const anchors = Array.from(new Set([
      ...emailIndexes,
      ...rollIndexes.filter((rollIndex) => !emailIndexes.some((emailIndex) => Math.abs(emailIndex - rollIndex) <= 5))
    ]));

    for (const anchorIndex of anchors) {
      const email = emailIndexes.includes(anchorIndex)
        ? cellText(row[anchorIndex])
        : nearestCell(row, anchorIndex, isLikelyEmail, 6);
      const rollNo = rollIndexes.includes(anchorIndex)
        ? cleanId(row[anchorIndex])
        : nearestCell(row, anchorIndex, isLikelyRoll, 6);
      const studentName = nearestCell(row, anchorIndex, isLikelyNameCell, 4);
      const course = nearestCell(row, anchorIndex, isLikelyCourse, 5);
      const registration = nearestCell(row, anchorIndex, isExplicitRegistrationValue, 10);

      if (!email && !rollNo) continue;
      if (!studentName && !email) continue;

      const normalized = markExplicitRegistration({
        "Company Name": fallbackCompany,
        "Roll No": rollNo,
        "Student Name": studentName,
        "Student Email ID": email,
        Branch: course,
        Course: course,
        "Campus Name": "",
        Eligibility: "",
        // Recover only exact registration tokens; unknown values remain blank.
        Registration: registration,
        Attendance: ""
      }, Boolean(registration));

      if (mergeNormalizedRow(rowMap, orderedKeys, normalized)) rescued += 1;
    }
  }
  return rescued;
}

function normalizeFlatAttendanceTable(cleanedMatrix, fallbackCompany) {
  const headerRowIndex = cleanedMatrix.findIndex((row) => {
    const canonical = row.map(canonicalAttendanceHeader);
    const hasIdentity = canonical.some((header) => ["Roll No", "Student Name", "Student Email ID"].includes(header));
    const hasCompany = canonical.includes("Company Name");
    const knownCount = row.filter(isKnownHeader).length;
    return hasIdentity && hasCompany && knownCount >= 3;
  });
  if (headerRowIndex < 0) return null;

  const sourceHeaders = cleanedMatrix[headerRowIndex];
  const registrationColumnIndexes = sourceHeaders
    .map((header, index) => {
      const key = normalizeHeader(header);
      return (key.includes("registered") || key.includes("registration") || key === "register") ? index : -1;
    })
    .filter((index) => index >= 0);
  const usedHeaders = new Map();
  const headers = sourceHeaders.map((header, index) => {
    const base = canonicalAttendanceHeader(header) || `Column ${index + 1}`;
    const count = usedHeaders.get(base) || 0;
    usedHeaders.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
  const rows = [];
  const processHeaders = new Set();

  for (let rowIndex = headerRowIndex + 1; rowIndex < cleanedMatrix.length; rowIndex += 1) {
    const dataRow = cleanedMatrix[rowIndex] || [];
    if (!dataRow.some((value) => cellText(value))) {
      continue;
    }
    if (dataRow.some((value) => normalizeHeader(value).startsWith("worksheet"))) break;
    if (looksLikeHeaderInRange(dataRow, { start: 0, end: Math.max(dataRow.length - 1, 0) })) continue;

    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = cellText(dataRow[index]);
    });
    const exactRegistration = [...registrationColumnIndexes]
      .reverse()
      .map((index) => cellText(dataRow[index]))
      .find((value) => isExplicitRegistrationValue(value)) || "";
    const normalized = {
      "Sr No": rows.length + 1,
      "Source Row": rowIndex + 1,
      "Company Name": raw["Company Name"] || fallbackCompany,
      "Roll No": raw["Roll No"] || "",
      "Student Name": raw["Student Name"] || "",
      "Student Email ID": raw["Student Email ID"] || "",
      Branch: raw.Branch || "",
      Course: raw.Course || "",
      "Campus Name": raw["Campus Name"] || "",
      Eligibility: raw.Eligibility || "",
      Registration: exactRegistration,
      Attendance: raw.Attendance || ""
    };
    for (const [header, value] of Object.entries(raw)) {
      if (!value) continue;
      const baseHeader = header.replace(/\s+\d+$/, "");
      if (["Sr No", "Company Name", "Roll No", "Student Name", "Student Email ID", "Branch", "Course", "Campus Name", "Eligibility", "Registration", "Attendance"].includes(baseHeader)) continue;
      normalized[header] = value;
      if (!isMetaAttendanceColumn(header)) processHeaders.add(header);
    }

    // Strict composite identity: never attach data from a shifted or partial
    // row. Company order is irrelevant because every row carries its company.
    const hasCompositeIdentity = normalized["Roll No"] && normalized["Student Name"] && normalized["Company Name"];
    if (hasCompositeIdentity) rows.push(normalized);
  }

  const fixedHeaders = ["Sr No", "Source Row", "Company Name", "Roll No", "Student Name", "Student Email ID", "Branch", "Course", "Campus Name", "Eligibility", "Registration", "Attendance"];
  const outputHeaders = [...fixedHeaders, ...Array.from(processHeaders).filter((header) => !fixedHeaders.includes(header))];
  rows.forEach((row) => outputHeaders.forEach((header) => {
    if (row[header] === undefined) row[header] = "";
  }));
  return { headers: outputHeaders, rows, headerRowIndex };
}

function normalizeAttendanceRowsFromMatrix(matrix, fileName, companyOverride = "") {
  const cleanedMatrix = (matrix || []).map((row) => Array.isArray(row) ? row.map(cellText) : []);
  const preparedByNames = findPlacementOfficers(cleanedMatrix);
  const fallbackCompany = inferCompanyName(cleanedMatrix, fileName, companyOverride);
  const flatTable = normalizeFlatAttendanceTable(cleanedMatrix, fallbackCompany);
  if (flatTable) {
    return {
      headers: flatTable.headers,
      rows: flatTable.rows,
      normalization: {
        normalized: true,
        mode: "FLAT_TABLE",
        originalRows: cleanedMatrix.length,
        cleanRows: flatTable.rows.length,
        rescuedRows: 0,
        blockCount: 1,
        sections: [{ sectionName: "Standard Attendance Table", row: flatTable.headerRowIndex + 1 }],
        preparedByNames,
        fallbackCompany
      }
    };
  }
  const rowMap = new Map();
  const orderedKeys = [];
  const processHeaders = new Set();
  const sections = [];

  for (let rowIndex = 0; rowIndex < cleanedMatrix.length; rowIndex += 1) {
    const row = cleanedMatrix[rowIndex];
    const ranges = segmentHeaderRanges(row);
    if (!ranges.length) continue;

    for (const range of ranges) {
      const headers = [];
      for (let col = range.start; col <= range.end; col += 1) {
        headers.push(canonicalAttendanceHeader(row[col]) || `Column ${col + 1}`);
      }

      const context = cleanedMatrix.slice(Math.max(0, rowIndex - 3), rowIndex)
        .flatMap((contextRow) => contextRow.slice(range.start, Math.min(contextRow.length, range.end + 1)))
        .map(cellText)
        .filter(Boolean)
        .join(" ");
      const sectionType = classifySection(context) || classifySection(headers.join(" "));
      const sectionName = sectionType === "ELIGIBLE" ? "Eligible List" : sectionType === "REGISTERED" ? "Registered List" : sectionType === "PROCESS" ? "Process Attendance" : "Uploaded Data";
      sections.push({ sectionName, row: rowIndex + 1, columns: `${range.start + 1}-${range.end + 1}` });

      let blankStreak = 0;
      for (let dataIndex = rowIndex + 1; dataIndex < cleanedMatrix.length; dataIndex += 1) {
        const dataRow = cleanedMatrix[dataIndex];
        if (!rowHasDataInRange(dataRow, range)) {
          blankStreak += 1;
          const moreDataAhead = cleanedMatrix.slice(dataIndex + 1, Math.min(cleanedMatrix.length, dataIndex + 8))
            .some((futureRow) => rowHasDataInRange(futureRow, range));
          if (blankStreak >= 3 && !moreDataAhead) break;
          continue;
        }
        blankStreak = 0;
        if (looksLikeHeaderInRange(dataRow, range)) break;

        const raw = {};
        headers.forEach((header, offset) => {
          raw[header] = cellText(dataRow[range.start + offset]);
        });

        const serialOnly = Object.entries(raw).every(([header, value]) => !value || canonicalAttendanceHeader(header) === "Sr No");
        if (serialOnly) continue;

        const normalized = markExplicitRegistration({
          "Company Name": raw["Company Name"] || fallbackCompany,
          "Roll No": raw["Roll No"] || "",
          "Student Name": raw["Student Name"] || "",
          "Student Email ID": raw["Student Email ID"] || "",
          Branch: raw.Branch || "",
          Course: raw.Course || "",
          "Campus Name": raw["Campus Name"] || "",
          Eligibility: raw.Eligibility || (sectionType === "ELIGIBLE" ? "Eligible" : ""),
          Registration: raw.Registration || (sectionType === "REGISTERED" ? "Registered" : ""),
          Attendance: raw.Attendance || ""
        }, Boolean(raw.Registration));

        for (const [header, value] of Object.entries(raw)) {
          if (!value) continue;
          if (["Sr No", "Company Name", "Roll No", "Student Name", "Student Email ID", "Branch", "Course", "Campus Name", "Eligibility", "Registration", "Attendance"].includes(header)) continue;
          const cleanHeader = header || sectionName;
          normalized[cleanHeader] = value;
          if (!isMetaAttendanceColumn(cleanHeader)) processHeaders.add(cleanHeader);
        }

        mergeNormalizedRow(rowMap, orderedKeys, normalized);
      }
    }
  }

  const rescuedRows = rescueRowsFromNoisyMatrix(cleanedMatrix, fallbackCompany, rowMap, orderedKeys);

  const rows = orderedKeys.map((key, index) => {
    const source = rowMap.get(key);
    return markExplicitRegistration({ "Sr No": index + 1, ...source }, Boolean(source.__registrationExplicit));
  });
  const fixedHeaders = ["Sr No", "Company Name", "Roll No", "Student Name", "Student Email ID", "Branch", "Course", "Campus Name", "Eligibility", "Registration", "Attendance"];
  const headers = [...fixedHeaders, ...Array.from(processHeaders).filter((header) => !fixedHeaders.includes(header))];
  for (const row of rows) {
    headers.forEach((header) => {
      if (row[header] === undefined) row[header] = "";
    });
  }

  return {
    headers,
    rows,
    normalization: {
      normalized: true,
      originalRows: cleanedMatrix.length,
      cleanRows: rows.length,
      rescuedRows,
      blockCount: sections.length,
      sections,
      preparedByNames,
      fallbackCompany
    }
  };
}

function parseAttendanceRows(file, options = {}) {
  const matrix = readAttendanceMatrix(file);
  const normalized = normalizeAttendanceRowsFromMatrix(matrix, file.originalname, options.companyName);
  let { headers, rows } = normalized;

  if (!rows.length) {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".csv")) {
      rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
      const temp = parse(file.buffer, { columns: false, skip_empty_lines: true, trim: true, relax_column_count: true, to_line: 1 });
      headers = temp.length ? temp[0] : [];
    } else {
      const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      headers = sheetData.length ? sheetData[0].filter(Boolean) : [];
      rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
    }
    normalized.normalization.normalized = false;
  }

  rows = (rows || []).filter((row) => {
    const roll = pickColumn(row, ["rollno", "roll"]);
    const name = pickColumn(row, ["studentname", "name"]);
    const email = pickColumn(row, ["studentemail", "emailid", "email", "mail"]);
    const rollStr = String(roll || "").trim().toLowerCase();
    const nameStr = String(name || "").trim().toLowerCase();
    const emailStr = String(email || "").trim().toLowerCase();
    if (!rollStr && !nameStr && !emailStr) return false;
    if (rollStr === "roll no" || rollStr === "roll_no" || rollStr === "roll" || rollStr === "roll number" || rollStr === "sr. no" || rollStr === "sr no") return false;
    if (nameStr === "student_name" || nameStr === "student name" || nameStr === "name" || nameStr === "candidate name") return false;
    return true;
  });

  // Enforce one authoritative row per Roll No + Student Name + Company.
  // This prevents a later repeated block from swapping registration values.
  const consolidatedRows = new Map();
  const consolidatedOrder = [];
  for (const row of rows) {
    const registration = pickColumn(row, ["registrationstatus", "registration", "registered", "register"]);
    const registrationIsExplicit = normalized.normalization.mode === "FLAT_TABLE" || normalized.normalization.normalized === false
      ? Boolean(cellText(registration))
      : Boolean(row.__registrationExplicit);
    const preparedRow = markExplicitRegistration(row, registrationIsExplicit);
    mergeNormalizedRow(consolidatedRows, consolidatedOrder, preparedRow);
  }
  rows = consolidatedOrder.map((key, index) => {
    const source = consolidatedRows.get(key);
    return { ...source, "Sr No": index + 1 };
  });

  return { headers, rows, normalization: normalized.normalization };
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

function normalizeRegistrationStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "NOT_CONTACTED";
  if (
    text.includes("not registered") ||
    text.includes("notregistered") ||
    text.includes("unregistered") ||
    ["no", "n", "0", "false"].includes(text)
  ) return "NOT_REGISTERED";
  if (["registered", "yes", "y", "1", "true"].includes(text)) return "REGISTERED";
  // Never invent either a positive or a negative status from malformed data.
  return "NOT_CONTACTED";
}

function buildStudentLookup(row) {
  const grNo = pickColumn(row, ["grno", "grnumber", "gr"]);
  const universityId = pickColumn(row, ["universityid", "universityuid", "uid"]);
  const enrollmentNo = pickColumn(row, ["enrollmentno", "enrollmentnumber", "enrollment", "universityreg", "urn", "uid"]);
  const registrationNo = pickColumn(row, ["registrationno", "regno", "registrationnumber", "registration"]);
  const rollNo = pickColumn(row, ["rollno", "unirollno", "classrollno", "universityrollno", "rollnumber", "roll"], ["payroll", "jobrole", "stuckoff"]);
  const email = pickColumn(row, ["studentemail", "emailid", "email", "mail"], ["company"]);
  const name = pickColumn(row, ["studentname", "candidatename", "fullname", "name"], ["company", "organisation", "organization", "father", "mother", "parent"]);
  if (grNo) return { grNo: cleanId(grNo) };
  if (universityId) return { universityId: cleanId(universityId) };
  if (enrollmentNo) return { enrollmentNo: cleanId(enrollmentNo) };
  if (registrationNo) return { registrationNo: cleanId(registrationNo) };
  if (rollNo) return { rollNo: cleanId(rollNo) };
  if (email) return { email: String(email).trim().toLowerCase() };
  if (name) return { name: new RegExp(`^${cleanId(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  return null;
}

function isMetaAttendanceColumn(header) {
  const key = normalizeHeader(header);
  if (/^column\d+$/.test(key)) return true;
  const exactMetas = [
    "sr", "srno", "sno", "slno", "serial", "serialno", "index", "no", "sourcerow",
    "gender", "gen", "sex", "branch", "department", "course", "program", "batch",
    "company", "companyname", "eligible", "eligibility", "elgible", "registered", "register", "remark", "remarks", "note", "notes"
  ];
  if (exactMetas.includes(key)) return true;

  const metaSubstrings = ["roll", "enrollment", "registration", "regno", "email", "mail", "name", "student"];
  return metaSubstrings.some((part) => key.includes(part));
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
  const jobRole = String(pickColumn(row, ["jobrole", "role", "profile", "designation", "position"]) || "Auto-created from sheet").trim();
  const drive = await Drive.findOneAndUpdate(
    {
      createdBy: userId,
      companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i"),
      jobRole: new RegExp(`^${escapeRegex(jobRole)}$`, "i")
    },
    {
      $setOnInsert: {
        companyName,
        jobRole,
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

  const registrationValue = pickColumn(row, ["registrationstatus", "registration", "registered", "register"]);
  const processStatuses = getProcessStatuses(row);
  const registrationStatus = normalizeRegistrationStatus(registrationValue);
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
  const latestSheet = await AttendanceSheet.findOne({ drive: driveId })
    .select("rowCount rows uploadResult.rows")
    .sort({ createdAt: -1 })
    .lean();
  const uploadedRows = latestSheet?.rowCount || latestSheet?.uploadResult?.rows || latestSheet?.rows?.length || 0;
  const normalizedStats = stats || {};
  const eligibleStudents = uploadedRows || normalizedStats.eligibleStudents || 0;
  const registeredStudents = Math.min(normalizedStats.registeredStudents || 0, eligibleStudents);
  await Drive.findByIdAndUpdate(driveId, {
    stats: {
      ...normalizedStats,
      eligibleStudents,
      registeredStudents,
      nonRegisteredStudents: Math.max(0, eligibleStudents - registeredStudents),
      totalStudentsConsidered: eligibleStudents
    }
  });
}

async function refreshStudentStuckOff(studentId) {
  const student = await Student.findById(studentId).select("status driveRestriction").lean();
  if (!student || String(student.status || "").trim().toUpperCase() === "NOC") return;

  const records = await DriveStudent.find({ student: studentId })
    .populate("drive", "companyName driveDate createdAt updatedAt")
    .lean();

  records.sort((a, b) => {
    const dateA = new Date(a.drive?.driveDate || a.drive?.createdAt || a.updatedAt || 0);
    const dateB = new Date(b.drive?.driveDate || b.drive?.createdAt || b.updatedAt || 0);
    return dateA - dateB;
  });

  let maxConsecutiveAbsent = 0;
  let currentStreak = 0;
  let totalAbsent = 0;

  const clearedAt = student.driveRestriction?.clearedAt ? new Date(student.driveRestriction.clearedAt) : null;

  for (const item of records) {
    const recordDate = new Date(item.drive?.driveDate || item.drive?.createdAt || item.updatedAt || 0);
    if (clearedAt && recordDate <= clearedAt) continue;
    if (item.overallAttendanceStatus === "OVERALL_ABSENT") {
      totalAbsent += 1;
      currentStreak += 1;
      if (currentStreak > maxConsecutiveAbsent) {
        maxConsecutiveAbsent = currentStreak;
      }
    } else if (item.overallAttendanceStatus === "OVERALL_PRESENT") {
      currentStreak = 0;
    }
  }

  const isStuckOff = maxConsecutiveAbsent >= STUCK_OFF_ABSENCE_THRESHOLD;
  const status = isStuckOff ? "STUCK_OFF" : "CLEAR";

  const updatedStudent = await Student.findByIdAndUpdate(studentId, {
    "driveRestriction.status": status,
    "driveRestriction.absentDriveCount": totalAbsent,
    "driveRestriction.consecutiveAbsentCount": maxConsecutiveAbsent,
    "driveRestriction.reason": isStuckOff
      ? `Absent in ${maxConsecutiveAbsent} consecutive drives. Student is Struck Off from upcoming drives.`
      : "Student is clear for upcoming drives.",
    "driveRestriction.updatedAt": new Date()
  }, { new: true });
  await triggerSpreadsheetUpdate(updatedStudent, { statusOnly: true, skipNoc: true });
}

async function deleteDrivesByIds(driveIds, actorId) {
  const drives = await Drive.find({ _id: { $in: driveIds } }).select("_id companyName").lean();
  const foundIds = drives.map((drive) => drive._id);

  const [driveStudents, rounds, sheets, requests] = await Promise.all([
    DriveStudent.deleteMany({ drive: { $in: foundIds } }),
    DriveRound.deleteMany({ drive: { $in: foundIds } }),
    AttendanceSheet.deleteMany({ drive: { $in: foundIds } }),
    AccessRequest.deleteMany({ drive: { $in: foundIds } })
  ]);

  const deletedDrives = await Drive.deleteMany({ _id: { $in: foundIds } });

  await writeAudit({
    actor: actorId,
    action: "DRIVES_DELETED",
    entity: "Drive",
    metadata: {
      driveIds: foundIds,
      companyNames: drives.map((drive) => drive.companyName),
      deletedDrives: deletedDrives.deletedCount || 0,
      deletedDriveStudents: driveStudents.deletedCount || 0,
      deletedRounds: rounds.deletedCount || 0,
      deletedSheets: sheets.deletedCount || 0,
      deletedAccessRequests: requests.deletedCount || 0
    }
  });

  return {
    deletedDrives: deletedDrives.deletedCount || 0,
    deletedDriveStudents: driveStudents.deletedCount || 0,
    deletedRounds: rounds.deletedCount || 0,
    deletedSheets: sheets.deletedCount || 0,
    deletedAccessRequests: requests.deletedCount || 0
  };
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

function getPlacementOfficerNames(rows) {
  const names = new Set();
  for (const row of rows || []) {
    let officer = pickColumn(row, [
      "placementofficer",
      "placementofficers",
      "placementofficername",
      "preparedby",
      "preparedbyplacementofficer",
      "officer",
      "officername"
    ], ["student", "father", "mother"]);
    if (!officer) {
      const found = Object.entries(row || {}).find(([key, value]) => (
        normalizeHeader(key).includes("placementofficer") && String(value || "").trim()
      ));
      officer = found?.[1];
    }
    const clean = String(officer || "").trim();
    if (clean) names.add(clean);
  }
  return Array.from(names).slice(0, 8);
}

function rowsForDriveCompany(rows, companyName) {
  if (!companyName) return rows || [];
  return (rows || []).filter((row) => {
    const companyKey = Object.keys(row || {}).find((key) => {
      const norm = normalizeHeader(key);
      return norm.includes("companyname") || norm === "company";
    });
    if (!companyKey) return true;
    return String(row[companyKey] || "").trim().toLowerCase() === String(companyName).trim().toLowerCase();
  });
}

async function buildStudentMaps() {
  const students = await Student.find({}).lean();
  const byGrNo = new Map();
  const byUniversityId = new Map();
  const byEnrollment = new Map();
  const byRegNo = new Map();
  const byRollNo = new Map();
  const byEmail = new Map();
  const byName = new Map();

  const addIdentifier = (map, value, student) => {
    identifierKeys(value).forEach((key) => {
      if (!map.has(key)) map.set(key, student);
      else if (map.get(key)?._id?.toString() !== student._id.toString()) map.set(key, null);
    });
  };
  const addName = (value, student) => {
    const key = cellText(value).toLowerCase();
    if (!key) return;
    const matches = byName.get(key) || [];
    matches.push(student);
    byName.set(key, matches);
  };

  for (const s of students) {
    addIdentifier(byGrNo, s.grNo, s);
    addIdentifier(byUniversityId, s.universityId, s);
    addIdentifier(byEnrollment, s.enrollmentNo, s);
    addIdentifier(byRegNo, s.registrationNo, s);
    addIdentifier(byRollNo, s.rollNo, s);
    if (s.email) {
      const emailKey = String(s.email).trim().toLowerCase();
      if (!byEmail.has(emailKey)) byEmail.set(emailKey, s);
      else if (byEmail.get(emailKey)?._id?.toString() !== s._id.toString()) byEmail.set(emailKey, null);
    }
    addName(s.name, s);
  }
  return { byGrNo, byUniversityId, byEnrollment, byRegNo, byRollNo, byEmail, byName };
}

function findStudentInMap(row, studentMaps) {
  const grNo = pickColumn(row, ["grno", "grnumber", "gr"]);
  const universityId = pickColumn(row, ["universityid", "universityuid", "uid"]);
  const enrollmentNo = pickColumn(row, ["enrollmentno", "enrollmentnumber", "enrollment", "universityreg", "urn", "uid"]);
  const registrationNo = pickColumn(row, ["registrationno", "regno", "registrationnumber", "registration"]);
  const rollNo = pickColumn(row, ["rollno", "unirollno", "classrollno", "universityrollno", "rollnumber", "roll"], ["payroll", "jobrole", "stuckoff"]);
  const email = pickColumn(row, ["studentemail", "emailid", "email", "mail"], ["company"]);
  const name = pickColumn(row, ["studentname", "candidatename", "fullname", "name"], ["company", "organisation", "organization", "father", "mother", "parent"]);

  const fromIdentifiers = (map, value) => identifierKeys(value).map((key) => map.get(key)).find(Boolean);
  const rowName = cellText(name).toLowerCase();
  const nameAgrees = (student) => !rowName || cellText(student?.name).toLowerCase() === rowName;
  // Attendance rows are anchored by Roll No first. A conflicting name means
  // the row is misaligned and must be rejected instead of attached to a student.
  const rollMatch = fromIdentifiers(studentMaps.byRollNo, rollNo);
  if (rollMatch) return nameAgrees(rollMatch) ? rollMatch : null;
  const grMatch = fromIdentifiers(studentMaps.byGrNo, grNo);
  if (grMatch) return nameAgrees(grMatch) ? grMatch : null;
  const universityMatch = fromIdentifiers(studentMaps.byUniversityId, universityId);
  if (universityMatch) return nameAgrees(universityMatch) ? universityMatch : null;
  const enrollmentMatch = fromIdentifiers(studentMaps.byEnrollment, enrollmentNo);
  if (enrollmentMatch) return nameAgrees(enrollmentMatch) ? enrollmentMatch : null;
  const registrationMatch = fromIdentifiers(studentMaps.byRegNo, registrationNo);
  if (registrationMatch) return nameAgrees(registrationMatch) ? registrationMatch : null;
  if (email && studentMaps.byEmail.has(String(email).trim().toLowerCase())) {
    const emailMatch = studentMaps.byEmail.get(String(email).trim().toLowerCase());
    return nameAgrees(emailMatch) ? emailMatch : null;
  }
  if (name) {
    const nameMatches = studentMaps.byName.get(cellText(name).toLowerCase()) || [];
    // Never silently assign a row to the wrong student when names are duplicated.
    if (nameMatches.length === 1) return nameMatches[0];
  }
  return null;
}

async function findMasterStudentFromRow(row, studentMaps) {
  let student = findStudentInMap(row, studentMaps);
  if (!student) {
    const lookup = buildStudentLookup(row);
    if (lookup) {
      const matchingStudents = await Student.find(lookup).limit(2).lean();
      student = matchingStudents.length === 1 ? matchingStudents[0] : null;
    }
  }

  return student;
}

async function bulkRefreshStudentStuckOff(studentIdsSet) {
  const studentIds = Array.from(studentIdsSet);
  const allRecords = await DriveStudent.find({ student: { $in: studentIds } })
    .populate("drive", "companyName driveDate createdAt updatedAt")
    .lean();
  const students = await Student.find({ _id: { $in: studentIds } }).select("status driveRestriction").lean();
  const studentsById = new Map(students.map((student) => [student._id.toString(), student]));

  const recordsByStudent = new Map();
  for (const rec of allRecords) {
    if (!rec.student) continue;
    const sId = rec.student._id ? rec.student._id.toString() : rec.student.toString();
    if (!recordsByStudent.has(sId)) {
      recordsByStudent.set(sId, []);
    }
    recordsByStudent.get(sId).push(rec);
  }

  const bulkOperations = [];
  for (const studentId of studentIds) {
    const student = studentsById.get(studentId.toString());
    if (!student || String(student.status || "").trim().toUpperCase() === "NOC") continue;
    const records = recordsByStudent.get(studentId.toString()) || [];
    
    records.sort((a, b) => {
      const dateA = new Date(a.drive?.driveDate || a.drive?.createdAt || a.updatedAt || 0);
      const dateB = new Date(b.drive?.driveDate || b.drive?.createdAt || b.updatedAt || 0);
      return dateA - dateB;
    });

    let maxConsecutiveAbsent = 0;
    let currentStreak = 0;
    let totalAbsent = 0;

    const clearedAt = student.driveRestriction?.clearedAt ? new Date(student.driveRestriction.clearedAt) : null;

    for (const item of records) {
      const recordDate = new Date(item.drive?.driveDate || item.drive?.createdAt || item.updatedAt || 0);
      if (clearedAt && recordDate <= clearedAt) continue;
      if (item.overallAttendanceStatus === "OVERALL_ABSENT") {
        totalAbsent += 1;
        currentStreak += 1;
        if (currentStreak > maxConsecutiveAbsent) {
          maxConsecutiveAbsent = currentStreak;
        }
      } else if (item.overallAttendanceStatus === "OVERALL_PRESENT") {
        currentStreak = 0;
      }
    }

    const isStuckOff = maxConsecutiveAbsent >= STUCK_OFF_ABSENCE_THRESHOLD;
    const status = isStuckOff ? "STUCK_OFF" : "CLEAR";

    bulkOperations.push({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(studentId) },
        update: {
          $set: {
            "driveRestriction.status": status,
            "driveRestriction.absentDriveCount": totalAbsent,
            "driveRestriction.consecutiveAbsentCount": maxConsecutiveAbsent,
            "driveRestriction.reason": isStuckOff
              ? `Absent in ${maxConsecutiveAbsent} consecutive drives. Student is Struck Off from upcoming drives.`
              : "Student is clear for upcoming drives.",
            "driveRestriction.updatedAt": new Date()
          }
        }
      }
    });
  }

  if (bulkOperations.length > 0) {
    await Student.bulkWrite(bulkOperations);
    const updatedStudents = await Student.find({ _id: { $in: studentIds } });
    await Promise.allSettled(updatedStudents.map((student) => triggerSpreadsheetUpdate(student, { statusOnly: true, skipNoc: true })));
  }
}

async function processAutoDriveRows(rows, userId, fileName, fileType, headers, driveDate) {
  const errors = [];
  const touchedDriveIds = new Set();
  const touchedStudentIds = new Set();
  const driveSummaries = new Map();
  const driveCache = new Map();
  const rowsByDrive = new Map();
  let matched = 0;
  let present = 0;
  let absent = 0;

  const studentMaps = await buildStudentMaps();
  const bulkDriveStudentsMap = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const companyName = String(pickColumn(rows[index], ["companyname", "company", "organisation", "organization"]) || "").trim();
      if (!companyName) {
        errors.push({ row: index + 2, message: "Company name is required to auto-create a drive" });
        continue;
      }
      const jobRole = String(pickColumn(rows[index], ["jobrole", "role", "profile", "designation", "position"]) || "Auto-created from sheet").trim();

      const driveKey = `${companyName.toLowerCase()}::${jobRole.toLowerCase()}`;
      let drive = driveCache.get(driveKey);
      if (!drive) {
        drive = await Drive.findOneAndUpdate(
          {
            createdBy: userId,
            companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i"),
            jobRole: new RegExp(`^${escapeRegex(jobRole)}$`, "i")
          },
          {
            $setOnInsert: {
              companyName,
              jobRole,
              createdBy: userId,
              driveDate: driveDate ? new Date(driveDate) : new Date(),
              approvalStatus: "DRAFT",
              driveStatus: "DRAFT"
            }
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        if (driveDate && drive.driveDate?.getTime() !== new Date(driveDate).getTime()) {
          drive.driveDate = new Date(driveDate);
          await drive.save();
        }
        driveCache.set(driveKey, drive);
      }

      const driveIdStr = drive._id.toString();
      touchedDriveIds.add(driveIdStr);
      if (!rowsByDrive.has(driveIdStr)) rowsByDrive.set(driveIdStr, []);
      rowsByDrive.get(driveIdStr).push(rows[index]);
      const existingSummary = driveSummaries.get(driveIdStr) || { driveId: drive._id, companyName: drive.companyName, jobRole: drive.jobRole, matched: 0, present: 0, absent: 0 };
      driveSummaries.set(driveIdStr, existingSummary);

      const student = await findMasterStudentFromRow(rows[index], studentMaps);

      if (!student) {
        errors.push({ row: index + 2, companyName: drive.companyName, message: "Student not found in master records" });
        continue;
      }

      const registrationValue = pickColumn(rows[index], ["registrationstatus", "registration", "registered", "register"]);
      const processStatuses = getProcessStatuses(rows[index]);
      const registrationStatus = normalizeRegistrationStatus(registrationValue);

      const roundHistory = processStatuses.map((item) => ({ ...item, notes: "Uploaded from attendance file", markedBy: userId }));
      const attendance = calculateDriveAttendance(registrationStatus, roundHistory);
      const currentRound = processStatuses.at(-1)?.roundName || "Attendance";

      const bulkKey = `${drive._id.toString()}::${student._id.toString()}`;
      bulkDriveStudentsMap.set(bulkKey, {
        updateOne: {
          filter: { drive: drive._id, student: student._id },
          update: {
            $setOnInsert: { eligibilityStatus: "ELIGIBLE" },
            $set: {
              registrationStatus,
              roundHistory,
              overallAttendanceStatus: attendance.overallAttendanceStatus,
              overallAttendanceReason: attendance.overallAttendanceReason,
              currentRound
            }
          },
          upsert: true
        }
      });

      const studentIdStr = student._id.toString();
      touchedStudentIds.add(studentIdStr);

      const summary = driveSummaries.get(driveIdStr);
      summary.matched += 1;
      matched += 1;
      if (attendance.overallAttendanceStatus === "OVERALL_PRESENT") {
        summary.present += 1;
        present += 1;
      }
      if (attendance.overallAttendanceStatus === "OVERALL_ABSENT") {
        summary.absent += 1;
        absent += 1;
      }
      driveSummaries.set(driveIdStr, summary);
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  }

  // Execute bulk updates for DriveStudent
  if (bulkDriveStudentsMap.size > 0) {
    await DriveStudent.bulkWrite(Array.from(bulkDriveStudentsMap.values()));
  }

  // Refresh stats for all touched drives
  for (const driveId of touchedDriveIds) {
    await refreshDriveStats(driveId);
  }

  // Refresh stuck off status in bulk for touched students
  if (touchedStudentIds.size > 0) {
    await bulkRefreshStudentStuckOff(touchedStudentIds);
  }

  const result = {
    rows: rows.length,
    drives: [...driveSummaries.values()],
    matched,
    present,
    absent,
    errors: errors.slice(0, 200),
    errorCount: errors.length,
    touchedDriveCount: touchedDriveIds.size
  };
  
  for (const driveId of touchedDriveIds) {
    const driveRows = rowsByDrive.get(driveId) || [];
    const driveSummary = driveSummaries.get(driveId);
    await AttendanceSheet.create({
      drive: driveId,
      uploadedBy: userId,
      fileName,
      fileType,
      preparedByNames: getPlacementOfficerNames(driveRows),
      headers,
      rows: driveRows,
      rowCount: driveRows.length,
      uploadResult: {
        ...result,
        rows: driveRows.length,
        drives: driveSummary ? [driveSummary] : []
      }
    });
  }

  return result;
}

async function processExistingDriveRows({ drive, rows, userId, markMissingAbsent = false, fileName, fileType, headers, persistSheet = true }) {
  let processedRows = rows;
  if (drive && drive.companyName) {
    processedRows = rowsForDriveCompany(rows, drive.companyName);
  }

  const seenStudentIds = new Set();
  const touchedStudentIds = new Set();
  const errors = [];
  let matched = 0;
  let present = 0;
  let absent = 0;

  const studentMaps = await buildStudentMaps();
  const bulkDriveStudentsMap = new Map();

  for (let index = 0; index < processedRows.length; index += 1) {
    try {
      const student = await findMasterStudentFromRow(processedRows[index], studentMaps);

      if (!student) {
        errors.push({ row: index + 2, message: "Student not found in master records" });
        continue;
      }

      const registrationValue = pickColumn(processedRows[index], ["registrationstatus", "registration", "registered", "register"]);
      const processStatuses = getProcessStatuses(processedRows[index]);
      const registrationStatus = normalizeRegistrationStatus(registrationValue);

      const roundHistory = processStatuses.map((item) => ({ ...item, notes: "Uploaded from edited attendance rows", markedBy: userId }));
      const attendance = calculateDriveAttendance(registrationStatus, roundHistory);
      const currentRound = processStatuses.at(-1)?.roundName || "Attendance";

      const bulkKey = `${drive._id.toString()}::${student._id.toString()}`;
      bulkDriveStudentsMap.set(bulkKey, {
        updateOne: {
          filter: { drive: drive._id, student: student._id },
          update: {
            $setOnInsert: { eligibilityStatus: "ELIGIBLE" },
            $set: {
              registrationStatus,
              roundHistory,
              overallAttendanceStatus: attendance.overallAttendanceStatus,
              overallAttendanceReason: attendance.overallAttendanceReason,
              currentRound
            }
          },
          upsert: true
        }
      });

      const studentIdStr = student._id.toString();
      seenStudentIds.add(studentIdStr);
      touchedStudentIds.add(studentIdStr);
      matched += 1;
      if (attendance.overallAttendanceStatus === "OVERALL_PRESENT") present += 1;
      if (attendance.overallAttendanceStatus === "OVERALL_ABSENT") absent += 1;
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  }

  if (bulkDriveStudentsMap.size > 0) {
    await DriveStudent.bulkWrite(Array.from(bulkDriveStudentsMap.values()));
  }

  if (markMissingAbsent) {
    const existing = await DriveStudent.find({ drive: drive._id, student: { $nin: [...seenStudentIds] } });
    const bulkMissingAbsent = [];
    for (const item of existing) {
      const newRoundHistory = [...(item.roundHistory || [])];
      newRoundHistory.push({ roundName: "Attendance Upload", status: "ABSENT", notes: "Missing from uploaded attendance file", markedBy: userId });
      const attendance = calculateDriveAttendance(item.registrationStatus, newRoundHistory);
      
      bulkMissingAbsent.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              roundHistory: newRoundHistory,
              overallAttendanceStatus: attendance.overallAttendanceStatus,
              overallAttendanceReason: attendance.overallAttendanceReason,
              currentRound: "Attendance Upload"
            }
          }
        }
      });
      touchedStudentIds.add(item.student.toString());
      absent += 1;
    }
    if (bulkMissingAbsent.length > 0) {
      await DriveStudent.bulkWrite(bulkMissingAbsent);
    }
  }

  await refreshDriveStats(drive._id);
  
  if (touchedStudentIds.size > 0) {
    await bulkRefreshStudentStuckOff(touchedStudentIds);
  }
  
  const result = { rows: processedRows.length, matched, present, absent, errors };
  
  if (persistSheet) {
    await AttendanceSheet.create({
      drive: drive._id,
      uploadedBy: userId,
      fileName,
      fileType,
      preparedByNames: getPlacementOfficerNames(processedRows),
      headers,
      rows: processedRows,
      rowCount: processedRows.length,
      uploadResult: result
    });
  }

  return result;
}

async function rebuildDriveAttendanceFromSheets(drive, actorId) {
  const existingDriveStudents = await DriveStudent.find({ drive: drive._id }).select("student").lean();
  const touchedStudentIds = new Set(existingDriveStudents.map((item) => item.student?.toString()).filter(Boolean));
  await DriveStudent.deleteMany({ drive: drive._id });

  const remainingSheets = await AttendanceSheet.find({ drive: drive._id }).sort({ createdAt: 1 }).lean();
  for (const sheet of remainingSheets) {
    const result = await processExistingDriveRows({
      drive,
      rows: sheet.rows || [],
      userId: sheet.uploadedBy || actorId,
      fileName: sheet.fileName,
      fileType: sheet.fileType,
      headers: sheet.headers || [],
      persistSheet: false
    });
    const matchedRows = await DriveStudent.find({ drive: drive._id }).select("student").lean();
    matchedRows.forEach((item) => {
      if (item.student) touchedStudentIds.add(item.student.toString());
    });
    sheet.uploadResult = { ...(sheet.uploadResult || {}), ...result };
  }

  await refreshDriveStats(drive._id);
  if (touchedStudentIds.size) {
    await bulkRefreshStudentStuckOff(touchedStudentIds);
  }
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  const filter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
  const drives = await Drive.find(filter).populate("createdBy", "name email designation profileImage active").sort({ updatedAt: -1 }).lean();
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
  const latestSheets = await AttendanceSheet.aggregate([
    { $match: { drive: { $in: driveIds } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$drive",
        preparedByNames: { $first: "$preparedByNames" },
        rowCount: { $first: "$rowCount" },
        uploadRows: { $first: "$uploadResult.rows" },
        rowsSize: { $first: { $cond: [{ $isArray: "$rows" }, { $size: "$rows" }, 0] } }
      }
    }
  ]);
  const latestSheetByDrive = new Map(latestSheets.map((sheet) => [sheet._id.toString(), {
    rowCount: sheet.rowCount || sheet.uploadRows || sheet.rowsSize || 0,
    preparedByNames: (sheet.preparedByNames || []).filter(Boolean)
  }]));
  res.json(drives.map((drive) => {
    const computed = statsByDrive.get(drive._id.toString()) || drive.stats || {};
    const latestSheet = latestSheetByDrive.get(drive._id.toString()) || {};
    const uploadedRows = latestSheet.rowCount || 0;
    const eligibleStudents = uploadedRows || computed.eligibleStudents || 0;
    const registeredStudents = Math.min(computed.registeredStudents || 0, eligibleStudents);
    return {
      ...drive,
      preparedByNames: latestSheet.preparedByNames || [],
      stats: {
        ...computed,
        eligibleStudents,
        registeredStudents,
        nonRegisteredStudents: Math.max(0, eligibleStudents - registeredStudents),
        totalStudentsConsidered: eligibleStudents
      }
    };
  }));
});

router.post("/", requireRole("LIST_MAKER"), async (req, res) => {
  const parsed = driveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Drive details are invalid" });
  const drive = await Drive.create({ ...parsed.data, driveDate: parsed.data.driveDate ? new Date(parsed.data.driveDate) : undefined, createdBy: req.user._id });
  await writeAudit({ actor: req.user._id, action: "DRIVE_CREATED", entity: "Drive", entityId: drive._id });
  res.status(201).json(drive);
});

router.delete("/", requireRole("HOD"), async (req, res) => {
  const parsed = deleteDrivesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Select at least one drive to delete" });

  const result = await deleteDrivesByIds(parsed.data.driveIds, req.user._id);
  res.json({ message: `${result.deletedDrives} drive${result.deletedDrives === 1 ? "" : "s"} deleted successfully`, ...result });
});

router.delete("/:id", requireRole("HOD"), async (req, res) => {
  const result = await deleteDrivesByIds([req.params.id], req.user._id);
  if (!result.deletedDrives) return res.status(404).json({ message: "Drive not found" });
  res.json({ message: "Drive deleted successfully", ...result });
});

router.post("/attendance-sheet", requireRole("LIST_MAKER", "HOD"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Attendance sheet file is required" });
    const { headers, rows, normalization } = parseAttendanceRows(req.file, { companyName: req.body.companyName });
    if (!rows || !rows.length) return res.status(400).json({ message: "The uploaded file contains no data rows" });
    const fileName = req.file.originalname;
    const fileType = fileName.split('.').pop().toLowerCase();
    const result = await processAutoDriveRows(rows, req.user._id, fileName, fileType, headers, req.body.driveDate);
    await writeAudit({
      actor: req.user._id,
      action: "DRIVE_SHEET_UPLOADED",
      entity: "Drive",
      metadata: { rows: result.rows, drives: result.touchedDriveCount, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length }
    });

    res.json({ rows: result.rows, drives: result.drives, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors, errorCount: result.errorCount, normalization });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to process attendance sheet" });
  }
});

router.post("/attendance-preview", requireRole("LIST_MAKER", "HOD"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Attendance sheet file is required" });
    const { headers, rows, normalization } = parseAttendanceRows(req.file, { companyName: req.body.companyName });
    if (!rows || !rows.length) return res.status(400).json({ message: "The uploaded file contains no data rows" });
    const previewRows = rows.slice(0, 1000);
    const summary = summarizePreviewRows(previewRows, headers);
    const companyNames = new Set();
    for (const row of rows) {
      const companyName = String(pickColumn(row, ["companyname", "company", "organisation", "organization"]) || "").trim();
      if (companyName) companyNames.add(companyName);
    }
    summary.totalRowCount = rows.length;
    summary.companyCount = companyNames.size;
    summary.companies = Array.from(companyNames).slice(0, 30);
    summary.normalization = normalization;
    summary.notice = normalization?.mode === "FLAT_TABLE"
      ? `Read 1 standard table with ${normalization.cleanRows} student data row(s) from ${normalization.originalRows} spreadsheet row(s).`
      : normalization?.normalized
      ? `Converted ${normalization.blockCount} detected block(s) into ${normalization.cleanRows} clean aligned row(s).`
      : "Preview uses the sheet's original header row because no split blocks were detected.";
    if (rows.length > 1000) {
      summary.truncated = true;
      summary.notice = `${summary.notice} Showing first 1000 rows only; upload will process the full file.`;
    }
    res.json(summary);
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to generate attendance sheet preview" });
  }
});

router.post("/attendance-rows", requireRole("LIST_MAKER", "HOD"), async (req, res) => {
  try {
    const parsed = editedAttendanceRowsSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log("Validation error on /attendance-rows:", parsed.error);
      return res.status(400).json({ message: "Edited attendance rows are invalid", details: parsed.error.format() });
    }
    const cleanRows = (parsed.data.rows || []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
    if (!cleanRows.length) return res.status(400).json({ message: "No valid data rows found in request" });
    if (req.body.companyName) {
      cleanRows.forEach((row) => {
        row["Company Name"] = req.body.companyName;
      });
    }
    const headers = cleanRows.length ? Object.keys(cleanRows[0]) : [];
    const result = await processAutoDriveRows(cleanRows, req.user._id, "edited-upload.xlsx", "xlsx", headers, req.body.driveDate);
    await writeAudit({
      actor: req.user._id,
      action: "DRIVE_SHEET_EDITED_ROWS_UPLOADED",
      entity: "Drive",
      metadata: { rows: result.rows, drives: result.touchedDriveCount, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors.length }
    });
    res.json({ rows: result.rows, drives: result.drives, matched: result.matched, present: result.present, absent: result.absent, errors: result.errors, errorCount: result.errorCount });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to save attendance rows" });
  }
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
  const { headers, rows } = parseAttendanceRows(req.file, { companyName: req.body.companyName });
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
  if (!parsed.success) {
    console.log("Validation error on /:id/attendance-rows:", parsed.error);
    return res.status(400).json({ message: "Edited attendance rows are invalid", details: parsed.error.format() });
  }
  const cleanRows = (parsed.data.rows || []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
  if (!cleanRows.length) return res.status(400).json({ message: "No valid data rows found in request" });
  const headers = cleanRows.length ? Object.keys(cleanRows[0]) : [];
  const result = await processExistingDriveRows({
    drive,
    rows: cleanRows,
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

router.get("/reports/stuck-off", requireRole("HOD"), async (req, res) => {
  try {
    const { department = "ALL", course = "ALL" } = req.query;

    const studentQuery = { "driveRestriction.absentDriveCount": { $gt: 0 }, status: { $ne: "NOC" } };
    if (department !== "ALL") studentQuery.department = department;
    if (course !== "ALL") studentQuery.course = course;

    const matchingStudents = await Student.find(studentQuery)
      .select("studentId rollNo enrollmentNo registrationNo name batch department course program driveRestriction status")
      .lean();

    const studentIds = matchingStudents.map((s) => s._id);

    const driveStudents = await DriveStudent.find({ student: { $in: studentIds } })
      .populate("drive", "companyName jobRole driveDate createdAt")
      .lean();

    const driveRecordsMap = new Map();
    for (const ds of driveStudents) {
      if (!ds.student) continue;
      const sId = ds.student.toString();
      if (!driveRecordsMap.has(sId)) {
        driveRecordsMap.set(sId, []);
      }
      driveRecordsMap.get(sId).push(ds);
    }

    const report = [];
    for (const student of matchingStudents) {
      const sId = student._id.toString();
      const records = driveRecordsMap.get(sId) || [];

      records.sort((a, b) => {
        const dateA = new Date(a.drive?.driveDate || a.drive?.createdAt || a.updatedAt || 0);
        const dateB = new Date(b.drive?.driveDate || b.drive?.createdAt || b.updatedAt || 0);
        return dateA - dateB;
      });

      const totalAbsent = student.driveRestriction?.absentDriveCount || 0;
      const maxConsecutiveAbsent = student.driveRestriction?.consecutiveAbsentCount || 0;
      const isStuckOff = maxConsecutiveAbsent >= STUCK_OFF_ABSENCE_THRESHOLD;
      const remainingBeforeStuckOff = Math.max(STUCK_OFF_ABSENCE_THRESHOLD - maxConsecutiveAbsent, 0);

      report.push({
        student,
        absentDriveCount: totalAbsent,
        consecutiveAbsentCount: maxConsecutiveAbsent,
        threshold: STUCK_OFF_ABSENCE_THRESHOLD,
        remainingBeforeStuckOff,
        status: isStuckOff ? "STUCK_OFF" : "WATCH",
        reason: isStuckOff
          ? `Absent in ${maxConsecutiveAbsent} consecutive drives. Policy: absent in ${STUCK_OFF_ABSENCE_THRESHOLD} or more consecutive drives is Struck Off.`
          : `${remainingBeforeStuckOff} more consecutive absence${remainingBeforeStuckOff === 1 ? "" : "s"} will move this student to Struck Off.`,
        drives: records.map((item) => ({
          companyName: item.drive?.companyName,
          jobRole: item.drive?.jobRole,
          driveDate: item.drive?.driveDate,
          registrationStatus: item.registrationStatus,
          overallAttendanceStatus: item.overallAttendanceStatus,
          reason: item.overallAttendanceReason
        }))
      });
    }

    report.sort((a, b) => {
      if (a.status !== b.status) return a.status === "STUCK_OFF" ? -1 : 1;
      return b.consecutiveAbsentCount - a.consecutiveAbsentCount || b.absentDriveCount - a.absentDriveCount;
    });

    const [departments, courses] = await Promise.all([
      Student.distinct("department"),
      Student.distinct("course")
    ]);

    res.json({
      items: report,
      departments: departments.filter(Boolean).sort(),
      courses: courses.filter(Boolean).sort(),
      threshold: STUCK_OFF_ABSENCE_THRESHOLD
    });
  } catch (error) {
    console.error("Error in stuck-off report:", error);
    res.status(500).json({ message: error.message });
  }
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
  
  res.json(sheets.map((sheet) => {
    const scopedRows = rowsForDriveCompany(sheet.rows || [], drive.companyName);
    return {
      ...sheet,
      rows: scopedRows,
      preparedByNames: getPlacementOfficerNames(scopedRows),
      rowCount: scopedRows.length || sheet.rowCount
    };
  }));
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
  
  const plainSheet = sheet.toObject ? sheet.toObject() : sheet;
  const scopedRows = rowsForDriveCompany(plainSheet.rows || [], drive.companyName);
  res.json({
    ...plainSheet,
    rows: scopedRows,
    preparedByNames: getPlacementOfficerNames(scopedRows),
    rowCount: scopedRows.length || plainSheet.rowCount
  });
});

router.get("/sheets/:id/download", requireAuth, async (req, res) => {
  const sheet = await AttendanceSheet.findById(req.params.id)
    .populate("drive", "companyName jobRole createdBy");

  if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  const drive = sheet.drive;
  if (req.user.role !== "HOD" && String(drive?.createdBy?._id || drive?.createdBy) !== req.user._id.toString()) {
    return res.status(403).json({ message: "You cannot download this sheet" });
  }

  const format = String(req.query.format || "csv").toLowerCase();
  const selectedColumns = String(req.query.columns || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const plainSheet = sheet.toObject ? sheet.toObject() : sheet;
  const rows = rowsForDriveCompany(plainSheet.rows || [], drive?.companyName);
  const headers = selectedColumns.length ? selectedColumns : (plainSheet.headers || Object.keys(rows[0] || {}));
  const outputRows = rows.map((row) => Object.fromEntries(headers.map((header) => [header, row?.[header] ?? ""])));
  const baseName = String(plainSheet.fileName || "uploaded-sheet").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_");

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.json"`);
    return res.json(outputRows);
  }

  if (format === "xlsx") {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(outputRows, { header: headers });
    ws["!cols"] = headers.map((header) => ({ wch: Math.min(Math.max(String(header).length + 4, 14), 34) }));
    xlsx.utils.book_append_sheet(wb, ws, "Uploaded Sheet");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
    return res.send(buffer);
  }

  const csv = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(outputRows, { header: headers }));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
  return res.send(csv);
});

router.delete("/sheets/:id", requireAuth, requireRole("HOD"), async (req, res) => {
  const sheet = await AttendanceSheet.findById(req.params.id)
    .populate("drive", "companyName jobRole createdBy");

  if (!sheet) return res.status(404).json({ message: "Sheet not found" });
  const drive = sheet.drive;
  if (!drive) return res.status(404).json({ message: "Drive not found for this sheet" });

  await AttendanceSheet.deleteOne({ _id: sheet._id });
  await rebuildDriveAttendanceFromSheets(drive, req.user._id);
  await writeAudit({
    actor: req.user._id,
    action: "ATTENDANCE_SHEET_DELETED",
    entity: "AttendanceSheet",
    entityId: sheet._id,
    metadata: { driveId: drive._id, companyName: drive.companyName, fileName: sheet.fileName }
  });

  res.json({ message: "Sheet deleted and drive attendance recalculated" });
});

// Get Drive reports summary for HOD with Department & Batch filtering and breakdowns
router.get("/reports/drives-summary", requireAuth, requireRole("HOD", "LIST_MAKER"), async (req, res) => {
  try {
    const { department = "ALL", batch = "ALL", month = "ALL" } = req.query;
    const program = req.query.program || req.query.stream || "ALL";
    const driveOwnerFilter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };

    const [allDepartments, allBatches, allPrograms] = await Promise.all([
      Student.distinct("department"),
      Student.distinct("batch"),
      Student.distinct("program")
    ]);

    const driveDateFilter = {};
    if (month !== "ALL") {
      const [year, monthNumber] = String(month).split("-").map(Number);
      if (year && monthNumber) {
        driveDateFilter.driveDate = {
          $gte: new Date(year, monthNumber - 1, 1),
          $lt: new Date(year, monthNumber, 1)
        };
      }
    }

    const drives = await Drive.find({ ...driveOwnerFilter, ...driveDateFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }).lean();
    const scopedDriveIds = drives.map((drive) => drive._id);
    const allReportDrives = await Drive.find({ ...driveOwnerFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } })
      .select("driveDate createdAt")
      .lean();
    const months = Array.from(new Set(allReportDrives.map((drive) => {
      const date = new Date(drive.driveDate || drive.createdAt);
      return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : null;
    }).filter(Boolean))).sort().reverse();

    // Fetch stats for all drives in one aggregation query
    const aggregationPipeline = [
      { $match: { drive: { $in: scopedDriveIds } } },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" }
    ];

    const matchConditions = {};
    if (department !== "ALL") {
      matchConditions["studentInfo.department"] = department;
    }
    if (batch !== "ALL") {
      matchConditions["studentInfo.batch"] = batch;
    }
    if (program !== "ALL") {
      matchConditions["studentInfo.program"] = program;
    }
    if (Object.keys(matchConditions).length > 0) {
      aggregationPipeline.push({ $match: matchConditions });
    }

    aggregationPipeline.push({
      $group: {
        _id: "$drive",
        totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
        totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
        present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
      }
    });

    const allStats = await DriveStudent.aggregate(aggregationPipeline);
    const statsByDrive = new Map(allStats.map((item) => [item._id.toString(), item]));

    const summaries = drives.map((drive) => {
      const rep = statsByDrive.get(drive._id.toString()) || { totalEligible: 0, totalRegistered: 0, totalSelected: 0, present: 0, absent: 0 };
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
    });

    // Department-wise and Batch-wise breakdowns across all matching records
    const deptPipeline = [
      { $match: { drive: { $in: scopedDriveIds } } },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" }
    ];

    if (department !== "ALL" || batch !== "ALL" || program !== "ALL") {
      const matchCond = {};
      if (department !== "ALL") matchCond["studentInfo.department"] = department;
      if (batch !== "ALL") matchCond["studentInfo.batch"] = batch;
      if (program !== "ALL") matchCond["studentInfo.program"] = program;
      deptPipeline.push({ $match: matchCond });
    }

    const deptStatsPipeline = [
      ...deptPipeline,
      {
        $group: {
          _id: { $ifNull: ["$studentInfo.department", "Unmapped"] },
          totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
          totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
          totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
          present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const batchStatsPipeline = [
      ...deptPipeline,
      {
        $group: {
          _id: { $ifNull: ["$studentInfo.batch", "Unmapped"] },
          totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
          totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
          totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
          present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const programStatsPipeline = [
      ...deptPipeline,
      {
        $group: {
          _id: { $ifNull: ["$studentInfo.program", "Unmapped"] },
          totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
          totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
          totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
          present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const [departmentSummary, batchSummary, programSummary] = await Promise.all([
      DriveStudent.aggregate(deptStatsPipeline),
      DriveStudent.aggregate(batchStatsPipeline),
      DriveStudent.aggregate(programStatsPipeline)
    ]);

    const formatBreakdown = (items, keyName) => items.map((item) => {
      const gTotal = item.present + item.absent;
      return {
        [keyName]: item._id,
        totalEligible: item.totalEligible,
        totalRegistered: item.totalRegistered,
        totalSelected: item.totalSelected,
        present: item.present,
        absent: item.absent,
        grandTotal: gTotal,
        presentPercent: gTotal > 0 ? Math.round((item.present / gTotal) * 100) : 0,
        absentPercent: gTotal > 0 ? Math.round((item.absent / gTotal) * 100) : 0
      };
    });

    res.json({
      summaries: summaries.filter(Boolean),
      byDepartment: formatBreakdown(departmentSummary, "department"),
      byBatch: formatBreakdown(batchSummary, "batch"),
      byProgram: formatBreakdown(programSummary, "program"),
      departments: allDepartments.filter(Boolean).sort(),
      batches: allBatches.filter(Boolean).sort(),
      programs: allPrograms.filter(Boolean).sort(),
      months,
      selectedMonth: month,
      selectedProgram: program
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export HOD Drive & Attendance Report in Excel format with DCPC Logo & Metadata
router.get("/reports/drives-summary/export", requireAuth, requireRole("HOD", "LIST_MAKER"), async (req, res) => {
  try {
    const { department = "ALL", batch = "ALL", month = "ALL" } = req.query;
    const program = req.query.program || req.query.stream || "ALL";
    const driveOwnerFilter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
    const driveDateFilter = {};
    if (month !== "ALL") {
      const [year, monthNumber] = String(month).split("-").map(Number);
      if (year && monthNumber) {
        driveDateFilter.driveDate = {
          $gte: new Date(year, monthNumber - 1, 1),
          $lt: new Date(year, monthNumber, 1)
        };
      }
    }
    const drives = await Drive.find({ ...driveOwnerFilter, ...driveDateFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }).lean();

    const companyRows = [];
    let totEligible = 0, totReg = 0, totSel = 0, totPres = 0, totAbs = 0;

    const aggregationPipeline = [
      { $match: { drive: { $in: drives.map((d) => d._id) } } },
      { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
      { $unwind: "$studentInfo" }
    ];

    const matchCond = {};
    if (department !== "ALL") matchCond["studentInfo.department"] = department;
    if (batch !== "ALL") matchCond["studentInfo.batch"] = batch;
    if (program !== "ALL") matchCond["studentInfo.program"] = program;
    if (Object.keys(matchCond).length > 0) aggregationPipeline.push({ $match: matchCond });

    aggregationPipeline.push({
      $group: {
        _id: "$drive",
        totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
        totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
        present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
      }
    });

    const allStats = await DriveStudent.aggregate(aggregationPipeline);
    const statsByDrive = new Map(allStats.map((item) => [item._id.toString(), item]));

    for (const drive of drives) {
      const rep = statsByDrive.get(drive._id.toString()) || { totalEligible: 0, totalRegistered: 0, totalSelected: 0, present: 0, absent: 0 };
      const gTotal = rep.present + rep.absent;
      const presPct = gTotal > 0 ? `${Math.round((rep.present / gTotal) * 100)}%` : "0%";
      const absPct = gTotal > 0 ? `${Math.round((rep.absent / gTotal) * 100)}%` : "0%";

      totEligible += rep.totalEligible;
      totReg += rep.totalRegistered;
      totSel += rep.totalSelected;
      totPres += rep.present;
      totAbs += rep.absent;

      companyRows.push({
        "Company Name": drive.companyName,
        "Job Role": drive.jobRole || "N/A",
        "Total Eligible": rep.totalEligible,
        "Total Registered": rep.totalRegistered,
        "Total Selected": rep.totalSelected,
        "Absent": rep.absent,
        "Present": rep.present,
        "Grand Total (Present+Absent)": gTotal,
        "Present Ratio (%)": presPct,
        "Absent Ratio (%)": absPct
      });
    }

    const overallGTotal = totPres + totAbs;
    companyRows.push({
      "Company Name": "GRAND TOTAL",
      "Job Role": "-",
      "Total Eligible": totEligible,
      "Total Registered": totReg,
      "Total Selected": totSel,
      "Absent": totAbs,
      "Present": totPres,
      "Grand Total (Present+Absent)": overallGTotal,
      "Present Ratio (%)": overallGTotal > 0 ? `${Math.round((totPres / overallGTotal) * 100)}%` : "0%",
      "Absent Ratio (%)": overallGTotal > 0 ? `${Math.round((totAbs / overallGTotal) * 100)}%` : "0%"
    });

    const wb = xlsx.utils.book_new();

    const headerRows = [
      ["DCPD", "", "DEPARTMENT OF CAREER PLANNING & COUNSELING"],
      ["Eligibility Flow", "", "DRIVES ATTENDANCE & SELECTION ANALYTICS REPORT"],
      [`Prepared By: ${req.user.name} (${req.user.role})`, "", `Generated On: ${new Date().toLocaleString()}`],
      [`Filters Applied: Department: ${department}`, `Batch: ${batch}`, `Stream: ${program}`, `Month: ${month === "ALL" ? "All history" : month}`],
      []
    ];

    const wsCompany = xlsx.utils.aoa_to_sheet(headerRows);
    xlsx.utils.sheet_add_json(wsCompany, companyRows, { origin: "A6" });
    wsCompany["!merges"] = [
      { s: { r: 0, c: 2 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 2 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 9 } }
    ];
    wsCompany["!cols"] = [
      { wch: 38 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }
    ];
    wsCompany["!rows"] = [
      { hpt: 26 }, { hpt: 24 }, { hpt: 21 }, { hpt: 21 }, { hpt: 8 },
      { hpt: 24 }, ...companyRows.map(() => ({ hpt: 22 }))
    ];
    wsCompany["!freeze"] = { xSplit: 0, ySplit: 6 };
    wsCompany["!pageSetup"] = { paperSize: 9, orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
    wsCompany["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    if (wsCompany["!ref"]) wsCompany["!autofilter"] = { ref: xlsx.utils.encode_range({ s: { r: 5, c: 0 }, e: xlsx.utils.decode_range(wsCompany["!ref"]).e }) };
    xlsx.utils.book_append_sheet(wb, wsCompany, "Company Summary");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="DCPC_Drive_Report_${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/reports/drives-summary/pdf", requireAuth, requireRole("HOD", "LIST_MAKER"), async (req, res) => {
  try {
    const { department = "ALL", batch = "ALL", month = "ALL" } = req.query;
    const program = req.query.program || req.query.stream || "ALL";
    const driveOwnerFilter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
    const driveDateFilter = {};
    if (month !== "ALL") {
      const [year, monthNumber] = String(month).split("-").map(Number);
      if (year && monthNumber) {
        driveDateFilter.driveDate = {
          $gte: new Date(year, monthNumber - 1, 1),
          $lt: new Date(year, monthNumber, 1)
        };
      }
    }

    const drives = await Drive.find({ ...driveOwnerFilter, ...driveDateFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }).lean();
    const aggregationPipeline = [
      { $match: { drive: { $in: drives.map((d) => d._id) } } },
      { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
      { $unwind: "$studentInfo" }
    ];
    const matchCond = {};
    if (department !== "ALL") matchCond["studentInfo.department"] = department;
    if (batch !== "ALL") matchCond["studentInfo.batch"] = batch;
    if (program !== "ALL") matchCond["studentInfo.program"] = program;
    if (Object.keys(matchCond).length > 0) aggregationPipeline.push({ $match: matchCond });
    aggregationPipeline.push({
      $group: {
        _id: "$drive",
        totalEligible: { $sum: { $cond: [{ $eq: ["$eligibilityStatus", "ELIGIBLE"] }, 1, 0] } },
        totalRegistered: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } },
        totalSelected: { $sum: { $cond: [{ $in: ["$finalOutcome", ["SELECTED", "PLACED", "Selected", "Placed"]] }, 1, 0] } },
        present: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_PRESENT"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$overallAttendanceStatus", "OVERALL_ABSENT"] }, 1, 0] } }
      }
    });

    const allStats = await DriveStudent.aggregate(aggregationPipeline);
    const statsByDrive = new Map(allStats.map((item) => [item._id.toString(), item]));
    let totals = { totalEligible: 0, totalRegistered: 0, totalSelected: 0, absent: 0, present: 0, grandTotal: 0 };
    const rows = drives.map((drive) => {
      const rep = statsByDrive.get(drive._id.toString()) || { totalEligible: 0, totalRegistered: 0, totalSelected: 0, present: 0, absent: 0 };
      const grandTotal = rep.present + rep.absent;
      const presentPercent = grandTotal > 0 ? `${Math.round((rep.present / grandTotal) * 100)}%` : "0%";
      const absentPercent = grandTotal > 0 ? `${Math.round((rep.absent / grandTotal) * 100)}%` : "0%";
      totals.totalEligible += rep.totalEligible;
      totals.totalRegistered += rep.totalRegistered;
      totals.totalSelected += rep.totalSelected;
      totals.absent += rep.absent;
      totals.present += rep.present;
      totals.grandTotal += grandTotal;
      return {
        cells: [drive.companyName, rep.totalEligible, rep.totalRegistered, rep.totalSelected, rep.absent, rep.present, grandTotal, presentPercent, absentPercent]
      };
    });
    rows.push({
      isTotal: true,
      cells: [
        "Grand Total",
        totals.totalEligible,
        totals.totalRegistered,
        totals.totalSelected,
        totals.absent,
        totals.present,
        totals.grandTotal,
        totals.grandTotal > 0 ? `${Math.round((totals.present / totals.grandTotal) * 100)}%` : "0%",
        totals.grandTotal > 0 ? `${Math.round((totals.absent / totals.grandTotal) * 100)}%` : "0%"
      ]
    });

    const pdf = makeSimplePdf({
      title: "Eligibility Flow",
      subtitle: "DCPD Attendance & Selection Report",
      metaRows: [
        `Prepared By: ${req.user.name} (${req.user.role})`,
        `Generated On: ${new Date().toLocaleString()}`,
        `Filters: Department ${department} | Batch ${batch} | Stream ${program} | Month ${month === "ALL" ? "All History" : month}`
      ],
      tableHeaders: ["Company", "Eligible", "Registered", "Selected", "Absent", "Present", "Total", "Present %", "Absent %"],
      tableRows: rows
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="DCPD_Drive_Report_${Date.now()}.pdf"`);
    res.send(pdf);
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
    if (req.user.role !== "HOD" && String(drive.createdBy) !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot request changes for another list maker's drive" });
    }

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

export { normalizeAttendanceRowsFromMatrix, parseAttendanceRows };
export default router;
