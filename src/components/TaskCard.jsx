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

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high':
        return 'High Priority';
      case 'medium':
        return 'Medium Priority';
      case 'low':
      default:
        return 'Low Priority';
    }
  };

  const prob = prediction ? prediction.probability : 0.5;
  const riskPercent = (prob * 100).toFixed(1);
  const riskCategory = prediction ? prediction.risk : 'MEDIUM';

  const getRiskColor = (cat) => {
    switch (cat) {
      case 'HIGH':
        return '#e5484d';
      case 'MEDIUM':
        return '#e5983b';
      case 'LOW':
      default:
        return '#3ea370';
    }
  };

  const riskColor = getRiskColor(riskCategory);

  return (
    <article
      style={{
        ...styles.row,
        ...(task.completed ? styles.rowCompleted : {}),
      }}
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title="Click to view model explanation"
    >
      {/* Top Metadata Row */}
      <div style={styles.topMeta}>
        <div style={styles.leftMeta}>
          <span style={styles.indexNum}>{formattedIndex}</span>
          <span style={styles.metaDivider}>/</span>
          <span style={styles.category}>{task.category || 'Productivity'}</span>
          <span style={styles.metaDot}>·</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority(task.id);
            }}
            style={styles.priorityBtn}
            title="Click to change priority"
          >
            {getPriorityLabel(task.priority)}
          </button>
        </div>

        <div style={styles.rightMeta}>
          <span style={styles.dueDate}>Due {task.dueDate || 'Oct 7'}</span>

          <div style={styles.actionIcons}>
            {/* Minimal Square Checkbox */}
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
              title={task.completed ? 'Mark as pending' : 'Mark as complete'}
              aria-label={`Mark ${task.title} as completed`}
            >
              {task.completed && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f6f5f2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Row: Task Title & Visual Dominant Risk Numeral */}
      <div style={styles.mainContent}>
        <div style={styles.titleArea}>
          {isEditing ? (
            <div style={styles.editGroup} onClick={(e) => e.stopPropagation()}>
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
              <button type="button" onClick={handleSave} style={styles.editBtn}>
                ✓
              </button>
              <button type="button" onClick={handleCancel} style={styles.editCancelBtn}>
                ✕
              </button>
            </div>
          ) : (
            <div style={styles.titleDisplay}>
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
                style={styles.editIconBtn}
                title="Edit title"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Visually Dominant Risk % */}
        <div style={styles.riskArea}>
          {task.completed ? (
            <span style={styles.completedTag}>Completed</span>
          ) : prediction ? (
            <div style={styles.riskDisplay}>
              <span style={{ ...styles.riskNumeral, color: riskColor }}>
                {riskPercent}%
              </span>
              <span style={{ ...styles.riskLabel, color: riskColor }}>
                {riskCategory} RISK
              </span>
            </div>
          ) : (
            <span style={styles.evaluatingTag}>Estimating...</span>
          )}
        </div>
      </div>

      {/* Extremely Thin Restrained Risk Bar */}
      {!task.completed && (
        <div style={styles.riskTrack}>
          <div
            style={{
              ...styles.riskFill,
              width: `${Math.max(3, prob * 100)}%`,
              backgroundColor: riskColor,
            }}
          />
        </div>
      )}
    </article>
  );
}

const styles = {
  row: {
    padding: '24px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.15s ease',
  },
  rowCompleted: {
    opacity: 0.45,
  },
  topMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  leftMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  indexNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '600',
    color: '#7c66dc',
  },
  metaDivider: {
    color: '#42444b',
    fontSize: '11px',
  },
  category: {
    fontSize: '12px',
    color: '#9c9da3',
    fontWeight: '500',
  },
  metaDot: {
    color: '#42444b',
    fontSize: '11px',
  },
  priorityBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '12px',
    fontWeight: '500',
    color: '#9c9da3',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
    textDecorationColor: 'rgba(255, 255, 255, 0.15)',
    textUnderlineOffset: '3px',
  },
  rightMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  dueDate: {
    fontSize: '12px',
    color: '#9c9da3',
    fontWeight: '400',
  },
  actionIcons: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  checkboxChecked: {
    backgroundColor: '#7c66dc',
    borderColor: '#7c66dc',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#5e6068',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '24px',
    flexWrap: 'wrap',
  },
  titleArea: {
    flex: 1,
    minWidth: '260px',
  },
  titleDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px',
    fontWeight: '700',
    color: '#f6f5f2',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.25,
    textTransform: 'uppercase',
  },
  titleCompleted: {
    textDecoration: 'line-through',
    color: '#5e6068',
  },
  editIconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#5e6068',
    cursor: 'pointer',
    padding: '2px',
    opacity: 0.5,
  },
  editGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  editInput: {
    backgroundColor: '#111216',
    border: '1px solid #7c66dc',
    borderRadius: '4px',
    color: '#f6f5f2',
    fontSize: '18px',
    fontWeight: '700',
    fontFamily: "'Syne', sans-serif",
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
    maxWidth: '360px',
  },
  editBtn: {
    backgroundColor: '#7c66dc',
    border: 'none',
    color: '#f6f5f2',
    borderRadius: '3px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  },
  editCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: 'none',
    color: '#9c9da3',
    borderRadius: '3px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  },
  riskArea: {
    display: 'flex',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  riskDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  riskNumeral: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '26px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  riskLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.08em',
  },
  completedTag: {
    fontSize: '12px',
    color: '#3ea370',
    fontWeight: '500',
  },
  evaluatingTag: {
    fontSize: '12px',
    color: '#5e6068',
  },
  riskTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
    marginTop: '4px',
  },
  riskFill: {
    height: '100%',
    transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  },
};
