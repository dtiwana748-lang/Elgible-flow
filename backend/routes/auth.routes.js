import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
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
  password: z.string().min(8)
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email and password are required" });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.active) return res.status(401).json({ message: "Invalid credentials" });

  const matched = await user.comparePassword(parsed.data.password);
  if (!matched) return res.status(401).json({ message: "Invalid credentials" });
  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: signToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileImage: user.profileImage }
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail });
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    profileImage: z.string().max(300).optional().or(z.literal("")),
    personalEmail: z.string().email().optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Profile details are invalid" });

  req.user.name = parsed.data.name;
  req.user.email = parsed.data.email.toLowerCase();
  req.user.profileImage = parsed.data.profileImage || undefined;
  req.user.personalEmail = parsed.data.personalEmail || undefined;
  await req.user.save();
  await writeAudit({ actor: req.user._id, action: "PROFILE_UPDATED", entity: "User", entityId: req.user._id });
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail });
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
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, profileImage: req.user.profileImage, personalEmail: req.user.personalEmail, uploadProvider });
});

export default router;
