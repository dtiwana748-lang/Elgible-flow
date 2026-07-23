import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Student } from "../models/Student.js";
import { StudentDataRequest } from "../models/StudentDataRequest.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();
const proofDirectory = path.resolve("backend/uploads/student-proofs");
fs.mkdirSync(proofDirectory, { recursive: true });

const correctionFields = {
  name: { label: "Student Name", type: "text" },
  email: { label: "Email", type: "text" },
  phone: { label: "Phone Number", type: "text" },
  fatherContactNo: { label: "Father's Phone", type: "text" },
  gender: { label: "Gender", type: "text" },
  dob: { label: "Date of Birth", type: "date" },
  college: { label: "College", type: "text" },
  department: { label: "Department", type: "text" },
  branch: { label: "Branch", type: "text" },
  specialization: { label: "Specialization", type: "text" },
  program: { label: "Program", type: "text" },
  course: { label: "Course", type: "text" },
  semester: { label: "Current Academic Semester", type: "number" },
  batch: { label: "Batch", type: "text" },
  passingYear: { label: "Passing Year", type: "number" },
  cgpa: { label: "CGPA", type: "number" },
  attendance: { label: "Attendance", type: "number" },
  tenthPercentage: { label: "10th Percentage", type: "number" },
  tenthPassingYear: { label: "10th Passing Year", type: "number" },
  twelfthPercentage: { label: "12th Percentage", type: "number" },
  twelfthPassingYear: { label: "12th Passing Year", type: "number" },
  diplomaPercentage: { label: "Diploma Percentage", type: "number" },
  graduationPercentage: { label: "Graduation Percentage", type: "number" },
  pgStreams: { label: "PG Stream", type: "text" },
  activeBacklogs: { label: "Active Backlogs", type: "number" },
  totalBacklogs: { label: "Total Backlogs", type: "number" },
  category: { label: "Category", type: "text" },
  domicileCity: { label: "Domicile City", type: "text" },
  domicileState: { label: "Domicile State", type: "text" },
  address: { label: "Address", type: "text" },
  placementStatus: { label: "Placement Status", type: "text" }
};
for (let semesterNumber = 1; semesterNumber <= 8; semesterNumber += 1) {
  correctionFields[`semesters.${semesterNumber}.percentage`] = {
    label: `Semester ${semesterNumber} Percentage`,
    type: "number"
  };
  correctionFields[`semesters.${semesterNumber}.status`] = {
    label: `Semester ${semesterNumber} Result Status`,
    type: "text"
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, proofDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});
const proofUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    callback(allowed.includes(file.mimetype) ? null : new Error("Proof must be a PDF, JPG, PNG, or WEBP file"), allowed.includes(file.mimetype));
  }
});

const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const requestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDob(value) {
  const text = String(value || "").trim();
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) [, month, day, year] = match;
  else {
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) [, year, month, day] = match;
  }
  if (!match) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date;
}

function publicStudent(student) {
  const fields = [
    "grNo", "rollNo", "enrollmentNo", "registrationNo", "universityId", "name", "gender", "dob",
    "email", "phone", "fatherContactNo", "college", "department", "branch", "specialization",
    "program", "course", "semester", "batch", "admissionYear", "passingYear", "cgpa", "attendance",
    "tenthPercentage", "tenthPassingYear", "twelfthPercentage", "twelfthPassingYear",
    "diplomaPercentage", "graduationPercentage", "pgStreams", "activeBacklogs", "totalBacklogs",
    "category", "domicileCity", "domicileState", "address", "placementStatus", "semesters", "driveRestriction"
  ];
  return fields.reduce((result, field) => {
    result[field] = student[field] ?? "";
    return result;
  }, { _id: student._id });
}

function verificationToken(student) {
  return jwt.sign({ purpose: "STUDENT_RECORD", studentId: student._id.toString() }, process.env.JWT_SECRET, { expiresIn: "30m" });
}

function verifiedStudentId(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== "STUDENT_RECORD" || !payload.studentId) throw new Error("Student verification expired");
  return payload.studentId;
}

function castRequestedValue(field, value) {
  const config = correctionFields[field];
  if (!config) throw new Error(`Unsupported correction field: ${field}`);
  if (config.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${config.label} must be a number`);
    if (field === "semester" && (!Number.isInteger(number) || number < 1 || number > 12)) {
      throw new Error("Semester must be a whole number from 1 to 12");
    }
    if (["cgpa"].includes(field) && (number < 0 || number > 10)) {
      throw new Error("CGPA must be between 0 and 10");
    }
    if ((["attendance", "tenthPercentage", "twelfthPercentage", "diplomaPercentage", "graduationPercentage"].includes(field) || /^semesters\.[1-8]\.percentage$/.test(field)) && (number < 0 || number > 100)) {
      throw new Error(`${config.label} must be between 0 and 100`);
    }
    if (["activeBacklogs", "totalBacklogs"].includes(field) && (!Number.isInteger(number) || number < 0)) {
      throw new Error(`${config.label} must be a non-negative whole number`);
    }
    return number;
  }
  if (config.type === "date") {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    const date = parseDob(value);
    if (!date) throw new Error(`${config.label} must be MM/DD/YYYY`);
    return date;
  }
  return String(value || "").trim();
}

router.post("/lookup", lookupLimiter, async (req, res) => {
  const parsed = z.object({ rollNo: z.string().min(2).max(50), dob: z.string().min(6).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a valid Roll No and Date of Birth" });
  const dob = parseDob(parsed.data.dob);
  if (!dob) return res.status(400).json({ message: "Date of Birth must use MM/DD/YYYY, for example 10/16/2005" });
  const candidates = await Student.find({
    rollNo: new RegExp(`^${escapeRegex(parsed.data.rollNo.trim())}$`, "i")
  }).lean();
  const student = candidates.find((candidate) => {
    const stored = new Date(candidate.dob);
    if (!Number.isFinite(stored.getTime())) return false;
    const utcMatch = stored.getUTCFullYear() === dob.getUTCFullYear() && stored.getUTCMonth() === dob.getUTCMonth() && stored.getUTCDate() === dob.getUTCDate();
    const localMatch = stored.getFullYear() === dob.getUTCFullYear() && stored.getMonth() === dob.getUTCMonth() && stored.getDate() === dob.getUTCDate();
    return utcMatch || localMatch;
  });
  if (!student) return res.status(404).json({ message: "No student record matched that Roll No and Date of Birth" });
  const requests = await StudentDataRequest.find({ student: student._id })
    .select("status message changes hodRemarks reviewedAt writeBackStatus writeBackMessage createdAt")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ student: publicStudent(student), token: verificationToken(student), correctionFields, requests });
});

router.post("/requests", requestLimiter, proofUpload.single("proof"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Upload a proof document" });
    const studentId = verifiedStudentId(req.body.verificationToken);
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student record no longer exists" });
    const rawChanges = JSON.parse(req.body.changes || "[]");
    const message = String(req.body.message || "").trim();
    if (message.length < 10 || message.length > 2000) return res.status(400).json({ message: "Provide a clear message between 10 and 2000 characters" });
    if (!Array.isArray(rawChanges) || !rawChanges.length || rawChanges.length > 12) return res.status(400).json({ message: "Select between 1 and 12 fields to correct" });
    const changes = rawChanges.map(({ field, requestedValue }) => ({
      field,
      label: correctionFields[field]?.label || field,
      currentValue: student.get(field),
      requestedValue: castRequestedValue(field, requestedValue)
    }));
    const duplicatePending = await StudentDataRequest.findOne({ student: student._id, status: "PENDING" });
    if (duplicatePending) return res.status(409).json({ message: "You already have a pending correction request" });
    const request = await StudentDataRequest.create({
      student: student._id,
      rollNo: student.rollNo,
      studentName: student.name,
      message,
      changes,
      proofFileName: req.file.filename,
      proofOriginalName: req.file.originalname,
      proofMimeType: req.file.mimetype
    });
    res.status(201).json({
      requestId: request._id,
      status: request.status,
      createdAt: request.createdAt,
      changes: request.changes,
      writeBackStatus: request.writeBackStatus,
      message: "Correction request submitted successfully. Please allow 3–5 working days while the HOD verifies your details and supporting proof"
    });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(400).json({ message: error.message || "Unable to submit correction request" });
  }
});

router.get("/requests", requireAuth, requireRole("HOD"), async (req, res) => {
  const filter = req.query.status && req.query.status !== "ALL" ? { status: req.query.status } : {};
  const requests = await StudentDataRequest.find(filter)
    .populate("student", "rollNo name email department branch batch")
    .populate("reviewedBy", "name email")
    .sort({ status: 1, createdAt: -1 })
    .lean();
  res.json(requests);
});

router.get("/requests/:id/proof", requireAuth, requireRole("HOD"), async (req, res) => {
  const request = await StudentDataRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: "Request not found" });
  const absolutePath = path.join(proofDirectory, path.basename(request.proofFileName));
  res.type(request.proofMimeType);
  res.setHeader("Content-Disposition", `inline; filename="${request.proofOriginalName.replace(/[\r\n"]/g, "")}"`);
  res.sendFile(absolutePath);
});

router.post("/requests/:id/decision", requireAuth, requireRole("HOD"), async (req, res) => {
 try {
  const parsed = z.object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    remarks: z.string().max(1000).optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose Approve or Reject" });
  const request = await StudentDataRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (request.status !== "PENDING") return res.status(409).json({ message: "This request has already been reviewed" });

  if (parsed.data.decision === "APPROVED") {
    const student = await Student.findById(request.student);
    if (!student) return res.status(404).json({ message: "Student no longer exists" });
    const updates = {};
    const localEdits = request.changes.map((change) => {
      updates[change.field] = castRequestedValue(change.field, change.requestedValue);
      return {
        field: change.field,
        previousValue: student.get(change.field),
        newValue: updates[change.field],
        reason: `Approved student correction request: ${request.message}`,
        editedBy: req.user._id
      };
    });
    const updatedStudent = await Student.findByIdAndUpdate(
      student._id,
      { $set: updates, $push: { localEdits: { $each: localEdits } } },
      { new: true, runValidators: true }
    );
    if (!updatedStudent) return res.status(404).json({ message: "Student no longer exists" });
    const writeBack = await triggerSpreadsheetUpdate(updatedStudent);
    request.writeBackStatus = writeBack?.ok ? "SYNCED" : writeBack?.skipped ? "SKIPPED" : "FAILED";
    request.writeBackMessage = writeBack?.message || "";
  } else {
    request.writeBackStatus = "SKIPPED";
    request.writeBackMessage = "Request rejected; no data changed.";
  }
  request.status = parsed.data.decision;
  request.hodRemarks = parsed.data.remarks || "";
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  await request.save();
  await writeAudit({
    actor: req.user._id,
    action: `STUDENT_DATA_REQUEST_${parsed.data.decision}`,
    entity: "StudentDataRequest",
    entityId: request._id,
    reason: parsed.data.remarks,
    metadata: { studentId: request.student, fields: request.changes.map((change) => change.field), writeBackStatus: request.writeBackStatus }
  });
  res.json(request);
 } catch (error) {
   console.error("Student correction decision failed:", error);
   const validationMessage = error?.errors
     ? Object.values(error.errors).map((item) => item.message).join("; ")
     : error.message;
   res.status(error?.name === "ValidationError" || error?.name === "CastError" ? 400 : 500)
     .json({ message: validationMessage || "Unable to review this correction request" });
 }
});

export default router;
