import React from 'react';
import TaskCard from './TaskCard';

export default function TaskList({
  tasks,
  predictionsMap,
  activeFilter,
  onChangeFilter,
  onToggleComplete,
  onDelete,
  onUpdateTitle,
  onCyclePriority,
  onOpenExplanation,
}) {
  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === 'pending') return !task.completed;
    if (activeFilter === 'completed') return task.completed;
    if (activeFilter === 'high-risk') {
      const pred = predictionsMap[task.id];
      return !task.completed && pred && pred.risk === 'HIGH';
    }
    return true;
  });

  return (
    <section id="landscape" style={styles.section} aria-label="Risk Landscape">
      <div style={styles.container}>
        {/* Section Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>02</span>
              <span style={styles.badge}>ANALYTICAL OVERVIEW</span>
            </div>
            <h2 style={styles.title}>
              THE <span className="hl hl-peach">RISK</span> LANDSCAPE
            </h2>
            <p style={styles.subtitle}>
              Continuous machine learning delay-risk estimates mapped across active initiatives
            </p>
          </div>

          {/* Filter Pills */}
          <div style={styles.filterNav}>
            {[
              { id: 'all', label: 'All Tasks', emoji: '📝' },
              { id: 'pending', label: 'Pending', emoji: '⏳' },
              { id: 'high-risk', label: 'High Risk Alarms', emoji: '🚨' },
              { id: 'completed', label: 'Completed', emoji: '✨' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onChangeFilter(f.id)}
                style={{
                  ...styles.filterBtn,
                  ...(activeFilter === f.id ? styles.activeFilterBtn : {}),
                }}
              >
                <span>{f.emoji}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Clean Modern Cards Grid */}
        <div style={styles.notesGrid}>
          {filteredTasks.map((task, index) => (
            <TaskCard
              key={task.id}
              index={index}
              task={task}
              prediction={predictionsMap[task.id]}
              onToggleComplete={onToggleComplete}
              onDelete={onDelete}
              onUpdateTitle={onUpdateTitle}
              onCyclePriority={onCyclePriority}
              onOpenExplanation={onOpenExplanation}
            />
          ))}

          {filteredTasks.length === 0 && (
            <div style={styles.emptyCard}>
              <span style={styles.emptyEmoji}>🎉</span>
              <h4 style={styles.emptyTitle}>
                {activeFilter === 'high-risk'
                  ? 'No high-risk delay bottlenecks detected.'
                  : activeFilter === 'pending'
                  ? 'All tasks cleared for this sprint!'
                  : 'No task cards matching this filter.'}
              </h4>
              <p style={styles.emptyDesc}>
                Speak or type a command below to add your next initiative.
              </p>
            </div>
          )}
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
    backgroundColor: '#F3EEFF',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: '0 8px 24px rgba(201, 182, 255, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    border: '1px solid rgba(201, 182, 255, 0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
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
    color: '#6E56CF',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#5B44BA',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#706D73',
    margin: 0,
    fontWeight: '500',
  },
  filterNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    color: '#4A4852',
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  activeFilterBtn: {
    backgroundColor: '#25242A',
    borderColor: '#25242A',
    color: '#FFFFFF',
    boxShadow: '0 4px 12px rgba(37, 36, 42, 0.12)',
  },
  notesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },
  emptyCard: {
    gridColumn: '1 / -1',
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    padding: '48px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    border: '1px dashed rgba(37, 36, 42, 0.15)',
  },
  emptyEmoji: {
    fontSize: '36px',
  },
  emptyTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '700',
    color: '#25242A',
    margin: 0,
  },
  emptyDesc: {
    fontSize: '14px',
    color: '#706D73',
    margin: 0,
    maxWidth: '360px',
  },
};
