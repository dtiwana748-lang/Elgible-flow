import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, unique: true, sparse: true },
    rollNo: { type: String, trim: true, index: true },
    enrollmentNo: { type: String, trim: true },
    registrationNo: { type: String, trim: true },
    grNo: { type: String, trim: true },
    universityId: { type: String, trim: true },
    name: { type: String, trim: true, default: "Unnamed Student" },
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    fatherContactNo: { type: String, trim: true },
    batch: { type: String, trim: true, index: true },
    admissionYear: { type: Number, index: true },
    passingYear: { type: Number, index: true },
    department: { type: String, trim: true, index: true, default: "Unmapped" },
    course: { type: String, trim: true, index: true },
    program: { type: String, trim: true, index: true, default: "Unmapped" },
    branch: { type: String, trim: true, index: true },
    specialization: { type: String, trim: true, index: true },
    semester: { type: Number, min: 1, max: 12, index: true, default: 1 },
    section: { type: String, trim: true },
    cgpa: { type: Number, min: 0, max: 100, default: 0 },
    percentage: { type: Number, min: 0, max: 100 },
    tenthPercentage: { type: Number, min: 0, max: 100 },
    tenthPassingYear: { type: Number, index: true },
    twelfthPercentage: { type: Number, min: 0, max: 100 },
    twelfthPassingYear: { type: Number, index: true },
    graduationPercentage: { type: Number, min: 0, max: 100 },
    pgStreams: { type: String, trim: true, index: true },
    diplomaPercentage: { type: Number, min: 0, max: 100 },
    attendance: { type: Number, min: 0, max: 100, default: 0 },
    backlogs: { type: Number, min: 0, default: 0 },
    activeBacklogs: { type: Number, min: 0 },
    totalBacklogs: { type: Number, min: 0 },
    category: { type: String, default: "General", trim: true },
    gender: { type: String, trim: true },
    dob: { type: Date, index: true },
    domicileCity: { type: String, trim: true },
    domicileState: { type: String, trim: true },
    address: { type: String, trim: true },
    college: { type: String, trim: true, index: true },
    placementStatus: { type: String, default: "NOT_PLACED", trim: true, index: true },
    driveRestriction: {
      status: { type: String, enum: ["CLEAR", "STUCK_OFF"], default: "CLEAR", index: true },
      absentDriveCount: { type: Number, default: 0 },
      consecutiveAbsentCount: { type: Number, default: 0 },
      reason: String,
      clearedAt: Date,
      updatedAt: Date
    },
    resumeUrl: { type: String, trim: true },
    codingProfiles: { type: Map, of: String, default: {} },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
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
      default: "DRAFT",
      index: true
    },
    reason: { type: String, trim: true },
    semesters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date
  },
  { timestamps: true }
);

studentSchema.index({ rollNo: 1, department: 1 }, { unique: true, sparse: true });
studentSchema.index({ grNo: 1 }, { unique: true, sparse: true });
studentSchema.index({ universityId: 1 }, { unique: true, sparse: true });
studentSchema.index({ enrollmentNo: 1 }, { unique: true, sparse: true });
studentSchema.index({ registrationNo: 1 }, { unique: true, sparse: true });
studentSchema.index({ name: "text", rollNo: "text", enrollmentNo: "text", registrationNo: "text", grNo: "text", universityId: "text", email: "text", department: "text", program: "text" });
studentSchema.index({ batch: 1, department: 1, course: 1, program: 1, semester: 1, status: 1, sourceStatus: 1 });

export const Student = mongoose.model("Student", studentSchema);
