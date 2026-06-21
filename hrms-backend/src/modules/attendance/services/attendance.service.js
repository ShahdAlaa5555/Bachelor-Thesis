/**
 * src/modules/attendance/services/attendance.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Attendance Module — Service Layer
 *
 * THESIS NOTE — Key Business Logic Implemented:
 *
 * 1. CHECK-IN / CHECK-OUT FLOW
 *    The Clock In button (Image 2) calls checkIn(). The system:
 *    a. Finds today's AttendanceRecord (or creates one)
 *    b. Records CheckInTime as current UTC timestamp
 *    c. Determines the employee's active shift assignment
 *    d. Calculates LatenessMinutes = CheckIn - ShiftStartTime
 *    e. Updates Current Status to "Clocked In"
 *
 * 2. OVERTIME CALCULATION
 *    WorkedHours = CheckOut - CheckIn - BreakDuration
 *    OvertimeHours = MAX(0, WorkedHours - Shift.ExpectedHours)
 *    Per Egyptian Labor Law No. 12/2003, Article 130:
 *    - Max 2 overtime hours/day
 *    - Overtime on normal days: 135% pay (multiplier 1.35)
 *    - Overtime on holidays/rest days: 200% pay (multiplier 2.0)
 *
 * 3. ATTENDANCE SUMMARY GENERATION
 *    At month end (or triggered by Payroll), generates AttendanceSummary
 *    aggregating all records for the period. Used by Payroll module.
 *
 * 4. LEAVE INTEGRATION
 *    When a leave is approved, this service marks attendance records
 *    within the leave period as Status = 'OnLeave' (called by Leave module).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const {
  ATTENDANCE_STATUS,
  CORRECTION_STATUS,
  OVERTIME_STATUS,
  EVENT_CODE,
  MAX_OVERTIME_HOURS_PER_DAY,
} = require('../../../shared/constants');
const { calcHoursDiff, calcLatenessMinutes, getMonthBounds, todayStr, dayjs } = require('../../../shared/utils/date.util');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// ─── Helper: Get Active Shift for an Employee Today ──────────────────────────

async function getActiveShiftForEmployee(employeeId, date) {
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: new Date(date) },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: new Date(date) } }],
    },
    include: { Shift: { include: { Differential: true } } },
    orderBy: { EffectiveFrom: 'desc' },
  });
  return assignment?.Shift || null;
}

// ─── Helper: Combine date + time fields from DB into single DateTime ─────────

function combineDateTime(date, timeField) {
  if (!timeField) return null;
  const d = dayjs(date).format('YYYY-MM-DD');
  const t = dayjs(timeField).format('HH:mm:ss');
  return new Date(`${d}T${t}`);
}

// ─── CHECK-IN ─────────────────────────────────────────────────────────────────

/**
 * Records employee check-in for today.
 * Called when the "Clock In" button is pressed (Image 2).
 */
async function checkIn(employeeId, { notes } = {}) {
  const today = todayStr();
  const now = new Date();

  // Validate employee exists and is active
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    select: { EmployeeID: true, FullName: true, CurrentStatus: true, IsActive: true },
  });
  if (!employee || !employee.IsActive) throw new AppError('Employee not found or inactive.', 404, 'NOT_FOUND');

  // Prevent double check-in
  const existing = await prisma.attendanceRecord.findUnique({
    where: { UQ_Attendance_EmployeeDate: { EmployeeID: employeeId, AttendanceDate: new Date(today) } },
  });

  if (existing?.CheckInTime) {
    throw new AppError('You have already checked in today.', 400, 'ALREADY_CHECKED_IN');
  }

  // Get active shift to calculate lateness
  const shift = await getActiveShiftForEmployee(employeeId, today);
  let latenessMinutes = 0;

  if (shift) {
    const expectedCheckin = combineDateTime(today, shift.StartTime);
    latenessMinutes = calcLatenessMinutes(expectedCheckin, now);
  }

  let record;
  if (existing) {
    // Record was pre-created (e.g., system created it as Absent for cron, now employee checks in)
    record = await prisma.attendanceRecord.update({
      where: { AttendanceID: existing.AttendanceID },
      data: {
        CheckInTime: now,
        Status: ATTENDANCE_STATUS.PRESENT,
        ShiftID: shift?.ShiftID || null,
        LatenessMinutes: latenessMinutes,
        Notes: notes || null,
        UpdatedAt: new Date(),
      },
    });
  } else {
    record = await prisma.attendanceRecord.create({
      data: {
        EmployeeID: employeeId,
        AttendanceDate: new Date(today),
        ShiftID: shift?.ShiftID || null,
        CheckInTime: now,
        Status: ATTENDANCE_STATUS.PRESENT,
        LatenessMinutes: latenessMinutes,
        Notes: notes || null,
        IsManualEntry: false,
      },
    });
  }

  await notify({
    recipientId: employeeId,
    eventCode: EVENT_CODE.ATT_CHECKIN,
    title: 'Check-in Recorded',
    body: `Check-in at ${dayjs(now).format('HH:mm')}${latenessMinutes > 0 ? ` (${latenessMinutes} minutes late)` : ''}`,
    sourceModule: 'Attendance',
    sourceEntityId: record.AttendanceID,
  });

  return { ...record, latenessMinutes, shiftName: shift?.ShiftName || null };
}

// ─── CHECK-OUT ────────────────────────────────────────────────────────────────

/**
 * Records employee check-out and calculates worked/overtime hours.
 */
async function checkOut(employeeId, { notes } = {}) {
  const today = todayStr();
  const now = new Date();

  const record = await prisma.attendanceRecord.findUnique({
    where: { UQ_Attendance_EmployeeDate: { EmployeeID: employeeId, AttendanceDate: new Date(today) } },
    include: { Shift: true },
  });

  if (!record) throw new AppError('No check-in found for today. Please check in first.', 400, 'NOT_CHECKED_IN');
  if (!record.CheckInTime) throw new AppError('No check-in time recorded.', 400, 'NOT_CHECKED_IN');
  if (record.CheckOutTime) throw new AppError('You have already checked out today.', 400, 'ALREADY_CHECKED_OUT');

  // Calculate worked hours (subtract break duration)
  const breakMinutes = record.Shift?.BreakDurationMin || 0;
  const grossHours = calcHoursDiff(record.CheckInTime, now);
  const workedHours = Math.max(0, grossHours - breakMinutes / 60);

  // Calculate overtime
  const expectedHours = record.Shift ? Number(record.Shift.ExpectedHours) : 8;
  const rawOvertime = Math.max(0, workedHours - expectedHours);
  const overtimeHours = Math.min(rawOvertime, MAX_OVERTIME_HOURS_PER_DAY);

  // Early departure
  const earlyDeparture = await calcEarlyDeparture(record, now);

  const updated = await prisma.attendanceRecord.update({
    where: { AttendanceID: record.AttendanceID },
    data: {
      CheckOutTime: now,
      WorkedHours: parseFloat(workedHours.toFixed(2)),
      OvertimeHours: parseFloat(overtimeHours.toFixed(2)),
      EarlyDepartureMin: earlyDeparture,
      Notes: notes || record.Notes,
      UpdatedAt: new Date(),
    },
  });

  await notify({
    recipientId: employeeId,
    eventCode: EVENT_CODE.ATT_CHECKOUT,
    title: 'Check-out Recorded',
    body: `Check-out at ${dayjs(now).format('HH:mm')}. Worked: ${workedHours.toFixed(1)}h${overtimeHours > 0 ? `, Overtime: ${overtimeHours.toFixed(1)}h` : ''}`,
    sourceModule: 'Attendance',
    sourceEntityId: record.AttendanceID,
  });

  return { ...updated, workedHours, overtimeHours };
}

async function calcEarlyDeparture(record, checkoutTime) {
  if (!record.Shift) return 0;
  const expectedEnd = combineDateTime(
    dayjs(record.AttendanceDate).format('YYYY-MM-DD'),
    record.Shift.EndTime
  );
  if (!expectedEnd) return 0;
  const diff = dayjs(expectedEnd).diff(dayjs(checkoutTime), 'minute');
  return Math.max(0, diff);
}

// ─── GET TODAY'S STATUS (Dashboard "Current Status" — Image 2) ───────────────

async function getTodayStatus(employeeId) {
  const today = todayStr();
  const shift = await getActiveShiftForEmployee(employeeId, today);
  const record = await prisma.attendanceRecord.findUnique({
    where: { UQ_Attendance_EmployeeDate: { EmployeeID: employeeId, AttendanceDate: new Date(today) } },
  });

  let currentStatus = 'Clocked Out';
  if (record?.CheckInTime && !record?.CheckOutTime) currentStatus = 'Clocked In';
  if (record?.Status === 'OnLeave') currentStatus = 'On Leave';
  if (record?.Status === 'Holiday') currentStatus = 'Holiday';

  const nextBreak = shift
    ? {
        time: shift.BreakStartTime ? dayjs(shift.BreakStartTime).format('h:mm A') : null,
        durationMin: shift.BreakDurationMin,
      }
    : null;

  return {
    currentStatus,
    checkInTime: record?.CheckInTime || null,
    checkOutTime: record?.CheckOutTime || null,
    workedHours: record?.WorkedHours || 0,
    latenessMinutes: record?.LatenessMinutes || 0,
    todayShift: shift
      ? {
          shiftName: shift.ShiftName,
          startTime: dayjs(shift.StartTime).format('h:mm A'),
          endTime: dayjs(shift.EndTime).format('h:mm A'),
          expectedHours: shift.ExpectedHours,
          nextBreak,
        }
      : null,
    attendanceDate: today,
  };
}

// ─── ATTENDANCE DASHBOARD KPIs (Image 2) ─────────────────────────────────────

async function getDashboardKPIs(employeeId) {
  const now = dayjs();

  // This week hours
  const weekStart = now.startOf('week').toDate(); // Sunday
  const weekRecords = await prisma.attendanceRecord.findMany({
    where: {
      EmployeeID: employeeId,
      AttendanceDate: { gte: weekStart, lte: now.toDate() },
      WorkedHours: { not: null },
    },
    select: { WorkedHours: true, LatenessMinutes: true },
  });

  const thisWeekHours = weekRecords.reduce((sum, r) => sum + Number(r.WorkedHours || 0), 0);

  // This month for on-time rate
  const monthStart = now.startOf('month').toDate();
  const monthRecords = await prisma.attendanceRecord.findMany({
    where: {
      EmployeeID: employeeId,
      AttendanceDate: { gte: monthStart, lte: now.toDate() },
      Status: ATTENDANCE_STATUS.PRESENT,
    },
    select: { LatenessMinutes: true },
  });

  const onTimeCount = monthRecords.filter((r) => (r.LatenessMinutes || 0) === 0).length;
  const onTimeRate = monthRecords.length > 0
    ? Math.round((onTimeCount / monthRecords.length) * 100)
    : 100;

  // Pending correction requests
  const pendingCorrections = await prisma.attendanceCorrectionRequest.count({
    where: { EmployeeID: employeeId, Status: CORRECTION_STATUS.PENDING },
  });

  // Days to payroll (rough estimate: next 25th)
  const paymentDay = 25;
  let daysToPayroll;
  if (now.date() < paymentDay) {
    daysToPayroll = paymentDay - now.date();
  } else {
    daysToPayroll = now.daysInMonth() - now.date() + paymentDay;
  }

  return {
    thisWeekHours: parseFloat(thisWeekHours.toFixed(1)),
    onTimeRate,
    pendingRequests: pendingCorrections,
    daysToPayroll,
  };
}

// ─── ATTENDANCE RECORDS ───────────────────────────────────────────────────────

async function listAttendance(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};

  if (query.employeeId) where.EmployeeID = query.employeeId;
  if (query.status) where.Status = query.status;
  if (query.startDate || query.endDate) {
    where.AttendanceDate = {};
    if (query.startDate) where.AttendanceDate.gte = new Date(query.startDate);
    if (query.endDate) where.AttendanceDate.lte = new Date(query.endDate);
  }
  if (query.departmentId) {
    where.Employee = { DepartmentID: query.departmentId };
  }

  const [records, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip,
      take: limit,
      orderBy: { AttendanceDate: 'desc' },
      include: {
        Employee: { select: { FullName: true, EmployeeCode: true } },
        Shift: { select: { ShiftName: true } },
      },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return { records, meta: buildPaginationMeta(total, page, limit) };
}

async function getAttendanceRecord(attendanceId) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { AttendanceID: attendanceId },
    include: {
      Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } },
      Shift: true,
      LeaveRequest: { select: { LeaveRequestID: true, Status: true } },
      Corrections: {
        orderBy: { CreatedAt: 'desc' },
        take: 1,
        include: { Reviewer: { select: { FullName: true } } },
      },
    },
  });
  if (!record) throw new AppError('Attendance record not found.', 404, 'NOT_FOUND');
  return record;
}

async function createManualAttendance(data, createdById) {
  // HR/Manager creating a manual entry
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: data.EmployeeID } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Check for duplicate
  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      UQ_Attendance_EmployeeDate: {
        EmployeeID: data.EmployeeID,
        AttendanceDate: new Date(data.AttendanceDate),
      },
    },
  });
  if (existing) throw new AppError('An attendance record already exists for this employee on this date.', 409, 'DUPLICATE_ENTRY');

  let workedHours = null;
  let overtimeHours = 0;

  if (data.CheckInTime && data.CheckOutTime) {
    const shift = await getActiveShiftForEmployee(data.EmployeeID, data.AttendanceDate);
    const breakMin = shift?.BreakDurationMin || 0;
    workedHours = Math.max(0, calcHoursDiff(data.CheckInTime, data.CheckOutTime) - breakMin / 60);
    const expectedHours = shift ? Number(shift.ExpectedHours) : 8;
    overtimeHours = Math.min(Math.max(0, workedHours - expectedHours), MAX_OVERTIME_HOURS_PER_DAY);
  }

  return prisma.attendanceRecord.create({
    data: {
      ...data,
      AttendanceDate: new Date(data.AttendanceDate),
      CheckInTime: data.CheckInTime ? new Date(data.CheckInTime) : null,
      CheckOutTime: data.CheckOutTime ? new Date(data.CheckOutTime) : null,
      WorkedHours: workedHours ? parseFloat(workedHours.toFixed(2)) : null,
      OvertimeHours: parseFloat(overtimeHours.toFixed(2)),
      IsManualEntry: true,
    },
  });
}

// ─── CORRECTION REQUESTS (Submit Correction button — Image 2) ────────────────

async function submitCorrectionRequest(attendanceId, requesterId, requesterRole, data) {
  const record = await prisma.attendanceRecord.findUnique({ where: { AttendanceID: attendanceId } });
  if (!record) throw new AppError('Attendance record not found.', 404, 'NOT_FOUND');

  const isOwner = record.EmployeeID === requesterId;
  const isPrivileged = ['HR', 'Admin'].includes(requesterRole);

  if (!isOwner && !isPrivileged) {
    throw new AppError('You cannot submit a correction for another employee.', 403, 'FORBIDDEN');
  }

  // Prevent duplicate pending corrections
  const pending = await prisma.attendanceCorrectionRequest.findFirst({
    where: { AttendanceID: attendanceId, Status: CORRECTION_STATUS.PENDING },
  });
  if (pending) throw new AppError('A pending correction request already exists for this record.', 409, 'DUPLICATE_ENTRY');

  const correction = await prisma.attendanceCorrectionRequest.create({
    data: {
      AttendanceID: attendanceId,
      EmployeeID: record.EmployeeID,        // always the actual record owner, not the requester
      RequestedBy: requesterId,             // track who actually submitted it (add this column if it doesn't exist)
      CorrectedCheckIn: data.CorrectedCheckIn ? new Date(data.CorrectedCheckIn) : null,
      CorrectedCheckOut: data.CorrectedCheckOut ? new Date(data.CorrectedCheckOut) : null,
      Reason: data.Reason,
      Status: CORRECTION_STATUS.PENDING,
    },
  });

  await notify({
    recipientId: record.EmployeeID,         // notify the actual employee whose attendance changed
    eventCode: EVENT_CODE.ATT_CORRECTION_SUBMITTED,
    title: 'Correction Request Submitted',
    body: `An attendance correction for ${dayjs(record.AttendanceDate).format('MMM D, YYYY')} is under review.`,
    sourceModule: 'Attendance',
    sourceEntityId: correction.CorrectionID,
  });

  return correction;
}

async function reviewCorrectionRequest(correctionId, reviewerId, { Status, ReviewNote }) {
  const correction = await prisma.attendanceCorrectionRequest.findUnique({
    where: { CorrectionID: correctionId },
    include: { Attendance: { include: { Shift: true } } },
  });
  if (!correction) throw new AppError('Correction request not found.', 404, 'NOT_FOUND');
  if (correction.Status !== CORRECTION_STATUS.PENDING) {
    throw new AppError('This correction has already been reviewed.', 400, 'ALREADY_REVIEWED');
  }

  const ops = [
    prisma.attendanceCorrectionRequest.update({
      where: { CorrectionID: correctionId },
      data: {
        Status,
        ReviewedBy: reviewerId,
        ReviewNote: ReviewNote || null,
        ReviewedAt: new Date(),
      },
    }),
  ];

  if (Status === CORRECTION_STATUS.APPROVED) {
    // Apply the corrected times and recalculate hours
    const checkin = correction.CorrectedCheckIn || correction.Attendance.CheckInTime;
    const checkout = correction.CorrectedCheckOut || correction.Attendance.CheckOutTime;
    let workedHours = null;
    let overtimeHours = 0;

    if (checkin && checkout) {
      const breakMin = correction.Attendance.Shift?.BreakDurationMin || 0;
      workedHours = Math.max(0, calcHoursDiff(checkin, checkout) - breakMin / 60);
      const expectedHours = correction.Attendance.Shift ? Number(correction.Attendance.Shift.ExpectedHours) : 8;
      overtimeHours = Math.min(Math.max(0, workedHours - expectedHours), MAX_OVERTIME_HOURS_PER_DAY);
    }

    ops.push(
      prisma.attendanceRecord.update({
        where: { AttendanceID: correction.AttendanceID },
        data: {
          CheckInTime: correction.CorrectedCheckIn || undefined,
          CheckOutTime: correction.CorrectedCheckOut || undefined,
          WorkedHours: workedHours ? parseFloat(workedHours.toFixed(2)) : undefined,
          OvertimeHours: parseFloat(overtimeHours.toFixed(2)),
          Status: ATTENDANCE_STATUS.CORRECTION,
          UpdatedAt: new Date(),
        },
      })
    );
  }

  const [updated] = await prisma.$transaction(ops);

  await notify({
    recipientId: correction.EmployeeID,
    eventCode: EVENT_CODE.ATT_CORRECTION_APPROVED,
    title: `Correction Request ${Status}`,
    body: `Your attendance correction has been ${Status.toLowerCase()}.${ReviewNote ? ` Note: ${ReviewNote}` : ''}`,
    sourceModule: 'Attendance',
    sourceEntityId: correctionId,
  });

  return updated;
}

async function listCorrectionRequests(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.employeeId) where.EmployeeID = query.employeeId;
  if (query.status) where.Status = query.status;

  const [corrections, total] = await Promise.all([
    prisma.attendanceCorrectionRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { CreatedAt: 'desc' },
      include: {
        Employee: { select: { FullName: true, EmployeeCode: true } },
        Attendance: { select: { AttendanceDate: true, CheckInTime: true, CheckOutTime: true } },
        Reviewer: { select: { FullName: true } },
      },
    }),
    prisma.attendanceCorrectionRequest.count({ where }),
  ]);

  return { corrections, meta: buildPaginationMeta(total, page, limit) };
}

// ─── OVERTIME REQUESTS ────────────────────────────────────────────────────────

async function submitOvertimeRequest(data, requestedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: data.EmployeeID } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  if (data.EstimatedHours > MAX_OVERTIME_HOURS_PER_DAY) {
    throw new AppError(
      `Overtime cannot exceed ${MAX_OVERTIME_HOURS_PER_DAY} hours per day per Egyptian Labor Law.`,
      400,
      'OVERTIME_LIMIT_EXCEEDED'
    );
  }

  const request = await prisma.overtimeRequest.create({
    data: {
      EmployeeID: data.EmployeeID,
      RequestedBy: requestedById,
      OvertimeDate: new Date(data.OvertimeDate),
      EstimatedHours: data.EstimatedHours,
      IsNighttime: data.IsNighttime || false,
      Reason: data.Reason,
      Status: OVERTIME_STATUS.PENDING,
      EmployeeNotifiedAt: new Date(),
    },
  });

  await notify({
    recipientId: data.EmployeeID,
    eventCode: EVENT_CODE.ATT_OVERTIME_APPROVED,
    title: 'Overtime Request Submitted',
    body: `Overtime request for ${dayjs(data.OvertimeDate).format('MMM D')} (${data.EstimatedHours}h) is pending approval.`,
    sourceModule: 'Attendance',
    sourceEntityId: request.OvertimeRequestID,
  });

  return request;
}

async function approveOvertimeRequest(overtimeRequestId, approverId, approved) {
  const request = await prisma.overtimeRequest.findUnique({
    where: { OvertimeRequestID: overtimeRequestId },
  });
  if (!request) throw new AppError('Overtime request not found.', 404, 'NOT_FOUND');
  if (request.Status !== OVERTIME_STATUS.PENDING) {
    throw new AppError('This overtime request has already been processed.', 400, 'ALREADY_PROCESSED');
  }

  const newStatus = approved ? OVERTIME_STATUS.APPROVED : OVERTIME_STATUS.REJECTED;

  const updated = await prisma.overtimeRequest.update({
    where: { OvertimeRequestID: overtimeRequestId },
    data: {
      Status: newStatus,
      ApprovedBy: approverId,
      AuthorityNotifiedAt: new Date(),
    },
  });

  await notify({
    recipientId: request.EmployeeID,
    eventCode: EVENT_CODE.ATT_OVERTIME_APPROVED,
    title: `Overtime Request ${newStatus}`,
    body: `Your overtime request for ${dayjs(request.OvertimeDate).format('MMM D')} has been ${newStatus.toLowerCase()}.`,
    sourceModule: 'Attendance',
    sourceEntityId: overtimeRequestId,
  });

  return updated;
}

// ─── SHIFT MANAGEMENT ─────────────────────────────────────────────────────────

async function listShifts() {
  return prisma.shift.findMany({
    where: { IsActive: true },
    include: { Differential: true, Restrictions: true },
    orderBy: { ShiftName: 'asc' },
  });
}

async function assignShift(data, assignedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: data.EmployeeID } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  if (!employee.IsActive || employee.CurrentStatus === 'Terminated') {
    throw new AppError('Cannot assign shift to an inactive or terminated employee.', 400, 'INACTIVE_EMPLOYEE');
  }
  const shift = await prisma.shift.findUnique({ where: { ShiftID: data.ShiftID } });
  
  if (!shift) throw new AppError('Shift not found.', 404, 'NOT_FOUND');

// ADD THESE:
if (!shift.IsActive) {
  throw new AppError('Shift is not active.', 400, 'INACTIVE_SHIFT');
}

if (!data.EffectiveFrom) {
  throw new AppError('EffectiveFrom date is required.', 400, 'MISSING_DATE');
}



  const existing = await prisma.employeeShiftAssignment.findFirst({
    where: {
      EmployeeID: data.EmployeeID,
      ShiftID: data.ShiftID,
      EffectiveFrom: new Date(data.EffectiveFrom),
    },
  });
  if (existing) throw new AppError('This shift assignment already exists for this employee on this date.', 409, 'DUPLICATE_ASSIGNMENT');

  await prisma.employeeShiftAssignment.updateMany({
    where: { EmployeeID: data.EmployeeID, EffectiveTo: null },
    data: { EffectiveTo: new Date(data.EffectiveFrom) },
  });

  return prisma.employeeShiftAssignment.create({
    data: {
      EmployeeID: data.EmployeeID,
      ShiftID: data.ShiftID,
      EffectiveFrom: new Date(data.EffectiveFrom),
      EffectiveTo: data.EffectiveTo ? new Date(data.EffectiveTo) : null,
      AssignedBy: assignedById,
    },
    include: { Shift: true },
  });
}
// ─── ATTENDANCE SUMMARY (used by Payroll) ─────────────────────────────────────

/**
 * Generates or refreshes an AttendanceSummary for a given employee/period.
 * Called by: Payroll module before processing, or manually by HR.
 *
 * THESIS NOTE:
 * This is the critical integration point between Attendance and Payroll.
 * The PayrollEntry.AttendanceSummaryID links to this record, enabling
 * payroll to deduct for absences and pay for overtime.
 */
async function generateAttendanceSummary(employeeId, year, month) {
  const { startDate, endDate } = getMonthBounds(year, month);

  // 1. Fetch employee work location for holiday calendar
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    select: { WorkLocationID: true, StartDate: true },
  });

  // 2. Fetch all attendance records for the period
  const records = await prisma.attendanceRecord.findMany({
    where: {
      EmployeeID: employeeId,
      AttendanceDate: { gte: startDate, lte: endDate },
    },
  });
  // Build a map for O(1) lookup
  const recordMap = new Map(
    records.map(r => [dayjs(r.AttendanceDate).format('YYYY-MM-DD'), r])
  );

  // 3. Fetch approved leave requests overlapping this period
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      EmployeeID: employeeId,
      Status: 'Approved',
      StartDate: { lte: endDate },
      EndDate:   { gte: startDate },
    },
    include: { LeaveType: { select: { IsPaid: true } } },
  });
  // Build a set of dates covered by approved leave
  const leaveDateMap = new Map(); // date -> { isPaid }
  for (const lr of leaveRequests) {
    let cur = dayjs(lr.StartDate);
    const lEnd = dayjs(lr.EndDate);
    while (cur.isSameOrBefore(lEnd)) {
      const ds = cur.format('YYYY-MM-DD');
      if (cur.toDate() >= startDate && cur.toDate() <= endDate) {
        leaveDateMap.set(ds, { isPaid: lr.LeaveType.IsPaid });
      }
      cur = cur.add(1, 'day');
    }
  }

  // 4. Fetch public holidays for this period and work location
  const holidays = await prisma.holidayCalendar.findMany({
    where: {
      HolidayDate: { gte: startDate, lte: endDate },
      OR: [
        { WorkLocationID: null },
        { WorkLocationID: employee?.WorkLocationID ?? undefined },
      ],
    },
  });
  const holidaySet = new Set(
    holidays.map(h => dayjs(h.HolidayDate).format('YYYY-MM-DD'))
  );

  // 5. Walk every calendar day in the month
  const summary = {
    TotalWorkingDays: 0,
    PresentDays:      0,
    AbsentDays:       0,
    LeaveDays:        0,
    HolidayDays:      0,
    TotalWorkedHours: 0,
    TotalOvertimeHrs: 0,
    TotalLatenessMins: 0,
  };

  let current = dayjs(startDate);
  const end    = dayjs(endDate);

  while (current.isSameOrBefore(end)) {
    const dateStr = current.format('YYYY-MM-DD');
    const dow     = current.day(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
    const isWeekend = dow === 5 || dow === 6; // Egypt: Fri & Sat

    if (isWeekend) {
      // Weekends are not working days — skip entirely
      current = current.add(1, 'day');
      continue;
    }

    // It's a working day
    summary.TotalWorkingDays++;

    if (holidaySet.has(dateStr)) {
      // Public holiday
      summary.HolidayDays++;
      current = current.add(1, 'day');
      continue;
    }

    const record = recordMap.get(dateStr);

    if (record) {
      // We have an attendance record — trust it
      const status = record.Status;

      if (status === ATTENDANCE_STATUS.PRESENT || status === ATTENDANCE_STATUS.CORRECTION) {
        summary.PresentDays++;
        summary.TotalWorkedHours  += Number(record.WorkedHours    || 0);
        summary.TotalOvertimeHrs  += Number(record.OvertimeHours  || 0);
        summary.TotalLatenessMins += Number(record.LatenessMinutes|| 0);
      } else if (status === ATTENDANCE_STATUS.HALF_DAY) {
        summary.PresentDays       += 0.5;
        summary.TotalWorkedHours  += Number(record.WorkedHours || 4);
        summary.TotalLatenessMins += Number(record.LatenessMinutes || 0);
      } else if (status === ATTENDANCE_STATUS.ON_LEAVE) {
        summary.LeaveDays++;
      } else if (status === ATTENDANCE_STATUS.HOLIDAY) {
        summary.HolidayDays++;
        summary.TotalWorkingDays--; // don't count as working day
      } else if (status === ATTENDANCE_STATUS.ABSENT) {
        summary.AbsentDays++;
      }
      // WEEKEND_WORK — employee worked on weekend, bonus but not a regular working day
    } else if (leaveDateMap.has(dateStr)) {
      // No record but approved leave exists for this date
      summary.LeaveDays++;
    } else {
      // No record, no leave, not a holiday, not a weekend = ABSENT
      summary.AbsentDays++;
    }

    current = current.add(1, 'day');
  }

  const onTimeRate = summary.PresentDays > 0
    ? parseFloat(
        ((summary.PresentDays - (summary.TotalLatenessMins > 0 ? 1 : 0))
          / summary.PresentDays * 100).toFixed(2)
      )
    : 100;

  const summaryData = {
    EmployeeID:        employeeId,
    PeriodYear:        year,
    PeriodMonth:       month,
    TotalWorkingDays:  summary.TotalWorkingDays,
    PresentDays:       summary.PresentDays,
    AbsentDays:        summary.AbsentDays,
    LeaveDays:         summary.LeaveDays,
    HolidayDays:       summary.HolidayDays,
    TotalWorkedHours:  parseFloat(summary.TotalWorkedHours.toFixed(2)),
    TotalOvertimeHrs:  parseFloat(summary.TotalOvertimeHrs.toFixed(2)),
    TotalLatenessMins: summary.TotalLatenessMins,
    OnTimeRate:        onTimeRate,
    GeneratedAt:       new Date(),
  };

  const existing = await prisma.attendanceSummary.findUnique({
    where: { UQ_AttSummary_EmpPeriod: { EmployeeID: employeeId, PeriodYear: year, PeriodMonth: month } },
  });

  if (existing) {
    return prisma.attendanceSummary.update({
      where: { SummaryID: existing.SummaryID },
      data: summaryData,
    });
  }

  return prisma.attendanceSummary.create({ data: summaryData });
}

async function getAttendanceSummary(employeeId, year, month) {
  const summary = await prisma.attendanceSummary.findUnique({
    where: { UQ_AttSummary_EmpPeriod: { EmployeeID: employeeId, PeriodYear: year, PeriodMonth: month } },
    include: { Employee: { select: { FullName: true, EmployeeCode: true } } },
  });

  if (!summary) {
    // Auto-generate if not found
    return generateAttendanceSummary(employeeId, year, month);
  }

  return summary;
}

// ─── MARK ATTENDANCE AS ON-LEAVE (called by Leave module on approval) ─────────

async function markAttendanceAsOnLeave(employeeId, startDate, endDate, leaveRequestId) {
  const dates = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  while (current.isSameOrBefore(end)) {
    dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  const ops = dates.map((date) =>
    prisma.attendanceRecord.upsert({
      where: {
        UQ_Attendance_EmployeeDate: {
          EmployeeID: employeeId,
          AttendanceDate: new Date(date),
        },
      },
      update: {
        Status: ATTENDANCE_STATUS.ON_LEAVE,
        LeaveRequestID: leaveRequestId,
        UpdatedAt: new Date(),
      },
      create: {
        EmployeeID: employeeId,
        AttendanceDate: new Date(date),
        Status: ATTENDANCE_STATUS.ON_LEAVE,
        LeaveRequestID: leaveRequestId,
        IsManualEntry: false,
      },
    })
  );

  return prisma.$transaction(ops);
}

// ─── RECENT ACTIVITY (Image 2 dashboard feed) ────────────────────────────────

async function getRecentActivity(employeeId, limit = 10) {
  return prisma.attendanceRecord.findMany({
    where: { EmployeeID: employeeId },
    take: limit,
    orderBy: { AttendanceDate: 'desc' },
    select: {
      AttendanceID: true,
      AttendanceDate: true,
      CheckInTime: true,
      CheckOutTime: true,
      WorkedHours: true,
      OvertimeHours: true,
      LatenessMinutes: true,
      Status: true,
      Shift: { select: { ShiftName: true } },
    },
  });
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────

async function getAttendanceCalendar(employeeId, year, month) {
  const { startDate, endDate } = getMonthBounds(year, month);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      EmployeeID: employeeId,
      AttendanceDate: { gte: startDate, lte: endDate },
    },
    orderBy: { AttendanceDate: 'asc' },
    select: {
      AttendanceID: true,
      AttendanceDate: true,
      CheckInTime: true,
      CheckOutTime: true,
      WorkedHours: true,
      OvertimeHours: true,
      LatenessMinutes: true,
      Status: true,
    },
  });

  // Fill in missing dates as absent or weekend
  const calendar = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  const recordMap = new Map(records.map((r) => [dayjs(r.AttendanceDate).format('YYYY-MM-DD'), r]));

  while (current.isSameOrBefore(end)) {
    const dateStr = current.format('YYYY-MM-DD');
    const dow = current.day();
    const isWeekend = dow === 5 || dow === 6; // Fri/Sat in Egypt

    if (recordMap.has(dateStr)) {
      calendar.push({ date: dateStr, ...recordMap.get(dateStr) });
    } else {
      calendar.push({
        date: dateStr,
        status: isWeekend ? 'Weekend' : 'NoRecord',
      });
    }
    current = current.add(1, 'day');
  }

  return calendar;
}

module.exports = {
  checkIn,
  checkOut,
  getTodayStatus,
  getDashboardKPIs,
  listAttendance,
  getAttendanceRecord,
  createManualAttendance,
  submitCorrectionRequest,
  reviewCorrectionRequest,
  listCorrectionRequests,
  submitOvertimeRequest,
  approveOvertimeRequest,
  listShifts,
  assignShift,
  generateAttendanceSummary,
  getAttendanceSummary,
  markAttendanceAsOnLeave,
  getRecentActivity,
  getAttendanceCalendar,
};
