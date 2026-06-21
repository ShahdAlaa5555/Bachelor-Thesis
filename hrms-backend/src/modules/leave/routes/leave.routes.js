/**
 * src/modules/leave/routes/leave.routes.js
 */
const router = require('express').Router();
const ctrl = require('../controllers/leave.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/leave.validation');
const { uploadDocument } = require('../../../middleware/multer');

// 1. GLOBAL AUTHENTICATION (Must be first!)
// This ensures req.user is populated for ALL leave routes
router.use(authenticate);

// 2. ROLE NORMALIZATION
// This ensures that strings like "HR Manager" become "HR" for authorize()
router.use((req, _res, next) => {
  if (req.user && (req.user.role || req.user.Role)) {
    const roleVal = (req.user.role || req.user.Role || '').toUpperCase();
    
    if (roleVal.includes('HR')) {
      req.user.role = 'HR';
    } else if (roleVal.includes('ADMIN')) {
      req.user.role = 'Admin';
    } else if (roleVal.includes('MANAGER') || roleVal.includes('SUPERVISOR') || roleVal.includes('PROFESSOR')) {
      req.user.role = 'Manager'; 
    } else {
      req.user.role = 'Employee';
    }
  }
  next();
});

// ── Leave Types ─────────────────────────────────────────────────────────────
router.get('/types', ctrl.listLeaveTypes);
router.post('/types', authorize('HR', 'Admin'), validate(v.createLeaveTypeSchema), ctrl.createLeaveType);

// ── My Leave Data (Uses req.user) ──────────────────────────────────────────
router.get('/my/balances', validate(v.balanceQuerySchema, 'query'), ctrl.getMyLeaveBalances);
router.get('/my/requests', validate(v.leaveRequestQuerySchema, 'query'), ctrl.getMyLeaveRequests);

router.post('/requests', uploadDocument.single('documentReference'), ctrl.submitLeaveRequest);

// ── Management / HR Actions ────────────────────────────────────────────────
router.post('/requests/bulk', authorize('Manager', 'HR', 'Admin'), ctrl.bulkProcessRequests);
router.get('/requests', authorize('Manager', 'HR', 'Admin'), validate(v.leaveRequestQuerySchema, 'query'), ctrl.listAllLeaveRequests);
router.get('/inbox', authorize('Manager', 'HR', 'Admin'), ctrl.getManagerInbox);

// ── Single Request Operations ─────────────────────────────────────────────
router.get('/requests/:id', ctrl.getLeaveRequest);
router.patch('/requests/:id', validate(v.updateLeaveRequestSchema), ctrl.updateLeaveRequest);
router.patch('/requests/:id/approve', authorize('Manager', 'HR', 'Admin'), validate(v.approveRejectSchema), ctrl.approveReject);
router.patch('/requests/:id/cancel', validate(v.cancelLeaveRequestSchema), ctrl.cancelLeave);
// leave.routes.js
router.post('/delegate', authorize('Manager', 'Admin','HR'), validate(v.delegateApprovalSchema), ctrl.delegateApproval);
router.post(
  '/settings/carryover', 
  authorize('Manager', 'HR', 'Admin'), 
  ctrl.triggerYearEndCarryover
);

// ── Balance & Admin ───────────────────────────────────────────────────────
router.post('/balances/initialize', authorize('HR', 'Admin'), validate(v.initializeBalanceSchema), ctrl.initializeBalances);
router.post('/balances/adjust', authorize('HR', 'Admin'), validate(v.adjustBalanceSchema), ctrl.adjustBalance);
router.post('/admin/update-entitlements', authorize('HR', 'Admin'), ctrl.updateGlobalEntitlements);

// ── Holiday & Analytics ───────────────────────────────────────────────────
router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', authorize('HR', 'Admin'), validate(v.createHolidaySchema), ctrl.createHoliday);
router.get('/analytics', authorize('Manager', 'HR', 'Admin'), ctrl.getLeaveAnalytics);

// ── Payroll Sync ──────────────────────────────────────────────────────────
router.post('/requests/:id/sync-payroll', authorize('HR', 'Admin', 'Payroll'), ctrl.syncLeaveToPayroll);
router.post('/sync/payroll/bulk', authorize('HR', 'Admin', 'Payroll'), ctrl.bulkSyncPayroll);

module.exports = router;