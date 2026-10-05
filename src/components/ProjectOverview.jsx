import React, { useState, useEffect, useRef } from 'react';

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
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Smooth count-up when section enters view
  useEffect(() => {
    if (isVisible) {
      let step = 0;
      const target = progressPercent;
      const interval = setInterval(() => {
        step += 1;
        const p = Math.min(1, step / 20);
        const ease = 1 - Math.pow(1 - p, 3);
        setDisplayProgress(Math.round(ease * target));
        if (p >= 1) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
    }
  }, [isVisible, progressPercent]);

  return (
    <section id="pulse" ref={sectionRef} style={styles.section} aria-label="Sprint Pulse">
      <div style={styles.container}>
        {/* Header Row */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>01</span>
              <span style={styles.badge}>SPRINT PROGRESSION</span>
            </div>
            <h2 style={styles.title}>
              YOUR WEEK <span className={`hl hl-butter ${isVisible ? 'hl-sweep' : ''}`}>SO FAR</span>
            </h2>
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
                <span>Evaluating risk...</span>
              </>
            ) : (
              <>
                <span>Run predictions</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {/* Big Progress & Timeline Layout */}
        <div style={styles.mainGrid} className="pulse-layout">
          {/* Big Progress Card */}
          <div style={styles.progressCard} className="digital-card">
            <div style={styles.progressHeader}>
              <span style={styles.progressLabel}>Sprint Completion</span>
              <span className="note-tag" style={{ color: '#27754E' }}>✎ active cycle</span>
            </div>

            <div style={styles.numeralRow}>
              <span style={styles.hugePercent}>{displayProgress}%</span>
              <span className="hl hl-mint" style={styles.percentBadge}>
                {completedCount} of {totalCount} completed
              </span>
            </div>

            <div style={styles.progressBarTrack}>
              <div
                style={{
                  ...styles.progressBarFill,
                  width: isVisible ? `${progressPercent}%` : '0%',
                }}
              />
            </div>
          </div>

          {/* Timeline Milestones Path */}
          <div style={styles.timelineCard} className="digital-card">
            <div style={styles.timelineHeader}>
              <span style={styles.timelineHeading}>TASK RISK PATHWAY</span>
              <span className="note-tag">annotated sequence →</span>
            </div>
            
            <div style={styles.pathway} className="pulse-pathway-track">
              <div
                className="pulse-node-item"
                style={{
                  ...styles.pathNode,
                }}
              >
                <div style={{ ...styles.nodeDot, backgroundColor: '#FFEFEA', border: '2px solid #FF8F82' }}>
                  <span>🚨</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Revise Cryptography</span>
                  <span style={{ ...styles.nodeRisk, color: '#D9483B' }}>
                    <span className="hl hl-coral" style={{ fontSize: '10px', padding: '1px 5px' }}>96% High Risk</span>
                  </span>
                </div>
              </div>

              <div
                className="pulse-path-line"
                style={{
                  ...styles.pathLine,
                }}
              />

              <div
                className="pulse-node-item"
                style={{
                  ...styles.pathNode,
                }}
              >
                <div style={{ ...styles.nodeDot, backgroundColor: '#FFF9DB', border: '2px solid #F59E0B' }}>
                  <span>⚡</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Practice Subnetting</span>
                  <span style={{ ...styles.nodeRisk, color: '#B45309' }}>
                    <span className="hl hl-butter" style={{ fontSize: '10px', padding: '1px 5px' }}>54% Med Risk</span>
                  </span>
                </div>
              </div>

              <div
                className="pulse-path-line"
                style={{
                  ...styles.pathLine,
                }}
              />

              <div
                className="pulse-node-item"
                style={{
                  ...styles.pathNode,
                }}
              >
                <div style={{ ...styles.nodeDot, backgroundColor: '#EBF8F1', border: '2px solid #3EA370' }}>
                  <span>✓</span>
                </div>
                <div style={styles.nodeInfo}>
                  <span style={styles.nodeTitle}>Study OSI Model</span>
                  <span style={{ ...styles.nodeRisk, color: '#166534' }}>
                    <span className="hl hl-mint" style={{ fontSize: '10px', padding: '1px 5px' }}>19% Low Risk</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Small Annotation Badges */}
        <div style={styles.statsStrip}>
          <div style={styles.statPill}>
            <span style={styles.statText}><strong>{totalCount}</strong> Total Tasks</span>
          </div>
          <div style={{ ...styles.statPill, backgroundColor: '#FFFFFF' }}>
            <span style={{ ...styles.statText, color: '#C92A1D' }}>
              <strong>{isTrained ? riskStats.highCount : 1}</strong> Critical Delay Risk
            </span>
          </div>
          <div style={{ ...styles.statPill, backgroundColor: '#FFFFFF' }}>
            <span style={{ ...styles.statText, color: '#166534' }}>
              Average Risk: <strong>{isTrained ? `${(riskStats.avgProb * 100).toFixed(0)}%` : '56%'}</strong>
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
    position: 'relative',
    zIndex: 5,
  },
  container: {
    backgroundColor: '#FFF9DB',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: '0 8px 24px rgba(255, 229, 138, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
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
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(37, 36, 42, 0.12)',
  },
  analyzeBtnDisabled: {
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
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1.1fr 1.5fr',
    gap: '28px',
    alignItems: 'stretch',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '10px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  progressHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#25242A',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    flexWrap: 'wrap',
  },
  hugePercent: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '56px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.04em',
    lineHeight: 1,
  },
  percentBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#166534',
  },
  progressBarTrack: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(37, 36, 42, 0.06)',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '6px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFE58A',
    backgroundImage: 'linear-gradient(90deg, #FFE58A 0%, #FF8F82 100%)',
    borderRadius: '9999px',
    transition: 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  timelineHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineHeading: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#706D73',
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
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
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
    marginTop: '2px',
  },
  pathLine: {
    flex: 1,
    height: '2px',
    backgroundColor: 'rgba(37, 36, 42, 0.1)',
    minWidth: '16px',
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
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '13px',
  },
  statText: {
    color: '#4A4852',
  },
};
