export function calculateEligibility(student) {
  const eligible = Number(student.cgpa) >= 6 && Number(student.attendance) >= 75 && Number(student.backlogs) === 0;
  return {
    status: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
    reason: eligible ? "Meets CGPA, attendance, and backlog criteria" : "Does not meet one or more eligibility criteria"
  };
}
