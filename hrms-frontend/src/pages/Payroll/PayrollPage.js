import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, DollarSign, AlertTriangle, FileText,
  Play, CheckCircle, Download, Plus, RefreshCw,
  TrendingUp, Users, Zap, ShieldCheck, Database,
  Globe, Scale, Save, Lock, Settings, Calculator,
  Receipt, Clock, Check, X, Percent, Tag, Layers,
  ChevronDown, ChevronUp, Edit2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { payrollAPI } from '../../api/services';
import api from '../../api/axios';
import { Badge, SkeletonCard, SkeletonTable, Modal, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/* ── Dashboard KPI card ── */
function PayKPI({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      <div className="stat-card-icon" style={{ background: `${color}22` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ── Payslip viewer modal ── */
function PayslipModal({ payslip, onClose }) {
  if (!payslip) return null;
  const financialData  = payslip?.Entry || payslip || {};
  const runData        = payslip?.PayrollRun || payslip || {};
  const startDate      = runData?.PeriodStartDate || runData?.payPeriodStart || payslip?.IssueDate;
  const endDate        = runData?.PeriodEndDate   || runData?.payPeriodEnd;
  const status         = financialData?.Status || payslip?.Status || payslip?.status || 'Draft';
  const netPay         = financialData?.NetPay || financialData?.netPay || 0;
  const grossPay       = financialData?.TotalEarnings || financialData?.totalEarnings || 0;
  const totalDed       = financialData?.TotalDeductions || financialData?.totalDeductions || 0;
  const employerSI     = financialData?.EmployerSocialInsurance || 0;
  const lines          = financialData?.Lines || [];
  const earningsLines  = lines.filter(l => Number(l.Amount || l.amount) > 0);
  const deductLines    = lines.filter(l => Number(l.Amount || l.amount) < 0);
  const fmt = v => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EGP' });

  // Progress tracker
  const steps = ['Draft', 'Finalized', 'Paid'];
  const stepLabels = { Draft: 'Processing', Finalized: 'Ready', Paid: 'Paid' };
  const currentIdx = steps.indexOf(status) === -1 ? 0 : steps.indexOf(status);

  return (
    <Modal open={!!payslip} onClose={onClose} title="Payslip Details" size="modal-lg">
      <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Official Payslip</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Period: {startDate ? `${new Date(startDate).toLocaleDateString()} – ${endDate ? new Date(endDate).toLocaleDateString() : 'Present'}` : '—'}
            </div>
          </div>
          {/* Progress tracker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i <= currentIdx ? 'var(--green)' : 'var(--border)',
                    fontSize: '0.65rem', color: '#fff', fontWeight: 700,
                  }}>{i < currentIdx ? '✓' : i + 1}</div>
                  <span style={{ fontSize: '0.65rem', color: i <= currentIdx ? 'var(--green)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{stepLabels[s]}</span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: 28, height: 2, background: i < currentIdx ? 'var(--green)' : 'var(--border)', marginBottom: 16, flexShrink: 0 }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Earnings & Deductions grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Earnings</div>
            {earningsLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{line.Description || line.description}</span>
                <span style={{ fontSize: '0.82rem' }}>{fmt(Math.abs(line.Amount || line.amount))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 700, marginTop: 8 }}>
              <span style={{ fontSize: '0.82rem' }}>Total Gross</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--green)' }}>{fmt(grossPay)}</span>
            </div>

            {/* Employer contributions — REQ-PY-14 / TRK-14 */}
            {employerSI > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-light)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Employer Contributions
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Employer Social Insurance</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--blue)' }}>{fmt(employerSI)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Deductions</div>
            {deductLines.length === 0
              ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No deductions this period.</div>
              : deductLines.map((line, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{line.Description || line.description}</span>
                  <span style={{ fontSize: '0.82rem' }}>{fmt(Math.abs(line.Amount || line.amount))}</span>
                </div>
              ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 700, marginTop: 8 }}>
              <span style={{ fontSize: '0.82rem' }}>Total Deductions</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--red)' }}>{fmt(totalDed)}</span>
            </div>
          </div>
        </div>

        {/* Net pay */}
        <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.3)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>FINAL NET PAY</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)' }}>{fmt(netPay)}</span>
        </div>
      </div>
    </Modal>
  );
}

/* ── Department Payroll Report ── */
function DeptReport({ runs, fmt }) {
  const [reportData, setReportData]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selectedRun, setSelectedRun] = useState('');
  const [generated, setGenerated]     = useState(false);

  const generate = async () => {
    if (!selectedRun) return toast.error('Please select a payroll run');
    setLoading(true);
    try {
      const res = await api.get(`/payroll/reports/department?runId=${selectedRun}`);
      const data = res?.data?.data || res?.data || [];
      setReportData(Array.isArray(data) ? data : []);
      setGenerated(true);
    } catch (err) {
      toast.error('Failed to generate report');
    } finally { setLoading(false); }
  };

  const totalNet   = reportData.reduce((s, d) => s + Number(d.totalNetPay   || 0), 0);
  const totalGross = reportData.reduce((s, d) => s + Number(d.totalGross     || 0), 0);
  const totalEmps  = reportData.reduce((s, d) => s + Number(d.employeeCount  || 0), 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title"><FileText size={16} style={{ marginRight: 6 }} />Department Payroll Report</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Select Payroll Run</label>
              <select className="form-input" value={selectedRun} onChange={e => { setSelectedRun(e.target.value); setGenerated(false); }}>
                <option value="">— choose a run —</option>
                {runs.map(r => (
                  <option key={r.PayrollRunID} value={r.PayrollRunID}>
                    #{r.PayrollRunID} — {new Date(r.PeriodStartDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} ({r.Status})
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={loading || !selectedRun} style={{ marginBottom: 0 }}>
              {loading ? <InlineSpinner /> : <><TrendingUp size={14} /> Generate</>}
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <>
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <PayKPI icon={Users}      color="var(--blue)"  label="Total Employees"   value={totalEmps} />
            <PayKPI icon={DollarSign} color="var(--green)" label="Total Gross"        value={fmt(totalGross)} />
            <PayKPI icon={DollarSign} color="var(--gold)"  label="Total Net Pay"      value={fmt(totalNet)} />
            <PayKPI icon={TrendingUp} color="var(--red)"   label="Departments"        value={reportData.length} />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Employees</th>
                  <th>Total Gross</th>
                  <th>Total Deductions</th>
                  <th>Total Tax</th>
                  <th>Total SI</th>
                  <th>Total Net Pay</th>
                  <th>Avg Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {reportData.length === 0
                  ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No data for this run.</td></tr>
                  : reportData.map((dept, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{dept.departmentName || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{dept.employeeCount || 0}</td>
                      <td style={{ color: 'var(--green)' }}>{fmt(dept.totalGross || 0)}</td>
                      <td style={{ color: 'var(--red)' }}>{fmt(dept.totalDeductions || 0)}</td>
                      <td style={{ color: 'var(--red)' }}>{fmt(dept.totalTax || 0)}</td>
                      <td style={{ color: 'var(--red)' }}>{fmt(dept.totalSI || 0)}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(dept.totalNetPay || 0)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmt(dept.avgNetPay || 0)}</td>
                    </tr>
                  ))
                }
              </tbody>
              {reportData.length > 1 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td>TOTAL</td>
                    <td style={{ textAlign: 'center' }}>{totalEmps}</td>
                    <td style={{ color: 'var(--green)' }}>{fmt(totalGross)}</td>
                    <td style={{ color: 'var(--red)' }}>{fmt(reportData.reduce((s, d) => s + Number(d.totalDeductions || 0), 0))}</td>
                    <td style={{ color: 'var(--red)' }}>{fmt(reportData.reduce((s, d) => s + Number(d.totalTax || 0), 0))}</td>
                    <td style={{ color: 'var(--red)' }}>{fmt(reportData.reduce((s, d) => s + Number(d.totalSI || 0), 0))}</td>
                    <td style={{ color: 'var(--gold)' }}>{fmt(totalNet)}</td>
                    <td>{fmt(totalEmps > 0 ? totalNet / totalEmps : 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Component ── */
export default function PayrollPage() {
  const { user }  = useAuth();
  const isPayroll = ['Payroll', 'HR', 'Admin'].includes(user?.role);
  const isLegal   = ['Admin', 'Legal'].includes(user?.role);

  const [tab, setTab]                 = useState(isPayroll ? 'reports' : 'myslips');
  const [runs, setRuns]               = useState([]);
  const [myPayslips, setMySlips]      = useState([]);
  const [exceptions, setExcept]       = useState([]);
  const [claims, setClaims]           = useState([]);
  const [disputes, setDisputes]       = useState([]);
  const [disputeModal, setDisputeModal] = useState(null); // holds payslip object
  const [selectedSlip, setSlip]       = useState(null);
  const [historyYear, setHistoryYear] = useState('');
  const [loadDash, setLoadDash]       = useState(true);
  const [loadRuns, setLoadRuns]       = useState(true);
  const [saving, setSaving]           = useState(false);

  // Config data from backend
  const [payTypes, setPayTypes]       = useState([]);
  const [overtimeRules, setOTRules]   = useState([]);
  const [allowances, setAllowances]   = useState([]);
  const [shiftDiffs, setShiftDiffs]   = useState([]);
  const [payGrades, setPayGrades]     = useState([]);
  const [policies, setPolicies]       = useState([]);
  const [loadConfig, setLoadConfig]   = useState(false);

  // Modals
  const [createRunModal, setCreateRunModal]       = useState(false);
  const [claimModal, setClaimModal]               = useState(false);
  const [editPolicyModal, setEditPolicyModal]     = useState(false);
  const [addPayTypeModal, setAddPayTypeModal]     = useState(false);
  const [addOTRuleModal, setAddOTRuleModal]       = useState(false);
  const [addAllowanceModal, setAddAllowanceModal] = useState(false);
  const [addGradeModal, setAddGradeModal]         = useState(false);
  const [addTaxModal, setAddTaxModal]             = useState(false);
  const [overrideStatusModal, setOverrideStatusModal] = useState(null); // holds entry object

  // Forms
  const [runForm, setRunForm]         = useState({ PolicyID: 1, PeriodStartDate: '', PeriodEndDate: '', CutoffDate: '', PaymentDate: '' });
  const [claimForm, setClaimForm]     = useState({ type: 'Transport', amount: '', reason: '' });
  const [configForm, setConfigForm]   = useState({ minWage: 6000, workDays: 22 });
  const [legalForm, setLegalForm]     = useState({ siRate: 7.25 });
  const [payTypeForm, setPayTypeForm] = useState({ PayTypeCode: '', PayTypeName: '', Category: 'Earning', IsRecurring: true, IsTaxable: true, IsInsurable: true });
  const [otRuleForm, setOTRuleForm]   = useState({ RuleName: '', ThresholdHours: 8, Multiplier: 1.35, IsNighttime: false, IsRestDay: false });
  const [gradeForm, setGradeForm]     = useState({ GradeCode: '', GradeName: '', MinSalary: '', MaxSalary: '', CurrencyCode: 'EGP' });
  const [disputeForm, setDisputeForm] = useState({ DisputeType: 'OverDeduction', Reason: '' });
  const [taxBrackets, setTaxBrackets] = useState([]);
  const [taxForm, setTaxForm]         = useState({ BracketOrder: '', FromAmountEGP: '', ToAmountEGP: '', RatePct: '', PersonalExemptionEGP: 0, EffectiveYear: new Date().getFullYear() });
  const [newStatus, setNewStatus]     = useState('');

  const extract = res => {
    let p = res;
    if (p && p.data !== undefined) p = p.data;
    if (p && p.success !== undefined && p.data !== undefined) p = p.data;
    return p || null;
  };

  const loadConfig_data = useCallback(async () => {
    if (!isPayroll) return;
    setLoadConfig(true);
    try {
      const [ptRes, otRes, alRes, sdRes, pgRes, plRes, txRes] = await Promise.all([
        payrollAPI.getPayTypes().catch(() => null),
        payrollAPI.getOvertimeRules().catch(() => null),
        payrollAPI.getAllowances().catch(() => null),
        payrollAPI.getShiftDiffs().catch(() => null),
        payrollAPI.getPayGrades().catch(() => null),
        payrollAPI.getPolicies().catch(() => null),
        payrollAPI.getTaxBrackets().catch(() => null),
      ]);
      if (ptRes) setPayTypes(extract(ptRes) || []);
      if (otRes) setOTRules(extract(otRes) || []);
      if (alRes) setAllowances(extract(alRes) || []);
      if (sdRes) setShiftDiffs(extract(sdRes) || []);
      if (pgRes) setPayGrades(extract(pgRes) || []);
      if (plRes) setPolicies(extract(plRes) || []);
      if (txRes) setTaxBrackets(extract(txRes) || []);
    } catch (e) { console.error(e); }
    finally { setLoadConfig(false); }
  }, [isPayroll]);

  const load = useCallback(async () => {
    try {
      const [slipsRes, claimsRes, disputesRes] = await Promise.all([
        payrollAPI.getMyPayslips().catch(() => null),
        payrollAPI.listReimbursements().catch(() => null),
        payrollAPI.listMyDisputes().catch(() => null),
      ]);
      if (slipsRes) setMySlips(extract(slipsRes)?.payslips || extract(slipsRes) || []);
      if (claimsRes) setClaims(extract(claimsRes) || []);
      if (disputesRes) setDisputes(extract(disputesRes) || []);

      if (isPayroll) {
        const [runsRes, excRes] = await Promise.all([
          payrollAPI.listRuns({ limit: 50 }).catch(() => null),
          payrollAPI.listExceptions({ limit: 100 }).catch(() => null),
        ]);
        setLoadDash(false);
        if (runsRes) { const d = extract(runsRes); setRuns(Array.isArray(d) ? d : (d?.runs || [])); }
        setLoadRuns(false);
        if (excRes) { const d = extract(excRes); setExcept(Array.isArray(d) ? d : (d?.exceptions || [])); }
      } else { setLoadDash(false); setLoadRuns(false); }
    } catch (err) { console.error(err); }
  }, [isPayroll]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'config') loadConfig_data(); }, [tab, loadConfig_data]);

  const handleRunAction = async (runId, action) => {
    try {
      const id = parseInt(runId, 10);
      if (action === 'process')  await payrollAPI.processRun(id, {});
      if (action === 'approve')  await payrollAPI.approveRun(id, {});
      if (action === 'finalize') await payrollAPI.finalizeRun(id, {});
      if (action === 'payslips') await payrollAPI.generatePayslips(id, {});
      if (action === 'bankfile') { await payrollAPI.generateBankFile(id, { FileFormat: 'CSV' }); toast.success('Bank file downloading...'); return; }
      toast.success(`Run ${action}d successfully`);
      load();
    } catch (err) { toast.error(err.response?.data?.error?.message || `Action failed`); }
  };

  const handleActionClaim = async (claimId, status) => {
    try {
      await payrollAPI.actionReimbursement(parseInt(claimId, 10), { status });
      toast.success(`Claim ${status}`);
      load();
    } catch (err) { toast.error('Failed to update claim'); }
  };

  const handleSubmitClaim = async () => {
    if (!claimForm.amount || !claimForm.reason) return toast.error('Required fields missing');
    setSaving(true);
    try {
      await payrollAPI.submitReimbursement({ type: claimForm.type, amount: parseFloat(claimForm.amount), reason: claimForm.reason });
      toast.success('Claim submitted');
      setClaimModal(false);
      setClaimForm({ type: 'Transport', amount: '', reason: '' });
      load();
    } catch (err) { toast.error('Submission failed'); } finally { setSaving(false); }
  };

  const handleCreateRun = async () => {
    setSaving(true);
    try {
      const startDateObj = new Date(runForm.PeriodStartDate);
      await payrollAPI.createRun({
        PolicyID: Number(runForm.PolicyID) || 1,
        PeriodYear: startDateObj.getFullYear(),
        PeriodMonth: startDateObj.getMonth() + 1,
        PeriodStartDate: new Date(runForm.PeriodStartDate).toISOString(),
        PeriodEndDate: new Date(runForm.PeriodEndDate).toISOString(),
        CutoffDate: new Date(runForm.CutoffDate || runForm.PeriodEndDate).toISOString(),
        PaymentDate: new Date(runForm.PaymentDate || runForm.PeriodEndDate).toISOString(),
      });
      toast.success('Payroll run created');
      setCreateRunModal(false);
      load();
    } catch (err) { toast.error('Failed to create run'); } finally { setSaving(false); }
  };

  const handleSubmitDispute = async () => {
    if (!disputeForm.Reason) return toast.error('Please describe the issue');
    setSaving(true);
    try {
      await payrollAPI.submitDispute({
        PayslipID: disputeModal?.PayslipID,
        DisputeType: disputeForm.DisputeType,
        Reason: disputeForm.Reason,
      });
      toast.success('Dispute submitted — payroll team will review');
      setDisputeModal(null);
      setDisputeForm({ DisputeType: 'OverDeduction', Reason: '' });
      load();
    } catch (err) { toast.error('Failed to submit dispute'); } finally { setSaving(false); }
  };

  const handleAddTaxBracket = async () => {
    if (!taxForm.FromAmountEGP || !taxForm.RatePct || !taxForm.BracketOrder) return toast.error('Fill all required fields');
    setSaving(true);
    try {
      await payrollAPI.createTaxBracket(taxForm);
      toast.success('Tax bracket added');
      setAddTaxModal(false);
      setTaxForm({ BracketOrder: '', FromAmountEGP: '', ToAmountEGP: '', RatePct: '', PersonalExemptionEGP: 0, EffectiveYear: new Date().getFullYear() });
      loadConfig_data();
    } catch (err) { toast.error('Failed to add bracket'); } finally { setSaving(false); }
  };

  const handleOverrideStatus = async () => {
    if (!newStatus || !overrideStatusModal) return;
    setSaving(true);
    try {
      if (overrideStatusModal.isRun) {
        // Override the whole payroll run status
        await api.patch(`/payroll/runs/${overrideStatusModal.EntryID}/status`, { status: newStatus });
      } else {
        // Override individual entry status
        await payrollAPI.updateEntryStatus(overrideStatusModal.EntryID, { status: newStatus });
      }
      toast.success(`Status updated to ${newStatus}`);
      setOverrideStatusModal(null);
      setNewStatus('');
      load();
    } catch (err) { toast.error('Failed to update status'); } finally { setSaving(false); }
  };

  const handleDownloadTaxStatement = (year, filtered) => {
    const totalNet   = filtered.reduce((s, x) => s + Number((x.Entry || x).NetPay || 0), 0);
    const totalGross = filtered.reduce((s, x) => s + Number((x.Entry || x).TotalEarnings || 0), 0);
    const totalTax   = filtered.reduce((s, x) => s + Number((x.Entry || x).TaxAmount || 0), 0);
    const totalSI    = filtered.reduce((s, x) => s + Number((x.Entry || x).EmployeeSocialInsurance || 0), 0);
    const emp        = user?.name || user?.fullName || 'Employee';
    const fmt2       = v => Number(v).toLocaleString('en-EG', { style: 'currency', currency: 'EGP' });

    const rows = filtered.map(s => {
      const r  = s.PayrollRun || s;
      const fd = s.Entry || s;
      const period = r.PeriodMonth
        ? new Date(r.PeriodYear, r.PeriodMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : '—';
      return `<tr>
        <td>${period}</td>
        <td>${s.PayslipNumber || '—'}</td>
        <td>${fmt2(fd.TotalEarnings || 0)}</td>
        <td>${fmt2(fd.TaxAmount || 0)}</td>
        <td>${fmt2(fd.EmployeeSocialInsurance || 0)}</td>
        <td>${fmt2(fd.NetPay || 0)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Annual Tax Statement ${year} — ${emp}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 40px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #1a56db; padding-bottom: 16px; }
  .header h1 { font-size: 22px; color: #1a56db; font-weight: 700; }
  .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
  .meta { margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .meta-row { display: flex; gap: 8px; }
  .meta-label { color: #666; font-size: 12px; min-width: 120px; }
  .meta-value { font-weight: 600; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  .kpi-value { font-size: 18px; font-weight: 700; color: #1a56db; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th { background: #1a56db; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #1a56db; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
  .legal { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 12px 16px; font-size: 11px; color: #92400e; margin-bottom: 24px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Annual Tax Statement</h1>
      <div class="sub">Tax Year: ${year} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;font-size:15px">${emp}</div>
      <div style="font-size:11px;color:#666">HCM Payroll System</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Employee Name</span><span class="meta-value">${emp}</span></div>
    <div class="meta-row"><span class="meta-label">Tax Year</span><span class="meta-value">${year}</span></div>
    <div class="meta-row"><span class="meta-label">Total Months</span><span class="meta-value">${filtered.length}</span></div>
    <div class="meta-row"><span class="meta-label">Document Type</span><span class="meta-value">Annual Income & Tax Summary</span></div>
  </div>

  <div class="summary">
    <div class="kpi"><div class="kpi-label">Total Gross Income</div><div class="kpi-value">${fmt2(totalGross)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Tax Deducted</div><div class="kpi-value" style="color:#e53e3e">${fmt2(totalTax)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Social Insurance</div><div class="kpi-value" style="color:#e53e3e">${fmt2(totalSI)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Net Received</div><div class="kpi-value" style="color:#059669">${fmt2(totalNet)}</div></div>
  </div>

  <div class="legal">
    <strong>Notice:</strong> This document is generated by the HCM Payroll System and reflects salary and tax data for the stated period. Income tax is calculated using progressive brackets per Egyptian Income Tax Law. Social Insurance contributions are per Law 148/2019. This statement may be used for official tax filing purposes.
  </div>

  <table>
    <thead>
      <tr>
        <th>Period</th>
        <th>Payslip No.</th>
        <th>Gross Pay</th>
        <th>Income Tax</th>
        <th>Social Insurance</th>
        <th>Net Pay</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Annual Total (${filtered.length} months)</td>
        <td>${fmt2(totalGross)}</td>
        <td>${fmt2(totalTax)}</td>
        <td>${fmt2(totalSI)}</td>
        <td>${fmt2(totalNet)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>HCM Payroll System &nbsp;|&nbsp; Confidential</span>
    <span>Printed: ${new Date().toLocaleString()}</span>
  </div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    toast.success(`Tax statement for ${year} opened — ready to print or save as PDF`);
  };

  const handleResolveException = async id => {
    try {
      await payrollAPI.resolveException(parseInt(id, 10), { resolution: 'Resolved', ResolutionNotes: 'Resolved manually' });
      toast.success('Exception resolved');
      load();
    } catch (err) { toast.error('Failed to resolve'); }
  };

  const handleSavePolicy = async () => {
    setSaving(true);
    try {
      await payrollAPI.createPolicy({ MinimumWageEGP: configForm.minWage, CutoffDay: configForm.workDays });
      toast.success('Policy updated');
      setEditPolicyModal(false);
      loadConfig_data();
    } catch (err) { toast.error('Failed to save policy'); } finally { setSaving(false); }
  };

  const handleSaveSIRate = async () => {
    setSaving(true);
    try {
      await api.post('/payroll/social-insurance', { EmployeeRatePct: legalForm.siRate });
      toast.success('Social insurance rate updated');
    } catch (err) { toast.error('Failed to update SI rate — ensure endpoint exists on backend'); } finally { setSaving(false); }
  };

  const handleAddPayType = async () => {
    setSaving(true);
    try {
      await api.post('/payroll/pay-types', payTypeForm);
      toast.success('Pay type added');
      setAddPayTypeModal(false);
      setPayTypeForm({ PayTypeCode: '', PayTypeName: '', Category: 'Earning', IsRecurring: true, IsTaxable: true, IsInsurable: true });
      loadConfig_data();
    } catch (err) { toast.error('Failed to add pay type'); } finally { setSaving(false); }
  };

  const handleAddOTRule = async () => {
    setSaving(true);
    try {
      await api.post('/payroll/overtime-rules', otRuleForm);
      toast.success('Overtime rule added');
      setAddOTRuleModal(false);
      setOTRuleForm({ RuleName: '', ThresholdHours: 8, Multiplier: 1.35, IsNighttime: false, IsRestDay: false });
      loadConfig_data();
    } catch (err) { toast.error('Failed to add rule'); } finally { setSaving(false); }
  };

  const handleAddGrade = async () => {
    setSaving(true);
    try {
      await payrollAPI.createPayGrade(gradeForm);
      toast.success('Pay grade added');
      setAddGradeModal(false);
      setGradeForm({ GradeCode: '', GradeName: '', MinSalary: '', MaxSalary: '', CurrencyCode: 'EGP' });
      loadConfig_data();
    } catch (err) { toast.error('Failed to add grade'); } finally { setSaving(false); }
  };

const handleBackup = async () => {
  try {
    const res = await api.get('/payroll/system-backup', { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success('System backup downloaded');
  } catch (err) {
    toast.error('Failed to generate backup');
  }
};

  const openExceptions = exceptions.filter(ex => String(ex.Status || ex.status || 'Open').toUpperCase() === 'OPEN');
  const fmt = v => v != null ? Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }) : '—';

  const TABS = [
    ...(isPayroll ? [{ id: 'reports', label: 'Reports' }] : []),
    { id: 'myslips',   label: 'My Payslips' },
    { id: 'salaryhistory', label: 'Salary History' },
    { id: 'disputes',  label: `Disputes${disputes.length > 0 ? ` (${disputes.length})` : ''}` },
    { id: 'claims',    label: 'Reimbursements' },
    ...(isPayroll ? [
      { id: 'runs',       label: 'Payroll Runs' },
      { id: 'exceptions', label: `Exceptions${openExceptions.length > 0 ? ` (${openExceptions.length})` : ''}` },
      { id: 'config',     label: 'System Config' },
    ] : []),
    ...(isLegal ? [{ id: 'legal', label: 'Legal & Compliance' }] : []),
  ];

  return (
    <>
      <div className="page-header">
        <h1>Payroll Engine</h1>
        <p>Enterprise Compliance & Calculation Service</p>
      </div>

      <div className="tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── Department Payroll Report ── */}
      {tab === 'reports' && isPayroll && <DeptReport runs={runs} fmt={fmt} />}

      {/* ── My Payslips ── */}
      {tab === 'myslips' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {myPayslips.length === 0
                ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No payslips yet.</td></tr>
                : myPayslips.map((slip, i) => {
                  const runData       = slip.PayrollRun || slip;
                  const financialData = slip.Entry      || slip;
                  const entryStatus   = financialData?.Status || slip?.Status || 'Finalized';
                  return (
                    <tr key={slip.PayslipID || i}>
                      <td>{new Date(runData.PeriodStartDate || slip.IssueDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                      <td style={{ color: 'var(--green)' }}>{fmt(financialData.TotalEarnings || 0)}</td>
                      <td style={{ color: 'var(--red)'   }}>{fmt(financialData.TotalDeductions || 0)}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(financialData.NetPay || 0)}</td>
                      <td>
                        {(() => {
                          const steps = ['Draft', 'Finalized', 'Paid'];
                          const labels = { Draft: 'Processing', Finalized: 'Ready', Paid: 'Paid' };
                          const idx = steps.indexOf(entryStatus) === -1 ? 0 : steps.indexOf(entryStatus);
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                              {steps.map((s, i) => (
                                <React.Fragment key={s}>
                                  <div style={{
                                    width: 18, height: 18, borderRadius: '50%',
                                    background: i <= idx ? 'var(--green)' : 'var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.6rem', color: '#fff', fontWeight: 700, flexShrink: 0,
                                  }}>{i < idx ? '✓' : i + 1}</div>
                                  {i < steps.length - 1 && (
                                    <div style={{ width: 14, height: 2, background: i < idx ? 'var(--green)' : 'var(--border)', flexShrink: 0 }} />
                                  )}
                                </React.Fragment>
                              ))}
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 6 }}>{labels[entryStatus] || entryStatus}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSlip(slip)}><FileText size={13} /> View</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setDisputeModal(slip)}><AlertTriangle size={13} /> Dispute</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
{/* ── Salary History ── */}
{tab === 'salaryhistory' && (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {myPayslips.length} payslip{myPayslips.length !== 1 ? 's' : ''} on record
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter by year:</label>
        <select
          className="form-input"
          style={{ width: 120, padding: '4px 8px', fontSize: '0.85rem' }}
          value={historyYear}
          onChange={e => setHistoryYear(e.target.value)}
        >
          <option value="">All years</option>
          {[...new Set(myPayslips.map(s => {
            const r = s.PayrollRun || s;
            return r.PeriodYear || new Date(s.IssueDate).getFullYear();
          }))].sort((a, b) => b - a).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {historyYear && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const filtered = myPayslips.filter(s => {
                const r = s.PayrollRun || s;
                return String(r.PeriodYear || new Date(s.IssueDate).getFullYear()) === String(historyYear);
              });
              handleDownloadTaxStatement(historyYear, filtered);
            }}
          >
            <Download size={13} /> Tax Statement
          </button>
        )}
      </div>
    </div>

    {/* Summary cards for filtered year */}
    {(() => {
      const filtered = myPayslips.filter(s => {
        if (!historyYear) return true;
        const r = s.PayrollRun || s;
        const y = r.PeriodYear || new Date(s.IssueDate).getFullYear();
        return String(y) === String(historyYear);
      });
      const totalNet   = filtered.reduce((sum, s) => sum + Number((s.Entry || s).NetPay || 0), 0);
      const totalGross = filtered.reduce((sum, s) => sum + Number((s.Entry || s).TotalEarnings || 0), 0);
      const totalTax   = filtered.reduce((sum, s) => sum + Number((s.Entry || s).TaxAmount || 0), 0);
      const totalSI    = filtered.reduce((sum, s) => sum + Number((s.Entry || s).EmployeeSocialInsurance || 0), 0);

      return (
        <>
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <PayKPI icon={DollarSign}    color="var(--green)" label="Total Net Received"  value={fmt(totalNet)} sub={historyYear || 'All time'} />
            <PayKPI icon={TrendingUp}    color="var(--blue)"  label="Total Gross Earned"  value={fmt(totalGross)} />
            <PayKPI icon={Percent}       color="var(--red)"   label="Total Tax Paid"       value={fmt(totalTax)} />
            <PayKPI icon={ShieldCheck}   color="var(--gold)"  label="Total SI Deducted"    value={fmt(totalSI)} />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Payslip #</th>
                  <th>Base Salary</th>
                  <th>Gross Pay</th>
                  <th>Absence Deduction</th>
                  <th>Tax</th>
                  <th>SI</th>
                  <th>Net Pay</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan="10" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No payslips for this period.</td></tr>
                  : filtered.map((slip, i) => {
                    const r  = slip.PayrollRun || slip;
                    const fd = slip.Entry      || slip;
                    const month = r.PeriodMonth ? new Date(r.PeriodYear, r.PeriodMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : new Date(slip.IssueDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const entryStatus = fd?.Status || 'Finalized';
                    const absenceDeduction = Number(fd.UnpaidLeaveDeduction || 0);
                    return (
                      <tr key={slip.PayslipID || i}>
                        <td style={{ fontWeight: 500 }}>{month}</td>
                        <td><code style={{ fontSize: '0.78rem' }}>{slip.PayslipNumber || '—'}</code></td>
                        <td>{fmt(fd.BaseSalary || 0)}</td>
                        <td style={{ color: 'var(--green)' }}>{fmt(fd.TotalEarnings || 0)}</td>
                        <td style={{ color: absenceDeduction > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                          {absenceDeduction > 0 ? fmt(absenceDeduction) : '—'}
                        </td>
                        <td style={{ color: 'var(--red)' }}>{fmt(fd.TaxAmount || 0)}</td>
                        <td style={{ color: 'var(--red)' }}>{fmt(fd.EmployeeSocialInsurance || 0)}</td>
                        <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(fd.NetPay || 0)}</td>
                        <td><Badge status={entryStatus}>{entryStatus}</Badge></td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSlip(slip)}>
                            <FileText size={13} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
              {(() => {
                if (filtered.length < 2) return null;
                const totalNet2   = filtered.reduce((s, x) => s + Number((x.Entry || x).NetPay || 0), 0);
                const totalGross2 = filtered.reduce((s, x) => s + Number((x.Entry || x).TotalEarnings || 0), 0);
                const totalAbsence2 = filtered.reduce((s, x) => s + Number((x.Entry || x).UnpaidLeaveDeduction || 0), 0);
                const totalTax2   = filtered.reduce((s, x) => s + Number((x.Entry || x).TaxAmount || 0), 0);
                const totalSI2    = filtered.reduce((s, x) => s + Number((x.Entry || x).EmployeeSocialInsurance || 0), 0);
                return (
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                      <td colSpan="3" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Totals ({filtered.length} months)</td>
                      <td style={{ color: 'var(--green)' }}>{fmt(totalGross2)}</td>
                      <td style={{ color: 'var(--red)' }}>{totalAbsence2 > 0 ? fmt(totalAbsence2) : '—'}</td>
                      <td style={{ color: 'var(--red)' }}>{fmt(totalTax2)}</td>
                      <td style={{ color: 'var(--red)' }}>{fmt(totalSI2)}</td>
                      <td style={{ color: 'var(--gold)' }}>{fmt(totalNet2)}</td>
                      <td colSpan="2"></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </>
      );
    })()}
  </div>
)}

      {/* ── Disputes ── */}
      {tab === 'disputes' && (
        <div className="table-wrap">
          <div style={{ marginBottom: 12, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            To raise a new dispute, go to My Payslips and click Dispute on the relevant payslip.
          </div>
          <table>
            <thead><tr><th>Period</th><th>Type</th><th>Description</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              {disputes.length === 0
                ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No disputes submitted yet.</td></tr>
                : disputes.map((d, i) => {
                  const r = d.PayrollRun;
                  const period = r ? new Date(r.PeriodYear, r.PeriodMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                  const rawDesc = d.Description || '';
                  const typeMatch = rawDesc.match(/\[DISPUTE\] ([^:]+):/);
                  const disputeType = typeMatch ? typeMatch[1] : 'Dispute';
                  const reason = rawDesc.replace(/\[DISPUTE\] [^:]+: /, '');
                  return (
                    <tr key={d.ExceptionID || i}>
                      <td>{period}</td>
                      <td><Badge status={disputeType}>{disputeType}</Badge></td>
                      <td style={{ maxWidth: 280, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{reason}</td>
                      <td><Badge status={d.Status}>{d.Status}</Badge></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(d.CreatedAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reimbursements ── */}
      {tab === 'claims' && (
        <div className="table-wrap">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setClaimModal(true)}><Plus size={14} /> New Claim</button>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {claims.length === 0
                ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24 }}>No claims found.</td></tr>
                : claims.map(c => (
                  <tr key={c.ClaimID || c.id}>
                    <td>{c.Employee?.FullName || user.fullName}</td>
                    <td>{new Date(c.CreatedAt || Date.now()).toLocaleDateString()}</td>
                    <td>{c.Category || c.type}</td>
                    <td>{fmt(c.Amount || c.amount)}</td>
                    <td><Badge status={c.Status || c.status}>{c.Status || c.status}</Badge></td>
                    <td>
                      {isPayroll && (c.Status === 'Pending' || c.status === 'Pending') && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-success btn-xs" onClick={() => handleActionClaim(c.ClaimID || c.id, 'Approved')}><Check size={12} /></button>
                          <button className="btn btn-red btn-xs"     onClick={() => handleActionClaim(c.ClaimID || c.id, 'Rejected')}><X size={12} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payroll Runs ── */}
      {tab === 'runs' && isPayroll && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => { setCreateRunModal(true); loadConfig_data(); }}><Plus size={16} /> New Run</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Run ID</th><th>Period</th><th>Status</th><th>Total Net</th><th>Employees</th><th>Actions</th></tr></thead>
              <tbody>
                {loadRuns
                  ? <tr><td colSpan="6"><SkeletonTable /></td></tr>
                  : runs.map((run, i) => (
                    <tr key={run.PayrollRunID || i}>
                      <td>#{run.PayrollRunID}</td>
                      <td>{new Date(run.PeriodStartDate).toLocaleDateString()} – {new Date(run.PeriodEndDate).toLocaleDateString()}</td>
                      <td><Badge status={run.Status}>{run.Status}</Badge></td>
                      <td style={{ fontWeight: 500 }}>{fmt(run.TotalNetAmount)}</td>
                      <td>{run.TotalEmployees}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(run.Status === 'Draft' || run.Status === 'Processing') && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'process')}><Play size={12} /> {run.Status === 'Processing' ? 'Re-Process' : 'Process'}</button>
                          )}
                          {run.Status === 'PendingApproval' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'approve')}><CheckCircle size={12} /> Approve</button>
                          )}
                          {run.Status === 'Approved' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'finalize')}><Zap size={12} /> Finalize</button>
                          )}
                          {run.Status === 'Finalized' && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'payslips')}><FileText size={12} /> Payslips</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'bankfile')}><Download size={12} /> Bank File</button>
                            </>
                          )}
                          {['Finalized', 'Approved', 'PendingApproval'].includes(run.Status) && isPayroll && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} onClick={() => setOverrideStatusModal({ EntryID: run.PayrollRunID, currentStatus: run.Status, label: `Run #${run.PayrollRunID}`, isRun: true })}><Edit2 size={12} /> Override</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Exceptions ── */}
      {tab === 'exceptions' && isPayroll && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {exceptions.map((ex, i) => {
                const isOpen = String(ex.Status || ex.status || 'Open').toUpperCase() === 'OPEN';
                return (
                  <tr key={ex.ExceptionID || i}>
                    <td>{ex.Employee?.FullName || '—'}</td>
                    <td>{ex.ExceptionType || '—'}</td>
                    <td style={{ maxWidth: 250 }}><span className="truncate">{ex.Description || '—'}</span></td>
                    <td><Badge status={ex.Status || 'Open'}>{ex.Status || 'Open'}</Badge></td>
                    <td>
                      {isOpen
                        ? <button className="btn btn-success btn-sm" onClick={() => handleResolveException(ex.ExceptionID)}><CheckCircle size={12} /> Resolve</button>
                        : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Resolved</span>}
                    </td>
                  </tr>
                );
              })}
              {exceptions.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No exceptions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── System Config ── */}
      {tab === 'config' && isPayroll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Global Policies */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><Zap size={16} style={{ marginRight: 6 }} />Global Policies</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditPolicyModal(true)}><Edit2 size={13} /> Edit</button>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : policies.length > 0
                  ? <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead><tr><th>Policy Name</th><th>Pay Period</th><th>Payment Day</th><th>Min Wage (EGP)</th><th>Max Deduction Days</th></tr></thead>
                      <tbody>
                        {policies.map((p, i) => (
                          <tr key={p.PolicyID || i}>
                            <td>{p.PolicyName}</td>
                            <td>{p.PayPeriod}</td>
                            <td>{p.PaymentDay}</td>
                            <td>{fmt(p.MinimumWageEGP)}</td>
                            <td>{p.MaxMonthlyDeductionDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No policies configured yet.</p>
              }
            </div>
          </div>

          {/* Pay Grades */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><TrendingUp size={16} style={{ marginRight: 6 }} />Pay Grades</div>
              <button className="btn btn-primary btn-sm" onClick={() => setAddGradeModal(true)}><Plus size={13} /> Add Grade</button>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead><tr><th>Code</th><th>Name</th><th>Min Salary</th><th>Max Salary</th><th>Currency</th></tr></thead>
                    <tbody>
                      {payGrades.map((g, i) => (
                        <tr key={g.PayGradeID || i}>
                          <td>{g.GradeCode}</td>
                          <td>{g.GradeName}</td>
                          <td style={{ color: 'var(--green)' }}>{fmt(g.MinSalary)}</td>
                          <td style={{ color: 'var(--green)' }}>{fmt(g.MaxSalary)}</td>
                          <td>{g.CurrencyCode}</td>
                        </tr>
                      ))}
                      {payGrades.length === 0 && <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>No pay grades defined.</td></tr>}
                    </tbody>
                  </table>
              }
            </div>
          </div>

          {/* Pay Types */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><Tag size={16} style={{ marginRight: 6 }} />Pay Types</div>
              <button className="btn btn-primary btn-sm" onClick={() => setAddPayTypeModal(true)}><Plus size={13} /> Add Type</button>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Taxable</th><th>Insurable</th><th>Recurring</th></tr></thead>
                    <tbody>
                      {payTypes.map((pt, i) => (
                        <tr key={pt.PayTypeID || i}>
                          <td><code style={{ fontSize: '0.8rem' }}>{pt.PayTypeCode}</code></td>
                          <td>{pt.PayTypeName}</td>
                          <td><Badge status={pt.Category}>{pt.Category}</Badge></td>
                          <td>{pt.IsTaxable   ? <Check size={14} color="var(--green)" /> : <X size={14} color="var(--red)" />}</td>
                          <td>{pt.IsInsurable ? <Check size={14} color="var(--green)" /> : <X size={14} color="var(--red)" />}</td>
                          <td>{pt.IsRecurring ? <Check size={14} color="var(--green)" /> : <X size={14} color="var(--red)" />}</td>
                        </tr>
                      ))}
                      {payTypes.length === 0 && <tr><td colSpan="6" style={{ color: 'var(--text-muted)' }}>No pay types defined.</td></tr>}
                    </tbody>
                  </table>
              }
            </div>
          </div>

          {/* Overtime Rules */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><Clock size={16} style={{ marginRight: 6 }} />Overtime Rules</div>
              <button className="btn btn-primary btn-sm" onClick={() => setAddOTRuleModal(true)}><Plus size={13} /> Add Rule</button>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead><tr><th>Rule Name</th><th>Threshold Hours</th><th>Multiplier</th><th>Nighttime</th><th>Rest Day</th></tr></thead>
                    <tbody>
                      {overtimeRules.map((r, i) => (
                        <tr key={r.OvertimeRuleID || i}>
                          <td>{r.RuleName}</td>
                          <td>{r.ThresholdHours}h</td>
                          <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{r.Multiplier}x</td>
                          <td>{r.IsNighttime ? <Check size={14} color="var(--green)" /> : '—'}</td>
                          <td>{r.IsRestDay  ? <Check size={14} color="var(--green)" /> : '—'}</td>
                        </tr>
                      ))}
                      {overtimeRules.length === 0 && <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>No overtime rules defined.</td></tr>}
                    </tbody>
                  </table>
              }
            </div>
          </div>

          {/* Allowances */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><DollarSign size={16} style={{ marginRight: 6 }} />Allowances</div>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead><tr><th>Name</th><th>Amount</th><th>Currency</th><th>Applies To</th></tr></thead>
                    <tbody>
                      {allowances.map((a, i) => (
                        <tr key={a.AllowanceID || i}>
                          <td>{a.AllowanceName}</td>
                          <td style={{ color: 'var(--green)' }}>{fmt(a.Amount)}</td>
                          <td>{a.CurrencyCode}</td>
                          <td>{a.AppliesTo || '—'}</td>
                        </tr>
                      ))}
                      {allowances.length === 0 && <tr><td colSpan="4" style={{ color: 'var(--text-muted)' }}>No allowances defined.</td></tr>}
                    </tbody>
                  </table>
              }
            </div>
          </div>

          {/* Shift Differentials */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><Layers size={16} style={{ marginRight: 6 }} />Shift Differentials</div>
            </div>
            <div className="card-body">
              {loadConfig
                ? <SkeletonCard />
                : <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead><tr><th>Name</th><th>Multiplier</th><th>Flat Amount</th></tr></thead>
                    <tbody>
                      {shiftDiffs.map((s, i) => (
                        <tr key={s.DifferentialID || i}>
                          <td>{s.DifferentialName}</td>
                          <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{s.Multiplier}x</td>
                          <td>{s.FlatAmount > 0 ? fmt(s.FlatAmount) : '—'}</td>
                        </tr>
                      ))}
                      {shiftDiffs.length === 0 && <tr><td colSpan="3" style={{ color: 'var(--text-muted)' }}>No shift differentials defined.</td></tr>}
                    </tbody>
                  </table>
              }
            </div>
          </div>

        </div>
      )}

      {/* ── Legal & Compliance ── */}
      {tab === 'legal' && isLegal && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><Globe size={18} style={{ marginRight: 6 }} />Tax Brackets</div>
              <button className="btn btn-primary btn-sm" onClick={() => setAddTaxModal(true)}><Plus size={13} /> Add Bracket</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>From (EGP)</th><th>To (EGP)</th><th>Rate %</th><th>Year</th></tr></thead>
                <tbody>
                  {loadConfig
                    ? <tr><td colSpan="5"><SkeletonCard /></td></tr>
                    : taxBrackets.length === 0
                      ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>No tax brackets configured.</td></tr>
                      : taxBrackets.map((b, i) => (
                        <tr key={b.BracketID || i}>
                          <td>{b.BracketOrder}</td>
                          <td>{fmt(b.FromAmountEGP)}</td>
                          <td>{b.ToAmountEGP ? fmt(b.ToAmountEGP) : '∞'}</td>
                          <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{b.RatePct}%</td>
                          <td>{b.EffectiveYear}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><Scale size={18} style={{ marginRight: 6 }} />Social Insurance</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Employee SI Rate (%)</label>
                <input type="number" className="form-input" step="0.01" value={legalForm.siRate} onChange={e => setLegalForm({ ...legalForm, siRate: e.target.value })} />
              </div>
              <button className="btn btn-primary btn-sm w-full" onClick={handleSaveSIRate} disabled={saving}>
                {saving ? <InlineSpinner /> : <><Save size={13} /> Save Rate</>}
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><Database size={18} style={{ marginRight: 6 }} />Maintenance</div></div>
            <div className="card-body">
              <button className="btn btn-success btn-sm w-full" onClick={handleBackup}><Download size={14} /> Download System Backup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}

      {/* New Claim */}
      <Modal open={claimModal} onClose={() => setClaimModal(false)} title="New Reimbursement Claim">
        <div className="form-group"><label className="form-label">Category</label>
          <select className="form-input" value={claimForm.type} onChange={e => setClaimForm({ ...claimForm, type: e.target.value })}>
            <option value="Transport">Transport</option>
            <option value="Education">Education</option>
            <option value="Travel">Travel</option>
            <option value="Medical">Medical</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Amount (EGP)</label>
          <input type="number" className="form-input" value={claimForm.amount} onChange={e => setClaimForm({ ...claimForm, amount: e.target.value })} />
        </div>
        <div className="form-group"><label className="form-label">Reason</label>
          <textarea className="form-input" value={claimForm.reason} onChange={e => setClaimForm({ ...claimForm, reason: e.target.value })} rows={3} />
        </div>
        <button className="btn btn-primary w-full" onClick={handleSubmitClaim} disabled={saving}>{saving ? <InlineSpinner /> : 'Submit Claim'}</button>
      </Modal>

      {/* Create Payroll Run */}
      <Modal open={createRunModal} onClose={() => setCreateRunModal(false)} title="Create Payroll Run"
        footer={<><button className="btn btn-secondary" onClick={() => setCreateRunModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateRun} disabled={saving}>{saving ? <InlineSpinner /> : 'Create'}</button></>}>
        <div className="form-group"><label className="form-label">Payroll Policy</label>
          <select className="form-input" value={runForm.PolicyID} onChange={e => setRunForm(f => ({ ...f, PolicyID: e.target.value }))}>
            <option value="">— select a policy —</option>
            {policies.map(p => (
              <option key={p.PolicyID} value={p.PolicyID}>
                {p.PolicyName} — {p.PayPeriod} (pay day: {p.PaymentDay})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Start Date</label>
            <input className="form-input" type="date" value={runForm.PeriodStartDate} onChange={e => setRunForm(f => ({ ...f, PeriodStartDate: e.target.value }))} />
          </div>
          <div className="form-group"><label className="form-label">End Date</label>
            <input className="form-input" type="date" value={runForm.PeriodEndDate} onChange={e => setRunForm(f => ({ ...f, PeriodEndDate: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Cutoff Date</label>
            <input className="form-input" type="date" value={runForm.CutoffDate} onChange={e => setRunForm(f => ({ ...f, CutoffDate: e.target.value }))} />
          </div>
          <div className="form-group"><label className="form-label">Payment Date</label>
            <input className="form-input" type="date" value={runForm.PaymentDate} onChange={e => setRunForm(f => ({ ...f, PaymentDate: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Edit Global Policy */}
      <Modal open={editPolicyModal} onClose={() => setEditPolicyModal(false)} title="Update Global Policy">
        <div className="form-group"><label className="form-label">Minimum Wage (EGP)</label>
          <input type="number" className="form-input" value={configForm.minWage} onChange={e => setConfigForm({ ...configForm, minWage: e.target.value })} />
        </div>
        <div className="form-group"><label className="form-label">Working Days Per Month</label>
          <input type="number" className="form-input" value={configForm.workDays} onChange={e => setConfigForm({ ...configForm, workDays: e.target.value })} />
        </div>
        <button className="btn btn-primary w-full" onClick={handleSavePolicy} disabled={saving}>{saving ? <InlineSpinner /> : <><Save size={13} /> Save Policy</>}</button>
      </Modal>

      {/* Add Pay Type */}
      <Modal open={addPayTypeModal} onClose={() => setAddPayTypeModal(false)} title="Add Pay Type">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Code</label>
            <input className="form-input" placeholder="e.g. BONUS" value={payTypeForm.PayTypeCode} onChange={e => setPayTypeForm({ ...payTypeForm, PayTypeCode: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Name</label>
            <input className="form-input" placeholder="e.g. Performance Bonus" value={payTypeForm.PayTypeName} onChange={e => setPayTypeForm({ ...payTypeForm, PayTypeName: e.target.value })} />
          </div>
        </div>
        <div className="form-group"><label className="form-label">Category</label>
          <select className="form-input" value={payTypeForm.Category} onChange={e => setPayTypeForm({ ...payTypeForm, Category: e.target.value })}>
            <option value="Earning">Earning</option>
            <option value="Deduction">Deduction</option>
            <option value="Benefit">Benefit</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          {['IsRecurring', 'IsTaxable', 'IsInsurable'].map(key => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={payTypeForm[key]} onChange={e => setPayTypeForm({ ...payTypeForm, [key]: e.target.checked })} />
              {key.replace('Is', '')}
            </label>
          ))}
        </div>
        <button className="btn btn-primary w-full" onClick={handleAddPayType} disabled={saving}>{saving ? <InlineSpinner /> : 'Add Pay Type'}</button>
      </Modal>

      {/* Add Overtime Rule */}
      <Modal open={addOTRuleModal} onClose={() => setAddOTRuleModal(false)} title="Add Overtime Rule">
        <div className="form-group"><label className="form-label">Rule Name</label>
          <input className="form-input" placeholder="e.g. Weekday Overtime" value={otRuleForm.RuleName} onChange={e => setOTRuleForm({ ...otRuleForm, RuleName: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Threshold Hours</label>
            <input type="number" className="form-input" value={otRuleForm.ThresholdHours} onChange={e => setOTRuleForm({ ...otRuleForm, ThresholdHours: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Multiplier</label>
            <input type="number" step="0.05" className="form-input" value={otRuleForm.Multiplier} onChange={e => setOTRuleForm({ ...otRuleForm, Multiplier: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          {['IsNighttime', 'IsRestDay'].map(key => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={otRuleForm[key]} onChange={e => setOTRuleForm({ ...otRuleForm, [key]: e.target.checked })} />
              {key.replace('Is', '')}
            </label>
          ))}
        </div>
        <button className="btn btn-primary w-full" onClick={handleAddOTRule} disabled={saving}>{saving ? <InlineSpinner /> : 'Add Rule'}</button>
      </Modal>

      {/* Add Pay Grade */}
      <Modal open={addGradeModal} onClose={() => setAddGradeModal(false)} title="Add Pay Grade">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Code</label>
            <input className="form-input" placeholder="e.g. G3" value={gradeForm.GradeCode} onChange={e => setGradeForm({ ...gradeForm, GradeCode: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Name</label>
            <input className="form-input" placeholder="e.g. Senior Staff" value={gradeForm.GradeName} onChange={e => setGradeForm({ ...gradeForm, GradeName: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Min Salary (EGP)</label>
            <input type="number" className="form-input" value={gradeForm.MinSalary} onChange={e => setGradeForm({ ...gradeForm, MinSalary: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Max Salary (EGP)</label>
            <input type="number" className="form-input" value={gradeForm.MaxSalary} onChange={e => setGradeForm({ ...gradeForm, MaxSalary: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={handleAddGrade} disabled={saving}>{saving ? <InlineSpinner /> : 'Add Grade'}</button>
      </Modal>

      {/* Add Tax Bracket */}
      <Modal open={addTaxModal} onClose={() => setAddTaxModal(false)} title="Add Tax Bracket">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Bracket Order</label>
            <input type="number" className="form-input" placeholder="e.g. 1" value={taxForm.BracketOrder} onChange={e => setTaxForm({ ...taxForm, BracketOrder: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Effective Year</label>
            <input type="number" className="form-input" value={taxForm.EffectiveYear} onChange={e => setTaxForm({ ...taxForm, EffectiveYear: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">From Amount (EGP)</label>
            <input type="number" className="form-input" placeholder="e.g. 0" value={taxForm.FromAmountEGP} onChange={e => setTaxForm({ ...taxForm, FromAmountEGP: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">To Amount (EGP, blank = ∞)</label>
            <input type="number" className="form-input" placeholder="leave blank for top bracket" value={taxForm.ToAmountEGP} onChange={e => setTaxForm({ ...taxForm, ToAmountEGP: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Tax Rate (%)</label>
            <input type="number" step="0.5" className="form-input" placeholder="e.g. 10" value={taxForm.RatePct} onChange={e => setTaxForm({ ...taxForm, RatePct: e.target.value })} />
          </div>
          <div className="form-group"><label className="form-label">Personal Exemption (EGP)</label>
            <input type="number" className="form-input" value={taxForm.PersonalExemptionEGP} onChange={e => setTaxForm({ ...taxForm, PersonalExemptionEGP: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={handleAddTaxBracket} disabled={saving}>{saving ? <InlineSpinner /> : <><Plus size={13} /> Add Bracket</>}</button>
      </Modal>

      {/* Override Entry Status */}
      <Modal open={!!overrideStatusModal} onClose={() => { setOverrideStatusModal(null); setNewStatus(''); }} title="Override Payment Status">
        <div style={{ marginBottom: 12, fontSize: '0.83rem', color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
          {overrideStatusModal?.label} — current status: <strong>{overrideStatusModal?.currentStatus}</strong>
        </div>
        <div className="form-group">
          <label className="form-label">New Status</label>
          <select className="form-input" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
            <option value="">— select —</option>
            {overrideStatusModal?.isRun ? (
              <>
                <option value="Draft">Draft</option>
                <option value="Processing">Processing</option>
                <option value="PendingApproval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Finalized">Finalized</option>
                <option value="Paid">Paid</option>
              </>
            ) : (
              <>
                <option value="Draft">Draft</option>
                <option value="Finalized">Finalized</option>
                <option value="Paid">Paid</option>
                <option value="Failed">Failed</option>
                <option value="Exception">Exception</option>
              </>
            )}
          </select>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--red)', marginBottom: 12 }}>
          This is a privileged override. Ensure proper authorization before proceeding.
        </div>
        <button className="btn btn-primary w-full" onClick={handleOverrideStatus} disabled={saving || !newStatus}>
          {saving ? <InlineSpinner /> : <><Lock size={13} /> Apply Override</>}
        </button>
      </Modal>

      {/* Dispute Modal */}
      <Modal open={!!disputeModal} onClose={() => { setDisputeModal(null); setDisputeForm({ DisputeType: 'OverDeduction', Reason: '' }); }} title="Submit Payroll Dispute">
        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
          Payslip: <strong>{disputeModal?.PayslipNumber || '—'}</strong>
          {disputeModal?.PayrollRun && (
            <span style={{ marginLeft: 8 }}>
              Period: {new Date(disputeModal.PayrollRun.PeriodYear, disputeModal.PayrollRun.PeriodMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Dispute Type</label>
          <select className="form-input" value={disputeForm.DisputeType} onChange={e => setDisputeForm({ ...disputeForm, DisputeType: e.target.value })}>
            <option value="OverDeduction">Over-deduction</option>
            <option value="MissingBonus">Missing Bonus</option>
            <option value="WrongBaseSalary">Wrong Base Salary</option>
            <option value="MissingAllowance">Missing Allowance</option>
            <option value="OvertimeNotPaid">Overtime Not Paid</option>
            <option value="WrongTax">Incorrect Tax Calculation</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Describe the issue</label>
          <textarea
            className="form-input"
            rows={4}
            placeholder="Please describe the discrepancy clearly, including expected vs actual amounts if possible..."
            value={disputeForm.Reason}
            onChange={e => setDisputeForm({ ...disputeForm, Reason: e.target.value })}
          />
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Your dispute will be reviewed by the payroll team and you will be notified of the outcome.
        </div>
        <button className="btn btn-primary w-full" onClick={handleSubmitDispute} disabled={saving || !disputeForm.Reason}>
          {saving ? <InlineSpinner /> : <><AlertTriangle size={13} /> Submit Dispute</>}
        </button>
      </Modal>

      <PayslipModal payslip={selectedSlip} onClose={() => setSlip(null)} />
    </>
  );
}