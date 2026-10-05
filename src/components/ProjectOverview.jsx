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
  const isTrained = modelStatus && modelStatus.is_trained;
  const pendingCount = totalCount - completedCount;

  return (
    <section id="pulse" style={styles.section} aria-label="Sprint Pulse">
      <div style={styles.container}>
        {/* Header Row */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>01</span>
              <span style={styles.badge}>🌱 SPRINT PULSE</span>
            </div>
            <h2 style={styles.title}>Your Week So Far</h2>
          </div>

          <button
            type="button"
            onClick={onRunPredictions}
            disabled={isPredicting || !isTrained}
            style={{
              ...styles.analyzeBtn,
              ...((!isTrained || isPredicting) ? styles.analyzeBtnDisabled : {}),
            }}
          >
            {isPredicting ? (
              <>
                <span style={styles.spinner} />
                <span>Thinking...</span>
              </>
            ) : (
              <>
                <span>Run predictions</span>
                <span>✨</span>
              </>
            )}
          </button>
        </div>

        {/* Big Progress & Timeline Layout */}
        <div style={styles.mainGrid} className="pulse-layout">
          {/* Big Progress Card */}
          <div style={styles.progressCard}>
            <div style={styles.numeralRow}>
              <span style={styles.hugePercent}>{progressPercent}%</span>
            </div>
            <span style={styles.progressLabel}>Sprint Completed</span>
            <span style={styles.progressMeta}>
              {completedCount} done · {pendingCount} tasks remaining
            </span>

            <div style={styles.progressBarTrack}>
              <div style={{ ...styles.progressBarFill, width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Timeline Milestones Path */}
          <div style={styles.timelineCard}>
            <span style={styles.timelineHeading}>TASK RISK PATHWAY</span>
            
            <div style={styles.pathway}>
              <div style={styles.pathNode}>
                <div style={{ ...styles.nodeDot, backgroundColor: '#FF8F82' }}>
                  <span>⚠️</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Revise Cryptography</span>
                  <span style={{ ...styles.nodeRisk, color: '#D9483B' }}>High Risk (96%)</span>
                </div>
              </div>

              <div style={styles.pathLine} />

              <div style={styles.pathNode}>
                <div style={{ ...styles.nodeDot, backgroundColor: '#FFE58A' }}>
                  <span>⚡</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Practice Subnetting</span>
                  <span style={{ ...styles.nodeRisk, color: '#B45309' }}>Med Risk (54%)</span>
                </div>
              </div>

              <div style={styles.pathLine} />

              <div style={styles.pathNode}>
                <div style={{ ...styles.nodeDot, backgroundColor: '#BFE8D0' }}>
                  <span>✓</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Study OSI Model</span>
                  <span style={{ ...styles.nodeRisk, color: '#166534' }}>Low Risk (19%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Small Highlight Badges */}
        <div style={styles.statsStrip}>
          <div style={styles.statPill}>
            <span style={styles.statEmoji}>🎯</span>
            <span style={styles.statText}><strong>{totalCount}</strong> Total Initiatives</span>
          </div>
          <div style={{ ...styles.statPill, backgroundColor: '#FFE8E5', borderColor: '#FFB5A7' }}>
            <span style={styles.statEmoji}>🚨</span>
            <span style={{ ...styles.statText, color: '#C92A1D' }}>
              <strong>{isTrained ? riskStats.highCount : 1}</strong> High-Risk Tasks
            </span>
          </div>
          <div style={{ ...styles.statPill, backgroundColor: '#EBF8F1', borderColor: '#BFE8D0' }}>
            <span style={styles.statEmoji}>💡</span>
            <span style={{ ...styles.statText, color: '#166534' }}>
              Avg Delay Risk: <strong>{isTrained ? `${(riskStats.avgProb * 100).toFixed(0)}%` : '56%'}</strong>
            </span>
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
    backgroundColor: '#FFF9DB',
    border: '2px solid #FFE58A',
    borderRadius: '28px',
    padding: '40px',
    boxShadow: '0 8px 24px rgba(255, 229, 138, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
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
    color: '#B45309',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#92400E',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  analyzeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    border: '2px solid #25242A',
    padding: '10px 20px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 0 #25242A',
  },
  analyzeBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(37, 36, 42, 0.2)',
    borderTopColor: '#25242A',
    borderRadius: '50%',
    animation: 'spinSlow 0.8s linear infinite',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.6fr',
    gap: '32px',
    alignItems: 'stretch',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px',
    border: '1.5px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
  },
  hugePercent: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '64px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.04em',
    lineHeight: 1,
  },
  progressLabel: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#25242A',
  },
  progressMeta: {
    fontSize: '13px',
    color: '#7A7782',
    fontWeight: '500',
  },
  progressBarTrack: {
    width: '100%',
    height: '10px',
    backgroundColor: 'rgba(37, 36, 42, 0.08)',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '12px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFE58A',
    backgroundImage: 'linear-gradient(90deg, #FFE58A 0%, #FF8F82 100%)',
    borderRadius: '9999px',
    transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    border: '1.5px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  timelineHeading: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#7A7782',
  },
  pathway: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  pathNode: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  nodeDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
    flexShrink: 0,
  },
  nodeInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  nodeTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#25242A',
  },
  nodeRisk: {
    fontSize: '11px',
    fontWeight: '700',
  },
  pathLine: {
    flex: 1,
    height: '2px',
    backgroundColor: 'rgba(37, 36, 42, 0.12)',
    minWidth: '20px',
  },
  statsStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  statPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid rgba(37, 36, 42, 0.08)',
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '13px',
  },
  statEmoji: {
    fontSize: '14px',
  },
  statText: {
    color: '#4A4852',
  },
};
