import React from 'react';

/**
 * Accessible, lightweight route loading fallback for React.Suspense.
 * Exposes role="status" and aria-live="polite" for screen readers.
 * Uses VoxPlan's warm cream and pastel styling.
 */
export default function RouteLoadingFallback({ message = 'Loading workspace...' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      style={styles.container}
    >
      <div style={styles.card}>
        <div style={styles.spinnerWrapper}>
          <div style={styles.spinner} />
        </div>
        <p style={styles.text}>{message}</p>
        <span className="sr-only">Please wait while the requested view loads.</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    backgroundColor: 'var(--bg-cream, #FFF8EF)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '2rem 3rem',
    borderRadius: 'var(--radius-lg, 20px)',
    backgroundColor: 'var(--bg-white, #FFFFFF)',
    border: '1px solid var(--border-card, rgba(37, 36, 42, 0.12))',
    boxShadow: 'var(--shadow-soft, 0 4px 16px rgba(37, 36, 42, 0.05))',
    textAlign: 'center',
  },
  spinnerWrapper: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid rgba(37, 36, 42, 0.1)',
    borderTopColor: 'var(--pastel-lilac, #C9B6FF)',
    borderRightColor: 'var(--pastel-coral, #FF8F82)',
    animation: 'spin 0.9s linear infinite',
  },
  text: {
    margin: 0,
    fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-dark, #25242A)',
  },
};
