import React, { useState, useEffect } from 'react';
import BrandBadge from './BrandBadge';
import NotificationBell from './notifications/NotificationBell';
import NotificationCenter from './notifications/NotificationCenter';
import NotificationPreferencesModal from './notifications/NotificationPreferencesModal';
import { notificationStore } from '../notifications/notificationStore';

export default function Header({
  isBackendOnline,
  modelMetadata,
  currentView = 'today',
  onSelectView,
  onScrollToSection,
  onSeedDemo,
  onClearDemo,
  onNavigate,
  onOpenBackup,
  onNotificationAction,
  onStartTour,
}) {
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(() => notificationStore.getUnreadCount());
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);

  useEffect(() => {
    return notificationStore.subscribe((_list, unread) => {
      setUnreadNotificationsCount(unread);
    });
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('#header-overflow-menu') && !e.target.closest('#header-actions-menu-btn')) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isMenuOpen]);

  const isTrained = modelMetadata && modelMetadata.is_trained;

  return (
    <header
      style={{
        ...styles.header,
        ...(scrolled ? styles.headerScrolled : {}),
      }}
    >
      <div style={styles.headerInner} className="app-header-inner">
        {/* Top / Main Bar */}
        <div
          style={isMobile ? { ...styles.topRow, flexWrap: 'wrap', rowGap: '6px' } : styles.topRow}
          className="app-header-top-row"
        >
        {/* Brand Wordmark & Dot */}
        <button
          type="button"
          style={styles.brand}
          className="app-header-brand"
          onClick={() => {
            if (onNavigate) {
              onNavigate('/');
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          aria-label={onNavigate ? 'Back to VoxPlan product landing page' : 'VoxPlan home, scroll to top'}
          title={onNavigate ? 'Back to Product Landing Page' : 'Scroll to top'}
        >
          <BrandBadge size={isMobile ? 18 : 28} />
          <span style={{ ...styles.brandName, fontSize: isMobile ? '13px' : '18px' }}>VOXPLAN</span>
        </button>

          {/* Center Navigation (Desktop inline flex, Mobile 4-column full-width grid) */}
          <nav
            style={isMobile ? styles.navMobile : styles.nav}
            className="app-header-nav"
            aria-label="Sections"
          >
            {onNavigate && !isMobile && (
              <button
                type="button"
                id="header-nav-landing-btn"
                onClick={() => onNavigate('/')}
                style={styles.navLandingLink}
                title="Return to Product Landing Page"
              >
                ← Overview
              </button>
            )}

            {onSelectView ? (
              <>
                <button
                  type="button"
                  id="nav-tab-today"
                  onClick={() => onSelectView('today')}
                  aria-current={currentView === 'today' ? 'page' : undefined}
                  style={{
                    ...(currentView === 'today' ? styles.activeNavLink : styles.navLink),
                    ...(isMobile ? (currentView === 'today' ? styles.activeNavLinkMobile : styles.navLinkMobile) : {}),
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  id="nav-tab-tasks"
                  onClick={() => onSelectView('tasks')}
                  aria-current={currentView === 'tasks' ? 'page' : undefined}
                  style={{
                    ...(currentView === 'tasks' ? styles.activeNavLink : styles.navLink),
                    ...(isMobile ? (currentView === 'tasks' ? styles.activeNavLinkMobile : styles.navLinkMobile) : {}),
                  }}
                >
                  Tasks
                </button>
                <button
                  type="button"
                  id="nav-tab-calendar"
                  onClick={() => onSelectView('calendar')}
                  aria-current={currentView === 'calendar' ? 'page' : undefined}
                  style={{
                    ...(currentView === 'calendar' ? styles.activeNavLink : styles.navLink),
                    ...(isMobile ? (currentView === 'calendar' ? styles.activeNavLinkMobile : styles.navLinkMobile) : {}),
                  }}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  id="nav-tab-insights"
                  onClick={() => onSelectView('insights')}
                  aria-current={currentView === 'insights' ? 'page' : undefined}
                  style={{
                    ...(currentView === 'insights' ? styles.activeNavLink : styles.navLink),
                    ...(isMobile ? (currentView === 'insights' ? styles.activeNavLinkMobile : styles.navLinkMobile) : {}),
                  }}
                >
                  Insights
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onScrollToSection && onScrollToSection('pulse')}
                  style={isMobile ? styles.navLinkMobile : styles.navLink}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection && onScrollToSection('landscape')}
                  style={isMobile ? styles.navLinkMobile : styles.navLink}
                >
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection && onScrollToSection('intelligence')}
                  style={isMobile ? styles.navLinkMobile : styles.navLink}
                >
                  {isMobile ? 'Insights' : 'Baseline'}
                </button>
              </>
            )}
          </nav>

          {/* Right Controls: Status & Actions */}
          <div style={styles.rightGroup} className="app-header-right-group">
            {/* Desktop Status Indicator (Moved to Overflow Menu on Mobile) */}
            {!isMobile && (
              <div
                style={styles.statusPill}
                title={isBackendOnline ? (isTrained ? 'Model trained & ready' : 'Local planner active') : 'Offline'}
                aria-label={isBackendOnline ? (isTrained ? 'Brain active' : 'Ready') : 'Offline'}
              >
                <span
                  style={{
                    ...styles.statusDot,
                    backgroundColor: isBackendOnline ? '#2D6A4F' : '#D9383A',
                  }}
                />
                <span style={styles.statusText}>
                  {isBackendOnline
                    ? (isTrained ? 'Brain active' : 'Ready')
                    : 'Offline'}
                </span>
              </div>
            )}

            {/* Notification Bell & Center Dropdown */}
            <div style={{ position: 'relative' }}>
              <NotificationBell
                unreadCount={unreadNotificationsCount}
                isOpen={isNotificationsOpen}
                onToggle={() => setIsNotificationsOpen((prev) => !prev)}
              />
              <NotificationCenter
                isOpen={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
                onOpenSettings={() => {
                  setIsNotificationsOpen(false);
                  setIsNotificationSettingsOpen(true);
                }}
                onAction={(notif) => {
                  if (onNotificationAction) {
                    onNotificationAction(notif);
                  }
                }}
              />
            </div>

            {/* Desktop Actions */}
            {!isMobile && (
              <div style={styles.actionControls}>
                {onStartTour && (
                  <button
                    type="button"
                    id="header-tour-btn"
                    onClick={onStartTour}
                    title="Launch interactive guided product tour"
                    style={styles.tourBtn}
                    aria-label="Launch interactive VoxPlan product tour"
                  >
                    <span style={{ color: '#E5A83B' }}>✦</span>
                    <span>Tour</span>
                  </button>
                )}

                {onOpenBackup && (
                  <button
                    type="button"
                    id="header-backup-btn"
                    onClick={onOpenBackup}
                    title="Open Encrypted Workspace Backup & Restore"
                    style={styles.backupBtn}
                    aria-label="Open Encrypted Workspace Backup and Restore dialog"
                  >
                    <span>🔐</span>
                    <span>Backup</span>
                  </button>
                )}

                {(onSeedDemo || onClearDemo) && (
                  <div style={styles.demoControls}>
                    {onSeedDemo && (
                      <button
                        type="button"
                        id="demo-seed-profile-btn"
                        onClick={onSeedDemo}
                        title="Load calibrated demo profile (8 completed tasks + 4 active tasks)"
                        style={styles.demoSeedBtn}
                      >
                        <span>Demo Seed</span>
                      </button>
                    )}
                    {onClearDemo && (
                      <button
                        type="button"
                        id="demo-clear-profile-btn"
                        onClick={onClearDemo}
                        title="Reset to clean default welcome state"
                        style={styles.demoClearBtn}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mobile Actions Overflow Menu Button */}
            {isMobile && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  id="header-actions-menu-btn"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  style={styles.overflowMenuBtn}
                  aria-label="Workspace options and tools menu"
                  aria-expanded={isMenuOpen}
                >
                  •••
                </button>

                {/* Mobile Dropdown Menu */}
                {isMenuOpen && (
                  <div id="header-overflow-menu" style={styles.dropdownMenu}>
                    <div style={styles.menuStatusHeader}>
                      <span
                        style={{
                          ...styles.statusDot,
                          backgroundColor: isBackendOnline ? '#2D6A4F' : '#D9383A',
                        }}
                      />
                      <span>
                        {isBackendOnline
                          ? (isTrained ? 'Brain active · Ready' : 'Local planner active')
                          : 'Offline'}
                      </span>
                    </div>
                    {onStartTour && (
                      <button
                        type="button"
                        id="header-mobile-tour-btn"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onStartTour();
                        }}
                        style={styles.menuItem}
                      >
                        <span style={{ color: '#E5A83B', marginRight: '6px' }}>✦</span>
                        <span>Product Tour</span>
                      </button>
                    )}
                    {onNavigate && (
                      <button
                        type="button"
                        id="header-nav-landing-btn"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onNavigate('/');
                        }}
                        style={styles.menuItem}
                      >
                        <span>← Return to Overview</span>
                      </button>
                    )}
                    {onOpenBackup && (
                      <button
                        type="button"
                        id="header-backup-btn"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onOpenBackup();
                        }}
                        style={styles.menuItem}
                      >
                        <span>🔐 Encrypted Backup</span>
                      </button>
                    )}
                    <button
                      type="button"
                      id="mobile-notifications-btn"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsNotificationsOpen(true);
                      }}
                      style={styles.menuItem}
                    >
                      <span>🔔 Notifications {unreadNotificationsCount > 0 ? `(${unreadNotificationsCount})` : ''}</span>
                    </button>
                    <button
                      type="button"
                      id="mobile-notification-settings-btn"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsNotificationSettingsOpen(true);
                      }}
                      style={styles.menuItem}
                    >
                      <span>⚙️ Notification Settings</span>
                    </button>
                    {onSeedDemo && (
                      <button
                        type="button"
                        id="demo-seed-profile-btn"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onSeedDemo();
                        }}
                        style={styles.menuItem}
                      >
                        <span>⚡ Load Demo Seed</span>
                      </button>
                    )}
                    {onClearDemo && (
                      <button
                        type="button"
                        id="demo-clear-profile-btn"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onClearDemo();
                        }}
                        style={{ ...styles.menuItem, color: '#D9383A' }}
                      >
                        <span>↺ Reset Workspace</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Notification Preferences Modal */}
      {isNotificationSettingsOpen && (
        <NotificationPreferencesModal
          isOpen={true}
          onClose={() => setIsNotificationSettingsOpen(false)}
        />
      )}
    </header>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: '6px',
    zIndex: 100,
    width: '100%',
    padding: '0 6px',
    transition: 'top 0.2s ease',
  },
  headerScrolled: {
    top: '4px',
  },
  headerInner: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    padding: '4px 10px',
    backgroundColor: 'rgba(252, 250, 246, 0.95)',
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
    border: '1px solid rgba(61, 38, 69, 0.10)',
    boxShadow: '0 2px 10px rgba(61, 38, 69, 0.04)',
    minHeight: '42px',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: '8px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    textAlign: 'left',
    flexShrink: 0,
  },
  brandName: {
    fontFamily: "var(--font-wordmark, 'Trade Winds', cursive)",
    fontSize: '18px',
    fontWeight: '400',
    letterSpacing: '0.04em',
    color: '#3D2645',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#F4F1EA',
    padding: '3px 4px',
    borderRadius: '10px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
    overflowX: 'auto',
    maxWidth: '100%',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    flexShrink: 1,
  },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: '#5E5B66',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  activeNavLink: {
    backgroundColor: '#201E23',
    color: '#FFFFFF',
    fontWeight: '700',
    boxShadow: '0 2px 6px rgba(32, 30, 35, 0.15)',
  },
  navLandingLink: {
    background: 'transparent',
    border: 'none',
    color: '#7C7885',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  navMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '3px',
    width: '100%',
    backgroundColor: '#F4F1EA',
    padding: '3px',
    borderRadius: '8px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
    boxSizing: 'border-box',
    order: 3,
  },
  navLinkMobile: {
    background: 'transparent',
    border: 'none',
    color: '#5E5B66',
    fontSize: '11.5px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '5px 2px',
    minHeight: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    borderRadius: '6px',
    transition: 'all 0.15s ease',
    width: '100%',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
  },
  activeNavLinkMobile: {
    backgroundColor: '#201E23',
    color: '#FFFFFF',
    fontWeight: '700',
    boxShadow: '0 1px 4px rgba(32, 30, 35, 0.15)',
  },
  menuStatusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#5E5B66',
    borderBottom: '1px solid rgba(30, 30, 34, 0.08)',
    marginBottom: '2px',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '8px',
    backgroundColor: '#FAFAF7',
    border: '1px solid rgba(30, 30, 34, 0.06)',
  },
  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    animation: 'pulseDot 2s infinite ease-in-out',
  },
  statusText: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#5E5B66',
    letterSpacing: '0.02em',
  },
  actionControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  backupBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'inherit',
    color: '#1E1E22',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(30, 30, 34, 0.14)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  demoControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  demoSeedBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'inherit',
    color: '#C85A32',
    backgroundColor: 'rgba(200, 90, 50, 0.08)',
    border: '1px solid rgba(200, 90, 50, 0.25)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  demoClearBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 9px',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'inherit',
    color: '#7C7885',
    backgroundColor: '#FAFAF7',
    border: '1px solid rgba(30, 30, 34, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  overflowMenuBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '30px',
    borderRadius: '8px',
    backgroundColor: '#FAFAF7',
    border: '1px solid rgba(30, 30, 34, 0.12)',
    color: '#1E1E22',
    fontSize: '13px',
    fontWeight: '800',
    letterSpacing: '1px',
    cursor: 'pointer',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '36px',
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(30, 30, 34, 0.1)',
    boxShadow: '0 8px 24px rgba(30, 30, 34, 0.12)',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 200,
    minWidth: '170px',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#1E1E22',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.15s ease',
  },
  tourBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(61, 38, 69, 0.16)',
    borderRadius: '9999px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#C85A32',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
