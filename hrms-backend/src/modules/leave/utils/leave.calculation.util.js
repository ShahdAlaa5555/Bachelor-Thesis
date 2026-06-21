/**
 * src/modules/leave/utils/leave.calculation.util.js
 * Egyptian Labor Law 14/2025 compliant leave entitlement calculations.
 * All returned day values are WHOLE NUMBERS (no decimals).
 */

const { dayjs } = require('../../../shared/utils/date.util');

/**
 * STATUTORY ANNUAL LEAVE TIERS (Law 14/2025)
 * - 21 days: standard, after 1 year of service
 * - 30 days: after 10 years of service OR employee age >= 50
 * - 45 days: employee has a disability (HasDisability = true)
 * Disability tier takes precedence (highest legal entitlement wins).
 */
function getStatutoryAnnualEntitlement(employee, asOfDate) {
  if (employee.HasDisability) {
    return 45;
  }

  const tenureYears = Math.floor(dayjs(asOfDate).diff(dayjs(employee.StartDate), 'year'));
  const age = Math.floor(dayjs(asOfDate).diff(dayjs(employee.DateOfBirth), 'year'));

  if (tenureYears >= 10 || age >= 50) {
    return 30;
  }

  return 21;
}

/**
 * FIRST-YEAR ANNUAL LEAVE ENTITLEMENT
 * Law: employee earns 15 days, granted ONLY after completing 6 months
 * of service. NOT a daily/linear proration of 15.
 *
 * Returns 0 if the 6-month mark is not reached by yearEnd (employee
 * will get their first entitlement the FOLLOWING year, handled by
 * isFirstYear check using StartDate's year vs target year).
 */
function getFirstYearAnnualEntitlement(startDate, year) {
  const yearEnd = dayjs(`${year}-12-31`);
  const sixMonthMark = dayjs(startDate).add(6, 'month');

  if (sixMonthMark.isAfter(yearEnd)) {
    return 0; // hasn't hit 6 months yet within this calendar year
  }

  return 15; // flat statutory grant
}

/**
 * SICK LEAVE ENTITLEMENT — tiered structure per 3-year cycle (Law 14/2025):
 * - 3 months @ 100% pay  => 90 days
 * - 6 months @ 85% pay   => 180 days
 * - 3 months @ 75% pay   => 90 days
 * Total: 360 days per 3-year cycle.
 *
 * If LeavePolicy has SickLeaveTiers configured (from schema), use those
 * instead of the hardcoded law defaults — allows HR to customize while
 * defaulting to the legal minimum.
 */
function getSickLeaveEntitlement(policy) {
  const DAYS_PER_MONTH = 30; // standard for sick leave month conversion

  if (policy?.SickLeaveTiers && policy.SickLeaveTiers.length > 0) {
    const sorted = [...policy.SickLeaveTiers].sort((a, b) => a.TierOrder - b.TierOrder);
    let totalDays = 0;
    const tiers = sorted.map(tier => {
      const months = tier.ToMonthNumber - tier.FromMonthNumber + 1;
      const days = months * DAYS_PER_MONTH;
      totalDays += days;
      return {
        tierOrder: tier.TierOrder,
        days,
        payPercentage: Number(tier.PayPercentage)
      };
    });
    return { totalDays: Math.round(totalDays), tiers };
  }

  // Legal default (Law 14/2025)
  return {
    totalDays: 360,
    tiers: [
      { tierOrder: 1, days: 90, payPercentage: 100 },
      { tierOrder: 2, days: 180, payPercentage: 85 },
      { tierOrder: 3, days: 90, payPercentage: 75 }
    ]
  };
}

/**
 * MID-YEAR PRORATION for non-Annual, non-Sick leave types.
 * Formula per law: Annual balance = (days / 12) * completed months.
 * Used for employees hired mid-year for leave types like Emergency,
 * Casual, or company-specific types.
 * Rounded to whole days (no decimals).
 */
function prorateByCompletedMonths(maxDaysPerYear, fromDate, toDate) {
  const completedMonths = Math.floor(dayjs(toDate).diff(dayjs(fromDate), 'month'));
  const cappedMonths = Math.min(Math.max(completedMonths, 0), 12);
  return Math.round((maxDaysPerYear / 12) * cappedMonths);
}

/**
 * CARRY-OVER CALCULATION per Law 14/2025:
 * Unused annual leave may be carried forward for up to 2 YEARS
 * (a time-based limit, NOT a fixed day-count cap like 5 days).
 *
 * LeavePolicy.CarryOverLimit (Int, default 0) = optional ADDITIONAL
 * cap on the NUMBER of days that can carry over, IF the policy sets
 * one stricter than the law (policy can be MORE generous in days,
 * but the 2-year EXPIRY is the legal floor and cannot be shortened
 * below what the law allows... though policy CAN extend it via
 * CarryOverYears if more generous).
 *
 * Returns: { carryForwardDays, expiryYear }
 */
function calculateCarryOver(balance, policy, nextYear) {
  const totalAvailable =
    Number(balance.EntitledDays) + Number(balance.CarryOverDays) + Number(balance.AdjustedDays);
  const totalUsed = Number(balance.UsedDays) + Number(balance.PendingDays);
  const remaining = Math.max(0, Math.round(totalAvailable - totalUsed));

  // Determine carry-over policy: law minimum is 2 years, policy can extend
  const carryOverYears = Math.max(policy?.CarryOverYears ?? 2, 2);

  // Check if existing CarryOverDays portion has expired
  const existingCarryOver = Number(balance.CarryOverDays || 0);
  const expiryYear = balance.CarryOverExpiryYear;
  const carryOverPortionExpired = expiryYear != null && nextYear > expiryYear;

  let carryForwardDays;

  if (carryOverPortionExpired) {
    // Forfeit expired carry-over; only THIS YEAR's unused entitlement+adjustment carries
    const thisYearUnused = Math.max(
      0,
      Math.round(Number(balance.EntitledDays) + Number(balance.AdjustedDays) - totalUsed)
    );
    carryForwardDays = thisYearUnused;
  } else {
    carryForwardDays = remaining;
  }

  // Apply optional policy-defined CarryOverLimit (if set > 0, it's a stricter cap)
  if (policy?.CarryOverLimit && policy.CarryOverLimit > 0) {
    carryForwardDays = Math.min(carryForwardDays, policy.CarryOverLimit);
  }

  const newExpiryYear = nextYear + (carryOverYears - 1);

  return {
    carryForwardDays: Math.round(carryForwardDays),
    expiryYear: newExpiryYear
  };
}
/**
 * Calculates the employee's sick leave usage within the rolling 3-year cycle,
 * derived from LeaveRequest history (no schema changes needed).
 *
 * Cycle definition: the 3-year window starts from the EARLIEST approved sick
 * leave request found within the last 3 years from `asOfDate`. If no sick
 * leave was taken in the last 3 years, a fresh cycle begins (full 360 available).
 *
 * Tiers consumed in order: 90 days @ 100% -> 180 days @ 85% -> 90 days @ 75%.
 *
 * @param {Array} approvedSickRequests - LeaveRequest rows for this employee,
 *   LeaveTypeID = sick, Status = 'APPROVED', ordered by StartDate ASC.
 * @param {Date} asOfDate - the date of the new request being evaluated.
 * @returns {{ cycleStartDate: Date|null, daysUsed: number, daysRemaining: number,
 *             currentTier: {order:number, payPercentage:number, daysLeftInTier:number} }}
 */
function getSickLeaveCycleStatus(approvedSickRequests, asOfDate) {
  const TIERS = [
    { order: 1, days: 90, payPercentage: 100 },
    { order: 2, days: 180, payPercentage: 85 },
    { order: 3, days: 90, payPercentage: 75 }
  ];
  const TOTAL_CYCLE_DAYS = 360;
  const CYCLE_YEARS = 3;

  const cycleWindowStart = dayjs(asOfDate).subtract(CYCLE_YEARS, 'year');

  // Only count requests whose START date falls within the rolling 3-year window
  const relevantRequests = approvedSickRequests
    .filter(r => dayjs(r.StartDate).isAfter(cycleWindowStart) || dayjs(r.StartDate).isSame(cycleWindowStart))
    .sort((a, b) => dayjs(a.StartDate).diff(dayjs(b.StartDate)));

  if (relevantRequests.length === 0) {
    // Fresh cycle — full entitlement available
    return {
      cycleStartDate: null,
      daysUsed: 0,
      daysRemaining: TOTAL_CYCLE_DAYS,
      currentTier: { order: 1, payPercentage: 100, daysLeftInTier: 90 }
    };
  }

  const cycleStartDate = relevantRequests[0].StartDate;

  // Sum total days used within this cycle (rounded, integer-safe)
  const daysUsed = Math.round(
    relevantRequests.reduce((sum, r) => sum + Number(r.TotalDays), 0)
  );

  const daysRemaining = Math.max(0, TOTAL_CYCLE_DAYS - daysUsed);

  // Determine which tier the NEXT day of sick leave would fall into
  let cumulative = 0;
  let currentTier = TIERS[TIERS.length - 1]; // default: last tier (75%)
  let daysLeftInTier = 0;

  for (const tier of TIERS) {
    const tierStart = cumulative;
    const tierEnd = cumulative + tier.days;

    if (daysUsed < tierEnd) {
      currentTier = tier;
      daysLeftInTier = tierEnd - daysUsed;
      break;
    }
    cumulative = tierEnd;
  }

  if (daysUsed >= TOTAL_CYCLE_DAYS) {
    daysLeftInTier = 0;
  }

  return {
    cycleStartDate,
    daysUsed,
    daysRemaining,
    currentTier: {
      order: currentTier.order,
      payPercentage: currentTier.payPercentage,
      daysLeftInTier
    }
  };
}


module.exports = {
  getStatutoryAnnualEntitlement,
  getFirstYearAnnualEntitlement,
  getSickLeaveCycleStatus,
  getSickLeaveEntitlement,
  prorateByCompletedMonths,
  calculateCarryOver
};