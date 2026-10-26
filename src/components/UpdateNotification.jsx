import React, { useState, useEffect } from 'react';
import { subscribeServiceWorkerUpdate, applyServiceWorkerUpdate } from '../utils/pwaManager';

/**
 * Accessible Service Worker Update Notification.
 * Informs the user when an updated application shell is ready to activate,
 * providing safe user-controlled reload without sudden page refresh.
 */
export default function UpdateNotification() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeServiceWorkerUpdate(({ hasUpdate: updateAvailable }) => {
      setHasUpdate(updateAvailable);
    });
  }, []);

  if (!hasUpdate || dismissed) {
    return null;
  }

  const handleApply = () => {
    applyServiceWorkerUpdate();
  };

  return (
    <aside
      role="region"
      aria-label="Application update available"
      style={styles.container}
    >
      <div style={styles.card}>
        <div style={styles.content}>
          <span style={styles.icon} aria-hidden="true">✨</span>
          <div style={styles.textGroup}>
            <strong style={styles.title}>Update Available</strong>
            <span style={styles.description}>
              A new version of VoxPlan is ready. Update when convenient to load the latest features.
            </span>
          </div>
        </div>
        <div style={styles.buttonGroup}>
          <button
            type="button"
            onClick={handleApply}
            style={styles.updateBtn}
            aria-label="Refresh now to apply update"
          >
            Refresh Now
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={styles.dismissBtn}
            aria-label="Dismiss update notification"
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: '24px',
    right: '24px',
    zIndex: 9990,
    maxWidth: '460px',
    boxShadow: 'var(--shadow-hover, 0 14px 32px rgba(37, 36, 42, 0.1))',
    borderRadius: 'var(--radius-lg, 20px)',
  },
  card: {
    backgroundColor: 'var(--bg-white, #FFFFFF)',
    border: '1px solid var(--pastel-lilac, #C9B6FF)',
    borderRadius: 'var(--radius-lg, 20px)',
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  content: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  icon: {
    fontSize: '1.25rem',
    lineHeight: 1.2,
  },
  textGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  title: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontWeight: 700,
    fontSize: '0.95rem',
    color: 'var(--text-dark, #25242A)',
  },
  description: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '0.85rem',
    color: 'var(--text-body, #4A4852)',
    lineHeight: 1.4,
  },
  buttonGroup: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.6rem',
  },
  updateBtn: {
    padding: '0.5rem 1.1rem',
    borderRadius: 'var(--radius-full, 9999px)',
    backgroundColor: 'var(--text-dark, #25242A)',
    color: '#FFFFFF',
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
  },
  dismissBtn: {
    padding: '0.5rem 0.9rem',
    borderRadius: 'var(--radius-full, 9999px)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted, #686571)',
    border: '1px solid var(--border-card, rgba(37, 36, 42, 0.12))',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
  },
};
