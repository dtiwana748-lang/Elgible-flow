import { AuditLog } from "../models/AuditLog.js";

export function writeAudit({ actor, action, entity, entityId, metadata }) {
  return AuditLog.create({ actor, action, entity, entityId, metadata });
}
