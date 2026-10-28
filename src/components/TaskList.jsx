import React, { useState, useEffect, useRef } from 'react';
import TaskCard from './TaskCard';
import MotifIcon from './MotifIcon';
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
  stickyNotesMap = {},
  onOpenStickyNotes,
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
            <p className="tasklist-subtitle" style={styles.subtitle}>
              Continuous machine learning delay-risk estimates mapped across active initiatives
            </p>
          </div>

          {/* Filter Pills and Action Row */}
          <div style={styles.headerActionsWrap}>
            <div
              id="task-filter-bar"
              className="task-filter-pills"
              style={styles.filterNav}
              role="group" aria-label="Task status filters"
            >
              {[
                { id: 'all', label: 'All Tasks', motifName: 'task-sheet' },
                { id: 'pending', label: 'Pending', motifName: 'clock' },
                { id: 'high-risk', label: 'High Risk Alarms', motifName: 'priority-urgent' },
                { id: 'completed', label: `Completed${completedCount > 0 ? ` (${completedCount})` : ''}`, motifName: 'check-circle' },
              ].map((f) => (
                <button
                  key={f.id}
                  id={`task-filter-${f.id}`}
                  data-filter={f.id}
                  type="button"
                  onClick={() => onChangeFilter(f.id)}
                  aria-pressed={activeFilter === f.id}
                  style={{
                    ...styles.filterBtn,
                    ...(activeFilter === f.id ? styles.activeFilterBtn : {}),
                  }}
                >
                  <MotifIcon name={f.motifName} size={14} style={{ marginRight: '6px' }} />
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
                  <MotifIcon name="trash" size={14} style={{ marginRight: '6px' }} />
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
                  <MotifIcon name="plus" size={13} style={{ marginRight: '4px' }} />
                  <span>New Task</span>
                  <MotifIcon name="arrow-down" size={12} style={{ marginLeft: '4px' }} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Clean Modern Cards Grid */}
        <div style={styles.notesGrid} className="task-notes-grid">
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
                stickyNotes={stickyNotesMap[task.id] || []}
                onOpenStickyNotes={onOpenStickyNotes}
              />
            );
          })}

          {filteredTasks.length === 0 && (
            <div style={styles.emptyCard}>
              <div style={styles.emptyEmoji}>
                <MotifIcon name={tasks.length === 0 ? 'sparkle' : 'celebrate'} size={32} color="#8E5FA8" />
              </div>
              <span style={{ ...styles.emptyAccentPhrase, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MotifIcon name="sparkle" size={13} color="#C85A32" />
                {tasks.length === 0 ? 'Fresh canvas awaits your vision' : 'Brilliant momentum · Keep the streak alive'}
              </span>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <MotifIcon name={tasks.length === 0 ? 'sparkle' : 'plus'} size={13} />
                    {tasks.length === 0 ? 'Create Your First Task' : 'Add task in Command Assistant'}
                  </span>
                  <MotifIcon name="arrow-down" size={13} style={{ marginLeft: '4px' }} />
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
    backgroundColor: '#F5F2EA',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 4px 16px rgba(61, 38, 69, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    border: '1.5px solid rgba(61, 38, 69, 0.10)',
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
  subtitle: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
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
  emptyAccentPhrase: {
    fontFamily: "var(--font-accent, 'Bigelow Rules', cursive)",
    fontSize: '22px',
    color: '#C85A32',
    letterSpacing: '0.04em',
    marginBottom: '2px',
  },
  emptyTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '20px',
    fontWeight: '400',
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
