import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();
const AUTHORITY_LINK_DAYS = 90;

function hashAuthorityToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicOrigin(req) {
  return (process.env.CLIENT_ORIGIN || `${req.protocol}://${req.get("host")}`).split(",")[0].trim().replace(/\/+$/, "");
}

function issueAuthorityLink(user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  user.authorityLinkTokenHash = hashAuthorityToken(token);
  user.authorityLinkExpiresAt = new Date(Date.now() + AUTHORITY_LINK_DAYS * 24 * 60 * 60 * 1000);
  return `${publicOrigin(req)}/authority/${token}`;
}

const strongPassword = z.string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

const createUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: strongPassword.optional().or(z.literal("")),
  personalEmail: z.string().email().optional().or(z.literal("")),
  designation: z.enum(["Outreach Member", "Placement Officer", "Higher Authorities"]).optional(),
  active: z.boolean().optional()
}).refine((data) => data.designation === "Higher Authorities" || Boolean(data.password), {
  message: "Initial password is required",
  path: ["password"]
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
    profileImage: user.profileImage,
    createdAt: user.createdAt
  })));
});

router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "User details are invalid" });

  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (existing) return res.status(409).json({ message: "Email already exists" });

  const user = await User.create({
    name: parsed.data.name,
    email: parsed.data.email,
    role: "LIST_MAKER",
    employeeId: parsed.data.employeeId,
    phone: parsed.data.phone,
    department: parsed.data.department,
    designation: parsed.data.designation || "Outreach Member",
    assignedBatches: parsed.data.assignedBatches || [],
    active: parsed.data.active ?? true,
    personalEmail: parsed.data.personalEmail || undefined,
    passwordHash: await User.hashPassword(parsed.data.password || crypto.randomBytes(18).toString("base64url"))
  });
  let authorityLink = "";
  if (user.designation === "Higher Authorities") {
    authorityLink = issueAuthorityLink(user, req);
    await user.save();
  }

  await writeAudit({ actor: req.user._id, action: "USER_CREATED", entity: "User", entityId: user._id, metadata: { role: user.role } });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, designation: user.designation, active: user.active, authorityLink });
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

router.delete("/:id", async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role !== "LIST_MAKER") {
    return res.status(403).json({ message: "Only List Maker accounts can be deleted" });
  }

  await writeAudit({
    actor: req.user._id,
    action: "USER_DELETED",
    entity: "User",
    entityId: user._id,
    metadata: { name: user.name, email: user.email, role: user.role }
  });
  await user.deleteOne();

  res.json({ message: "List Maker account deleted" });
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().optional(),
  personalEmail: z.string().email().optional().or(z.literal("")),
  designation: z.enum(["Outreach Member", "Placement Officer", "Higher Authorities"]).optional(),
  active: z.boolean().optional(),
  password: strongPassword.optional().or(z.literal(""))
});

router.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "User details are invalid" });

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (parsed.data.email && parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = await User.findOne({ email: parsed.data.email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already exists" });
    user.email = parsed.data.email;
  }

  if (parsed.data.name) user.name = parsed.data.name;
  if (parsed.data.personalEmail !== undefined) user.personalEmail = parsed.data.personalEmail || undefined;
  if (parsed.data.designation !== undefined) user.designation = parsed.data.designation;
  if (parsed.data.active !== undefined) {
    if (req.params.id === req.user._id.toString() && !parsed.data.active) {
      return res.status(400).json({ message: "You cannot deactivate your own account" });
    }
    user.active = parsed.data.active;
  }

  if (parsed.data.password) {
    user.passwordHash = await User.hashPassword(parsed.data.password);
  }

  await user.save();
  await writeAudit({ actor: req.user._id, action: "USER_UPDATED", entity: "User", entityId: user._id });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role, designation: user.designation, active: user.active, personalEmail: user.personalEmail });
});

router.post("/:id/authority-link", async (req, res) => {
  const user = await User.findById(req.params.id).select("+authorityLinkTokenHash +authorityLinkExpiresAt");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role !== "LIST_MAKER" || user.designation !== "Higher Authorities") {
    return res.status(400).json({ message: "Secure authority links are only available for Higher Authorities accounts" });
  }
  const authorityLink = issueAuthorityLink(user, req);
  await user.save();
  await writeAudit({ actor: req.user._id, action: "AUTHORITY_LINK_GENERATED", entity: "User", entityId: user._id });
  res.json({ authorityLink, expiresAt: user.authorityLinkExpiresAt });
});

export default router;
