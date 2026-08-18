import mongoose from "mongoose";
const schema = new mongoose.Schema({
  record: { type: mongoose.Schema.Types.ObjectId, ref: "PlacementRecord", required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  requestedUpdates: { type: Object, default: {} },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reviewedAt: Date, remarks: String
}, { timestamps: true });
export const PlacementEditRequest = mongoose.model("PlacementEditRequest", schema);
