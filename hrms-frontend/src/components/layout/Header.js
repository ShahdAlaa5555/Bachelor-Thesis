import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationAPI } from '../../api/services';
import toast from 'react-hot-toast';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  // ── FETCH NOTIFICATIONS ──
  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationAPI.list();
      setNotifications(res.data?.notifications || res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      // Initial load
      loadNotifications();

      // ── POLL EVERY 30 SECONDS ──
      const interval = setInterval(() => {
        loadNotifications();
      }, 30000); 

      return () => clearInterval(interval);
    }
  }, [user, loadNotifications]);

  // Handle clicks outside to close dropdowns
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.IsRead).length;

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      loadNotifications();
    } catch (err) { 
      toast.error("Action failed"); 
    }
  };

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.name || 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  return (
    <header className="header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 20px', height: '64px', borderBottom: '1px solid #eee', background: '#fff' }}>
      
      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        
        {/* ── NOTIFICATION POPUP ── */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button 
            className="icon-btn" 
            onClick={() => setNotifOpen(!notifOpen)}
            style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }}
          >
            <Bell size={20} color="#4b5563" />
            {unreadCount > 0 && (
              <span className="notif-dot" style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%' }} />
            )}
          </button>

          {notifOpen && (
            <div className="notif-popup" style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 320,
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', zIndex: 1000,
              maxHeight: 450, overflowY: 'auto'
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                    Mark all read
                  </button>
                )}
              </div>
              
              <div style={{ padding: '8px 0' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>No notifications yet</div>
                ) : (
               notifications.map(n => {
  let message = n.Body;
  let actionUrl = null;

  if (n.Body) {
    try {
      const parsed = JSON.parse(n.Body);
      if (parsed && typeof parsed === 'object' && parsed.message) {
        message = parsed.message;
        actionUrl = parsed.actionUrl || null;
      }
    } catch {
      // plain text body, leave as-is
    }
  }

  return (
   <div
  key={n.NotificationID}
onClick={() => {
  let message = n.Body;
  let actionUrl = null;

  if (n.Body) {
    try {
      const parsed = JSON.parse(n.Body);
      if (parsed && typeof parsed === 'object' && parsed.message) {
        message = parsed.message;
        actionUrl = parsed.actionUrl || null;
      }
    } catch {}
  }

  alert('actionUrl: ' + actionUrl);

  if (actionUrl) {
    navigate(actionUrl);
  }
  setNotifOpen(false);
}}
  style={{
    padding: '12px 16px', borderBottom: '1px solid #f9fafb',
    background: n.IsRead ? 'transparent' : '#eff6ff',
    cursor: 'pointer'
  }}
>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4, color: '#1f2937' }}>{n.Title}</div>
      <div style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.4 }}>{message}</div>
      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 8 }}>{new Date(n.CreatedAt || Date.now()).toLocaleString()}</div>
      {actionUrl && (
        <div style={{ fontSize: '0.7rem', color: '#3b82f6', marginTop: 4, fontWeight: 500 }}>
          Click to view →
        </div>
      )}
    </div>
  );
})
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── USER MENU DROPDOWN ── */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button 
            className="avatar-btn" 
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }}
          >
            <div className="avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1rem' }}>
              {initial}
            </div>
            <div className="avatar-info" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span className="avatar-name" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{displayName}</span>
              <span className="avatar-role" style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user?.role || 'Employee'}</span>
            </div>
            <ChevronDown size={16} style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {menuOpen && (
            <div className="user-dropdown" style={{ 
              position: 'absolute', 
              top: 'calc(100% + 12px)', 
              right: 0, 
              width: 220, 
              background: '#fff', 
              border: '1px solid #e5e7eb', 
              borderRadius: '10px', 
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)', 
              padding: '8px 0', 
              zIndex: 1000 
            }}>
              {/* Dropdown Header */}
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email || 'Logged in'}
                </div>
              </div>

              {/* Dropdown Items */}
              <button 
                className="dropdown-item" 
                onClick={() => { navigate('/profile'); setMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', textAlign: 'left' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <UserIcon size={16} color="#6b7280" />
                My Profile
              </button>
              
              <button 
                className="dropdown-item danger" 
                onClick={() => { logout(); navigate('/login'); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', color: '#ef4444', textAlign: 'left' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <LogOut size={16} color="#ef4444" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}