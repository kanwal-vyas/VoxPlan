import React from 'react';

export default function TaskExplanationModal({ task, prediction, onClose }) {
  if (!task || !prediction) return null;

  const prob = prediction.probability || 0;
  const percentage = (prob * 100).toFixed(1);
  const risk = prediction.risk || 'LOW';
  const explanation = prediction.explanation || [];

  const getRiskColor = (r) => {
    switch (r) {
      case 'HIGH':
        return '#e5484d';
      case 'MEDIUM':
        return '#e5983b';
      case 'LOW':
      default:
        return '#3ea370';
    }
  };

  const riskColor = getRiskColor(risk);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div style={styles.header}>
          <div style={styles.headerMeta}>
            <span style={styles.headerLabel}>Analysis</span>
            <span style={styles.headerDivider}>/</span>
            <span style={styles.category}>{task.category || 'Initiative'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close analysis"
          >
            ✕
          </button>
        </div>

        {/* Task Title & Primary Numeral */}
        <div style={styles.titleSection}>
          <h2 style={styles.taskTitle}>{task.title}</h2>
          <div style={styles.riskRow}>
            <span style={{ ...styles.riskBigNum, color: riskColor }}>
              {percentage}%
            </span>
            <div style={styles.riskLabelGroup}>
              <span style={{ ...styles.riskStatus, color: riskColor }}>
                {risk} DELAY RISK
              </span>
              <span style={styles.riskSubtext}>
                Random Forest probability estimate
              </span>
            </div>
          </div>
        </div>

        {/* Factors Breakdown */}
        <div style={styles.factorsSection}>
          <span style={styles.factorsHeading}>WHY THE MODEL FLAGS THIS TASK</span>
          <div style={styles.factorsList}>
            {explanation.map((item, index) => (
              <div key={index} style={styles.factorRow}>
                <span style={styles.factorIndex}>0{index + 1}</span>
                <span style={styles.factorText}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Methodological Disclaimer */}
        <div style={styles.methodologyBox}>
          <span style={styles.methodologyHeading}>Methodology</span>
          <p style={styles.methodologyText}>
            Estimates are derived from learned feature weights in the Random Forest model across historical deadline pressure, task complexity, and sprint workload.
          </p>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.dismissBtn}>
            Close analysis
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
    backgroundColor: 'rgba(5, 6, 8, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '24px',
  },
  sheet: {
    backgroundColor: '#0f1014',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '4px',
    maxWidth: '520px',
    width: '100%',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
    animation: 'scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '14px',
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#7c66dc',
  },
  headerDivider: {
    fontSize: '12px',
    color: '#42444b',
  },
  category: {
    fontSize: '12px',
    color: '#9c9da3',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9c9da3',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '0 4px',
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  taskTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '26px',
    fontWeight: '800',
    color: '#f6f5f2',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.2,
    textTransform: 'uppercase',
  },
  riskRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
    padding: '16px 0',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  riskBigNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '36px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  riskLabelGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  riskStatus: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.06em',
  },
  riskSubtext: {
    fontSize: '12px',
    color: '#9c9da3',
  },
  factorsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  factorsHeading: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#9c9da3',
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
    fontSize: '14px',
    lineHeight: 1.5,
  },
  factorIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '600',
    color: '#7c66dc',
  },
  factorText: {
    color: '#f6f5f2',
  },
  methodologyBox: {
    padding: '12px 14px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '3px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  methodologyHeading: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#9c9da3',
  },
  methodologyText: {
    fontSize: '12px',
    color: '#5e6068',
    margin: 0,
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: '16px',
  },
  dismissBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#f6f5f2',
    padding: '6px 14px',
    borderRadius: '3px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};
