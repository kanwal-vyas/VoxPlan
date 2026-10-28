import React, { useState, useEffect, useRef } from 'react';
import MotifIcon from '../MotifIcon.jsx';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../notifications/notificationPreferences.js';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../../notifications/browserNotifier.js';

export default function NotificationPreferencesModal({ isOpen, onClose }) {
  const [prefs, setPrefs] = useState(() => getNotificationPreferences());
  const [browserPermission, setBrowserPermission] = useState(() => getBrowserNotificationPermission());
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const modalRef = useRef(null);

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

  if (!isOpen) return null;

  const handleToggle = (key, nestedCategory = null) => {
    if (nestedCategory) {
      const updatedCategories = {
        ...prefs.categories,
        [nestedCategory]: !prefs.categories[nestedCategory],
      };
      const updated = updateNotificationPreferences({ categories: updatedCategories });
      setPrefs(updated);
    } else {
      const updated = updateNotificationPreferences({ [key]: !prefs[key] });
      setPrefs(updated);
    }
  };

  const handleLeadTimeChange = (e) => {
    const minutes = parseInt(e.target.value, 10);
    const updated = updateNotificationPreferences({ leadTimeMinutes: minutes });
    setPrefs(updated);
  };

  const handleQuietHoursChange = (field, value) => {
    const updatedQuietHours = {
      ...prefs.quietHours,
      [field]: value,
    };
    const updated = updateNotificationPreferences({ quietHours: updatedQuietHours });
    setPrefs(updated);
  };

  const handleRequestBrowserPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const permission = await requestBrowserNotificationPermission();
      setBrowserPermission(permission);
      if (permission === 'granted') {
        const updated = updateNotificationPreferences({ browserNotificationsEnabled: true });
        setPrefs(updated);
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const isSupported = isBrowserNotificationSupported();

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-prefs-title"
        id="notification-preferences-modal"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <span style={styles.headerIcon} aria-hidden="true">
              <MotifIcon name="settings" size={20} color="#8E5FA8" />
            </span>
            <h2 id="notif-prefs-title" style={styles.title}>
              Notification Preferences
            </h2>
          </div>
          <button
            type="button"
            id="notif-prefs-close-btn"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close notification settings"
          >
            <MotifIcon name="close" size={14} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={styles.body}>
          {/* 1. Master Enable Switch */}
          <div style={styles.sectionCard}>
            <div style={styles.settingRow}>
              <div>
                <strong style={styles.settingLabel}>Master Notifications</strong>
                <p style={styles.settingDesc}>Enable or disable all VoxPlan notifications.</p>
              </div>
              <input
                type="checkbox"
                id="pref-master-toggle"
                checked={prefs.masterEnabled}
                onChange={() => handleToggle('masterEnabled')}
                style={styles.checkbox}
                aria-label="Toggle master notifications"
              />
            </div>
          </div>

          {/* 2. Browser Notifications Opt-In & Permission */}
          <div style={styles.sectionCard}>
            <strong style={styles.sectionTitle}>Browser Notifications</strong>
            <p style={styles.sectionDesc}>
              Receive desktop alerts for upcoming deadlines even when your window is in the background.
            </p>

            {!isSupported ? (
              <div style={styles.noticeWarning}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <MotifIcon name="warning" size={14} color="#B45309" />
                  <span>Web notifications are not supported in this browser.</span>
                </span>
              </div>
            ) : browserPermission === 'granted' ? (
              <div>
                <div style={styles.permissionGrantedBanner}>
                  <span style={styles.checkIcon}>
                    <MotifIcon name="check" size={12} color="#166534" />
                  </span>
                  <span>Browser notification permission is granted on this device.</span>
                </div>
                <div style={{ ...styles.settingRow, marginTop: '12px' }}>
                  <label htmlFor="pref-browser-toggle" style={styles.settingLabel}>
                    Send Browser Notifications
                  </label>
                  <input
                    type="checkbox"
                    id="pref-browser-toggle"
                    checked={prefs.browserNotificationsEnabled}
                    disabled={!prefs.masterEnabled}
                    onChange={() => handleToggle('browserNotificationsEnabled')}
                    style={styles.checkbox}
                  />
                </div>
              </div>
            ) : browserPermission === 'denied' ? (
              <div style={styles.noticeError}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MotifIcon name="warning" size={14} color="#D9383A" />
                  <strong>Notifications are blocked in your browser.</strong>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  To enable, click the padlock/tune icon next to the URL in your browser address bar and change Notifications to "Allow".
                </p>
              </div>
            ) : (
              <div style={styles.permissionRequestBox}>
                <div style={styles.privacyExplainer}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <MotifIcon name="lock" size={14} color="#25242A" />
                    <span>100% Local-First Privacy</span>
                  </strong>
                  VoxPlan evaluates all reminders entirely inside your browser. No task titles or personal schedules are ever uploaded to cloud notification servers.
                </div>
                <button
                  type="button"
                  id="request-browser-permission-btn"
                  onClick={handleRequestBrowserPermission}
                  disabled={isRequestingPermission}
                  style={styles.permissionBtn}
                >
                  {isRequestingPermission ? 'Requesting...' : 'Enable Browser Notifications'}
                </button>
              </div>
            )}
          </div>

          {/* 3. In-App Notifications Channel */}
          <div style={styles.sectionCard}>
            <strong style={styles.sectionTitle}>In-App Notification Center</strong>
            <div style={styles.settingRow}>
              <div>
                <strong style={styles.settingLabel}>In-App Notifications</strong>
                <p style={styles.settingDesc}>Show alerts and reminders in the header notification center.</p>
              </div>
              <input
                type="checkbox"
                id="pref-in-app-toggle"
                checked={prefs.inAppEnabled}
                disabled={!prefs.masterEnabled}
                onChange={() => handleToggle('inAppEnabled')}
                style={styles.checkbox}
                aria-label="Toggle in-app notifications"
              />
            </div>
          </div>

          {/* 4. Notification Categories */}
          <div style={styles.sectionCard}>
            <strong style={styles.sectionTitle}>Alert Categories</strong>
            <p style={styles.sectionDesc}>Select which types of notifications you want to receive.</p>

            <div style={styles.categoriesList}>
              <label style={styles.categoryRow}>
                <input
                  type="checkbox"
                  id="pref-cat-deadline"
                  checked={prefs.categories?.deadline !== false}
                  disabled={!prefs.masterEnabled}
                  onChange={() => handleToggle('categories', 'deadline')}
                  style={styles.checkbox}
                />
                <div style={styles.categoryInfo}>
                  <span style={styles.categoryName}>Upcoming Deadlines</span>
                  <span style={styles.categoryHelp}>Reminders for tasks approaching their due date.</span>
                </div>
              </label>

              <label style={styles.categoryRow}>
                <input
                  type="checkbox"
                  id="pref-cat-overdue"
                  checked={prefs.categories?.overdue !== false}
                  disabled={!prefs.masterEnabled}
                  onChange={() => handleToggle('categories', 'overdue')}
                  style={styles.checkbox}
                />
                <div style={styles.categoryInfo}>
                  <span style={styles.categoryName}>Overdue Tasks</span>
                  <span style={styles.categoryHelp}>Critical alerts when tasks pass their deadline.</span>
                </div>
              </label>

              <label style={styles.categoryRow}>
                <input
                  type="checkbox"
                  id="pref-cat-schedule"
                  checked={prefs.categories?.schedule !== false}
                  disabled={!prefs.masterEnabled}
                  onChange={() => handleToggle('categories', 'schedule')}
                  style={styles.checkbox}
                />
                <div style={styles.categoryInfo}>
                  <span style={styles.categoryName}>Schedule Warnings & Feasibility</span>
                  <span style={styles.categoryHelp}>Alerts when plans have capacity overloads or scheduling conflicts.</span>
                </div>
              </label>

              <label style={styles.categoryRow}>
                <input
                  type="checkbox"
                  id="pref-cat-dependency"
                  checked={prefs.categories?.dependency !== false}
                  disabled={!prefs.masterEnabled}
                  onChange={() => handleToggle('categories', 'dependency')}
                  style={styles.checkbox}
                />
                <div style={styles.categoryInfo}>
                  <span style={styles.categoryName}>Dependency Blockers & Unblocking</span>
                  <span style={styles.categoryHelp}>Notifies when tasks are unblocked and ready to start.</span>
                </div>
              </label>

              <label style={styles.categoryRow}>
                <input
                  type="checkbox"
                  id="pref-cat-system"
                  checked={prefs.categories?.system !== false}
                  disabled={!prefs.masterEnabled}
                  onChange={() => handleToggle('categories', 'system')}
                  style={styles.checkbox}
                />
                <div style={styles.categoryInfo}>
                  <span style={styles.categoryName}>System & Backup Notices</span>
                  <span style={styles.categoryHelp}>PWA update alerts and encrypted backup reminders.</span>
                </div>
              </label>
            </div>
          </div>

          {/* 5. Reminder Timing (Lead Time) */}
          <div style={styles.sectionCard}>
            <div style={styles.settingRow}>
              <div>
                <strong style={styles.settingLabel}>Reminder Lead Time</strong>
                <p style={styles.settingDesc}>How early should deadline reminders be triggered?</p>
              </div>
              <select
                id="pref-lead-time-select"
                value={prefs.leadTimeMinutes}
                onChange={handleLeadTimeChange}
                disabled={!prefs.masterEnabled}
                style={styles.select}
                aria-label="Reminder lead time"
              >
                <option value={0}>At deadline</option>
                <option value={15}>15 minutes before</option>
                <option value={60}>1 hour before (Default)</option>
                <option value={1440}>1 day before</option>
              </select>
            </div>
          </div>

          {/* 6. Quiet Hours */}
          <div style={styles.sectionCard}>
            <div style={styles.settingRow}>
              <div>
                <strong style={styles.settingLabel}>Quiet Hours</strong>
                <p style={styles.settingDesc}>Silence non-critical notifications during sleep or focus intervals.</p>
              </div>
              <input
                type="checkbox"
                id="pref-quiet-toggle"
                checked={prefs.quietHours?.enabled || false}
                disabled={!prefs.masterEnabled}
                onChange={() => handleQuietHoursChange('enabled', !prefs.quietHours?.enabled)}
                style={styles.checkbox}
                aria-label="Toggle quiet hours"
              />
            </div>

            {prefs.quietHours?.enabled && (
              <div style={styles.quietHoursInputs}>
                <label style={styles.timeLabel}>
                  <span>From:</span>
                  <input
                    type="time"
                    id="pref-quiet-start"
                    value={prefs.quietHours?.start || '22:00'}
                    onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                    style={styles.timeInput}
                  />
                </label>
                <label style={styles.timeLabel}>
                  <span>Until:</span>
                  <input
                    type="time"
                    id="pref-quiet-end"
                    value={prefs.quietHours?.end || '08:00'}
                    onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                    style={styles.timeInput}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            type="button"
            id="notif-prefs-done-btn"
            onClick={onClose}
            style={styles.doneBtn}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(37, 36, 42, 0.45)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    maxWidth: '560px',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 48px rgba(37, 36, 42, 0.2)',
    overflow: 'hidden',
    animation: 'modalEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    padding: '18px 24px',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAF8',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerIcon: {
    fontSize: '20px',
  },
  title: {
    fontFamily: "var(--font-heading, 'Eagle Lake', serif)",
    fontSize: '20px',
    fontWeight: '700',
    color: '#25242A',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#7A7782',
    padding: '4px 8px',
    borderRadius: '8px',
  },
  body: {
    padding: '20px 24px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionCard: {
    backgroundColor: '#FAFAF8',
    borderRadius: '12px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '16px',
  },
  sectionTitle: {
    display: 'block',
    fontSize: '15px',
    fontWeight: '700',
    color: '#25242A',
    marginBottom: '4px',
  },
  sectionDesc: {
    fontSize: '13px',
    color: '#7A7782',
    margin: '0 0 12px 0',
    lineHeight: 1.4,
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  settingLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#25242A',
  },
  settingDesc: {
    fontSize: '12.5px',
    color: '#7A7782',
    margin: '2px 0 0',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#7C3AED',
    cursor: 'pointer',
  },
  permissionGrantedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#EBF8F1',
    border: '1px solid #BFE8D0',
    color: '#166534',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
  },
  checkIcon: {
    color: '#166534',
    fontWeight: 'bold',
  },
  noticeWarning: {
    backgroundColor: '#FFF9DB',
    border: '1px solid #FFE0B2',
    color: '#B45309',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  noticeError: {
    backgroundColor: '#FFE8E5',
    border: '1px solid #FFB5A7',
    color: '#991B1B',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  permissionRequestBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  privacyExplainer: {
    backgroundColor: '#F3EEFF',
    border: '1px solid #C9B6FF',
    color: '#5B44BA',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '12.5px',
    lineHeight: 1.45,
  },
  permissionBtn: {
    backgroundColor: '#7C3AED',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '10px',
    fontWeight: '700',
    fontSize: '13.5px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
  },
  categoriesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
    padding: '6px 0',
  },
  categoryInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  categoryName: {
    fontSize: '13.5px',
    fontWeight: '600',
    color: '#25242A',
  },
  categoryHelp: {
    fontSize: '12px',
    color: '#7A7782',
  },
  select: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    fontSize: '13px',
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    outline: 'none',
  },
  quietHoursInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(37, 36, 42, 0.08)',
  },
  timeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#25242A',
    fontWeight: '600',
  },
  timeInput: {
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    fontSize: '13px',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: '#FAFAF8',
  },
  doneBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
