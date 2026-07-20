import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";

export async function triggerSpreadsheetUpdate(student) {
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

    console.log(`[SpreadsheetSync] Syncing update for ${student.name} to Google Sheet row ${student.source.rowNumber}...`);

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        rowNumber: student.source.rowNumber,
        mapping,
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
