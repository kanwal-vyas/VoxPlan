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
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' • ' + d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <section id="intelligence" style={styles.section} aria-label="Machine learning model intelligence">
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.headerTitleGroup}>
          <span style={styles.sectionIndex}>03 / ANALYTICAL OBSERVATION</span>
          <h2 style={styles.sectionTitle}>Model Intelligence</h2>
          <p style={styles.sectionSubtitle}>
            Local supervised scikit-learn RandomForestClassifier trained on historical project records
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
                <span>TRAINING MODEL PIPELINE...</span>
              </>
            ) : (
              <>
                <span style={styles.trainDot} />
                <span>{isTrained ? 'RETRAIN PIPELINE' : 'INITIALIZE & TRAIN MODEL'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Training Step Progress Bar */}
      {isTraining && (
        <div style={styles.trainingPhaseBox}>
          <div style={styles.phaseHeader}>
            <span style={styles.phaseLabel}>PIPELINE EXECUTION:</span>
            <span style={styles.phaseText}>
              {trainingStep || 'Synthesizing historical dataset → Engineering features → Fitting RandomForest → Computing validation metrics...'}
            </span>
          </div>
          <div style={styles.progressLine}>
            <div style={styles.progressLineFill} />
          </div>
        </div>
      )}

      {isTrained ? (
        <div style={styles.analyticalLayout}>
          {/* Top Analytical Bar: 4 Core Metrics in Editorial Monospace */}
          <div style={styles.metricsStrip}>
            <div style={styles.metricBlock}>
              <span style={styles.metricHeader}>ACCURACY</span>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.accuracy || 0) * 100).toFixed(1)}</span>
                <span style={styles.numeralUnit}>%</span>
              </div>
              <span style={styles.metricCaption}>Correct classifications</span>
            </div>

            <div style={styles.metricBlock}>
              <span style={styles.metricHeader}>PRECISION</span>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.precision || 0) * 100).toFixed(1)}</span>
                <span style={styles.numeralUnit}>%</span>
              </div>
              <span style={styles.metricCaption}>Positive predictive value</span>
            </div>

            <div style={styles.metricBlock}>
              <span style={styles.metricHeader}>RECALL</span>
              <div style={styles.numeralRow}>
                <span style={styles.metricBigNum}>{((modelStatus.recall || 0) * 100).toFixed(1)}</span>
                <span style={styles.numeralUnit}>%</span>
              </div>
              <span style={styles.metricCaption}>True delay sensitivity</span>
            </div>

            <div style={styles.metricBlock}>
              <span style={styles.metricHeader}>F1 SCORE</span>
              <div style={styles.numeralRow}>
                <span style={{ ...styles.metricBigNum, color: '#7c5cfc' }}>{((modelStatus.f1_score || 0) * 100).toFixed(1)}</span>
                <span style={{ ...styles.numeralUnit, color: '#7c5cfc' }}>%</span>
              </div>
              <span style={styles.metricCaption}>Harmonic mean metric</span>
            </div>
          </div>

          {/* Split Analytical Grid: Feature Importance & Validation Confusion Matrix */}
          <div style={styles.analyticalGrid}>
            {/* Feature Importance Data Visualization */}
            <div style={styles.featureColumn}>
              <div style={styles.columnHeaderRow}>
                <span style={styles.columnEyebrow}>WHAT DRIVES DELAY?</span>
                <span style={styles.columnHint}>GINI IMPORTANCE WEIGHT</span>
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

            {/* Validation Confusion Matrix & Calibration Metadata */}
            <div style={styles.validationColumn}>
              <div style={styles.columnHeaderRow}>
                <span style={styles.columnEyebrow}>VALIDATION MATRIX</span>
                <span style={styles.columnHint}>240 HELD-OUT SAMPLES</span>
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
                    <span style={styles.cellSub}>TRUE NEG (TN)</span>
                  </div>
                  <div style={styles.cellFP}>
                    <span style={styles.cellNumber}>{cm[0]?.[1] ?? 0}</span>
                    <span style={styles.cellSub}>FALSE POS (FP)</span>
                  </div>
                </div>

                <div style={styles.matrixDataRow}>
                  <span style={styles.matRowHead}>ACTUAL OVERDUE</span>
                  <div style={styles.cellFN}>
                    <span style={styles.cellNumber}>{cm[1]?.[0] ?? 0}</span>
                    <span style={styles.cellSub}>FALSE NEG (FN)</span>
                  </div>
                  <div style={styles.cellTP}>
                    <span style={styles.cellNumber}>{cm[1]?.[1] ?? 0}</span>
                    <span style={styles.cellSub}>TRUE POS (TP)</span>
                  </div>
                </div>
              </div>

              {/* Calibration Metadata */}
              <div style={styles.calibrationMeta}>
                <span style={styles.calibText}>
                  TRAINED AT: {formatTimestamp(modelStatus.trained_at)}
                </span>
                <span style={styles.calibText}>
                  TOTAL TRAINING DATASET: {modelStatus.total_samples || 1200} RECORDS
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.untrainedBox}>
          <span style={styles.untrainedEyebrow}>PIPELINE UNINITIALIZED</span>
          <h4 style={styles.untrainedTitle}>Train the RandomForest Engine</h4>
          <p style={styles.untrainedDesc}>
            Click the button above or type <code>"train the model"</code> to synthesize project records, engineer features, and evaluate model performance.
          </p>
        </div>
      )}
    </section>
  );
}

const styles = {
  section: {
    padding: '30px 0 40px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    paddingBottom: '52px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '20px',
  },
  headerTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sectionIndex: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.14em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  sectionTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.03em',
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#868b98',
    margin: 0,
    maxWidth: '540px',
  },
  trainAction: {
    display: 'flex',
    alignItems: 'center',
  },
  trainBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(124, 92, 252, 0.16)',
    border: '1px solid rgba(124, 92, 252, 0.4)',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  trainBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  trainDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#7c5cfc',
    boxShadow: '0 0 8px #7c5cfc',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  trainingPhaseBox: {
    backgroundColor: 'rgba(124, 92, 252, 0.06)',
    border: '1px solid rgba(124, 92, 252, 0.2)',
    borderRadius: '10px',
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  phaseHeader: {
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#c7d2fe',
  },
  phaseLabel: {
    fontWeight: '700',
    marginRight: '6px',
    color: '#7c5cfc',
  },
  phaseText: {
    color: '#e2e8f0',
  },
  progressLine: {
    width: '100%',
    height: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressLineFill: {
    position: 'absolute',
    height: '100%',
    width: '40%',
    background: 'linear-gradient(90deg, #7c5cfc, #38bdf8)',
    animation: 'indeterminate 1.5s infinite linear',
  },
  analyticalLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '40px',
  },
  metricsStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '28px',
  },
  metricBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricHeader: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.14em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px',
    lineHeight: 1,
  },
  metricBigNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '36px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.03em',
  },
  numeralUnit: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '700',
    color: '#7c5cfc',
  },
  metricCaption: {
    fontSize: '11px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.02em',
  },
  analyticalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '48px',
  },
  featureColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  validationColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    paddingLeft: '32px',
  },
  columnHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: '6px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  columnEyebrow: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.12em',
    color: '#f5f5f7',
    fontFamily: "'JetBrains Mono', monospace",
  },
  columnHint: {
    fontSize: '9px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
  },
  featuresList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
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
    fontSize: '12px',
    fontWeight: '500',
  },
  featureIndex: {
    fontSize: '10px',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
    marginRight: '8px',
    fontWeight: '700',
  },
  featureName: {
    flex: 1,
    color: '#e2e8f0',
  },
  featureVal: {
    fontFamily: "'JetBrains Mono', monospace",
    color: '#868b98',
    fontSize: '11px',
    fontWeight: '600',
  },
  dataBarTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '1px',
    overflow: 'hidden',
  },
  dataBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #7c5cfc, #38bdf8)',
    borderRadius: '1px',
  },
  matrixTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  matrixHeaderLabels: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr 1fr',
    gap: '6px',
    textAlign: 'center',
  },
  matColHead: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
  },
  matrixDataRow: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr 1fr',
    gap: '6px',
    alignItems: 'center',
  },
  matRowHead: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.06em',
  },
  cellTN: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: '6px',
    padding: '8px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellFP: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    border: '1px solid rgba(244, 63, 94, 0.2)',
    borderRadius: '6px',
    padding: '8px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellFN: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    border: '1px solid rgba(244, 63, 94, 0.2)',
    borderRadius: '6px',
    padding: '8px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellTP: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: '6px',
    padding: '8px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  cellNumber: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '800',
    color: '#ffffff',
  },
  cellSub: {
    fontSize: '8px',
    fontWeight: '700',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.06em',
  },
  calibrationMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    marginTop: '6px',
  },
  calibText: {
    fontSize: '10px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.04em',
  },
  untrainedBox: {
    padding: '40px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '8px',
  },
  untrainedEyebrow: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  untrainedTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px',
    fontWeight: '700',
    color: '#ffffff',
    margin: 0,
  },
  untrainedDesc: {
    fontSize: '13px',
    color: '#868b98',
    margin: 0,
    maxWidth: '440px',
  },
};
