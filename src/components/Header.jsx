import React, { useState, useEffect } from 'react';

export default function Header({
  isBackendOnline,
  modelMetadata,
  onScrollToSection,
  onSeedDemo,
  onClearDemo,
  onNavigate,
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isTrained = modelMetadata && modelMetadata.is_trained;

  return (
    <header
      style={{
        ...styles.header,
        ...(scrolled ? styles.headerScrolled : {}),
      }}
    >
      <div style={styles.headerInner}>
        {/* Brand Wordmark & Sticker */}
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
          <span style={styles.taglineNote}>smart notebook</span>
        </button>

        {/* Floating Nav Capsule */}
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
          <button
            type="button"
            onClick={() => onScrollToSection('pulse')}
            style={styles.navLink}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('landscape')}
            style={styles.navLink}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('intelligence')}
            style={styles.navLink}
          >
            Baseline
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('behavior')}
            style={styles.navLink}
          >
            Habits
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('personal-model')}
            style={styles.navLink}
          >
            Personal Model
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('command')}
            style={styles.navLink}
          >
            Command
          </button>
        </nav>

        {/* Playful Human Status Capsule */}
        <div style={styles.statusPill}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: isBackendOnline ? '#3EA370' : '#FF8F82',
            }}
          />
          <span style={styles.statusText}>
            {isBackendOnline
              ? (isTrained ? 'Brain is awake' : 'VoxPlan is ready')
              : 'VoxPlan is resting'}
          </span>
        </div>

        {/* Development & Demo Seeding Quick Action */}
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
                <span>⚡</span>
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
    </header>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: '16px',
    zIndex: 100,
    width: '100%',
    padding: '0 12px',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  headerScrolled: {
    top: '10px',
  },
  headerInner: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: 'rgba(255, 248, 239, 0.88)',
    backdropFilter: 'blur(16px)',
    borderRadius: '9999px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 8px 24px rgba(37, 36, 42, 0.04)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    textAlign: 'left',
  },
  brandBadge: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: '#FFE58A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
  },
  brandName: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    color: '#25242A',
  },
  taglineNote: {
    fontFamily: "'Caveat', cursive",
    fontSize: '17px',
    color: '#7A7782',
    fontWeight: '600',
    marginLeft: '2px',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    padding: '4px 6px',
    borderRadius: '9999px',
    border: '1px solid rgba(37, 36, 42, 0.05)',
  },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: '#4A4852',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: '9999px',
    transition: 'all 0.15s ease',
  },
  navLandingLink: {
    background: 'rgba(201, 182, 255, 0.22)',
    border: '1px solid rgba(201, 182, 255, 0.5)',
    color: '#5B35C2',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '5px 12px',
    borderRadius: '9999px',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '9999px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    border: '1px solid rgba(37, 36, 42, 0.06)',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    animation: 'pulseDot 2s infinite ease-in-out',
  },
  statusText: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#4A4852',
  },
  demoControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '4px',
  },
  demoSeedBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'inherit',
    color: '#684200',
    backgroundColor: '#FFE58A',
    border: '1px solid rgba(104, 66, 0, 0.2)',
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  demoClearBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: 'inherit',
    color: '#625F69',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
