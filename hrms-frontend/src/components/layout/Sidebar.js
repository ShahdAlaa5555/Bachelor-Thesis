// src/components/layout/Sidebar.js
import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Clock, CreditCard, CalendarDays,
  Settings, LogOut, ChevronLeft, ChevronRight, Building2,
  UserCircle, Timer, Inbox, BarChart2, CalendarRange,
  ChevronDown, ChevronUp, Layers, Briefcase
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [openGroup, setOpenGroup] = useState('null');

  // --- UPDATED ROLE CHECKING ---
  const userRole = user?.role || user?.Role;
  
  // 1. Strict HR / Admin check
  const isHRorAdmin = ['HR', 'Admin'].includes(userRole);
  
  // 2. Broad Leadership check (includes HR, Admins, and all University Managers)
  const isManager = ['HR', 'Admin'].includes(userRole);

  const handleLogout = () => { logout(); navigate('/login'); };

  const displayName = user
    ? (user.FirstName || user.firstName
        ? `${user.FirstName || user.firstName} ${user.LastName || user.lastName || ''}`.trim()
        : user.name || 'User')
    : 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  const attendanceItems = [
    { to: '/attendance',             icon: Timer,        label: 'Today / Clock In',   end: true  },
    { to: '/attendance/calendar',    icon: CalendarRange,label: 'Calendar'                        },
    { to: '/attendance/shifts',      icon: Layers,       label: isManager ? 'Shifts & Schedule' : 'My Shift' },
    { to: '/attendance/inbox',       icon: Inbox,        label: isManager ? 'Manager Inbox' : 'My Requests'  },
    ...(isManager ? [
      { to: '/attendance/reports',   icon: BarChart2,    label: 'Reports & Analytics'             },
    ] : []),
    { to: '/attendance/holidays',    icon: CalendarDays, label: 'Holidays'                        },
  ];

  const isAttendanceActive = location.pathname.startsWith('/attendance');

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon"><Building2 size={20} /></div>
        {!collapsed && (
          <div className="sidebar-logo-text">University<br /><span>HR System</span></div>
        )}
      </div>

      <nav className="sidebar-nav">
        {/* Main */}
        <div>
          <div className="nav-section-label">Main</div>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'Dashboard' : undefined}>
            <LayoutDashboard size={18} className="nav-icon" />
            {!collapsed && <span className="nav-label">Dashboard</span>}
          </NavLink>
        </div>

        {/* Modules */}
        <div>
          <div className="nav-section-label">Modules</div>

          {/* ── HR & ADMIN VIEW ── */}
          {isHRorAdmin && (
            <NavLink to="/employees" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'Employee Directory' : undefined}>
              <Briefcase size={18} className="nav-icon" />
              {!collapsed && <span className="nav-label">Employee Directory</span>}
            </NavLink>
          )}

          {/* ── PROFESSOR / SUPERVISOR VIEW (Non-HR Leaders) ── */}
          {isManager && !isHRorAdmin && (
            <NavLink to="/employees" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'My Team & Approvals' : undefined}>
              <Users size={18} className="nav-icon" />
              {!collapsed && <span className="nav-label">My Team & Approvals</span>}
            </NavLink>
          )}

          {/* Attendance group */}
          <button
            className={`nav-item ${isAttendanceActive ? 'active' : ''}`}
            onClick={() => !collapsed && setOpenGroup(g => g === 'attendance' ? null : 'attendance')}
            title={collapsed ? 'Attendance' : undefined}
            style={{ width: '100%', background: 'none', border: isAttendanceActive ? undefined : 'none', cursor: 'pointer' }}
          >
            <Clock size={18} className="nav-icon" />
            {!collapsed && (
              <>
                <span className="nav-label">Attendance</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', lineHeight: 0 }}>
                  {openGroup === 'attendance' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </>
            )}
          </button>

          {!collapsed && openGroup === 'attendance' && (
            <div style={{ marginLeft: 14, borderLeft: '2px solid var(--border)', paddingLeft: 6, marginTop: 2, marginBottom: 2 }}>
              {attendanceItems.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                >
                  <Icon size={15} className="nav-icon" />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          )}

          <NavLink to="/leave"   className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'Leave' : undefined}>
            <CalendarDays size={18} className="nav-icon" />
            {!collapsed && <span className="nav-label">Leave</span>}
          </NavLink>
          <NavLink to="/payroll" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'Payroll' : undefined}>
            <CreditCard size={18} className="nav-icon" />
            {!collapsed && <span className="nav-label">Payroll</span>}
          </NavLink>
        </div>

        {/* Account */}
        <div>
          <div className="nav-section-label">Account</div>
          <NavLink to="/profile"  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'My Profile' : undefined}>
            <UserCircle size={18} className="nav-icon" />
            {!collapsed && <span className="nav-label">My Profile</span>}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? 'Settings' : undefined}>
            <Settings size={18} className="nav-icon" />
            {!collapsed && <span className="nav-label">Settings</span>}
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && user && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', marginBottom: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
            <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>{initial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{user.role || user.Role || 'Employee'}</div>
            </div>
          </div>
        )}
        <button className="nav-item" onClick={handleLogout} style={{ width: '100%', background: 'none', border: 'none' }}>
          <LogOut size={18} className="nav-icon" style={{ color: 'var(--red)' }} />
          {!collapsed && <span className="nav-label" style={{ color: 'var(--red)' }}>Logout</span>}
        </button>
        <button className="nav-item" onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', marginTop: 4 }} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={18} className="nav-icon" /> : <><ChevronLeft size={18} className="nav-icon" /><span className="nav-label">Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}