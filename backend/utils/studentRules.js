export function calculateCGPA(student) {
  // student.semesters is a Map of semester number (as string) to { percentage: number, status: string }
  const semesterMap = student.semesters instanceof Map ? student.semesters : new Map(Object.entries(student.semesters || {}));
  let total = 0;
  let count = 0;
  
  for (const [semNum, data] of semesterMap) {
    // Check if status is NOT "Result Awaited" (case insensitive) and percentage is valid
    const status = (data.status || "").toString().toLowerCase();
    if (status !== "result awaited" && Number.isFinite(Number(data.percentage))) {
      const percent = Number(data.percentage);
      if (percent >= 0 && percent <= 100) {
        total += percent;
        count += 1;
      }
    }
  }
  
  // If no valid semesters, return 0
  if (count === 0) {
    return { average: 0, averagePercent: 0, validSemesters: 0 };
  }
  
  // Convert percentage to CGPA (assuming 10-point scale: (percentage / 10) )
  const averagePercent = total / count;
  const cgpa = Number((averagePercent / 10).toFixed(2));
  
  return { average: cgpa, averagePercent, validSemesters: count };
}

export function calculateEligibility(student, criteria = {}) {
  const reasons = [];
  let eligible = true;
  const metric = (value) => {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
  };

  // Default fallback criteria if none provided
  const {
    cgpaMin = 0,
    cgpaMax = 10,
    tenthPercentageMin = 0,
    twelfthPercentageMin = 0,
    diplomaPercentageMin = 0,
    courses = [],
    departments = [],
    batches = [],
    program,
    semesterMin = 1,
    semesterMax = 12,
    activeBacklogsMax = Infinity,
    totalBacklogsMax = Infinity,
    attendanceMin = 0,
    allowStuckOff = false,
    currentStudentPackage = 0,
    requiredPackageMultiple = 1.5,
    requiredPackageCtc = 0
  } = criteria;

  // Check CGPA
  if (Number(cgpaMin) > 0 && Number(student.cgpa) < Number(cgpaMin)) {
    eligible = false;
    reasons.push(`CGPA too low (${metric(student.cgpa)} < ${metric(cgpaMin)})`);
  }
  if (Number(cgpaMax) < 10 && Number(student.cgpa) > Number(cgpaMax)) {
    eligible = false;
    reasons.push(`CGPA too high (${metric(student.cgpa)} > ${metric(cgpaMax)})`);
  }

  // Check 10th percentage
  if (tenthPercentageMin > 0 && Number(student.tenthPercentage) < Number(tenthPercentageMin)) {
    eligible = false;
    reasons.push(`10th percentage too low (${metric(student.tenthPercentage)} < ${metric(tenthPercentageMin)})`);
  }

  // Check 12th percentage
  if (twelfthPercentageMin > 0 && Number(student.twelfthPercentage) < Number(twelfthPercentageMin)) {
    eligible = false;
    reasons.push(`12th percentage too low (${metric(student.twelfthPercentage)} < ${metric(twelfthPercentageMin)})`);
  }

  // Check diploma percentage if applicable
  if (diplomaPercentageMin > 0 && Number(student.diplomaPercentage) < Number(diplomaPercentageMin)) {
    eligible = false;
    reasons.push(`Diploma percentage too low (${metric(student.diplomaPercentage)} < ${metric(diplomaPercentageMin)})`);
  }

  // Check courses
  if (courses.length > 0 && student.course && !courses.includes(student.course)) {
    eligible = false;
    reasons.push(`Course "${student.course}" not eligible`);
  }

  // Check departments
  if (departments.length > 0 && student.department && !departments.includes(student.department)) {
    eligible = false;
    reasons.push(`Department "${student.department}" not eligible`);
  }

  // Check batches
  if (batches.length > 0 && student.batch && !batches.includes(student.batch)) {
    eligible = false;
    reasons.push(`Batch "${student.batch}" not eligible`);
  }

  // Check program
  if (program && student.program && student.program !== program) {
    eligible = false;
    reasons.push(`Program "${student.program}" not eligible`);
  }

  // Check semester
  if (Number(semesterMin) > 1 && Number(student.semester) < Number(semesterMin)) {
    eligible = false;
    reasons.push(`Semester too low (${student.semester} < ${semesterMin})`);
  }
  if (Number(semesterMax) < 12 && Number(student.semester) > Number(semesterMax)) {
    eligible = false;
    reasons.push(`Semester too high (${student.semester} > ${semesterMax})`);
  }

  // Check active backlogs
  if (Number.isFinite(activeBacklogsMax) && Number(student.activeBacklogs) > Number(activeBacklogsMax)) {
    eligible = false;
    reasons.push(`Too many active backlogs (${student.activeBacklogs} > ${activeBacklogsMax})`);
  }

  // Check total backlogs
  if (Number.isFinite(totalBacklogsMax) && Number(student.totalBacklogs) > Number(totalBacklogsMax)) {
    eligible = false;
    reasons.push(`Too many total backlogs (${student.totalBacklogs} > ${totalBacklogsMax})`);
  }

  // Check attendance
  if (Number(attendanceMin) > 0 && Number(student.attendance) < Number(attendanceMin)) {
    eligible = false;
    reasons.push(`Attendance too low (${student.attendance} < ${attendanceMin})`);
  }

  // Check stuck-off status
  const isStuckOff = student.driveRestriction?.status === "STUCK_OFF" ||
                     ["stuck off", "struck off", "stuck_off", "struck_off"].includes(String(student.status || "").toLowerCase());
  if (!allowStuckOff && isStuckOff) {
    eligible = false;
    reasons.push("Student is stuck-off");
  }

  // Check package criterion: if requiredPackageCtc is set and student is placed,
  // they are eligible only if requiredPackageCtc >= currentStudentPackage * requiredPackageMultiple
  if (requiredPackageCtc > 0 && currentStudentPackage > 0 && student.placementStatus === "PLACED") {
    if (Number(requiredPackageCtc) < Number(currentStudentPackage) * Number(requiredPackageMultiple)) {
      eligible = false;
      reasons.push(
        `Package too low (${requiredPackageCtc} LPA < ${(Number(currentStudentPackage) * Number(requiredPackageMultiple)).toFixed(1)} LPA required for placed students)`
      );
    }
  }

  return {
    status: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
    reasons: eligible ? ["Meets all eligibility criteria"] : reasons,
    student
  };
}

export function filterEligibleStudents(students, criteria = {}) {
  return students.map(student => calculateEligibility(student, criteria));
}
