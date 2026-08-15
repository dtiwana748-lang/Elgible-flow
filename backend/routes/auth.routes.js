import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { User } from "../models/User.js";
import { signToken } from "../utils/tokens.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileUploadDir = path.resolve(__dirname, "..", "uploads", "profiles");
fs.mkdirSync(profileUploadDir, { recursive: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    cb(null, ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype));
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

function uploadProfileBuffer(file, userId) {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      reject(new Error("Cloudinary is not configured"));
      return;
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "eligible-flow/profiles",
        public_id: `${userId}-${Date.now()}`,
        resource_type: "image",
        overwrite: true
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

async function saveProfileBufferLocally(file, userId) {
  const extensionByMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
  };
  const extension = extensionByMime[file.mimetype] || ".jpg";
  const filename = `${userId}-${Date.now()}${extension}`;
  const destination = path.join(profileUploadDir, filename);
  await fs.promises.writeFile(destination, file.buffer);
  return `/uploads/profiles/${filename}`;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});
const strongPassword = z.string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function loginKey(req, email) {
  return `${req.ip || "unknown"}:${String(email || "").toLowerCase()}`;
}

function isLoginLimited(key) {
  const record = loginAttempts.get(key);
  if (!record) return false;
  if (record.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  record.count += 1;
}

function hashAuthorityToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function authUserPayload(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, designation: user.designation, profileImage: user.profileImage, personalEmail: user.personalEmail, phone: user.phone };
}

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim();
}

async function startSession(user, req) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  user.lastLoginAt = new Date();
  user.lastSeenAt = new Date();
  user.activeSessionId = sessionId;
  user.sessionExpiresAt = new Date(Date.now() + SESSION_IDLE_MS);
  user.loginLogs = [
    {
      at: new Date(),
      ipAddress: requestIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
      sessionId
    },
    ...(user.loginLogs || [])
  ].slice(0, 25);
  await user.save();
  await writeAudit({ actor: user._id, action: "LOGIN_SUCCESS", entity: "User", entityId: user._id, ipAddress: requestIp(req), metadata: { userAgent: req.headers["user-agent"] } });
  return { token: signToken(user, sessionId), user: authUserPayload(user) };
}

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email and password are required" });

  const email = parsed.data.email.toLowerCase();
  const key = loginKey(req, email);
  if (isLoginLimited(key)) {
    return res.status(429).json({ message: "Too many failed login attempts. Please try again after 15 minutes." });
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !user.active) {
    recordFailedLogin(key);
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const matched = await user.comparePassword(parsed.data.password);
  if (!matched) {
    recordFailedLogin(key);
    return res.status(401).json({ message: "Invalid credentials" });
  }
  loginAttempts.delete(key);
  res.json(await startSession(user, req));
});

router.post("/authority/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (token.length < 32) return res.status(401).json({ message: "This authority link is invalid" });
  const tokenHash = hashAuthorityToken(token);
  const user = await User.findOne({
    role: "LIST_MAKER",
    designation: "Higher Authorities",
    active: true,
    authorityLinkTokenHash: tokenHash,
    authorityLinkExpiresAt: { $gt: new Date() }
  }).select("+activeSessionId +sessionExpiresAt +authorityLinkTokenHash +authorityLinkExpiresAt");
  if (!user) return res.status(401).json({ message: "This authority link is invalid or expired" });
  user.authorityLinkLastUsedAt = new Date();
  res.json(await startSession(user, req));
});

router.post("/logout", requireAuth, async (req, res) => {
  req.user.activeSessionId = undefined;
  req.user.sessionExpiresAt = undefined;
  req.user.lastSeenAt = new Date();
  await req.user.save();
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, designation: req.user.designation, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail, phone: req.user.phone });
});

router.get("/me/login-logs", requireAuth, async (req, res) => {
  if (req.user.role !== "HOD") return res.status(403).json({ message: "Only the Head can view login history" });
  const user = await User.findById(req.user._id).select("+activeSessionId loginLogs");
  res.json({
    logs: (user?.loginLogs || []).map((log) => ({
      at: log.at,
      ipAddress: log.ipAddress || "-",
      userAgent: log.userAgent || "-",
      current: Boolean(log.sessionId && log.sessionId === user.activeSessionId)
    }))
  });
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    profileImage: z.string().max(300).optional().or(z.literal("")),
    designation: z.string().trim().min(2).max(80).optional().or(z.literal("")),
    personalEmail: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(20).optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Profile details are invalid" });

  const requestedEmail = parsed.data.email.toLowerCase();
  if (req.user.role !== "HOD" && requestedEmail !== req.user.email.toLowerCase()) {
    return res.status(403).json({ message: "Only the Head can change official email addresses" });
  }

  req.user.name = parsed.data.name;
  req.user.email = requestedEmail;
  req.user.profileImage = parsed.data.profileImage || undefined;
  req.user.designation = parsed.data.designation || undefined;
  req.user.personalEmail = parsed.data.personalEmail || undefined;
  req.user.phone = parsed.data.phone || undefined;
  await req.user.save();
  await writeAudit({ actor: req.user._id, action: "PROFILE_UPDATED", entity: "User", entityId: req.user._id });
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, designation: req.user.designation, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail, phone: req.user.phone });
});

router.patch("/me/password", requireAuth, async (req, res) => {
  const parsed = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPassword
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Password details are invalid" });

  const user = await User.findById(req.user._id).select("+passwordHash +activeSessionId +sessionExpiresAt");
  if (!user) return res.status(404).json({ message: "User not found" });
  const matched = await user.comparePassword(parsed.data.currentPassword);
  if (!matched) return res.status(401).json({ message: "Current password is incorrect" });
  user.passwordHash = await User.hashPassword(parsed.data.newPassword);
  await user.save();
  await writeAudit({ actor: req.user._id, action: "PASSWORD_UPDATED", entity: "User", entityId: req.user._id });
  res.json({ message: "Password updated successfully" });
});

router.post("/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Profile photo file is required" });
  let uploadProvider = "cloudinary";
  try {
    const result = await uploadProfileBuffer(req.file, req.user._id);
    req.user.profileImage = result.secure_url;
  } catch (error) {
    uploadProvider = "local";
    req.user.profileImage = await saveProfileBufferLocally(req.file, req.user._id);
  }
  await req.user.save();
  await writeAudit({ actor: req.user._id, action: "PROFILE_PHOTO_UPDATED", entity: "User", entityId: req.user._id, metadata: { uploadProvider } });
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, designation: req.user.designation, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail, phone: req.user.phone, uploadProvider });
});

export default router;
