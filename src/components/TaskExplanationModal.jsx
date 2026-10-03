import React from 'react';

export default function TaskExplanationModal({ task, prediction, onClose }) {
  if (!task || !prediction) return null;

  const prob = prediction.probability || 0;
  const percentage = (prob * 100).toFixed(1);
  const risk = prediction.risk || 'LOW';
  const explanation = prediction.explanation || [];

  const getRiskTheme = (r) => {
    switch (r) {
      case 'HIGH':
        return { color: '#f43f5e', label: 'CRITICAL DELAY RISK', bg: 'rgba(244, 63, 94, 0.08)', border: 'rgba(244, 63, 94, 0.25)' };
      case 'MEDIUM':
        return { color: '#fbbf24', label: 'MODERATE DELAY RISK', bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.25)' };
      case 'LOW':
      default:
        return { color: '#34d399', label: 'NOMINAL DELIVERY PROFILE', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' };
    }
  };

  const riskTheme = getRiskTheme(risk);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Top Intelligence Header */}
        <div style={styles.header}>
          <div style={styles.briefingEyebrowRow}>
            <span style={styles.briefingTag}>INTELLIGENCE BRIEFING</span>
            <span style={styles.taskKey}>TASK://{task.id || 'ACTIVE'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close intelligence briefing"
          >
            ×
          </button>
        </div>

        {/* Task Name & Primary Numeral */}
        <div style={styles.titleSection}>
          <span style={styles.sectionCategory}>PROJECT INITIATIVE</span>
          <h2 style={styles.taskTitle}>{task.title}</h2>
        </div>

        {/* Big Risk Callout */}
        <div style={{
          ...styles.riskCallout,
          backgroundColor: riskTheme.bg,
          borderColor: riskTheme.border,
        }}>
          <div style={styles.riskTopLine}>
            <span style={{ ...styles.riskLabel, color: riskTheme.color }}>
              {riskTheme.label}
            </span>
            <span style={{ ...styles.riskBigNum, color: riskTheme.color }}>
              {percentage}%
            </span>
          </div>
          <span style={styles.riskFormulaNote}>
            ESTIMATED VIA CONTINUOUS RANDOMFOREST DELAY PROBABILITY
          </span>
        </div>

        {/* Why the model flags this task */}
        <div style={styles.factorsSection}>
          <span style={styles.factorsEyebrow}>WHY THE MODEL FLAGS THIS TASK</span>
          <div style={styles.factorsList}>
            {explanation.map((item, index) => (
              <div key={index} style={styles.factorRow}>
                <span style={styles.factorIndex}>0{index + 1}</span>
                <span style={styles.factorText}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer / Model Interpretation Notice */}
        <div style={styles.disclaimerBox}>
          <span style={styles.disclaimerTag}>MODEL METHODOLOGY</span>
          <p style={styles.disclaimerText}>
            These factors represent weighted decision paths learned by the RandomForest classifier from project execution records. They serve as actionable predictive risk indicators rather than deterministic guarantees.
          </p>
        </div>

        {/* Dismiss Footer */}
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.closeActionBtn}>
            DISMISS BRIEFING
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
    backgroundColor: 'rgba(5, 7, 12, 0.85)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '24px',
  },
  modal: {
    backgroundColor: '#0c0e15',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '16px',
    maxWidth: '560px',
    width: '100%',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.9)',
    animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '14px',
  },
  briefingEyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  briefingTag: {
    fontSize: '9px',
    fontWeight: '800',
    letterSpacing: '0.16em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  taskKey: {
    fontSize: '10px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#868b98',
    fontSize: '24px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px',
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sectionCategory: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  taskTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '26px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.2,
  },
  riskCallout: {
    border: '1px solid',
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  riskTopLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  riskLabel: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.1em',
    fontFamily: "'JetBrains Mono', monospace",
  },
  riskBigNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  riskFormulaNote: {
    fontSize: '9px',
    fontWeight: '600',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.04em',
  },
  factorsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  factorsEyebrow: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.12em',
    color: '#f5f5f7',
    fontFamily: "'JetBrains Mono', monospace",
  },
  factorsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  factorRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  factorIndex: {
    fontSize: '10px',
    fontWeight: '800',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  factorText: {
    color: '#e2e8f0',
  },
  disclaimerBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  disclaimerTag: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  disclaimerText: {
    fontSize: '12px',
    color: '#9da3b4',
    margin: 0,
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: '16px',
  },
  closeActionBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    color: '#ffffff',
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    cursor: 'pointer',
  },
};
