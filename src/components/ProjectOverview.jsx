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
    <section id="pulse" style={styles.section} aria-label="Sprint Pulse">
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.headerTitleGroup}>
          <span style={styles.sectionIndex}>01</span>
          <h2 style={styles.sectionTitle}>Sprint Pulse</h2>
        </div>

        <div style={styles.actionsGroup}>
          <button
            type="button"
            onClick={onRunPredictions}
            disabled={isPredicting || !isTrained}
            style={{
              ...styles.actionBtn,
              ...((!isTrained || isPredicting) ? styles.actionBtnDisabled : {}),
            }}
            title={!isTrained ? 'Train model first' : 'Evaluate delay probabilities across all tasks'}
          >
            {isPredicting ? (
              <>
                <span style={styles.spinner} />
                <span>Evaluating...</span>
              </>
            ) : (
              <span>Run predictions →</span>
            )}
          </button>
        </div>
      </div>

      {/* Editorial Infographic Layout */}
      <div style={styles.pulseGrid}>
        {/* Left: Dominant Completion Numeral & Thin Track */}
        <div style={styles.completionBlock}>
          <div style={styles.numeralRow}>
            <span style={styles.hugePercent}>{progressPercent}%</span>
          </div>
          <div style={styles.completionText}>
            <span style={styles.completionLabel}>Sprint completion</span>
            <span style={styles.completionMeta}>
              {completedCount} of {totalCount} initiatives completed
            </span>
          </div>
          <div style={styles.progressLineTrack}>
            <div
              style={{
                ...styles.progressLineFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>

        {/* Right: Analytical Metrics Columns */}
        <div style={styles.metricsGrid}>
          {/* Active Tasks */}
          <div style={styles.metricItem}>
            <span style={styles.metricLabel}>Active Tasks</span>
            <span style={styles.metricValue}>{pendingCount}</span>
            <span style={styles.metricDetail}>in current sprint</span>
          </div>

          {/* High-Risk Tasks */}
          <div style={styles.metricItem}>
            <span style={styles.metricLabel}>High-Risk Tasks</span>
            <span
              style={{
                ...styles.metricValue,
                color: isTrained && riskStats.highCount > 0 ? '#e5484d' : '#f6f5f2',
              }}
            >
              {isTrained ? riskStats.highCount : '—'}
            </span>
            <span style={styles.metricDetail}>
              {isTrained ? 'delay probability ≥ 65%' : 'Model untrained'}
            </span>
          </div>

          {/* Average Delay Risk & Distribution */}
          <div style={styles.metricItem}>
            <span style={styles.metricLabel}>Risk Distribution</span>
            <div style={styles.distributionRow}>
              <span style={styles.distMed}>{isTrained ? riskStats.mediumCount : 0} med</span>
              <span style={styles.distDot}>·</span>
              <span style={styles.distLow}>{isTrained ? riskStats.lowCount : 0} low</span>
            </div>
            <span style={styles.metricDetail}>
              Avg risk: {isTrained ? `${(riskStats.avgProb * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '64px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '48px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerTitleGroup: {
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
  actionsGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  actionBtn: {
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
  actionBtnDisabled: {
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
  pulseGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '64px',
    alignItems: 'start',
  },
  completionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    lineHeight: 0.9,
  },
  hugePercent: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(56px, 6.5vw, 88px)',
    fontWeight: '800',
    color: '#f6f5f2',
    letterSpacing: '-0.04em',
  },
  completionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  completionLabel: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#f6f5f2',
  },
  completionMeta: {
    fontSize: '13px',
    color: '#9c9da3',
  },
  progressLineTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginTop: '8px',
  },
  progressLineFill: {
    height: '100%',
    backgroundColor: '#7c66dc',
    transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '32px',
    paddingTop: '8px',
  },
  metricItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#9c9da3',
    letterSpacing: '-0.01em',
  },
  metricValue: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    color: '#f6f5f2',
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  metricDetail: {
    fontSize: '12px',
    color: '#5e6068',
    lineHeight: 1.4,
  },
  distributionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.1,
    margin: '4px 0 2px 0',
  },
  distMed: {
    color: '#e5983b',
  },
  distDot: {
    color: '#42444b',
  },
  distLow: {
    color: '#3ea370',
  },
};
