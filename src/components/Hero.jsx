import React from 'react';

export default function Hero({ modelMetadata }) {
  const isTrained = modelMetadata && modelMetadata.is_trained;
  const accuracy = isTrained ? ((modelMetadata.accuracy || 0) * 100).toFixed(1) : null;
  const f1 = isTrained ? ((modelMetadata.f1_score || 0) * 100).toFixed(1) : null;
  const totalRecords = modelMetadata?.total_samples || 1200;

  return (
    <section style={styles.hero} aria-label="Introduction">
      <div style={styles.posterGrid} className="hero-poster-grid">
        {/* Left Column (~60%): Massive Editorial Headline */}
        <div style={styles.leftColumn}>
          <h1 style={styles.headline}>
            PREDICTIVE<br />
            PROJECT<br />
            INTELLIGENCE
          </h1>
        </div>

        {/* Right Column (~35%): Supporting Narrative & Analytical Metadata */}
        <div style={styles.rightColumn}>
          <div style={styles.narrativeGroup}>
            <p style={styles.statement}>
              A project intelligence platform that doesn't merely track what needs to happen.
            </p>
            <p style={styles.statementSecondary}>
              It estimates what is likely to go wrong.
            </p>
          </div>

          <div style={styles.modelNote}>
            <span style={styles.modelLabel}>MODEL</span>
            <span style={styles.modelName}>Random Forest</span>
            <span style={styles.modelMetrics}>
              {isTrained
                ? `${accuracy}% validation accuracy · ${f1}% F1 score · ${totalRecords} records`
                : 'Ready for training on historical records'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  hero: {
    padding: '72px 0 64px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  posterGrid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: '64px',
    alignItems: 'start',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  headline: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(46px, 5.8vw, 84px)',
    fontWeight: '800',
    lineHeight: '0.92',
    letterSpacing: '-0.04em',
    color: '#f6f5f2',
    margin: 0,
    textTransform: 'uppercase',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '40px',
    paddingTop: '8px',
    maxWidth: '420px',
  },
  narrativeGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  statement: {
    fontSize: '17px',
    lineHeight: '1.6',
    color: '#9c9da3',
    margin: 0,
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
  statementSecondary: {
    fontSize: '17px',
    lineHeight: '1.6',
    color: '#f6f5f2',
    margin: 0,
    fontWeight: '500',
    letterSpacing: '-0.01em',
  },
  modelNote: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  modelLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    color: '#5e6068',
    textTransform: 'uppercase',
  },
  modelName: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '700',
    color: '#f6f5f2',
    letterSpacing: '-0.01em',
  },
  modelMetrics: {
    fontSize: '13px',
    color: '#9c9da3',
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
};
