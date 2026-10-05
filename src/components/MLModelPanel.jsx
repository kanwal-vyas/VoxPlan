import React from 'react';

export default function MLModelPanel({
  modelStatus,
  featureImportances,
  onTrainModel,
  isTraining,
  trainingStep,
}) {
  const isTrained = modelStatus && modelStatus.is_trained;
  const cm = modelStatus?.confusion_matrix || [[0, 0], [0, 0]];

  const formatTimestamp = (iso) => {
    if (!iso) return 'Not yet trained';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <section id="intelligence" style={styles.section} aria-label="Model Intelligence">
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.headerTitleGroup}>
          <div style={styles.titleWithIndex}>
            <span style={styles.sectionIndex}>03</span>
            <h2 style={styles.sectionTitle}>Model Intelligence</h2>
          </div>
          <p style={styles.sectionSubtitle}>
            Supervised Random Forest Classifier evaluated on held-out validation data
          </p>
        </div>

        {/* Retrain Action */}
        <div style={styles.trainAction}>
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
              <span>{isTrained ? 'Retrain model →' : 'Train model →'}</span>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Training Step Progress */}
      {isTraining && (
        <div style={styles.trainingPhaseBox}>
          <div style={styles.phaseHeader}>
            <span style={styles.phaseLabel}>Status:</span>
            <span style={styles.phaseText}>
              {trainingStep || 'Synthesizing historical dataset · Fitting Random Forest · Evaluating metrics...'}
            </span>
          </div>
          <div style={styles.progressLine}>
            <div style={styles.progressLineFill} />
          </div>
        </div>
      )}

      {isTrained ? (
        <div style={styles.analyticalLayout}>
          {/* Top Analytical Bar: 4 Core Metrics in Research Typography */}
          <div style={styles.metricsStrip}>
            <div style={styles.metricBlock}>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.accuracy || 0) * 100).toFixed(1)}%</span>
              </div>
              <span style={styles.metricHeader}>Accuracy</span>
              <span style={styles.metricCaption}>Correct classifications</span>
            </div>

            <div style={styles.metricBlock}>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.precision || 0) * 100).toFixed(1)}%</span>
              </div>
              <span style={styles.metricHeader}>Precision</span>
              <span style={styles.metricCaption}>Positive predictive value</span>
            </div>

            <div style={styles.metricBlock}>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.recall || 0) * 100).toFixed(1)}%</span>
              </div>
              <span style={styles.metricHeader}>Recall</span>
              <span style={styles.metricCaption}>True delay sensitivity</span>
            </div>

            <div style={styles.metricBlock}>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.f1_score || 0) * 100).toFixed(1)}%</span>
              </div>
              <span style={styles.metricHeader}>F1 Score</span>
              <span style={styles.metricCaption}>Harmonic mean metric</span>
            </div>
          </div>

          {/* Split Analytical Grid: Feature Importance & Validation Matrix */}
          <div style={styles.analyticalGrid}>
            {/* Feature Importance */}
            <div style={styles.featureColumn}>
              <div style={styles.columnHeaderRow}>
                <span style={styles.columnEyebrow}>WHAT DRIVES DELAY?</span>
                <span style={styles.columnHint}>Gini Importance</span>
              </div>

              <div style={styles.featuresList}>
                {featureImportances.slice(0, 6).map((feat, idx) => (
                  <div key={feat.feature} style={styles.featureRow}>
                    <div style={styles.featureLabelRow}>
                      <span style={styles.featureIndex}>0{idx + 1}</span>
                      <span style={styles.featureName}>{feat.label}</span>
                      <span style={styles.featureVal}>{feat.percentage}%</span>
                    </div>
                    <div style={styles.dataBarTrack}>
                      <div
                        style={{
                          ...styles.dataBarFill,
                          width: `${Math.max(4, feat.percentage * 3.4)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Confusion Matrix */}
            <div style={styles.validationColumn}>
              <div style={styles.columnHeaderRow}>
                <span style={styles.columnEyebrow}>VALIDATION MATRIX</span>
                <span style={styles.columnHint}>240 Held-Out Samples</span>
              </div>

              <div style={styles.matrixTable}>
                <div style={styles.matrixHeaderLabels}>
                  <span></span>
                  <span style={styles.matColHead}>PRED ON-TIME</span>
                  <span style={styles.matColHead}>PRED OVERDUE</span>
                </div>

                <div style={styles.matrixDataRow}>
                  <span style={styles.matRowHead}>ACTUAL ON-TIME</span>
                  <div style={styles.cellTN}>
                    <span style={styles.cellNumber}>{cm[0]?.[0] ?? 0}</span>
                    <span style={styles.cellSub}>True Neg (TN)</span>
                  </div>
                  <div style={styles.cellFP}>
                    <span style={styles.cellNumber}>{cm[0]?.[1] ?? 0}</span>
                    <span style={styles.cellSub}>False Pos (FP)</span>
                  </div>
                </div>

                <div style={styles.matrixDataRow}>
                  <span style={styles.matRowHead}>ACTUAL OVERDUE</span>
                  <div style={styles.cellFN}>
                    <span style={styles.cellNumber}>{cm[1]?.[0] ?? 0}</span>
                    <span style={styles.cellSub}>False Neg (FN)</span>
                  </div>
                  <div style={styles.cellTP}>
                    <span style={styles.cellNumber}>{cm[1]?.[1] ?? 0}</span>
                    <span style={styles.cellSub}>True Pos (TP)</span>
                  </div>
                </div>
              </div>

              {/* Calibration Metadata */}
              <div style={styles.calibrationMeta}>
                <span style={styles.calibText}>
                  Trained: {formatTimestamp(modelStatus.trained_at)}
                </span>
                <span style={styles.calibText}>
                  Dataset: {modelStatus.total_samples || 1200} synthetic records (80/20 train/val split)
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.untrainedBox}>
          <h4 style={styles.untrainedTitle}>Model Uninitialized</h4>
          <p style={styles.untrainedDesc}>
            Initialize the Random Forest classifier to compute feature weights, evaluation metrics, and delay probabilities.
          </p>
          <button
            type="button"
            onClick={onTrainModel}
            disabled={isTraining}
            style={styles.trainBtn}
          >
            Train model now →
          </button>
        </div>
      )}
    </section>
  );
}

const styles = {
  section: {
    padding: '64px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '40px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '24px',
  },
  headerTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  titleWithIndex: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
  },
  sectionIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    fontWeight: '500',
    color: '#7c66dc',
  },
  sectionTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#f6f5f2',
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#9c9da3',
    margin: 0,
    maxWidth: '520px',
    lineHeight: 1.5,
  },
  trainAction: {
    display: 'flex',
    alignItems: 'center',
  },
  trainBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#f6f5f2',
    padding: '8px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  trainBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#f6f5f2',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  trainingPhaseBox: {
    padding: '16px 20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  phaseHeader: {
    fontSize: '13px',
    display: 'flex',
    gap: '8px',
  },
  phaseLabel: {
    fontWeight: '600',
    color: '#7c66dc',
  },
  phaseText: {
    color: '#9c9da3',
  },
  progressLine: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    position: 'relative',
  },
  progressLineFill: {
    position: 'absolute',
    height: '100%',
    width: '40%',
    backgroundColor: '#7c66dc',
    animation: 'indeterminate 1.5s infinite linear',
  },
  analyticalLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '48px',
  },
  metricsStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '32px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '36px',
  },
  metricBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    lineHeight: 1,
  },
  metricBigNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '36px',
    fontWeight: '800',
    color: '#f6f5f2',
    letterSpacing: '-0.03em',
  },
  metricHeader: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#f6f5f2',
    marginTop: '4px',
  },
  metricCaption: {
    fontSize: '12px',
    color: '#5e6068',
  },
  analyticalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '64px',
  },
  featureColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  validationColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  columnHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  columnEyebrow: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#f6f5f2',
  },
  columnHint: {
    fontSize: '12px',
    color: '#5e6068',
  },
  featuresList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  featureRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  featureLabelRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  featureIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#7c66dc',
    marginRight: '10px',
  },
  featureName: {
    flex: 1,
    color: '#f6f5f2',
    fontWeight: '400',
  },
  featureVal: {
    fontFamily: "'JetBrains Mono', monospace",
    color: '#9c9da3',
    fontSize: '12px',
    fontWeight: '500',
  },
  dataBarTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  dataBarFill: {
    height: '100%',
    backgroundColor: '#7c66dc',
  },
  matrixTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  matrixHeaderLabels: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr',
    gap: '8px',
    textAlign: 'center',
  },
  matColHead: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#9c9da3',
    letterSpacing: '0.06em',
  },
  matrixDataRow: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr',
    gap: '8px',
    alignItems: 'center',
  },
  matRowHead: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#9c9da3',
    letterSpacing: '0.04em',
  },
  cellTN: {
    backgroundColor: 'rgba(62, 163, 112, 0.06)',
    border: '1px solid rgba(62, 163, 112, 0.2)',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellFP: {
    backgroundColor: 'rgba(229, 72, 77, 0.06)',
    border: '1px solid rgba(229, 72, 77, 0.16)',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellFN: {
    backgroundColor: 'rgba(229, 72, 77, 0.06)',
    border: '1px solid rgba(229, 72, 77, 0.16)',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellTP: {
    backgroundColor: 'rgba(62, 163, 112, 0.06)',
    border: '1px solid rgba(62, 163, 112, 0.2)',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellNumber: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '800',
    color: '#f6f5f2',
  },
  cellSub: {
    fontSize: '10px',
    color: '#9c9da3',
    marginTop: '2px',
  },
  calibrationMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '8px',
  },
  calibText: {
    fontSize: '12px',
    color: '#5e6068',
  },
  untrainedBox: {
    padding: '48px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
  },
  untrainedTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '700',
    color: '#f6f5f2',
    margin: 0,
  },
  untrainedDesc: {
    fontSize: '14px',
    color: '#9c9da3',
    margin: 0,
    maxWidth: '440px',
    lineHeight: 1.5,
  },
};
