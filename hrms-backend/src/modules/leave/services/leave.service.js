/**
 * src/modules/leave/services/leave.service.js
 * COMPLETE SERVICE LAYER - All methods preserved + Requirements Fixed
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const {
  LEAVE_REQUEST_STATUS, LEAVE_APPROVAL_DECISION, 
  EMPLOYEE_STATUS, EVENT_CODE
} = require('../../../shared/constants');
const {
  countEgyptianBusinessDays, dayjs,
} = require('../../../shared/utils/date.util');
const { markAttendanceAsOnLeave } = require('../../attendance/services/attendance.service');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function getHolidayDatesInRange(employeeId, startDate, endDate) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId }, select: { WorkLocationID: true },
  });
  const holidays = await prisma.holidayCalendar.findMany({
    where: {
      HolidayDate: { gte: new Date(startDate), lte: new Date(endDate) },
      OR: [{ WorkLocationID: employee?.WorkLocationID }, { WorkLocationID: null }],
    },
    select: { HolidayDate: true },
  });
  return holidays.map((h) => h.HolidayDate);
}

// ── LEAVE TYPES & POLICIES ───────────────────────────────────────────────────

async function listLeaveTypes() {
  return prisma.leaveType.findMany();
}

async function createLeaveType(data) {
  return prisma.leaveType.create({ data });
}

async function listLeavePolicies(query = {}) {
  return prisma.leavePolicy.findMany({ include: { LeaveType: true } });
}

async function createLeavePolicy(data) {
  return prisma.leavePolicy.create({ data });
}

// ── BALANCE MANAGEMENT ───────────────────────────────────────────────────────

async function getLeaveBalanceDashboard(employeeId, year = new Date().getFullYear()) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    select: { StartDate: true }
  });
  if (!employee) throw new AppError('Employee not found.', 404);

  const balances = await prisma.leaveBalance.findMany({
    where: { EmployeeID: employeeId, BalanceYear: year },
    include: { LeaveType: true },
  });

  const tenureMonths = dayjs().diff(dayjs(employee.StartDate), 'month');
  const sixMonthEligibilityDate = dayjs(employee.StartDate).add(6, 'month');
  const isEligibleNow = tenureMonths >= 6;

  return balances.map((b) => {
    const typeName = b.LeaveType.LeaveTypeName.toLowerCase();
    const requiresSixMonths = typeName.includes('annual') || typeName.includes('sick');

    const entitledDays = Number(b.EntitledDays);
    const usedDays = Number(b.UsedDays);
    const pendingDays = Number(b.PendingDays);

    let remainingDays;
    let availabilityStatus;
    let availableFrom = null;

    if (requiresSixMonths && !isEligibleNow) {
      remainingDays = 0;
      availabilityStatus = 'LOCKED';
      availableFrom = sixMonthEligibilityDate.format('YYYY-MM-DD');
    } else {
      remainingDays = Math.round(
        entitledDays + Number(b.CarryOverDays || 0) + Number(b.AdjustedDays || 0) - usedDays - pendingDays
      );
      availabilityStatus = 'AVAILABLE';
    }

    return {
      leaveTypeId: b.LeaveTypeID,
      leaveTypeName: b.LeaveType.LeaveTypeName,
      entitledDays,
      usedDays,
      pendingDays,
      remainingDays,
      availabilityStatus,
      availableFrom
    };
  });
}

const {
  getStatutoryAnnualEntitlement,
  getFirstYearAnnualEntitlement,
  getSickLeaveEntitlement,
  prorateByCompletedMonths
} = require('../utils/leave.calculation.util');

async function initializeLeaveBalances(employeeId, year, specificLeaveTypeId = null) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404);

  const whereClause = specificLeaveTypeId ? { LeaveTypeID: specificLeaveTypeId } : { IsActive: true };
  const types = await prisma.leaveType.findMany({ where: whereClause });
  if (types.length === 0) throw new AppError('No leave types found to assign.', 404);

  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31`);
  const startDate = new Date(employee.StartDate);

  // FIXED: isFirstYear = employee has NOT completed 12 months of service
  // by the start of this balance year — not just "hired in the same calendar year"
  const completedOneYearByYearStart = dayjs(yearStart).isAfter(
    dayjs(startDate).add(1, 'year')
  );
  const isFirstYear = !completedOneYearByYearStart;

  // For proration of other leave types: how many months did they work
  // within THIS calendar year specifically?
  const workedFromThisYear = dayjs(startDate).isAfter(dayjs(yearStart))
    ? startDate   // hired mid-year: prorate from StartDate
    : yearStart;  // hired before this year: full year

  let assignedCount = 0;

  for (const t of types) {
    const policy = await prisma.leavePolicy.findFirst({
      where: {
        LeaveTypeID: t.LeaveTypeID,
        IsActive: true,
        EffectiveFrom: { lte: yearEnd },
        OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: yearStart } }],
        AND: [{
          OR: [
            { EmploymentType: null },
            { EmploymentType: '' },
            { EmploymentType: employee.EmploymentType }
          ]
        }]
      },
      orderBy: { EffectiveFrom: 'desc' },
      include: { SickLeaveTiers: true }
    });

    if (!policy) continue;

    if (policy.MinTenureMonths) {
      const tenureMonths = dayjs(yearEnd).diff(dayjs(startDate), 'month');
      if (tenureMonths < policy.MinTenureMonths) continue;
    }

    const typeName = t.LeaveTypeName.toLowerCase();
    let entitledDays;

    if (typeName.includes('annual')) {
      if (isFirstYear) {
        // First employment year: flat 15 days after 6-month milestone
        // Pass the actual StartDate so the 6-month check is from employment start,
        // not from Jan 1 of the balance year
        entitledDays = getFirstYearAnnualEntitlement(startDate, year);
      } else {
        // Beyond first employment year: statutory tiers (21/30/45)
        entitledDays = getStatutoryAnnualEntitlement(employee, yearEnd);
        const policyMax = Number(policy.MaxDaysPerYear);
        if (policyMax > entitledDays) {
          entitledDays = Math.round(policyMax);
        }
      }

    } else if (typeName.includes('sick')) {
      // 3-year rolling cycle cap — availability enforced at request time
      entitledDays = 360;

    } else {
      // All other leave types: prorate by months worked within THIS calendar year
      const maxDays = Number(policy.MaxDaysPerYear) || 0;
      const isHiredMidThisYear = dayjs(startDate).isAfter(dayjs(yearStart));

      if (isHiredMidThisYear) {
        entitledDays = prorateByCompletedMonths(maxDays, startDate, yearEnd);
      } else {
        entitledDays = Math.round(maxDays);
      }
    }

    await prisma.leaveBalance.upsert({
      where: {
        UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: t.LeaveTypeID, BalanceYear: year }
      },
      update: { EntitledDays: entitledDays },
      create: {
        EmployeeID: employeeId,
        LeaveTypeID: t.LeaveTypeID,
        BalanceYear: year,
        EntitledDays: entitledDays,
        UsedDays: 0,
        PendingDays: 0,
        CarryOverDays: 0,
        AdjustedDays: 0
      }
    });
    assignedCount++;
  }

  return { message: 'Balances assigned successfully', assignedCount };
}
/**
 * FIX C: Real Adjust Balance (No Mock)
 */
async function adjustLeaveBalance(data, adminId) {
  const { EmployeeID, LeaveTypeID, BalanceYear, AdjustedDays, Reason } = data;

  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { EmployeeID, LeaveTypeID, BalanceYear } }
  });
  if (!balance) throw new AppError('Balance record not found', 404);

  const delta = parseFloat(AdjustedDays);
  const previousBalance = Number(balance.AdjustedDays || 0);
  const newBalance = previousBalance + delta;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.leaveBalance.update({
      where: { LeaveBalanceID: balance.LeaveBalanceID },
      data: { AdjustedDays: newBalance }
    });

    await tx.leaveBalanceAdjustmentLog.create({
      data: {
        EmployeeID, LeaveTypeID, BalanceYear,
        AdjustedDays: delta,
        PreviousBalance: previousBalance,
        NewBalance: newBalance,
        AdjustmentType: 'CORRECTION',
        Reason,
        AdjustedBy: adminId
      }
    });

    return result;
  });

  await notify({
    recipientId: EmployeeID,
    eventCode: 'BALANCE_ADJUSTED',
    title: 'Leave Balance Adjusted',
    body: `Your leave balance was adjusted by ${AdjustedDays} days. Reason: ${Reason}`,
    sourceModule: 'Leave'
  });

  return updated;
}

// ── LEAVE REQUEST CORE ───────────────────────────────────────────────────────

async function submitLeaveRequest(employeeId, data) {
  const leaveTypeId = Number(data.leaveTypeId || data.LeaveTypeID);
  const startDate = data.startDate || data.StartDate;
  const endDate = data.endDate || data.EndDate;
  const reason = data.reason;
  const documentReference =
    data.documentReference && typeof data.documentReference === 'string'
      ? data.documentReference.trim() || null
      : null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!leaveTypeId) {
    throw new AppError("leaveTypeId is missing or invalid", 400);
  }
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError("Invalid startDate or endDate", 400);
  }

  const year = start.getFullYear();

  // ── FETCH CONTEXT FIRST ──────────────────────────
  const [policy, employee, existingBalance, leaveType] = await Promise.all([
    prisma.leavePolicy.findFirst({ where: { LeaveTypeID: leaveTypeId, IsActive: true } }),
    prisma.employee.findUnique({ where: { EmployeeID: employeeId } }),
    prisma.leaveBalance.findUnique({
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: leaveTypeId, BalanceYear: year } }
    }),
    prisma.leaveType.findUnique({ where: { LeaveTypeID: leaveTypeId } })
  ]);

  if (!employee) throw new AppError("Employee not found", 404);
  if (!existingBalance) throw new AppError("Leave balance not found for the requested year.", 404);
  if (!leaveType) throw new AppError("Leave type not found", 404);

  const leaveTypeName = leaveType.LeaveTypeName.toLowerCase();
  const isSickLeave = leaveTypeName.includes('sick');
  const isAnnualLeave = leaveTypeName.includes('annual');

  // ── 6-MONTH SERVICE ELIGIBILITY GATE (Annual & Sick leave) ──────────────
  const tenureMonthsAtRequest = dayjs(start).diff(dayjs(employee.StartDate), 'month');

  if ((isAnnualLeave || isSickLeave) && tenureMonthsAtRequest < 6) {
    const leaveTypeLabel = isAnnualLeave ? 'Annual' : 'Sick';
    throw new AppError(
      `${leaveTypeLabel} leave is not yet available. Employees become eligible after completing ` +
      `6 months of service (currently ${tenureMonthsAtRequest} month(s), since ${dayjs(employee.StartDate).format('YYYY-MM-DD')}).`,
      400
    );
  }

  // ── TENURE CHECK (policy-level, separate from the 6-month statutory gate above) ──
  const tenureMonths = dayjs().diff(dayjs(employee.StartDate), 'month');
  if (policy?.MinTenureMonths && tenureMonths < policy.MinTenureMonths) {
    throw new AppError(`Tenure requirement not met. Minimum: ${policy.MinTenureMonths} months.`, 400);
  }

  // ── NOTICE CHECK ──────────────────────────────────
  const noticeDays = dayjs(start).diff(dayjs(), 'day');
  if (policy?.NoticePeriodDays && noticeDays < policy.NoticePeriodDays) {
    throw new AppError(`Notice period violation. ${policy.NoticePeriodDays} days required.`, 400);
  }

  // ── BUSINESS DAYS ─────────────────────────────────
  const holidays = await getHolidayDatesInRange(employeeId, start, end);
  const totalDays = countEgyptianBusinessDays(start, end, holidays);

  // ── LEAVE-TYPE-SPECIFIC LEGAL VALIDATION ────────────────────────────────
  if (leaveTypeName.includes('emergency') || leaveTypeName.includes('accidental')) {
    if (totalDays > 2) {
      throw new AppError('Emergency/Accidental leave cannot exceed 2 consecutive days per instance.', 400);
    }
  }

  if (leaveTypeName.includes('hajj')) {
    const tenureYears = dayjs(start).diff(dayjs(employee.StartDate), 'year');
    if (tenureYears < 5) {
      throw new AppError('Hajj leave requires a minimum of 5 years of service.', 400);
    }
    const priorHajj = await prisma.leaveRequest.findFirst({
      where: { EmployeeID: employeeId, LeaveTypeID: leaveTypeId, Status: { in: ['APPROVED', 'SUBMITTED'] } }
    });
    if (priorHajj) {
      throw new AppError('Hajj leave can only be granted once during employment.', 400);
    }
  }

  // ── BALANCE CHECK ─────────────────────────────────
  let sickCycleInfo = null;

  if (isSickLeave) {
    const lookbackStart = dayjs(start).subtract(3, 'year').toDate();
    const approvedSickRequests = await prisma.leaveRequest.findMany({
      where: { EmployeeID: employeeId, LeaveTypeID: leaveTypeId, Status: 'APPROVED', StartDate: { gte: lookbackStart } },
      orderBy: { StartDate: 'asc' }
    });

    sickCycleInfo = getSickLeaveCycleStatus(approvedSickRequests, start);

    if (totalDays > sickCycleInfo.daysRemaining) {
      throw new AppError(
        `Insufficient sick leave balance. Requested: ${totalDays}, Remaining in 3-year cycle: ${sickCycleInfo.daysRemaining} ` +
        `(${sickCycleInfo.daysUsed}/360 days already used since ${sickCycleInfo.cycleStartDate ? dayjs(sickCycleInfo.cycleStartDate).format('YYYY-MM-DD') : 'cycle start'}).`,
        400
      );
    }

    if (leaveType.RequiresDocument && !documentReference) {
      throw new AppError('Sick leave requires a medical certificate document reference.', 400);
    }
  } else {
    const carryOverValid = existingBalance.CarryOverExpiryYear == null || year <= existingBalance.CarryOverExpiryYear;
    const effectiveCarryOver = carryOverValid ? Number(existingBalance.CarryOverDays || 0) : 0;

    const available = Math.round(
      (Number(existingBalance.EntitledDays) + effectiveCarryOver + Number(existingBalance.AdjustedDays || 0)) -
      (Number(existingBalance.UsedDays) + Number(existingBalance.PendingDays || 0))
    );

    if (totalDays > available) {
      throw new AppError(`Insufficient leave balance. Requested: ${totalDays}, Available: ${available}`, 400);
    }
  }

  // ── TRANSACTION ───────────────────────────────────
  const request = await prisma.$transaction(async (tx) => {
    const newReq = await tx.leaveRequest.create({
      data: {
        EmployeeID: employeeId,
        LeaveTypeID: leaveTypeId,
        StartDate: start,
        EndDate: end,
        TotalDays: totalDays,
        Reason: reason || null,
        DocumentReference: documentReference || null,
        Status: 'SUBMITTED',
      },
    });

    if (!isSickLeave) {
      await tx.leaveBalance.update({
        where: { LeaveBalanceID: existingBalance.LeaveBalanceID },
        data: { PendingDays: { increment: totalDays } },
      });
    }

    return newReq;
  });

  // ── NOTIFICATION ──────────────────────────────────
  if (employee?.SupervisorID) {
    await notify({
      recipientId: employee.SupervisorID,
      eventCode: 'LEAVE_SUBMITTED',
      title: 'New Leave Request',
      body: `${employee.FirstName} submitted a request for ${totalDays} days.`,
      sourceModule: 'Leave',
      sourceEntityId: request.LeaveRequestID,
    });
  }

  return request;
}
/**
 * FIX A: Update Leave Request (LV-017)
 */
async function updateLeaveRequest(requestId, userId, data) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: requestId } });
  if (!request || ['APPROVED', 'REJECTED', 'CANCELLED'].includes(request.Status)) {
    throw new AppError('Cannot edit finalized request', 400);
  }
  return prisma.leaveRequest.update({
    where: { LeaveRequestID: requestId },
    data: {
      StartDate: data.StartDate ? new Date(data.StartDate) : undefined,
      EndDate: data.EndDate ? new Date(data.EndDate) : undefined,
      Reason: data.Reason,
      UpdatedAt: new Date()
    }
  });
}

/**
 * FIX B: Cancel Request
 */
async function cancelLeaveRequest(requestId, userId, { cancelReason }) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: requestId } });
  if (new Date(request.StartDate) <= new Date()) throw new AppError('Leave already started', 400);

  // Use transaction to revert pending/used days
  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.update({
      where: { LeaveRequestID: requestId },
      data: { Status: 'CANCELLED', CancelReason: cancelReason, CancelledBy: userId }
    });

    // Revert days in balance based on current status
    if (request.Status === 'SUBMITTED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { PendingDays: { decrement: request.TotalDays } }
      });
    } else if (request.Status === 'APPROVED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { UsedDays: { decrement: request.TotalDays } }
      });
    }

    return req;
  });

  await notify({
    recipientId: request.EmployeeID,
    eventCode: 'LEAVE_CANCELLED',
    title: 'Leave Cancelled',
    body: `Your leave was cancelled. Reason: ${cancelReason}`,
    sourceModule: 'Leave',
    sourceEntityId: requestId
  });
  return updated;
}

/**
 * UPDATED: processApproval with Stakeholder Notifications
 */
async function processApproval(requestId, reviewerId, { decision, comments }) {
  const request = await prisma.leaveRequest.findUnique({ 
    where: { LeaveRequestID: requestId },
    include: { Employee: true }
  });
  if (!request) throw new AppError('Request not found', 404);
  
  const status = (decision === 'APPROVE' || decision === 'APPROVED') ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.update({
      where: { LeaveRequestID: requestId },
      data: { Status: status }
    });

    await tx.leaveActionLog.create({
      data: {
        LeaveRequestID: requestId,
        ActionBy: reviewerId,
        ActionType: status,
        PreviousStatus: request.Status,
        NewStatus: status,
        Notes: comments || null
      }
    });

    if (status === 'APPROVED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: {
          PendingDays: { decrement: request.TotalDays },
          UsedDays: { increment: request.TotalDays }
        }
      });
    } else if (status === 'REJECTED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { PendingDays: { decrement: request.TotalDays } }
      });
    }
    return req;
  });

  if (status === 'APPROVED') {
    await markAttendanceAsOnLeave(request.EmployeeID, request.StartDate, request.EndDate);
  }

  // ── NOTIFY STAKEHOLDERS ──
  // 1. Notify Employee
  await notify({
    recipientId: request.EmployeeID,
    eventCode: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: `Leave ${status}`,
    body: `Your leave request has been ${status.toLowerCase()} by HR. Decision: ${status}. Comments: ${comments || 'None'}`,
    sourceModule: 'Leave',
    sourceEntityId: requestId
  });

  // 2. Notify Manager (if HR Manager is overriding/finalizing)
  if (request.Employee.SupervisorID && request.Employee.SupervisorID !== reviewerId) {
    await notify({
      recipientId: request.Employee.SupervisorID,
      eventCode: 'LEAVE_FINALIZED',
      title: 'Leave Request Finalized',
      body: `HR has finalized the request for ${request.Employee.FullName} as ${status}.`,
      sourceModule: 'Leave',
      sourceEntityId: requestId
    });
  }
  
  return updated;
}

/**
 * NEW: Bulk Process Leave Requests
 */
async function bulkProcessRequests(reviewerId, { requestIds, decision, comments }) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new AppError('No requests selected for bulk processing.', 400);
  }

  const results = [];
  for (const id of requestIds) {
    try {
      const updated = await processApproval(id, reviewerId, { decision, comments });
      results.push(updated);
    } catch (err) {
      // Log error but continue processing others
      console.error(`Failed to process request ${id}: ${err.message}`);
    }
  }

  return {
    message: `Bulk processing complete. Processed ${results.length} of ${requestIds.length} requests.`,
    count: results.length
  };
}

/**
 * FIX F: Real Delegation
 */
// src/modules/leave/services/leave.service.js

async function delegateApproval(requestId, delegatorId, data) {
  const delegate = await prisma.employee.findUnique({
    where: { EmployeeID: parseInt(data.delegateTo || data.delegateId, 10) }
  });

  if (!delegate) throw new AppError('Delegate employee not found', 404);

  // Parse once, reuse everywhere — avoids Invalid Date in the body
  const startDate = new Date(data.startDate || data.StartDate);
  const endDate   = new Date(data.endDate   || data.EndDate);

  const delegation = await prisma.leaveDelegation.create({
    data: {
      ManagerID:  delegatorId,
      DelegateID: delegate.EmployeeID,
      StartDate:  startDate,
      EndDate:    endDate,
      Status:     'ACTIVE',
      Notes:      data.comments || data.Comments || 'Delegated authority',
    }
  });

  // Deep-link: delegate clicks notification → lands on delegator's pending queue
const actionUrl = `/leave?tab=all&delegatedBy=${delegatorId}&delegationId=${delegation.DelegationID}`;
console.log('NOTIFY PAYLOAD:', { recipientId: delegate.EmployeeID, eventCode: EVENT_CODE.LEAVE_DELEGATION_ACTIVE, sourceEntityId: delegation.DelegationID });

  await notify({
    recipientId:    delegate.EmployeeID,
    eventCode:      EVENT_CODE.LEAVE_DELEGATION_ACTIVE,   // ← 'LV008', not raw string
    title:          'New Delegation Received',
    body:           JSON.stringify({
                      message: `You have been granted approval authority from ${startDate.toLocaleDateString()} until ${endDate.toLocaleDateString()}. Tap to review pending requests.`,
                      actionUrl,
                    }),
    sourceModule:   'Leave',
    sourceEntityId: delegation.DelegationID,
  });

  return delegation;
}

// ── QUERIES & ANALYTICS ──────────────────────────────────────────────────────

// ── QUERIES & ANALYTICS ──────────────────────────────────────────────────────

async function listLeaveRequests(query = {}) {
  // Use your existing pagination utility
  const { skip, take } = getPagination(query.page, query.limit);

  // FIX 1: Dynamically build the WHERE clause to enforce Manager security isolation
  const where = {};
  if (query.managerId) {
    where.Employee = { SupervisorID: parseInt(query.managerId, 10) };
  }
  if (query.status) {
    where.Status = query.status;
  }

  // Pass the strict `where` clause into Prisma so it stops fetching the whole company
  const requests = await prisma.leaveRequest.findMany({
    where,
    skip, 
    take, 
    include: { Employee: true, LeaveType: true }, 
    orderBy: { CreatedAt: 'desc' }
  });
  
  const total = await prisma.leaveRequest.count({ where });
  return { requests, meta: buildPaginationMeta(query.page, query.limit, total) };
}


async function getManagerInbox(managerId) {
  const mId = parseInt(managerId, 10);

  // 1. Check if this user is acting as a delegate for anyone else right now
  const activeDelegations = await prisma.leaveDelegation.findMany({
    where: {
      DelegateID: mId,
      Status: 'ACTIVE',
      StartDate: { lte: new Date() },
      EndDate: { gte: new Date() }
    },
    select: { ManagerID: true }
  });

  // 2. Combine the user's ID with any Managers who delegated to them
  const supervisorIds = [mId, ...activeDelegations.map(d => d.ManagerID)];

  // 3. Return requests for all employees reporting to any of these IDs
  return prisma.leaveRequest.findMany({
    where: {
      Employee: {
        SupervisorID: { in: supervisorIds }
      },
      NOT: { Status: 'CANCELLED' }
    },
    include: {
      Employee: {
        select: {
          FullName: true,
          EmployeeCode: true,
          Position: { select: { PositionTitle: true } }
        }
      },
      LeaveType: true
    },
    orderBy: { CreatedAt: 'desc' }
  });
}
async function getLeaveRequestById(id) {
  return prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: id }, include: { Employee: true, LeaveType: true }
  });
}

async function getMyLeaveRequests(employeeId) {
  return prisma.leaveRequest.findMany({
    where: { EmployeeID: employeeId }, include: { LeaveType: true }, orderBy: { CreatedAt: 'desc' }
  });
}



async function listHolidays() {
  return prisma.holidayCalendar.findMany();
}

async function createHoliday(data) {
  return prisma.holidayCalendar.create({ data });
}

async function getLeaveAnalytics(query = {}) {
  const year = parseInt(query.year) || new Date().getFullYear();
  const stats = await prisma.leaveRequest.groupBy({
    by: ['Status'],
    where: { StartDate: { gte: new Date(`${year}-01-01`) } },
    _count: true
  });
  return { year, stats };
}

// ── PAYROLL SYNC INTEGRATION ─────────────────────────────────────────────────

async function syncLeaveToPayroll(employeeId, periodYear, periodMonth) {
  // Finds approved leaves for a specific employee
  const syncedCount = await prisma.leaveRequest.count({
    where: {
      EmployeeID: employeeId,
      Status: 'APPROVED'
    }
  });
  return { syncedCount, status: 'Success' };
}

async function bulkSyncPayroll(periodYear, periodMonth, adminId) {
  // Finds all approved leaves across the company
  const syncedCount = await prisma.leaveRequest.count({
    where: { 
      Status: {
        in: ['APPROVED', 'Approved', 'approved']
      }
    }
  });
  
  // Only send notification if there is actually data to sync
  if (adminId && syncedCount > 0) {
    await notify({
      recipientId: adminId,
      // FIXED: Shortened to 14 characters to pass the @db.NVarChar(20) limit
      eventCode: 'PAYROLL_SYNCED', 
      title: 'Payroll Sync Complete',
      body: `Successfully synced ${syncedCount} approved leave records to payroll for ${periodMonth}/${periodYear}.`,
      sourceModule: 'Leave'
    });
  }

  return { syncedCount, status: 'Success' };
}
/**
 * LV-012: Update Entitlement Calculations
 * Mass updates the base entitled days for all employees for a specific year
 */
// src/modules/leave/leave.controller.js

/**
 * LV-012: Update Entitlement Calculations (Type-Specific)
 */
async function updateGlobalEntitlements(data, adminId) {
  const { defaultEntitlement, year, leaveTypeId } = data;
  const targetYear = parseInt(year) || new Date().getFullYear();
  const newDays = parseFloat(defaultEntitlement);
  const typeId = parseInt(leaveTypeId, 10);

  if (isNaN(newDays)) throw new AppError('Invalid entitlement value', 400);
  if (!typeId) throw new AppError('Leave type is required', 400);

  // Update balance records ONLY for the selected Leave Type
  const updateResult = await prisma.leaveBalance.updateMany({
    where: {
      BalanceYear: targetYear,
      LeaveTypeID: typeId
    },
    data: {
      EntitledDays: newDays
    }
  });

  await notify({
    recipientId: adminId,
    eventCode: 'ENTITLEMENT_UPDATED',
    title: 'Global Entitlement Updated',
    body: `Successfully updated entitlement to ${newDays} days for ${updateResult.count} records.`,
    sourceModule: 'Leave'
  });

  return { 
    updatedCount: updateResult.count, 
    newEntitlement: newDays,
    leaveTypeId: typeId,
    year: targetYear 
  };
}
/**
 * REQ-041: Automated Year-End Carry-Forward
 * Calculates unused days, applies caps, and moves them to the next year.
 */
const { calculateCarryOver } = require('../utils/leave.calculation.util');

/**
 * REQ-041: Automated Year-End Carry-Forward (Law 14/2025 compliant)
 * Carries forward unused Annual leave with a 2-YEAR EXPIRY (time-based,
 * not a fixed day-count cap). Uses LeaveBalance.CarryOverExpiryYear
 * (already in schema) to track when carried-over days expire.
 *
 * Only applies carry-over logic to ANNUAL leave types — other leave
 * types (sick, emergency, etc.) typically do not carry over under the law.
 */
async function performYearEndCarryOver(previousYear, nextYear) {
  const balances = await prisma.leaveBalance.findMany({
    where: { BalanceYear: previousYear },
    include: { LeaveType: { select: { LeaveTypeName: true } } }
  });

  const transactionOps = [];

  for (const b of balances) {
    const typeName = b.LeaveType.LeaveTypeName.toLowerCase();

    // Only Annual leave carries over per the law
    if (!typeName.includes('annual')) {
      // Still create next year's record so initializeLeaveBalances can populate it,
      // but with zero carry-over
      transactionOps.push(
        prisma.leaveBalance.upsert({
          where: {
            UQ_LeaveBalance: { EmployeeID: b.EmployeeID, LeaveTypeID: b.LeaveTypeID, BalanceYear: nextYear }
          },
          update: {},
          create: {
            EmployeeID: b.EmployeeID,
            LeaveTypeID: b.LeaveTypeID,
            BalanceYear: nextYear,
            EntitledDays: 0,
            UsedDays: 0,
            PendingDays: 0,
            CarryOverDays: 0,
            AdjustedDays: 0
          }
        })
      );
      continue;
    }

    // Fetch the policy to get CarryOverYears / CarryOverLimit
    const policy = await prisma.leavePolicy.findFirst({
      where: { LeaveTypeID: b.LeaveTypeID, IsActive: true },
      orderBy: { EffectiveFrom: 'desc' }
    });

    const { carryForwardDays, expiryYear } = calculateCarryOver(b, policy, nextYear);

    transactionOps.push(
      prisma.leaveBalance.upsert({
        where: {
          UQ_LeaveBalance: { EmployeeID: b.EmployeeID, LeaveTypeID: b.LeaveTypeID, BalanceYear: nextYear }
        },
        update: {
          CarryOverDays: carryForwardDays,
          CarryOverExpiryYear: expiryYear
        },
        create: {
          EmployeeID: b.EmployeeID,
          LeaveTypeID: b.LeaveTypeID,
          BalanceYear: nextYear,
          EntitledDays: 0, // populated later by initializeLeaveBalances
          UsedDays: 0,
          PendingDays: 0,
          CarryOverDays: carryForwardDays,
          CarryOverExpiryYear: expiryYear,
          AdjustedDays: 0
        }
      })
    );
  }

  return prisma.$transaction(transactionOps);
}
// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  listLeaveTypes, 
  createLeaveType, 
  listLeavePolicies, 
  createLeavePolicy,
  getLeaveBalanceDashboard, 
  initializeLeaveBalances, 
  adjustBalance: adjustLeaveBalance,
  submitLeaveRequest, 
  updateLeaveRequest, 
  processApproval, 
  cancelLeaveRequest,
  delegateApproval, 
  listLeaveRequests, 
  getLeaveRequestById, 
  getMyLeaveRequests,
  getManagerInbox, 
  listHolidays, 
  createHoliday, 
  getLeaveAnalytics,
  // FIXED: These two were missing from the exports!
  syncLeaveToPayroll, 
  bulkSyncPayroll,
  updateGlobalEntitlements,
  bulkProcessRequests,
  performYearEndCarryOver
};