// src/pages/Attendance/AttendancePage.js
import React, { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceAPI } from '../../api/services';
import { Badge, SkeletonCard, SkeletonTable, Modal, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';

/* ── Clock Widget ── */
function ClockWidget({ today, onCheckIn, onCheckOut, loading }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const checkInTime  = today?.checkInTime;
  const checkOutTime = today?.checkOutTime;
  const workedHours  = today?.workedHours;
  const shift        = today?.todayShift;
  const checkedIn    = !!checkInTime;
  const checkedOut   = !!checkOutTime;
  const isPast5pm    = new Date().getHours() >= 17;

  const fmtTime = (val) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {}
    return val;
  };

  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
      borderColor: 'var(--gold)',
      boxShadow: 'var(--shadow-gold)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '2.8rem', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '0.05em',
          textShadow: '0 0 30px rgba(240,180,41,0.3)',
        }}>
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        {[
          { label: 'Check In',  value: fmtTime(checkInTime),  color: 'var(--green)' },
          { label: 'Check Out', value: fmtTime(checkOutTime), color: 'var(--red)'   },
          { label: 'Hours',     value: workedHours != null && Number(workedHours) > 0
              ? `${Number(workedHours).toFixed(1)}h` : '—',   color: 'var(--blue)'  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, textAlign: 'center', padding: '12px 8px',
            background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {shift && (
        <div style={{
          marginBottom: 12, padding: '8px 14px',
          background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.8rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            📋 <strong style={{ color: 'var(--text-primary)' }}>{shift.shiftName}</strong>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {shift.startTime} – {shift.endTime} · {shift.expectedHours}h
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-success w-full"
          style={{ justifyContent: 'center', flex: 1 }}
          onClick={onCheckIn}
          disabled={loading || checkedIn || isPast5pm}
          title={isPast5pm ? 'Check-in not allowed after 5:00 PM' : ''}
        >
          {loading ? <InlineSpinner /> : <><LogIn size={16} /> Check In</>}
        </button>
        <button
          className="btn btn-danger w-full"
          style={{ justifyContent: 'center', flex: 1 }}
          onClick={onCheckOut}
          disabled={loading || !checkedIn || checkedOut}
        >
          {loading ? <InlineSpinner /> : <><LogOut size={16} /> Check Out</>}
        </button>
      </div>

      {!checkedIn && isPast5pm && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--red-dim)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--red)' }}>
          ✗ Check-in window closed — not allowed after 5:00 PM
        </div>
      )}
      {!checkedIn && !isPast5pm && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber-dim)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--amber)' }}>
          ⚠ Not clocked in yet — click Check In to start your day
        </div>
      )}
      {checkedIn && !checkedOut && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--green-dim)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--green)' }}>
          ✓ Clocked in since {fmtTime(checkInTime)}
        </div>
      )}
      {checkedIn && checkedOut && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--blue-dim)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--blue)' }}>
          ✓ Day complete · {fmtTime(checkInTime)} → {fmtTime(checkOutTime)}
          {workedHours != null && Number(workedHours) > 0 && ` · ${Number(workedHours).toFixed(1)}h worked`}
        </div>
      )}
    </div>
  );
}

/* ── Calendar View ── */
function AttendanceCalendar({ data }) {
  const [month, setMonth] = useState(new Date());

  const year   = month.getFullYear();
  const mon    = month.getMonth();
  const first  = new Date(year, mon, 1).getDay();
  const days   = new Date(year, mon + 1, 0).getDate();

  // FIX: added 'Correction' status (set by service on approved corrections)
  const STATUS_COLORS = {
    Present:    'var(--green)',
    Absent:     'var(--red)',
    Leave:      'var(--amber)',
    OnLeave:    'var(--amber)',
    Holiday:    'var(--purple)',
    Weekend:    'var(--text-muted)',
    Late:       'var(--gold)',
    Correction: 'var(--blue)',
    NoRecord:   null,
  };

  const getDay = (d) => data?.find(r => {
    const rd = new Date(r.AttendanceDate || r.date || r.attendanceDate);
    return rd.getDate() === d && rd.getMonth() === mon && rd.getFullYear() === year;
  });

  const prevMonth = () => setMonth(new Date(year, mon - 1, 1));
  const nextMonth = () => setMonth(new Date(year, mon + 1, 1));

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Attendance Calendar</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}>&lt;</button>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, padding: '0 8px', lineHeight: '30px' }}>
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}>&gt;</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d      = i + 1;
          const rec    = getDay(d);
          const status = rec?.status || rec?.Status;
          const color  = (status && status !== 'NoRecord') ? STATUS_COLORS[status] : null;
          const isToday = new Date().getDate() === d && new Date().getMonth() === mon && new Date().getFullYear() === year;
          return (
            <div key={d} style={{
              aspectRatio: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: isToday ? 'var(--gold-glow)' : color ? `${color}18` : 'transparent',
              border: isToday ? '1px solid var(--gold)' : '1px solid transparent',
              cursor: rec && status !== 'NoRecord' ? 'pointer' : 'default',
            }}
              title={status && status !== 'NoRecord' ? status : ''}
            >
              <span style={{
                fontSize: '0.8rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--gold)' : 'var(--text-secondary)',
              }}>{d}</span>
              {color && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 2 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* FIX: updated legend to include Correction + OnLeave */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {Object.entries(STATUS_COLORS)
          .filter(([k]) => !['OnLeave', 'NoRecord'].includes(k))
          .map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: v || 'var(--border)' }} />
              {k}
            </div>
          ))}
      </div>
    </div>
  );
}

function CorrectionModal({ open, onClose, attendance, onSubmit, loading }) {
  const [form, setForm] = useState({ Reason: '', CorrectedCheckIn: '', CorrectedCheckOut: '' });

  useEffect(() => {
    if (open) setForm({ Reason: '', CorrectedCheckIn: '', CorrectedCheckOut: '' });
  }, [open]);

  const toISO = (timeStr) => {
    if (!timeStr || !attendance?.AttendanceDate) return null;
    const dateOnly = new Date(attendance.AttendanceDate).toISOString().split('T')[0];
    return new Date(`${dateOnly}T${timeStr}:00`).toISOString();
  };

  const handleSubmit = () => {
    if (!form.Reason.trim()) return;
    const payload = {
      Reason: form.Reason,
      CorrectedCheckIn:  toISO(form.CorrectedCheckIn),
      CorrectedCheckOut: toISO(form.CorrectedCheckOut),
    };
    onSubmit(payload);
  };


  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Correction Request"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !form.Reason.trim()}>
            {loading ? <InlineSpinner /> : 'Submit'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label required">Reason</label>
        <textarea
          className="form-textarea"
          value={form.Reason}
          onChange={e => setForm(f => ({ ...f, Reason: e.target.value }))}
          placeholder="Explain the correction needed..."
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Corrected Check-In</label>
          <input
            className="form-input"
            type="time"
            value={form.CorrectedCheckIn}
            onChange={e => setForm(f => ({ ...f, CorrectedCheckIn: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Corrected Check-Out</label>
          <input
            className="form-input"
            type="time"
            value={form.CorrectedCheckOut}
            onChange={e => setForm(f => ({ ...f, CorrectedCheckOut: e.target.value }))}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ── Main ── */
export default function AttendancePage() {
  const { user }  = useAuth();
  const isManager = ['HR','Admin'].includes(user?.role);
  const [tab, setTab]               = useState('today');
  const [today, setToday]           = useState(null);
  const [kpis, setKpis]             = useState(null);
  const [records, setRecords]       = useState([]);
  const [calData, setCalData]       = useState([]);
  const [summary, setSummary]       = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError,   setSummaryError]   = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [loadToday, setLoadToday]   = useState(true);
  const [loadRecords, setLoadRecords] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);
  const [corrModal, setCorrModal]   = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);

  const loadAll = useCallback(() => {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    // All controllers use: res.json(data) — NO envelope wrapper.
    // Axios gives us res.data = the raw Prisma object / array.

    attendanceAPI.getTodayStatus()
      .then(res => { setToday(res.data); setLoadToday(false); })
      .catch(() => setLoadToday(false));

    attendanceAPI.getDashboardKPIs()
      .then(res => setKpis(res.data))
      .catch(() => {});

    attendanceAPI.getCalendarMe({ year, month })
      .then(res => {
        const d = res.data;
        setCalData(Array.isArray(d) ? d : (d?.records || d?.attendances || []));
      })
      .catch(() => {});

    // ── Summary ──
    // Controller does res.json(data) directly — NO { success, data } envelope.
    // So res.data from Axios IS the Prisma record with PascalCase DB field names.
    setSummaryLoading(true);
    setSummaryError(null);

    const empId = user?.EmployeeID || user?.employeeId || user?.employee_id || user?.id;
    const yr    = now.getFullYear();
    const mo    = now.getMonth() + 1;

    attendanceAPI.getSummaryMe({ year: yr, month: mo })
      .then(res => {
        setSummary(res.data);
        setSummaryLoading(false);
      })
      .catch(async err => {
        const status = err?.response?.status;
        if (status === 404 && empId) {
          try {
            const genRes = await attendanceAPI.generateSummary(empId, yr, mo);
            setSummary(genRes.data);
          } catch {
            setSummaryError('Could not generate summary.');
          }
        } else {
          setSummaryError('Failed to load summary.');
        }
        setSummaryLoading(false);
      });

    if (isManager) {
      attendanceAPI.list({ limit: 20 })
        .then(res => {
          const d = res.data;
          setRecords(Array.isArray(d) ? d : (d?.records || d?.attendances || []));
          setLoadRecords(false);
        })
        .catch(() => setLoadRecords(false));

      attendanceAPI.listCorrections({ status: 'Pending' })
        .then(res => {
          const d = res.data;
          setCorrections(Array.isArray(d) ? d : (d?.corrections || []));
        })
        .catch(() => {});
    } else {
      setLoadRecords(false);
    }
  }, [isManager, user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshToday = () =>
    attendanceAPI.getTodayStatus().then(res => setToday(res.data)).catch(() => {});

  const refreshCalendar = () => {
    const now = new Date();
    attendanceAPI.getCalendarMe({ year: now.getFullYear(), month: now.getMonth() + 1 })
      .then(res => {
        const d = res.data;
        setCalData(Array.isArray(d) ? d : (d?.records || d?.attendances || []));
      })
      .catch(() => {});
  };

  const handleCheckIn = async () => {
    const hour = new Date().getHours();
    if (hour >= 17) {
      toast.error('Check-in is not allowed after 5:00 PM', { duration: 4000 });
      return;
    }
    setClockLoading(true);
    try {
      await attendanceAPI.checkIn({});
      toast.success('Clocked in successfully! ✓');
      await refreshToday();
      refreshCalendar();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Check-in failed');
    } finally { setClockLoading(false); }
  };

  const handleCheckOut = async () => {
    setClockLoading(true);
    try {
      const res      = await attendanceAPI.checkOut({});
      const data     = res.data;
      const worked   = data?.WorkedHours   ?? data?.workedHours;
      const overtime = data?.OvertimeHours ?? data?.overtimeHours ?? 0;
      const checkOut = data?.CheckOutTime  ?? data?.checkOutTime;
      const timeStr  = checkOut
        ? new Date(checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '';

      let msg = '✓ Clocked out';
      if (timeStr)              msg += ` at ${timeStr}`;
      if (worked  != null && Number(worked) > 0) msg += ` · ${Number(worked).toFixed(1)}h worked`;
      if (Number(overtime) > 0) msg += ` · ${Number(overtime).toFixed(1)}h overtime`;

      toast.success(msg, { duration: 5000 });
      await refreshToday();
      refreshCalendar();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Check-out failed');
    } finally { setClockLoading(false); }
  };

  // FIX: payload keys now match exactly what the service expects
 const handleCorrection = async (payload) => {
  if (!corrModal) return;
  setCorrLoading(true);
  try {
    await attendanceAPI.submitCorrection(corrModal.AttendanceID, payload);
    toast.success('Correction request submitted');
    setCorrModal(null);
    loadAll();
  } catch (err) {
    toast.error(err.response?.data?.error?.message || 'Failed to submit correction');
  } finally { setCorrLoading(false); }
};

  const pendingCorrCount = corrections.filter(c => (c.Status || c.status) === 'Pending').length;

  const TABS = [
    { id: 'today',   label: 'Today'   },
    { id: 'summary', label: 'Summary' },
    ...(isManager ? [
      { id: 'records',     label: 'All Records'  },
      { id: 'corrections', label: `Corrections${pendingCorrCount ? ` (${pendingCorrCount})` : ''}` },
    ] : []),
  ];

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Attendance &amp; Time</h1>
          <p>Track your work hours, view records, and manage corrections</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Today Tab ── */}
      {tab === 'today' && (
        <div className="grid-2-1">
          <div>
            {loadToday ? <SkeletonCard /> : (
              <ClockWidget today={today} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} loading={clockLoading} />
            )}

            {kpis && (
              <div className="grid-3" style={{ marginTop: 20 }}>
                {[
                  { label: 'Hours This Week',   value: kpis.thisWeekHours    != null ? `${Number(kpis.thisWeekHours).toFixed(1)}h`   : '—', sub: 'total worked'    },
                  { label: 'On-Time Rate',       value: kpis.onTimeRate       != null ? `${Number(kpis.onTimeRate).toFixed(0)}%`       : '—', sub: 'this month'     },
                  { label: 'Days to Payroll',    value: kpis.daysToPayroll    != null ? `${kpis.daysToPayroll} days`                   : '—', sub: 'until next pay' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)' }}>{value}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent records sidebar */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Records</div>
            </div>
            {(() => {
              // Normalise field names — calendar returns PascalCase from Prisma
              const norm = calData.map(r => ({
                ...r,
                status:    r.Status        || r.status,
                date:      r.AttendanceDate || r.date,
                checkInTime: r.CheckInTime || r.checkInTime,
              }));

              const actual = norm
                .filter(r => r.status && r.status !== 'NoRecord' && r.status !== 'Weekend')
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 8);

              if (actual.length === 0) return (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No attendance records this month
                </div>
              );

              const COLOR = {
                Present:    'var(--green)', Absent: 'var(--red)',
                Late:       'var(--gold)',  Leave:  'var(--amber)',
                OnLeave:    'var(--amber)', Holiday: 'var(--purple)',
                Correction: 'var(--blue)',
              };

              return actual.map((r, i) => {
                const fmtT = (v) => {
                  if (!v) return null;
                  try { const d = new Date(v); return isNaN(d) ? null : d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
                  catch { return null; }
                };
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 0', borderBottom: '1px solid var(--border-light)',
                  }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      {new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {fmtT(r.checkInTime) && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtT(r.checkInTime)}</span>}
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: COLOR[r.status] || 'var(--text-secondary)' }}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── Summary Tab ── */}
      {tab === 'summary' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">This Month — Live</div>
                <div className="card-subtitle">Calculated from your attendance records right now</div>
              </div>
              <span className="badge badge-approved">Live</span>
            </div>
            {(() => {
              // Calendar records use PascalCase Status from Prisma — normalise to lowercase key
              const norm = calData.map(r => ({ ...r, status: r.Status || r.status }));
              const actual   = norm.filter(r => r.status && r.status !== 'NoRecord' && r.status !== 'Weekend');
              const present  = actual.filter(r => ['Present', 'Late', 'Correction'].includes(r.status)).length;
              const absent   = actual.filter(r => r.status === 'Absent').length;
              const late     = actual.filter(r => r.status === 'Late').length;
              const onLeave  = actual.filter(r => ['Leave', 'OnLeave'].includes(r.status)).length;
              const total    = actual.length;
              const onTimeRate = total > 0 ? Math.round(((present - late) / total) * 100) : 0;

              return [
                { label: 'Days Recorded',   value: total,                                    color: 'var(--blue)'   },
                { label: 'Days Present',    value: present,                                  color: 'var(--green)'  },
                { label: 'Days Absent',     value: absent,                                   color: 'var(--red)'    },
                { label: 'Late Arrivals',   value: late,                                     color: 'var(--amber)'  },
                { label: 'Days on Leave',   value: onLeave,                                  color: 'var(--purple)' },
                { label: 'On-Time Rate',    value: total > 0 ? `${onTimeRate}%` : '—',       color: 'var(--gold)'   },
              ].map(({ label, value, color }) => (
                <div className="info-row" key={label}>
                  <span className="info-row-label">{label}</span>
                  <span className="info-row-value" style={{ color, fontWeight: 600 }}>{value}</span>
                </div>
              ));
            })()}
            <div style={{
              marginTop: 12, padding: '8px 12px',
              background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--blue)',
            }}>
              📊 These numbers update as you check in/out each day
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Official Summary</div>
                <div className="card-subtitle">Last generated by HR</div>
              </div>
              <span className="badge badge-gold">Generated</span>
            </div>

            {summaryLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner" />
              </div>
            ) : summaryError ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--red)', fontSize: '0.85rem' }}>
                {summaryError}
              </div>
            ) : !summary ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No official summary generated yet for this month.
              </div>
            ) : (() => {
              // Accept both PascalCase (Prisma/DB) and camelCase (serialized API)
              const f = (pascal, camel) => summary[pascal] ?? summary[camel];

              const periodMonth = f('PeriodMonth', 'periodMonth');
              const periodYear  = f('PeriodYear',  'periodYear');

              const rows = [
                { label: 'Working Days',   val: f('TotalWorkingDays',  'totalWorkingDays') },
                { label: 'Present Days',   val: f('PresentDays',       'presentDays')      },
                { label: 'Absent Days',    val: f('AbsentDays',        'absentDays')       },
                { label: 'Leave Days',     val: f('LeaveDays',         'leaveDays')        },
                { label: 'Holiday Days',   val: f('HolidayDays',       'holidayDays')      },
                { label: 'Total Hours',    val: f('TotalWorkedHours',  'totalWorkedHours'),  fmt: v => `${Number(v).toFixed(1)}h`  },
                { label: 'Overtime Hours', val: f('TotalOvertimeHrs',  'totalOvertimeHrs'),  fmt: v => `${Number(v).toFixed(1)}h`  },
                { label: 'Late Minutes',   val: f('TotalLatenessMins', 'totalLatenessMins'), fmt: v => `${v} min` },
                { label: 'On-Time Rate',   val: f('OnTimeRate',        'onTimeRate'),        fmt: v => `${Number(v).toFixed(1)}%`  },
              ];

              return (
                <>
                  {periodMonth != null && periodYear != null && (
                    <div style={{
                      padding: '6px 12px', marginBottom: 12,
                      background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.2)',
                      borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--gold-text)',
                    }}>
                      📅 Period: {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][periodMonth - 1]} {periodYear}
                    </div>
                  )}
                  {rows.map(({ label, val, fmt }) => (
                    <div className="info-row" key={label}>
                      <span className="info-row-label">{label}</span>
                      <span className="info-row-value">
                        {val != null ? (fmt ? fmt(val) : val) : '—'}
                      </span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 12, padding: '8px 12px',
                    background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--amber)',
                  }}>
                    ⚠ This is a snapshot and may not reflect today's data.
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── All Records Tab (Manager) ── */}
      {tab === 'records' && isManager && (
        loadRecords ? <SkeletonTable /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>Lateness</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No records found</td></tr>
                ) : records.map((r, i) => {
                  const empName  = r.Employee?.FullName     || '—';
                  const empCode  = r.Employee?.EmployeeCode || '';
                  const shift    = r.Shift?.ShiftName       || null;
                  const date     = r.AttendanceDate;
                  const checkIn  = r.CheckInTime;
                  const checkOut = r.CheckOutTime;
                  const hours    = r.WorkedHours    != null ? Number(r.WorkedHours)     : null;
                  const lateness = r.LatenessMinutes != null ? Number(r.LatenessMinutes) : 0;
                  const status   = r.Status || '—';
                  const id       = r.AttendanceID;
                  const ongoing  = !!checkIn && !checkOut;

                  const fmtT = (v) => {
                    if (!v) return null;
                    try { const d = new Date(v); return isNaN(d) ? null : d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
                    catch { return null; }
                  };

                  return (
                    <tr key={id || i}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{empName}</div>
                        {empCode && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{empCode}</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {shift || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No shift</span>}
                      </td>
                      <td>{date ? new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 500 }}>{fmtT(checkIn) || '—'}</td>
                      <td>
                        {ongoing
                          ? <span className="badge badge-approved" style={{ fontSize: '0.68rem' }}>⏳ Active</span>
                          : <span style={{ color: 'var(--red)', fontWeight: 500 }}>{fmtT(checkOut) || '—'}</span>
                        }
                      </td>
                      <td>
                        {ongoing
                          ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>In progress</span>
                          : hours != null
                            ? <span style={{ color: hours > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {hours > 0 ? `${hours.toFixed(1)}h` : '0h'}
                              </span>
                            : '—'
                        }
                      </td>
                      <td>
                        {lateness > 0
                          ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{lateness} min late</span>
                          : <span style={{ color: 'var(--green)', fontSize: '0.78rem' }}>On time</span>
                        }
                      </td>
                      <td><Badge status={status}>{status}</Badge></td>
                      <td>
                       <button className="btn btn-ghost btn-sm" onClick={() => setCorrModal(r)}>
                          <AlertTriangle size={13} /> Correction
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Corrections Tab (Manager) ── */}
      {tab === 'corrections' && isManager && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Attendance Date</th>
                <th>Reason</th>
                <th>Corrected Check-In</th>
                <th>Corrected Check-Out</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {corrections.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No correction requests</td></tr>
              ) : corrections.map((c, i) => {
                const empName  = c.Employee?.FullName              || c.employeeName || '—';
                const empCode  = c.Employee?.EmployeeCode          || '';
                const deptName = c.Employee?.Department?.DepartmentName || '—';
                const attDate  = c.Attendance?.AttendanceDate      || c.AttendanceDate || c.attendanceDate;
                const reason   = c.Reason   || c.reason   || '—';
                const reqIn    = c.CorrectedCheckIn  || c.correctedCheckIn;
                const reqOut   = c.CorrectedCheckOut || c.correctedCheckOut;
                const status   = c.Status   || c.status   || 'Pending';
                const id       = c.CorrectionID || c.correctionID || c.id;

                const fmtT = (v) => {
                  if (!v) return '—';
                  try { const d = new Date(v); return isNaN(d) ? v : d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
                  catch { return v; }
                };

                return (
                  <tr key={id || i}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{empName}</div>
                      {empCode && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{empCode}</div>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{deptName}</td>
                    <td>{attDate ? new Date(attDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                    <td style={{ maxWidth: 200 }}>
                      <span className="truncate" style={{ display: 'block', fontSize: '0.82rem' }}>{reason}</span>
                    </td>
                    <td style={{ color: 'var(--green)', fontWeight: 500 }}>{fmtT(reqIn)}</td>
                    <td style={{ color: 'var(--red)',   fontWeight: 500 }}>{fmtT(reqOut)}</td>
                    <td><Badge status={status}>{status}</Badge></td>
                    <td>
                      {status === 'Pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* FIX: payload now matches service expectation { Status, ReviewNote } */}
                          <button className="btn btn-success btn-sm" onClick={async () => {
                            try {
                              await attendanceAPI.reviewCorrection(id, { Status: 'Approved', ReviewNote: '' });
                              toast.success('Correction approved');
                              loadAll();
                            } catch { toast.error('Failed'); }
                          }}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={async () => {
                            try {
                              await attendanceAPI.reviewCorrection(id, { Status: 'Rejected', ReviewNote: '' });
                              toast.success('Correction rejected');
                              loadAll();
                            } catch { toast.error('Failed'); }
                          }}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Correction Modal */}
      <CorrectionModal
  open={!!corrModal}
  onClose={() => setCorrModal(null)}
  attendance={corrModal}
  onSubmit={handleCorrection}
  loading={corrLoading}
/>
    </>
  );
}