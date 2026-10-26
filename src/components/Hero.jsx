import React from 'react';
import { formatTaskDueDate } from '../conversation/compoundCommandParser';

export default function Hero({
  tasks = [],
  predictionsMap = {},
  modelMetadata: _modelMetadata,
  onScrollToSection: _onScrollToSection,
  onSelectView,
}) {
  const pendingTasks = (tasks || []).filter((t) => !t.completed);
  const hasRealTasks = pendingTasks.length > 0;

  // If real tasks exist, pick top 3 prioritizing high risk and high priority
  const displaySpotlight = hasRealTasks
    ? [...pendingTasks]
        .sort((a, b) => {
          const probA = predictionsMap[a.id]?.delay_probability ?? predictionsMap[a.id]?.probability ?? 0;
          const probB = predictionsMap[b.id]?.delay_probability ?? predictionsMap[b.id]?.probability ?? 0;
          if (probB !== probA) return probB - probA;
          const prioWeight = { critical: 4, high: 3, medium: 2, low: 1 };
          return (prioWeight[b.priority] || 2) - (prioWeight[a.priority] || 2);
        })
        .slice(0, 3)
    : [
        {
          id: 'demo-1',
          title: 'Revise Cryptography',
          category: 'SECURITY',
          priority: 'high',
          dueDate: 'today',
          estimatedEffort: 10,
          demoRisk: 96.4,
          demoTag: 'bottleneck ↗',
        },
        {
          id: 'demo-2',
          title: 'Practice Subnetting',
          category: 'NETWORKING',
          priority: 'medium',
          dueDate: 'today',
          estimatedEffort: 6,
          demoRisk: 54.2,
          demoTag: 'in progress →',
        },
        {
          id: 'demo-3',
          title: 'Study OSI Model',
          category: 'ARCHITECTURE',
          priority: 'low',
          dueDate: 'tomorrow',
          estimatedEffort: 3.5,
          demoRisk: 18.7,
          demoTag: 'on track ✓',
        },
      ];

  return (
    <section
      className="hero-section"
      style={styles.hero}
      aria-label="Hero"
    >
      <div style={styles.heroContainer} className="hero-container-card digital-card">
        <div style={styles.grid} className="hero-composition">
          {/* Left: Editorial Typography & Intent */}
          <div style={styles.leftColumn}>
            <div style={styles.eyebrowPill}>
              <span style={styles.eyebrowIcon}>✦</span>
              <span style={styles.eyebrowText}>PREDICTIVE TASK INTELLIGENCE</span>
            </div>

            <h1 className="hero-headline" style={styles.headline}>
              Plan with <span className="hl hl-terracotta" style={styles.headingAccentPlum}>clarity.</span><br />
              Act with <span className="hl hl-marigold" style={styles.headingAccent}>focus.</span>
            </h1>

            <div style={styles.tagline} className="hero-editorial-tagline">
              Predict what matters. Focus on what counts.
            </div>

            <p className="hero-statement" style={styles.statement}>
              VoxPlan turns daily tasks into structured timelines, using private local intelligence to highlight which initiatives are at risk before deadlines slip.
            </p>

            <div style={styles.ctaRow} className="ctaRow">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('today-focus-card') || document.getElementById('pulse');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={styles.primaryBtn}
              >
                <span>Today's Focus & Workload</span>
                <span>↓</span>
              </button>

              {onSelectView && (
                <button
                  type="button"
                  onClick={() => onSelectView('tasks')}
                  style={styles.secondaryBtn}
                >
                  Manage Backlog →
                </button>
              )}

              <span style={styles.noteTag}>
                Local-first · Offline reliable
              </span>
            </div>
          </div>

          {/* Right: Layered Preview / Live Focus Cards */}
          <div style={styles.rightColumn} className="hero-preview-cards">
            <div style={styles.previewHeader}>
              <span style={styles.previewTag}>
                {hasRealTasks ? '✦ SPRINT RISK SPOTLIGHT' : '✦ ILLUSTRATIVE PREVIEW'}
              </span>
              <span style={styles.previewSub}>
                {hasRealTasks ? 'Active initiatives' : 'Design demonstration'}
              </span>
            </div>

            {displaySpotlight.map((task) => {
              const pred = predictionsMap[task.id];
              const prob = pred ? (pred.delay_probability ?? pred.probability) : null;
              const riskPercent = prob !== null ? Math.round(prob * 100) : task.demoRisk;
              const isHigh = pred?.risk === 'HIGH' || (!pred && (riskPercent >= 70 || task.priority === 'critical' || task.priority === 'high'));
              const isMedium = pred?.risk === 'MEDIUM' || (!pred && riskPercent >= 40 && riskPercent < 70);

              const borderAccent = isHigh ? '#D9383A' : isMedium ? '#E5A83B' : '#2D6A4F';
              const textAccent = isHigh ? '#D9383A' : isMedium ? '#B45309' : '#2D6A4F';
              const formattedDue = task.dueDate ? formatTaskDueDate(task.dueDate) : 'No deadline';

              return (
                <div
                  key={task.id}
                  style={{
                    ...styles.cleanCard,
                    borderLeft: `4px solid ${borderAccent}`,
                  }}
                  className="hero-card-item digital-card"
                >
                  <div style={styles.cardHeader}>
                    <div style={styles.categoryWrap}>
                      <span style={styles.categoryLabel}>
                        {task.category ? task.category.toUpperCase() : 'GENERAL'}
                      </span>
                      <span
                        style={
                          isHigh
                            ? styles.priorityHighlightRisk
                            : isMedium
                            ? styles.priorityHighlightWarning
                            : styles.priorityHighlightSuccess
                        }
                      >
                        {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
                      </span>
                    </div>
                    <span style={{ color: textAccent, fontSize: '13px', fontWeight: '800' }}>
                      {riskPercent !== undefined && riskPercent !== null ? `${riskPercent}% risk` : 'Awaiting ML'}
                    </span>
                  </div>
                  <h3 style={styles.cardTitle}>{task.title}</h3>
                  <div style={styles.cardFooter}>
                    <span style={styles.cardDue}>
                      {formattedDue}
                      {task.estimatedEffort ? ` · ${task.estimatedEffort}h effort` : ''}
                    </span>
                    <span style={{ fontSize: '12px', color: textAccent, fontWeight: '600' }}>
                      {task.demoTag || (isHigh ? 'bottleneck ↗' : isMedium ? 'in progress →' : 'on track ✓')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}


const styles = {
  hero: {
    padding: '12px 0',
    position: 'relative',
  },
  heroContainer: {
    backgroundColor: '#FEF9E7',
    border: '1.5px solid rgba(229, 168, 59, 0.28)',
    borderRadius: '20px',
    padding: '36px 38px',
    boxShadow: '0 4px 18px rgba(229, 168, 59, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '48px',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  eyebrowPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(30, 30, 34, 0.08)',
    padding: '4px 12px',
    borderRadius: '8px',
    width: 'fit-content',
    boxShadow: '0 1px 4px rgba(30, 30, 34, 0.03)',
  },
  eyebrowIcon: {
    color: '#C85A32',
    fontSize: '11px',
  },
  eyebrowText: {
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#5E5B66',
  },
  headline: {
    fontFamily: "var(--font-hero, 'Shrikhand', Georgia, serif)",
    fontSize: 'clamp(32px, 4.5vw, 48px)',
    fontWeight: '400',
    lineHeight: '1.25',
    letterSpacing: '-0.01em',
    color: '#3D2645',
    margin: 0,
  },
  tagline: {
    fontFamily: "var(--font-tagline, 'Bigelow Rules', cursive)",
    fontSize: 'clamp(20px, 2.4vw, 28px)',
    fontWeight: '400',
    letterSpacing: '0.04em',
    color: '#8D4203',
    margin: '6px 0 12px 0',
    lineHeight: '1.3',
  },
  headingAccent: {
    fontFamily: "var(--font-hero-accent, 'Shadows Into Light', cursive)",
    color: '#B45309',
    fontSize: '1.18em',
    display: 'inline-block',
  },
  headingAccentPlum: {
    fontFamily: "var(--font-hero-accent, 'Shadows Into Light', cursive)",
    color: '#C85A32',
    fontSize: '1.18em',
    display: 'inline-block',
  },
  statement: {
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#5E5B66',
    maxWidth: '480px',
    margin: 0,
    fontWeight: '500',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    border: 'none',
    padding: '11px 22px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 3px 12px rgba(200, 90, 50, 0.28)',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    color: '#3D2645',
    border: '1.5px solid rgba(61, 38, 69, 0.15)',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  noteTag: {

    fontSize: '13px',
    color: '#7C7885',
    fontWeight: '600',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 4px',
  },
  previewTag: {
    fontFamily: "var(--font-subheading, 'Unica One', cursive)",
    fontSize: '13px',
    fontWeight: '700',
    color: '#7C7885',
    letterSpacing: '0.06em',
  },
  previewSub: {
    fontSize: '11px',
    color: '#9B98A3',
    fontWeight: '500',
  },
  cleanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(30, 30, 34, 0.04)',
    border: '1px solid rgba(30, 30, 34, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#7C7885',
    letterSpacing: '0.04em',
  },
  priorityHighlightRisk: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#FDF0ED',
    color: '#D9383A',
  },
  priorityHighlightWarning: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#FFF8E7',
    color: '#B45309',
  },
  priorityHighlightSuccess: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#EBF5EE',
    color: '#2D6A4F',
  },
  cardTitle: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '16px',
    fontWeight: '700',
    color: '#1E1E22',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '6px',
    borderTop: '1px solid rgba(30, 30, 34, 0.06)',
  },
  cardDue: {
    fontSize: '12px',
    color: '#7C7885',
    fontWeight: '500',
  },
};
