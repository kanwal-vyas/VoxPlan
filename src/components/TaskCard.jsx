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

  const prob = prediction ? prediction.probability : 0.5;
  const riskPercent = (prob * 100).toFixed(1);
  const riskCategory = prediction ? prediction.risk : 'MEDIUM';

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
      style={{
        ...styles.card,
        borderTop: `4px solid ${theme.accent}`,
        opacity: task.completed ? 0.6 : 1,
      }}
      className="digital-card"
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title="Click card to view prediction intelligence explanation"
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
          {/* Custom modern checkbox */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(task.id);
            }}
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
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel(e);
              }}
              onBlur={handleSave}
              autoFocus
              style={styles.editInput}
            />
            <button type="button" onClick={handleSave} style={styles.saveBtn}>
              ✓
            </button>
            <button type="button" onClick={handleCancel} style={styles.cancelBtn}>
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

      {/* Middle Information */}
      <div style={styles.middleMeta}>
        <span style={styles.dueDate}>📅 Due {task.dueDate || 'Soon'}</span>
        <span className="note-tag" style={{ color: theme.textColor }}>
          {theme.noteTag}
        </span>
      </div>

      {/* Bottom Footer: Circled Risk Numeral & Explanation Hint */}
      <div style={styles.cardFooter}>
        <div style={styles.riskWrap}>
          {task.completed ? (
            <span style={styles.completedBadge}>Completed</span>
          ) : (
            <div style={styles.riskRow}>
              <span
                className="annotated-circle"
                style={{
                  color: theme.textColor,
                  fontSize: '14px',
                  fontWeight: '800',
                }}
              >
                {riskPercent}%
              </span>
              <span style={{ ...styles.riskLabel, color: theme.textColor }}>
                {riskCategory} RISK
              </span>
            </div>
          )}
        </div>

        <span style={styles.explainHint}>view details →</span>
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
  checkbox: {
    width: '20px',
    height: '20px',
    borderRadius: '5px',
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
    fontSize: '13px',
    padding: '2px',
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
  middleMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  dueDate: {
    fontSize: '12px',
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
};
