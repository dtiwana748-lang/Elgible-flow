import mongoose from "mongoose";

const driveStudentSchema = new mongoose.Schema(
  {
    drive: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    eligibilityStatus: { type: String, enum: ["ELIGIBLE", "INELIGIBLE", "MANUAL_REVIEW"], default: "MANUAL_REVIEW", index: true },
    eligibilityReasons: [String],
    manualOverride: {
      included: Boolean,
      reason: String,
      notes: String,
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date
    },
    registrationStatus: {
      type: String,
      enum: ["NOT_CONTACTED", "NOTIFIED", "REGISTERED", "NOT_REGISTERED", "DECLINED", "REGISTRATION_PENDING", "REGISTRATION_LINK_ISSUE"],
      default: "NOT_CONTACTED",
      index: true
    },
    registrationDate: Date,
    registrationProofLink: String,
    overallAttendanceStatus: {
      type: String,
      enum: ["PENDING", "OVERALL_PRESENT", "OVERALL_ABSENT"],
      default: "PENDING",
      index: true
    },
    overallAttendanceReason: String,
    roundHistory: [{
      roundName: String,
      status: {
        type: String,
        enum: ["PENDING", "PRESENT", "ABSENT", "QUALIFIED", "NOT_QUALIFIED", "ON_HOLD", "WITHDRAWN", "DISQUALIFIED"],
        default: "PENDING"
      },
      notes: String,
      markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      markedAt: { type: Date, default: Date.now }
    }],
    currentRound: String,
    finalOutcome: String,
    notes: String
  },
  { timestamps: true }
);

driveStudentSchema.index({ drive: 1, student: 1 }, { unique: true });
driveStudentSchema.index({ student: 1, overallAttendanceStatus: 1 });

export const DriveStudent = mongoose.model("DriveStudent", driveStudentSchema);
