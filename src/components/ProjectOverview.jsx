import React, { useState, useEffect, useRef } from 'react';

export default function ProjectOverview({
  tasks = [],
  predictionsMap = {},
  totalCount,
  completedCount,
  progressPercent,
  riskStats,
  onRunPredictions,
  onOpenScheduleModal,
  isPredicting,
  modelStatus,
}) {
  const isTrained = modelStatus && modelStatus.is_trained;
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

  // Derived active tasks for the risk pathway (real data only)
  const pendingTasks = (tasks || []).filter((t) => !t.completed);
  const displayTasks = pendingTasks.slice(0, 3);

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
              YOUR WEEK <span className={`hl hl-marigold ${isVisible ? 'hl-sweep' : ''}`}>SO FAR</span>
            </h2>
          </div>

          <div style={styles.actionGroup}>
            {onOpenScheduleModal && (
              <button
                type="button"
                onClick={onOpenScheduleModal}
                style={styles.scheduleBtn}
                title="Open Adaptive Sprint Scheduler"
              >
                <span>✦</span>
                <span>Adaptive Schedule</span>
              </button>
            )}

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

            <div
              style={styles.progressBarTrack}
              role="progressbar"
              aria-label="Sprint completion progress"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${completedCount} of ${totalCount} tasks completed (${progressPercent}%)`}
            >
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
              <span className="note-tag">
                {isTrained ? 'model-evaluated sequence →' : 'active initiatives →'}
              </span>
            </div>
            
            <div style={styles.pathway} className="pulse-pathway-track">
              {displayTasks.map((task, idx) => {
                const pred = predictionsMap[task.id];
                let nodeDotStyle = { backgroundColor: '#F3EEFF', border: '2px solid #C9B6FF' };
                let emoji = '⏳';
                let riskColor = '#5B44BA';
                let tagClass = 'hl hl-lilac';
                let riskText = 'Awaiting ML scan';

                if (pred) {
                  if (pred.risk === 'HIGH') {
                    nodeDotStyle = { backgroundColor: '#FFEFEA', border: '2px solid #FF8F82' };
                    emoji = '🚨';
                    riskColor = '#D9483B';
                    tagClass = 'hl hl-coral';
                    riskText = `${Math.round(pred.probability * 100)}% High Risk`;
                  } else if (pred.risk === 'MEDIUM') {
                    nodeDotStyle = { backgroundColor: '#FFF9DB', border: '2px solid #F59E0B' };
                    emoji = '⚡';
                    riskColor = '#B45309';
                    tagClass = 'hl hl-butter';
                    riskText = `${Math.round(pred.probability * 100)}% Med Risk`;
                  } else {
                    nodeDotStyle = { backgroundColor: '#EBF8F1', border: '2px solid #3EA370' };
                    emoji = '✓';
                    riskColor = '#166534';
                    tagClass = 'hl hl-mint';
                    riskText = `${Math.round(pred.probability * 100)}% Low Risk`;
                  }
                } else if (task.dueDate) {
                  riskText = `Due ${task.dueDate}`;
                }

                return (
                  <React.Fragment key={task.id}>
                    <div className="pulse-node-item" style={styles.pathNode}>
                      <div style={{ ...styles.nodeDot, ...nodeDotStyle }}>
                        <span>{emoji}</span>
                      </div>
                      <div style={styles.nodeInfo}>
                        <span style={styles.nodeTitle} title={task.title}>{task.title}</span>
                        <span style={{ ...styles.nodeRisk, color: riskColor }}>
                          <span className={tagClass} style={{ fontSize: '10px', padding: '1px 5px' }}>
                            {riskText}
                          </span>
                        </span>
                      </div>
                    </div>

                    {idx < displayTasks.length - 1 && (
                      <div className="pulse-path-line" style={styles.pathLine} />
                    )}
                  </React.Fragment>
                );
              })}

              {displayTasks.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 0', color: '#7A7782' }}>
                  <span style={{ fontSize: '20px' }}>✨</span>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>
                    {totalCount === 0
                      ? 'No tasks yet. Create an initiative to visualize sprint risk.'
                      : 'All tasks completed for this sprint!'}
                  </span>
                  {totalCount > 0 && (
                    <span style={{ fontFamily: "var(--font-accent, 'Bigelow Rules', cursive)", fontSize: '22px', color: '#C85A32', letterSpacing: '0.04em' }}>
                      ✦ Sprint Milestone Achieved
                    </span>
                  )}
                </div>
              )}
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
              <strong>{isTrained ? (riskStats?.highCount || 0) : '—'}</strong> Critical Delay Risk
            </span>
          </div>
          <div style={{ ...styles.statPill, backgroundColor: '#FFFFFF' }}>
            <span style={{ ...styles.statText, color: '#166534' }}>
              Average Risk: <strong>{isTrained && riskStats && riskStats.avgProb > 0 ? `${(riskStats.avgProb * 100).toFixed(0)}%` : '—'}</strong>
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
    backgroundColor: '#FAF0E8',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 4px 18px rgba(200, 90, 50, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    border: '1.5px solid rgba(200, 90, 50, 0.16)',
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
    color: '#C85A32',
  },
  badge: {
    fontFamily: "var(--font-subheading, 'Unica One', cursive, sans-serif)",
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#5E5B66',
  },
  title: {
    fontFamily: "var(--font-display, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '26px',
    fontWeight: '400',
    color: '#3D2645',
    letterSpacing: '0.01em',
    margin: 0,
  },
  actionGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  scheduleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FAFAF7',
    color: '#201E23',
    border: '1px solid rgba(61, 38, 69, 0.15)',
    boxShadow: '0 1px 4px rgba(61, 38, 69, 0.04)',
    padding: '9px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  analyzeBtn: {
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
    border: '1px solid rgba(61, 38, 69, 0.08)',
    boxShadow: '0 4px 16px rgba(61, 38, 69, 0.04)',
  },
  progressHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#201E23',
  },
  numeralRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    flexWrap: 'wrap',
  },
  hugePercent: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '52px',
    fontWeight: '800',
    color: '#3D2645',
    letterSpacing: '-0.04em',
    lineHeight: 1,
  },
  percentBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#2D6A4F',
  },
  progressBarTrack: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(61, 38, 69, 0.06)',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '6px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E5A83B',
    backgroundImage: 'linear-gradient(90deg, #E5A83B 0%, #C85A32 100%)',
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
    border: '1px solid rgba(61, 38, 69, 0.08)',
    boxShadow: '0 4px 16px rgba(61, 38, 69, 0.04)',
  },
  timelineHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineHeading: {
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    fontSize: '11px',
    fontWeight: '700',
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
