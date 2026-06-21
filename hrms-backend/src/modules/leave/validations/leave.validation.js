/**
 * src/modules/leave/validations/leave.validation.js
 */
const Joi = require('joi');
const { LEAVE_REQUEST_STATUS, LEAVE_APPROVAL_DECISION, HALF_DAY_PORTION } = require('../../../shared/constants');

const createLeaveTypeSchema = Joi.object({
  LeaveTypeCode: Joi.string().max(20).required(),
  LeaveTypeName: Joi.string().max(100).required(),
  IsPaid: Joi.boolean().default(true),
  RequiresApproval: Joi.boolean().default(true),
  RequiresDocument: Joi.boolean().default(false),
  DisplayColor: Joi.string().max(10).allow(null, '').optional(),
});

const createLeavePolicySchema = Joi.object({
  PolicyName: Joi.string().max(100).required(),
  LeaveTypeID: Joi.number().integer().positive().required(),
  EmploymentType: Joi.string().max(50).allow(null, '').optional(),
  MaxDaysPerYear: Joi.number().integer().positive().required(),
  AccrualRatePerMonth: Joi.number().positive().allow(null).optional(),
  CarryOverLimit: Joi.number().integer().min(0).default(0),
  CarryOverYears: Joi.number().integer().min(1).default(2),
  MinTenureMonths: Joi.number().integer().min(0).default(0),
  NoticePeriodDays: Joi.number().integer().min(0).default(0),
  MaxConsecDays: Joi.number().integer().positive().allow(null).optional(),
  AllowHalfDay: Joi.boolean().default(false),
  EffectiveFrom: Joi.date().iso().required(),
  EffectiveTo: Joi.date().iso().allow(null).optional(),
  MaxLifetimeOccurrences: Joi.number().integer().positive().allow(null).optional(),
  FirstYearEntitlementDays: Joi.number().integer().positive().allow(null).optional(),
});

const adjustBalanceSchema = Joi.object({
  EmployeeID: Joi.number().integer().positive().required(),
  LeaveTypeID: Joi.number().integer().positive().required(),
  BalanceYear: Joi.number().integer().min(2020).required(),
  AdjustedDays: Joi.number().precision(2).required(),
  Reason: Joi.string().max(300).required(),
});

const initializeBalanceSchema = Joi.object({
  EmployeeID: Joi.number().integer().positive().required(),
  BalanceYear: Joi.number().integer().min(2020).required(),
});
const submitLeaveRequestSchema = Joi.object({
  // Use .prefs({ convert: true }) or ensure these are standard
  LeaveTypeID: Joi.number().integer().positive().required(),
  StartDate: Joi.date().iso().required(),
  EndDate: Joi.date().iso().min(Joi.ref('StartDate')).required(),
  
  // Joi.boolean() correctly converts the string "true" or "false" to boolean
  IsHalfDay: Joi.boolean().default(false),
  
  Reason: Joi.string().max(1000).allow(null, '').optional(),
  
  // This handles the field even though Multer moves the file to req.file
  documentReference: Joi.any().optional(), 
  
  AttachmentFile: Joi.any().optional()
}).unknown(true);
const updateLeaveRequestSchema = Joi.object({
  LeaveTypeID: Joi.number().integer().positive().optional(),
  StartDate: Joi.date().iso().optional(),
  EndDate: Joi.date().iso().optional(),
  IsHalfDay: Joi.boolean().optional(),
  HalfDayPortion: Joi.any().optional(),
  Reason: Joi.string().max(1000).allow(null, '').optional(),
  DocumentReference: Joi.string().max(255).allow(null, '').optional(),
}).min(1).unknown(true); // <--- ALLOWS THE FALLBACKS

const cancelLeaveRequestSchema = Joi.object({
  CancelReason: Joi.string().min(5).max(500).required(),
  cancelReason: Joi.string().optional()
}).unknown(true);
// Replace your existing approveRejectSchema with this:
// Replace the existing approveRejectSchema with this:
const approveRejectSchema = Joi.object({
  decision: Joi.string().valid('APPROVE', 'APPROVED', 'REJECT', 'REJECTED').insensitive().optional(),
  Decision: Joi.string().valid('APPROVE', 'APPROVED', 'REJECT', 'REJECTED').insensitive().optional(),
  comments: Joi.string().max(500).allow(null, '').optional(),
  Comments: Joi.string().max(500).allow(null, '').optional(),
}).or('decision', 'Decision').unknown(true); // .unknown(true) stops 422 errors!.unknown(true); // .unknown(true) prevents extra fields from crashing it

const delegateApprovalSchema = Joi.object({
  delegateTo: Joi.number().integer().positive().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  comments: Joi.string().max(500).allow(null, '').optional(),
}).unknown(true);

const createHolidaySchema = Joi.object({
  HolidayName: Joi.string().max(100).required(),
  HolidayDate: Joi.date().iso().required(),
  IsRecurringYearly: Joi.boolean().default(false),
  WorkLocationID: Joi.number().integer().positive().allow(null).optional(),
  PayMultiplier: Joi.number().positive().default(3.00),
});

const leaveRequestQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  employeeId: Joi.number().integer().positive().optional(),
  leaveTypeId: Joi.number().integer().positive().optional(),
  status: Joi.string().valid(...Object.values(LEAVE_REQUEST_STATUS)).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  departmentId: Joi.number().integer().positive().optional(),
  year: Joi.number().integer().min(2020).optional(),
});

const balanceQuerySchema = Joi.object({
  year: Joi.number().integer().min(2020).default(new Date().getFullYear()),
});

module.exports = {
  createLeaveTypeSchema, createLeavePolicySchema, adjustBalanceSchema,
  initializeBalanceSchema, submitLeaveRequestSchema, updateLeaveRequestSchema,
 approveRejectSchema, delegateApprovalSchema,
  createHolidaySchema, leaveRequestQuerySchema, balanceQuerySchema,cancelLeaveRequestSchema
};
