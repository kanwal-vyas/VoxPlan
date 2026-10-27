import React, { useState, useEffect, useRef } from 'react';
import { telemetry } from '../telemetry/telemetryManager';
import { dialogueManager } from '../conversation/dialogueManager';

export default function BehavioralHistoryPanel({ tasks }) {
  const [stats, setStats] = useState(() => telemetry.getStats(tasks));
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

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

  // Subscribe to live telemetry changes
  useEffect(() => {
    const unsubscribe = telemetry.subscribe(() => {
      setStats(telemetry.getStats(tasks));
    });
    return unsubscribe;
  }, [tasks]);

  const handleExportJson = () => {
    try {
      const dataStr = telemetry.exportHistoryJson();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `voxplan_telemetry_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedbackMsg('Telemetry event log exported successfully.');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleClearHistory = async () => {
    await telemetry.clearHistory();
    dialogueManager.reset();
    setStats(telemetry.getStats(tasks));
    setShowConfirmClear(false);
    setFeedbackMsg('Behavioral telemetry history cleared. Active tasks preserved.');
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  const formatHours = (seconds) => {
    if (!seconds || seconds <= 0) return '0.0h';
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const maxWeekdayCount = Math.max(1, ...stats.weekdayCompletions.map((w) => w.count));

  return (
    <section id="behavior" ref={sectionRef} style={styles.section} aria-label="Behavioral Telemetry & Habit Insights">
      <div style={styles.container}>
        {/* Section Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>04</span>
              <span style={styles.badge}>BEHAVIORAL TELEMETRY & HABIT INSIGHTS</span>
            </div>
            <h2 style={styles.title}>
              HOW YOU <span className={`hl hl-lilac ${isVisible ? 'hl-sweep' : ''}`}>ACTUALLY</span> WORK
            </h2>
            <p className="behavioral-subtitle" style={styles.subtitle}>
              Transparent productivity metrics calculated directly from your local task timers and completion history
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              onClick={handleExportJson}
              style={styles.secondaryBtn}
              title="Download your complete raw behavioral event stream as JSON"
            >
              <span>📥 Export Event Log (.json)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmClear(true)}
              style={styles.dangerOutlineBtn}
              title="Permanently erase your behavioral history"
            >
              <span>🗑️ Clear History</span>
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedbackMsg && (
          <div style={styles.feedbackBanner}>
            <span>✓ {feedbackMsg}</span>
          </div>
        )}

        {/* Big 4 Pastel Metrics Cards */}
        <div style={styles.metricsGrid}>
          {/* Card 1: Completed Tasks */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #C9B6FF' }} className="digital-card">
            <span style={styles.metricName}>Completed Tasks</span>
            <span style={styles.metricValue}>{stats.totalCompletedCount}</span>
            <span style={styles.metricCaption}>
              {stats.trackedDurationCount} timed · {stats.selfReportedDurationCount} reported · {stats.unknownDurationCount} unmeasured
            </span>
          </div>

          {/* Card 2: Tracked Working Time */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #BFE8D0' }} className="digital-card">
            <span style={styles.metricName}>Focused Working Time</span>
            <span style={styles.metricValue}>{formatHours(stats.totalTrackedSeconds)}</span>
            <span style={styles.metricCaption}>
              accumulated across stopwatch timer sessions
            </span>
          </div>

          {/* Card 3: Estimation Accuracy */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #FFE58A' }} className="digital-card">
            <span style={styles.metricName}>Estimation Accuracy</span>
            <span style={styles.metricValue}>
              {stats.estimationInsight.sufficientData
                ? `${stats.estimationInsight.percentageVariance > 0 ? '+' : ''}${stats.estimationInsight.percentageVariance}%`
                : '—'}
            </span>
            <span style={styles.metricCaption}>
              {stats.estimationInsight.biasSummary}
            </span>
          </div>

          {/* Card 4: Schedule Adjustments */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #FF8F82' }} className="digital-card">
            <span style={styles.metricName}>Schedule Adjustments</span>
            <span style={styles.metricValue}>{stats.rescheduleCount}</span>
            <span style={styles.metricCaption}>
              {stats.postponementsCount} postponements · {stats.priorityChangeCount} priority shifts
            </span>
          </div>
        </div>

        {/* Lower Split: Weekday Distribution & Local Privacy Note */}
        <div style={styles.bottomGrid}>
          {/* Weekday Completion Frequency */}
          <div style={styles.chartPanel} className="digital-card">
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>COMPLETION RHYTHM BY WEEKDAY</span>
              <span style={styles.panelNote}>
                {stats.totalCompletedCount > 0 ? `${stats.totalCompletedCount} total completions` : 'Awaiting completed tasks'}
              </span>
            </div>

            <div style={styles.weekdayBarsRow}>
              {stats.weekdayCompletions.map((item) => {
                const heightPct = stats.totalCompletedCount > 0
                  ? Math.max(8, Math.round((item.count / maxWeekdayCount) * 100))
                  : 8;
                return (
                  <div key={item.day} style={styles.weekdayCol}>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          height: `${heightPct}%`,
                          backgroundColor: item.count > 0 ? '#C9B6FF' : 'rgba(37, 36, 42, 0.08)',
                        }}
                        title={`${item.day}: ${item.count} tasks completed`}
                      />
                    </div>
                    <span style={styles.dayLabel}>{item.day}</span>
                    <span style={styles.dayCount}>{item.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy & Methodology Card */}
          <div style={styles.privacyPanel} className="digital-card">
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>LOCAL-FIRST PRIVACY PROMISE</span>
              <span className="note-tag" style={{ color: '#166534' }}>
                100% on-device ✓
              </span>
            </div>

            <div style={styles.privacyContent}>
              <p style={styles.privacyText}>
                <strong>What VoxPlan records:</strong> Task lifecycle timestamps (when items are created, started, paused, rescheduled, and completed), stopwatch working seconds, and voluntary approximate estimates.
              </p>
              <p style={styles.privacyText}>
                <strong>Where it is stored:</strong> Stored locally in your browser’s private <strong>IndexedDB</strong> store (<code>voxplan_db</code>). No habits, timer logs, or task titles are uploaded to external tracking services.
              </p>
              <p style={styles.privacyText}>
                <strong>Evidence-based honesty:</strong> VoxPlan will never claim a productivity habit or estimation bias from 1–2 tasks. Habit insights require at least 3 completed observations.
              </p>
            </div>
          </div>
        </div>

        {/* Confirmation Modal for Clearing History */}
        {showConfirmClear && (
          <div style={styles.modalBackdrop} onClick={() => setShowConfirmClear(false)}>
            <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
              <h3 style={styles.modalTitle}>Clear Behavioral Telemetry History?</h3>
              <p style={styles.modalDesc}>
                This will permanently delete all recorded working timer intervals, lifecycle timestamps, and habit statistics from this browser.
                <br /><br />
                <strong>Your active tasks and saved to-dos will NOT be deleted.</strong>
              </p>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowConfirmClear(false)}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  style={styles.modalConfirmBtn}
                >
                  Yes, Clear Telemetry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '36px 0',
  },
  container: {
    backgroundColor: '#EBF4EE',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 4px 18px rgba(45, 106, 79, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    border: '1.5px solid rgba(45, 106, 79, 0.16)',
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
    color: '#1E1E22',
    letterSpacing: '0.01em',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#5E5B66',
    margin: 0,
    fontWeight: '500',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    padding: '9px 16px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  },
  dangerOutlineBtn: {
    backgroundColor: 'transparent',
    color: '#D9483B',
    border: '1px solid rgba(217, 72, 59, 0.3)',
    padding: '9px 16px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  feedbackBanner: {
    backgroundColor: '#EBF8F1',
    border: '1px solid #BFE8D0',
    color: '#166534',
    padding: '10px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '600',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
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
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '32px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  metricCaption: {
    fontSize: '12px',
    color: '#706D73',
    marginTop: '2px',
    lineHeight: 1.4,
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  chartPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '26px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
  },
  privacyPanel: {
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
    fontFamily: "var(--font-subheading, 'Unica One', cursive, sans-serif)",
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
  weekdayBarsRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: '140px',
    paddingTop: '20px',
  },
  weekdayCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    height: '100%',
    width: '32px',
  },
  barTrack: {
    flex: 1,
    width: '16px',
    backgroundColor: 'rgba(37, 36, 42, 0.04)',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: '9999px',
    transition: 'height 0.4s ease',
  },
  dayLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    color: '#4A4852',
  },
  dayCount: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#706D73',
  },
  privacyContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
    color: '#4A4852',
    lineHeight: 1.5,
  },
  privacyText: {
    margin: 0,
  },
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(37, 36, 42, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '28px',
    maxWidth: '440px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '20px',
    fontWeight: '400',
    color: '#25242A',
    margin: 0,
  },
  modalDesc: {
    fontSize: '13px',
    color: '#4A4852',
    margin: 0,
    lineHeight: 1.5,
  },
  modalActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '8px',
  },
  modalCancelBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.08)',
    color: '#25242A',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalConfirmBtn: {
    backgroundColor: '#D9483B',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};
