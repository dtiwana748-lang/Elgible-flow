import "dotenv/config";
import { connectDb } from "../config/db.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import mongoose from "mongoose";

await connectDb();
const completedLogs = await SpreadsheetSyncLog.find({ status: { $ne: "RUNNING" } }).sort({ createdAt: -1 }).limit(5);
console.log("=== COMPLETED/FAILED LOGS ===");
for (const log of completedLogs) {
  console.log("Log ID:", log._id);
  console.log("Status:", log.status);
  console.log("Summary:", JSON.stringify(log.summary, null, 2));
  console.log("Errors count:", log.errors?.length);
  console.log("First 5 Errors:", JSON.stringify(log.errors?.slice(0, 5), null, 2));
}

// If no completed logs, let's find any log that has errors
const anyLogWithErrors = await SpreadsheetSyncLog.findOne({ "errors.0": { $exists: true } });
if (anyLogWithErrors) {
  console.log("=== FOUND A LOG WITH ERRORS ===");
  console.log("Log ID:", anyLogWithErrors._id);
  console.log("Errors count:", anyLogWithErrors.errors?.length);
  console.log("First 10 Errors:", JSON.stringify(anyLogWithErrors.errors?.slice(0, 10), null, 2));
} else {
  console.log("No logs with errors found in SpreadsheetSyncLog collection.");
}

mongoose.connection.close();
process.exit(0);
