import React from 'react';

export default function TaskExplanationModal({ task, prediction, onClose }) {
  if (!task || !prediction) return null;

  const prob = prediction.probability || 0;
  const percentage = (prob * 100).toFixed(1);
  const risk = prediction.risk || 'LOW';
  const explanation = prediction.explanation || [];

  const getTheme = () => {
    switch (risk) {
      case 'HIGH':
        return {
          cardBg: '#FFEFEA',
          cardBorder: '#FF8F82',
          badgeBg: '#FF8F82',
          badgeText: '#FFFFFF',
          riskCalloutBg: '#FFE0DC',
          riskCalloutText: '#C92A1D',
          emoji: '🚨',
          tag: 'High Risk Alert',
        };
      case 'MEDIUM':
        return {
          cardBg: '#FFF9DB',
          cardBorder: '#FFE58A',
          badgeBg: '#FFE58A',
          badgeText: '#92400E',
          riskCalloutBg: '#FEF3C7',
          riskCalloutText: '#B45309',
          emoji: '⚡',
          tag: 'Medium Risk Warning',
        };
      case 'LOW':
      default:
        return {
          cardBg: '#EBF8F1',
          cardBorder: '#BFE8D0',
          badgeBg: '#BFE8D0',
          badgeText: '#166534',
          riskCalloutBg: '#D1FAE5',
          riskCalloutText: '#065F46',
          emoji: '🌱',
          tag: 'Looking Good',
        };
    }
  };

  const theme = getTheme();

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        style={{
          ...styles.sheet,
          backgroundColor: theme.cardBg,
          borderColor: theme.cardBorder,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Tape */}
        <div className="tape-top" />

        {/* Modal Top Row */}
        <div style={styles.topRow}>
          <div style={styles.badgeGroup}>
            <span style={styles.badgeEmoji}>{theme.emoji}</span>
            <span style={{ ...styles.badgePill, backgroundColor: theme.badgeBg, color: theme.badgeText }}>
              {theme.tag}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close smart note"
          >
            ✕
          </button>
        </div>

        {/* Title & Risk Highlight */}
        <div style={styles.titleGroup}>
          <span style={styles.eyebrow}>SMART NOTE ANALYSIS</span>
          <h2 style={styles.taskTitle}>{task.title}</h2>

          <div style={{ ...styles.riskHighlightBox, backgroundColor: theme.riskCalloutBg, color: theme.riskCalloutText }}>
            <span style={styles.riskNum}>{percentage}%</span>
            <div style={styles.riskDescGroup}>
              <span style={styles.riskStatus}>{risk} DELAY RISK</span>
              <span style={styles.riskSub}>Estimated by Random Forest classifier</span>
            </div>
          </div>
        </div>

        {/* Why the model flags this task */}
        <div style={styles.factorsBlock}>
          <span style={styles.factorsHeading}>WHY IS THIS TASK WORRYING VOXPLAN?</span>
          <div style={styles.factorsList}>
            {explanation.map((item, idx) => (
              <div key={idx} style={styles.factorItem}>
                <span style={styles.factorNum}>0{idx + 1}</span>
                <span style={styles.factorText}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Friendly Methodology Notice */}
        <div style={styles.noteBox}>
          <span style={styles.noteHeading}>💡 How this works</span>
          <p style={styles.noteText}>
            VoxPlan checks historical patterns of deadline pressure, workload, and estimated effort to give you an early heads-up.
          </p>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.dismissBtn}>
            Got it, thanks! ✨
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(37, 36, 42, 0.45)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  sheet: {
    borderRadius: '24px',
    border: '3px solid',
    maxWidth: '520px',
    width: '100%',
    padding: '36px 32px 28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 24px 48px rgba(37, 36, 42, 0.2)',
    position: 'relative',
    animation: 'checkPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badgeEmoji: {
    fontSize: '18px',
  },
  badgePill: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: '9999px',
  },
  closeBtn: {
    background: '#FFFFFF',
    border: '1.5px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    color: '#25242A',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  eyebrow: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#706D73',
  },
  taskTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.2,
  },
  riskHighlightBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    borderRadius: '14px',
    marginTop: '4px',
  },
  riskNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '34px',
    fontWeight: '800',
    lineHeight: 1,
  },
  riskDescGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  riskStatus: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '13px',
    fontWeight: '800',
  },
  riskSub: {
    fontSize: '11px',
    opacity: 0.85,
  },
  factorsBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  factorsHeading: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#25242A',
  },
  factorsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  factorItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
  },
  factorNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    color: '#FF8F82',
  },
  factorText: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#25242A',
  },
  noteBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: '12px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    border: '1px dashed rgba(37, 36, 42, 0.12)',
  },
  noteHeading: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
  },
  noteText: {
    fontSize: '12px',
    color: '#4A4852',
    margin: 0,
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  dismissBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 22px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 0 rgba(0, 0, 0, 0.2)',
  },
};
