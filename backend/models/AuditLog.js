import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String },
    ipAddress: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
