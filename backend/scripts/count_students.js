import "dotenv/config";
import { connectDb } from "../config/db.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { SpreadsheetSyncLog } from "../models/SpreadsheetSyncLog.js";
import { Student } from "../models/Student.js";
import mongoose from "mongoose";

await connectDb();

const connections = await SpreadsheetConnection.find();
console.log("=== CONNECTIONS ===");
console.log(JSON.stringify(connections, null, 2));

const logs = await SpreadsheetSyncLog.find().sort({ createdAt: -1 }).limit(5);
console.log("=== RECENT SYNC LOGS ===");
console.log(JSON.stringify(logs, null, 2));

const totalStudents = await Student.countDocuments();
console.log("=== STUDENT COUNT ===");
console.log("Total:", totalStudents);

mongoose.connection.close();
process.exit(0);
