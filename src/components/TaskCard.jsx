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
        bg: '#F5F4F7',
        border: '#DCD9E3',
        tagBg: '#E4E2EB',
        tagText: '#706D73',
        riskBg: '#E4E2EB',
        riskText: '#706D73',
        emoji: '✓',
        moodText: 'Done!',
      };
    }
    switch (riskCategory) {
      case 'HIGH':
        return {
          bg: '#FFEFEA',
          border: '#FF8F82',
          tagBg: '#FF8F82',
          tagText: '#FFFFFF',
          riskBg: '#FFE0DC',
          riskText: '#C92A1D',
          emoji: '🚨',
          moodText: 'Uh oh...',
        };
      case 'MEDIUM':
        return {
          bg: '#FFF9DB',
          border: '#F59E0B',
          tagBg: '#FFE58A',
          tagText: '#92400E',
          riskBg: '#FEF3C7',
          riskText: '#B45309',
          emoji: '⚡',
          moodText: 'Could be okay',
        };
      case 'LOW':
      default:
        return {
          bg: '#EBF8F1',
          border: '#3EA370',
          tagBg: '#BFE8D0',
          tagText: '#166534',
          riskBg: '#D1FAE5',
          riskText: '#065F46',
          emoji: '🌱',
          moodText: 'Looking good',
        };
    }
  };

  const theme = getTheme();
  const tiltClass = index % 3 === 0 ? 'note-tilt-left' : index % 3 === 1 ? 'note-tilt-right' : 'note-tilt-slight';

  return (
    <article
      style={{
        ...styles.card,
        backgroundColor: theme.bg,
        border: `2px solid ${theme.border}`,
        opacity: task.completed ? 0.65 : 1,
      }}
      className={tiltClass}
      onClick={() => {
        if (!isEditing && onOpenExplanation && prediction) {
          onOpenExplanation(task, prediction);
        }
      }}
      title="Click sticky note to view smart explanation"
    >
      {/* Decorative Tape on top */}
      <div className="tape-top" />

      {/* Top Meta Bar */}
      <div style={styles.topRow}>
        <div style={styles.leftTags}>
          <span style={styles.moodLabel}>{theme.moodText}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority(task.id);
            }}
            style={{
              ...styles.priorityBadge,
              backgroundColor: theme.tagBg,
              color: theme.tagText,
            }}
            title="Click to cycle priority"
          >
            {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
          </button>
        </div>

        <div style={styles.actionButtons}>
          {/* Custom playful checkbox */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(task.id);
            }}
            style={{
              ...styles.checkbox,
              backgroundColor: task.completed ? '#3EA370' : '#FFFFFF',
              borderColor: task.completed ? '#3EA370' : '#25242A',
            }}
            title={task.completed ? 'Mark uncompleted' : 'Mark completed'}
            aria-label="Toggle task completed"
          >
            {task.completed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          {/* Delete icon */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            style={styles.deleteBtn}
            title="Delete sticky note"
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

      {/* Due Date & Category Note */}
      <div style={styles.middleMeta}>
        <span style={styles.categoryPill}>🏷️ {task.category || 'General'}</span>
        <span style={styles.dueDate}>📅 Due {task.dueDate || 'Soon'}</span>
      </div>

      {/* Bottom Risk Callout */}
      <div style={styles.cardFooter}>
        <div style={{ ...styles.riskCallout, backgroundColor: theme.riskBg, color: theme.riskText }}>
          <span style={styles.riskEmoji}>{theme.emoji}</span>
          <span style={styles.riskPercent}>{task.completed ? 'Completed' : `${riskPercent}% risk`}</span>
        </div>
        <span style={styles.clickHint}>tap for insights →</span>
      </div>
    </article>
  );
}

const styles = {
  card: {
    borderRadius: '18px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    position: 'relative',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(37, 36, 42, 0.06)',
    userSelect: 'none',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  leftTags: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  moodLabel: {
    fontFamily: "'Caveat', cursive",
    fontSize: '20px',
    fontWeight: '700',
    color: '#4A4852',
  },
  priorityBadge: {
    border: 'none',
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    padding: '3px 8px',
    borderRadius: '9999px',
    cursor: 'pointer',
  },
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  checkbox: {
    width: '22px',
    height: '22px',
    borderRadius: '6px',
    border: '2px solid',
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
    fontSize: '14px',
    padding: '4px',
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
    fontSize: '22px',
    fontWeight: '800',
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
    fontSize: '13px',
    opacity: 0.6,
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  editInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    border: '2px solid #25242A',
    borderRadius: '8px',
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
    width: '26px',
    height: '26px',
    cursor: 'pointer',
  },
  cancelBtn: {
    backgroundColor: 'rgba(37, 36, 42, 0.1)',
    color: '#25242A',
    border: 'none',
    borderRadius: '6px',
    width: '26px',
    height: '26px',
    cursor: 'pointer',
  },
  middleMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '600',
  },
  categoryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  dueDate: {
    fontSize: '12px',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '10px',
    borderTop: '1.5px dashed rgba(37, 36, 42, 0.12)',
  },
  riskCallout: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '800',
  },
  riskEmoji: {
    fontSize: '14px',
  },
  riskPercent: {
    letterSpacing: '-0.01em',
  },
  clickHint: {
    fontFamily: "'Caveat', cursive",
    fontSize: '16px',
    color: '#706D73',
    fontWeight: '600',
  },
};
