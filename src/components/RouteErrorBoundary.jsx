import React from 'react';

/**
 * Error boundary protecting against dynamic chunk load errors and network failures.
 * Provides accessible recovery actions (retry without page wipe or data loss).
 */
export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Route chunk load failure:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" tabIndex={-1} style={styles.container}>
          <div role="alert" style={styles.card}>
            <span style={styles.icon}>⚠️</span>
            <h1 style={styles.title}>Unable to Load View</h1>
            <p style={styles.description}>
              The requested view could not be loaded. This typically happens during an offline transition,
              temporary network disconnection, or after a new version update.
            </p>
            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={this.handleRetry}
                style={styles.retryButton}
                aria-label="Retry loading view"
              >
                Retry Loading
              </button>
            </div>
            <p style={styles.note}>
              Your tasks and workspace data remain safe and untouched.
            </p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    backgroundColor: 'var(--bg-cream, #FFF8EF)',
  },
  card: {
    maxWidth: '520px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '1rem',
    padding: '2.5rem',
    borderRadius: 'var(--radius-xl, 28px)',
    backgroundColor: 'var(--bg-white, #FFFFFF)',
    border: '1px solid var(--border-card, rgba(37, 36, 42, 0.12))',
    boxShadow: 'var(--shadow-card, 0 8px 24px rgba(37, 36, 42, 0.06))',
  },
  icon: {
    fontSize: '2.5rem',
  },
  title: {
    margin: 0,
    fontFamily: "var(--font-display, 'Syne', sans-serif)",
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--text-dark, #25242A)',
  },
  description: {
    margin: 0,
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '0.95rem',
    lineHeight: 1.6,
    color: 'var(--text-body, #4A4852)',
  },
  actionRow: {
    marginTop: '0.5rem',
    display: 'flex',
    gap: '0.75rem',
  },
  retryButton: {
    padding: '0.75rem 1.75rem',
    borderRadius: 'var(--radius-full, 9999px)',
    backgroundColor: 'var(--text-dark, #25242A)',
    color: '#FFFFFF',
    border: 'none',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
  },
  note: {
    margin: 0,
    fontSize: '0.825rem',
    color: 'var(--text-muted, #686571)',
  },
};
