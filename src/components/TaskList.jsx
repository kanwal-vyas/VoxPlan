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
    <section id="landscape" style={styles.section} aria-label="Risk landscape">
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <div style={styles.titleGroup}>
          <span style={styles.sectionIndex}>02 / CENTERPIECE</span>
          <h2 style={styles.sectionTitle}>Risk Landscape</h2>
          <p style={styles.sectionSubtitle}>
            Continuous machine learning delay-risk estimates mapped across active sprint initiatives
          </p>
        </div>

        {/* Filter Navigation */}
        <div style={styles.filterNav}>
          {[
            { id: 'all', label: 'ALL TASKS' },
            { id: 'pending', label: 'PENDING' },
            { id: 'high-risk', label: 'HIGH RISK' },
            { id: 'completed', label: 'COMPLETED' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChangeFilter(f.id)}
              style={{
                ...styles.filterBtn,
                ...(activeFilter === f.id ? styles.activeFilterBtn : {}),
                ...(f.id === 'high-risk' && activeFilter === f.id ? styles.activeHighRiskFilter : {}),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task Vertical Sequence */}
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
            <span style={styles.emptyIndex}>[ EMPTY STATE ]</span>
            <h4 style={styles.emptyTitle}>
              {activeFilter === 'high-risk'
                ? 'No High-Risk Anomalies Detected'
                : activeFilter === 'pending'
                ? 'All Tasks Cleared'
                : activeFilter === 'completed'
                ? 'No Tasks Completed Yet'
                : 'No Tasks in Sequence'}
            </h4>
            <p style={styles.emptyDesc}>
              {activeFilter === 'high-risk'
                ? 'All active tasks are currently estimated within safe delivery parameters.'
                : 'Speak or type a command above (e.g. "add task Infrastructure Review") to begin.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '30px 0 40px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    paddingBottom: '52px',
  },
  sectionHeader: {
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
  sectionSubtitle: {
    fontSize: '14px',
    color: '#868b98',
    margin: 0,
    maxWidth: '540px',
  },
  filterNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#868b98',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  activeFilterBtn: {
    borderColor: '#7c5cfc',
    backgroundColor: 'rgba(124, 92, 252, 0.14)',
    color: '#ffffff',
  },
  activeHighRiskFilter: {
    borderColor: '#f43f5e',
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
    color: '#fb7185',
  },
  sequence: {
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    padding: '60px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  emptyIndex: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '700',
    color: '#ffffff',
    margin: 0,
  },
  emptyDesc: {
    fontSize: '13px',
    color: '#5e6473',
    margin: 0,
    maxWidth: '380px',
  },
};
