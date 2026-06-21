/**
 * src/modules/payroll/routes/payroll.routes.js
 * Base prefix: /api/v1/payroll
 */
const router = require('express').Router();
const ctrl = require('../controllers/payroll.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/payroll.validation');

router.use(authenticate);

// Dashboard (Image 3 — stats cards + recent activity)
router.get('/dashboard', authorize('Payroll', 'HR', 'Admin'), ctrl.getDashboard);

// Config
router.get('/pay-grades', ctrl.listPayGrades);
router.post('/pay-grades', authorize('HR', 'Payroll', 'Admin'), validate(v.createPayGradeSchema), ctrl.createPayGrade);
router.get('/pay-types', ctrl.listPayTypes);
router.post('/pay-types', authorize('HR', 'Payroll', 'Admin'), validate(v.createPayTypeSchema), ctrl.createPayType);
router.get('/overtime-rules', ctrl.listOvertimeRules);
router.post('/overtime-rules', authorize('HR', 'Payroll', 'Admin'), validate(v.createOvertimeRuleSchema), ctrl.createOvertimeRule);
router.get('/allowances', ctrl.listAllowances);
router.get('/shift-differentials', ctrl.listShiftDifferentials);

// Payroll Policies
router.get('/policies', authorize('Payroll', 'HR', 'Admin'), ctrl.listPolicies);
router.post('/policies', authorize('Payroll', 'HR', 'Admin'), validate(v.createPayrollPolicySchema), ctrl.createPolicy);

// Payroll Runs
router.get('/runs', authorize('Payroll', 'HR', 'Admin'), validate(v.payrollRunQuerySchema, 'query'), ctrl.listRuns);
router.post('/runs', authorize('Payroll', 'HR', 'Admin'), validate(v.createPayrollRunSchema), ctrl.createRun);
router.get('/runs/:id', authorize('Payroll', 'HR', 'Admin'), ctrl.getRun);
router.post('/runs/:id/process', authorize('Payroll', 'Admin'), validate(v.processPayrollRunSchema), ctrl.processRun);
router.post('/runs/:id/approve', authorize('HR', 'Admin'), validate(v.approvePayrollRunSchema), ctrl.approveRun);
router.post('/runs/:id/finalize', authorize('Payroll', 'Admin'), ctrl.finalizeRun);
router.post('/runs/:id/payslips', authorize('Payroll', 'Admin'), ctrl.generatePayslips);
router.post('/runs/:runId/bank-file', authorize('Payroll', 'Admin'), validate(v.generateBankFileSchema), ctrl.generateBankFile);

// Exceptions (Image 3 sidebar)
router.get('/exceptions', authorize('Payroll', 'HR', 'Admin'), ctrl.listExceptions);
router.patch('/exceptions/:id/resolve', authorize('Payroll', 'HR', 'Admin'), validate(v.resolveExceptionSchema), ctrl.resolveException);

// Payslips (Employee Portal + Finalized Payslips sidebar)
router.get('/payslips/me', ctrl.getMyPayslips);
router.get('/payslips/:id', ctrl.getPayslip);
// Add this inside payroll.routes.js, likely near your other config/helper routes
router.get(
  '/active-days', 
  authorize('Payroll', 'HR', 'Admin'), 
  ctrl.getActiveDays
);
// List all claims (Admin/HR) or personal claims (Employee)
router.get('/reimbursements', ctrl.listReimbursements);

// Submit a new claim (Accessible by all logged-in users)
router.post('/reimbursements', ctrl.submitReimbursement);
router.patch('/entries/:id/status', authorize('Payroll', 'HR', 'Admin'), ctrl.updateEntryStatus);
router.post('/disputes', ctrl.submitDispute);
router.get('/disputes/me', ctrl.listMyDisputes);
router.get('/reports/department', authorize('Payroll', 'HR', 'Admin'), ctrl.getDeptReport);
router.get('/tax-brackets',        ctrl.listTaxBrackets);
router.post('/tax-brackets',       authorize('Admin', 'Payroll'), ctrl.createTaxBracket);
router.patch('/entries/:id/status', authorize('Payroll', 'HR','Manager', 'Admin'), ctrl.updateEntryStatus);
// Approve or Reject a claim (HR, Admin, and Payroll only)
router.patch('/runs/:id/status', authorize('Payroll', 'HR', 'Admin'), ctrl.overrideRunStatus);

// Change the action line to this:
router.patch('/reimbursements/:id/action', authorize('Payroll', 'HR', 'Admin'), ctrl.actionReimbursement);

// ── Social Insurance Config (matches frontend: POST /payroll/social-insurance) ──
router.get('/social-insurance', authorize('Payroll', 'HR', 'Admin', 'Legal'), ctrl.getSocialInsuranceConfig);
router.post('/social-insurance', authorize('Admin', 'Legal'), ctrl.saveSocialInsuranceConfig);
router.get('/system-backup', authorize('Admin', 'Legal'), ctrl.downloadSystemBackup);

module.exports = router;
