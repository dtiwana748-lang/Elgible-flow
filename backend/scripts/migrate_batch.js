import "dotenv/config";
import { connectDb } from "../config/db.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import mongoose from "mongoose";

await connectDb();
const result = await SpreadsheetConnection.updateMany(
  { batch: { $exists: false } },
  { $set: { batch: "2027", name: "Master Student Sheet - 2027" } }
);
console.log("Migration result:", result);

mongoose.connection.close();
process.exit(0);
