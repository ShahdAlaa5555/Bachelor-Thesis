/**
 * src/modules/leave/controllers/leave.controller.js
 */
const service = require('../services/leave.service');
const { sendSuccess } = require('../../../middleware/validate');
const { AppError } = require('../../../middleware/errorHandler');

// Safely parse employee ID from JWT
const uid = (req) => parseInt(req.user?.id ?? req.user?.employeeId ?? req.user?.EmployeeID, 10);

async function listLeaveTypes(req, res) { return sendSuccess(res, await service.listLeaveTypes()); }
async function createLeaveType(req, res) { return sendSuccess(res, await service.createLeaveType(req.body), 201); }
async function listLeavePolicies(req, res) { return sendSuccess(res, await service.listLeavePolicies(req.query)); }
async function createLeavePolicy(req, res) { return sendSuccess(res, await service.createLeavePolicy(req.body), 201); }

async function getMyLeaveBalances(req, res) {
  // 1. Get ID from token
  const employeeId = req.user?.EmployeeID || req.user?.id;

  // 2. SAFETY CHECK: If no ID, stop here!
  if (!employeeId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const balances = await service.getLeaveBalanceDashboard(parseInt(employeeId));
  return res.json({ success: true, data: balances });
}
async function initializeBalances(req, res) {
  const employeeId = parseInt(req.body.EmployeeID, 10);
  const year = parseInt(req.body.BalanceYear, 10);
  const leaveTypeId = req.body.LeaveTypeID ? parseInt(req.body.LeaveTypeID, 10) : null;

  if (!employeeId || !year) {
    throw new AppError('EmployeeID and BalanceYear are required.', 400);
  }

  return sendSuccess(
    res, 
    await service.initializeLeaveBalances(employeeId, year, leaveTypeId), 
    201
  );
}
async function adjustBalance(req, res) {
  return sendSuccess(res, await service.adjustBalance(req.body, uid(req)));
}
async function bulkProcessRequests(req, res) {
  const result = await service.bulkProcessRequests(uid(req), req.body);
  return sendSuccess(res, result);
}
// src/modules/leave/leave.controller.js

// src/modules/leave/controllers/leave.controller.js
async function submitLeaveRequest(req, res) {
  const userId = req.user.EmployeeID || req.user.id;

  // ── FIX: Save the relative path so the frontend can easily display it ──
  // Since Multer is saving to 'hr_documents', we prefix it so the frontend knows where to look.
  const documentReference = req.file
    ? `uploads/hr_documents/${req.file.filename}` 
    : null;

  const payload = {
    ...req.body,
    documentReference, 
  };

  const result = await service.submitLeaveRequest(userId, payload);
  return res.status(201).json({ success: true, data: result });
}
// ── FIX: Safe Update Mapping (LV-017) ──
async function updateLeaveRequest(req, res) {
  const requestId = parseInt(req.params.id, 10);
  const mappedData = {
    StartDate: req.body.StartDate,
    EndDate: req.body.EndDate,
    Reason: req.body.Reason,
    DocumentReference: req.body.DocumentReference
  };
  return sendSuccess(res, await service.updateLeaveRequest(requestId, uid(req), mappedData));
}

// ── FIX: Return the array directly (Solves "Empty My History") ──
// src/modules/leave/leave.controller.js

async function getMyLeaveRequests(req, res) {
  // Use the ID from the decoded token (check which property your auth middleware uses)
  const employeeId = req.user?.EmployeeID || req.user?.id || req.user?.sub;

  if (!employeeId) {
    return res.status(400).json({ error: "Employee ID missing from token" });
  }

  // Ensure it is an Integer for Prisma
  const requests = await service.getMyLeaveRequests(parseInt(employeeId, 10));
  return res.status(200).json({ success: true, requests });
}
// ── FIX: Return the array directly (Solves "Empty Manager Inbox") ──
async function getManagerInbox(req, res) {
  const result = await service.getManagerInbox(uid(req));
  return sendSuccess(res, result, 200); 
}

async function listAllLeaveRequests(req, res) {
  const roleStr = (req.user?.role || '').toUpperCase();
  const isHRorAdmin = roleStr.includes('HR') || roleStr.includes('ADMIN')||roleStr.includes('MANAGER');
  const query = { ...req.query };
  if (!isHRorAdmin) query.managerId = uid(req);
  
  const result = await service.listLeaveRequests(query);
  return sendSuccess(res, result.requests, 200, result.meta);
}

async function getLeaveRequest(req, res) {
  return sendSuccess(res, await service.getLeaveRequestById(parseInt(req.params.id, 10)));
}

// Replace the existing approveReject function with this:
async function approveReject(req, res) {
  // 1. Extract from either camelCase or PascalCase
  const rawDecision = req.body.Decision || req.body.decision;
  const comments = req.body.Comments || req.body.comments || '';

  if (!rawDecision) {
    throw new AppError('Decision is required', 400);
  }

  // 2. Normalize to exactly what the service explicitly checks for ('APPROVE' or 'REJECT')
  let decision = String(rawDecision).toUpperCase();
  if (decision.includes('APPROVE')) decision = 'APPROVE';
  else if (decision.includes('REJECT')) decision = 'REJECT';

  // 3. Send the clean, mapped payload to the service
  return sendSuccess(res, await service.processApproval(
    parseInt(req.params.id, 10), 
    uid(req), 
    { decision, comments }
  ));
}
// ── FIX: Inject dates internally to bypass Joi date failures on Delegation ──
// Replace in leave.controller.js
async function delegateApproval(req, res) {
  const mappedData = {
    delegateId: req.body.delegateTo || req.body.delegateId,
    startDate: req.body.startDate || req.body.StartDate || new Date().toISOString(),
    endDate: req.body.endDate || req.body.EndDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
    comments: req.body.comments || req.body.Comments || ''
  };

  return sendSuccess(
    res,
    await service.delegateApproval(null, uid(req), mappedData)
  );
}
async function listHolidays(req, res) { return sendSuccess(res, await service.listHolidays(req.query)); }
async function createHoliday(req, res) { return sendSuccess(res, await service.createHoliday(req.body), 201); }
async function getLeaveAnalytics(req, res) { return sendSuccess(res, await service.getLeaveAnalytics(req.query)); }

// ── FIX: Map CancelReason to camelCase securely ──
const cancelLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reason = req.body.CancelReason || req.body.cancelReason;
    
    if (!reason?.trim()) {
      throw new AppError('Cancellation reason is required.', 400, 'MISSING_REASON');
    }

    const result = await service.cancelLeaveRequest(
      parseInt(id, 10),
      uid(req),
      { cancelReason: reason.trim() }
    );

    res.json({ success: true, message: 'Leave request cancelled successfully', data: result });
  } catch (err) {
    next(err);
  }
};

// ── FIX: Payroll Sync Handler ──
const syncLeaveToPayroll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { periodYear, periodMonth } = req.body;
    if (!periodYear || !periodMonth) throw new AppError('periodYear and periodMonth are required.', 400);

    let result;
    if (id) {
      const request = await service.getLeaveRequestById(parseInt(id, 10));
      result = await service.syncLeaveToPayroll(request.EmployeeID, periodYear, periodMonth);
    } else {
      result = await service.bulkSyncPayroll(periodYear, periodMonth, uid(req));
    }
    res.json({ success: true, message: 'Leave data synced with payroll', data: result });
  } catch (err) { next(err); }
};
// ── NEW: Entitlement Management (LV-012) ──
async function updateGlobalEntitlements(req, res) {
  return sendSuccess(res, await service.updateGlobalEntitlements(req.body, uid(req)), 200);
}
async function bulkSyncPayroll(req, res, next) {
  try {
    const { periodYear, periodMonth } = req.body;
    const result = await service.bulkSyncPayroll(
      parseInt(periodYear, 10) || new Date().getFullYear(),
      parseInt(periodMonth, 10) || (new Date().getMonth() + 1),
      req.user.EmployeeID || req.user.id
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
/**
 * REQ-041: Trigger Year-End Carryover
 */
async function triggerYearEndCarryover(req, res) {
  const { previousYear, nextYear, maxCarryDays } = req.body;
  
  if (!previousYear || !nextYear) {
    throw new AppError('PreviousYear and NextYear are required.', 400);
  }

  const result = await service.performYearEndCarryOver(
    parseInt(previousYear, 10),
    parseInt(nextYear, 10),
    parseInt(maxCarryDays || 5, 10) // Default to 5 days if not provided
  );

  return sendSuccess(res, { message: 'Year-end carryover processed successfully', processed: result.count });
}
module.exports = {
  listLeaveTypes, createLeaveType, triggerYearEndCarryover ,listLeavePolicies, createLeavePolicy,
  getMyLeaveBalances, initializeBalances, adjustBalance,bulkProcessRequests,
  submitLeaveRequest, getMyLeaveRequests, listAllLeaveRequests, getLeaveRequest,
  approveReject, delegateApproval, getManagerInbox,bulkSyncPayroll,
  listHolidays, createHoliday, getLeaveAnalytics, updateLeaveRequest, cancelLeave, syncLeaveToPayroll,updateGlobalEntitlements
};