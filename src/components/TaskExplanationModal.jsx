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
          headerBg: '#FFEFEA',
          borderColor: '#FF8F82',
          badgeBg: '#FF8F82',
          textColor: '#D9483B',
          tagClass: 'hl hl-coral',
          tag: 'High Delay Risk',
        };
      case 'MEDIUM':
        return {
          headerBg: '#FFF9DB',
          borderColor: '#FFE58A',
          badgeBg: '#FFE58A',
          textColor: '#B45309',
          tagClass: 'hl hl-butter',
          tag: 'Medium Delay Risk',
        };
      case 'LOW':
      default:
        return {
          headerBg: '#EBF8F1',
          borderColor: '#BFE8D0',
          badgeBg: '#BFE8D0',
          textColor: '#166534',
          tagClass: 'hl hl-mint',
          tag: 'Nominal Delivery',
        };
    }
  };

  const theme = getTheme();

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Row */}
        <div style={styles.topRow}>
          <div style={styles.badgeGroup}>
            <span className={theme.tagClass} style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.04em' }}>
              {theme.tag.toUpperCase()}
            </span>
            <span style={styles.categoryNote}>· {task.category || 'General'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Title & Risk Highlight */}
        <div style={styles.titleGroup}>
          <span style={styles.eyebrow}>PREDICTIVE EXPLANATION</span>
          <h2 style={styles.taskTitle}>{task.title}</h2>

          <div style={{ ...styles.riskHighlightBox, backgroundColor: theme.headerBg, border: `1.5px solid ${theme.borderColor}` }}>
            <span
              className="annotated-circle"
              style={{
                color: theme.textColor,
                fontSize: '28px',
                fontWeight: '800',
              }}
            >
              {percentage}%
            </span>
            <div style={styles.riskDescGroup}>
              <span style={{ ...styles.riskStatus, color: theme.textColor }}>
                {risk} DELAY RISK ESTIMATE
              </span>
              <span style={styles.riskSub}>Derived from Random Forest feature weight calculations</span>
            </div>
          </div>
        </div>

        {/* Factors Breakdown */}
        <div style={styles.factorsBlock}>
          <span style={styles.factorsHeading}>WHY IS THIS TASK FLAGGED BY THE MODEL?</span>
          <div style={styles.factorsList}>
            {explanation.map((item, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.factorItem,
                  animation: 'factorStagger 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                  animationDelay: `${120 + idx * 80}ms`,
                }}
              >
                <span style={{ ...styles.factorNum, color: theme.textColor }}>0{idx + 1}</span>
                <span style={styles.factorText}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Methodology Note */}
        <div style={styles.noteBox}>
          <span style={styles.noteHeading}>💡 Model Methodology</span>
          <p style={styles.noteText}>
            These indicators reflect statistical relationships learned from past sprint execution records (deadline urgency, workload density, and task effort).
          </p>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.dismissBtn}>
            Close briefing
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
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    maxWidth: '520px',
    width: '100%',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 20px 48px rgba(37, 36, 42, 0.15)',
    position: 'relative',
    animation: 'checkPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  categoryNote: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  closeBtn: {
    background: '#FFF8EF',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    color: '#25242A',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
    fontSize: '26px',
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
    padding: '12px 18px',
    borderRadius: '12px',
    marginTop: '4px',
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
    color: '#706D73',
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
    letterSpacing: '0.06em',
    color: '#25242A',
  },
  factorsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  factorItem: {
    backgroundColor: '#FFF8EF',
    borderRadius: '8px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid rgba(37, 36, 42, 0.06)',
  },
  factorNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
  },
  factorText: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#25242A',
  },
  noteBox: {
    backgroundColor: '#FFF8EF',
    borderRadius: '10px',
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
    color: '#706D73',
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
    padding: '9px 20px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
};
