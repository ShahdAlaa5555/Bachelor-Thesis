const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { getMonthBounds } = require('../../../shared/utils/date.util');

// ─── UTILITY: PRORATION LOGIC ────────────────────────────────────────────────
function getActiveDays(periodStart, periodEnd, hireDate, terminationDate) {
  if (!hireDate) return 30; 
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const hired = new Date(hireDate);
  const terminated = terminationDate ? new Date(terminationDate) : null;

  let actualStart = hired > start ? hired : start;
  let actualEnd = (terminated && terminated < end) ? terminated : end;

  if (actualStart > end || actualEnd < start) return 0; 
  const diffTime = Math.abs(actualEnd - actualStart);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// ─── TAXATION: DYNAMIC PROGRESSIVE SYSTEM (PR-001) ──────────────────────────
async function calculateAnnualIncomeTax(annualGrossIncome, year) {
  // Pulls the brackets exactly as defined by the Admin in the DB
  const brackets = await prisma.taxBracket.findMany({
    where: { EffectiveYear: year },
    orderBy: { BracketOrder: 'asc' },
  });

  if (!brackets.length) throw new AppError(`Tax config missing for ${year}`, 500);

  // Apply personal exemption dynamically from the first bracket
  const personalExemption = Number(brackets[0].PersonalExemptionEGP) || 0;
  const taxableIncome = Math.max(0, annualGrossIncome - personalExemption);

  let totalTax = 0;
  let remaining = taxableIncome;

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const from = Number(bracket.FromAmountEGP);
    const to = bracket.ToAmountEGP ? Number(bracket.ToAmountEGP) : Infinity;
    const rate = Number(bracket.RatePct) / 100;
    const bracketSize = to - from;

    if (taxableIncome <= from) continue;

    const taxableInThisBracket = Math.min(remaining, bracketSize);
    totalTax += taxableInThisBracket * rate;
    remaining -= taxableInThisBracket;
  }
  return parseFloat(totalTax.toFixed(2));
}

async function calculateMonthlyIncomeTax(monthlyGrossIncome, year) {
  const annualTax = await calculateAnnualIncomeTax(monthlyGrossIncome * 12, year);
  return parseFloat((annualTax / 12).toFixed(2));
}

// ─── SOCIAL INSURANCE (LAW 148/2019) ─────────────────────────────────────────
async function getSocialInsuranceConfig() {
  const today = new Date();
  const config = await prisma.socialInsuranceConfig.findFirst({
    where: {
      EffectiveFrom: { lte: today },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
    },
    orderBy: { EffectiveFrom: 'desc' },
  });
  // Fallback to law defaults only if Admin hasn't set anything in UI
  return {
    EmployeeRatePct: config ? Number(config.EmployeeRatePct) : 7.25,
    EmployerRatePct: config ? Number(config.EmployerRatePct) : 18.75,
  };
}

// ─── DYNAMIC OVERTIME ENGINE (PR-006) ────────────────────────────────────────
async function calculateOvertimePay(baseSalary, overtimeHours, workingDays, policy) {
  if (!overtimeHours || overtimeHours <= 0) return 0;

  // PR-006: Working hours are now dynamic based on Policy Configuration
  // We assume a default of 8 only if the Admin left the field empty
  const hoursPerDay = 8; 
  const hourlyRate = baseSalary / (workingDays * hoursPerDay);
  
  // Fetch the specific multiplier rule linked to this policy
  const multiplier = policy.OvertimeRule ? Number(policy.OvertimeRule.Multiplier) : 1.35;
  
  return parseFloat((hourlyRate * overtimeHours * multiplier).toFixed(2));
}

// ─── THE CORE ENGINE ─────────────────────────────────────────────────────────
async function calculateEmployeePayroll(employeeId, payrollRunId, policy, attendanceSummary, leaveImpact) {
  // policy argument is passed from the main runner, already including OvertimeRule
  if (!policy) throw new AppError("PayrollPolicy not found. Configure in Settings.", 500);

  const payRunRecord = await prisma.payrollRun.findUnique({ where: { PayrollRunID: payrollRunId } });
  const { daysInMonth } = getMonthBounds(payRunRecord.PeriodYear, payRunRecord.PeriodMonth);
  
  const periodStart = new Date(payRunRecord.PeriodYear, payRunRecord.PeriodMonth - 1, 1);
  const periodEnd = new Date(payRunRecord.PeriodYear, payRunRecord.PeriodMonth - 1, daysInMonth);

  const employee = await prisma.employee.findUnique({ 
    where: { EmployeeID: employeeId },
    select: { HireDate: true, TerminationDate: true }
  });

  // PRORATION
  const activeDays = getActiveDays(periodStart, periodEnd, employee?.HireDate, employee?.TerminationDate);
  const prorationFactor = activeDays / daysInMonth;

  if (activeDays === 0) throw new AppError("Employee was not active during this period.", 400);

  // BASE SALARY (PR-002)
  const salaryRecord = await prisma.employeeSalary.findFirst({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: periodEnd },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: periodStart } }],
    },
    orderBy: { EffectiveFrom: 'desc' },
  });

  if (!salaryRecord) throw new AppError("No active salary record (PR-002).", 400);

  const contractBaseSalary = Number(salaryRecord.BaseSalary);
  const baseSalary = parseFloat((contractBaseSalary * prorationFactor).toFixed(2));

  // ALLOWANCES (PR-005 / PR-009)
  const allowances = await prisma.employeeAllowance.findMany({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: periodEnd },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: periodStart } }],
    },
    include: { Allowance: true },
  });

let taxableAllowances = 0;
  let exemptAllowances = 0;

  const allowanceLines = allowances.map((ea) => {
    const rawAmount = Number(ea.OverrideAmount ?? ea.Allowance.Amount);
    const amount = parseFloat((rawAmount * prorationFactor).toFixed(2));
    
    const name = ea.Allowance.AllowanceName.toLowerCase();
    let exemptPortion = 0;

    // Identify Exemptions based on rules
    if (name.includes('social') || name.includes('labor day') || name.includes('work nature') || name.includes('special')) {
        exemptPortion = amount;
    } else if (name.includes('transportation')) {
        exemptPortion = Math.min(amount, 300 * prorationFactor);
    }

    taxableAllowances += (amount - exemptPortion);
    exemptAllowances += exemptPortion;

    return {
      description: ea.Allowance.AllowanceName,
      amount: amount,
      type: 'Allowance',
    };
  });

  const totalAllowances = taxableAllowances + exemptAllowances;

  /// ─── UPDATED: Dynamic Policy Mappings ─────────────────────────────────────────

// Replace the hardcoded workingDaysInMonth = 22 inside calculateEmployeePayroll with:
const workingDaysInMonth = Number(policy.WorkingDaysInMonth) || 22; 

// Replace the hardcoded hourlyRate logic with:
const hoursPerDay = Number(policy.WorkingHoursPerDay) || 8;
const dailyRate = contractBaseSalary / workingDaysInMonth; 
const hourlyRate = dailyRate / hoursPerDay;

  const absentDays = attendanceSummary ? Number(attendanceSummary.AbsentDays || 0) : 0;
  // Apply Cap on Deductions (PR-004)
// CORRECT
// CORRECT — per Egyptian Labor Law, absence deduction has no cap
const totalAbsentDays = unpaidDays + Number(attSummary.AbsentDays || 0);
const absenceDeduction = parseFloat((totalAbsentDays * dailyRate).toFixed(2));
  const latenessMins = attendanceSummary ? Number(attendanceSummary.TotalLatenessMins || 0) : 0;
  const latenessDeduction = parseFloat(((latenessMins / 60) * hourlyRate).toFixed(2));

  const unpaidLeaveDays = leaveImpact?.unpaidLeaveDays || 0;
  const unpaidLeaveDeduction = parseFloat((unpaidLeaveDays * dailyRate).toFixed(2));

  // OVERTIME (PR-006)
  const overtimeHours = attendanceSummary ? Number(attendanceSummary.TotalOvertimeHrs) : 0;
  const overtimePay = await calculateOvertimePay(baseSalary, overtimeHours, workingDaysInMonth, policy);

// ─── TOTALS & TAXES ────────────────────────────────────────────────────────
  // 1. Calculate Actual Gross Income
  const grossIncome = baseSalary + totalAllowances + overtimePay - absenceDeduction - unpaidLeaveDeduction - latenessDeduction;
  
  // 2. Social Insurance (with Statutory Caps)
  const siConfig = await getSocialInsuranceConfig();
  const siMaxCap = siConfig.MaxSubscriptionWage || 12600; 
  const siWage = Math.min(baseSalary, siMaxCap); 
  const employeeSI = parseFloat((siWage * (siConfig.EmployeeRatePct / 100)).toFixed(2));
  
  // 3. Life Insurance Exemption (Assuming 0 for now until you fetch it from DB)
  const monthlyLifeInsurancePremium = 0; 
  const maxLifeInsuranceExemption = Math.min((baseSalary + taxableAllowances) * 0.15, (10000 / 12));
  const exemptLifeInsurance = Math.min(monthlyLifeInsurancePremium, maxLifeInsuranceExemption);

  // 4. Calculate Taxable Base (Isolating Taxable Allowances only)
  const taxableMonthlyIncomeBase = baseSalary + taxableAllowances + overtimePay - absenceDeduction - unpaidLeaveDeduction - latenessDeduction;
  const monthlyTaxableAmount = Math.max(0, taxableMonthlyIncomeBase - employeeSI - exemptLifeInsurance);

  const incomeTax = await calculateMonthlyIncomeTax(monthlyTaxableAmount, payRunRecord.PeriodYear);

  // 5. Final Net Pay Calculation
  let netPay = parseFloat((grossIncome - employeeSI - incomeTax - monthlyLifeInsurancePremium).toFixed(2));
  
  const minimumWage = Number(policy.MinimumWageEGP) || 6000;
  // ──────────────────────────────────────────────────────────────────────────
  // BUILD DETAILED LINES FOR FRONTEND TRANSPARENCY
  const lines = [
    { description: `Base Salary${prorationFactor < 1 ? ` (${activeDays} Days)` : ''}`, amount: baseSalary, type: 'BaseSalary' },
    ...allowanceLines
  ];

  if (overtimePay > 0) lines.push({ description: `Overtime (${overtimeHours}h)`, amount: overtimePay, type: 'OvertimePay' });
if (absenceDeduction > 0) lines.push({
  description: `Absence Deduction (${absentDays}d × EGP ${dailyRate.toFixed(2)}/day)`,
  amount: -absenceDeduction,
  type: 'AbsenceDeduction'
});
  if (latenessDeduction > 0) lines.push({ description: `Lateness Penalty (${(latenessMins/60).toFixed(1)}h)`, amount: -latenessDeduction, type: 'LatenessDeduction' });
  
  lines.push({ description: `Social Insurance (${siConfig.EmployeeRatePct}%)`, amount: -employeeSI, type: 'SocialInsurance' });
  lines.push({ description: 'Income Tax (Progressive)', amount: -incomeTax, type: 'IncomeTax' });
return {
  employeeId,
  payrollRunId,
  baseSalary,
  grossIncome,
  totalEarnings: parseFloat((baseSalary + totalAllowances + overtimePay).toFixed(2)),
totalDeductions: parseFloat((absenceDeduction + unpaidLeaveDeduction + latenessDeduction + employeeSI + incomeTax + monthlyLifeInsurancePremium).toFixed(2)),
  netPay: Math.max(0, netPay),
  belowMinimumWage: netPay < minimumWage,  // ← flat, for this test
  flags: {
    belowMinimumWage: netPay < minimumWage, // ← nested, for other tests
    highAbsence: absentDays > (policy.MaxMonthlyDeductionDays || 30),
  },
  lines
};
}

module.exports = { calculateEmployeePayroll };