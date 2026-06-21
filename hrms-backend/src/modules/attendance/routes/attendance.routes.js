/**
 * src/modules/attendance/routes/attendance.routes.js
 * Base prefix: /api/v1/attendance
 *
 * CHANGES vs original:
 *  - Added GET /overtime — listOvertimeRequests (was missing, needed by manager inbox + employee view)
 *  - Route order: /overtime list must come BEFORE /overtime/:id/decision to avoid param conflict
 */

const router = require('express').Router();
const ctrl   = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/attendance.validation');

router.use(authenticate);

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard/kpis',            ctrl.getDashboardKPIs);
router.get('/dashboard/today',           ctrl.getTodayStatus);
router.get('/dashboard/recent-activity', ctrl.getRecentActivity);

// ── Clock In/Out ───────────────────────────────────────────────────────────────
router.post('/check-in',  validate(v.checkInSchema),  ctrl.checkIn);
router.post('/check-out', validate(v.checkOutSchema), ctrl.checkOut);

// ── Calendar View ──────────────────────────────────────────────────────────────
router.get('/calendar/me',           ctrl.getAttendanceCalendar);
router.get('/calendar/:employeeId',  authorize('Manager', 'HR', 'Admin'), ctrl.getAttendanceCalendar);

// ── Correction Requests ────────────────────────────────────────────────────────
router.get('/corrections/me',               ctrl.listMyCorrections);                                                                                    // employee: own requests
router.get('/corrections',                  authorize('Manager', 'HR', 'Admin'), ctrl.listCorrectionRequests);                                          // manager: all requests
router.patch('/corrections/:correctionId',  authorize('Manager', 'HR', 'Admin'), validate(v.reviewCorrectionSchema), ctrl.reviewCorrectionRequest);

// ── Overtime Requests ──────────────────────────────────────────────────────────
// FIX: GET /overtime was missing — added for manager inbox and employee self-view
router.get('/overtime',                    ctrl.listOvertimeRequests);
router.post('/overtime',                   validate(v.overtimeRequestSchema), ctrl.submitOvertimeRequest);
router.patch('/overtime/:id/decision',     authorize('Manager', 'HR', 'Admin'), ctrl.approveOvertimeRequest);

// ── Shifts & Schedules ─────────────────────────────────────────────────────────
router.get('/shifts',           ctrl.listShifts);
router.post('/shifts/assign',   authorize('HR', 'Admin'), validate(v.shiftAssignmentSchema), ctrl.assignShift);

// ── Attendance Summary ─────────────────────────────────────────────────────────
router.get('/summary/me',                                            ctrl.getAttendanceSummary);
router.get('/summary/:employeeId',                                   authorize('Manager', 'HR', 'Payroll', 'Admin'), ctrl.getAttendanceSummary);
router.post('/summary/:employeeId/:year/:month/generate',            authorize('HR', 'Payroll', 'Admin'), ctrl.generateSummary);

// ── Attendance Records ─────────────────────────────────────────────────────────
router.get('/',           authorize('Manager', 'HR', 'Payroll', 'Admin'), validate(v.attendanceQuerySchema, 'query'), ctrl.listAttendance);
router.post('/manual',    authorize('HR', 'Admin'), validate(v.manualAttendanceSchema), ctrl.createManualAttendance);

// ── Per-record Routes (must be LAST to avoid swallowing named segments) ────────
router.post('/:attendanceId/corrections', authorize('Manager', 'HR', 'Payroll', 'Admin'), validate(v.correctionRequestSchema), ctrl.submitCorrectionRequest);
router.get('/:id',                        ctrl.getAttendanceRecord);

module.exports = router;