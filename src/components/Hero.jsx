import React from 'react';

export default function Hero({ modelMetadata, onRunPredictions, isPredicting }) {
  const isTrained = modelMetadata && modelMetadata.is_trained;
  const accuracy = isTrained ? ((modelMetadata.accuracy || 0) * 100).toFixed(1) : null;
  const f1 = isTrained ? ((modelMetadata.f1_score || 0) * 100).toFixed(1) : null;

  return (
    <section style={styles.hero} aria-label="Observatory intro">
      <div style={styles.eyebrowRow}>
        <span style={styles.eyebrow}>PREDICTIVE PROJECT OBSERVATORY</span>
        <span style={styles.coordinates}>SYS://V2.4 • ML_PIPELINE_ACTIVE</span>
      </div>

      <div style={styles.mainGrid}>
        {/* Oversized Editorial Heading */}
        <div style={styles.titleColumn}>
          <h1 style={styles.headline}>
            PREDICTIVE<br />
            PROJECT<br />
            INTELLIGENCE
          </h1>
        </div>

        {/* Narrative Narrative & Floating Metrics Anchor */}
        <div style={styles.narrativeColumn}>
          <p style={styles.statement}>
            A project intelligence platform that doesn't merely track what needs to happen.
            It uses continuous machine learning to estimate what is likely to go wrong.
          </p>

          <div style={styles.heroMetricsBox}>
            {isTrained ? (
              <div style={styles.metricItem}>
                <span style={styles.metricEyebrow}>SUPERVISED RANDOMFOREST</span>
                <div style={styles.metricNumeralRow}>
                  <span style={styles.metricNumeral}>{accuracy}%</span>
                  <span style={styles.metricNumeralLabel}>ACCURACY</span>
                </div>
                <span style={styles.metricSubtext}>
                  F1 SCORE {f1}% • {modelMetadata.total_samples || 1200} HISTORICAL RECORDS
                </span>
              </div>
            ) : (
              <div style={styles.metricItem}>
                <span style={styles.metricEyebrow}>MACHINE LEARNING STATUS</span>
                <div style={styles.metricNumeralRow}>
                  <span style={{ ...styles.metricNumeral, color: '#fbbf24' }}>READY</span>
                </div>
                <span style={styles.metricSubtext}>
                  Click "Train Model" to synthesize records and initialize intelligence
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  hero: {
    padding: '30px 0 20px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    paddingBottom: '44px',
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.16em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  coordinates: {
    fontSize: '11px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    alignItems: 'flex-end',
    gap: '40px',
  },
  titleColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  headline: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(42px, 5.5vw, 68px)',
    fontWeight: '800',
    lineHeight: '0.94',
    letterSpacing: '-0.04em',
    color: '#ffffff',
    margin: 0,
    textTransform: 'uppercase',
  },
  narrativeColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    maxWidth: '440px',
  },
  statement: {
    fontSize: '17px',
    lineHeight: 1.6,
    color: '#9da3b4',
    margin: 0,
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
  heroMetricsBox: {
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    paddingTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  metricItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  metricEyebrow: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metricNumeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  metricNumeral: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '38px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  metricNumeralLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    color: '#7c5cfc',
  },
  metricSubtext: {
    fontSize: '11px',
    color: '#5e6473',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.04em',
  },
};
