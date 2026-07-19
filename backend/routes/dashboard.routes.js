import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { Drive } from "../models/Drive.js";
import { AuditLog } from "../models/AuditLog.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { EligibilityList } from "../models/EligibilityList.js";

const router = Router();

router.get("/summary", requireAuth, async (req, res) => {
  if (req.user.role === "LIST_MAKER") {
    const myLists = await EligibilityList.find({ createdBy: req.user._id });
    const totalListsCreated = myLists.length;

    let totalChecked = 0;
    let totalEligible = 0;
    for (const list of myLists) {
      totalChecked += list.eligibilityBreakdown?.totalChecked || 0;
      totalEligible += list.eligibilityBreakdown?.totalEligible || 0;
    }
    const eligibilityRatio = totalChecked > 0 ? Number(((totalEligible / totalChecked) * 100).toFixed(1)) : 0;

    const myDrives = await Drive.find({ createdBy: req.user._id });
    const driveIds = myDrives.map(d => d._id);

    let eligiblePool = 0;
    let registeredCount = 0;
    for (const d of myDrives) {
      eligiblePool += d.stats?.eligibleStudents || 0;
      registeredCount += d.stats?.registeredStudents || 0;
    }
    const registeredRatio = eligiblePool > 0 ? Number(((registeredCount / eligiblePool) * 100).toFixed(1)) : 0;

    const [presents, absents] = await Promise.all([
      DriveStudent.countDocuments({ drive: { $in: driveIds }, overallAttendanceStatus: "OVERALL_PRESENT" }),
      DriveStudent.countDocuments({ drive: { $in: driveIds }, overallAttendanceStatus: "OVERALL_ABSENT" })
    ]);
    const totalAttended = presents + absents;
    const presentRate = totalAttended > 0 ? Number(((presents / totalAttended) * 100).toFixed(1)) : 0;

    const recentActivity = await AuditLog.find({ actor: req.user._id })
      .populate("actor", "name role")
      .sort({ createdAt: -1 })
      .limit(8);

    return res.json({
      role: "LIST_MAKER",
      stats: {
        totalListsCreated,
        eligibilityRatio,
        registeredRatio,
        presentRate,
        presents,
        absents,
        eligiblePool,
        registeredCount,
        totalCheckedStudents: totalChecked,
        totalEligibleStudents: totalEligible
      },
      recentActivity
    });
  }

  const driveFilter = req.user.role === "HOD" ? {} : { createdBy: req.user._id };
  const [
    totalStudents,
    listMakers,
    activeDrives,
    totalActive,
    totalStuckOff,
    totalNoc,
    pendingApprovals,
    approvedLists,
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
    Student.countDocuments({ status: "Active" }),
    Student.countDocuments({
      $or: [
        { status: { $in: ["Stuck Off", "Struck Off", "STUCK_OFF", "STRUCK_OFF"] } },
        { "driveRestriction.status": "STUCK_OFF" }
      ]
    }),
    Student.countDocuments({ status: "NOC" }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "PENDING_HOD_APPROVAL" }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "APPROVED" }),
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
      totalActive,
      totalStuckOff,
      totalNoc,
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
