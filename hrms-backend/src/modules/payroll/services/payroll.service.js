const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const { PAYROLL_RUN_STATUS, PAYROLL_ENTRY_STATUS, PAY_TYPE_CATEGORY, PAYROLL_EXCEPTION_STATUS, EVENT_CODE } = require('../../../shared/constants');
const { dayjs } = require('../../../shared/utils/date.util');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// Egyptian Tax Engine
async function calculateAnnualTax(annualTaxableIncome, year) {
  const brackets = await prisma.taxBracket.findMany({ where: { EffectiveYear: year }, orderBy: { BracketOrder: 'asc' } });
  if (!brackets.length) return annualTaxableIncome * 0.15;
  const personalExemption = Number(brackets[0]?.PersonalExemptionEGP || 0);
  const taxableAfterExemption = Math.max(0, annualTaxableIncome - personalExemption);
  let totalTax = 0;
  let remaining = taxableAfterExemption;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const from = Number(bracket.FromAmountEGP);
    const to = bracket.ToAmountEGP !== null ? Number(bracket.ToAmountEGP) : Infinity;
    const rate = Number(bracket.RatePct) / 100;
    const bracketSize = to - from;
    const taxableInBracket = Math.min(remaining, bracketSize);
    totalTax += taxableInBracket * rate;
    remaining -= taxableInBracket;
  }
  return Math.max(0, totalTax);
}

async function getSocialInsuranceConfig() {
  const today = new Date();
  const config = await prisma.socialInsuranceConfig.findFirst({
    where: { EffectiveFrom: { lte: today }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }] },
    orderBy: { EffectiveFrom: 'desc' },
  });
  return { employeeRate: config ? Number(config.EmployeeRatePct) / 100 : 0.0725, employerRate: config ? Number(config.EmployerRatePct) / 100 : 0.1875 };
}

// Config lookups
async function listPayGrades() { return prisma.payGrade.findMany({ where: { IsActive: true }, orderBy: { MinSalary: 'asc' } }); }
async function createPayGrade(data) { return prisma.payGrade.create({ data }); }
async function listPayTypes() { return prisma.payType.findMany({ where: { IsActive: true }, orderBy: { PayTypeName: 'asc' } }); }
async function createPayType(data) { return prisma.payType.create({ data }); }
async function listOvertimeRules() { return prisma.overtimeRule.findMany({ where: { IsActive: true } }); }
async function createOvertimeRule(data) { return prisma.overtimeRule.create({ data }); }
async function listAllowances() { return prisma.allowance.findMany({ where: { IsActive: true }, orderBy: { AllowanceName: 'asc' } }); }
async function listShiftDifferentials() { return prisma.shiftDifferential.findMany({ where: { IsActive: true } }); }

// Payroll Policies
async function listPayrollPolicies() {
  return prisma.payrollPolicy.findMany({ where: { IsActive: true }, include: { OvertimeRule: true, ApprovedByEmp: { select: { FullName: true } } }, orderBy: { CreatedAt: 'desc' } });
}
async function createPayrollPolicy(data, createdById) {
  return prisma.payrollPolicy.create({ data: { ...data, ApprovedBy: createdById, ApprovedAt: new Date() }, include: { OvertimeRule: true } });
}
// Add this to payroll.service.js
async function getEmployeeActiveDays(employeeId, periodStart, periodEnd) {
  const employee = await prisma.employee.findUnique({ 
    where: { EmployeeID: employeeId },
    select: { HireDate: true, TerminationDate: true }
  });

  if (!employee) {
    throw new AppError(`Employee ${employeeId} not found`, 404);
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const hired = employee.HireDate ? new Date(employee.HireDate) : start;
  const terminated = employee.TerminationDate ? new Date(employee.TerminationDate) : null;

  let actualStart = hired > start ? hired : start;
  let actualEnd = (terminated && terminated < end) ? terminated : end;

  // If hired after the period, or terminated before it
  if (actualStart > end || actualEnd < start) {
    return { activeDays: 0, isActive: false };
  }

  const diffTime = Math.abs(actualEnd - actualStart);
  const activeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return { 
    activeDays, 
    isActive: true, 
    hireDate: employee.HireDate, 
    terminationDate: employee.TerminationDate 
  };
}

// Don't forget to export it at the bottom:
// getEmployeeActiveDays

// Payroll Runs
async function listPayrollRuns(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.status) where.Status = query.status;
  if (query.year) where.PeriodYear = parseInt(query.year, 10);
  if (query.policyId) where.PolicyID = parseInt(query.policyId, 10);
  const [runs, total] = await Promise.all([
    prisma.payrollRun.findMany({ where, skip, take: limit, orderBy: { CreatedAt: 'desc' },
      include: { Policy: true, Processor: { select: { FullName: true } }, Approver: { select: { FullName: true } },
        _count: { select: { Entries: true } } } }),
    prisma.payrollRun.count({ where }),
  ]);
  return { runs, meta: buildPaginationMeta(total, page, limit) };
}

async function getPayrollRunById(runId) {
  const run = await prisma.payrollRun.findUnique({
    where: { PayrollRunID: runId },
    include: { Policy: { include: { OvertimeRule: true } }, Processor: { select: { FullName: true } }, Approver: { select: { FullName: true } },
      Entries: { include: { Employee: { select: { FullName: true, EmployeeCode: true } }, Lines: { include: { PayType: true } }, Payslip: true } },
      Exceptions: { include: { Employee: { select: { FullName: true } } } } },
  });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  return run;
}

async function createPayrollRun(data, createdById) {
  const policy = await prisma.payrollPolicy.findUnique({ where: { PolicyID: data.PolicyID } });
  if (!policy) throw new AppError('Payroll policy not found.', 404, 'NOT_FOUND');
  const existing = await prisma.payrollRun.findFirst({ where: { PolicyID: data.PolicyID, PeriodYear: data.PeriodYear, PeriodMonth: data.PeriodMonth } });
  if (existing) throw new AppError('Payroll run already exists for this period.', 409, 'DUPLICATE_ENTRY');
  return prisma.payrollRun.create({
    data: { PolicyID: data.PolicyID, PeriodYear: data.PeriodYear, PeriodMonth: data.PeriodMonth,
      PeriodStartDate: new Date(data.PeriodStartDate), PeriodEndDate: new Date(data.PeriodEndDate),
      CutoffDate: new Date(data.CutoffDate), PaymentDate: new Date(data.PaymentDate),
      Status: PAYROLL_RUN_STATUS.DRAFT, ProcessedBy: createdById },
    include: { Policy: true },
  });
}

async function ensurePayTypes() {
  const defs = [
    { code: 'BASE_SALARY', name: 'Base Salary', cat: PAY_TYPE_CATEGORY.EARNING, key: 'baseSalary' },
    { code: 'ALLOWANCE', name: 'Allowance', cat: PAY_TYPE_CATEGORY.EARNING, key: 'allowance' },
    { code: 'OVERTIME', name: 'Overtime Pay', cat: PAY_TYPE_CATEGORY.EARNING, key: 'overtime' },
    { code: 'ABSENCE_DED', name: 'Absence Deduction', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'absenceDeduction' },
    { code: 'SOCIAL_INS', name: 'Social Insurance', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'socialInsurance' },
    { code: 'INCOME_TAX', name: 'Income Tax', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'incomeTax' },
  ];
  const result = {};
  for (const d of defs) {
    const existing = await prisma.payType.findUnique({ where: { PayTypeCode: d.code } });
    const pt = existing || await prisma.payType.create({ data: { PayTypeCode: d.code, PayTypeName: d.name, Category: d.cat, IsRecurring: true, IsTaxable: false, IsInsurable: false } });
    result[d.key] = pt.PayTypeID;
  }
  return result;
}

async function createOrUpdateException(runId, employeeId, exceptionType, description) {
  const existing = await prisma.payrollException.findFirst({ where: { PayrollRunID: runId, EmployeeID: employeeId, ExceptionType: exceptionType, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  if (existing) return existing;
  const safeDescription = description ? description.substring(0, 250) : 'Unknown error';
  return prisma.payrollException.create({ data: { PayrollRunID: runId, EmployeeID: employeeId, ExceptionType: exceptionType, Description: safeDescription, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
}

async function processPayrollRun(runId, opts, processedById) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId }, include: { Policy: { include: { OvertimeRule: true } } } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.DRAFT, PAYROLL_RUN_STATUS.PROCESSING].includes(run.Status)) throw new AppError('Cannot process run in current status.', 400, 'INVALID_STATUS');
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.PROCESSING } });

  const empWhere = { IsActive: true, CurrentStatus: { not: 'Terminated' } };
  if (opts?.includeEmployeeIds?.length) empWhere.EmployeeID = { in: opts.includeEmployeeIds };
  const employees = await prisma.employee.findMany({ where: empWhere, select: { EmployeeID: true, FullName: true, EmployeeCode: true } });

  const siConfig = await getSocialInsuranceConfig();
  const workingDaysInMonth = 26;
  let totalGross = 0, totalNet = 0, processedCount = 0;
  const payTypes = await ensurePayTypes();

  for (const emp of employees) {
    try {
      const salaryRecord = await prisma.employeeSalary.findFirst({
        where: { EmployeeID: emp.EmployeeID, EffectiveFrom: { lte: run.PeriodEndDate }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: run.PeriodStartDate } }] },
        orderBy: { EffectiveFrom: 'desc' },
      });
      if (!salaryRecord) { await createOrUpdateException(runId, emp.EmployeeID, 'MissingSalary', 'No active salary record.'); continue; }
// REPLACE the entire calculation block inside the for (const emp of employees) loop
// starting from "const baseSalary = Number(salaryRecord.BaseSalary);"
// to "const netPay = grossEarnings - employeeSI - monthlyTax;"

const baseSalary = Number(salaryRecord.BaseSalary);

// ── Salary spike detection ──
const previousSalary = await prisma.employeeSalary.findFirst({
  where: { EmployeeID: emp.EmployeeID, EffectiveTo: { lt: run.PeriodStartDate } },
  orderBy: { EffectiveTo: 'desc' },
});
if (previousSalary) {
  const prevBase = Number(previousSalary.BaseSalary);
  if (prevBase > 0 && (baseSalary - prevBase) / prevBase > 0.30) {
    await createOrUpdateException(runId, emp.EmployeeID, 'SalarySpike',
      `Salary increased by ${(((baseSalary - prevBase) / prevBase) * 100).toFixed(1)}% vs previous period.`
    );
  }
}

// ── Working days from policy (not hardcoded) ──
const workingDaysInMonth = Number(run.Policy.WorkingDaysInMonth) || 22;
const hoursPerDay        = Number(run.Policy.WorkingHoursPerDay) || 8;
const dailyRate          = baseSalary / workingDaysInMonth;
const hourlyRate         = dailyRate / hoursPerDay;

// ── Allowances ──
const allowances = await prisma.employeeAllowance.findMany({
  where: { EmployeeID: emp.EmployeeID, EffectiveFrom: { lte: run.PeriodEndDate }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: run.PeriodStartDate } }] },
  include: { Allowance: true },
});

// ── Attendance summary (must exist) ──
const attSummary = await prisma.attendanceSummary.findUnique({
  where: { UQ_AttSummary_EmpPeriod: { EmployeeID: emp.EmployeeID, PeriodYear: run.PeriodYear, PeriodMonth: run.PeriodMonth } },
});
if (!attSummary) { await createOrUpdateException(runId, emp.EmployeeID, 'MissingAttendance', 'No attendance summary. Generate summary first.'); continue; }

// ── Absence deduction — per Egyptian Labor Law, no cap ──
// AbsentDays from attendance summary already excludes weekends and holidays
const absentDays       = Number(attSummary.AbsentDays || 0);
const absenceDeduction = parseFloat((absentDays * dailyRate).toFixed(2));

// ── Lateness deduction ──
const latenessMins       = Number(attSummary.TotalLatenessMins || 0);
const latenessDeduction  = parseFloat(((latenessMins / 60) * hourlyRate).toFixed(2));

// ── Unpaid leave deduction (cross-reference LeaveRequest directly) ──
const unpaidLeave = await prisma.leaveRequest.findMany({
  where: {
    EmployeeID: emp.EmployeeID,
    Status: 'Approved',
    StartDate: { lte: run.PeriodEndDate },
    EndDate:   { gte: run.PeriodStartDate },
    LeaveType: { IsPaid: false },
  },
  select: { TotalDays: true },
});
const unpaidDays           = unpaidLeave.reduce((s, r) => s + Number(r.TotalDays), 0);
const unpaidLeaveDeduction = parseFloat((unpaidDays * dailyRate).toFixed(2));

// ── Overtime ──
const overtimeHours = Number(attSummary.TotalOvertimeHrs || 0);
let overtimePay = 0;
if (overtimeHours > 0 && run.Policy.OvertimeRule) {
  overtimePay = parseFloat((overtimeHours * hourlyRate * Number(run.Policy.OvertimeRule.Multiplier)).toFixed(2));
}

// ── Allowances total (with Egyptian tax exemption rules) ──
let taxableAllowances = 0;
let exemptAllowances  = 0;
const allowanceLines  = [];

allowances.forEach((ea) => {
  const amount = ea.OverrideAmount !== null ? Number(ea.OverrideAmount) : Number(ea.Allowance.Amount);
  const name   = ea.Allowance.AllowanceName.toLowerCase();
  let exemptPortion = 0;

  // Per Income Tax Law No. 91/2005, Art. 13 exemptions
  if (name.includes('social') || name.includes('labor day') || name.includes('work nature') || name.includes('special')) {
    exemptPortion = amount;
  } else if (name.includes('transportation')) {
    exemptPortion = Math.min(amount, 300); // EGP 300/month cap per law
  }

  taxableAllowances += (amount - exemptPortion);
  exemptAllowances  += exemptPortion;
  allowanceLines.push({ name: ea.Allowance.AllowanceName, amount });
});

const totalAllowances = taxableAllowances + exemptAllowances;

// ── Reimbursements ──
const approvedClaims = await prisma.reimbursementClaim.findMany({
  where: { EmployeeID: emp.EmployeeID, Status: 'Approved' },
});
const claimsTotal = approvedClaims.reduce((s, c) => s + Number(c.Amount), 0);

// ── GROSS INCOME ──
// Per Egyptian Labor Law: Gross = Base + Allowances + Overtime + Claims - Absences - Lateness - UnpaidLeave
const grossEarnings = parseFloat((
  baseSalary
  + totalAllowances
  + overtimePay
  + claimsTotal
  - absenceDeduction
  - latenessDeduction
  - unpaidLeaveDeduction
).toFixed(2));

// ── SOCIAL INSURANCE — Law 148/2019 ──
// SI is calculated on BASE SALARY only (not gross), capped at max subscription wage
// Employee: 7.25%, Employer: 18.75% — total 26%
const siMaxCap   = 12600; // EGP per month statutory cap (update annually)
const siWage     = Math.min(baseSalary, siMaxCap);
const employeeSI = parseFloat((siWage * siConfig.employeeRate).toFixed(2));
const employerSI = parseFloat((siWage * siConfig.employerRate).toFixed(2));

// ── INCOME TAX — Law 91/2005, amended 2024 ──
// Taxable base = Gross - Employee SI - Tax-exempt allowances - Personal exemption (via brackets)
// Personal exemption (EGP 20,000/year) is stored in TaxBracket.PersonalExemptionEGP
const taxableMonthlyBase = Math.max(0,
  baseSalary
  + taxableAllowances   // only taxable portion of allowances
  + overtimePay
  - absenceDeduction
  - latenessDeduction
  - unpaidLeaveDeduction
  - employeeSI          // SI is tax-deductible per law
);

const annualTaxableIncome = taxableMonthlyBase * 12;
const annualTax           = await calculateAnnualTax(annualTaxableIncome, run.PeriodYear);
const monthlyTax          = parseFloat((annualTax / 12).toFixed(2));

// ── NET PAY ──
const netPay = parseFloat(Math.max(0,
  grossEarnings - employeeSI - monthlyTax
).toFixed(2));

      if (netPay < Number(run.Policy.MinimumWageEGP)) await createOrUpdateException(runId, emp.EmployeeID, 'BelowMinimumWage', `Net pay ${netPay.toFixed(2)} < minimum wage.`);
      // Find this section in processPayrollRun and add:

 const lines = [{ PayTypeID: payTypes.baseSalary, Description: 'Base Salary', Amount: baseSalary, Quantity: 1, SourceModule: 'Payroll' }];
// Update Gross Earnings calculation:


// Add Line items for the payslip transparency:
approvedClaims.forEach(c => {
  lines.push({
    PayTypeID: payTypes.allowance, // Or a specific CLAIM type
    Description: `Reimbursement: ${c.Category}`,
    Amount: Number(c.Amount),
    Quantity: 1,
    SourceModule: 'Expense'
  });
});
      const existingEntry = await prisma.payrollEntry.findUnique({ where: { UQ_PayrollEntry: { PayrollRunID: runId, EmployeeID: emp.EmployeeID } } });
      let entry;
      const entryData = {
  AttendanceSummaryID:      attSummary.SummaryID,
  BaseSalary:               baseSalary,
  TotalEarnings:            grossEarnings,
  TotalDeductions:          parseFloat((absenceDeduction + latenessDeduction + unpaidLeaveDeduction + employeeSI + monthlyTax).toFixed(2)),
  TaxAmount:                monthlyTax,
  UnpaidLeaveDeduction:     parseFloat((absenceDeduction + latenessDeduction + unpaidLeaveDeduction).toFixed(2)),
  OvertimePay:              overtimePay,
  SocialInsuranceWage:      siWage,
  EmployeeSocialInsurance:  employeeSI,
  EmployerSocialInsurance:  employerSI,
  NetPay:                   netPay,
  Status:                   PAYROLL_ENTRY_STATUS.DRAFT,
};
      if (existingEntry) { entry = await prisma.payrollEntry.update({ where: { EntryID: existingEntry.EntryID }, data: entryData }); }
      else { entry = await prisma.payrollEntry.create({ data: { PayrollRunID: runId, EmployeeID: emp.EmployeeID, ...entryData } }); }

      await prisma.payrollEntryLine.deleteMany({ where: { EntryID: entry.EntryID } });
     
      allowances.forEach((ea) => lines.push({ PayTypeID: payTypes.allowance, Description: ea.Allowance.AllowanceName, Amount: ea.OverrideAmount !== null ? Number(ea.OverrideAmount) : Number(ea.Allowance.Amount), Quantity: 1, SourceModule: 'Payroll' }));
      if (overtimePay > 0) lines.push({ PayTypeID: payTypes.overtime, Description: `Overtime (${overtimeHours}h)`, Amount: overtimePay, Quantity: overtimeHours, SourceModule: 'Attendance' });
     if (absenceDeduction > 0) lines.push({
  PayTypeID: payTypes.absenceDeduction,
  Description: `Absence Deduction (${absentDays}d × EGP ${dailyRate.toFixed(2)}/day)`,
  Amount: -absenceDeduction,
  Quantity: absentDays,
  SourceModule: 'Attendance'
});
if (latenessDeduction > 0) lines.push({
  PayTypeID: payTypes.absenceDeduction,
  Description: `Lateness Deduction (${latenessMins}min × EGP ${hourlyRate.toFixed(2)}/hr)`,
  Amount: -latenessDeduction,
  Quantity: 1,
  SourceModule: 'Attendance'
});
if (unpaidLeaveDeduction > 0) lines.push({
  PayTypeID: payTypes.absenceDeduction,
  Description: `Unpaid Leave Deduction (${unpaidDays}d × EGP ${dailyRate.toFixed(2)}/day)`,
  Amount: -unpaidLeaveDeduction,
  Quantity: unpaidDays,
  SourceModule: 'Leave'
});
      if (employeeSI > 0) lines.push({ PayTypeID: payTypes.socialInsurance, Description: `Social Insurance (${(siConfig.employeeRate*100).toFixed(2)}%)`, Amount: -employeeSI, Quantity: 1, SourceModule: 'Payroll' });
      if (monthlyTax > 0) lines.push({ PayTypeID: payTypes.incomeTax, Description: 'Income Tax (Progressive)', Amount: -monthlyTax, Quantity: 1, SourceModule: 'Payroll' });
      await prisma.payrollEntryLine.createMany({ data: lines.map((l) => ({ ...l, EntryID: entry.EntryID })) });

      totalGross += grossEarnings; totalNet += netPay; processedCount++;
    } catch (err) {
      await createOrUpdateException(runId, emp.EmployeeID, 'ProcessingError', `Error: ${err.message}`);
    }
  }

  const openExceptions = await prisma.payrollException.count({ where: { PayrollRunID: runId, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  const newStatus = openExceptions > 0 ? PAYROLL_RUN_STATUS.PROCESSING : PAYROLL_RUN_STATUS.PENDING_APPROVAL;
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: newStatus, TotalGrossAmount: totalGross, TotalNetAmount: totalNet, TotalEmployees: processedCount, ProcessedBy: processedById } });
  return { runId, status: newStatus, processedCount, totalGross: parseFloat(totalGross.toFixed(2)), totalNet: parseFloat(totalNet.toFixed(2)), openExceptions };
}

async function approvePayrollRun(runId, approverId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (run.Status !== PAYROLL_RUN_STATUS.PENDING_APPROVAL) throw new AppError('Run must be PendingApproval.', 400, 'INVALID_STATUS');
  const openExc = await prisma.payrollException.count({ where: { PayrollRunID: runId, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  if (openExc > 0) throw new AppError(`${openExc} open exceptions must be resolved first.`, 400, 'OPEN_EXCEPTIONS');
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.APPROVED, ApprovedBy: approverId } });
  return { status: PAYROLL_RUN_STATUS.APPROVED };
}

async function finalizePayrollRun(runId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (run.Status !== PAYROLL_RUN_STATUS.APPROVED) throw new AppError('Run must be Approved before finalizing.', 400, 'INVALID_STATUS');
  await prisma.payrollEntry.updateMany({ where: { PayrollRunID: runId, Status: PAYROLL_ENTRY_STATUS.DRAFT }, data: { Status: PAYROLL_ENTRY_STATUS.FINALIZED } });
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.FINALIZED, FinalizedAt: new Date() } });
  return { status: PAYROLL_RUN_STATUS.FINALIZED };
}

async function generatePayslips(runId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID].includes(run.Status)) throw new AppError('Run must be Finalized.', 400, 'INVALID_STATUS');
  const entries = await prisma.payrollEntry.findMany({ where: { PayrollRunID: runId, Status: { in: [PAYROLL_ENTRY_STATUS.FINALIZED, PAYROLL_ENTRY_STATUS.PAID] }, PayslipGenerated: false }, include: { Employee: { select: { EmployeeCode: true } } } });
  const created = [];
  for (const entry of entries) {
    const payslipNumber = `PS-${run.PeriodYear}${String(run.PeriodMonth).padStart(2, '0')}-${entry.Employee.EmployeeCode}`;
    const existing = await prisma.payslip.findFirst({ where: { EntryID: entry.EntryID } });
    if (existing) continue;
    const ps = await prisma.payslip.create({ data: { EntryID: entry.EntryID, EmployeeID: entry.EmployeeID, PayrollRunID: runId, PayslipNumber: payslipNumber, IssueDate: run.PaymentDate } });
    await prisma.payrollEntry.update({ where: { EntryID: entry.EntryID }, data: { PayslipGenerated: true } });
    await notify({ recipientId: entry.EmployeeID, eventCode: EVENT_CODE.PAY_PAYSLIP_READY, title: 'Payslip Available', body: `Payslip for ${run.PeriodYear}-${String(run.PeriodMonth).padStart(2,'0')} ready.`, sourceModule: 'Payroll', sourceEntityId: ps.PayslipID });
    created.push(ps);
  }
  return { generated: created.length };
}

async function getMyPayslips(employeeId, query) {
  const { page, limit, skip } = getPagination(query);
  const [payslips, total] = await Promise.all([
    prisma.payslip.findMany({ where: { EmployeeID: employeeId }, skip, take: limit, orderBy: { IssueDate: 'desc' },
      include: {
        PayrollRun: { select: { PeriodYear: true, PeriodMonth: true, PaymentDate: true } },
        Entry: {
          select: {
            Status: true,
            BaseSalary: true,
            TotalEarnings: true,
            TotalDeductions: true,
            TaxAmount: true,
            OvertimePay: true,
            EmployeeSocialInsurance: true,
            UnpaidLeaveDeduction: true,
            NetPay: true,
            Lines: { include: { PayType: true } }
          }
        }
      }
    }),
    prisma.payslip.count({ where: { EmployeeID: employeeId } }),
  ]);
  await prisma.payslip.updateMany({ where: { EmployeeID: employeeId, IsViewedByEmployee: false }, data: { IsViewedByEmployee: true } });
  return { payslips, meta: buildPaginationMeta(total, page, limit) };
}

async function getPayslipById(payslipId, requesterId, requesterRole) {
  const payslip = await prisma.payslip.findUnique({ where: { PayslipID: payslipId },
    include: { Employee: { select: { FullName: true, EmployeeCode: true, Position: { select: { PositionTitle: true } }, Department: { select: { DepartmentName: true } } } },
      PayrollRun: { select: { PeriodYear: true, PeriodMonth: true, PaymentDate: true } },
      Entry: { include: { Lines: { include: { PayType: true }, orderBy: { Amount: 'desc' } }, AttendanceSummary: true } } } });
  if (!payslip) throw new AppError('Payslip not found.', 404, 'NOT_FOUND');
  const privileged = ['HR', 'Payroll', 'Admin'];
  if (!privileged.includes(requesterRole) && payslip.EmployeeID !== requesterId) throw new AppError('You can only view your own payslips.', 403, 'FORBIDDEN');
  return payslip;
}

async function listExceptions(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.runId) where.PayrollRunID = parseInt(query.runId, 10);
  if (query.status) where.Status = query.status;
  if (query.employeeId) where.EmployeeID = parseInt(query.employeeId, 10);
  const [exceptions, total] = await Promise.all([
    prisma.payrollException.findMany({ where, skip, take: limit, orderBy: { CreatedAt: 'desc' }, include: { Employee: { select: { FullName: true, EmployeeCode: true } }, Resolver: { select: { FullName: true } } } }),
    prisma.payrollException.count({ where }),
  ]);
  return { exceptions, meta: buildPaginationMeta(total, page, limit) };
}

async function resolveException(exceptionId, resolverId, data) {
  const exc = await prisma.payrollException.findUnique({ where: { ExceptionID: exceptionId } });
  if (!exc) throw new AppError('Exception not found.', 404, 'NOT_FOUND');
  if (exc.Status !== PAYROLL_EXCEPTION_STATUS.OPEN) throw new AppError('Exception is not open.', 400, 'ALREADY_RESOLVED');
  return prisma.payrollException.update({ where: { ExceptionID: exceptionId }, data: { Status: data.resolution, ResolvedBy: resolverId, ResolvedAt: new Date(), ResolutionNotes: data.ResolutionNotes } });
}

async function generateBankFile(runId, generatedById, data) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId }, include: { Entries: true } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID].includes(run.Status)) throw new AppError('Run must be Finalized.', 400, 'INVALID_STATUS');
  const eligible = run.Entries.filter((e) => e.Status !== PAYROLL_ENTRY_STATUS.EXCEPTION);
  const totalAmount = eligible.reduce((s, e) => s + Number(e.NetPay), 0);
  const bf = await prisma.bankFile.create({ data: { PayrollRunID: runId, GeneratedBy: generatedById, FileFormat: data.FileFormat, TotalAmount: totalAmount, TransactionCount: eligible.length, FileURL: `/bank-files/run-${runId}-${Date.now()}.${data.FileFormat.toLowerCase()}`, Status: 'Generated' } });
  return { bankFileId: bf.BankFileID, fileUrl: bf.FileURL, totalAmount, transactionCount: eligible.length };
}

async function getPayrollDashboard() {
  const [totalRuns, activeExceptions, latestRun] = await Promise.all([
    prisma.payrollRun.count(),
    prisma.payrollException.count({ where: { Status: PAYROLL_EXCEPTION_STATUS.OPEN } }),
    prisma.payrollRun.findFirst({ where: { Status: { in: [PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID] } }, orderBy: { FinalizedAt: 'desc' }, select: { TotalNetAmount: true, TotalEmployees: true } }),
  ]);
  const recentRuns = await prisma.payrollRun.findMany({ take: 5, orderBy: { CreatedAt: 'desc' }, select: { PayrollRunID: true, PeriodYear: true, PeriodMonth: true, Status: true, CreatedAt: true, Processor: { select: { FullName: true } } } });
  return {
    totalPayrollRuns: totalRuns, activeExceptions,
    totalPayrollValue: latestRun ? Number(latestRun.TotalNetAmount) : 0,
    totalEmployees: latestRun ? latestRun.TotalEmployees : 0,
    recentActivity: recentRuns.map((r) => ({ type: 'PayrollRun', description: `${r.Status} — ${r.PeriodYear}-${String(r.PeriodMonth).padStart(2,'0')}`, by: r.Processor?.FullName || 'System', at: r.CreatedAt })),
  };
}


async function listReimbursements(query) {
  const where = {};
  if (query.employeeId) where.EmployeeID = parseInt(query.employeeId, 10);
  if (query.status) where.Status = query.status;
  return prisma.reimbursementClaim.findMany({
    where,
    include: { Employee: { select: { FullName: true } } },
    orderBy: { CreatedAt: 'desc' }
  });
}

async function submitReimbursement(employeeId, data) {
  const amount = parseFloat(data.amount);
  if (isNaN(amount)) throw new AppError("Invalid amount provided", 400);
  return prisma.reimbursementClaim.create({
    data: {
      EmployeeID: parseInt(employeeId, 10),
      Category: data.type || "Other",
      Amount: amount,
      Justification: data.reason || "",
      Status: "Pending"
    }
  });
}
async function resolveReimbursement(claimId, resolverId, data) {
  return prisma.reimbursementClaim.update({
    where: { ClaimID: claimId },
    data: { Status: data.status } // Expects 'Approved' or 'Rejected'
  });
}
async function updateEntryPaymentStatus(entryId, status, updatedById) {
  const validStatuses = ['Draft', 'Finalized', 'Paid', 'Failed', 'Exception'];
  if (!validStatuses.includes(status)) {
    throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
  }
  const entry = await prisma.payrollEntry.findUnique({ where: { EntryID: entryId } });
  if (!entry) throw new AppError('Payroll entry not found.', 404, 'NOT_FOUND');
  return prisma.payrollEntry.update({
    where: { EntryID: entryId },
    data: { Status: status, UpdatedAt: new Date() },
  });
}
async function submitPayrollDispute(employeeId, data) {
  const payslip = await prisma.payslip.findUnique({
    where: { PayslipID: data.PayslipID },
    include: { Entry: true }
  });
  if (!payslip) throw new AppError('Payslip not found.', 404, 'NOT_FOUND');
  if (payslip.EmployeeID !== employeeId) throw new AppError('You can only dispute your own payslips.', 403, 'FORBIDDEN');

  return prisma.payrollException.create({
    data: {
      PayrollRunID: payslip.PayrollRunID,
      EmployeeID: employeeId,
      ExceptionType: 'EmployeeDispute',
      Description: `[DISPUTE] ${data.DisputeType}: ${data.Reason}`.substring(0, 250),
      Status: 'Open',
    }
  });
}

async function listMyDisputes(employeeId) {
  return prisma.payrollException.findMany({
    where: { EmployeeID: employeeId, ExceptionType: 'EmployeeDispute' },
    orderBy: { CreatedAt: 'desc' },
    include: { PayrollRun: { select: { PeriodYear: true, PeriodMonth: true } } }
  });
}
async function getDepartmentPayrollReport(runId) {
  const entries = await prisma.payrollEntry.findMany({
    where: { PayrollRunID: runId },
    include: {
      Employee: {
        select: { Department: { select: { DepartmentName: true } } }
      }
    }
  });

  const deptMap = {};
  for (const entry of entries) {
    const deptName = entry.Employee?.Department?.DepartmentName || 'Unassigned';
    if (!deptMap[deptName]) {
      deptMap[deptName] = { departmentName: deptName, employeeCount: 0, totalGross: 0, totalDeductions: 0, totalTax: 0, totalSI: 0, totalNetPay: 0 };
    }
    const d = deptMap[deptName];
    d.employeeCount++;
    d.totalGross       += Number(entry.TotalEarnings || 0);
    d.totalDeductions  += Number(entry.TotalDeductions || 0);
    d.totalTax         += Number(entry.TaxAmount || 0);
    d.totalSI          += Number(entry.EmployeeSocialInsurance || 0);
    d.totalNetPay      += Number(entry.NetPay || 0);
  }

  return Object.values(deptMap).map(d => ({
    ...d,
    totalGross:      parseFloat(d.totalGross.toFixed(2)),
    totalDeductions: parseFloat(d.totalDeductions.toFixed(2)),
    totalTax:        parseFloat(d.totalTax.toFixed(2)),
    totalSI:         parseFloat(d.totalSI.toFixed(2)),
    totalNetPay:     parseFloat(d.totalNetPay.toFixed(2)),
    avgNetPay:       parseFloat((d.totalNetPay / d.employeeCount).toFixed(2)),
  })).sort((a, b) => b.totalNetPay - a.totalNetPay);
}
async function listTaxBrackets() {
  return prisma.taxBracket.findMany({ orderBy: [{ EffectiveYear: 'desc' }, { BracketOrder: 'asc' }] });
}
async function createTaxBracket(data) {
  return prisma.taxBracket.create({ data: {
    EffectiveYear: parseInt(data.EffectiveYear),
    BracketOrder: parseInt(data.BracketOrder),
    FromAmountEGP: parseFloat(data.FromAmountEGP),
    ToAmountEGP: data.ToAmountEGP ? parseFloat(data.ToAmountEGP) : null,
    RatePct: parseFloat(data.RatePct),
    PersonalExemptionEGP: parseFloat(data.PersonalExemptionEGP || 0),
  }});
}
async function getCurrentSocialInsuranceConfig() {
  const today = new Date();
  return prisma.socialInsuranceConfig.findFirst({
    where: { EffectiveFrom: { lte: today }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }] },
    orderBy: { EffectiveFrom: 'desc' },
  });
}

async function createOrUpdateSocialInsuranceConfig(data) {
  const employeeRate = parseFloat(data.EmployeeRatePct);
  if (isNaN(employeeRate)) throw new AppError('EmployeeRatePct must be a valid number.', 400, 'VALIDATION_ERROR');

  const employerRate = data.EmployerRatePct !== undefined ? parseFloat(data.EmployerRatePct) : 18.75;

  const today = new Date();
  const existing = await prisma.socialInsuranceConfig.findFirst({
    where: { EffectiveFrom: { lte: today }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }] },
    orderBy: { EffectiveFrom: 'desc' },
  });

  if (existing) {
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 1);
    await prisma.socialInsuranceConfig.update({
      where: { ConfigID: existing.ConfigID },
      data: { EffectiveTo: dayBefore },
    });
  }

  return prisma.socialInsuranceConfig.create({
    data: {
      EffectiveFrom: today,
      EffectiveTo: null,
      EmployeeRatePct: employeeRate,
      EmployerRatePct: employerRate,
      // TotalRatePct removed — it's a computed column in SQL Server,
      // the database calculates it automatically. Do not write to it.
      LegalReference: data.LegalReference || 'Law 148/2019',
    },
  });
}
async function overridePayrollRunStatus(runId, status) {
  const validStatuses = ['Draft', 'Processing', 'PendingApproval', 'Approved', 'Finalized', 'Paid'];
  if (!validStatuses.includes(status)) throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  return prisma.payrollRun.update({
    where: { PayrollRunID: runId },
    data: { Status: status },
  });
}
async function validateSalaryAgainstGrade(employeeId, baseSalary) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: { Position: { include: { PayGrade: true } } }
  });

  if (!employee?.Position?.PayGrade) return; // no grade assigned, skip

  const grade    = employee.Position.PayGrade;
  const minSal   = Number(grade.MinSalary);
  const maxSal   = Number(grade.MaxSalary);
  const sal      = Number(baseSalary);

  if (sal > maxSal) {
    throw new AppError(
      `Salary ${sal} exceeds maximum allowed for grade "${grade.GradeName}" (max: ${maxSal}).`,
      400, 'SALARY_ABOVE_GRADE_MAX'
    );
  }
  if (sal < minSal) {
    throw new AppError(
      `Salary ${sal} is below minimum for grade "${grade.GradeName}" (min: ${minSal}).`,
      400, 'SALARY_BELOW_GRADE_MIN'
    );
  }
}
const ExcelJS = require('exceljs');

async function generateSystemBackupWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HCM Payroll System';
  workbook.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  };

  // ── Sheet 1: Payroll Runs ──
  const runsSheet = workbook.addWorksheet('Payroll Runs');
  runsSheet.columns = [
    { header: 'Run ID', key: 'id', width: 10 },
    { header: 'Period', key: 'period', width: 18 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Total Gross (EGP)', key: 'gross', width: 18 },
    { header: 'Total Net (EGP)', key: 'net', width: 18 },
    { header: 'Employees', key: 'emp', width: 12 },
    { header: 'Payment Date', key: 'payDate', width: 16 },
    { header: 'Finalized At', key: 'finalized', width: 18 },
  ];
  runsSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));

  const runs = await prisma.payrollRun.findMany({
    orderBy: { CreatedAt: 'desc' },
    include: { Policy: { select: { PolicyName: true } } },
  });
  runs.forEach((r) => {
    runsSheet.addRow({
      id: r.PayrollRunID,
      period: `${r.PeriodYear}-${String(r.PeriodMonth).padStart(2, '0')}`,
      status: r.Status,
      gross: Number(r.TotalGrossAmount),
      net: Number(r.TotalNetAmount),
      emp: r.TotalEmployees,
      payDate: r.PaymentDate ? r.PaymentDate.toISOString().slice(0, 10) : '',
      finalized: r.FinalizedAt ? r.FinalizedAt.toISOString().slice(0, 10) : '',
    });
  });
  runsSheet.getColumn('gross').numFmt = '#,##0.00';
  runsSheet.getColumn('net').numFmt = '#,##0.00';

  // ── Sheet 2: Payroll Entries (detail) ──
  const entriesSheet = workbook.addWorksheet('Payroll Entries');
  entriesSheet.columns = [
    { header: 'Run ID', key: 'runId', width: 10 },
    { header: 'Employee Code', key: 'empCode', width: 16 },
    { header: 'Employee Name', key: 'empName', width: 24 },
    { header: 'Base Salary', key: 'base', width: 14 },
    { header: 'Total Earnings', key: 'earnings', width: 16 },
    { header: 'Total Deductions', key: 'deductions', width: 16 },
    { header: 'Tax', key: 'tax', width: 12 },
    { header: 'Employee SI', key: 'empSI', width: 14 },
    { header: 'Employer SI', key: 'erSI', width: 14 },
    { header: 'Overtime Pay', key: 'ot', width: 14 },
    { header: 'Net Pay', key: 'net', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
  ];
  entriesSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));

  const entries = await prisma.payrollEntry.findMany({
    include: { Employee: { select: { EmployeeCode: true, FullName: true } } },
    orderBy: { CreatedAt: 'desc' },
    take: 5000, // safety cap
  });
  entries.forEach((e) => {
    entriesSheet.addRow({
      runId: e.PayrollRunID,
      empCode: e.Employee.EmployeeCode,
      empName: e.Employee.FullName,
      base: Number(e.BaseSalary),
      earnings: Number(e.TotalEarnings),
      deductions: Number(e.TotalDeductions),
      tax: Number(e.TaxAmount),
      empSI: Number(e.EmployeeSocialInsurance),
      erSI: Number(e.EmployerSocialInsurance),
      ot: Number(e.OvertimePay),
      net: Number(e.NetPay),
      status: e.Status,
    });
  });
  ['base', 'earnings', 'deductions', 'tax', 'empSI', 'erSI', 'ot', 'net'].forEach((key) => {
    entriesSheet.getColumn(key).numFmt = '#,##0.00';
  });

  // ── Sheet 3: Tax Brackets ──
  const taxSheet = workbook.addWorksheet('Tax Brackets');
  taxSheet.columns = [
    { header: 'Year', key: 'year', width: 10 },
    { header: 'Order', key: 'order', width: 10 },
    { header: 'From (EGP)', key: 'from', width: 16 },
    { header: 'To (EGP)', key: 'to', width: 16 },
    { header: 'Rate %', key: 'rate', width: 10 },
    { header: 'Personal Exemption', key: 'exemption', width: 18 },
  ];
  taxSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  const brackets = await prisma.taxBracket.findMany({ orderBy: [{ EffectiveYear: 'desc' }, { BracketOrder: 'asc' }] });
  brackets.forEach((b) => {
    taxSheet.addRow({
      year: b.EffectiveYear,
      order: b.BracketOrder,
      from: Number(b.FromAmountEGP),
      to: b.ToAmountEGP !== null ? Number(b.ToAmountEGP) : '∞',
      rate: Number(b.RatePct),
      exemption: Number(b.PersonalExemptionEGP),
    });
  });

  // ── Sheet 4: Social Insurance Config ──
  const siSheet = workbook.addWorksheet('Social Insurance');
  siSheet.columns = [
    { header: 'Effective From', key: 'from', width: 16 },
    { header: 'Effective To', key: 'to', width: 16 },
    { header: 'Employee Rate %', key: 'empRate', width: 16 },
    { header: 'Employer Rate %', key: 'erRate', width: 16 },
    { header: 'Total Rate %', key: 'total', width: 14 },
    { header: 'Legal Reference', key: 'ref', width: 24 },
  ];
  siSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  const siConfigs = await prisma.socialInsuranceConfig.findMany({ orderBy: { EffectiveFrom: 'desc' } });
  siConfigs.forEach((c) => {
    siSheet.addRow({
      from: c.EffectiveFrom.toISOString().slice(0, 10),
      to: c.EffectiveTo ? c.EffectiveTo.toISOString().slice(0, 10) : 'Current',
      empRate: Number(c.EmployeeRatePct),
      erRate: Number(c.EmployerRatePct),
      total: c.TotalRatePct ? Number(c.TotalRatePct) : Number(c.EmployeeRatePct) + Number(c.EmployerRatePct),
      ref: c.LegalReference || '',
    });
  });

  // ── Sheet 5: Pay Grades ──
  const gradesSheet = workbook.addWorksheet('Pay Grades');
  gradesSheet.columns = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Min Salary', key: 'min', width: 14 },
    { header: 'Max Salary', key: 'max', width: 14 },
    { header: 'Currency', key: 'cur', width: 10 },
    { header: 'Active', key: 'active', width: 10 },
  ];
  gradesSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  const grades = await prisma.payGrade.findMany({ orderBy: { MinSalary: 'asc' } });
  grades.forEach((g) => {
    gradesSheet.addRow({
      code: g.GradeCode,
      name: g.GradeName,
      min: Number(g.MinSalary),
      max: Number(g.MaxSalary),
      cur: g.CurrencyCode,
      active: g.IsActive ? 'Yes' : 'No',
    });
  });

  // ── Sheet 6: Payroll Policies ──
  const policiesSheet = workbook.addWorksheet('Payroll Policies');
  policiesSheet.columns = [
    { header: 'Policy Name', key: 'name', width: 24 },
    { header: 'Pay Period', key: 'period', width: 14 },
    { header: 'Cutoff Day', key: 'cutoff', width: 12 },
    { header: 'Payment Day', key: 'payDay', width: 12 },
    { header: 'Min Wage (EGP)', key: 'minWage', width: 16 },
    { header: 'Max Deduction Days', key: 'maxDed', width: 18 },
    { header: 'Active', key: 'active', width: 10 },
  ];
  policiesSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  const policies = await prisma.payrollPolicy.findMany({ orderBy: { CreatedAt: 'desc' } });
  policies.forEach((p) => {
    policiesSheet.addRow({
      name: p.PolicyName,
      period: p.PayPeriod,
      cutoff: p.CutoffDay,
      payDay: p.PaymentDay,
      minWage: Number(p.MinimumWageEGP),
      maxDed: p.MaxMonthlyDeductionDays,
      active: p.IsActive ? 'Yes' : 'No',
    });
  });

  // ── Sheet 7: Backup Metadata ──
  const metaSheet = workbook.addWorksheet('Backup Info');
  metaSheet.columns = [{ header: 'Field', key: 'field', width: 24 }, { header: 'Value', key: 'value', width: 40 }];
  metaSheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  metaSheet.addRows([
    { field: 'Backup Generated At', value: new Date().toISOString() },
    { field: 'Total Payroll Runs', value: runs.length },
    { field: 'Total Payroll Entries', value: entries.length },
    { field: 'Total Tax Brackets', value: brackets.length },
    { field: 'System', value: 'HCM Payroll System' },
  ]);

  return workbook;
}

// Ensure resolveReimbursement is in module.exports!
module.exports = {
  listPayGrades,createTaxBracket,validateSalaryAgainstGrade,overridePayrollRunStatus, listTaxBrackets,submitReimbursement,listMyDisputes, submitPayrollDispute,listReimbursements, resolveReimbursement,updateEntryPaymentStatus,
  createPayGrade, listPayTypes,getDepartmentPayrollReport, createPayType, listOvertimeRules, createOvertimeRule,
  listAllowances, listShiftDifferentials, listPayrollPolicies, createPayrollPolicy,generateSystemBackupWorkbook,
  listPayrollRuns, getPayrollRunById, createPayrollRun, processPayrollRun, getCurrentSocialInsuranceConfig,
  createOrUpdateSocialInsuranceConfig,
  approvePayrollRun, finalizePayrollRun, generatePayslips, getMyPayslips, getPayslipById,
  listExceptions, resolveException, generateBankFile, getPayrollDashboard, calculateAnnualTax, getEmployeeActiveDays,
};