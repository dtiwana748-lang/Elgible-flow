import "dotenv/config";
import { connectDb } from "../config/db.js";
import { Student } from "../models/Student.js";
import mongoose from "mongoose";

await connectDb();
const all = await Student.find({});
console.log("Total students fetched:", all.length);
console.log("Unique statuses:", Array.from(new Set(all.map(s => s.status))));
console.log("Count with status === 'Stuck Off':", all.filter(s => s.status === "Stuck Off").length);
console.log("Count with status === 'Active':", all.filter(s => s.status === "Active").length);
console.log("Count with status === 'NOC':", all.filter(s => s.status === "NOC").length);

mongoose.connection.close();
process.exit(0);
