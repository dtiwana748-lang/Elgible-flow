import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { writeAudit } from "../utils/audit.js";
import { calculateEligibility } from "../utils/studentRules.js";
import { triggerSpreadsheetUpdate } from "../utils/spreadsheetSync.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const studentSchema = z.object({
  rollNo: z.string().min(1).max(40),
  name: z.string().min(2).max(120),
  department: z.string().min(2).max(80),
  program: z.string().min(2).max(80),
  semester: z.coerce.number().int().min(1).max(12),
  cgpa: z.coerce.number().min(0).max(10),
  attendance: z.coerce.number().min(0).max(100),
  backlogs: z.coerce.number().int().min(0).max(50),
  category: z.string().max(50).optional().default("General")
});

function buildQuery(query) {
  const filter = {};
  if (query.department) filter.department = query.department;
  if (query.program) filter.program = query.program;
  if (query.semester) filter.semester = Number(query.semester);
  if (query.status) filter.status = query.status;
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 200);
  const filter = buildQuery(req.query);

  const [items, total, stats] = await Promise.all([
    Student.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(filter),
    Student.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit), stats });
});

router.post("/", requireRole("LIST_MAKER", "HOD"), async (req, res) => {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Student data is invalid" });

  const eligibility = calculateEligibility(parsed.data);
  const student = await Student.create({ ...parsed.data, ...eligibility, createdBy: req.user._id });
  await writeAudit({ actor: req.user._id, action: "STUDENT_CREATED", entity: "Student", entityId: student._id, metadata: { rollNo: student.rollNo } });
  res.status(201).json(student);
});

router.post("/import", requireRole("LIST_MAKER", "HOD"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "CSV file is required" });

  const rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  const operations = [];
  const errors = [];

  rows.forEach((row, index) => {
    const parsed = studentSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({ row: index + 2, message: "Invalid row data" });
      return;
    }
    const eligibility = calculateEligibility(parsed.data);
    operations.push({
      updateOne: {
        filter: { rollNo: parsed.data.rollNo, department: parsed.data.department },
        update: { $set: { ...parsed.data, ...eligibility, createdBy: req.user._id } },
        upsert: true
      }
    });
  });

  const result = operations.length ? await Student.bulkWrite(operations, { ordered: false }) : {};
  await writeAudit({ actor: req.user._id, action: "STUDENTS_IMPORTED", entity: "Student", metadata: { rows: rows.length, validRows: operations.length, errors: errors.length } });
  res.json({ imported: operations.length, errors, result });
});

router.patch("/:id", requireRole("LIST_MAKER", "HOD"), async (req, res) => {
  const parsed = studentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Student update is invalid" });

  const updates = { ...parsed.data };
  if ("cgpa" in updates || "attendance" in updates || "backlogs" in updates) {
    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Student not found" });
    Object.assign(updates, calculateEligibility({ ...existing.toObject(), ...updates }));
  }

  const student = await Student.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!student) return res.status(404).json({ message: "Student not found" });
  triggerSpreadsheetUpdate(student);

  await writeAudit({ actor: req.user._id, action: "STUDENT_UPDATED", entity: "Student", entityId: student._id, metadata: updates });
  res.json(student);
});

router.post("/:id/submit", requireRole("LIST_MAKER", "HOD"), async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, { status: "PENDING_APPROVAL" }, { new: true });
  if (!student) return res.status(404).json({ message: "Student not found" });
  await writeAudit({ actor: req.user._id, action: "STUDENT_SUBMITTED", entity: "Student", entityId: student._id });
  res.json(student);
});

router.post("/:id/decision", requireRole("HOD"), async (req, res) => {
  const parsed = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().max(300).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid HOD decision is required" });

  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { status: parsed.data.decision, reason: parsed.data.reason, approvedBy: req.user._id, approvedAt: new Date() },
    { new: true }
  );
  if (!student) return res.status(404).json({ message: "Student not found" });
  await writeAudit({ actor: req.user._id, action: `STUDENT_${parsed.data.decision}`, entity: "Student", entityId: student._id, metadata: { reason: parsed.data.reason } });
  res.json(student);
});

export default router;
