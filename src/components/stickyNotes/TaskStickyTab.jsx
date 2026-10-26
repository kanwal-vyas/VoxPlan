import React from 'react';
import { getStationeryById } from './stationeryCatalog.js';

/**
 * TaskStickyTab Component
 *
 * An illustrated stationery tab that peeks out from task cards and calendar items.
 * Serves as the primary visual indicator that notes exist for a task.
 *
 * @param {object} props
 * @param {object[]} [props.notes=[]] Array of sticky notes attached to the task
 * @param {string} props.taskTitle Title of the parent task
 * @param {Function} props.onOpen Callback to open sticky notes modal
 * @param {boolean} [props.compact=false] Compact version for calendar chips or small displays
 * @param {boolean} [props.showAddPrompt=true] When notes is empty, show discreet + Note trigger
 */
export default function TaskStickyTab({
  notes = [],
  taskTitle = '',
  onOpen,
  compact = false,
  showAddPrompt = true,
}) {
  const noteCount = Array.isArray(notes) ? notes.length : 0;
  const primaryNote = noteCount > 0 ? notes[0] : null;
  const stationery = primaryNote ? getStationeryById(primaryNote.stationeryId) : getStationeryById();

  if (noteCount === 0) {
    if (!showAddPrompt) return null;

    // Discreet trigger for tasks without notes
    return (
      <button
        type="button"
        className={`task-sticky-empty-trigger ${compact ? 'task-sticky-empty-compact' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onOpen) onOpen();
        }}
        title={`Add a sticky note for "${taskTitle}"`}
        aria-label={`Add sticky note to task "${taskTitle}"`}
      >
        <span className="task-sticky-empty-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H13L21 13V5C21 3.89543 20.1046 3 19 3Z" />
            <path d="M13 21V13H21" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="13" x2="11" y2="13" />
          </svg>
        </span>
        {!compact && <span className="task-sticky-empty-label">+ Note</span>}
      </button>
    );
  }

  const accessibleLabel = noteCount === 1
    ? `View 1 sticky note for "${taskTitle}"`
    : `View ${noteCount} sticky notes for "${taskTitle}"`;

  return (
    <button
      type="button"
      className={`task-sticky-tab ${compact ? 'task-sticky-tab-compact' : ''}`}
      style={{
        backgroundColor: stationery.tabBg,
        borderColor: stationery.tabBorder,
        color: stationery.tabText,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpen) onOpen();
      }}
      title={`${accessibleLabel} — Click to view or edit notes`}
      aria-label={accessibleLabel}
    >
      <span
        className="task-sticky-tab-motif"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: stationery.motifSvg }}
      />
      <span className="task-sticky-tab-count">
        {noteCount > 1 ? noteCount : ''}
      </span>
      {!compact && (
        <span className="task-sticky-tab-text">
          {noteCount > 1 ? `${noteCount} Memos` : 'Memo'}
        </span>
      )}
    </button>
  );
}
