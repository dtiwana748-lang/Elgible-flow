export function calculateDriveAttendance(registrationStatus, roundHistory = []) {
  if (registrationStatus !== "REGISTERED") {
    return {
      overallAttendanceStatus: "OVERALL_ABSENT",
      overallAttendanceReason: "Student did not register for this drive, so the drive is counted as absent."
    };
  }

  const hasPresentProcess = roundHistory.some((round) => ["PRESENT", "QUALIFIED"].includes(round.status));
  if (hasPresentProcess) {
    return {
      overallAttendanceStatus: "OVERALL_PRESENT",
      overallAttendanceReason: "Student registered and was present in at least one drive process."
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
