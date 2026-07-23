import mongoose from "mongoose";

const studentDataRequestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    rollNo: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 2000 },
    changes: [{
      field: { type: String, required: true },
      label: { type: String, required: true },
      currentValue: mongoose.Schema.Types.Mixed,
      requestedValue: { type: mongoose.Schema.Types.Mixed, required: true }
    }],
    proofFileName: { type: String, required: true },
    proofOriginalName: { type: String, required: true },
    proofMimeType: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    hodRemarks: { type: String, maxlength: 1000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    writeBackStatus: { type: String, enum: ["PENDING", "SYNCED", "SKIPPED", "FAILED"], default: "PENDING" },
    writeBackMessage: String
  },
  { timestamps: true }
);

studentDataRequestSchema.index({ student: 1, status: 1, createdAt: -1 });

export const StudentDataRequest = mongoose.model("StudentDataRequest", studentDataRequestSchema);
