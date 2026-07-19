import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, unique: true, sparse: true, index: true },
    rollNo: { type: String, required: true, trim: true },
    enrollmentNo: { type: String, trim: true, index: true },
    registrationNo: { type: String, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    batch: { type: String, trim: true, index: true },
    admissionYear: { type: Number, index: true },
    passingYear: { type: Number, index: true },
    department: { type: String, required: true, trim: true, index: true, default: "Unmapped" },
    course: { type: String, trim: true, index: true },
    program: { type: String, required: true, trim: true, index: true, default: "Unmapped" },
    branch: { type: String, trim: true, index: true },
    semester: { type: Number, required: true, min: 1, max: 12, index: true, default: 1 },
    section: { type: String, trim: true },
    cgpa: { type: Number, required: true, min: 0, max: 10, default: 0 },
    percentage: { type: Number, min: 0, max: 100 },
    tenthPercentage: { type: Number, min: 0, max: 100 },
    twelfthPercentage: { type: Number, min: 0, max: 100 },
    diplomaPercentage: { type: Number, min: 0, max: 100 },
    attendance: { type: Number, required: true, min: 0, max: 100, default: 0 },
    backlogs: { type: Number, required: true, min: 0, default: 0 },
    activeBacklogs: { type: Number, min: 0 },
    totalBacklogs: { type: Number, min: 0 },
    category: { type: String, default: "General", trim: true },
    gender: { type: String, trim: true },
    placementStatus: { type: String, default: "NOT_PLACED", trim: true, index: true },
    driveRestriction: {
      status: { type: String, enum: ["CLEAR", "STUCK_OFF"], default: "CLEAR", index: true },
      absentDriveCount: { type: Number, default: 0 },
      reason: String,
      updatedAt: Date
    },
    resumeUrl: { type: String, trim: true },
    codingProfiles: { type: Map, of: String, default: {} },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    sourceStatus: {
      type: String,
      enum: ["LOCAL", "SYNCED", "MISSING_FROM_SOURCE", "ARCHIVED_FROM_SOURCE", "CONFLICT"],
      default: "LOCAL",
      index: true
    },
    source: {
      connection: { type: mongoose.Schema.Types.ObjectId, ref: "SpreadsheetConnection" },
      rowNumber: Number,
      rowHash: String,
      lastSyncedAt: Date,
      lastSeenAt: Date
    },
    localEdits: [{
      field: String,
      previousValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String,
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      editedAt: { type: Date, default: Date.now }
    }],
    status: {
      type: String,
      enum: ["DRAFT", "ELIGIBLE", "NOT_ELIGIBLE", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
      default: "DRAFT",
      index: true
    },
    reason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date
  },
  { timestamps: true }
);

studentSchema.index({ rollNo: 1, department: 1 }, { unique: true });
studentSchema.index({ name: "text", rollNo: "text", enrollmentNo: "text", registrationNo: "text", email: "text", department: "text", program: "text" });
studentSchema.index({ batch: 1, department: 1, course: 1, program: 1, semester: 1, status: 1, sourceStatus: 1 });

export const Student = mongoose.model("Student", studentSchema);
