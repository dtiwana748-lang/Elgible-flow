import mongoose from "mongoose";

const placementRecordSchema = new mongoose.Schema({
  academicYear: { type: String, required: true, index: true },
  ron: String,
  placementOfficer: { type: String, trim: true, index: true },
  companyCategory: String,
  leadBy: { type: String, trim: true, index: true },
  dateFloated: Date,
  dateOfDrive: Date,
  companyName: { type: String, required: true, trim: true, index: true },
  jobProfile: String,
  packageLpa: Number,
  packageText: String,
  branch: String,
  mode: String,
  batch: String,
  totalEligible: { type: Number, default: 0 },
  totalRegistered: { type: Number, default: 0 },
  dateSharedWithHr: Date,
  dataShared: String,
  round1Date: Date,
  round2Date: Date,
  shortlistedDate: Date,
  finalSelectionDate: Date,
  selections: { type: Number, default: 0 },
  actualStatus: String,
  resultSharedBackend: String,
  remarks: String,
  sourceFile: String,
  sourceSheetUrl: String,
  sourceSheetId: String,
  sourceSheetGid: String,
  plannerAppsScriptUrl: String,
  sourceRow: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

placementRecordSchema.index({ academicYear: 1, placementOfficer: 1, companyName: 1 });
export const PlacementRecord = mongoose.model("PlacementRecord", placementRecordSchema);
