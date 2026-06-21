// src/api/services.js helper — unwrap { success, data: {...} } envelope
// Used by pages to safely extract the inner payload

/**
 * Unwrap the backend envelope.
 * Backend always returns: { success: true, data: <actual payload> }
 * Axios adds its own .data, so res.data = { success, data: payload }
 * Call unwrap(res) to get the actual payload directly.
 */
export function unwrap(res) {
  const outer = res?.data;
  // If the response has a "data" key that is the real payload, use it
  if (outer && typeof outer === 'object' && 'data' in outer) return outer.data;
  return outer;
}

/**
 * Safely get an array from a response, trying multiple possible keys.
 * e.g. safeArray(res, ['balances','items','data']) → first array found
 */
export function safeArray(res, keys = []) {
  const payload = unwrap(res);
  if (Array.isArray(payload)) return payload;
  for (const k of keys) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

import api from './axios';

// ─── AUTH ──────────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  refresh:        (data) => api.post('/auth/refresh', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ─── EMPLOYEES ─────────────────────────────────────────────────────────────
export const employeeAPI = {
  list:               (params) => api.get('/employees', { params }),
  get:                (id)     => api.get(`/employees/${id}`),
  getMe:              ()       => api.get('/employees/me'),
  create:             (data)   => api.post('/employees', data),
  update:             (id, data) => api.patch(`/employees/${id}`, data),
  terminate:          (id, data) => api.post(`/employees/${id}/terminate`, data),
  getDepartments:     ()       => api.get('/employees/departments'),
  createDepartment:   (data)   => api.post('/employees/departments', data),
  getPositions:       ()       => api.get('/employees/positions'),
  createPosition:     (data)   => api.post('/employees/positions', data),
  getWorkLocations:   ()       => api.get('/employees/work-locations'),
  getSalaryHistory:   (id)     => api.get(`/employees/${id}/salary`),
  createSalaryRecord: (id, d)  => api.post(`/employees/${id}/salary`, d),
  getAuditLog:        (id)     => api.get(`/employees/${id}/audit`),
  getOrgChart:        (id)     => api.get(`/employees/${id}/org-chart`),
  submitChangeRequest:(id, d)  => api.post(`/employees/${id}/change-requests`, d),
  listMyChangeRequests:()      => api.get('/employees/me/change-requests'),
  reviewChangeRequest:(rId, d) => api.patch(`/employees/change-requests/${rId}`, d),
  getNotifications:   (p)      => api.get('/employees/me/notifications', { params: p }),
  markNotificationsRead:(data) => api.patch('/employees/me/notifications/read', data),
  reactivate:         (id)     => api.post(`/employees/${id}/reactivate`),
  getContacts:    (id) => api.get(`/employees/${id}/emergency-contacts`),
  addContact:     (id, data) => api.post(`/employees/${id}/emergency-contacts`, data),
  deleteContact:  (id, contactId) => api.delete(`/employees/${id}/emergency-contacts/${contactId}`),
uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('photo', file); // 'photo' MUST match the backend exactly
    
    return api.post('/employees/upload-photo', formData, {
      // Setting this to undefined forces Axios to automatically attach 
      // the correct multipart boundary string that Multer is looking for!
      headers: {
        'Content-Type': undefined 
      }
    });
  },

  // Skills
  getSkills:      (id) => api.get(`/employees/${id}/skills`),
  addSkill:       (id, data) => api.post(`/employees/${id}/skills`, data),
  deleteSkill:    (id, skillId) => api.delete(`/employees/${id}/skills/${skillId}`),
  // Add this inside employeeAPI
  getAllPendingRequests: () => api.get('/employees/change-requests/pending'),
// Completeness
  getCompleteness: (id) => api.get(`/employees/${id}/completeness`),
  sendReminder:    (id) => api.post(`/employees/${id}/remind-completeness`),
  
  // Documents
  getDocuments:    (id) => api.get(`/employees/${id}/documents`),
  deleteDocument:  (id, docId) => api.delete(`/employees/${id}/documents/${docId}`),
  uploadDocument:  (id, data, file) => {
    const formData = new FormData();
    formData.append('document', file); // physical file
    formData.append('DocumentTitle', data.DocumentTitle);
    formData.append('DocumentType', data.DocumentType);
    if (data.ExpiryDate) formData.append('ExpiryDate', data.ExpiryDate);
    
    return api.post(`/employees/${id}/documents`, formData, {
      headers: { 'Content-Type': undefined } // Let Axios handle boundary
    });
  },
  // Add these inside your export const employeeAPI = { ... }
  
  // Epic 3: Manager Self-Service
  getMyTeam:           () => api.get('/employees/me/team'),
  getTimeline:         (id) => api.get(`/employees/${id}/timeline`),
  getNotes:            (id) => api.get(`/employees/${id}/notes`),
  addNote:             (id, data) => api.post(`/employees/${id}/notes`, data),
  
  // Add this new one for Managers:
  getTeamPendingRequests: () => api.get('/employees/me/team/change-requests'),
  updatePhoto: (id, url) => api.patch(`/employees/${id}/photo`, { PhotoURL: url }),
  // Add these inside your export const employeeAPI = { ... }
  downloadVerification: (id) => api.get(`/employees/${id}/letters/verification`, { responseType: 'blob' }),
  downloadContract:     (id) => api.get(`/employees/${id}/letters/contract`, { responseType: 'blob' }),

  // Add this specific line for updating contacts:
  updateContact: (id, contactId, data) => api.patch(`/employees/${id}/contacts/${contactId}`, data),

  assignRole:            (id, role) => api.patch(`/employees/${id}/role`, { role }),
  getFieldVisibility:    () => api.get('/employees/settings/field-visibility'),
  updateFieldVisibility: (data) => api.put('/employees/settings/field-visibility', data),
};

// ─── ATTENDANCE (patched) ────────────────────────────────────────────────────
// Drop-in replacement for the attendanceAPI block in src/api/services.js
// One line added:  listOvertimeRequests  (was missing — manager inbox + employee view)
// Naming/style kept identical to the rest of the file.
// ─── ATTENDANCE (patched) ────────────────────────────────────────────────────
// Drop-in replacement for the attendanceAPI block in src/api/services.js
// One line added:  listOvertimeRequests  (was missing — manager inbox + employee view)
// Naming/style kept identical to the rest of the file.

export const attendanceAPI = {
  getDashboardKPIs:       ()           => api.get('/attendance/dashboard/kpis'),
  getTodayStatus:         ()           => api.get('/attendance/dashboard/today'),
  getRecentActivity:      ()           => api.get('/attendance/dashboard/recent-activity'),
  checkIn:                (data)       => api.post('/attendance/check-in', data),
  checkOut:               (data)       => api.post('/attendance/check-out', data),
  list:                   (params)     => api.get('/attendance', { params }),
  createManual:           (data)       => api.post('/attendance/manual', data),
  getCalendarMe:          (params)     => api.get('/attendance/calendar/me', { params }),
  getCalendar:            (id, p)      => api.get(`/attendance/calendar/${id}`, { params: p }),
  getRecord:              (id)         => api.get(`/attendance/${id}`),
  submitCorrection:       (id, d)      => api.post(`/attendance/${id}/corrections`, d),
  listCorrections:        (p)          => api.get('/attendance/corrections', { params: p }),       // manager only
  listMyCorrections:      ()           => api.get('/attendance/corrections/me'),                   // employee self-view
  reviewCorrection:       (id, d)      => api.patch(`/attendance/corrections/${id}`, d),
  submitOvertime:         (data)       => api.post('/attendance/overtime', data),
  listOvertimeRequests:   (params)     => api.get('/attendance/overtime', { params }),   // NEW
  approveOvertime:        (id, d)      => api.patch(`/attendance/overtime/${id}/decision`, d),
  listShifts:             ()           => api.get('/attendance/shifts'),
  assignShift:            (data)       => api.post('/attendance/shifts/assign', data),
  getSummaryMe:           (params)     => api.get('/attendance/summary/me', { params }),
  getSummary:             (id, params) => api.get(`/attendance/summary/${id}`, { params }),
  generateSummary:        (id, y, m)   => api.post(`/attendance/summary/${id}/${y}/${m}/generate`),
};
// ─── LEAVE ──────────────────────────────────────────────────────────────────
export const leaveAPI = {
  getTypes:           ()       => api.get('/leave/types'),
  createType:         (data)   => api.post('/leave/types', data),
  getPolicies:        ()       => api.get('/leave/policies'),
  getMyBalances:      (params) => api.get('/leave/my/balances', { params }),
  getMyRequests:      (params) => api.get('/leave/my/requests', { params }),
  runCarryOver: (data) => api.post('/leave/settings/carryover', data),
  // ── FIX: Explicitly set multipart/form-data here ──
  submit:             (data)   => api.post('/leave/requests', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getManagerInbox:    ()       => api.get('/leave/inbox'),
  listAll:            (params) => api.get('/leave/requests', { params }),
  getRequest:         (id)     => api.get(`/leave/requests/${id}`),
  approveReject:      (id, d)  => api.patch(`/leave/requests/${id}/approve`, d),
  updateGlobalEntitlements: (data) => api.post('/leave/admin/update-entitlements', data),
  bulkProcess: (data) => api.post('/leave/requests/bulk', data),
  // FIXED: Cancel mapped safely
  cancel:             (id, payload) => api.patch(`/leave/requests/${id}/cancel`, payload),
  // FIXED: Update Request mapped to PATCH
  updateRequest:      (id, data) => api.patch(`/leave/requests/${id}`, data), 
  
  syncPayroll:        (payload) => api.post('/leave/sync/payroll/bulk', payload),
  syncPayrollSingle:  (id, payload) => api.post(`/leave/requests/${id}/sync-payroll`, payload),
// api/services.js
delegate: (d) => api.post(`/leave/delegate`, d),  // ← no id, POST not PATCH
  initializeBalances: (data)   => api.post('/leave/balances/initialize', data),
  adjustBalance:      (data)   => api.post('/leave/balances/adjust', data),
  getHolidays:        ()       => api.get('/leave/holidays'),
  createHoliday:      (data)   => api.post('/leave/holidays', data),
  getAnalytics:       ()       => api.get('/leave/analytics'),
};

export const notificationAPI = {
  list: () => api.get('/notifications'), // This matches the 404 URL in your log
  markAllAsRead: () => api.patch('/notifications/read-all'),
};
// ─── PAYROLL ─────────────────────────────────────────────────────────────────
export const payrollAPI = {
  getDashboard:       ()       => api.get('/payroll/dashboard'),
  getPayGrades:       ()       => api.get('/payroll/pay-grades'),
  createPayGrade:     (data)   => api.post('/payroll/pay-grades', data),
  getPayTypes:        ()       => api.get('/payroll/pay-types'),
  getOvertimeRules:   ()       => api.get('/payroll/overtime-rules'),
  getAllowances:       ()       => api.get('/payroll/allowances'),
  getShiftDiffs:      ()       => api.get('/payroll/shift-differentials'),
  getPolicies:        ()       => api.get('/payroll/policies'),
  createPolicy:       (data)   => api.post('/payroll/policies', data),
  listRuns:           (params) => api.get('/payroll/runs', { params }),
  createRun:          (data)   => api.post('/payroll/runs', data),
  getRun:             (id)     => api.get(`/payroll/runs/${id}`),
  processRun:         (id, d)  => api.post(`/payroll/runs/${id}/process`, d),
  approveRun:         (id, d)  => api.post(`/payroll/runs/${id}/approve`, d),
  createOvertimeRule: (data) => api.post('/payroll/overtime-rules', data),
createPayType:      (data) => api.post('/payroll/pay-types', data),
updateEntryStatus: (id, data) => api.patch(`/payroll/entries/${id}/status`, data),
submitDispute:   (data)   => api.post('/payroll/disputes', data),
listMyDisputes:  ()       => api.get('/payroll/disputes/me'),
getTaxBrackets:    ()      => api.get('/payroll/tax-brackets'),
createTaxBracket:  (data)  => api.post('/payroll/tax-brackets', data),
updateEntryStatus: (id, d) => api.patch(`/payroll/entries/${id}/status`, d),
getDeptReport:          (runId)  => api.get(`/payroll/reports/department?runId=${runId}`),
  finalizeRun:        (id)     => api.post(`/payroll/runs/${id}/finalize`),
  generatePayslips:   (id)     => api.post(`/payroll/runs/${id}/payslips`),
  generateBankFile:   (id, d)  => api.post(`/payroll/runs/${id}/bank-file`, d),
  listExceptions:     ()       => api.get('/payroll/exceptions'),
  resolveException:   (id, d)  => api.patch(`/payroll/exceptions/${id}/resolve`, d),
  getMyPayslips:      ()       => api.get('/payroll/payslips/me'),
  getPayslip:         (id)     => api.get(`/payroll/payslips/${id}`),
  getActiveDays:      (params) => api.get('/payroll/active-days', { params }),
  // ─── NEW: Reimbursement Claims (EM-005) ───
  listReimbursements: (params) => api.get('/payroll/reimbursements', { params }),
  submitReimbursement: (data)   => api.post('/payroll/reimbursements', data),
// THIS is the line your console is looking for:
  actionReimbursement: (id, data) => api.patch(`/payroll/reimbursements/${id}/action`, data),

};