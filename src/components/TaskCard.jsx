import React, { useState, useEffect } from 'react';

function formatDueDate(dueDateStr) {
  if (!dueDateStr) return 'No deadline set';
  const parts = dueDateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diffTime = d.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      if (diffDays === 0) return 'Due today';
      if (diffDays === 1) return 'Due tomorrow';
      if (diffDays === -1) return 'Overdue by 1 day';
      if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)} days`;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `Due ${monthNames[month]} ${day}`;
    }
  }
  return `Due ${dueDateStr}`;
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
        accent: '#9B98A3',
        tagClass: 'hl',
        tagBg: 'rgba(37, 36, 42, 0.08)',
        textColor: '#706D73',
        circleBorder: '#9B98A3',
        riskText: '#706D73',
        noteTag: 'completed ✓',
      };
    }
    if (!prediction) {
      return {
        accent: '#E2E0E7',
        tagClass: 'hl',
        tagBg: 'rgba(37, 36, 42, 0.05)',
        textColor: '#706D73',
        circleBorder: '#9B98A3',
        riskText: '#706D73',
        noteTag: 'awaiting analysis ⏳',
      };
    }
    switch (riskCategory) {
      case 'HIGH':
        return {
          accent: '#FF8F82',
          tagClass: 'hl hl-coral',
          tagBg: 'rgba(255, 143, 130, 0.2)',
          textColor: '#D9483B',
          circleBorder: '#D9483B',
          riskText: '#D9483B',
          noteTag: 'high delay risk ↗',
        };
      case 'MEDIUM':
        return {
          accent: '#FFE58A',
          tagClass: 'hl hl-butter',
          tagBg: 'rgba(255, 229, 138, 0.25)',
          textColor: '#B45309',
          circleBorder: '#B45309',
          riskText: '#B45309',
          noteTag: 'medium priority ⚡',
        };
      case 'LOW':
      default:
        return {
          accent: '#BFE8D0',
          tagClass: 'hl hl-mint',
          tagBg: 'rgba(191, 232, 208, 0.25)',
          textColor: '#166534',
          circleBorder: '#166534',
          riskText: '#166534',
          noteTag: 'on schedule 🌱',
        };
    }
  };

  const theme = getTheme();

  return (
    <article
      data-risk={riskCategory || 'UNRATED'}
      style={{
        ...styles.card,
        borderTop: `4px solid ${theme.accent}`,
      }}
      className="digital-card task-card-item"
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title={prediction ? 'Click card to view prediction intelligence explanation' : 'Model prediction awaiting backend evaluation'}
    >
      {/* Top Meta Row */}
      <div style={styles.topRow}>
        <div style={styles.leftTags}>
          <span style={styles.categoryLabel}>{task.category ? task.category.toUpperCase() : 'GENERAL'}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority(task.id);
            }}
            className={theme.tagClass}
            style={styles.priorityBtn}
            title="Click to cycle priority"
          >
            {task.priority ? `${task.priority.toUpperCase()} PRIORITY` : 'MEDIUM PRIORITY'}
          </button>
        </div>

        <div style={styles.actionButtons}>
          {/* Manual Reordering Controls */}
          {canMoveUp && onMoveUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp(index);
              }}
              style={styles.reorderBtn}
              title="Move task up"
              aria-label="Move task up"
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
              style={styles.reorderBtn}
              title="Move task down"
              aria-label="Move task down"
            >
              ▼
            </button>
          )}

          {/* Custom modern checkbox */}
          <button
            type="button"
            onClick={handleCheckboxClick}
            style={{
              ...styles.checkbox,
              backgroundColor: task.completed ? '#25242A' : '#FFFFFF',
              borderColor: task.completed ? '#25242A' : 'rgba(37, 36, 42, 0.3)',
            }}
            title={task.completed ? 'Mark uncompleted' : 'Mark completed'}
            aria-label="Toggle task completion"
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
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            style={styles.deleteBtn}
            title="Delete task"
            aria-label="Delete task"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Task Title Area */}
      <div style={styles.titleArea}>
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
            />
            <button type="button" onClick={handleSaveTitle} style={styles.saveBtn}>
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
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={styles.titleDisplay}>
            <h3
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
              title="Edit title"
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
              autoFocus
            />
            <button
              type="button"
              onClick={() => confirmCompletionWithDuration('self_reported')}
              style={styles.saveDurationBtn}
              title="Save approximate working minutes"
            >
              Save mins
            </button>
            <button
              type="button"
              onClick={() => confirmCompletionWithDuration('unknown')}
              style={styles.skipDurationBtn}
              title="Leave duration as unmeasured"
            >
              Skip (Unknown)
            </button>
            <button
              type="button"
              onClick={() => setShowDurationPrompt(false)}
              style={styles.cancelDurationBtn}
              title="Cancel"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Middle Information: Due Date, Effort, & Timer Controls */}
      <div style={styles.middleMeta}>
        <div style={styles.dateEffortGroup}>
          {/* Due date display or editor */}
          {isRescheduling ? (
            <div style={styles.inlineEditGroup} onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                style={styles.datePickerInput}
              />
              <button type="button" onClick={handleSaveReschedule} style={styles.smallSaveBtn}>✓</button>
              <button type="button" onClick={() => setIsRescheduling(false)} style={styles.smallCancelBtn}>✕</button>
            </div>
          ) : (
            <span
              style={styles.dueDate}
              onClick={(e) => {
                e.stopPropagation();
                if (!task.completed) setIsRescheduling(true);
              }}
              title="Click to reschedule due date"
            >
              📅 {formatDueDate(task.dueDate)}
            </span>
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
              />
              <button type="button" onClick={handleSaveEffort} style={styles.smallSaveBtn}>✓</button>
              <button type="button" onClick={() => setIsEditingEffort(false)} style={styles.smallCancelBtn}>✕</button>
            </div>
          ) : task.estimatedEffort != null ? (
            <div
              style={styles.durationPillGroup}
              onClick={(e) => {
                e.stopPropagation();
                if (!task.completed) setIsEditingEffort(true);
              }}
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
                  <span style={styles.predictedDurationBadge}>
                    → ~{durationEstimate.predicted_duration_hours}h
                    <span style={styles.obsCountBadge} title={`Based on ${durationEstimate.eligible_observation_count} measured tasks`}>
                      ({durationEstimate.eligible_observation_count})
                    </span>
                  </span>
              )}
            </div>
          ) : !task.completed ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingEffort(true);
              }}
              style={styles.addEffortBtn}
              title="Set estimated effort to view personalized duration predictions"
            >
              + effort
            </button>
          ) : null}
        </div>

        {/* Stopwatch Timer Control Button */}
        {!task.completed && (
          <div style={styles.timerControlWrap} onClick={(e) => e.stopPropagation()}>
            {isTimerRunning ? (
              <button
                type="button"
                onClick={() => onPauseTimer && onPauseTimer(task.id)}
                style={styles.timerActiveBtn}
                title="Pause active stopwatch"
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
              >
                <span>▶ {formatDuration(liveSeconds)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStartTimer && onStartTimer(task.id)}
                style={styles.timerIdleBtn}
                title="Start working stopwatch for this task"
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
      <div style={styles.cardFooter}>
        <div style={styles.riskWrap}>
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
              <span style={{ ...styles.riskLabel, color: theme.textColor }}>
                {riskCategory} RISK
              </span>
              {prediction.is_personalized && prediction.personal_adjustment !== 0 && (
                <span
                  style={styles.personalPill}
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

        <span style={styles.explainHint}>
          {prediction ? 'view details →' : 'model offline'}
        </span>
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
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
    border: '1px solid rgba(37, 36, 42, 0.08)',
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
    color: '#25242A',
    cursor: 'pointer',
  },
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  reorderBtn: {
    background: 'rgba(37, 36, 42, 0.05)',
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
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
    fontWeight: '700',
    color: '#25242A',
    letterSpacing: '-0.02em',
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
    fontFamily: "'Syne', sans-serif",
    fontSize: '18px',
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
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
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
};
