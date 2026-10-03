import React from 'react';

export default function ProjectOverview({
  totalCount,
  completedCount,
  progressPercent,
  riskStats,
  onRunPredictions,
  isPredicting,
  modelStatus,
}) {
  const pendingCount = totalCount - completedCount;
  const isTrained = modelStatus && modelStatus.is_trained;

  return (
    <section id="pulse" style={styles.section} aria-label="Project pulse and velocity">
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.headerTitleGroup}>
          <span style={styles.sectionIndex}>01 / SPRINT PULSE</span>
          <h2 style={styles.sectionTitle}>Project Trajectory & Health</h2>
        </div>

        <div style={styles.actionsGroup}>
          <button
            type="button"
            onClick={onRunPredictions}
            disabled={isPredicting || !isTrained}
            style={{
              ...styles.analyzeBtn,
              ...((!isTrained || isPredicting) ? styles.analyzeBtnDisabled : {}),
            }}
            title={!isTrained ? 'Train ML model first' : 'Run live predict_proba on all tasks'}
          >
            {isPredicting ? (
              <>
                <span style={styles.spinner} />
                <span>EVALUATING MODEL PREDICTIONS...</span>
              </>
            ) : (
              <>
                <span style={styles.btnDot} />
                <span>RUN DELAY PREDICTIONS</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Large Editorial Progress Composition */}
      <div style={styles.pulseGrid}>
        {/* Left: Huge Completion Numeral */}
        <div style={styles.completionBlock}>
          <div style={styles.numeralRow}>
            <span style={styles.hugePercent}>{progressPercent}</span>
            <span style={styles.percentSymbol}>%</span>
          </div>
          <span style={styles.completionSub}>
            SPRINT COMPLETION • {completedCount} OF {totalCount} TASKS DONE
          </span>
          <div style={styles.progressLineTrack}>
            <div
              style={{
                ...styles.progressLineFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>

        {/* Right: Analytical Risk & Velocity Breakdown */}
        <div style={styles.breakdownBlock}>
          {/* Active Queue */}
          <div style={styles.metricColumn}>
            <span style={styles.metricKey}>ACTIVE WORKLOAD</span>
            <div style={styles.metricValueGroup}>
              <span style={styles.metricBig}>{pendingCount}</span>
              <span style={styles.metricUnit}>TASKS REMAINING</span>
            </div>
            <span style={styles.metricDetail}>
              {completedCount} tasks marked complete
            </span>
          </div>

          {/* High Risk Count */}
          <div style={styles.metricColumn}>
            <span style={{ ...styles.metricKey, color: '#fb7185' }}>CRITICAL DELAY RISK</span>
            <div style={styles.metricValueGroup}>
              <span style={{ ...styles.metricBig, color: '#f43f5e' }}>
                {isTrained ? riskStats.highCount : '—'}
              </span>
              <span style={{ ...styles.metricUnit, color: '#fb7185' }}>TASKS AT RISK</span>
            </div>
            <span style={styles.metricDetail}>
              Predicted delay probability &ge; 65%
            </span>
          </div>

          {/* Medium / Low Balance */}
          <div style={styles.metricColumn}>
            <span style={styles.metricKey}>RISK EQUILIBRIUM</span>
            <div style={styles.equilibriumRow}>
              <span style={{ color: '#fbbf24', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                {isTrained ? riskStats.mediumCount : '0'} MED
              </span>
              <span style={{ color: '#5e6473' }}>•</span>
              <span style={{ color: '#34d399', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                {isTrained ? riskStats.lowCount : '0'} LOW
              </span>
            </div>
            <span style={styles.metricDetail}>
              Avg sprint delay risk: {isTrained ? `${(riskStats.avgProb * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '20px 0 30px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    paddingBottom: '48px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
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
  actionsGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  analyzeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    color: '#f5f5f7',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  analyzeBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  btnDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#38bdf8',
    boxShadow: '0 0 8px #38bdf8',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  pulseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '48px',
    alignItems: 'center',
  },
  completionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    lineHeight: 0.9,
  },
  hugePercent: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(64px, 8vw, 100px)',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.05em',
  },
  percentSymbol: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(28px, 4vw, 42px)',
    fontWeight: '700',
    color: '#7c5cfc',
  },
  completionSub: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  progressLineTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '6px',
  },
  progressLineFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #7c5cfc 0%, #38bdf8 100%)',
    borderRadius: '2px',
    transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  breakdownBlock: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '28px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    paddingLeft: '32px',
  },
  metricColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricKey: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metricValueGroup: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  metricBig: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  metricUnit: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metricDetail: {
    fontSize: '12px',
    color: '#5e6473',
    lineHeight: 1.4,
  },
  equilibriumRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    margin: '4px 0 2px 0',
  },
};
