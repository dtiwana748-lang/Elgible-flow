export function calculateDriveAttendance(registrationStatus, roundHistory = []) {
  const hasPresentProcess = roundHistory.some((round) => ["PRESENT", "QUALIFIED"].includes(round.status));
  if (hasPresentProcess) {
    return {
      overallAttendanceStatus: "OVERALL_PRESENT",
      overallAttendanceReason: registrationStatus === "REGISTERED"
        ? "Student registered and was present in at least one drive process."
        : "Student was not registered, but was present in an uploaded drive process."
    };
  }

  if (["NOT_CONTACTED", "NOTIFIED", "REGISTRATION_PENDING", "REGISTRATION_LINK_ISSUE"].includes(registrationStatus)) {
    return {
      overallAttendanceStatus: "PENDING",
      overallAttendanceReason: "Registration data was blank or not recognized in the uploaded sheet; this drive is not counted as absent."
    };
  }

  if (registrationStatus !== "REGISTERED") {
    return {
      overallAttendanceStatus: "OVERALL_ABSENT",
      overallAttendanceReason: "Student did not register for this drive, so the drive is counted as absent."
    };
  }

  const hasAbsentProcess = roundHistory.some((round) => ["ABSENT", "NOT_QUALIFIED", "DISQUALIFIED", "WITHDRAWN"].includes(round.status));
  if (hasAbsentProcess) {
    return {
      overallAttendanceStatus: "OVERALL_ABSENT",
      overallAttendanceReason: "Student registered but was absent or not qualified in all uploaded drive processes."
    };
  }

  return {
    overallAttendanceStatus: "PENDING",
    overallAttendanceReason: "Student registered, but no process attendance has been marked yet."
  };
}
