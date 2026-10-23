import React, { useState, useEffect, useRef } from 'react';

export default function MLModelPanel({
  modelStatus,
  featureImportances,
  onTrainModel,
  isTraining,
  trainingStep,
}) {
  const isTrained = Boolean(modelStatus && modelStatus.is_trained);
  const cm = modelStatus?.confusion_matrix || null;
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  const [metrics, setMetrics] = useState({
    accuracy: null,
    precision: null,
    recall: null,
    f1: null,
  });

  const [cmCounts, setCmCounts] = useState({
    tn: null,
    fp: null,
    fn: null,
    tp: null,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Staggered count-up when section scrolls into view with real model evaluation results
  useEffect(() => {
    if (!isVisible || !isTrained || !modelStatus) {
      return;
    }

    const targetAcc = (modelStatus.accuracy ?? 0) * 100;
      const targetPrec = (modelStatus.precision ?? 0) * 100;
      const targetRec = (modelStatus.recall ?? 0) * 100;
      const targetF1 = (modelStatus.f1_score ?? 0) * 100;

      const targetTN = cm?.[0]?.[0] ?? 0;
      const targetFP = cm?.[0]?.[1] ?? 0;
      const targetFN = cm?.[1]?.[0] ?? 0;
      const targetTP = cm?.[1]?.[1] ?? 0;

      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        const p = Math.min(1, step / 25);
        const ease = 1 - Math.pow(1 - p, 3);
        setMetrics({
          accuracy: Math.round(ease * targetAcc * 10) / 10,
          precision: Math.round(ease * targetPrec * 10) / 10,
          recall: Math.round(ease * targetRec * 10) / 10,
          f1: Math.round(ease * targetF1 * 10) / 10,
        });
        setCmCounts({
          tn: Math.round(ease * targetTN),
          fp: Math.round(ease * targetFP),
          fn: Math.round(ease * targetFN),
          tp: Math.round(ease * targetTP),
        });
        if (p >= 1) clearInterval(interval);
      }, 30);

      return () => clearInterval(interval);
  }, [isVisible, isTrained, modelStatus, cm]);

  return (
    <section id="intelligence" ref={sectionRef} style={styles.section} aria-label="Model Intelligence">
      <div style={styles.container}>
        {/* Section Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>03</span>
              <span style={styles.badge}>MACHINE LEARNING EVALUATION</span>
            </div>
            <h2 style={styles.title}>
              THE <span className={`hl hl-sage ${isVisible ? 'hl-sweep' : ''}`}>SMART</span> PART
            </h2>
            <p style={styles.subtitle}>
              Supervised Random Forest baseline evaluated on synthetic historical task dataset
            </p>
          </div>

          <button
            type="button"
            onClick={onTrainModel}
            disabled={isTraining}
            style={{
              ...styles.trainBtn,
              ...(isTraining ? styles.trainBtnDisabled : {}),
            }}
          >
            {isTraining ? (
              <>
                <span style={styles.spinner} />
                <span>Training pipeline...</span>
              </>
            ) : (
              <>
                <span>{isTrained ? 'Retrain baseline' : 'Train baseline model'}</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {/* Untrained / Offline Notice */}
        {!isTrained && !isTraining && (
          <div style={styles.untrainedNotice}>
            <span style={styles.untrainedNoticeText}>
              ℹ️ Baseline model is currently offline or untrained. No predictions or evaluation metrics are fabricated. Click <strong>Train baseline model</strong> above to fit the Random Forest classifier and generate authentic evaluation metrics.
            </span>
          </div>
        )}

        {/* Live Training Status Step */}
        {isTraining && (
          <div style={styles.trainingBox}>
            <span style={styles.trainingStepText}>
              ⚙️ {trainingStep || 'Synthesizing historical dataset · Fitting Random Forest model · Computing validation scores...'}
            </span>
          </div>
        )}

        {/* Big 4 Pastel Metrics Cards with Staggered Visual Entrance */}
        <div style={styles.metricsGrid}>
          {/* Card 1: Accuracy */}
          <div
            style={{
              ...styles.metricCard,
              borderTop: '4px solid #C9B6FF',
            }}
            className="digital-card ml-card-accuracy"
          >
            <span style={styles.metricName}>Accuracy</span>
            <span style={styles.metricValue}>{metrics.accuracy !== null ? `${metrics.accuracy}%` : '—'}</span>
            <span style={styles.metricCaption}>
              {isTrained ? 'overall test set accuracy' : 'model not trained'}
            </span>
          </div>

          {/* Card 2: Precision */}
          <div
            style={{
              ...styles.metricCard,
              borderTop: '4px solid #B9DDF7',
            }}
            className="digital-card ml-card-secondary"
          >
            <span style={styles.metricName}>Precision</span>
            <span style={styles.metricValue}>{metrics.precision !== null ? `${metrics.precision}%` : '—'}</span>
            <span style={styles.metricCaption}>
              {isTrained ? 'positive delay predictive value' : 'model not trained'}
            </span>
          </div>

          {/* Card 3: Recall */}
          <div
            style={{
              ...styles.metricCard,
              borderTop: '4px solid #BFE8D0',
            }}
            className="digital-card ml-card-secondary"
          >
            <span style={styles.metricName}>Recall</span>
            <span style={styles.metricValue}>{metrics.recall !== null ? `${metrics.recall}%` : '—'}</span>
            <span style={styles.metricCaption}>
              {isTrained ? 'true delay anomaly sensitivity' : 'model not trained'}
            </span>
          </div>

          {/* Card 4: F1 Score */}
          <div
            style={{
              ...styles.metricCard,
              borderTop: '4px solid #FFE58A',
            }}
            className="digital-card ml-card-secondary"
          >
            <span style={styles.metricName}>F1 Score</span>
            <span style={styles.metricValue}>{metrics.f1 !== null ? `${metrics.f1}%` : '—'}</span>
            <span style={styles.metricCaption}>
              {isTrained ? 'harmonic mean evaluation metric' : 'model not trained'}
            </span>
          </div>
        </div>

        {/* Split Grid: Feature Importance & Confusion Matrix */}
        <div style={styles.bottomGrid}>
          {/* Feature Importance */}
          <div style={styles.featurePanel} className="digital-card">
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>
                WHAT MAKES A TASK <span className={`hl hl-butter ${isVisible ? 'hl-sweep' : ''}`} style={{ padding: '0 4px' }}>PANIC?</span>
              </span>
              <span className="note-tag" style={{ color: '#D9483B' }}>
                {featureImportances.length > 0 ? 'gini importance ↗' : 'awaiting training'}
              </span>
            </div>

            {featureImportances.length > 0 ? (
              <div style={styles.featuresList}>
                {featureImportances.slice(0, 5).map((feat, idx) => (
                  <div key={feat.feature} style={styles.featureItem}>
                    <div style={styles.featureLabelRow}>
                      <span style={styles.featureName}>
                        <strong>0{idx + 1}</strong> {feat.label}
                      </span>
                      <span style={styles.featurePercent}>{feat.percentage}%</span>
                    </div>
                    <div style={styles.barTrack}>
                      <div
                        className="feature-bar-fill"
                        data-target-width={`${Math.max(6, feat.percentage * 3.6)}%`}
                        style={{
                          ...styles.barFill,
                          width: '0%',
                          backgroundColor: idx === 0 ? '#FF8F82' : idx === 1 ? '#FFE58A' : idx === 2 ? '#C9B6FF' : '#BFE8D0',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyNotice}>
                Feature importances are computed during model fitting. Train the baseline model to inspect feature signals.
              </div>
            )}
          </div>

          {/* Confusion Matrix */}
          <div style={styles.matrixPanel} className="digital-card">
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>DID THE MODEL GET IT RIGHT?</span>
              <span style={styles.panelNote}>
                {isTrained ? 'Synthetic holdout validation split' : 'Awaiting model evaluation'}
              </span>
            </div>

            {isTrained && cm ? (
              <div style={styles.matrixTable}>
                <div style={styles.matrixColLabels}>
                  <span />
                  <span style={styles.colLabel}>Pred: On Time</span>
                  <span style={styles.colLabel}>Pred: Late</span>
                </div>

                {/* Row 1: Actual On-Time */}
                <div style={styles.matrixRow}>
                  <span style={styles.rowLabel}>Actual: On Time</span>
                  <div
                    className="cm-cell-item"
                    style={{
                      ...styles.cell,
                      backgroundColor: '#EBF8F1',
                      border: '1px solid #BFE8D0',
                    }}
                  >
                    <span style={styles.cellVal}>{cmCounts.tn ?? 0}</span>
                    <span style={{ ...styles.cellTag, color: '#166534' }}>Nice prediction ✓</span>
                  </div>
                  <div
                    className="cm-cell-item"
                    style={{
                      ...styles.cell,
                      backgroundColor: '#FFF9DB',
                      border: '1px solid #FFE58A',
                    }}
                  >
                    <span style={styles.cellVal}>{cmCounts.fp ?? 0}</span>
                    <span style={{ ...styles.cellTag, color: '#92400E' }}>False alarm ⚡</span>
                  </div>
                </div>

                {/* Row 2: Actual Late */}
                <div style={styles.matrixRow}>
                  <span style={styles.rowLabel}>Actual: Late</span>
                  <div
                    className="cm-cell-item"
                    style={{
                      ...styles.cell,
                      backgroundColor: '#FFEFEA',
                      border: '1px solid #FFB5A7',
                    }}
                  >
                    <span style={styles.cellVal}>{cmCounts.fn ?? 0}</span>
                    <span style={{ ...styles.cellTag, color: '#991B1B' }}>Missed risk 🌧️</span>
                  </div>
                  <div
                    className="cm-cell-item"
                    style={{
                      ...styles.cell,
                      backgroundColor: '#EBF8F1',
                      border: '1px solid #BFE8D0',
                    }}
                  >
                    <span style={styles.cellVal}>{cmCounts.tp ?? 0}</span>
                    <span style={{ ...styles.cellTag, color: '#166534' }}>Correct warning 🚨</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.emptyNotice}>
                Confusion matrix evaluation data is calculated directly from the test split when the model is trained.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '36px 0',
  },
  container: {
    backgroundColor: '#F3EEF8',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 4px 18px rgba(61, 38, 69, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    border: '1.5px solid rgba(61, 38, 69, 0.14)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '20px',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#C85A32',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#5E5B66',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    color: '#3D2645',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#5E5B66',
    margin: 0,
    fontWeight: '500',
  },
  trainBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(200, 90, 50, 0.25)',
  },
  trainBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#FFFFFF',
    borderRadius: '50%',
    animation: 'spinSlow 0.8s linear infinite',
  },
  trainingBox: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    borderRadius: '12px',
    padding: '12px 18px',
    fontSize: '13px',
    color: '#25242A',
    fontWeight: '600',
  },
  trainingStepText: {
    display: 'block',
  },
  untrainedNotice: {
    backgroundColor: '#FFFFFF',
    border: '1.5px dashed rgba(37, 36, 42, 0.16)',
    borderRadius: '14px',
    padding: '14px 20px',
    fontSize: '13px',
    color: '#4A4852',
    lineHeight: 1.5,
  },
  untrainedNoticeText: {
    display: 'block',
  },
  emptyNotice: {
    padding: '28px 16px',
    textAlign: 'center',
    color: '#706D73',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '20px',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '22px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
    border: '1px solid rgba(37, 36, 42, 0.08)',
  },
  metricName: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#706D73',
  },
  metricValue: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '36px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  metricCaption: {
    fontSize: '12px',
    color: '#706D73',
    marginTop: '2px',
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  featurePanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '26px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  matrixPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '26px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(37, 36, 42, 0.06)',
  },
  panelTitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '12px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    color: '#25242A',
  },
  panelNote: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  featuresList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  featureItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  featureLabelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#25242A',
  },
  featureName: {
    fontWeight: '500',
  },
  featurePercent: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#4A4852',
  },
  barTrack: {
    width: '100%',
    height: '6px',
    backgroundColor: 'rgba(37, 36, 42, 0.06)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '9999px',
  },
  matrixTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  matrixColLabels: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr',
    gap: '8px',
    textAlign: 'center',
  },
  colLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
  },
  matrixRow: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr',
    gap: '8px',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
  },
  cell: {
    borderRadius: '10px',
    padding: '10px 6px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cellVal: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '800',
    color: '#25242A',
  },
  cellTag: {
    fontSize: '10px',
    fontWeight: '700',
  },
};
