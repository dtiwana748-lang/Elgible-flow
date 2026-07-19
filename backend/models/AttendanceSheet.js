import mongoose from "mongoose";

const attendanceSheetSchema = new mongoose.Schema(
  {
    drive: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true }, // csv, xlsx, xls
    headers: [{ type: String }],
    rows: [mongoose.Schema.Types.Mixed],
    uploadResult: mongoose.Schema.Types.Mixed, // The result from the upload API call
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

export const AttendanceSheet = mongoose.model("AttendanceSheet", attendanceSheetSchema);
