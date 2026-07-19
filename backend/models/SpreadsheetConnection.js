import mongoose from "mongoose";

const spreadsheetConnectionSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Master Student Sheet", trim: true },
    batch: { type: String, required: true, trim: true, index: true },
    sheetUrl: { type: String, required: true, trim: true },
    sheetId: { type: String, required: true, index: true },
    worksheetName: { type: String, default: "Sheet1", trim: true },
    gid: { type: String, default: "0" },
    status: { type: String, enum: ["CONNECTED", "DISCONNECTED", "ERROR"], default: "CONNECTED", index: true },
    columnMapping: { type: Object, default: {} },
    lastSyncAt: Date,
    lastSummary: {
      totalRows: { type: Number, default: 0 },
      successfulRows: { type: Number, default: 0 },
      failedRows: { type: Number, default: 0 },
      newRecords: { type: Number, default: 0 },
      updatedRecords: { type: Number, default: 0 },
      unchangedRecords: { type: Number, default: 0 },
      duplicateRecords: { type: Number, default: 0 },
      conflictCount: { type: Number, default: 0 }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

spreadsheetConnectionSchema.index({ status: 1, updatedAt: -1 });

export const SpreadsheetConnection = mongoose.model("SpreadsheetConnection", spreadsheetConnectionSchema);
