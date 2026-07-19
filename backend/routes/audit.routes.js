import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AuditLog } from "../models/AuditLog.js";

const router = Router();

router.get("/", requireAuth, requireRole("HOD"), async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const [items, total] = await Promise.all([
    AuditLog.find().populate("actor", "name email role").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments()
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

export default router;
