import React from 'react';
import MotifIcon from './MotifIcon';

/**
 * Global Floating Feedback Toast
 *
 * Provides immediate visual feedback for all application actions (task mutations,
 * ML predictions, model training, timer events) regardless of current scroll position.
 * Supports optional single-action Undo affordance.
 */
export default function FeedbackToast({ feedback, onDismiss }) {
  if (!feedback || !feedback.message) return null;

  const type = feedback.type || 'info';

  const typeStyles = {
    success: {
      bg: '#EBF8F1',
      border: '#BFE8D0',
      text: '#166534',
      badgeBg: '#BFE8D0',
      badgeText: '#166534',
      motifName: 'check',
    },
    error: {
      bg: '#FFE8E5',
      border: '#FFB5A7',
      text: '#991B1B',
      badgeBg: '#FFB5A7',
      badgeText: '#991B1B',
      motifName: 'alert-circle',
    },
    warning: {
      bg: '#FFF4E5',
      border: '#FFE0B2',
      text: '#B45309',
      badgeBg: '#FFE0B2',
      badgeText: '#B45309',
      motifName: 'warning',
    },
    info: {
      bg: '#F3EEFF',
      border: '#C9B6FF',
      text: '#5B44BA',
      badgeBg: '#C9B6FF',
      badgeText: '#5B44BA',
      motifName: 'info',
    },
  }[type] || {
    bg: '#FFFFFF',
    border: 'rgba(37, 36, 42, 0.15)',
    text: '#25242A',
    badgeBg: '#EAE8E4',
    badgeText: '#25242A',
    motifName: 'sparkle',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      id="global-feedback-toast"
      style={{
        ...styles.toastContainer,
        backgroundColor: typeStyles.bg,
        borderColor: typeStyles.border,
        color: typeStyles.text,
      }}
    >
      <div style={styles.contentRow}>
        <span
          style={{
            ...styles.badge,
            backgroundColor: typeStyles.badgeBg,
            color: typeStyles.badgeText,
          }}
          aria-hidden="true"
        >
          <MotifIcon name={typeStyles.motifName} size={14} color={typeStyles.badgeText} />
        </span>
        <div style={styles.messageWrap}>
          <span style={styles.messageText}>{feedback.message}</span>
        </div>

        {feedback.onUndo && (
          <button
            type="button"
            id="toast-undo-btn"
            onClick={() => {
              feedback.onUndo();
              if (onDismiss) onDismiss();
            }}
            style={{
              ...styles.undoBtn,
              borderColor: typeStyles.border,
              color: typeStyles.text,
            }}
            title="Undo this action"
            aria-label="Undo this action"
          >
            <MotifIcon name="history" size={13} style={{ marginRight: '4px' }} />
            <span>Undo</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          style={styles.closeBtn}
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <MotifIcon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}

const styles = {
  toastContainer: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    maxWidth: '460px',
    minWidth: '280px',
    padding: '12px 16px',
    borderRadius: '16px',
    border: '1px solid',
    boxShadow: '0 12px 32px rgba(37, 36, 42, 0.14), 0 2px 6px rgba(37, 36, 42, 0.06)',
    backdropFilter: 'blur(12px)',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
  },
  contentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  badge: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '800',
    flexShrink: 0,
  },
  messageWrap: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  messageText: {
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  undoBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '9999px',
    backgroundColor: '#FFFFFF',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: '4px',
    fontSize: '13px',
    opacity: 0.7,
    transition: 'opacity 0.15s ease',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
