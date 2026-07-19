import "dotenv/config";
import { connectDb } from "../config/db.js";
import { User } from "../models/User.js";

await connectDb();

const email = process.env.SEED_HOD_EMAIL;
const existing = await User.findOne({ email });

if (existing) {
  console.log(`HOD already exists: ${email}`);
  process.exit(0);
}

await User.create({
  name: process.env.SEED_HOD_NAME || "Head of Department",
  email,
  role: "HOD",
  passwordHash: await User.hashPassword(process.env.SEED_HOD_PASSWORD)
});

console.log(`Seeded HOD account: ${email}`);
process.exit(0);
