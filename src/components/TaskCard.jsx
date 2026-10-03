import React, { useState } from 'react';

export default function TaskCard({
  index,
  task,
  prediction,
  onToggleComplete,
  onDelete,
  onUpdateTitle,
  onCyclePriority,
  onOpenExplanation,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  const formattedIndex = String(index + 1).padStart(2, '0');

  const handleSave = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdateTitle(task.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = (e) => {
    if (e) e.stopPropagation();
    setEditTitle(task.title);
    setIsEditing(false);
  };

  const getPriorityTheme = (priority) => {
    switch (priority) {
      case 'high':
        return { label: 'HIGH PRIORITY', color: '#fb7185', bg: 'rgba(244, 63, 94, 0.1)' };
      case 'medium':
        return { label: 'MEDIUM PRIORITY', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' };
      case 'low':
      default:
        return { label: 'LOW PRIORITY', color: '#34d399', bg: 'rgba(16, 185, 129, 0.1)' };
    }
  };

  const priorityTheme = getPriorityTheme(task.priority);

  const prob = prediction ? prediction.probability : 0.5;
  const riskPercent = (prob * 100).toFixed(1);
  const riskCategory = prediction ? prediction.risk : 'MEDIUM';

  const getRiskTheme = (cat) => {
    switch (cat) {
      case 'HIGH':
        return { color: '#f43f5e', barColor: '#f43f5e', glow: 'rgba(244, 63, 94, 0.3)' };
      case 'MEDIUM':
        return { color: '#fbbf24', barColor: '#fbbf24', glow: 'rgba(251, 191, 36, 0.3)' };
      case 'LOW':
      default:
        return { color: '#34d399', barColor: '#34d399', glow: 'rgba(16, 185, 129, 0.3)' };
    }
  };

  const riskTheme = getRiskTheme(riskCategory);

  return (
    <article
      style={{
        ...styles.card,
        ...(task.completed ? styles.cardCompleted : {}),
      }}
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title="Click to view detailed ML delay risk explanation"
    >
      {/* Top Meta Line: Index, Category, Priority, Due Date */}
      <div style={styles.topRow}>
        <div style={styles.leftMeta}>
          <span style={styles.indexTag}>{formattedIndex}</span>
          <span style={styles.categoryTag}>{task.category || 'PRODUCTIVITY'}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority(task.id);
            }}
            style={{
              ...styles.priorityPill,
              color: priorityTheme.color,
              backgroundColor: priorityTheme.bg,
            }}
            title="Click to cycle priority"
          >
            {priorityTheme.label}
          </button>
        </div>

        <div style={styles.rightMeta}>
          <span style={styles.dueDate}>
            DUE {String(task.dueDate || 'OCT 7').toUpperCase()}
          </span>

          {/* Quick Action Icons */}
          <div style={styles.quickActions}>
            {/* Custom Checkbox */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleComplete(task.id);
              }}
              style={{
                ...styles.checkbox,
                ...(task.completed ? styles.checkboxChecked : {}),
              }}
              title={task.completed ? 'Mark pending' : 'Mark completed'}
              aria-label={`Mark ${task.title} as completed`}
            >
              {task.completed && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Row: Task Title & Visual Dominant Risk Numeral */}
      <div style={styles.mainRow}>
        {/* Title / Inline Edit */}
        <div style={styles.titleArea}>
          {isEditing ? (
            <div style={styles.editContainer} onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel(e);
                }}
                onBlur={handleSave}
                autoFocus
                style={styles.editInput}
              />
              <button type="button" onClick={handleSave} style={styles.editSaveBtn}>
                ✓
              </button>
              <button type="button" onClick={handleCancel} style={styles.editCancelBtn}>
                ×
              </button>
            </div>
          ) : (
            <div style={styles.titleDisplayRow}>
              <h3
                style={{
                  ...styles.title,
                  ...(task.completed ? styles.titleCompleted : {}),
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
                style={styles.editTriggerBtn}
                title="Edit title"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Visually Dominant Risk Block */}
        <div style={styles.riskBlock}>
          {task.completed ? (
            <span style={styles.completedTag}>COMPLETED</span>
          ) : prediction ? (
            <div style={styles.riskDisplay}>
              <span style={{ ...styles.riskBigPercent, color: riskTheme.color }}>
                {riskPercent}%
              </span>
              <span style={{ ...styles.riskCategoryLabel, color: riskTheme.color }}>
                {riskCategory} RISK
              </span>
            </div>
          ) : (
            <span style={styles.evaluatingTag}>PREDICTING...</span>
          )}
        </div>
      </div>

      {/* Thin Animated Landscape Risk Bar */}
      {!task.completed && (
        <div style={styles.riskBarTrack}>
          <div
            style={{
              ...styles.riskBarFill,
              width: `${Math.max(4, prob * 100)}%`,
              backgroundColor: riskTheme.barColor,
              boxShadow: `0 0 10px ${riskTheme.glow}`,
            }}
          />
        </div>
      )}
    </article>
  );
}

const styles = {
  card: {
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s ease, padding 0.2s ease',
  },
  cardCompleted: {
    opacity: 0.55,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  leftMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  indexTag: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#7c5cfc',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.05em',
  },
  categoryTag: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  priorityPill: {
    fontSize: '9px',
    fontWeight: '800',
    letterSpacing: '0.1em',
    padding: '2px 8px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  },
  rightMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  dueDate: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.06em',
  },
  quickActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    borderRadius: '5px',
    border: '1.5px solid rgba(255, 255, 255, 0.3)',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.15s ease',
  },
  checkboxChecked: {
    backgroundColor: '#7c5cfc',
    borderColor: '#7c5cfc',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#5e6473',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '24px',
    flexWrap: 'wrap',
  },
  titleArea: {
    flex: 1,
    minWidth: '240px',
  },
  titleDisplayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px',
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.2,
  },
  titleCompleted: {
    textDecoration: 'line-through',
    color: '#5e6473',
  },
  editTriggerBtn: {
    background: 'transparent',
    border: 'none',
    color: '#5e6473',
    cursor: 'pointer',
    padding: '2px',
    opacity: 0.6,
  },
  editContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  editInput: {
    backgroundColor: '#11141e',
    border: '1px solid #7c5cfc',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: '600',
    fontFamily: "'Syne', sans-serif",
    padding: '4px 10px',
    outline: 'none',
    width: '100%',
    maxWidth: '340px',
  },
  editSaveBtn: {
    backgroundColor: '#7c5cfc',
    border: 'none',
    color: '#ffffff',
    borderRadius: '4px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  editCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#9da3b4',
    borderRadius: '4px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '15px',
  },
  riskBlock: {
    display: 'flex',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  riskDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  riskBigPercent: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  riskCategoryLabel: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.12em',
    fontFamily: "'JetBrains Mono', monospace",
  },
  completedTag: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#34d399',
    fontFamily: "'JetBrains Mono', monospace",
  },
  evaluatingTag: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#868b98',
    fontFamily: "'JetBrains Mono', monospace",
  },
  riskBarTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '1px',
    overflow: 'hidden',
    marginTop: '2px',
  },
  riskBarFill: {
    height: '100%',
    borderRadius: '1px',
    transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
  },
};
