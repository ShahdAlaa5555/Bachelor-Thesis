// src/pages/Employee/EmployeePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, UserX, CheckCheck, Copy, Settings, Bell, X, Check, 
  FolderOpen, FileText, Trash2, Download, Users, Clock, MessageSquare, Eye, User,
  Shield, Sliders
} from 'lucide-react';
import toast from 'react-hot-toast';

import { employeeAPI, safeArray } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Modal, Badge, SkeletonTable, InlineSpinner, ConfirmDialog } from '../../components/common';

/* ── Credentials Dialog ── */
function CredentialsDialog({ data, onClose }) {
  const [copied, setCopied] = useState('');
  if (!data) return null;

  const copy = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const copyAll = () => {
    const text = `University HR System — Login Credentials\n\nName: ${data.name}\nEmail: ${data.email}\nPassword: ${data.password}\nLogin URL: ${window.location.origin}/login\n\nPlease log in and change your password.`;
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ color: 'var(--green)' }}>✅ Employee Created Successfully</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Share these login credentials with <strong>{data.name}</strong></p>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--amber)' }}>
            ⚠️ Save these credentials now — the password won't be shown again.
          </div>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 14 }}>
            {[
              { label: 'Full Name', value: data.name, mono: false },
              { label: 'Email', value: data.email, mono: false },
              { label: 'Password', value: data.password, mono: true },
              { label: 'Login URL', value: `${window.location.origin}/login`, mono: false },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: mono ? 'monospace' : 'var(--font-body)', color: label === 'Password' ? 'var(--gold)' : 'var(--text-primary)' }}>{value}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(value, label)}>{copied === label ? <CheckCheck size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}</button>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary w-full" onClick={copyAll} style={{ justifyContent: 'center' }}>{copied === 'all' ? <><CheckCheck size={15} /> Copied!</> : <><Copy size={15} /> Copy All</>}</button>
        </div>
        <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

/* ── Positions Manager Modal ── */
function PositionsManager({ open, onClose, positions, onRefresh }) {
  const [newCode,  setNewCode]  = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleAdd = async () => {
    if (!newCode.trim() || !newTitle.trim()) { toast.error('Both code and title required'); return; }
    setSaving(true);
    try {
      await employeeAPI.createPosition({ PositionCode: newCode.toUpperCase(), PositionTitle: newTitle.trim(), IsActive: true });
      toast.success(`Position added`);
      setNewCode(''); setNewTitle('');
      onRefresh();
    } catch (err) { toast.error('Failed to add position'); } 
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Positions" size="modal-lg">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ flex: '0 0 130px' }}><label className="form-label">Code</label><input className="form-input" placeholder="e.g. PROF" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} /></div>
        <div style={{ flex: 1 }}><label className="form-label">Title</label><input className="form-input" placeholder="e.g. Professor" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? <InlineSpinner /> : 'Add'}</button></div>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {positions.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontWeight: 500 }}>{p.PositionTitle || p.positionTitle}</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.PositionCode || p.positionCode}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ── Form Helpers ── */
const initEmployee = {
  EmployeeCode: '', FirstName: '', LastName: '', Email: '', Phone: '',
  DepartmentID: '', PositionID: '', WorkLocationID: '', SupervisorID: '',
  StartDate: '', CurrentStatus: 'Active', Gender: '', EmploymentType: 'Full-Time',
  DateOfBirth: '', Nationality: '', MaritalStatus: 'Single', password: ''
};

const generateEmpCode = () => `EMP${Date.now().toString().slice(-6)}`;

function EmployeeForm({ data, onChange, departments, positions, locations, supervisors, errors, isCreate = false, fieldConfig, userRole }) {
  const getId = (o) => o?.EmployeeID || o?.DepartmentID || o?.PositionID || o?.WorkLocationID || o?.id || o?.ID || '';
  const getName = (o) => o?.FullName || o?.DepartmentName || o?.PositionTitle || o?.LocationName || o?.name || o?.title || 'Unknown Item';

  // Dynamic FLS (Field Level Security) check
  const canEdit = (fieldName) => {
    if (isCreate) return true; // Can edit all on creation
    if (!fieldConfig || !fieldConfig[fieldName]) return true; // Default allow if unconfigured
    return fieldConfig[fieldName].edit.includes(userRole) || fieldConfig[fieldName].edit.includes('All');
  };

  const field = (k, label, type = 'text', req = false) => {
    const disabled = !canEdit(k);
    return (
      <div className="form-group">
        <label className={`form-label ${req ? 'required' : ''}`}>{label}</label>
        <input className="form-input" type={type} value={data[k] || ''} onChange={e => onChange(k, e.target.value)} placeholder={label} disabled={disabled} style={disabled ? { background: 'var(--bg-base)', opacity: 0.7 } : {}}/>
        {errors[k] && <div className="form-error">{errors[k]}</div>}
      </div>
    )
  };

  const select = (k, label, opts, req = false) => {
    const disabled = !canEdit(k);
     console.log('🔴 EMAIL FIELD RENDER:', { 
            value: data[k], 
            disabled, 
            canEdit: canEdit(k),
            fieldConfig: fieldConfig?.Email,
            userRole  });
    return (
      <div className="form-group">
        <label className={`form-label ${req ? 'required' : ''}`}>{label}</label>
        <select className="form-select" value={data[k] || ''} onChange={e => onChange(k, e.target.value)} disabled={disabled} style={disabled ? { background: 'var(--bg-base)', opacity: 0.7 } : {}}>
          <option value="">— Select {label} —</option>
          {opts && opts.length > 0 ? opts.map((o, i) => (<option key={`${getId(o)}-${i}`} value={getId(o)}>{getName(o)}</option>)) : (<option disabled>No {label} available</option>)}
        </select>
        {errors[k] && <div className="form-error">{errors[k]}</div>}
      </div>
    )
  };

  return (
    <>
      <div className="form-group">
        <label className="form-label required">Employee Code</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" type="text" value={data.EmployeeCode || ''} disabled={!isCreate && !canEdit('EmployeeCode')} onChange={e => onChange('EmployeeCode', e.target.value.toUpperCase())} style={{ flex: 1, fontFamily: 'monospace' }} />
          {isCreate && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('EmployeeCode', generateEmpCode())}>Auto-generate</button>}
        </div>
        {errors.EmployeeCode && <div className="form-error">{errors.EmployeeCode}</div>}
      </div>
      <div className="form-row">{field('FirstName', 'First Name', 'text', true)}{field('LastName',  'Last Name',  'text', true)}</div>
      <div className="form-row">{field('Email', 'Email', 'email', true)}{field('Phone', 'Phone', 'tel')}</div>
      <div className="form-row">{select('DepartmentID', 'Department', departments, true)}{select('PositionID',   'Position',   positions,   true)}</div>
      <div className="form-row">{select('WorkLocationID', 'Work Location', locations, true)}{select('SupervisorID',   'Supervisor / Manager', supervisors, false)}</div>
      <div className="form-row">{field('StartDate',   'Start Date',    'date', true)}{field('DateOfBirth', 'Date of Birth', 'date', true)}</div>
      <div className="form-row">
        {select('Gender', 'Gender', [{ id: 'Male', name: 'Male' }, { id: 'Female', name: 'Female' }, { id: 'Other', name: 'Other' }], true)}
        {select('EmploymentType', 'Type', [{ id: 'Full-Time', name: 'Full-Time' }, { id: 'Part-Time', name: 'Part-Time' }], true)}
      </div>
      <div className="form-row">
        {field('Nationality', 'Nationality', 'text', true)}
        {select('CurrentStatus', 'Status', [{ id: 'Active', name: 'Active' }, { id: 'Inactive', name: 'Inactive' }, { id: 'Terminated', name: 'Terminated'}], true)}
      </div>

      {isCreate && (
        <div className="form-group" style={{ marginTop: 4 }}>
          <label className="form-label required">Temporary Password</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" type="text" value={data.password || ''} onChange={e => onChange('password', e.target.value)} style={{ flex: 1, fontFamily: 'monospace' }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('password', `Uni@${Math.floor(100000 + Math.random() * 900000)}`)}>🔄 Regenerate</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function EmployeePage() {
  const { user } = useAuth(); // GET THE LOGGED IN USER
  
  // 1. ── ROLE BASED LOGIC ──
  const userRole = user?.role || user?.Role;
  const isHR = ['HR', 'Admin'].includes(userRole);
  const isAdmin = userRole === 'Admin';
  const isLeader = ['Manager', 'Supervisor', 'Professor', 'Head of Department', 'HR', 'Admin'].includes(userRole);
  
  const [activeTab, setActiveTab] = useState(''); 

  useEffect(() => {
    if (userRole) {
      setActiveTab(isHR ? 'directory' : 'my-team');
    }
  }, [userRole, isHR]);
  
  const [employees, setEmployees] = useState([]);
  const [myTeam, setMyTeam] = useState([]); 
  const [changeRequests, setChangeRequests] = useState([]); 
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // ─── TEAM FILTER STATE ───
  const [teamSearch, setTeamSearch] = useState('');
  const [teamRoleFilter, setTeamRoleFilter] = useState('');

  // ─── ACCESS CONTROL STATE (EPIC 5) ───
  const [roleModal, setRoleModal] = useState(null);
  const [selectedRole, setSelectedRole] = useState('Employee');
  
  const [fieldPermModal, setFieldPermModal] = useState(false);
  const [fieldConfig, setFieldConfig] = useState({});

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [terminateModal, setTerminateModal] = useState(null);
  const [terminateDate, setTerminateDate] = useState(new Date().toISOString().split('T')[0]);
  const [reactivateModal, setReactivateModal] = useState(null);

  const [docModal, setDocModal] = useState(null); 
  const [docs, setDocs] = useState([]);
  const [docForm, setDocForm] = useState({ DocumentTitle: '', DocumentType: 'National ID', ExpiryDate: '' });
  const [docFile, setDocFile] = useState(null);
  
  const [timelineModal, setTimelineModal] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  
  const [notesModal, setNotesModal] = useState(null);
  const [notesList, setNotesList] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');

  const [viewProfileModal, setViewProfileModal] = useState(null);
  const [viewProfileData, setViewProfileData] = useState({ contacts: [], skills: [] });

  const [completenessMap, setCompletenessMap] = useState({});
  const [formData, setFormData] = useState(initEmployee);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [credentialsDialog, setCredentialsDialog] = useState(null);
  const [positionsModal, setPositionsModal] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    if (employeeAPI.getFieldVisibility) {
      employeeAPI.getFieldVisibility()
        .then(res => setFieldConfig(res.data?.data || res.data || {}))
        .catch(() => console.log('Using default field config'));
    }
  }, []);

  useEffect(() => {
    Promise.all([
      employeeAPI.getDepartments().catch(() => ({ data: [] })),
      employeeAPI.getPositions().catch(() => ({ data: [] })),
      employeeAPI.getWorkLocations().catch(() => ({ data: [] })),
      isHR ? employeeAPI.list({ limit: 1000, status: 'Active' }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
    ]).then(([d, p, l, s]) => {
      setDepartments(safeArray(d, ['departments', 'items', 'data']));
      setPositions(safeArray(p, ['positions', 'items', 'data']));
      setLocations(safeArray(l, ['locations', 'workLocations', 'items', 'data']));
      if (isHR) setSupervisors(safeArray(s, ['employees', 'items', 'data']));
    });
  }, [isHR]);

  const fetchCompleteness = async (list) => {
    const map = { ...completenessMap };
    await Promise.all(list.map(async (emp) => {
      if (map[emp.EmployeeID]) return;
      try {
        const res = await employeeAPI.getCompleteness(emp.EmployeeID);
        map[emp.EmployeeID] = res.data?.data?.score || 0;
      } catch (e) { map[emp.EmployeeID] = 0; }
    }));
    setCompletenessMap(map);
  };

  const loadEmployees = useCallback(() => {
    if (!isHR) return; 
    setLoading(true);
    employeeAPI.list({ search: search || undefined, page, limit: 10 })
      .then((res) => {
        const list = safeArray(res, ['employees', 'items', 'data']);
        setEmployees(list);
        setTotal(res?.data?.data?.total || list.length || 0);
        fetchCompleteness(list); 
      })
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false));
  }, [search, page, isHR]);

  const loadMyTeam = useCallback(() => {
    if (isHR) return;
    setLoading(true);
    employeeAPI.getMyTeam()
      .then((res) => setMyTeam(safeArray(res)))
      .catch(() => toast.error('Failed to load team data'))
      .finally(() => setLoading(false));
  }, [isHR]);

  const loadChangeRequests = useCallback(() => {
    setLoading(true);
    const fetchPromise = isHR 
      ? employeeAPI.getAllPendingRequests() 
      : employeeAPI.getTeamPendingRequests();

    fetchPromise
      .then((res) => setChangeRequests(safeArray(res)))
      .catch(() => toast.error('Failed to load inbox requests'))
      .finally(() => setLoading(false));
  }, [isHR]);

  useEffect(() => { 
    if (!userRole || !activeTab) return;

    if (activeTab === 'directory' && isHR) loadEmployees(); 
    else if (activeTab === 'inbox') loadChangeRequests();
    else if (activeTab === 'my-team' && !isHR) loadMyTeam();
  }, [activeTab, loadEmployees, loadChangeRequests, loadMyTeam, isHR, userRole]);
  
  useEffect(() => { setPage(1); }, [search]);

  // ─── Actions ───

  // EPIC 5: Role & Permission Assignment
  const handleAssignRole = async () => {
    if (!roleModal) return;
    setSaving(true);
    try {
      await employeeAPI.assignRole(roleModal.EmployeeID, selectedRole);
      toast.success(`Role upgraded to ${selectedRole}`);
      setRoleModal(null);
      loadEmployees();
    } catch (error) {
      toast.error('Failed to assign role');
    } finally {
      setSaving(false);
    }
  };

  // EPIC 5: Save Field Matrix (Admin Only)
  const handleSaveFieldConfig = async () => {
    setSaving(true);
    try {
      await employeeAPI.updateFieldVisibility(fieldConfig);
      toast.success('Field Level Security updated!');
      setFieldPermModal(false);
    } catch (error) {
      toast.error('Failed to save security matrix');
    } finally {
      setSaving(false);
    }
  };

  const toggleFieldEditRole = (fieldName, role) => {
    setFieldConfig(prev => {
      const config = { ...prev };
      if (!config[fieldName]) config[fieldName] = { edit: ['Admin'] };
      
      const idx = config[fieldName].edit.indexOf(role);
      if (idx > -1) config[fieldName].edit.splice(idx, 1);
      else config[fieldName].edit.push(role);
      
      return config;
    });
  };

  const openCreate = () => {
    setFormData({ ...initEmployee, EmployeeCode: generateEmpCode(), password: `Uni@${Math.floor(100000 + Math.random() * 900000)}` });
    setFormErrors({});
    setCreateModal(true);
  };

  const openEdit = (emp) => {
    setFormData({
      ...emp,
       Email: emp.Email || '',
      StartDate: emp.StartDate ? emp.StartDate.split('T')[0] : '',
      DateOfBirth: emp.DateOfBirth ? emp.DateOfBirth.split('T')[0] : '',
      DepartmentID: emp.Department?.DepartmentID || emp.DepartmentID,
      PositionID: emp.Position?.PositionID || emp.PositionID,
      WorkLocationID: emp.WorkLocation?.WorkLocationID || emp.WorkLocationID,
      SupervisorID: emp.Supervisor?.EmployeeID || emp.SupervisorID || '',
    });
    setFormErrors({});
     console.log('🟡 FORM DATA SET WITH EMAIL:', emp.Email || ''); // ← what was set
    setFormErrors({});
    setEditModal(emp);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = { ...formData };
      ['DepartmentID', 'PositionID', 'WorkLocationID'].forEach(k => { if (payload[k]) payload[k] = parseInt(payload[k], 10); });
      if (payload.SupervisorID) payload.SupervisorID = parseInt(payload.SupervisorID, 10);
      else delete payload.SupervisorID;

      const res = await employeeAPI.create(payload);
      setCredentialsDialog({ name: `${formData.FirstName} ${formData.LastName}`, email: formData.Email, password: formData.password });
      setCreateModal(false);
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to create'); } 
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    console.log('🟠 FORDATA AT SAVE TIME:', {
        Email: formData.Email,
        FirstName: formData.FirstName,
        allKeys: Object.keys(formData)
    });
    setSaving(true);
    try {
      const payload = { ...formData };
      ['DepartmentID', 'PositionID', 'WorkLocationID'].forEach(k => { if (payload[k]) payload[k] = parseInt(payload[k], 10); });
      if (payload.SupervisorID) payload.SupervisorID = parseInt(payload.SupervisorID, 10);
      else payload.SupervisorID = null;

     delete payload.password;
      delete payload.Department; delete payload.Position; delete payload.WorkLocation; delete payload.Supervisor;

    console.log('Email in payload:', formData.Email); // ← add this
    setSaving(true);
      await employeeAPI.update(editModal.EmployeeID || editModal.id, payload);
      toast.success('Employee updated successfully');
      setEditModal(null);
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to update'); } 
    finally { setSaving(false); }
  };

  const handleTerminate = async () => {
    setSaving(true);
    try {
      await employeeAPI.terminate(terminateModal.EmployeeID || terminateModal.id, { endDate: terminateDate });
      toast.success('Employee terminated');
      setTerminateModal(null);
      loadEmployees();
    } catch (err) { toast.error('Failed to terminate'); } 
    finally { setSaving(false); }
  };

  const handleReactivate = async () => {
    if (!reactivateModal) return;
    setSaving(true);
    try {
      await employeeAPI.reactivate(reactivateModal.EmployeeID || reactivateModal.id);
      toast.success('Employee reactivated');
      setReactivateModal(null);
      loadEmployees();
    } catch (err) { toast.error('Failed to reactivate'); } 
    finally { setSaving(false); }
  };

  const reviewRequest = async (requestId, status) => {
    try {
      await employeeAPI.reviewChangeRequest(requestId, { Status: status });
      toast.success(`Request ${status}`);
      loadChangeRequests();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to review request'); }
  };

  const triggerReminder = async (empId) => {
    try {
      await employeeAPI.sendReminder(empId);
      toast.success('Reminder notification sent to employee.');
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to send reminder.'); }
  };

  const openDocs = async (emp) => {
    setDocModal(emp);
    try {
      const res = await employeeAPI.getDocuments(emp.EmployeeID);
      setDocs(safeArray(res));
    } catch (err) { toast.error('Failed to load documents'); }
  };

  const handleUploadDoc = async () => {
    if (!docForm.DocumentTitle || !docFile) { toast.error('Title and File are required'); return; }
    setSaving(true);
    try {
      await employeeAPI.uploadDocument(docModal.EmployeeID, docForm, docFile);
      toast.success('Document uploaded successfully');
      setDocForm({ DocumentTitle: '', DocumentType: 'National ID', ExpiryDate: '' });
      setDocFile(null);
      const res = await employeeAPI.getDocuments(docModal.EmployeeID);
      setDocs(safeArray(res));
    } catch (err) { toast.error('Upload failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document permanently?')) return;
    try {
      await employeeAPI.deleteDocument(docModal.EmployeeID, docId);
      setDocs(docs.filter(d => d.DocumentID !== docId));
      toast.success('Deleted');
    } catch (err) { toast.error('Failed to delete'); }
  };

  const openTimeline = async (emp) => {
    setTimelineModal(emp);
    try {
      const res = await employeeAPI.getTimeline(emp.EmployeeID);
      setTimelineEvents(safeArray(res));
    } catch (err) { toast.error('Failed to load timeline'); }
  };

  const openNotes = async (emp) => {
    setNotesModal(emp);
    try {
      const res = await employeeAPI.getNotes(emp.EmployeeID);
      setNotesList(safeArray(res));
    } catch (err) { toast.error('Failed to load notes'); }
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    setSaving(true);
    try {
      await employeeAPI.addNote(notesModal.EmployeeID, { NoteText: newNoteText });
      toast.success('Note sent securely to HR file');
      setNewNoteText('');
      const res = await employeeAPI.getNotes(notesModal.EmployeeID);
      setNotesList(safeArray(res));
    } catch (err) { toast.error('Failed to add note'); }
    finally { setSaving(false); }
  };

  const openViewProfile = async (emp) => {
    setLoading(true);
    try {
      const [contactsRes, skillsRes] = await Promise.all([
        employeeAPI.getContacts(emp.EmployeeID).catch(() => ({ data: { data: [] } })),
        employeeAPI.getSkills(emp.EmployeeID).catch(() => ({ data: { data: [] } }))
      ]);
      setViewProfileData({
        ...emp,
        contacts: safeArray(contactsRes),
        skills: safeArray(skillsRes)
      });
      setViewProfileModal(emp);
    } catch (err) {
      toast.error('Failed to load profile details');
    } finally {
      setLoading(false);
    }
  };

  const calculateTenure = (dateString) => {
    if (!dateString) return '—';
    const years = (new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24 * 365.25);
    return years < 1 ? '< 1 year' : `${Math.floor(years)} year(s)`;
  };

  const teamRolesList = [...new Set(myTeam.map(emp => emp.Position?.PositionTitle).filter(Boolean))];
  
  const filteredTeam = myTeam.filter(emp => {
    const term = teamSearch.toLowerCase();
    const matchesText = !teamSearch || 
      emp.FullName?.toLowerCase().includes(term) || 
      emp.Position?.PositionTitle?.toLowerCase().includes(term) ||
      (emp.Skills && emp.Skills.some(s => s.SkillName?.toLowerCase().includes(term)));
    
    const matchesRole = !teamRoleFilter || emp.Position?.PositionTitle === teamRoleFilter;
    
    return matchesText && matchesRole;
  });

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}><h1>Employees</h1></div>
        
        {/* ROLE-BASED TABS */}
        <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 4, borderRadius: 'var(--radius-md)' }}>
          {isHR ? (
            <button className={`btn btn-sm ${activeTab === 'directory' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('directory')}>
              Directory
            </button>
          ) : (
            <button className={`btn btn-sm ${activeTab === 'my-team' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('my-team')}>
              <Users size={14} style={{ marginRight: 6 }}/> My Team
            </button>
          )}
          
          <button className={`btn btn-sm ${activeTab === 'inbox' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('inbox')} style={{ position: 'relative' }}>
            <Bell size={14} style={{ marginRight: 6 }}/> Inbox
            {changeRequests.filter(r => r.Status === 'Pending').length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                {changeRequests.filter(r => r.Status === 'Pending').length}
              </span>
            )}
          </button>
        </div>

        {isHR && (
          <div style={{ display: 'flex', gap: 10 }}>
            {isAdmin && (
              <button className="btn btn-ghost" onClick={() => setFieldPermModal(true)} style={{ color: 'var(--purple)' }} title="Field Level Security">
                <Sliders size={15} /> Field Config
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setPositionsModal(true)}><Settings size={15} /> Positions</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Employee</button>
          </div>
        )}
      </div>

      {/* HR ONLY: DIRECTORY */}
      {activeTab === 'directory' && isHR && (
        <>
          <div className="filter-bar" style={{ marginTop: 20 }}>
            <div className="header-search" style={{ width: 260 }}><Search size={15} className="header-search-icon" /><input placeholder="Search name or code..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>

          {loading ? <SkeletonTable rows={8} /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Contact / Position</th>
                    <th>Profile Completion</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const score = completenessMap[emp.EmployeeID] || 0;
                    return (
                    <tr key={emp.EmployeeID}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold)', backgroundImage: emp.PhotoURL ? `url("${emp.PhotoURL}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                            {!emp.PhotoURL && emp.FullName?.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{emp.FullName || `${emp.FirstName} ${emp.LastName}`}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{emp.EmployeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{emp.Position?.PositionTitle || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.Email}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${score}%`, height: '100%', background: score === 100 ? 'var(--green)' : 'var(--gold)' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, minWidth: 35 }}>{score}%</span>
                          {score < 100 && (
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--amber)' }} onClick={() => triggerReminder(emp.EmployeeID)} title="Send Reminder">
                              <Bell size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td><Badge status={emp.CurrentStatus}>{emp.CurrentStatus}</Badge></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {/* EPIC 5: ASSIGN ROLE BUTTON */}
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--purple)' }} onClick={() => { setSelectedRole(emp.role || 'Employee'); setRoleModal(emp); }} title="Assign System Role"><Shield size={15} /></button>
                          {/* 👇 ADD THIS BUTTON HERE 👇 */}
      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--blue)' }} onClick={() => openViewProfile(emp)} title="View Full Profile"><Eye size={15} /></button>
      {/* 👆 ──────────────────── 👆 */}
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--text-secondary)' }} onClick={() => openTimeline(emp)} title="Employment Timeline"><Clock size={15} /></button>
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--text-secondary)' }} onClick={() => openNotes(emp)} title="Manager Notes"><MessageSquare size={15} /></button>
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--primary)' }} onClick={() => openDocs(emp)} title="Official Documents"><FolderOpen size={15} /></button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(emp)} title="Edit Employee"><Edit2 size={15} /></button>
                          {emp.CurrentStatus !== 'Terminated' ? (
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => setTerminateModal(emp)} title="Terminate"><UserX size={15} /></button>
                          ) : (
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--green)' }} onClick={() => setReactivateModal(emp)} title="Reactivate"><CheckCheck size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                  {employees.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No employees found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* PROFESSORS / MANAGERS: MY TEAM */}
      {activeTab === 'my-team' && !isHR && (
        <div style={{ marginTop: 20 }}>
          
          <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <div className="header-search" style={{ flex: 1, maxWidth: 300 }}>
              <Search size={15} className="header-search-icon" />
              <input 
                placeholder="Filter by name, role, or skill..." 
                value={teamSearch} 
                onChange={e => setTeamSearch(e.target.value)} 
              />
            </div>
            <select 
              className="form-select" 
              style={{ width: 220 }} 
              value={teamRoleFilter} 
              onChange={e => setTeamRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              {teamRolesList.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>

          {loading ? <SkeletonTable rows={5} /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team Member</th>
                    <th>Role & Department</th>
                    <th>Hire Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeam.map((emp) => (
                    <tr key={emp.EmployeeID}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold)', backgroundImage: emp.PhotoURL ? `url("${emp.PhotoURL}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                            {!emp.PhotoURL && emp.FullName?.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{emp.FullName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{emp.Email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{emp.Position?.PositionTitle || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.Department?.DepartmentName || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {emp.StartDate ? new Date(emp.StartDate).toLocaleDateString() : '—'}
                      </td>
                      <td><Badge status={emp.CurrentStatus}>{emp.CurrentStatus}</Badge></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openViewProfile(emp)} title="View Full Profile"><Eye size={15} /></button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openTimeline(emp)} title="View Timeline"><Clock size={15} /></button>
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--primary)' }} onClick={() => openNotes(emp)} title="Send Private HR Note"><MessageSquare size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTeam.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No matching direct reports found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EVERYONE (HR & LEADERS): INBOX VIEW */}
      {activeTab === 'inbox' && (
        <div style={{ marginTop: 20 }}>
          {loading ? <SkeletonTable rows={5} /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Requested By</th>
                    <th>Field Requested</th>
                    <th>Current Value</th>
                    <th>New Value</th>
                    <th style={{ textAlign: 'right' }}>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.map((req) => (
                    <tr key={req.ChangeRequestID}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{req.Employee?.FullName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{req.Employee?.EmployeeCode}</div>
                      </td>
                      <td><span className="badge badge-purple">{req.FieldName}</span></td>
                      <td style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{req.OldValue || '—'}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 500 }}>{req.NewValue}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {req.Status === 'Pending' || req.status === 'Pending' ? (
                            <>
                              <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)', background: 'var(--red-dim)' }} onClick={() => reviewRequest(req.ChangeRequestID, 'Rejected')} title="Reject"><X size={15} /></button>
                              <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--green)', background: 'var(--green-dim)' }} onClick={() => reviewRequest(req.ChangeRequestID, 'Approved')} title="Approve"><Check size={15} /></button>
                            </>
                          ) : (
                            <Badge status={req.Status || req.status}>{req.Status || req.status}</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {changeRequests.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No profile updates to review! 🎉</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── EPIC 5: MODALS ─── */}
      
      {/* Role Assignment Modal */}
      <Modal open={!!roleModal} onClose={() => setRoleModal(null)} title={`Assign Role to ${roleModal?.FullName}`} footer={<><button className="btn btn-secondary" onClick={() => setRoleModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handleAssignRole} disabled={saving}>{saving ? <InlineSpinner /> : 'Save Role'}</button></>}>
        <div className="form-group">
          <label className="form-label required">System Access Role</label>
          <select className="form-select" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
            <option value="Employee">Employee (Self-Service only)</option>
            <option value="Manager">Manager / Supervisor</option>
            <option value="Professor">Professor (University Role)</option>
            <option value="HR">HR Officer</option>
            {isAdmin && <option value="Admin">System Administrator</option>}
          </select>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Upgrading an employee to Manager or HR grants them access to the Directory, Approvals, and Team Data.
          </div>
        </div>
      </Modal>

      {/* Field Level Security Modal */}
      <Modal open={fieldPermModal} onClose={() => setFieldPermModal(false)} title="Field Visibility & Security Matrix" size="modal-lg" footer={<><button className="btn btn-secondary" onClick={() => setFieldPermModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSaveFieldConfig} disabled={saving}>{saving ? <InlineSpinner /> : 'Apply Security Rules'}</button></>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>Check the boxes to allow roles to <strong style={{color: 'var(--red)'}}>Edit</strong> specific fields in the Employee Form.</p>
        <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Field Name</th>
                <th style={{ textAlign: 'center' }}>Admin</th>
                <th style={{ textAlign: 'center' }}>HR</th>
                <th style={{ textAlign: 'center' }}>Manager</th>
                <th style={{ textAlign: 'center' }}>Employee</th>
              </tr>
            </thead>
            <tbody>
              {['EmployeeCode', 'FirstName', 'LastName', 'Email', 'Phone', 'DepartmentID', 'PositionID', 'SupervisorID', 'StartDate', 'CurrentStatus'].map(field => (
                <tr key={field}>
                  <td style={{ fontWeight: 500, color: 'var(--purple)' }}>{field}</td>
                  {['Admin', 'HR', 'Manager', 'Employee'].map(role => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={fieldConfig[field]?.edit?.includes(role) || false}
                        onChange={() => toggleFieldEditRole(field, role)}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--gold)' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>


      {/* EPIC 3: VIEW TEAM MEMBER PROFILE MODAL (READ-ONLY) */}
      <Modal open={!!viewProfileModal} onClose={() => setViewProfileModal(null)} title={`Profile Details — ${viewProfileModal?.FullName}`} size="modal-lg" footer={<button className="btn btn-secondary" onClick={() => setViewProfileModal(null)}>Close</button>}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24, padding: 16, background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--gold)', backgroundImage: viewProfileModal?.PhotoURL ? `url("${viewProfileModal.PhotoURL}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.5rem' }}>
            {!viewProfileModal?.PhotoURL && viewProfileModal?.FullName?.charAt(0)}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{viewProfileModal?.FullName}</h3>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>{viewProfileModal?.Position?.PositionTitle} • {viewProfileModal?.Department?.DepartmentName}</div>
            <div style={{ marginTop: 8 }}><Badge status={viewProfileModal?.CurrentStatus}>{viewProfileModal?.CurrentStatus}</Badge></div>
          </div>
        </div>

        <div className="grid-2-1" style={{ gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Contact & Personal</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Email:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{viewProfileData.Email}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Phone:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{viewProfileData.Phone || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nationality:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{viewProfileData.Nationality || '—'}</span></div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Skills & Certifications</h4>
              {viewProfileData.skills.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No skills recorded.</p> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {viewProfileData.skills.map(s => (
                    <span key={s.SkillID} className="badge badge-info">{s.SkillName} ({s.ProficiencyLevel})</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Employment Details</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Code:</span> <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{viewProfileData.EmployeeCode}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hire Date:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{viewProfileData.StartDate ? new Date(viewProfileData.StartDate).toLocaleDateString() : '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tenure:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{calculateTenure(viewProfileData.StartDate)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Type:</span> <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{viewProfileData.EmploymentType}</span></div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Emergency Contacts</h4>
              {viewProfileData.contacts.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No emergency contacts listed.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {viewProfileData.contacts.map(c => (
                    <div key={c.ContactID} style={{ background: 'var(--bg-base)', padding: 8, borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.ContactName} {c.IsPrimary && <span style={{ color: 'var(--red)', fontSize: '0.7rem' }}>(Primary)</span>}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.Relationship} • {c.Phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!timelineModal} onClose={() => setTimelineModal(null)} title={`Employment Timeline — ${timelineModal?.FullName}`} size="modal-lg" footer={<button className="btn btn-secondary" onClick={() => setTimelineModal(null)}>Close</button>}>
        {timelineEvents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No major career events recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
            {timelineEvents.map((evt, i) => (
              <div key={i} style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gold)', zIndex: 1 }} />
                  {i !== timelineEvents.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', margin: '4px 0' }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {new Date(evt.ChangedAt).toLocaleDateString()} • Recorded by {evt.ChangedByEmp?.FullName || 'System'}
                  </div>
                  <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Change to <span className="badge badge-purple">{evt.FieldChanged}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <span style={{ textDecoration: 'line-through', marginRight: 8 }}>{evt.OldValue || 'None'}</span>
                      → <span style={{ color: 'var(--green)', fontWeight: 500, marginLeft: 8 }}>{evt.NewValue}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!notesModal} onClose={() => setNotesModal(null)} title={`Private Evaluation Notes — ${notesModal?.FullName}`} size="modal-lg" footer={<button className="btn btn-secondary" onClick={() => setNotesModal(null)}>Close</button>}>
        <div style={{ background: 'var(--amber-dim)', color: 'var(--amber)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 20 }}>
          🔒 These notes are securely stored in the employee's HR file. They are only visible to HR Administrators and the employee's direct Supervisor.
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
          {notesList.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No performance notes have been recorded for this employee.</p> : (
            notesList.map(note => (
              <div key={note.NoteID} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: 'var(--gold)', backgroundImage: note.Author?.PhotoURL ? `url("${note.Author.PhotoURL}")` : 'none', backgroundSize: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.6rem', fontWeight: 'bold' }}>
                    {!note.Author?.PhotoURL && note.Author?.FullName?.charAt(0)}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{note.Author?.FullName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {new Date(note.CreatedAt).toLocaleDateString()} {new Date(note.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.NoteText}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <label className="form-label">Submit a Private Note to HR File</label>
          <textarea className="form-textarea" placeholder="Type your evaluation, performance note, or disciplinary record here..." value={newNoteText} onChange={e => setNewNoteText(e.target.value)} style={{ height: 80, marginBottom: 12 }} />
          <button className="btn btn-primary" onClick={handleAddNote} disabled={saving || !newNoteText.trim()}>
            {saving ? <InlineSpinner /> : 'Submit Note'}
          </button>
        </div>
      </Modal>

      <Modal open={!!docModal} onClose={() => setDocModal(null)} title={`Documents — ${docModal?.FullName}`} size="modal-lg" footer={<button className="btn btn-secondary" onClick={() => setDocModal(null)}>Close</button>}>
        <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 20, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={16}/> Upload New Document</h4>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">Document Title</label><input className="form-input" placeholder="e.g. Scanned ID Front" value={docForm.DocumentTitle} onChange={e => setDocForm(f => ({...f, DocumentTitle: e.target.value}))} /></div>
            <div className="form-group">
              <label className="form-label required">Category</label>
              <select className="form-select" value={docForm.DocumentType} onChange={e => setDocForm(f => ({...f, DocumentType: e.target.value}))}>
                <option value="National ID">National ID</option>
                <option value="Passport">Passport</option>
                <option value="Contract">Signed Contract</option>
                <option value="Certificate">Certificate / Degree</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Expiry Date (Optional)</label><input className="form-input" type="date" value={docForm.ExpiryDate} onChange={e => setDocForm(f => ({...f, ExpiryDate: e.target.value}))} /></div>
            <div className="form-group">
              <label className="form-label required">File (PDF/Image)</label>
              <input className="form-input" type="file" accept=".pdf, image/*" onChange={e => setDocFile(e.target.files[0])} />
            </div>
          </div>
          <button className="btn btn-primary w-full" onClick={handleUploadDoc} disabled={saving || !docFile}>{saving ? <InlineSpinner /> : 'Upload Document'}</button>
        </div>

        <h4 style={{ fontSize: '0.9rem', marginBottom: 12 }}>On File ({docs.length})</h4>
        {docs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No documents uploaded yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
            {docs.map(doc => (
              <div key={doc.DocumentID} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>{doc.DocumentTitle} <span className="badge badge-info">{doc.DocumentType}</span></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Uploaded: {new Date(doc.UploadDate).toLocaleDateString()}
                    {doc.ExpiryDate && ` • Expires: ${new Date(doc.ExpiryDate).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={doc.FileURL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm btn-icon" title="View/Download"><Download size={15} /></a>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => handleDeleteDoc(doc.DocumentID)} title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* CRUD MODALS */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add New Employee" size="modal-lg" footer={<><button className="btn btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? <InlineSpinner /> : 'Create'}</button></>}>
        <EmployeeForm data={formData} onChange={(k, v) => setFormData(f => ({ ...f, [k]: v }))} departments={departments} positions={positions} locations={locations} supervisors={supervisors} errors={formErrors} isCreate={true} fieldConfig={fieldConfig} userRole={userRole} />
      </Modal>

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit Employee Profile" size="modal-lg" footer={<><button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handleEdit} disabled={saving}>{saving ? <InlineSpinner /> : 'Save Changes'}</button></>}>
        <EmployeeForm data={formData} onChange={(k, v) => setFormData(f => ({ ...f, [k]: v }))} departments={departments} positions={positions} locations={locations} supervisors={supervisors} errors={formErrors} isCreate={false} fieldConfig={fieldConfig} userRole={userRole} />
      </Modal>

      <Modal open={!!terminateModal} onClose={() => setTerminateModal(null)} title="Terminate Employee" footer={<><button className="btn btn-secondary" onClick={() => setTerminateModal(null)}>Cancel</button><button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: 'white' }} onClick={handleTerminate} disabled={saving}>{saving ? <InlineSpinner /> : 'Confirm Termination'}</button></>}>
        <div style={{ marginBottom: 15 }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Are you sure you want to deactivate <strong>{terminateModal?.FullName}</strong>?</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>This will immediately restrict their system access and mark their record as Terminated.</p>
        </div>
        <div className="form-group"><label className="form-label required">Effective End Date</label><input className="form-input" type="date" value={terminateDate} onChange={(e) => setTerminateDate(e.target.value)} /></div>
      </Modal>
      
      <ConfirmDialog open={!!reactivateModal} onClose={() => setReactivateModal(null)} onConfirm={handleReactivate} title="Reactivate Employee" message={`Are you sure you want to reactivate ${reactivateModal?.FullName}?`} variant="primary" loading={saving} />
      <PositionsManager open={positionsModal} onClose={() => setPositionsModal(false)} positions={positions} onRefresh={() => employeeAPI.getPositions().then(res => setPositions(safeArray(res, ['positions'])))} />
      <CredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />
    </>
  );
}