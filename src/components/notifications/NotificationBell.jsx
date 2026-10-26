import React from 'react';

/**
 * Accessible Notification Bell Header Control
 *
 * Provides persistent visibility of unread notification count with accessible
 * badge, aria-expanded semantics, and keyboard accessibility.
 */
export default function NotificationBell({
  unreadCount = 0,
  isOpen = false,
  onToggle,
}) {
  const hasUnread = unreadCount > 0;
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <button
      type="button"
      id="header-notification-bell-btn"
      onClick={onToggle}
      aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications, no unread'}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      title={hasUnread ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
      style={{
        ...styles.bellBtn,
        ...(isOpen ? styles.bellBtnActive : {}),
      }}
    >
      {/* Accessible SVG Bell Icon */}
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={styles.bellIcon}
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      {/* Unread Badge Pill */}
      {hasUnread && (
        <span
          id="header-notification-badge"
          style={styles.badge}
          aria-hidden="true"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
}

const styles = {
  bellBtn: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '1.5px solid rgba(37, 36, 42, 0.12)',
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    cursor: 'pointer',
    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
    boxShadow: '0 1px 3px rgba(37, 36, 42, 0.06)',
    padding: 0,
    outline: 'none',
  },
  bellBtnActive: {
    backgroundColor: '#F3EEFF',
    borderColor: '#7C3AED',
    color: '#7C3AED',
    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.18)',
  },
  bellIcon: {
    display: 'block',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    borderRadius: '9px',
    backgroundColor: '#D9383A',
    color: '#FFFFFF',
    fontSize: '10.5px',
    fontWeight: '800',
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 4px rgba(217, 56, 58, 0.35)',
    border: '1.5px solid #FFFFFF',
    pointerEvents: 'none',
  },
};
