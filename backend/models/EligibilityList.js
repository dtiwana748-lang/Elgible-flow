import mongoose from "mongoose";

const eligibilityListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    criteria: {
      type: Object,
      required: true,
      default: {}
    },
    eligibleStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    }],
    notEligibleStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student"
    }],
    eligibilityBreakdown: {
      totalChecked: { type: Number, default: 0 },
      totalEligible: { type: Number, default: 0 },
      totalNotEligible: { type: Number, default: 0 },
      reasons: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["DRAFT", "FINALIZED", "ARCHIVED"],
      default: "DRAFT"
    },
    companyName: { type: String, trim: true },
    jobRole: { type: String, trim: true },
    packageCtc: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const EligibilityList = mongoose.model("EligibilityList", eligibilityListSchema);
