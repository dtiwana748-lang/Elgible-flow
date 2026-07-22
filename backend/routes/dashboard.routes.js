import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { Drive } from "../models/Drive.js";
import { AuditLog } from "../models/AuditLog.js";
import { SpreadsheetConnection } from "../models/SpreadsheetConnection.js";
import { DriveStudent } from "../models/DriveStudent.js";
import { EligibilityList } from "../models/EligibilityList.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { AttendanceSheet } from "../models/AttendanceSheet.js";

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

    const [driveStudentStats, latestSheets, presents, absents] = await Promise.all([
      DriveStudent.aggregate([
        { $match: { drive: { $in: driveIds } } },
        {
          $group: {
            _id: "$drive",
            registeredStudents: { $sum: { $cond: [{ $eq: ["$registrationStatus", "REGISTERED"] }, 1, 0] } }
          }
        }
      ]),
      AttendanceSheet.aggregate([
        { $match: { drive: { $in: driveIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$drive",
            rowCount: { $first: "$rowCount" },
            uploadRows: { $first: "$uploadResult.rows" },
            rowsSize: { $first: { $cond: [{ $isArray: "$rows" }, { $size: "$rows" }, 0] } }
          }
        }
      ]),
      DriveStudent.countDocuments({ drive: { $in: driveIds }, overallAttendanceStatus: "OVERALL_PRESENT" }),
      DriveStudent.countDocuments({ drive: { $in: driveIds }, overallAttendanceStatus: "OVERALL_ABSENT" })
    ]);
    const registeredByDrive = new Map(driveStudentStats.map((item) => [item._id.toString(), item.registeredStudents || 0]));
    const sheetRowsByDrive = new Map(latestSheets.map((sheet) => [
      sheet._id.toString(),
      sheet.rowCount || sheet.uploadRows || sheet.rowsSize || 0
    ]));
    let eligiblePool = 0;
    let registeredCount = 0;
    for (const d of myDrives) {
      const driveId = d._id.toString();
      const eligible = sheetRowsByDrive.get(driveId) || d.stats?.eligibleStudents || 0;
      eligiblePool += eligible;
      registeredCount += Math.min(registeredByDrive.get(driveId) || d.stats?.registeredStudents || 0, eligible || Infinity);
    }
    const registeredRatio = eligiblePool > 0 ? Number(((registeredCount / eligiblePool) * 100).toFixed(1)) : 0;
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
  const linkedConnectionIds = await SpreadsheetConnection.distinct("_id");
  const masterStudentFilter = { "source.connection": linkedConnectionIds.length ? { $in: linkedConnectionIds } : { $in: [] } };
  const stuckOffStatusValues = ["Stuck Off", "Struck Off", "STUCK_OFF", "STRUCK_OFF"];
  const activeStatusFilter = {
    $and: [
      { status: { $nin: [...stuckOffStatusValues, "NOC"] } },
      { status: { $not: /^noc$/i } },
      { status: { $not: /^(stuck|struck)[\s_-]*off$/i } }
    ]
  };

  const [
    totalStudents,
    listMakers,
    activeDrives,
    totalActive,
    totalStuckOff,
    totalNoc,
    pendingApprovals,
    pendingAccessRequests,
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
    Student.countDocuments(masterStudentFilter),
    User.countDocuments({ role: "LIST_MAKER" }),
    Drive.countDocuments({ ...driveFilter, driveStatus: { $nin: ["ARCHIVED", "CANCELLED"] } }),
    Student.countDocuments({
      ...masterStudentFilter,
      ...activeStatusFilter
    }),
    Student.countDocuments({
      ...masterStudentFilter,
      $or: [
        { status: { $in: stuckOffStatusValues } },
        { status: /^(stuck|struck)[\s_-]*off$/i }
      ]
    }),
    Student.countDocuments({ ...masterStudentFilter, status: "NOC" }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "PENDING_HOD_APPROVAL" }),
    AccessRequest.countDocuments({ status: "PENDING" }),
    Drive.countDocuments({ ...driveFilter, approvalStatus: "APPROVED" }),
    Student.aggregate([{ $match: masterStudentFilter }, { $group: { _id: "$department", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $match: masterStudentFilter }, { $group: { _id: "$course", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $match: masterStudentFilter }, { $group: { _id: "$batch", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $match: masterStudentFilter }, { $group: { _id: "$program", value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    Student.aggregate([{ $match: masterStudentFilter }, { $group: { _id: "$status", value: { $sum: 1 } } }]),
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
      pendingAccessRequests,
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
