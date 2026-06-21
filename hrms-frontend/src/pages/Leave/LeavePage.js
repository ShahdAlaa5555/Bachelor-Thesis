// src/pages/Leave/LeavePage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CalendarDays, Plus, Check, X, Clock, AlertCircle,
  Send, BarChart2, Calendar, Edit3, Users, Settings,
  RefreshCw, ArrowRightLeft, Shield, CheckSquare, Square,FileText, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leaveAPI, notificationAPI, employeeAPI } from '../../api/services';
import { Modal, Badge, SkeletonCard, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';

// ─── SAFE ERROR EXTRACTOR ────────────────────────────────────────────────────
const getErrMsg = (err) => {
  const d = err.response?.data;
  if (d?.error?.message) return d.error.message;
  if (typeof d?.error === 'string') return d.error;
  if (typeof d?.message === 'string') return d.message;
  return err.message || 'An unexpected error occurred';
};

// ─── INLINE MODAL ────────────────────────────────────────────────────────────
const InlineModal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
    <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 8 }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
         <div className="card-title" style={{ fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>{title}</div>
         <button className="btn btn-ghost" style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose}><X size={18}/></button>
      </div>
      <div style={{ padding: '1rem' }}>
        {children}
      </div>
    </div>
  </div>
);

// ─── STATUS CONSTANTS & HELPERS ──────────────────────────────────────────────
const STATUS_LABEL = {
  SUBMITTED: 'Submitted', PENDING_MANAGER: 'Pending Approval',
  PendingManager: 'Pending Approval', PENDING_HR: 'Pending HR',
  APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
  DRAFT: 'Draft', Submitted: 'Submitted', Pending: 'Pending Approval',
  Approved: 'Approved', Rejected: 'Rejected', Cancelled: 'Cancelled',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' }, { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PENDING_MANAGER', label: 'Pending Approval' }, { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' }, { value: 'CANCELLED', label: 'Cancelled' },
];

const normStatus = s => (s || '').toUpperCase().replace(/_/g, '');
const statusMatches = (reqStatus, filterValue) => {
  if (!filterValue) return true;
  const rs = normStatus(reqStatus);
  const fv = normStatus(filterValue);
  if (rs === fv) return true;
  const allPending = new Set(['PENDINGMANAGER','PENDINGHR','SUBMITTED','PENDING','DRAFT']);
  if (fv === 'PENDINGMANAGER' && allPending.has(rs)) return true;
  return false;
};
const isFinalStatus = s => ['APPROVED','REJECTED','CANCELLED'].includes(normStatus(s));

const toArr = (r) => {
  if (!r) return [];
  const d = r.data?.data || r.data?.requests || r.data || r.requests || r || [];
  return Array.isArray(d) ? d : [];
};

function RequestRow({ req, onAction, onEdit, onOverrideClick, isSupervisor, isHRManager, isBasicHR, currentUser, isSelected, onSelect, onVerifyDoc }) {
  const [acting, setActing] = useState('');
  
  const leaveTypeName = req.LeaveType?.LeaveTypeName || req.LeaveTypeName || '—';
  const empFullName = req.Employee?.FullName || req.EmployeeName || '—';
  const id = req.LeaveRequestID || req.id;
  const docPath = req.DocumentReference || req.AttachmentURL; 

  const act = async (action) => {
    setActing(action);
    try { await onAction(id, action); } finally { setActing(''); }
  };

  const currentStatus = req.Status || 'SUBMITTED';
  const isFinal = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(currentStatus.toUpperCase());
  
  const currentUserId = currentUser?.EmployeeID || currentUser?.id;
  const isHREmployee = [1, 10, 21].includes(parseInt(req.Employee?.PositionID, 10));
  const isDirectReport = req.Employee?.SupervisorID === currentUserId;

  const canApproveReject = !isFinal && (
    (isSupervisor && !isHRManager) || 
    (isHRManager && (isHREmployee || isDirectReport))
  );

  return (
    <tr style={{ background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'inherit' }}>
      {isHRManager && (
        <td>
          <button className="btn btn-ghost p-1" onClick={() => onSelect(id)}>
            {isSelected ? <CheckSquare size={16} color="var(--blue)" /> : <Square size={16} color="#ccc" />}
          </button>
        </td>
      )}
      <td><div style={{ fontWeight: 500 }}>{leaveTypeName}</div></td>
      <td><div style={{ fontWeight: 500 }}>{empFullName}</div></td>
      <td style={{ fontSize: '0.82rem' }}>
        {new Date(req.StartDate).toLocaleDateString()} → {new Date(req.EndDate).toLocaleDateString()}
      </td>
      <td>{req.TotalDays}</td>
      <td>
        <Badge status={currentStatus.toUpperCase()}>{currentStatus}</Badge>
      </td>
      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 160 }}>{req.Reason}</td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          
          {(isHRManager || isSupervisor) && docPath && (
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => onVerifyDoc(docPath)} 
              style={{ color: 'var(--blue)', border: '1px solid var(--blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FileText size={13} /> View Doc
            </button>
          )}

          {canApproveReject && (
            <>
              <button className="btn btn-success btn-sm" onClick={() => act('approve')} disabled={!!acting}>Approve</button>
              <button className="btn btn-danger btn-sm" onClick={() => act('reject')} disabled={!!acting}>Reject</button>
            </>
          )}
          {isHRManager && isFinal && currentStatus !== 'CANCELLED' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onOverrideClick(req)}><Shield size={13}/> Override</button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────
function BalanceCard({ balance, loading }) {
  if (loading) return <SkeletonCard />;
  const name = balance.leaveTypeName || balance.LeaveTypeName || balance.LeaveType?.LeaveTypeName || 'Leave';
  
  const used = Number(balance.usedDays ?? balance.UsedDays ?? 0);
  const entitled = Number(balance.entitledDays ?? balance.EntitledDays ?? 0);
  const carryOver = Number(balance.carryOverDays ?? balance.CarryOverDays ?? 0);
  const adjusted = Number(balance.adjustedDays ?? balance.AdjustedDays ?? 0);
  
  const remaining = Math.max(0, entitled + carryOver + adjusted - used);
  const maxDays = entitled + carryOver + adjusted;
  const pct = maxDays > 0 ? Math.round((remaining / maxDays) * 100) : 0;

  const color = name.includes('Sick') || name.includes('Medical') ? 'var(--green)' : 
                name.includes('Emergency') ? 'var(--red)' : 'var(--blue)';

  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase' }}>{name}</div>
        <CalendarDays size={18} style={{ color }} />
      </div>
      <div className="stat-card-value" style={{ color }}>{remaining}</div>
      <div className="stat-card-label">days remaining of {maxDays}</div>
      <div className="stat-card-progress" style={{ marginTop: 12 }}><div className="stat-card-progress-bar" style={{ width: `${pct}%`, background: color }} /></div>
      <div className="stat-card-meta"><span>{used} used (Approved)</span><span>{pct}%</span></div>
    </div>
  );
}

// ─── MODALS & FORMS ──────────────────────────────────────────────────────────
function SubmitLeaveForm({ leaveTypes, onSubmit, loading }) {
const [form, setForm] = useState({ LeaveTypeID: '', startDate: '', endDate: '', reason: '', isHalfDay: false, documentReference: null });

const handle = () => {
  if (!form.LeaveTypeID || !form.startDate || !form.endDate) {
    return toast.error("Please fill all required fields");
  }

  const data = new FormData();
  data.append('leaveTypeId', form.LeaveTypeID);
  data.append('startDate', form.startDate);
  data.append('endDate', form.endDate);
  data.append('reason', form.reason || '');
  data.append('isHalfDay', form.isHalfDay);

  if (form.documentReference) {
    data.append('documentReference', form.documentReference);
  }

  onSubmit(data);
};

  return (
    <>
      <div className="form-group"><label className="form-label required">Leave Type</label>
        <select className="form-select" value={form.LeaveTypeID} onChange={e => setForm({...form, LeaveTypeID: e.target.value})}>
          <option value="">— Select a leave type —</option>
          {leaveTypes.map(t => <option key={t.LeaveTypeID || t.id} value={t.LeaveTypeID || t.id}>{t.LeaveTypeName || t.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label required">Start Date</label><input className="form-input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} /></div>
        <div className="form-group"><label className="form-label required">End Date</label><input className="form-input" type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({...form, endDate: e.target.value})} /></div>
      </div>
      <div className="form-group">
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.875rem',userSelect:'none'}}>
          <input type="checkbox" checked={form.isHalfDay} onChange={e => setForm({...form, isHalfDay: e.target.checked})} />
          <span>Half-day</span>
        </label>
      </div>
      <div className="form-group"><label className="form-label">Reason</label><textarea className="form-textarea" rows={2} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} /></div>
      <div className="form-group">
        <label className="form-label">Medical Document (PDF/Image)</label>
        <input 
          className="form-input" 
          type="file" 
          accept="image/*,application/pdf"
          onChange={e => setForm({...form, documentReference: e.target.files[0]})} 
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handle} disabled={loading}>{loading ? <InlineSpinner /> : 'Submit Request'}</button>
      </div>
    </>
  );
}

function EditLeaveForm({ req, onSubmit, loading }) {
  const [form, setForm] = useState({ 
    startDate: req.StartDate ? req.StartDate.split('T')[0] : '', 
    endDate: req.EndDate ? req.EndDate.split('T')[0] : '', 
    reason: req.Reason || '' 
  });

  const handle = () => {
    if (!form.startDate || !form.endDate) return toast.error("Required fields missing");
    onSubmit(req.LeaveRequestID || req.id, {
      StartDate: new Date(form.startDate).toISOString(),
      EndDate: new Date(form.endDate).toISOString(),
      Reason: form.reason || null
    });
  };

  return (
    <>
      <div className="form-row">
        <div className="form-group"><label className="form-label required">Start Date</label>
          <input className="form-input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
        </div>
        <div className="form-group"><label className="form-label required">End Date</label>
          <input className="form-input" type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({...form, endDate: e.target.value})} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Reason</label>
        <textarea className="form-textarea" rows={3} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handle} disabled={loading}>{loading ? <InlineSpinner /> : 'Update Request'}</button>
      </div>
    </>
  );
}

// ── RESTORED: DELEGATION PANEL FOR SUPERVISORS ──
function DelegationPanel({ onDelegate, employees }) {
  const [delegateTo, setDelegateTo] = useState('');
  const [until, setUntil] = useState('');
  
  const handleActivate = () => {
    onDelegate( { 
      delegateTo: parseInt(delegateTo, 10), delegateId: parseInt(delegateTo, 10),
      startDate: new Date().toISOString(), StartDate: new Date().toISOString(),
      endDate: new Date(until).toISOString(), EndDate: new Date(until).toISOString(),
      comments: `Delegated until ${until}`, Comments: `Delegated until ${until}` 
    });
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><div className="card-title"><Users size={15} style={{ marginRight: 6 }} />Approval Delegation</div></div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Delegate To</label>
          {employees && employees.length > 0 ? (
            <select className="form-select" value={delegateTo} onChange={e => setDelegateTo(e.target.value)}>
              <option value="">— Select Employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          ) : (
            <input className="form-input" type="number" value={delegateTo} onChange={e => setDelegateTo(e.target.value)} placeholder="Employee ID" />
          )}
        </div>
        <div className="form-group"><label className="form-label">Delegate Until</label><input className="form-input" type="date" value={until} onChange={e => setUntil(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary btn-sm" disabled={!delegateTo || !until} onClick={handleActivate}>Activate Delegation</button>
    </div>
  );
}

function LeaveTypeManager({ types, onAdd }) {
  const [newType, setNewType] = useState({ 
    name: '', code: '', defaultDays: 21,
    isPaid: true, requiresDocument: false, requiresApproval: true
  });
  
  const handleAdd = () => {
    if (!newType.name) return toast.error("Absence type name is required.");
    onAdd({
      LeaveTypeName: newType.name,
      LeaveTypeCode: newType.name.substring(0, 3).toUpperCase(),
      DefaultDays: parseInt(newType.defaultDays, 10),
      IsPaid: newType.isPaid,
      RequiresDocument: newType.requiresDocument,
      RequiresApproval: newType.requiresApproval
    });
  };

  return (
    <div className="card p-4 mb-4">
      <div className="card-title"><Settings size={16} style={{marginRight: 6}}/> Configure Special Absence Types</div>
      <p className="text-muted small mb-3">Create custom leave types (e.g., Unpaid, Bereavement, Sick) and define their system rules.</p>
      
      <div className="form-row mt-3">
        <input className="form-input" placeholder="Absence Name (e.g. Sick Leave)" 
          value={newType.name}
          onChange={e => setNewType({...newType, name: e.target.value})} />
        <input className="form-input" type="number" placeholder="Default Days" 
          value={newType.defaultDays}
          onChange={e => setNewType({...newType, defaultDays: e.target.value})} 
          style={{ maxWidth: '140px' }}/>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginTop: '12px', marginBottom: '16px', fontSize: '0.85rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={newType.isPaid} onChange={e => setNewType({...newType, isPaid: e.target.checked})} />
          Paid Leave
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={newType.requiresDocument} onChange={e => setNewType({...newType, requiresDocument: e.target.checked})} />
          Requires Document (e.g. Med Cert)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={newType.requiresApproval} onChange={e => setNewType({...newType, requiresApproval: e.target.checked})} />
          Requires Manager Approval
        </label>
      </div>

      <button className="btn btn-primary btn-sm mb-4" onClick={handleAdd}>Create Absence Type</button>

      <div className="table-wrap">
        <table className="table-sm">
          <thead><tr><th>Type</th><th>Days</th><th>Rules</th></tr></thead>
          <tbody>
            {types.map((t, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{t.LeaveTypeName}</td>
                <td>{t.DefaultDays || 21}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {t.IsPaid ? <Badge status="APPROVED">Paid</Badge> : <Badge status="REJECTED">Unpaid</Badge>}
                  {t.RequiresDocument && <span style={{ marginLeft: 6 }}>• Docs Req.</span>}
                  {!t.RequiresApproval && <span style={{ marginLeft: 6 }}>• Auto-Approve</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HolidayManager({ holidays, onAdd }) {
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });

  return (
    <div className="card p-4">
      <div className="card-title"><Calendar size={16}/> Holiday & Blocked Days</div>
      <p className="text-muted small mb-3">Managed dates will be excluded from leave balance calculations.</p>
      <div className="form-row">
        <input className="form-input" type="date" onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} />
        <input className="form-input" placeholder="Holiday Name" onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} />
        <button className="btn btn-primary" onClick={() => onAdd(newHoliday)}>Add Date</button>
      </div>
      <div className="mt-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {holidays.map((h, i) => (
          <div key={i} className="d-flex justify-content-between p-2 border-bottom">
            <span>{new Date(h.HolidayDate || h.date).toLocaleDateString()}</span>
            <span className="font-weight-bold">{h.HolidayName || h.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignEntitlementModal({ employees, leaveTypes, onConfirm, onClose, loading }) {
  const [form, setForm] = useState({ 
    EmployeeID: '', LeaveTypeID: '', Year: new Date().getFullYear(), CustomDays: '' 
  });

  return (
    <InlineModal title="Assign Initial Entitlements" onClose={onClose}>
      <p className="text-muted small mb-3">Initialize standard leave balances for a specific employee.</p>
      
      <div className="form-group mb-3">
        <label className="form-label">Target Employee</label>
        <select className="form-select" onChange={e => setForm({...form, EmployeeID: e.target.value})}>
          <option value="">Select Employee...</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </div>

      <div className="form-group mb-3">
        <label className="form-label">Leave Type (Optional)</label>
        <select className="form-select" onChange={e => setForm({...form, LeaveTypeID: e.target.value})}>
          <option value="">All Standard Leave Types (Default)</option>
          {leaveTypes.map(t => <option key={t.LeaveTypeID || t.id} value={t.LeaveTypeID || t.id}>{t.LeaveTypeName || t.name}</option>)}
        </select>
      </div>

      <div className="form-row mb-2">
        <div className="form-group w-full">
          <label className="form-label">Balance Year</label>
          <input className="form-input" type="number" value={form.Year} onChange={e => setForm({...form, Year: e.target.value})} />
        </div>
        <div className="form-group w-full">
          <label className="form-label">Custom Days (Optional)</label>
          <input className="form-input" type="number" step="0.5" placeholder="e.g. 10.5" value={form.CustomDays} onChange={e => setForm({...form, CustomDays: e.target.value})} />
        </div>
      </div>
      <p className="text-muted small mb-4" style={{marginTop: '-10px', fontSize: '0.75rem'}}>
        *Leave "Custom Days" blank to automatically apply the system default rules.
      </p>

      <div className="d-flex gap-2 justify-content-end">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={loading || !form.EmployeeID} onClick={() => onConfirm(form)}>Assign Entitlements</button>
      </div>
    </InlineModal>
  );
}

function ManualAdjustmentModal({ employees, leaveTypes, onConfirm, onClose, loading }) {
  const [form, setForm] = useState({  EmployeeID: '', LeaveTypeID: '', BalanceYear: new Date().getFullYear(), AdjustedDays: '', Reason: '' });

  return (
    <InlineModal title="Manual Balance Adjustment" onClose={onClose}>
      <div className="form-group"><label className="form-label">Employee</label>
        <select className="form-select" onChange={e => setForm({...form, EmployeeID: e.target.value})}>
          <option value="">Select Employee</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </div>
      <div className="form-group"><label className="form-label">Leave Type</label>
        <select className="form-select" onChange={e => setForm({...form, LeaveTypeID: e.target.value})}>
          <option value="">Select Type</option>
          {leaveTypes.map(t => <option key={t.LeaveTypeID || t.id} value={t.LeaveTypeID || t.id}>{t.LeaveTypeName || t.name}</option>)}
        </select>
      </div>
      <div className="form-group"><label className="form-label">Adjustment (+/- Days)</label>
        <input className="form-input" type="number" onChange={e => setForm({...form, AdjustedDays: e.target.value})} placeholder="e.g. 5 or -2" />
      </div>
      <div className="form-group"><label className="form-label">Balance Year</label>
    <input className="form-input" type="number" value={form.BalanceYear} onChange={e => setForm({...form, BalanceYear: e.target.value})} />
  </div>
      <div className="form-group"><label className="form-label">Reason</label>
        <textarea className="form-textarea" rows={2} onChange={e => setForm({...form, Reason: e.target.value})} placeholder="Justification..." />
      </div>
      <div className="d-flex gap-2 mt-4 justify-content-end">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={loading} onClick={() => onConfirm(form)}>{loading ? <InlineSpinner /> : 'Update Balance'}</button>
      </div>
    </InlineModal>
  );
}

function RolePermissionManager({ employees, onUpdate }) {
  const [form, setForm] = useState({ employeeId: '', positionId: '' });
  return (
    <div className="card p-4">
      <div className="card-title"><Shield size={16} style={{marginRight: 6}}/> Roles & Permissions</div>
      <p className="text-muted small mb-3">Assign system roles to employees based on the exact DB Schema.</p>
      <div className="form-row mt-3">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Employee</label>
          <select className="form-select" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})}>
            <option value="">Select Employee...</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">System Role</label>
          <select className="form-select" value={form.positionId} onChange={e => setForm({...form, positionId: e.target.value})}>
            <option value="">Select Role...</option>
            <option value="1">1: HR-MGR (HR Manager)</option>
            <option value="2">2: PROF (Professor)</option>
            <option value="3">3: ASSOC (Associate Professor)</option>
            <option value="4">4: ASST (Assistant Professor)</option>
            <option value="5">5: LECT (Lecturer)</option>
            <option value="6">6: TA (Teaching Assistant)</option>
            <option value="7">7: RA (Research Assistant)</option>
            <option value="8">8: HEAD (Department Head)</option>
            <option value="9">9: DEAN (Dean)</option>
            <option value="10">10: HR-SPEC (HR Specialist)</option>
            <option value="11">11: IT-ENG (IT Engineer)</option>
            <option value="12">12: FIN (Finance Officer)</option>
            <option value="13">13: ADMIN (Administrative Officer)</option>
            <option value="14">14: SEC (Secretary)</option>
            <option value="15">15: LAB-TECH (Lab Technician)</option>
            <option value="16">16: LIB (Librarian)</option>
            <option value="17">17: SECURITY (Security Officer)</option>
            <option value="18">18: MAINT (Maintenance Staff)</option>
            <option value="19">19: PAYROLL (Payroll Specialist)</option>
            <option value="21">21: HR-GEN (HR Generalist)</option>
          </select>
        </div>
      </div>
      <button className="btn btn-primary btn-sm mt-2" disabled={!form.employeeId || !form.positionId} onClick={() => { onUpdate(form); setForm({employeeId: '', positionId: ''}); }}>Update Role</button>
    </div>
  );
}

function LeavePolicyManager({ leaveTypes, onSave }) {
  const [policy, setPolicy] = useState({ LeaveTypeID: '', MinTenureMonths: 0, NoticePeriodDays: 0 });
  return (
    <div className="card p-4">
      <div className="card-title"><CalendarDays size={16} style={{marginRight: 6}}/> Leave Policy Engine</div>
      <p className="text-muted small mb-3">Map tenure and notice period rules for specific leave types as defined by your backend.</p>
      <div className="form-row mt-3">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Leave Type</label>
          <select className="form-select" value={policy.LeaveTypeID} onChange={e => setPolicy({...policy, LeaveTypeID: e.target.value})}>
            <option value="">Select Type...</option>
            {leaveTypes.map(t => <option key={t.LeaveTypeID || t.id} value={t.LeaveTypeID || t.id}>{t.LeaveTypeName || t.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Minimum Tenure (Months)</label>
          <input className="form-input" type="number" value={policy.MinTenureMonths} onChange={e => setPolicy({...policy, MinTenureMonths: e.target.value})} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Required Notice (Days)</label>
          <input className="form-input" type="number" value={policy.NoticePeriodDays} onChange={e => setPolicy({...policy, NoticePeriodDays: e.target.value})} />
        </div>
      </div>
      <button className="btn btn-primary btn-sm mt-2" disabled={!policy.LeaveTypeID} onClick={() => onSave(policy)}>Save Policy Rules</button>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LeavePage() {
  const { user } = useAuth();
  
  // ── EXACT DATABASE ROLE MAPPING ──
  const posId = parseInt(user?.PositionID || user?.positionId || 0, 10);
  const rawRole = String(user?.role || user?.Role || '').toUpperCase();
  const rawTitle = String(user?.position || user?.Position?.PositionTitle || '').toUpperCase();
  

  // 1. HR Manager 
  const isHRManager = posId === 1 || rawTitle === 'HR MANAGER';

  // 2. Basic HR 
  const isBasicHR = !isHRManager && (posId === 10 || posId === 21 || rawRole === 'HR' || rawTitle === 'HR SPECIALIST' || rawTitle === 'HR-GEN');

  // 3. Supervisor (FIXED: Broadened logic to guarantee supervisors are recognized)
  const isSupervisor = !isHRManager && !isBasicHR && (
    posId === 2 || posId === 8 || posId === 9 || 
    rawRole.includes('MANAGER') || rawRole.includes('SUPERVISOR') || rawRole.includes('LEAD') ||
    rawTitle.includes('MANAGER') || rawTitle.includes('SUPERVISOR') || rawTitle.includes('LEAD') || 
    rawTitle.includes('PROFESSOR') || rawTitle.includes('HEAD') || rawTitle.includes('DEAN') ||
    user?.isSupervisor === true || user?.IsSupervisor === true
  );
  
  // ── HR Manager & Supervisors only for Inbox/Company Data ──
  const isManagement = isHRManager || isSupervisor;
  const canDelegate = isHRManager || isSupervisor; 

const [tab, setTab] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') || 'dashboard';
});

  const [balances, setBalances] = useState([]);
  const [myRequests, setMyReqs] = useState([]);
  const [allRequests, setAll] = useState([]);
  const [leaveTypes, setTypes] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [loadBal, setLoadBal] = useState(true);
  const [loadReq, setLoadReq] = useState(true);
  const [loadAll, setLoadAll] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [allFilter, setAllFilter] = useState('');
  const [overrideReq, setOverrideReq] = useState(null); 
  const [editReq, setEditReq] = useState(null); 
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // States for Settings Rules
  const [globalEntitlementType, setGlobalEntitlementType] = useState('');
  const [globalEntitlementDays, setGlobalEntitlementDays] = useState(21);
  const [selectedIds, setSelectedIds] = useState([]); 

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const location = useLocation();



useEffect(() => {
  const params = new URLSearchParams(location.search);
  const tabParam = params.get('tab');
  if (tabParam && tabParam !== tab) setTab(tabParam);
}, [location.search]);

  const selectAllVisible = () => {
    if (selectedIds.length === allRequests.length) setSelectedIds([]);
    else setSelectedIds(allRequests.map(r => r.LeaveRequestID || r.id));
  };
  
  const loadData = useCallback(() => {
    if (!user || (!user.EmployeeID && !user.id)) return;
    setLoadBal(true); setLoadReq(true);
    leaveAPI.getMyBalances().then(r => setBalances(toArr(r))).finally(() => setLoadBal(false));
    leaveAPI.getMyRequests().then(r => setMyReqs(toArr(r))).finally(() => setLoadReq(false));
    
    if (leaveAPI.getTypes) leaveAPI.getTypes().then(r => setTypes(toArr(r)));
    if ((isHRManager || isBasicHR) && leaveAPI.listHolidays) leaveAPI.listHolidays().then(r => setHolidays(toArr(r)));

    // FIX: Supervisors now fetch employee lists so they can use the Delegation panel
    if ((isManagement || isBasicHR) && employeeAPI?.list) {
      employeeAPI.list({ limit: 500 }).then(r => {
        const emps = toArr(r).map(e => ({
          id: e.EmployeeID || e.id,
          name: e.FullName || e.fullName || `Employee #${e.EmployeeID || e.id}`
        }));
        setAllEmployees(emps);
      });
    }

    if (isManagement) {
      setLoadAll(true);
      const fetchMethod = isHRManager 
        ? (leaveAPI.listAll ? leaveAPI.listAll({ managerId: '' }) : leaveAPI.getManagerInbox()) 
        : leaveAPI.getManagerInbox();
        
      fetchMethod
        .then(r => setAll(toArr(r)))
        .catch(() => setAll([]))
        .finally(() => setLoadAll(false));
    } else { setLoadAll(false); }
  }, [isHRManager, isSupervisor, isBasicHR, isManagement]);
  
  useEffect(() => { loadData(); }, [loadData]);

  const uniqueEmployees = Array.from(
    new Map(
      allRequests
        .filter(r => r.EmployeeID || r.employeeId || r.Employee?.EmployeeID)
        .map(r => [
          r.EmployeeID || r.employeeId || r.Employee?.EmployeeID,
          r.Employee?.FullName || r.employeeName || `Employee #${r.EmployeeID || r.employeeId}`
        ])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const employeeDropdownList = allEmployees.length > 0 ? allEmployees : uniqueEmployees;

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') await leaveAPI.approveReject(id, { decision: 'APPROVED' });
      else if (action === 'reject') await leaveAPI.approveReject(id, { decision: 'REJECTED', comments: 'Actioned by Admin' });
      else if (action === 'cancel') await leaveAPI.cancel(id, { CancelReason: 'User Cancelled' });
      toast.success('Action successfully completed');
      loadData();
    } catch (err) { toast.error(getErrMsg(err)); }
  };
  
 const handleBulkAction = async (decision) => {
  if (!selectedIds.length) return;
  const loadingToast = toast.loading(`Processing ${selectedIds.length} requests...`);
  
  try {
    await leaveAPI.bulkProcess({ 
      requestIds: selectedIds, 
      decision: decision, 
      comments: 'Bulk processed by HR Manager' 
    });
    
    toast.success(`Successfully processed requests`, { id: loadingToast });
    setSelectedIds([]);
    loadData();
  } catch (err) {
    toast.error("Bulk processing failed", { id: loadingToast });
  }
};

  const handleEditSubmit = async (id, updatedData) => {
    try {
      setSubmitting(true);
      if(leaveAPI.updateRequest) {
        await leaveAPI.updateRequest(id, updatedData);
      } else {
        throw new Error("Update endpoint not wired to leaveAPI.");
      }
      toast.success("Leave Request Updated!");
      setEditReq(null);
      loadData();
    } catch (err) {
      toast.error(getErrMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEntitlements = async () => {
    if (!globalEntitlementType) return toast.error("Please select a leave type first.");
    try {
      await leaveAPI.updateGlobalEntitlements({ 
        defaultEntitlement: globalEntitlementDays,
        leaveTypeId: globalEntitlementType
      });
      toast.success("Entitlements updated system-wide.");
      loadData();
    } catch (err) {
      toast.error(getErrMsg(err));
    }
  };

const handlePayrollSync = () => {
  const now = new Date();
  leaveAPI.syncPayroll({ periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 })
    .then(() => toast.success("Payroll successfully synced"))
    .catch(err => toast.error(getErrMsg(err)));
};
  const TABS = [
    { id: 'dashboard', label: 'Dashboard',   icon: BarChart2 },
    { id: 'history',   label: 'My History',  icon: Clock },
    ...(isManagement ? [ { id: 'all', label: isHRManager ? 'Company Data' : 'Team Inbox', icon: Users } ] : []),
    ...(isHRManager || isBasicHR ? [ { id: 'settings', label: 'Settings', icon: Settings } ] : []),
  ];

  return (
    <>
      {overrideReq && isHRManager && (
        <InlineModal title="HR Security Override" onClose={() => setOverrideReq(null)}>
          <p>Manual override for <strong>{overrideReq.Employee?.FullName}</strong>.</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button className="btn btn-success" onClick={() => { handleAction(overrideReq.LeaveRequestID || overrideReq.id, 'approve'); setOverrideReq(null); }}>Force Approve</button>
            <button className="btn btn-danger" onClick={() => { handleAction(overrideReq.LeaveRequestID || overrideReq.id, 'reject'); setOverrideReq(null); }}>Force Reject</button>
          </div>
        </InlineModal>
      )}
      {viewingDoc && (
  <InlineModal title="Document Verification" onClose={() => setViewingDoc(null)}>
    <div style={{ width: '100%', height: '70vh' }}>
      {viewingDoc.toLowerCase().endsWith('.pdf') ? (
        <iframe 
          src={`http://localhost:3000/${viewingDoc}`} 
          width="100%" 
          height="100%" 
          title="Medical PDF"
        />
      ) : (
        <img 
          src={`http://localhost:3000/${viewingDoc}`} 
          style={{ width: '100%', objectFit: 'contain' }} 
          alt="Medical Evidence" 
        />
      )}
    </div>
  </InlineModal>
)}

      {editReq && (
        <InlineModal title="Edit Leave Request" onClose={() => setEditReq(null)}>
           <EditLeaveForm req={editReq} onSubmit={handleEditSubmit} loading={submitting} />
        </InlineModal>
      )}

      {showAssignModal && isBasicHR && (
        <AssignEntitlementModal 
          employees={employeeDropdownList}
          leaveTypes={leaveTypes}
          onClose={() => setShowAssignModal(false)}
          onConfirm={(data) => {
            leaveAPI.initializeBalances({ 
              EmployeeID: parseInt(data.EmployeeID, 10), 
              BalanceYear: parseInt(data.Year, 10),
              LeaveTypeID: data.LeaveTypeID ? parseInt(data.LeaveTypeID, 10) : undefined,
              CustomDays: data.CustomDays ? parseFloat(data.CustomDays) : undefined 
            })
            .then(() => { toast.success("Entitlements Assigned!"); setShowAssignModal(false); loadData(); })
            .catch(err => toast.error(getErrMsg(err)));
          }}
        />
      )}

  {showAdjustmentModal && isHRManager && (
  <ManualAdjustmentModal
    employees={employeeDropdownList}
    leaveTypes={leaveTypes}
    onClose={() => setShowAdjustmentModal(false)}
    onConfirm={(d) => leaveAPI.adjustBalance({
      EmployeeID: parseInt(d.EmployeeID, 10),
      LeaveTypeID: parseInt(d.LeaveTypeID, 10),
      BalanceYear: parseInt(d.BalanceYear, 10),
      AdjustedDays: parseFloat(d.AdjustedDays),
      Reason: d.Reason
    }).then(() => {
      toast.success("Balance Adjusted");
      setShowAdjustmentModal(false);
      loadData();
    }).catch(err => toast.error(getErrMsg(err)))}
  />
)}
      {isSubmitModalOpen && (
        <InlineModal title="Submit Leave Request" onClose={() => setIsSubmitModalOpen(false)}>
           <SubmitLeaveForm 
             leaveTypes={leaveTypes} 
             onSubmit={(p) => {
               setSubmitting(true);
               leaveAPI.submit(p)
                 .then(() => { 
                   toast.success("Leave Request Submitted Successfully!", {
                     icon: '🎉'
                   }); 
                   setIsSubmitModalOpen(false); 
                   loadData(); 
                 })
                 .catch(err => {
                   const backendMsg = getErrMsg(err);
                   if (backendMsg.includes('Insufficient leave balance')) {
                     toast.error("Oops! You don't have enough leave balance for these dates.", { icon: '⚖️' });
                   } else if (backendMsg.includes('Notice period')) {
                     toast.error("Please submit this request a bit earlier to meet the notice period policy.", { icon: '⏳' });
                   } else if (backendMsg.includes('Tenure')) {
                     toast.error("You haven't been with us quite long enough to use this specific leave type yet.", { icon: '🌱' });
                   } else {
                     toast.error("We couldn't submit your request. Please check your details and try again.", { icon: '🛑' });
                   }
                 })
                 .finally(() => {
                   setSubmitting(false);
                 });
             }} 
             loading={submitting} 
           />
        </InlineModal>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
        <div><h1>Leave Management</h1><p>Control requests, balances, and system rules</p></div>
        <button className="btn btn-primary" onClick={() => setIsSubmitModalOpen(true)}><Plus size={18} style={{ marginRight: 8 }} /> New Request</button>
      </div>

      <div className="tabs" style={{ padding: '0 1rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={14} style={{ marginRight: 6 }} />{label}</button>
        ))}
      </div>

      <div style={{ padding: '1rem' }}>
        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div className="grid-4" style={{ marginBottom: 28 }}>
            {loadBal ? <SkeletonCard /> : balances.length === 0 ? <div style={{ padding: 20 }}>No Balances Found</div> : balances.map((b, i) => <BalanceCard key={i} balance={b} loading={false} />)}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          <div className="card">
            <div className="card-header"><div className="card-title">My Personal History</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Period</th><th>Days</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{myRequests.filter(r => statusMatches(r.Status, historyFilter)).map((req, i) => <RequestRow key={i} req={req} onAction={handleAction} onEdit={setEditReq} isSupervisor={false} isHRManager={false} currentUser={user} />)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── COMPANY DATA / TEAM INBOX ── */}
        {tab === 'all' && isManagement && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

    {/* RESTORED: Delegation Panel displays directly inside the Team Inbox for Supervisors */}
    {canDelegate && (
      <DelegationPanel 
        employees={employeeDropdownList} 
        onDelegate={( data) => {
          if(leaveAPI.delegate) {
            leaveAPI.delegate(data).then(() => { toast.success("Delegation active!"); loadData(); }).catch(err => toast.error(getErrMsg(err)));
          } else {
            toast.success("Delegation data sent! (Hook up API)");
          }
        }} 
      />
    )}

    {/* Bulk Bar */}
    {isHRManager && selectedIds.length > 0 && (
      <div className="card p-3" style={{ background: 'var(--blue)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>{selectedIds.length} Requests Selected</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleBulkAction('APPROVE')}>Bulk Approve</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleBulkAction('REJECT')}>Bulk Reject</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'white' }} onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      </div>
    )}

    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="card-title">{isHRManager ? 'Company-Wide Leaves' : 'Team Inbox'}</div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}><RefreshCw size={14}/></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {isHRManager && <th style={{ width: 40 }}>
                <button className="btn btn-ghost p-1" onClick={selectAllVisible}>
                  {selectedIds.length === allRequests.length && allRequests.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>}
              <th>Leave Type</th>
              <th>Employee</th>
              <th>Period</th>
              <th>Days</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
         <tbody>
  {allRequests
    .filter(r => statusMatches(r.Status, allFilter))
    .map((req, i) => (
      <RequestRow 
        key={req.LeaveRequestID || i} 
        req={req} 
        onAction={handleAction} 
        onOverrideClick={setOverrideReq} 
        isSupervisor={isSupervisor} 
        isHRManager={isHRManager} 
        isBasicHR={isBasicHR} 
        currentUser={user}
        isSelected={selectedIds.includes(req.LeaveRequestID || req.id)}
        onSelect={toggleSelect}
        onVerifyDoc={(path) => setViewingDoc(path)}
      />
    ))}
</tbody>
        </table>
      </div>
    </div>
  </div>
)}
        {/* ── SETTINGS (FEATURES SEPARATED) ── */}
        {tab === 'settings' && (isHRManager || isBasicHR) && (
          <div className="settings-grid">
            
            {/* ── BASIC HR ── */}
            {isBasicHR && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <LeaveTypeManager types={leaveTypes} onAdd={d => leaveAPI.createType(d).then(() => { toast.success("Type created!"); loadData(); })} />
                <HolidayManager holidays={holidays} onAdd={d => leaveAPI.createHoliday(d).then(() => { toast.success("Holiday created!"); loadData(); })} />
                <div className="card p-4">
                  <div className="card-title mb-3"><Users size={16} className="mr-2"/> Employee Entitlements</div>
                  <button className="btn btn-outline-success" onClick={() => setShowAssignModal(true)}>
                     Assign Entitlements to Employee
                  </button>
                </div>
                
                <LeavePolicyManager leaveTypes={leaveTypes} onSave={(data) => {
                   if(leaveAPI.createPolicy) { leaveAPI.createPolicy(data).then(() => toast.success("Leave policy rules updated")); }
                   else { toast.success("Leave Policy defined! (Hook up leaveAPI.createPolicy to backend)"); }
                }} />
                
                <RolePermissionManager employees={employeeDropdownList} onUpdate={(data) => {
                   if(employeeAPI.updateRole) { employeeAPI.updateRole(data).then(() => toast.success("Role updated successfully!")); }
                   else { toast.success("Role set! (Hook up employeeAPI.updateRole to backend)"); }
                }} />
              </div>
            )}

            {/* ── HR MANAGER ── */}
            {isHRManager && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card p-4">
                  <div className="card-title mb-4"><Shield size={18} style={{marginRight:8}}/> Leave Calculation Engine</div>
                  
                  <div className="form-row mb-3">
                    <div className="form-group w-full" style={{ flex: 1 }}>
                      <label className="form-label">Target Leave Type</label>
                      <select 
                        className="form-select" 
                        value={globalEntitlementType} 
                        onChange={e => setGlobalEntitlementType(e.target.value)}
                      >
                        <option value="">Select Type...</option>
                        {leaveTypes.map(t => (
                          <option key={t.LeaveTypeID || t.id} value={t.LeaveTypeID || t.id}>
                            {t.LeaveTypeName || t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group w-full" style={{ flex: 1 }}>
                      <label className="form-label">Entitlement (Days)</label>
                      <div className="d-flex gap-2">
                        <input 
                          className="form-input" 
                          type="number" 
                          value={globalEntitlementDays} 
                          onChange={e => setGlobalEntitlementDays(e.target.value)} 
                          style={{ width: '100px' }}
                        />
                        <button className="btn btn-primary" onClick={handleUpdateEntitlements}>
                          Update Calculations
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-muted small mb-4">
                    Changing this value will mass-update the entitlement for all employees under the selected leave type.
                  </p>

                  <div className="border-top pt-4">
                    <div className="card-title mb-3 small">Advanced Actions</div>
                    <div className="d-flex gap-3">
                      <button className="btn btn-outline-primary" onClick={handlePayrollSync}>
                        <RefreshCw size={14} className="mr-2"/> Sync Approved Leaves
                      </button>
                     
<button 
  className="btn btn-outline-warning" 
  onClick={() => {
    if(window.confirm("Are you sure you want to run year-end carryover?")) {
      leaveAPI.runCarryOver({ 
        previousYear: 2025, 
        nextYear: 2026, 
        maxCarryDays: 5 
      }).then(() => toast.success("Carryover complete!"))
        .catch(err => toast.error(getErrMsg(err)));
    }
  }}
>
  <RefreshCw size={14} className="mr-2"/> Run Year-End Carryover
</button>
                      <button className="btn btn-outline-danger" onClick={() => setShowAdjustmentModal(true)}>
                        <AlertCircle size={14} className="mr-2"/> Adjust Individual Balances
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
  
          </div>
        )}
      </div>
    </>
  );
}