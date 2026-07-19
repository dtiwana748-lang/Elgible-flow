import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

const createUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  personalEmail: z.string().email().optional().or(z.literal("")),
  active: z.boolean().optional()
});

router.use(requireAuth, requireRole("HOD"));

router.get("/", async (_req, res) => {
  const users = await User.find({ role: "LIST_MAKER" }).sort({ createdAt: -1 });
  res.json(users.map((user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    personalEmail: user.personalEmail,
    phone: user.phone,
    department: user.department,
    designation: user.designation,
    assignedBatches: user.assignedBatches,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  })));
});

router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "User details are invalid" });

  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (existing) return res.status(409).json({ message: "Email already exists" });

  const user = await User.create({
    name: parsed.data.name,
    email: parsed.data.email,
    role: "LIST_MAKER",
    employeeId: parsed.data.employeeId,
    phone: parsed.data.phone,
    department: parsed.data.department,
    designation: parsed.data.designation,
    assignedBatches: parsed.data.assignedBatches || [],
    active: parsed.data.active ?? true,
    personalEmail: parsed.data.personalEmail || undefined,
    passwordHash: await User.hashPassword(parsed.data.password)
  });

  await writeAudit({ actor: req.user._id, action: "USER_CREATED", entity: "User", entityId: user._id, metadata: { role: user.role } });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, active: user.active });
});

router.patch("/:id/status", async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Active status is required" });
  if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: "You cannot deactivate your own account" });

  const user = await User.findByIdAndUpdate(req.params.id, { active: parsed.data.active }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });

  await writeAudit({ actor: req.user._id, action: "USER_STATUS_CHANGED", entity: "User", entityId: user._id, metadata: { active: user.active } });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role, active: user.active });
});

export default router;
