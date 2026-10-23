import React, { useState, useEffect, useRef } from 'react';
import TaskCard from './TaskCard';
import { estimateTaskDuration } from '../telemetry/personalModel';

export default function TaskList({
  tasks,
  predictionsMap,
  personalDurationModel,
  activeFilter,
  onChangeFilter,
  onToggleComplete,
  onDelete,
  onUpdateTitle,
  onCyclePriority,
  onReschedule,
  onReviseEffort,
  onOpenExplanation,
  onMoveUp,
  onMoveDown,
  activeTimerState,
  onStartTimer,
  onPauseTimer,
  onClearCompleted,
  completedCount = 0,
  onQuickAdd,
}) {
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
    <section id="landscape" ref={sectionRef} style={styles.section} aria-label="Risk Landscape">
      <div style={styles.container}>
        {/* Section Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>02</span>
              <span style={styles.badge}>ANALYTICAL OVERVIEW</span>
            </div>
            <h2 style={styles.title}>
              THE <span className={`hl hl-terracotta ${isVisible ? 'hl-sweep' : ''}`}>RISK</span> LANDSCAPE
            </h2>
            <p style={styles.subtitle}>
              Continuous machine learning delay-risk estimates mapped across active initiatives
            </p>
          </div>

          {/* Filter Pills and Action Row */}
          <div style={styles.headerActionsWrap}>
            <div style={styles.filterNav} role="group" aria-label="Task status filters">
              {[
                { id: 'all', label: 'All Tasks', emoji: '📝' },
                { id: 'pending', label: 'Pending', emoji: '⏳' },
                { id: 'high-risk', label: 'High Risk Alarms', emoji: '🚨' },
                { id: 'completed', label: `Completed${completedCount > 0 ? ` (${completedCount})` : ''}`, emoji: '✨' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onChangeFilter(f.id)}
                  aria-pressed={activeFilter === f.id}
                  style={{
                    ...styles.filterBtn,
                    ...(activeFilter === f.id ? styles.activeFilterBtn : {}),
                  }}
                >
                  <span aria-hidden="true">{f.emoji}</span>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>

            <div style={styles.filterActionsRow}>
              {activeFilter === 'completed' && completedCount > 0 && onClearCompleted && (
                <button
                  type="button"
                  id="tasklist-clear-completed-btn"
                  onClick={onClearCompleted}
                  style={styles.clearCompletedBtn}
                  title={`Clear all ${completedCount} completed task(s)`}
                  aria-label={`Clear all ${completedCount} completed task(s)`}
                >
                  <span>🗑️</span>
                  <span>Clear Completed ({completedCount})</span>
                </button>
              )}

              {onQuickAdd && (
                <button
                  type="button"
                  id="tasklist-quick-add-btn"
                  onClick={onQuickAdd}
                  style={styles.quickAddBtn}
                  title="Scroll to Command Assistant to add a new task"
                  aria-label="Add a new task via Command Assistant"
                >
                  <span>+</span>
                  <span>New Task ↓</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Clean Modern Cards Grid */}
        <div style={styles.notesGrid}>
          {filteredTasks.map((task, index) => {
            // Find global index in original tasks array for reordering
            const globalIndex = tasks.findIndex((t) => t.id === task.id);
            const canMoveUp = globalIndex > 0;
            const canMoveDown = globalIndex >= 0 && globalIndex < tasks.length - 1;

            const durationEstimate = estimateTaskDuration(personalDurationModel, task);

            return (
              <TaskCard
                key={task.id}
                index={index}
                task={task}
                prediction={predictionsMap[task.id]}
                durationEstimate={durationEstimate}
                onToggleComplete={onToggleComplete}
                onDelete={onDelete}
                onUpdateTitle={onUpdateTitle}
                onCyclePriority={onCyclePriority}
                onReschedule={onReschedule}
                onReviseEffort={onReviseEffort}
                onOpenExplanation={onOpenExplanation}
                parentVisible={isVisible}
                onMoveUp={onMoveUp ? () => onMoveUp(globalIndex) : null}
                onMoveDown={onMoveDown ? () => onMoveDown(globalIndex) : null}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                activeTimerState={activeTimerState}
                onStartTimer={onStartTimer}
                onPauseTimer={onPauseTimer}
              />
            );
          })}

          {filteredTasks.length === 0 && (
            <div style={styles.emptyCard}>
              <span style={styles.emptyEmoji}>{tasks.length === 0 ? '✨' : '🎉'}</span>
              <h4 style={styles.emptyTitle}>
                {tasks.length === 0
                  ? 'Your workspace is ready — no tasks created yet.'
                  : activeFilter === 'high-risk'
                  ? 'No high-risk delay bottlenecks detected.'
                  : activeFilter === 'completed'
                  ? 'No completed tasks yet.'
                  : activeFilter === 'pending'
                  ? 'All tasks cleared for this sprint!'
                  : 'No task cards matching this filter.'}
              </h4>
              <p style={styles.emptyDesc}>
                {tasks.length === 0
                  ? 'Speak or type your instructions into the command dock below. Try: "Create task Finalize roadmap due tomorrow with high priority" or click the microphone to dictate.'
                  : activeFilter === 'high-risk'
                  ? 'All active tasks are currently estimated at low or medium risk.'
                  : activeFilter === 'completed'
                  ? 'Complete active tasks to build your behavioral history and track accurate durations.'
                  : 'Speak or type a command below to add your next initiative.'}
              </p>
              {onQuickAdd && activeFilter !== 'completed' && (
                <button
                  type="button"
                  id="empty-state-add-task-btn"
                  onClick={onQuickAdd}
                  style={styles.emptyActionBtn}
                  title="Focus command dock to create a task"
                  aria-label="Create a task in the command dock"
                >
                  <span>{tasks.length === 0 ? '✦ Create Your First Task ↓' : '+ Add task in Command Assistant ↓'}</span>
                </button>
              )}
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
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 2px 10px rgba(30, 30, 34, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    border: '1px solid rgba(30, 30, 34, 0.08)',
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
    color: '#C85A32',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#5E5B66',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    color: '#3D2645',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#5E5B66',
    margin: 0,
    fontWeight: '500',
  },
  filterNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FAFAF7',
    border: '1px solid rgba(61, 38, 69, 0.1)',
    color: '#5E5B66',
    padding: '7px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  activeFilterBtn: {
    backgroundColor: '#201E23',
    borderColor: '#201E23',
    color: '#FFFFFF',
    boxShadow: '0 2px 6px rgba(32, 30, 35, 0.15)',
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
  headerActionsWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '10px',
  },
  filterActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  clearCompletedBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '9999px',
    border: '1px solid rgba(217, 72, 59, 0.3)',
    backgroundColor: 'rgba(255, 232, 229, 0.85)',
    color: '#991B1B',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  quickAddBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 14px',
    borderRadius: '9999px',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
  },
  emptyActionBtn: {
    marginTop: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 20px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 2px 8px rgba(200, 90, 50, 0.25)',
  },
};
