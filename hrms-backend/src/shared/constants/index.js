/**
 * src/shared/constants/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * System-wide Constants and Enumerations
 *
 * THESIS NOTE:
 * Centralizing constants prevents "magic strings" scattered across the codebase.
 * These values mirror the CHECK constraints defined in the SQL Server schema,
 * ensuring the application layer enforces the same rules as the database layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Employee ────────────────────────────────────────────────────────────────
const EMPLOYEE_STATUS = Object.freeze({
  ACTIVE: 'Active',
  ON_LEAVE: 'OnLeave',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
});

const EMPLOYMENT_TYPE = Object.freeze({
  FULL_TIME: 'Full-Time',
  PART_TIME: 'Part-Time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
});

const GENDER = Object.freeze({
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
});

const MARITAL_STATUS = Object.freeze({
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
});

// ─── Attendance ──────────────────────────────────────────────────────────────
const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'Present',
  ABSENT: 'Absent',
  ON_LEAVE: 'OnLeave',
  HALF_DAY: 'HalfDay',
  HOLIDAY: 'Holiday',
  WEEKEND_WORK: 'WeekendWork',
  CORRECTION: 'Correction',
});

const CORRECTION_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

const OVERTIME_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
});

// Maximum overtime per day per Egyptian Labor Law No. 12/2003
const MAX_OVERTIME_HOURS_PER_DAY = 2;

// ─── Leave ───────────────────────────────────────────────────────────────────
const LEAVE_REQUEST_STATUS = Object.freeze({
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_MANAGER: 'PendingManager',
  PENDING_HR: 'PendingHR',
  PENDING_DOCTOR: 'PendingDoctor',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
});

const LEAVE_APPROVAL_DECISION = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DELEGATED: 'Delegated',
});

const LEAVE_ACTION_TYPE = Object.freeze({
  SUBMITTED: 'Submitted',
  APPROVED_BY_MANAGER: 'ApprovedByManager',
  REJECTED_BY_MANAGER: 'RejectedByManager',
  APPROVED_BY_HR: 'ApprovedByHR',
  REJECTED_BY_HR: 'RejectedByHR',
  APPROVED_BY_DOCTOR: 'ApprovedByDoctor',
  CANCELLED: 'Cancelled',
  MODIFIED: 'Modified',
  BALANCE_ADJUSTED: 'BalanceAdjusted',
  DELEGATED: 'Delegated',
  OVERRIDE: 'Override',
});

const HALF_DAY_PORTION = Object.freeze({
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
});

// ─── Payroll ─────────────────────────────────────────────────────────────────
const PAYROLL_RUN_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PROCESSING: 'Processing',
  PENDING_APPROVAL: 'PendingApproval',
  APPROVED: 'Approved',
  FINALIZED: 'Finalized',
  PAID: 'Paid',
});

const PAYROLL_ENTRY_STATUS = Object.freeze({
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  PAID: 'Paid',
  EXCEPTION: 'Exception',
});

const PAY_TYPE_CATEGORY = Object.freeze({
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
  BENEFIT: 'Benefit',
});

const PAY_PERIOD = Object.freeze({
  MONTHLY: 'Monthly',
  BI_WEEKLY: 'BiWeekly',
  WEEKLY: 'Weekly',
});

const PAYROLL_EXCEPTION_STATUS = Object.freeze({
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  WAIVED: 'Waived',
});

const BANK_FILE_STATUS = Object.freeze({
  GENERATED: 'Generated',
  SUBMITTED: 'Submitted',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
});

// ─── Notification ────────────────────────────────────────────────────────────
const NOTIFICATION_CHANNEL = Object.freeze({
  IN_APP: 'InApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  PUSH: 'Push',
});

// Notification event codes — used consistently across all modules
const EVENT_CODE = Object.freeze({
  // Leave
  LEAVE_SUBMITTED: 'LV001',
  LEAVE_APPROVED: 'LV002',
  LEAVE_REJECTED: 'LV003',
  LEAVE_CANCELLED: 'LV004',
  LEAVE_PENDING_MANAGER: 'LV005',
  LEAVE_PENDING_HR: 'LV006',
  LEAVE_BALANCE_LOW: 'LV007',
  // Attendance
  ATT_CHECKIN: 'AT001',
  ATT_CHECKOUT: 'AT002',
  ATT_CORRECTION_SUBMITTED: 'AT003',
  ATT_CORRECTION_APPROVED: 'AT004',
  ATT_OVERTIME_APPROVED: 'AT005',
  // Payroll
  PAY_PAYSLIP_READY: 'PR001',
  PAY_RUN_APPROVED: 'PR002',
  PAY_EXCEPTION_RAISED: 'PR003',
  // Employee
  EMP_CHANGE_REQUEST: 'EM001',
  EMP_CHANGE_APPROVED: 'EM002',
    LEAVE_DELEGATION_ACTIVE: 'LV008',  // ← add this
  LEAVE_DELEGATION_REVOKED:'LV009',  // ← add this too for when you revoke

});

// ─── System Roles ────────────────────────────────────────────────────────────
const ROLE = Object.freeze({
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  HR: 'HR',
  PAYROLL: 'Payroll',
  ADMIN: 'Admin',
});

// ─── Change Request ──────────────────────────────────────────────────────────
const CHANGE_REQUEST_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

module.exports = {
  EMPLOYEE_STATUS,
  EMPLOYMENT_TYPE,
  GENDER,
  MARITAL_STATUS,
  ATTENDANCE_STATUS,
  CORRECTION_STATUS,
  OVERTIME_STATUS,
  MAX_OVERTIME_HOURS_PER_DAY,
  LEAVE_REQUEST_STATUS,
  LEAVE_APPROVAL_DECISION,
  LEAVE_ACTION_TYPE,
  HALF_DAY_PORTION,
  PAYROLL_RUN_STATUS,
  PAYROLL_ENTRY_STATUS,
  PAY_TYPE_CATEGORY,
  PAY_PERIOD,
  PAYROLL_EXCEPTION_STATUS,
  BANK_FILE_STATUS,
  NOTIFICATION_CHANNEL,
  EVENT_CODE,
  ROLE,
  CHANGE_REQUEST_STATUS,
};
