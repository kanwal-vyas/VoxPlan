import React, { useState, useEffect, useCallback } from 'react';
import { formatTaskDueDate } from '../conversation/compoundCommandParser';
import TaskStickyTab from './stickyNotes/TaskStickyTab';

function formatDueDate(dueDateStr, referenceDate) {
  return formatTaskDueDate(dueDateStr, referenceDate);
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export default function TaskCard({
  index,
  task,
  prediction,
  durationEstimate,
  onToggleComplete,
  onDelete,
  onUpdateTitle,
  onCyclePriority,
  onReschedule,
  onReviseEffort,
  onOpenExplanation,
  parentVisible,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  activeTimerState,
  onStartTimer,
  onPauseTimer,
  stickyNotes = [],
  onOpenStickyNotes,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [displayRisk, setDisplayRisk] = useState(null);

  // Reschedule & Effort edit states
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(task.dueDate || '');
  const [isEditingEffort, setIsEditingEffort] = useState(false);
  const [effortInput, setEffortInput] = useState(task.estimatedEffort ?? '');

  // Completion duration dialog state
  const [showDurationPrompt, setShowDurationPrompt] = useState(false);
  const [selfReportedMins, setSelfReportedMins] = useState('');

  const isTimerForThisTask = Boolean(activeTimerState && activeTimerState.taskId === task.id);
  const isTimerRunning = Boolean(isTimerForThisTask && activeTimerState?.isRunning);
  const isTimerPaused = Boolean(isTimerForThisTask && !activeTimerState?.isRunning && (activeTimerState?.accumulatedSeconds || 0) > 0);

  const calcCurrentSeconds = useCallback(() => {
    if (!isTimerForThisTask || !activeTimerState) return 0;
    let total = activeTimerState.accumulatedSeconds || 0;
    if (activeTimerState.isRunning && activeTimerState.startedAt) {
      total += Math.max(0, (Date.now() - activeTimerState.startedAt) / 1000);
    }
    return Math.round(total);
  }, [isTimerForThisTask, activeTimerState]);

  const [liveSeconds, setLiveSeconds] = useState(calcCurrentSeconds);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setLiveSeconds(calcCurrentSeconds());
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, calcCurrentSeconds]);

  const prob = prediction ? (prediction.delay_probability ?? prediction.probability) : null;
  const targetPercent = prob !== null ? prob * 100 : null;
  const riskCategory = prediction ? prediction.risk : null;

  // Staggered count-up triggered on parent visibility when genuine prediction is available
  useEffect(() => {
    if (parentVisible && targetPercent !== null) {
      const delay = 100 + index * 120;
      const timer = setTimeout(() => {
        let step = 0;
        const interval = setInterval(() => {
          step += 1;
          const p = Math.min(1, step / 20);
          const ease = 1 - Math.pow(1 - p, 3);
          setDisplayRisk(Math.round(ease * targetPercent * 10) / 10);
          if (p >= 1) clearInterval(interval);
        }, 30);
        return () => clearInterval(interval);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [parentVisible, targetPercent, index]);

  const handleSaveTitle = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdateTitle(task.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleSaveReschedule = () => {
    if (onReschedule && rescheduleDate !== task.dueDate) {
      onReschedule(task.id, rescheduleDate || null);
    }
    setIsRescheduling(false);
  };

  const handleSaveEffort = () => {
    const num = parseFloat(effortInput);
    if (onReviseEffort && !isNaN(num) && num >= 0 && num !== task.estimatedEffort) {
      onReviseEffort(task.id, num);
    }
    setIsEditingEffort(false);
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    if (task.completed) {
      // Reopening task directly
      onToggleComplete(task.id);
      return;
    }

    // Completing uncompleted task
    if (isTimerForThisTask && liveSeconds > 0) {
      // Direct completion with tracked stopwatch time
      onToggleComplete(task.id, {
        durationSource: 'tracked',
        trackedDurationSeconds: liveSeconds,
      });
    } else {
      // Prompt for optional self-reported estimate (or skip as unknown)
      setShowDurationPrompt(true);
    }
  };

  const confirmCompletionWithDuration = (source) => {
    setShowDurationPrompt(false);
    if (source === 'self_reported') {
      const mins = parseFloat(selfReportedMins);
      const seconds = !isNaN(mins) && mins > 0 ? mins * 60 : null;
      onToggleComplete(task.id, {
        durationSource: seconds ? 'self_reported' : 'unknown',
        selfReportedDurationSeconds: seconds,
      });
    } else {
      onToggleComplete(task.id, { durationSource: 'unknown' });
    }
  };

  const getTheme = () => {
    if (task.completed) {
      return {
        accent: '#2D6A4F',
        tagClass: 'hl hl-sage',
        tagBg: 'rgba(45, 106, 79, 0.12)',
        textColor: '#2D6A4F',
        circleBorder: '#2D6A4F',
        riskText: '#2D6A4F',
        noteTag: 'completed ✓',
      };
    }
    if (!prediction) {
      return {
        accent: '#D4CEBC',
        tagClass: 'hl',
        tagBg: 'rgba(61, 38, 69, 0.05)',
        textColor: '#5E5B66',
        circleBorder: '#D4CEBC',
        riskText: '#5E5B66',
        noteTag: 'awaiting analysis ⏳',
      };
    }
    switch (riskCategory) {
      case 'HIGH':
        return {
          accent: '#D9383A',
          tagClass: 'hl hl-terracotta',
          tagBg: 'rgba(200, 90, 50, 0.16)',
          textColor: '#D9383A',
          circleBorder: '#D9383A',
          riskText: '#D9383A',
          noteTag: 'high delay risk ↗',
        };
      case 'MEDIUM':
        return {
          accent: '#E5A83B',
          tagClass: 'hl hl-marigold',
          tagBg: 'rgba(229, 168, 59, 0.22)',
          textColor: '#B45309',
          circleBorder: '#E5A83B',
          riskText: '#B45309',
          noteTag: 'medium priority ⚡',
        };
      case 'LOW':
      default:
        return {
          accent: '#2D6A4F',
          tagClass: 'hl hl-sage',
          tagBg: 'rgba(45, 106, 79, 0.14)',
          textColor: '#2D6A4F',
          circleBorder: '#2D6A4F',
          riskText: '#2D6A4F',
          noteTag: 'on schedule 🌱',
        };
    }
  };

  const theme = getTheme();

  return (
    <article
      id={index === 0 ? 'first-task-card' : undefined}
      data-task-id={task.id}
      data-risk={riskCategory || 'UNRATED'}
      style={{
        ...styles.card,
        borderTop: `4px solid ${theme.accent}`,
      }}
      className="digital-card task-card-item task-card"
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title={prediction ? 'Click card to view prediction intelligence explanation' : 'Model prediction awaiting backend evaluation'}
    >
      {/* Top Meta Row */}
      <div style={styles.topRow} className="task-card-top-row">
        <div style={styles.leftTags} className="task-card-left-tags">
          <span style={styles.categoryLabel} className="task-card-category">{task.category ? task.category.toUpperCase() : 'GENERAL'}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority(task.id);
            }}
            className={`task-card-priority-btn ${theme.tagClass}`}
            style={styles.priorityBtn}
            title="Click to cycle priority"
          >
            {task.priority ? `${task.priority.toUpperCase()} PRIORITY` : 'MEDIUM PRIORITY'}
          </button>
          <TaskStickyTab
            id={index === 0 ? 'first-task-sticky-trigger' : undefined}
            notes={stickyNotes}
            taskTitle={task.title}
            onOpen={() => onOpenStickyNotes && onOpenStickyNotes(task)}
          />
        </div>

        <div style={styles.actionButtons} className="task-card-action-buttons">
          {/* Manual Reordering Controls */}
          {canMoveUp && onMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp(index);
              }}
              className="task-card-reorder-btn"
              style={styles.reorderBtn}
              title={`Move "${task.title}" up`}
              aria-label={`Move task "${task.title}" up`}
            >
              ▲
            </button>
          )}
          {canMoveDown && onMoveDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown(index);
              }}
              className="task-card-reorder-btn"
              style={styles.reorderBtn}
              title={`Move "${task.title}" down`}
              aria-label={`Move task "${task.title}" down`}
            >
              ▼
            </button>
          )}

          {/* Custom modern checkbox */}
          <button
            type="button"
            className="task-checkbox-btn"
            onClick={handleCheckboxClick}
            style={{
              ...styles.checkbox,
              backgroundColor: task.completed ? '#2D6A4F' : '#FFFFFF',
              borderColor: task.completed ? '#2D6A4F' : 'rgba(61, 38, 69, 0.3)',
            }}
            title={task.completed ? `Mark "${task.title}" uncompleted` : `Mark "${task.title}" completed`}
            aria-label={task.completed ? `Mark "${task.title}" as incomplete` : `Mark "${task.title}" as complete`}
          >
            {task.completed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          {/* Delete button */}
          <button
            type="button"
            id={index === 0 ? 'first-task-delete-btn' : undefined}
            className="task-delete-btn"
            data-action="delete-task"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            style={styles.deleteBtn}
            title={`Delete "${task.title}" (with undo)`}
            aria-label={`Delete task "${task.title}"`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Task Title Area */}
      <div style={styles.titleArea} className="task-card-title-area">
        {isEditing ? (
          <div style={styles.editRow} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setEditTitle(task.title);
                  setIsEditing(false);
                }
              }}
              onBlur={handleSaveTitle}
              autoFocus
              style={styles.editInput}
              aria-label={`Edit title for "${task.title}"`}
            />
            <button
              type="button"
              onClick={handleSaveTitle}
              style={styles.saveBtn}
              aria-label={`Save title for "${task.title}"`}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditTitle(task.title);
                setIsEditing(false);
              }}
              style={styles.cancelBtn}
              aria-label={`Cancel editing title for "${task.title}"`}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={styles.titleDisplay}>
            <h3
              className="task-card-title"
              style={{
                ...styles.title,
                textDecoration: task.completed ? 'line-through' : 'none',
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {task.title}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              style={styles.editTrigger}
              title={`Edit title for "${task.title}"`}
              aria-label={`Edit title for "${task.title}"`}
            >
              ✎
            </button>
          </div>
        )}
      </div>

      {/* Optional Completion Duration Prompt Modal / Banner */}
      {showDurationPrompt && (
        <div style={styles.durationPromptBanner} onClick={(e) => e.stopPropagation()}>
          <div style={styles.durationPromptText}>
            <strong>Task complete!</strong> Log working time?
          </div>
          <div style={styles.durationInputRow}>
            <input
              type="number"
              min="1"
              max="1440"
              value={selfReportedMins}
              onChange={(e) => setSelfReportedMins(e.target.value)}
              placeholder="Mins (e.g. 45)"
              style={styles.durationInput}
              aria-label={`Self-reported working minutes for "${task.title}"`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => confirmCompletionWithDuration('self_reported')}
              style={styles.saveDurationBtn}
              title="Save approximate working minutes"
              aria-label={`Save self-reported minutes for "${task.title}"`}
            >
              Save mins
            </button>
            <button
              type="button"
              onClick={() => confirmCompletionWithDuration('unknown')}
              style={styles.skipDurationBtn}
              title="Leave duration as unmeasured"
              aria-label={`Skip duration logging for "${task.title}"`}
            >
              Skip (Unknown)
            </button>
            <button
              type="button"
              onClick={() => setShowDurationPrompt(false)}
              style={styles.cancelDurationBtn}
              title="Cancel"
              aria-label={`Cancel completion prompt for "${task.title}"`}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Middle Information: Due Date, Effort, & Timer Controls */}
      <div style={styles.middleMeta} className="task-card-middle-meta">
        <div style={styles.dateEffortGroup} className="task-card-date-effort">
          {/* Due date display or editor */}
          {isRescheduling ? (
            <div style={styles.inlineEditGroup} onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                style={styles.datePickerInput}
                aria-label={`New due date for "${task.title}"`}
              />
              <button
                type="button"
                onClick={handleSaveReschedule}
                style={styles.smallSaveBtn}
                aria-label={`Save new due date for "${task.title}"`}
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setIsRescheduling(false)}
                style={styles.smallCancelBtn}
                aria-label={`Cancel rescheduling for "${task.title}"`}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="task-card-due-btn"
              style={styles.dueDateBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (!task.completed) setIsRescheduling(true);
              }}
              title="Click to reschedule due date"
              aria-label={`Reschedule due date for "${task.title}". Current due date is ${formatDueDate(task.dueDate)}`}
            >
              📅 {formatDueDate(task.dueDate)}
            </button>
          )}

          {/* Effort estimate display or editor */}
          {isEditingEffort ? (
            <div style={styles.inlineEditGroup} onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                step="0.5"
                min="0"
                value={effortInput}
                onChange={(e) => setEffortInput(e.target.value)}
                placeholder="Hours"
                style={styles.effortNumberInput}
                aria-label={`Estimated effort in hours for "${task.title}"`}
              />
              <button
                type="button"
                onClick={handleSaveEffort}
                style={styles.smallSaveBtn}
                aria-label={`Save effort estimate for "${task.title}"`}
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setIsEditingEffort(false)}
                style={styles.smallCancelBtn}
                aria-label={`Cancel editing effort for "${task.title}"`}
              >
                ✕
              </button>
            </div>
          ) : task.estimatedEffort != null ? (
            <button
              type="button"
              className="task-card-effort-btn"
              style={styles.durationPillBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (!task.completed) setIsEditingEffort(true);
              }}
              aria-label={`Edit effort estimate for "${task.title}". Current effort is ${task.estimatedEffort} hours`}
              title={
                durationEstimate &&
                (durationEstimate.personalization_status === 'sparse' ||
                 durationEstimate.personalization_status === 'developing' ||
                 durationEstimate.personalization_status === 'supported')
                  ? `Estimate: ${task.estimatedEffort}h → Adjusted to ~${durationEstimate.predicted_duration_hours}h (${durationEstimate.explanation}) ${durationEstimate.uncertainty ? `[${durationEstimate.uncertainty.range_label}: ${durationEstimate.uncertainty.low_hours}h - ${durationEstimate.uncertainty.high_hours}h]` : ''}. Click to edit.`
                  : `Estimated effort: ${task.estimatedEffort}h · VoxPlan is learning your pace (requires measured completions). Click to edit.`
              }
            >
              <span style={styles.effortBadge}>
                ⏱️ {task.estimatedEffort}h
              </span>
              {durationEstimate &&
                (durationEstimate.personalization_status === 'sparse' ||
                 durationEstimate.personalization_status === 'developing' ||
                 durationEstimate.personalization_status === 'supported') &&
                durationEstimate.predicted_duration_hours !== null && (
                  <span style={styles.predictedDurationBadge} className="task-card-predicted-badge">
                    → ~{durationEstimate.predicted_duration_hours}h
                    <span style={styles.obsCountBadge} className="task-card-obs-badge" title={`Based on ${durationEstimate.eligible_observation_count} measured tasks`}>
                      ({durationEstimate.eligible_observation_count})
                    </span>
                  </span>
              )}
            </button>
          ) : !task.completed ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingEffort(true);
              }}
              className="task-card-effort-btn"
              style={styles.addEffortBtn}
              title="Set estimated effort to view personalized duration predictions"
              aria-label={`Add estimated effort for "${task.title}"`}
            >
              + effort
            </button>
          ) : null}
        </div>

        {/* Stopwatch Timer Control Button */}
        {!task.completed && (
          <div style={styles.timerControlWrap} className="task-card-timer-wrap" onClick={(e) => e.stopPropagation()}>
            {isTimerRunning ? (
              <button
                type="button"
                onClick={() => onPauseTimer && onPauseTimer(task.id)}
                style={styles.timerActiveBtn}
                title="Pause active stopwatch"
                aria-label={`Pause active stopwatch for "${task.title}". Elapsed: ${formatDuration(liveSeconds)}`}
              >
                <span style={styles.pulsingDot} />
                <span>⏸ {formatDuration(liveSeconds)}</span>
              </button>
            ) : isTimerPaused ? (
              <button
                type="button"
                onClick={() => onStartTimer && onStartTimer(task.id)}
                style={styles.timerPausedBtn}
                title="Resume working timer"
                aria-label={`Resume working stopwatch for "${task.title}". Elapsed: ${formatDuration(liveSeconds)}`}
              >
                <span>▶ {formatDuration(liveSeconds)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStartTimer && onStartTimer(task.id)}
                style={styles.timerIdleBtn}
                title="Start working stopwatch for this task"
                aria-label={`Start working stopwatch for "${task.title}"`}
              >
                <span>▶ Timer</span>
              </button>
            )}
          </div>
        )}

        {/* Completed Task Duration Label */}
        {task.completed && (task.trackedDurationSeconds || task.selfReportedDurationSeconds) && (
          <span style={styles.completedDurationBadge}>
            ⏱️ {formatDuration(task.trackedDurationSeconds || task.selfReportedDurationSeconds)}
          </span>
        )}
      </div>

      {/* Bottom Footer: Circled Risk Numeral with count-up */}
      <div style={styles.cardFooter} className="task-card-footer">
        <div style={styles.riskWrap} className="task-card-risk-wrap">
          {task.completed ? (
            <span style={styles.completedBadge}>Completed ✓</span>
          ) : prediction ? (
            <div style={styles.riskRow}>
              <span
                className="annotated-circle"
                style={{
                  color: theme.textColor,
                  fontSize: '14px',
                  fontWeight: '800',
                }}
              >
                {displayRisk != null ? `${displayRisk}%` : '...'}
              </span>
              <span style={{ ...styles.riskLabel, color: theme.textColor }} className="task-card-risk-label">
                {riskCategory} RISK
              </span>
              {prediction.is_personalized && prediction.personal_adjustment !== 0 && (
                <span
                  style={styles.personalPill}
                  className="task-card-personal-pill"
                  title={`Personalized: ${prediction.personal_adjustment > 0 ? '+' : ''}${Math.round(prediction.personal_adjustment * 100)}% adjustment from observed habits (Baseline: ${Math.round((prediction.baseline_delay_probability ?? prob) * 100)}%)`}
                >
                  {prediction.personal_adjustment > 0 ? `+${Math.round(prediction.personal_adjustment * 100)}%` : `${Math.round(prediction.personal_adjustment * 100)}%`}
                </span>
              )}
            </div>
          ) : (
            <div style={styles.pendingRow}>
              <span style={styles.pendingBadge}>Awaiting analysis</span>
            </div>
          )}
        </div>

        {prediction ? (
          <button
            type="button"
            className="task-card-explain-btn"
            style={styles.explainHintBtn}
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenExplanation) onOpenExplanation(task, prediction);
            }}
            aria-label={`View delay risk prediction explanation for "${task.title}"`}
          >
            view details →
          </button>
        ) : (
          <span style={styles.explainHint}>model offline</span>
        )}
      </div>
    </article>
  );
}

const styles = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '22px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 4px 16px rgba(61, 38, 69, 0.04)',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    cursor: 'pointer',
    position: 'relative',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftTags: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryLabel: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#706D73',
    letterSpacing: '0.06em',
  },
  priorityBtn: {
    border: 'none',
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    color: '#201E23',
    cursor: 'pointer',
  },
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  reorderBtn: {
    background: 'rgba(61, 38, 69, 0.05)',
    border: 'none',
    borderRadius: '4px',
    color: '#706D73',
    fontSize: '9px',
    width: '22px',
    height: '22px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: '26px',
    height: '26px',
    minWidth: '26px',
    minHeight: '26px',
    borderRadius: '6px',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.15s ease',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#706D73',
    cursor: 'pointer',
    fontSize: '15px',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
  },
  titleArea: {
    flex: 1,
  },
  titleDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  title: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '18px',
    fontWeight: '700',
    color: '#201E23',
    letterSpacing: '-0.01em',
    margin: 0,
    lineHeight: 1.25,
  },
  editTrigger: {
    background: 'transparent',
    border: 'none',
    color: '#706D73',
    cursor: 'pointer',
    fontSize: '12px',
    opacity: 0.5,
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  editInput: {
    flex: 1,
    backgroundColor: '#FFF8EF',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    color: '#25242A',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '17px',
    fontWeight: '700',
    padding: '4px 8px',
    outline: 'none',
  },
  saveBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  },
  cancelBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.1)',
    color: '#25242A',
    border: 'none',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  },
  durationPromptBanner: {
    backgroundColor: '#FFF9DB',
    border: '1px solid #FFE58A',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '12px',
  },
  durationPromptText: {
    color: '#78350F',
    fontWeight: '600',
  },
  durationInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  durationInput: {
    width: '100px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
    fontSize: '12px',
    outline: 'none',
  },
  saveDurationBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  skipDurationBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.08)',
    color: '#4A4852',
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  cancelDurationBtn: {
    background: 'transparent',
    border: 'none',
    color: '#706D73',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0 4px',
  },
  middleMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
    flexWrap: 'wrap',
    gap: '8px',
  },
  dateEffortGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dueDate: {
    fontSize: '12px',
    cursor: 'pointer',
  },
  inlineEditGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  datePickerInput: {
    fontSize: '11px',
    padding: '2px 4px',
    borderRadius: '4px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
  },
  effortNumberInput: {
    width: '54px',
    fontSize: '11px',
    padding: '2px 4px',
    borderRadius: '4px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
  },
  smallSaveBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '4px',
    fontSize: '10px',
    padding: '2px 5px',
    cursor: 'pointer',
  },
  smallCancelBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.1)',
    color: '#25242A',
    border: 'none',
    borderRadius: '4px',
    fontSize: '10px',
    padding: '2px 5px',
    cursor: 'pointer',
  },
  durationPillGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    flexWrap: 'wrap',
  },
  predictedDurationBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    color: '#6366F1',
    backgroundColor: '#EEF2FF',
    border: '1px solid #C7D2FE',
    padding: '2px 6px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    letterSpacing: '0.02em',
  },
  obsCountBadge: {
    fontSize: '9px',
    fontWeight: '600',
    color: '#818CF8',
  },
  effortBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '600',
    color: '#4A4852',
    backgroundColor: 'rgba(37, 36, 42, 0.05)',
    padding: '2px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  addEffortBtn: {
    border: '1px dashed rgba(37, 36, 42, 0.2)',
    background: 'transparent',
    color: '#706D73',
    borderRadius: '4px',
    fontSize: '10px',
    padding: '2px 6px',
    cursor: 'pointer',
  },
  timerControlWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  timerActiveBtn: {
    backgroundColor: '#FFEFEA',
    border: '1px solid #FF8F82',
    color: '#D9483B',
    borderRadius: '9999px',
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
  },
  pulsingDot: {
    width: '6px',
    height: '6px',
    backgroundColor: '#D9483B',
    borderRadius: '50%',
    display: 'inline-block',
  },
  timerPausedBtn: {
    backgroundColor: '#FFF9DB',
    border: '1px solid #FFE58A',
    color: '#B45309',
    borderRadius: '9999px',
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  timerIdleBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.05)',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    color: '#4A4852',
    borderRadius: '9999px',
    padding: '3px 9px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  completedDurationBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '600',
    color: '#27754E',
    backgroundColor: '#EBF8F1',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  pendingRow: {
    display: 'flex',
    alignItems: 'center',
  },
  pendingBadge: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '8px',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
  },
  riskWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  riskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  riskLabel: {
    fontFamily: "var(--font-compact, 'Unica One', sans-serif)",
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.06em',
  },
  completedBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#3EA370',
  },
  explainHint: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  personalPill: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '6px',
    backgroundColor: '#F3EEFF',
    color: '#5B44BA',
    border: '1px solid #C9B6FF',
    marginLeft: '4px',
    cursor: 'help',
  },
  dueDateBtn: {
    fontSize: '12px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    color: '#706D73',
    fontWeight: '500',
  },
  durationPillBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
  },
  explainHintBtn: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
