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
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.titleGroup}>
          <div style={styles.titleWithIndex}>
            <span style={styles.sectionIndex}>02</span>
            <h2 style={styles.sectionTitle}>Risk Landscape</h2>
          </div>
          <p style={styles.sectionSubtitle}>
            Delay-risk estimates computed from deadline proximity, workload density, and task complexity
          </p>
        </div>

        {/* Minimal Editorial Filter Navigation */}
        <div style={styles.filterNav}>
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'high-risk', label: 'High Risk' },
            { id: 'completed', label: 'Completed' },
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
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task Index Sequence */}
      <div style={styles.sequence}>
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
          <div style={styles.emptyState}>
            <h4 style={styles.emptyTitle}>
              {activeFilter === 'high-risk'
                ? 'No high-risk tasks detected'
                : activeFilter === 'pending'
                ? 'All tasks completed'
                : activeFilter === 'completed'
                ? 'No completed tasks yet'
                : 'No tasks in sprint'}
            </h4>
            <p style={styles.emptyDesc}>
              {activeFilter === 'high-risk'
                ? 'All active tasks are currently estimated within safe delivery parameters.'
                : 'Add a new task using the command center below.'}
            </p>
          </div>
        )}
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
    gap: '36px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '24px',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  titleWithIndex: {
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
  sectionSubtitle: {
    fontSize: '14px',
    color: '#9c9da3',
    margin: 0,
    maxWidth: '520px',
    lineHeight: 1.5,
  },
  filterNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#9c9da3',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  activeFilterBtn: {
    color: '#f6f5f2',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
  },
  sequence: {
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    padding: '64px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  emptyTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
    fontWeight: '700',
    color: '#f6f5f2',
    margin: 0,
  },
  emptyDesc: {
    fontSize: '14px',
    color: '#5e6068',
    margin: 0,
    maxWidth: '380px',
    lineHeight: 1.5,
  },
};
