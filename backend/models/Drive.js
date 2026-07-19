import mongoose from "mongoose";

const driveSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, index: true },
    companyLogo: { type: String, trim: true },
    companyWebsite: { type: String, trim: true },
    industry: { type: String, trim: true },
    jobRole: { type: String, required: true, trim: true },
    jobDescription: { type: String, trim: true },
    driveType: { type: String, trim: true },
    packageCtc: { type: String, trim: true },
    location: { type: String, trim: true },
    driveDate: Date,
    registrationDeadline: Date,
    target: {
      batch: [String],
      department: [String],
      branch: [String],
      course: [String],
      program: [String],
      semester: [Number],
      passingYear: [Number]
    },
    eligibilityRules: {
      minCgpa: Number,
      minTenthPercentage: Number,
      minTwelfthPercentage: Number,
      minDiplomaPercentage: Number,
      maxActiveBacklogs: Number,
      maxTotalBacklogs: Number,
      minAttendance: Number,
      customFieldConditions: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    approvalStatus: { type: String, enum: ["DRAFT", "PENDING_HOD_APPROVAL", "APPROVED", "REJECTED", "RETURNED"], default: "DRAFT", index: true },
    driveStatus: {
      type: String,
      enum: ["DRAFT", "ELIGIBILITY_IN_PROGRESS", "PENDING_HOD_APPROVAL", "APPROVED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ROUNDS_IN_PROGRESS", "COMPLETED", "CANCELLED", "ARCHIVED"],
      default: "DRAFT",
      index: true
    },
    currentRound: { type: String, trim: true },
    stats: {
      totalStudentsConsidered: { type: Number, default: 0 },
      eligibleStudents: { type: Number, default: 0 },
      ineligibleStudents: { type: Number, default: 0 },
      registeredStudents: { type: Number, default: 0 },
      nonRegisteredStudents: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

driveSchema.index({ createdBy: 1, driveStatus: 1, driveDate: -1 });

export const Drive = mongoose.model("Drive", driveSchema);
