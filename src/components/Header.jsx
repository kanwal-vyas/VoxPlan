import React from 'react';

export default function Header({ isBackendOnline, modelMetadata, onScrollToSection }) {
  const isTrained = modelMetadata && modelMetadata.is_trained;
  const accuracyText = isTrained ? `${((modelMetadata.accuracy || 0) * 100).toFixed(1)}% ACCURACY` : 'UNTRAINED';

  return (
    <header style={styles.header}>
      {/* Brand Identity */}
      <div style={styles.brand}>
        <div style={styles.emblem}>
          <span style={styles.emblemCore} />
        </div>
        <div style={styles.brandTextGroup}>
          <span style={styles.brandEyebrow}>INTELLIGENT OBSERVATORY</span>
          <span style={styles.brandName}>VOXPLAN</span>
        </div>
      </div>

      {/* Editorial Navigation Anchors */}
      <nav style={styles.nav}>
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
          Risk Landscape
        </button>
        <button
          type="button"
          onClick={() => onScrollToSection('intelligence')}
          style={styles.navLink}
        >
          Model Intelligence
        </button>
        <button
          type="button"
          onClick={() => onScrollToSection('command')}
          style={styles.navLink}
        >
          Command
        </button>
      </nav>

      {/* Live Telemetry Status */}
      <div style={styles.telemetry}>
        <div style={{
          ...styles.telemetryPill,
          backgroundColor: isBackendOnline ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
          borderColor: isBackendOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
          color: isBackendOnline ? '#34d399' : '#f87171',
        }}>
          <span style={{
            ...styles.telemetryDot,
            backgroundColor: isBackendOnline ? '#10b981' : '#f43f5e',
            boxShadow: isBackendOnline ? '0 0 8px rgba(16, 185, 129, 0.6)' : '0 0 8px rgba(244, 63, 94, 0.6)',
          }} />
          <span style={styles.telemetryText}>
            {isBackendOnline ? (isTrained ? `MODEL ACTIVE • ${accuracyText}` : 'BACKEND ONLINE • READY') : 'SERVER OFFLINE'}
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
    padding: '24px 0 20px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    flexWrap: 'wrap',
    gap: '20px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  emblem: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid rgba(124, 92, 252, 0.4)',
    backgroundColor: 'rgba(124, 92, 252, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemCore: {
    width: '8px',
    height: '8px',
    borderRadius: '2px',
    backgroundColor: '#7c5cfc',
    boxShadow: '0 0 10px rgba(124, 92, 252, 0.8)',
  },
  brandTextGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  brandEyebrow: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.14em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  brandName: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#f5f5f7',
    lineHeight: 1,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: '#868b98',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    letterSpacing: '0.01em',
    padding: '4px 0',
    position: 'relative',
    transition: 'color 0.2s ease',
  },
  telemetry: {
    display: 'flex',
    alignItems: 'center',
  },
  telemetryPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '11px',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '9999px',
    border: '1px solid',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.04em',
  },
  telemetryDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  telemetryText: {
    lineHeight: 1,
  },
};
