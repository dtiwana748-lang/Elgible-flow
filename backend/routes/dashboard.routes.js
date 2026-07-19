import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { Drive } from "../models/Drive.js";
import { AuditLog } from "../models/AuditLog.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";

const router = Router();

router.get("/summary", requireAuth, async (req, res) => {
  const driveFilter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
  const [
    totalStudents,
    listMakers,
    activeDrives,
    eligibleStudents,
    pendingApprovals,
    approvedLists,
    registeredAgg,
    studentsByDepartment,
    studentsByCourse,
    studentsByBatch,
    studentsByProgram,
    eligibilityDistribution,
    driveStats,
    recentActivity,
    latestConnection
  ] = await Promise.all([
    Student.countDocuments(),
    User.countDocuments({ role: "LIST_MAKER" }),
    Drive.countDocuments({ ...driveFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }),
    Student.countDocuments({ status: { $in: ["ELIGIBLE", "APPROVED"] } }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "PENDING_HOD_APPROVAL" }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "APPROVED" }),
    Drive.aggregate([{ $match: driveFilter }, { $group: { _id: null, registered: { $sum: "$stats.registeredStudents" }, nonRegistered: { $sum: "$stats.nonRegisteredStudents" } } }]),
    Student.aggregate([{ $group: { _id: "$department", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $group: { _id: "$course", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $group: { _id: "$batch", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $group: { _id: "$program", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $group: { _id: "$status", value: { $sum: 1 } } }]),
    Drive.find(driveFilter).select("companyName stats approvalStatus driveStatus driveDate").sort({ updatedAt: -1 }).limit(8),
    AuditLog.find().populate("actor", "name role").sort({ createdAt: -1 }).limit(8),
    SpreadsheetConnection.findOne().sort({ updatedAt: -1 })
  ]);

  res.json({
    stats: {
      totalStudents,
      activeDrives,
      listMakers,
      eligibleStudents,
      registeredStudents: registeredAgg[0]?.registered || 0,
      nonRegisteredStudents: registeredAgg[0]?.nonRegistered || 0,
      pendingApprovals,
      approvedLists
    },
    charts: {
      studentsByDepartment,
      studentsByCourse,
      studentsByBatch,
      studentsByProgram,
      eligibilityDistribution,
      driveStats
    },
    recentActivity,
    latestConnection
  });
});

export default router;
