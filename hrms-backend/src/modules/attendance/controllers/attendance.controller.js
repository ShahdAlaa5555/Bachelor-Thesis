/**
 * src/modules/attendance/controllers/attendance.controller.js
 *
 * PATCHES APPLIED — summarized at top for diff review:
 *
 * 1. reviewCorrectionRequest — was passing req.body.action (string) to service
 *    which expects { Status, ReviewNote }. Now maps correctly.
 *
 * 2. approveOvertimeRequest — was passing req.body.action (string) to service
 *    which expects a boolean `approved`. Now parses correctly.
 *
 * 3. getAttendanceSummary ("me" route) — now reads year/month from req.query
 *    instead of req.params so the /summary/me route works correctly.
 *
 * 4. listOvertimeRequests — new controller method (was missing). Needed by
 *    manager inbox and employee's own requests view.
 *
 * 5. generateSummary — thin wrapper that reads :employeeId, :year, :month
 *    from req.params and calls service.generateAttendanceSummary.
 */

const service = require('../services/attendance.service');
const { AppError } = require('../../../middleware/errorHandler');

// ─── Helper: resolve employeeId from JWT regardless of field name used ────────
// Auth middlewares differ: some set req.user.employeeId, others use id/sub/EmployeeID
function resolveEmployeeId(req) {
  const raw = req.user.employeeId   ??
              req.user.EmployeeID   ??
              req.user.employee_id  ??
              req.user.sub          ??
              req.user.id;
  const id = parseInt(raw);
  if (!id || isNaN(id)) throw new AppError('Could not resolve employee ID from token.', 401, 'MISSING_EMPLOYEE_ID');
  return id;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const ok = (res, data, status = 200) => res.status(status).json(data);

// ─── Dashboard ────────────────────────────────────────────────────────────────

exports.getTodayStatus = async (req, res, next) => {
  try {
    const data = await service.getTodayStatus(resolveEmployeeId(req));
    ok(res, data);
  } catch (err) { next(err); }
};

exports.getDashboardKPIs = async (req, res, next) => {
  try {
    const data = await service.getDashboardKPIs(resolveEmployeeId(req));
    ok(res, data);
  } catch (err) { next(err); }
};

exports.getRecentActivity = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data  = await service.getRecentActivity(resolveEmployeeId(req), limit);
    ok(res, data);
  } catch (err) { next(err); }
};

// ─── Clock In/Out ─────────────────────────────────────────────────────────────

exports.checkIn = async (req, res, next) => {
  try {
    const data = await service.checkIn(resolveEmployeeId(req), req.body);
    ok(res, data, 201);
  } catch (err) { next(err); }
};

exports.checkOut = async (req, res, next) => {
  try {
    const data = await service.checkOut(resolveEmployeeId(req), req.body);
    ok(res, data);
  } catch (err) { next(err); }
};

// ─── Attendance Records ───────────────────────────────────────────────────────

exports.listAttendance = async (req, res, next) => {
  try {
    const data = await service.listAttendance(req.query);
    ok(res, data);
  } catch (err) { next(err); }
};

exports.getAttendanceRecord = async (req, res, next) => {
  try {
    const data = await service.getAttendanceRecord(parseInt(req.params.id));
    ok(res, data);
  } catch (err) { next(err); }
};

exports.createManualAttendance = async (req, res, next) => {
  try {
    const data = await service.createManualAttendance(req.body, resolveEmployeeId(req));
    ok(res, data, 201);
  } catch (err) { next(err); }
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

exports.getAttendanceCalendar = async (req, res, next) => {
  try {
    // Works for both /calendar/me and /calendar/:employeeId routes
    const employeeId = req.params.employeeId
      ? parseInt(req.params.employeeId)
      : resolveEmployeeId(req);

    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const data = await service.getAttendanceCalendar(employeeId, year, month);
    ok(res, data);
  } catch (err) { next(err); }
};

// ─── Correction Requests ──────────────────────────────────────────────────────

exports.submitCorrectionRequest = async (req, res, next) => {
  const attendanceId = parseInt(req.params.attendanceId, 10);

if (isNaN(attendanceId)) {
  throw new AppError('Invalid attendance ID.', 400, 'INVALID_PARAM');
}
  try {
    const data =await service.submitCorrectionRequest(
  attendanceId,
  req.user.EmployeeID,
  req.user.role,
  req.body
);
    ok(res, data, 201);
  } catch (err) { next(err); }
};

exports.listCorrectionRequests = async (req, res, next) => {
  try {
    const data = await service.listCorrectionRequests(req.query);
    ok(res, data);
  } catch (err) { next(err); }
};

// Employee self-service: only returns corrections for the authenticated employee
exports.listMyCorrections = async (req, res, next) => {
  try {
    const employeeId = resolveEmployeeId(req);
    const data = await service.listCorrectionRequests({ ...req.query, employeeId });
    ok(res, data);
  } catch (err) { next(err); }
};

// FIX: was receiving { action: 'approve'/'reject' } but service expects { Status, ReviewNote }
exports.reviewCorrectionRequest = async (req, res, next) => {
  try {
    const correctionId = parseInt(req.params.correctionId);
    const reviewerId   = resolveEmployeeId(req);

    // Support both the old frontend shape ({ action }) and the corrected shape ({ Status })
    let { Status, ReviewNote, action, reviewNote } = req.body;

    // Normalise: old frontend sent action='approve'/'reject', new sends Status='Approved'/'Rejected'
    if (!Status && action) {
      Status = action === 'approve' ? 'Approved' : 'Rejected';
    }
    if (!ReviewNote && reviewNote) {
      ReviewNote = reviewNote;
    }

    if (!['Approved', 'Rejected'].includes(Status)) {
      return next(new AppError('Status must be Approved or Rejected', 400, 'INVALID_STATUS'));
    }

    const data = await service.reviewCorrectionRequest(correctionId, reviewerId, { Status, ReviewNote });
    ok(res, data);
  } catch (err) { next(err); }
};

// ─── Overtime Requests ────────────────────────────────────────────────────────

exports.submitOvertimeRequest = async (req, res, next) => {
  try {
    const data = await service.submitOvertimeRequest(req.body, resolveEmployeeId(req));
    ok(res, data, 201);
  } catch (err) { next(err); }
};

// FIX: was receiving { action: 'approve'/'reject' } but service expects boolean `approved`
exports.approveOvertimeRequest = async (req, res, next) => {
  try {
    const overtimeRequestId = parseInt(req.params.id);
    const approverId        = resolveEmployeeId(req);

    // Support both { approved: true/false } (new) and { action: 'approve'/'reject' } (old)
    let approved;
    if (typeof req.body.approved === 'boolean') {
      approved = req.body.approved;
    } else if (req.body.action) {
      approved = req.body.action === 'approve';
    } else {
      return next(new AppError('Missing approved field', 400, 'MISSING_FIELD'));
    }

    const data = await service.approveOvertimeRequest(overtimeRequestId, approverId, approved);
    ok(res, data);
  } catch (err) { next(err); }
};

// FIX: new — was completely missing. Needed by manager inbox and employee's own overtime view.
exports.listOvertimeRequests = async (req, res, next) => {
  try {
    const { status, employeeId, page, limit } = req.query;
    const where = {};

    if (status)     where.Status     = status;
    // Managers/HR can filter by employee; employees only see their own
    if (req.user.role === 'Employee') {
      where.EmployeeID = resolveEmployeeId(req);
    } else if (employeeId) {
      where.EmployeeID = parseInt(employeeId);
    }

    const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');
    const { skip, take, page: pg, limit: lim } = getPagination({ page, limit });
    const prisma = require('../../../config/database');

    const [requests, total] = await Promise.all([
      prisma.overtimeRequest.findMany({
        where,
        skip,
        take: lim,
        orderBy: { OvertimeDate: 'desc' },
        include: {
          Employee: { select: { FullName: true, EmployeeCode: true } },
        },
      }),
      prisma.overtimeRequest.count({ where }),
    ]);

    ok(res, { requests, meta: buildPaginationMeta(total, pg, lim) });
  } catch (err) { next(err); }
};

// ─── Shifts ───────────────────────────────────────────────────────────────────

exports.listShifts = async (req, res, next) => {
  try {
    const data = await service.listShifts();
    ok(res, data);
  } catch (err) { next(err); }
};

exports.assignShift = async (req, res, next) => {
  try {
    const data = await service.assignShift(req.body, resolveEmployeeId(req));
    ok(res, data, 201);
  } catch (err) { next(err); }
};

// ─── Attendance Summary ───────────────────────────────────────────────────────

exports.getAttendanceSummary = async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId
      ? parseInt(req.params.employeeId)
      : resolveEmployeeId(req);

    if (!employeeId || isNaN(employeeId)) {
      return next(new AppError('Could not resolve employee ID from token.', 400, 'MISSING_EMPLOYEE_ID'));
    }

    const now   = new Date();
    const year  = parseInt(req.params.year  || req.query.year)  || now.getFullYear();
    const month = parseInt(req.params.month || req.query.month) || now.getMonth() + 1;

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return next(new AppError('Invalid year or month.', 400, 'INVALID_PARAMS'));
    }

    const data = await service.getAttendanceSummary(employeeId, year, month);
    ok(res, data);
  } catch (err) { next(err); }
};

exports.generateSummary = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const year       = parseInt(req.params.year);
    const month      = parseInt(req.params.month);
    const data       = await service.generateAttendanceSummary(employeeId, year, month);
    ok(res, data);
  } catch (err) { next(err); }
};