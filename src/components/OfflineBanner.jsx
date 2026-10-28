import React, { useState, useEffect } from 'react';
import { subscribeNetworkStatus, isOnline } from '../utils/pwaManager';
import MotifIcon from './MotifIcon';

/**
 * Accessible Offline Banner.
 * Clearly informs the user when connectivity is unavailable without intrusive popups.
 * Distinguishes local-first task capabilities from backend-dependent ML features.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeNetworkStatus((isCurrentlyOnline) => {
      setOnline(isCurrentlyOnline);
      if (isCurrentlyOnline) {
        setDismissed(false);
      }
    });
  }, []);

  if (online || dismissed) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Offline Mode Notice"
      style={styles.container}
    >
      <div style={styles.content}>
        <span style={styles.icon} aria-hidden="true">
          <MotifIcon name="antenna" size={16} />
        </span>
        <div style={styles.textGroup}>
          <strong style={styles.title}>Working Offline</strong>
          <span style={styles.description}>
            Local tasks, timers, and schedule proposals are fully operational. ML risk prediction requires a backend connection.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={styles.dismissBtn}
          aria-label="Dismiss offline notice"
        >
          <MotifIcon name="close" size={14} />
        </button>
      </div>
    </aside>
  );
}

const styles = {
  container: {
    backgroundColor: 'var(--pastel-butter-light, #FFF9DB)',
    borderBottom: '1px solid var(--pastel-butter, #FFE58A)',
    color: 'var(--text-dark, #25242A)',
    padding: '0.6rem 1.25rem',
    fontSize: '0.875rem',
    zIndex: 1000,
    position: 'relative',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  icon: {
    fontSize: '1.1rem',
  },
  textGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    flex: 1,
  },
  title: {
    fontWeight: 700,
    color: '#8A6A00',
  },
  description: {
    color: 'var(--text-body, #4A4852)',
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #686571)',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    lineHeight: 1,
  },
};
