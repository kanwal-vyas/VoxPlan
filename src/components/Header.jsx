import React, { useState, useEffect } from 'react';

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
}) {
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
      <div style={styles.headerInner}>
        {/* Top / Main Bar */}
        <div style={styles.topRow}>
        {/* Brand Wordmark & Dot */}
        <button
          type="button"
          style={styles.brand}
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
          <div style={styles.brandBadge}>
            <span>✦</span>
          </div>
          <span style={styles.brandName}>VOXPLAN</span>
        </button>

          {/* Center Navigation on Desktop */}
          {!isMobile && (
            <nav style={styles.nav} aria-label="Sections">
              {onNavigate && (
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
                      ...styles.navLink,
                      ...(currentView === 'today' ? styles.activeNavLink : {}),
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
                      ...styles.navLink,
                      ...(currentView === 'tasks' ? styles.activeNavLink : {}),
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
                      ...styles.navLink,
                      ...(currentView === 'calendar' ? styles.activeNavLink : {}),
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
                      ...styles.navLink,
                      ...(currentView === 'insights' ? styles.activeNavLink : {}),
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
                    style={styles.navLink}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => onScrollToSection && onScrollToSection('landscape')}
                    style={styles.navLink}
                  >
                    Tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => onScrollToSection && onScrollToSection('intelligence')}
                    style={styles.navLink}
                  >
                    Baseline
                  </button>
                </>
              )}
            </nav>
          )}

          {/* Right Controls: Status & Actions */}
          <div style={styles.rightGroup}>
            {/* Concise Status Indicator */}
            <div style={styles.statusPill} title={isBackendOnline ? (isTrained ? 'Model trained & ready' : 'Local planner active') : 'Offline'}>
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

            {/* Desktop Actions */}
            {!isMobile && (
              <div style={styles.actionControls}>
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

        {/* Mobile Navigation Tabs: Compact 2nd row */}
        {isMobile && (
          <nav style={styles.navMobile} aria-label="Sections">
            {onSelectView ? (
              <>
                <button
                  type="button"
                  id="nav-tab-today"
                  onClick={() => onSelectView('today')}
                  aria-current={currentView === 'today' ? 'page' : undefined}
                  style={{
                    ...styles.navLinkMobile,
                    ...(currentView === 'today' ? styles.activeNavLinkMobile : {}),
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
                    ...styles.navLinkMobile,
                    ...(currentView === 'tasks' ? styles.activeNavLinkMobile : {}),
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
                    ...styles.navLinkMobile,
                    ...(currentView === 'calendar' ? styles.activeNavLinkMobile : {}),
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
                    ...styles.navLinkMobile,
                    ...(currentView === 'insights' ? styles.activeNavLinkMobile : {}),
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
                  style={styles.navLinkMobile}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection && onScrollToSection('landscape')}
                  style={styles.navLinkMobile}
                >
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection && onScrollToSection('intelligence')}
                  style={styles.navLinkMobile}
                >
                  Insights
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: '10px',
    zIndex: 100,
    width: '100%',
    padding: '0 8px',
    transition: 'top 0.2s ease',
  },
  headerScrolled: {
    top: '6px',
  },
  headerInner: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: 'rgba(252, 250, 246, 0.95)',
    backdropFilter: 'blur(12px)',
    borderRadius: '16px',
    border: '1px solid rgba(61, 38, 69, 0.10)',
    boxShadow: '0 2px 10px rgba(61, 38, 69, 0.04)',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: '10px',
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
  brandBadge: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    boxShadow: '0 2px 4px rgba(200, 90, 50, 0.25)',
  },
  brandName: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '17px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
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
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
    width: '100%',
    backgroundColor: '#F4F1EA',
    padding: '3px',
    borderRadius: '10px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
    overflowX: 'auto',
    maxWidth: '100%',
  },
  navLinkMobile: {
    background: 'transparent',
    border: 'none',
    color: '#5E5B66',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '7px 0',
    textAlign: 'center',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  activeNavLinkMobile: {
    backgroundColor: '#201E23',
    color: '#FFFFFF',
    fontWeight: '700',
    boxShadow: '0 1px 4px rgba(32, 30, 35, 0.15)',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
};
