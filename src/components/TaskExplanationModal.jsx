import React, { useEffect } from 'react';

export default function TaskExplanationModal({ task, prediction, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!task || !prediction) return null;

  const prob = prediction.delay_probability ?? prediction.probability ?? 0;
  const percentage = (prob * 100).toFixed(1);
  const baselinePercentage = prediction.baseline_delay_probability != null
    ? (prediction.baseline_delay_probability * 100).toFixed(1)
    : percentage;
  const risk = prediction.risk || 'LOW';
  const explanation = prediction.explanation || prediction.top_risk_factors || [];
  const isPersonalized = Boolean(prediction.is_personalized);
  const personalAdjPercent = prediction.personal_adjustment != null
    ? (prediction.personal_adjustment * 100).toFixed(1)
    : '0.0';
  const signalsApplied = prediction.signals_applied || [];

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
    <div
      style={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-explanation-title"
    >
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
            aria-label={`Close explanation for "${task.title}"`}
          >
            ✕
          </button>
        </div>

        {/* Title & Risk Highlight */}
        <div style={styles.titleGroup}>
          <span style={styles.eyebrow}>PREDICTIVE EXPLANATION</span>
          <h2 id="task-explanation-title" style={styles.taskTitle}>{task.title}</h2>

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
              <span style={styles.riskSub}>
                {isPersonalized
                  ? `Hybrid Estimate: Baseline ${baselinePercentage}% ${Number(personalAdjPercent) >= 0 ? '+' : ''}${personalAdjPercent}% personal`
                  : 'Derived from baseline Random Forest reference model'}
              </span>
            </div>
          </div>
        </div>

        {/* Personal Risk Personalization Transparency Card */}
        <div style={styles.personalizationCard}>
          <div style={styles.personalizationHeader}>
            <span style={styles.personalizationTitle}>PERSONALIZATION TRANSPARENCY</span>
            <span
              style={{
                ...styles.personalizationStatusBadge,
                backgroundColor: isPersonalized ? '#F3EEFF' : '#FFF8EF',
                color: isPersonalized ? '#5B44BA' : '#706D73',
                borderColor: isPersonalized ? '#C9B6FF' : 'rgba(37, 36, 42, 0.12)',
              }}
            >
              {isPersonalized ? 'Active Personalization' : 'Baseline Fallback'}
            </span>
          </div>

          {isPersonalized ? (
            <div style={styles.personalizationBody}>
              <div style={styles.metricRow}>
                <div style={styles.metricItem}>
                  <span style={styles.metricLabel}>Baseline Risk:</span>
                  <span style={styles.metricVal}>{baselinePercentage}%</span>
                </div>
                <div style={styles.metricItem}>
                  <span style={styles.metricLabel}>Personal Adjustment:</span>
                  <span style={{ ...styles.metricVal, color: Number(personalAdjPercent) > 0 ? '#D9483B' : '#166534' }}>
                    {Number(personalAdjPercent) > 0 ? `+${personalAdjPercent}%` : `${personalAdjPercent}%`}
                  </span>
                </div>
                <div style={styles.metricItem}>
                  <span style={styles.metricLabel}>Observed Weight:</span>
                  <span style={styles.metricVal}>{prediction.effective_weight != null ? prediction.effective_weight.toFixed(1) : '3.0+'}</span>
                </div>
              </div>

              {signalsApplied.length > 0 && (
                <div style={styles.signalsList}>
                  <span style={styles.signalsHeading}>Observed Personal Signals:</span>
                  {signalsApplied.map((sig, sIdx) => (
                    <div key={sIdx} style={styles.signalBadge}>
                      <span style={styles.signalDot}>•</span>
                      <span>{sig}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={styles.fallbackNotice}>
              <p style={styles.fallbackText}>
                <strong>Preserving baseline:</strong> {prediction.fallback_reason || 'Personal history has not yet reached the 3.0 effective measured completion threshold.'}
              </p>
              <span style={styles.fallbackSub}>
                Zero heuristic distortions applied. The estimate remains pure baseline Random Forest risk until enough personal evidence is recorded.
              </span>
            </div>
          )}
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

        {/* Recommendation if present */}
        {prediction.recommendation && (
          <div style={styles.recommendationBox}>
            <span style={styles.recommendationHeading}>💡 Recommended Action</span>
            <p style={styles.recommendationText}>{prediction.recommendation}</p>
          </div>
        )}

        {/* Methodology Note */}
        <div style={styles.noteBox}>
          <span style={styles.noteHeading}>🔒 Privacy & Guardrails</span>
          <p style={styles.noteText}>
            Personal behavioural telemetry is stored strictly in your local browser IndexedDB. Baseline risk is trained on non-personal reference data and personal adjustments are clamped to ±15% with conservative Bayesian shrinkage.
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
    fontFamily: "var(--font-compact, 'Unica One', cursive, sans-serif)",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#706D73',
  },
  taskTitle: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '24px',
    fontWeight: '700',
    color: '#25242A',
    letterSpacing: '-0.01em',
    margin: 0,
    lineHeight: 1.25,
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
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
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
  personalizationCard: {
    backgroundColor: '#FAFAF8',
    borderRadius: '12px',
    padding: '14px 16px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  personalizationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personalizationTitle: {
    fontFamily: "var(--font-compact, 'Unica One', cursive, sans-serif)",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    color: '#25242A',
  },
  personalizationStatusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid',
  },
  personalizationBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  metricRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  metricItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  metricLabel: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  metricVal: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
  },
  signalsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(37, 36, 42, 0.06)',
  },
  signalsHeading: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  signalBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#25242A',
    fontWeight: '500',
  },
  signalDot: {
    color: '#5B44BA',
    fontSize: '14px',
    lineHeight: 1,
  },
  fallbackNotice: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fallbackText: {
    fontSize: '12px',
    color: '#25242A',
    margin: 0,
    lineHeight: 1.4,
  },
  fallbackSub: {
    fontSize: '11px',
    color: '#706D73',
    lineHeight: 1.4,
  },
  recommendationBox: {
    backgroundColor: '#F3EEFF',
    borderRadius: '10px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    border: '1px solid #C9B6FF',
  },
  recommendationHeading: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#5B44BA',
  },
  recommendationText: {
    fontSize: '12px',
    color: '#25242A',
    margin: 0,
    lineHeight: 1.4,
    fontWeight: '500',
  },
  factorsHeading: {
    fontFamily: "var(--font-compact, 'Unica One', cursive, sans-serif)",
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
