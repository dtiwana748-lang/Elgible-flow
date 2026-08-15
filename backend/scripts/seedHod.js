import "dotenv/config";
import { connectDb } from "../config/db.js";
import { User } from "../models/User.js";

await connectDb();

const email = (process.env.SEED_HOD_EMAIL || "Ravneet01@dcpdin").toLowerCase();
const password = process.env.SEED_HOD_PASSWORD;
const name = process.env.SEED_HOD_NAME || "Head of Department";

if (!password) {
  console.error("SEED_HOD_PASSWORD is required to seed or update the HOD account.");
  process.exit(1);
}
const existing = await User.findOne({ email });

if (existing) {
  existing.name = name;
  existing.role = "HOD";
  existing.active = true;
  existing.passwordHash = await User.hashPassword(password);
  await existing.save();
  console.log(`Updated existing HOD account credentials: ${email}`);
  process.exit(0);
}

await User.create({
  name,
  email,
  role: "HOD",
  passwordHash: await User.hashPassword(password)
});

console.log(`Seeded HOD account: ${email}`);
process.exit(0);
