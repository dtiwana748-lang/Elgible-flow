import "dotenv/config";
import { connectDb } from "../config/db.js";
import { Student } from "../models/Student.js";
import mongoose from "mongoose";

await connectDb();
const sample = await Student.findOne();
console.log("=== POPULATED STUDENT IN DB ===");
console.log("Name:", sample.name);
console.log("Status:", sample.status);
console.log("Batch:", sample.batch);
console.log("Phone:", sample.phone);
console.log("Father Contact No:", sample.fatherContactNo);
console.log("Domcile City:", sample.domicileCity);
console.log("Domcile State:", sample.domicileState);
console.log("Address:", sample.address);
console.log("Resume:", sample.resumeUrl);

mongoose.connection.close();
process.exit(0);
