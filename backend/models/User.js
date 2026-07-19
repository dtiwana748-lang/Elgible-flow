import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    personalEmail: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["HOD", "LIST_MAKER"], required: true },
    active: { type: Boolean, default: true },
    employeeId: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true, index: true },
    designation: { type: String, trim: true },
    profileImage: { type: String, trim: true },
    assignedBatches: [{ type: String, trim: true }],
    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export const User = mongoose.model("User", userSchema);
