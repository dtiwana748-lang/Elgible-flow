import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function displayStatusForSheet(studentObj) {
  if (String(studentObj.status || "").trim().toUpperCase() === "NOC") return "NOC";
  if (studentObj.driveRestriction?.status === "STUCK_OFF") return "Struck Off";
  if (String(studentObj.status || "").trim()) return studentObj.status;
  return "Active";
}

function statusColumnsFromMapping(mapping) {
  const columns = new Set();
  for (const [sheetCol, systemField] of Object.entries(mapping || {})) {
    const normalized = normalizeHeader(sheetCol);
    if (systemField === "status" || normalized === "status") columns.add(sheetCol);
  }
  columns.add("Status");
  return Array.from(columns);
}

export async function triggerSpreadsheetUpdate(student, options = {}) {
  if (!student || !student.source || !student.source.connection || !student.source.rowNumber) {
    return;
  }

  try {
    const connection = await SpreadsheetConnection.findById(student.source.connection);
    if (!connection) return;

    const appsScriptUrl = connection.appsScriptUrl || process.env.GOOGLE_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      console.log(`[SpreadsheetSync] Skipped write-back. No Google Apps Script Web App URL configured for ${connection.name}`);
      return;
    }

    const mapping = connection.columnMapping || {};
    const reverseMapping = {};
    for (const [sheetCol, systemField] of Object.entries(mapping)) {
      reverseMapping[systemField] = sheetCol;
    }

    const rowData = {};
    const studentObj = student.toObject ? student.toObject() : student;
    const sheetStatus = displayStatusForSheet(studentObj);

    if (options.skipNoc && sheetStatus === "NOC") {
      console.log(`[SpreadsheetSync] Skipped write-back for NOC student ${student.name}.`);
      return;
    }

    if (options.statusOnly) {
      for (const column of statusColumnsFromMapping(mapping)) {
        rowData[column] = sheetStatus;
      }
    } else {
      for (const [field, value] of Object.entries(studentObj)) {
        if (reverseMapping[field]) {
          rowData[reverseMapping[field]] = value;
        }
      }

      if (studentObj.semesters) {
        for (const [semNum, semData] of Object.entries(studentObj.semesters)) {
          for (const [subField, value] of Object.entries(semData || {})) {
            const key = `semester.${semNum}.${subField}`;
            if (reverseMapping[key]) {
              rowData[reverseMapping[key]] = value;
            }
          }
        }
      }

      for (const column of statusColumnsFromMapping(mapping)) {
        rowData[column] = sheetStatus;
      }
    }

    console.log(`[SpreadsheetSync] Syncing ${options.statusOnly ? "status" : "row"} update for ${student.name} to Google Sheet row ${student.source.rowNumber}...`);

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: options.statusOnly ? "updateStatus" : "update",
        rowNumber: student.source.rowNumber,
        mapping,
        match: {
          grNo: studentObj.grNo || "",
          rollNo: studentObj.rollNo || "",
          enrollmentNo: studentObj.enrollmentNo || "",
          registrationNo: studentObj.registrationNo || "",
          universityId: studentObj.universityId || "",
          email: studentObj.email || "",
          name: studentObj.name || ""
        },
        data: rowData
      })
    });

    if (response.ok) {
      const resData = await response.json().catch(() => ({}));
      console.log(`[SpreadsheetSync] Google Sheet write-back success:`, resData);
    } else {
      console.error(`[SpreadsheetSync] Write-back HTTP status ${response.status}`);
    }
  } catch (error) {
    console.error("[SpreadsheetSync] Error in write-back:", error.message);
  }
}
