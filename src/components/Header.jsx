import React from 'react';

export default function Header({ isBackendOnline, modelMetadata, onScrollToSection }) {
  const isTrained = modelMetadata && modelMetadata.is_trained;
  const accuracyText = isTrained ? `${((modelMetadata.accuracy || 0) * 100).toFixed(1)}% acc` : null;

  return (
    <header style={styles.header}>
      {/* Brand Identity */}
      <div style={styles.brand}>
        <span style={styles.brandName}>VOXPLAN</span>
        <span style={styles.brandDivider}>/</span>
        <span style={styles.brandTagline}>Predictive Project Intelligence</span>
      </div>

      {/* Navigation & Status */}
      <div style={styles.rightGroup}>
        <nav style={styles.nav} aria-label="Page sections">
          <button
            type="button"
            onClick={() => onScrollToSection('pulse')}
            style={styles.navLink}
          >
            Pulse
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('landscape')}
            style={styles.navLink}
          >
            Risk
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('intelligence')}
            style={styles.navLink}
          >
            Model
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection('command')}
            style={styles.navLink}
          >
            Command
          </button>
        </nav>

        {/* Minimal Understated Backend Status */}
        <div style={styles.statusIndicator} title={isBackendOnline ? 'ML service operational' : 'FastAPI service offline'}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: isBackendOnline ? '#3ea370' : '#e5484d',
            }}
          />
          <span style={styles.statusText}>
            {isBackendOnline
              ? (isTrained ? `Model ready · ${accuracyText}` : 'Model service ready')
              : 'Server offline'}
          </span>
        </div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '32px 0 24px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
    gap: '20px',
  },
  brand: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  brandName: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#f6f5f2',
  },
  brandDivider: {
    color: '#42444b',
    fontSize: '14px',
    fontWeight: '400',
  },
  brandTagline: {
    fontSize: '13px',
    color: '#9c9da3',
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '28px',
    flexWrap: 'wrap',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: '#9c9da3',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
    padding: '4px 0',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    paddingLeft: '16px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '12px',
    color: '#9c9da3',
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
};
