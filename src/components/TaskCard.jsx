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

export default function TaskCard({
  index,
  task,
  prediction,
  onToggleComplete,
  onDelete,
  onUpdateTitle,
  onCyclePriority,
  onOpenExplanation,
  parentVisible,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [displayRisk, setDisplayRisk] = useState(null);

  const prob = prediction ? prediction.probability : null;
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
        <div style={styles.dateEffortGroup}>
          <span style={styles.dueDate}>📅 {formatDueDate(task.dueDate)}</span>
          {task.estimatedEffort != null && (
            <span style={styles.effortBadge}>⏱️ {task.estimatedEffort}h</span>
          )}
        </div>
        <span className="note-tag" style={{ color: theme.textColor }}>
          {theme.noteTag}
        </span>
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
  middleMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
  dateEffortGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  effortBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '600',
    color: '#4A4852',
    backgroundColor: 'rgba(37, 36, 42, 0.05)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  dueDate: {
    fontSize: '12px',
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
};
