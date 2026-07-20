import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    drive: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["EDIT_SHEET", "REUPLOAD_SHEET"], required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"], default: "PENDING", index: true },
    sheet: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSheet", index: true },
    requestReason: { type: String, required: true },
    remarks: { type: String },
    proposedChanges: [{
      rowIndex: Number,
      rollNo: String,
      studentName: String,
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }],
    updatedRows: [mongoose.Schema.Types.Mixed],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

export const AccessRequest = mongoose.model("AccessRequest", accessRequestSchema);
