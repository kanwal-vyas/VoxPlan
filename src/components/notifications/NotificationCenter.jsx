import React, { useState, useEffect, useRef } from 'react';
import { notificationStore } from '../../notifications/notificationStore.js';
import { NOTIFICATION_CATEGORIES } from '../../notifications/types.js';

/**
 * Computes a human-friendly relative time string from an ISO timestamp.
 * @param {string} isoString
 * @returns {string}
 */
function getRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1m ago';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 7200) return '1h ago';
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationCenter({
  isOpen,
  onClose,
  onOpenSettings,
  onAction,
}) {
  const [notifications, setNotifications] = useState(() => notificationStore.notifications);
  const [unreadCount, setUnreadCount] = useState(() => notificationStore.getUnreadCount());
  const [activeFilter, setActiveFilter] = useState('all');
  const panelRef = useRef(null);

  useEffect(() => {
    return notificationStore.subscribe((list, unread) => {
      setNotifications([...list]);
      setUnreadCount(unread);
    });
  }, []);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on outside pointer click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        !e.target.closest('#header-notification-bell-btn')
      ) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (n.dismissed) return false;
    if (activeFilter === 'unread') return !n.read;
    if (activeFilter === 'deadline') return n.category === NOTIFICATION_CATEGORIES.DEADLINE || n.category === NOTIFICATION_CATEGORIES.OVERDUE;
    if (activeFilter === 'schedule') return n.category === NOTIFICATION_CATEGORIES.SCHEDULE;
    if (activeFilter === 'dependency') return n.category === NOTIFICATION_CATEGORIES.DEPENDENCY;
    return true;
  });

  const handleMarkAllRead = () => {
    notificationStore.markAllAsRead();
  };

  const handleClearAll = () => {
    notificationStore.clearAll();
  };

  const handleItemAction = (item) => {
    notificationStore.markAsRead(item.id);
    if (onAction) {
      onAction(item);
    }
    onClose();
  };

  const getCategoryBadgeStyle = (category) => {
    switch (category) {
      case NOTIFICATION_CATEGORIES.OVERDUE:
        return { bg: '#FFE8E5', border: '#FFB5A7', text: '#991B1B', label: 'Overdue' };
      case NOTIFICATION_CATEGORIES.DEADLINE:
        return { bg: '#FFF9DB', border: '#FFE0B2', text: '#B45309', label: 'Deadline' };
      case NOTIFICATION_CATEGORIES.SCHEDULE:
        return { bg: '#F3EEFF', border: '#C9B6FF', text: '#5B44BA', label: 'Schedule' };
      case NOTIFICATION_CATEGORIES.DEPENDENCY:
        return { bg: '#EBF8F1', border: '#BFE8D0', text: '#166534', label: 'Dependency' };
      case NOTIFICATION_CATEGORIES.SYSTEM:
      default:
        return { bg: '#FFF8EF', border: '#EAD9C3', text: '#6B5E4F', label: 'System' };
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Notification Center"
      id="notification-center-drawer"
      style={styles.panel}
    >
      {/* Top Header */}
      <div style={styles.header}>
        <div style={styles.headerTitleWrap}>
          <h2 style={styles.headerTitle}>Notifications</h2>
          {unreadCount > 0 && (
            <span style={styles.unreadPill} aria-label={`${unreadCount} unread`}>
              {unreadCount} unread
            </span>
          )}
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            id="notif-settings-btn"
            onClick={onOpenSettings}
            style={styles.iconBtn}
            title="Notification Settings"
            aria-label="Open notification preferences"
          >
            ⚙️
          </button>
          <button
            type="button"
            id="notif-drawer-close-btn"
            onClick={onClose}
            style={styles.iconBtn}
            title="Close notifications"
            aria-label="Close notification drawer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter Tabs & Bulk Actions */}
      <div style={styles.controlsRow}>
        <div style={styles.filterTabs} role="tablist" aria-label="Notification filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
            style={{
              ...styles.filterTab,
              ...(activeFilter === 'all' ? styles.filterTabActive : {}),
            }}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'unread'}
            onClick={() => setActiveFilter('unread')}
            style={{
              ...styles.filterTab,
              ...(activeFilter === 'unread' ? styles.filterTabActive : {}),
            }}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'deadline'}
            onClick={() => setActiveFilter('deadline')}
            style={{
              ...styles.filterTab,
              ...(activeFilter === 'deadline' ? styles.filterTabActive : {}),
            }}
          >
            Deadlines
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'schedule'}
            onClick={() => setActiveFilter('schedule')}
            style={{
              ...styles.filterTab,
              ...(activeFilter === 'schedule' ? styles.filterTabActive : {}),
            }}
          >
            Schedule
          </button>
        </div>

        <div style={styles.bulkActions}>
          {unreadCount > 0 && (
            <button
              type="button"
              id="notif-mark-all-read-btn"
              onClick={handleMarkAllRead}
              style={styles.bulkActionBtn}
              title="Mark all notifications as read"
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              id="notif-clear-all-btn"
              onClick={handleClearAll}
              style={styles.bulkActionBtn}
              title="Clear all notifications"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Notification List */}
      <div style={styles.listContainer}>
        {filteredNotifications.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon} aria-hidden="true">✦</span>
            <strong style={styles.emptyTitle}>All caught up!</strong>
            <p style={styles.emptyText}>
              {activeFilter === 'unread'
                ? 'No unread notifications right now.'
                : 'No notifications in this view.'}
            </p>
          </div>
        ) : (
          <div style={styles.list}>
            {filteredNotifications.map((item) => {
              const badge = getCategoryBadgeStyle(item.category);
              const isUnread = !item.read;

              return (
                <article
                  key={item.id}
                  id={`notif-card-${item.id}`}
                  style={{
                    ...styles.card,
                    ...(isUnread ? styles.cardUnread : styles.cardRead),
                  }}
                >
                  <div style={styles.cardHeader}>
                    <div style={styles.badgeGroup}>
                      {isUnread && <span style={styles.unreadDot} aria-hidden="true" />}
                      <span
                        style={{
                          ...styles.categoryBadge,
                          backgroundColor: badge.bg,
                          borderColor: badge.border,
                          color: badge.text,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <span style={styles.timestamp}>{getRelativeTime(item.timestamp)}</span>
                  </div>

                  <h3
                    style={{
                      ...styles.cardTitle,
                      fontWeight: isUnread ? '700' : '600',
                    }}
                  >
                    {item.title}
                  </h3>

                  <p style={styles.cardMessage}>{item.message}</p>

                  <div style={styles.cardFooter}>
                    {item.target && (item.target.id || item.target.view || item.target.action) && (
                      <button
                        type="button"
                        onClick={() => handleItemAction(item)}
                        style={styles.actionBtn}
                        aria-label={`Open ${item.title}`}
                      >
                        <span>Open Details →</span>
                      </button>
                    )}

                    <div style={styles.cardItemActions}>
                      <button
                        type="button"
                        onClick={() => notificationStore.toggleRead(item.id)}
                        style={styles.itemActionTextBtn}
                        title={isUnread ? 'Mark as read' : 'Mark as unread'}
                      >
                        {isUnread ? 'Mark read' : 'Mark unread'}
                      </button>
                      <button
                        type="button"
                        onClick={() => notificationStore.dismissNotification(item.id)}
                        style={styles.dismissBtn}
                        title="Dismiss notification"
                        aria-label={`Dismiss ${item.title}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Local Privacy Promise */}
      <div style={styles.footerNote}>
        <span>🔒 Evaluated and stored 100% locally in your browser.</span>
      </div>
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: '420px',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '620px',
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    border: '1.5px solid rgba(37, 36, 42, 0.12)',
    boxShadow: '0 18px 48px rgba(37, 36, 42, 0.18)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9995,
    overflow: 'hidden',
    animation: 'drawerSlide 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    backgroundColor: '#FAFAF8',
  },
  headerTitleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', serif)",
    fontSize: '18px',
    fontWeight: '700',
    color: '#25242A',
    margin: 0,
  },
  unreadPill: {
    backgroundColor: '#D9383A',
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: '800',
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    padding: '2px 8px',
    borderRadius: '10px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#7A7782',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    outline: 'none',
  },
  controlsRow: {
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(37, 36, 42, 0.06)',
    backgroundColor: '#FFFFFF',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  filterTab: {
    background: 'none',
    border: 'none',
    padding: '4px 10px',
    borderRadius: '14px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#7A7782',
    cursor: 'pointer',
    outline: 'none',
  },
  filterTabActive: {
    backgroundColor: '#F3EEFF',
    color: '#7C3AED',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  bulkActionBtn: {
    background: 'none',
    border: 'none',
    fontSize: '11.5px',
    color: '#7A7782',
    cursor: 'pointer',
    padding: '2px 6px',
    textDecoration: 'underline',
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    minHeight: '200px',
    maxHeight: '440px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  card: {
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    transition: 'all 0.15s ease',
  },
  cardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(124, 58, 237, 0.25)',
    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.06)',
  },
  cardRead: {
    backgroundColor: '#FAFAF8',
    opacity: 0.88,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  unreadDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#7C3AED',
  },
  categoryBadge: {
    fontSize: '10.5px',
    fontWeight: '700',
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid',
  },
  timestamp: {
    fontSize: '11px',
    color: '#7A7782',
  },
  cardTitle: {
    fontSize: '13.5px',
    color: '#25242A',
    margin: 0,
    lineHeight: 1.3,
  },
  cardMessage: {
    fontSize: '12.5px',
    color: '#4A4852',
    margin: 0,
    lineHeight: 1.45,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px',
    paddingTop: '6px',
    borderTop: '1px solid rgba(37, 36, 42, 0.05)',
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    color: '#7C3AED',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: 0,
  },
  cardItemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
  },
  itemActionTextBtn: {
    background: 'none',
    border: 'none',
    color: '#7A7782',
    fontSize: '11px',
    cursor: 'pointer',
    padding: 0,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: '#A09DA8',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px 4px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '28px',
    color: '#C9B6FF',
    marginBottom: '10px',
  },
  emptyTitle: {
    fontSize: '15px',
    color: '#25242A',
    marginBottom: '4px',
  },
  emptyText: {
    fontSize: '13px',
    color: '#7A7782',
    margin: 0,
  },
  footerNote: {
    padding: '10px 16px',
    backgroundColor: '#FAFAF8',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
    fontSize: '11px',
    color: '#7A7782',
    textAlign: 'center',
  },
};
