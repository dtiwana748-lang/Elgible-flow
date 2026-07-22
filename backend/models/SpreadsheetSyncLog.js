import mongoose from "mongoose";

const spreadsheetSyncLogSchema = new mongoose.Schema(
  {
    connection: { type: mongoose.Schema.Types.ObjectId, ref: "SpreadsheetConnection", required: true, index: true },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    status: { type: String, enum: ["RUNNING", "COMPLETED", "FAILED"], default: "RUNNING", index: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    errors: [{ row: Number, message: String }],
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export const SpreadsheetSyncLog = mongoose.model("SpreadsheetSyncLog", spreadsheetSyncLogSchema);
