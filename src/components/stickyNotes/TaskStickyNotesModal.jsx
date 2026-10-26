import React, { useState, useEffect, useRef } from 'react';
import {
  STATIONERY_STYLES,
  getStationeryById,
} from './stationeryCatalog.js';
import {
  MAX_NOTE_TITLE_LENGTH,
  MAX_NOTE_BODY_LENGTH,
} from '../../utils/stickyNotesStorage.js';

/**
 * TaskStickyNotesModal Component
 *
 * An interactive, accessible dialog where users view, compose,
 * edit, and manage richly illustrated stationery notes attached to a task.
 * Features a live full-page illustrated memo preview with scattered artwork,
 * a visually driven paper gallery (no visible text labels), and immediate visual feedback.
 */
export default function TaskStickyNotesModal({
  isOpen,
  task,
  notes = [],
  onClose,
  onSaveNote,
  onDeleteNote,
}) {
  const [activeNoteId, setActiveNoteId] = useState(() => (notes && notes.length > 0 ? notes[0].id : null));
  const [isComposing, setIsComposing] = useState(() => !notes || notes.length === 0);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftStationeryId, setDraftStationeryId] = useState('powder-blue');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const modalRef = useRef(null);
  const titleInputRef = useRef(null);
  const bodyInputRef = useRef(null);
  const prevTaskIdRef = useRef(task?.id);

  if (prevTaskIdRef.current !== task?.id) {
    prevTaskIdRef.current = task?.id;
    setIsComposing(!notes || notes.length === 0);
    setActiveNoteId(notes && notes.length > 0 ? notes[0].id : null);
    setDraftTitle('');
    setDraftBody('');
    setDraftStationeryId('powder-blue');
    setErrorMessage('');
    setDeleteConfirmId(null);
  }

  const handleStartCompose = () => {
    setIsComposing(true);
    setActiveNoteId(null);
    setDraftTitle('');
    setDraftBody('');
    setDraftStationeryId('powder-blue');
    setErrorMessage('');
    setTimeout(() => {
      if (bodyInputRef.current) bodyInputRef.current.focus();
    }, 50);
  };

  const handleStartEdit = (note) => {
    setIsComposing(true);
    setActiveNoteId(note.id);
    setDraftTitle(note.title || '');
    setDraftBody(note.body || '');
    setDraftStationeryId(note.stationeryId || 'powder-blue');
    setErrorMessage('');
    setTimeout(() => {
      if (bodyInputRef.current) bodyInputRef.current.focus();
    }, 50);
  };

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isComposing && (draftTitle.trim() || draftBody.trim())) {
          if (window.confirm('Discard unsaved note changes?')) {
            if (notes.length > 0) {
              setIsComposing(false);
            } else {
              onClose();
            }
          }
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isComposing, draftTitle, draftBody, notes.length, onClose]);

  if (!isOpen || !task) return null;

  const handleCancelCompose = () => {
    if ((draftTitle.trim() || draftBody.trim()) && !window.confirm('Discard unsaved note changes?')) {
      return;
    }
    setErrorMessage('');
    if (notes.length > 0) {
      setIsComposing(false);
      setActiveNoteId(notes[0].id);
    } else {
      onClose();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedBody = draftBody.trim();
    if (!trimmedBody) {
      setErrorMessage('Please enter note text before saving.');
      if (bodyInputRef.current) bodyInputRef.current.focus();
      return;
    }

    const notePayload = {
      id: activeNoteId || undefined,
      taskId: task.id,
      title: draftTitle.trim().slice(0, MAX_NOTE_TITLE_LENGTH),
      body: trimmedBody.slice(0, MAX_NOTE_BODY_LENGTH),
      stationeryId: draftStationeryId,
    };

    const res = onSaveNote(task.id, notePayload);
    if (res && res.success === false) {
      setErrorMessage(res.error || 'Failed to save sticky note.');
      return;
    }

    setIsComposing(false);
    setErrorMessage('');
    if (res?.note?.id) {
      setActiveNoteId(res.note.id);
    }
  };

  const handleDelete = (noteId) => {
    const res = onDeleteNote(task.id, noteId);
    setDeleteConfirmId(null);
    if (res && res.remainingNotes) {
      if (res.remainingNotes.length === 0) {
        setIsComposing(true);
        setDraftTitle('');
        setDraftBody('');
      } else {
        setActiveNoteId(res.remainingNotes[0].id);
      }
    }
  };

  const activeNote = notes.find((n) => n.id === activeNoteId) || notes[0];
  const activeStationery = activeNote ? getStationeryById(activeNote.stationeryId) : getStationeryById('powder-blue');
  const previewStationery = getStationeryById(draftStationeryId);

  return (
    <div
      className="task-sticky-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (isComposing && (draftTitle.trim() || draftBody.trim())) {
            if (window.confirm('Discard unsaved note changes?')) onClose();
          } else {
            onClose();
          }
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticky-modal-title"
    >
      <div className="task-sticky-modal-dialog" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="task-sticky-modal-header">
          <div className="task-sticky-header-info">
            <span className="task-sticky-kicker">
              ✦ STICKY NOTES
            </span>
            <h3 id="sticky-modal-title" className="task-sticky-task-title">
              {task.title}
            </h3>
            <div className="task-sticky-header-tags">
              <span className="task-sticky-category-tag">
                {task.category || 'General'}
              </span>
              <span className="task-sticky-count-tag">
                {notes.length} {notes.length === 1 ? 'Memo' : 'Memos'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="task-sticky-close-btn"
            onClick={onClose}
            aria-label="Close sticky notes"
            title="Close dialog (Escape)"
          >
            ✕
          </button>
        </div>

        {/* Modal Main Workspace */}
        <div className="task-sticky-modal-body">
          {/* Top Switcher: Stack of Notes or Compose Switch */}
          <div className="task-sticky-deck-bar">
            <div className="task-sticky-tabs-strip" role="tablist" aria-label="Task sticky notes">
              {notes.map((note, idx) => {
                const s = getStationeryById(note.stationeryId);
                const isSelected = !isComposing && note.id === (activeNote?.id);
                return (
                  <button
                    key={note.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`task-sticky-deck-tab ${isSelected ? 'task-sticky-deck-tab-active' : ''}`}
                    style={{
                      backgroundColor: s.tabBg,
                      borderColor: s.tabBorder,
                      color: s.tabText,
                    }}
                    onClick={() => {
                      setIsComposing(false);
                      setActiveNoteId(note.id);
                      setDeleteConfirmId(null);
                    }}
                  >
                    <span
                      className="task-sticky-deck-tab-motif"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: s.motifSvg }}
                    />
                    <span className="task-sticky-deck-tab-label">
                      {note.title || `Memo #${idx + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`task-sticky-new-btn ${isComposing && !activeNoteId ? 'task-sticky-new-btn-active' : ''}`}
              onClick={handleStartCompose}
              title="Compose a new sticky note"
              aria-label="Create a new sticky note for this task"
            >
              + New Memo
            </button>
          </div>

          {/* Validation Notice Banner */}
          {errorMessage && (
            <div className="task-sticky-error-banner" role="alert">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Content Pane: Viewing or Composing */}
          {isComposing ? (
            /* ========================================================== */
            /* COMPOSER / EDITOR FORM WITH FULL ILLUSTRATED LIVE PREVIEW  */
            /* ========================================================== */
            <form onSubmit={handleSubmit} className="task-sticky-composer">
              {/* Stationery Gallery Selector (Visually Driven - No Written Names) */}
              <div className="task-sticky-stationery-gallery-section">
                <div className="task-sticky-gallery-header">
                  <span className="task-sticky-gallery-title">
                    Select Stationery Paper:
                  </span>
                  <span className="task-sticky-gallery-subtitle">
                    Scattered illustrations update live in the writing preview below
                  </span>
                </div>

                <div
                  className="task-sticky-gallery-grid"
                  role="radiogroup"
                  aria-label="Stationery designs"
                >
                  {STATIONERY_STYLES.map((style) => {
                    const isSelected = draftStationeryId === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={style.ariaLabel}
                        className={`task-sticky-gallery-card ${style.themeClass} ${isSelected ? 'task-sticky-gallery-card-selected' : ''}`}
                        style={{
                          backgroundColor: style.frameBg,
                          borderColor: isSelected ? style.accentColor : style.frameBorder,
                        }}
                        onClick={() => setDraftStationeryId(style.id)}
                        title={style.description}
                      >
                        {/* Miniature Memo Sheet Representation */}
                        <div
                          className="task-sticky-mini-sheet"
                          style={{
                            backgroundColor: style.paperBg,
                            borderColor: style.paperBorder,
                            boxShadow: isSelected ? `0 0 0 2px ${style.accentColor}` : undefined,
                          }}
                        >
                          {/* Mini Washi Tape */}
                          <div
                            className="task-sticky-mini-tape"
                            style={{ backgroundColor: style.tapeColor }}
                          />

                          {/* Mini Motif Icon */}
                          <div
                            className="task-sticky-mini-motif"
                            style={{ color: style.lineArtColor }}
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: style.motifSvg }}
                          />

                          {/* Decorative Miniature Grid Lines */}
                          <div className="task-sticky-mini-lines" aria-hidden="true">
                            <span style={{ backgroundColor: style.frameBorder }} />
                            <span style={{ backgroundColor: style.frameBorder }} />
                          </div>
                        </div>

                        {/* Selected Indicator Checkmark Pill */}
                        {isSelected && (
                          <div
                            className="task-sticky-selected-check-pill"
                            style={{ backgroundColor: style.accentColor }}
                            aria-hidden="true"
                          >
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full-Page Illustrated Live Preview Paper Container */}
              <div
                className={`task-sticky-full-paper ${previewStationery.themeClass}`}
                style={{
                  backgroundColor: previewStationery.frameBg,
                  borderColor: previewStationery.frameBorder,
                  boxShadow: previewStationery.paperShadow,
                }}
              >
                {/* Die-cut Inner Writing Card with Rounded Corners */}
                <div
                  className="task-sticky-inner-card"
                  style={{
                    backgroundColor: previewStationery.paperBg,
                    borderColor: previewStationery.paperBorder,
                    color: previewStationery.textColor,
                  }}
                >
                  {/* Pinned Washi Tape Strip at Top-Center */}
                  <div
                    className="task-sticky-washi-tape"
                    style={{ backgroundColor: previewStationery.tapeColor }}
                  />

                  {/* Scattered Top Edge Banner Artwork (Stars, Bunny, Clouds, Blossoms) */}
                  <div
                    className="task-sticky-scattered-top-wrapper"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: previewStationery.topDecorSvg }}
                  />

                  {/* Central Writing Area (Safe padding prevents colliding with scattered artwork) */}
                  <div className="task-sticky-writing-area">
                    {/* Optional Note Title Field */}
                    <div className="task-sticky-input-group">
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        maxLength={MAX_NOTE_TITLE_LENGTH}
                        placeholder="Memo Title (optional)..."
                        className="task-sticky-title-field"
                        style={{
                          color: previewStationery.titleColor,
                          borderColor: previewStationery.inputBorder || previewStationery.paperBorder,
                          fontFamily: previewStationery.handwritingFont || "var(--font-sans)",
                        }}
                        aria-label="Sticky note title (optional)"
                      />
                      <span className="task-sticky-char-limit">
                        {draftTitle.length}/{MAX_NOTE_TITLE_LENGTH}
                      </span>
                    </div>

                    {/* Required Note Body Field */}
                    <div className="task-sticky-input-group">
                      <textarea
                        ref={bodyInputRef}
                        value={draftBody}
                        onChange={(e) => {
                          setDraftBody(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        maxLength={MAX_NOTE_BODY_LENGTH}
                        placeholder="Write your note, thoughts, or checklist here..."
                        className="task-sticky-body-field"
                        rows={6}
                        style={{
                          color: previewStationery.textColor,
                          borderColor: previewStationery.inputBorder || previewStationery.paperBorder,
                          fontFamily: previewStationery.handwritingFont || "var(--font-sans)",
                        }}
                        required
                        aria-label="Sticky note body (required)"
                      />
                      <span className="task-sticky-char-limit">
                        {draftBody.length}/{MAX_NOTE_BODY_LENGTH}
                      </span>
                    </div>
                  </div>

                  {/* Scattered Bottom Edge Artwork (Character line-art, camera, hearts, captions) */}
                  <div
                    className="task-sticky-scattered-bottom-wrapper"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: previewStationery.bottomDecorSvg }}
                  />
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="task-sticky-composer-actions">
                {notes.length > 0 && (
                  <button
                    type="button"
                    className="task-sticky-cancel-btn"
                    onClick={handleCancelCompose}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="task-sticky-save-btn"
                  style={{
                    backgroundColor: previewStationery.accentColor,
                    borderColor: previewStationery.accentColor,
                  }}
                >
                  ✓ Save Memo
                </button>
              </div>
            </form>
          ) : (
            /* ========================================================== */
            /* VIEWING SINGLE NOTE SHEET (FULL ILLUSTRATED STATIONERY)    */
            /* ========================================================== */
            activeNote && (
              <div className="task-sticky-viewer">
                <article
                  className={`task-sticky-full-paper ${activeStationery.themeClass}`}
                  style={{
                    backgroundColor: activeStationery.frameBg,
                    borderColor: activeStationery.frameBorder,
                    boxShadow: activeStationery.paperShadow,
                  }}
                >
                  {/* Die-cut Inner Writing Card */}
                  <div
                    className="task-sticky-inner-card"
                    style={{
                      backgroundColor: activeStationery.paperBg,
                      borderColor: activeStationery.paperBorder,
                      color: activeStationery.textColor,
                    }}
                  >
                    {/* Washi Tape Strip */}
                    <div
                      className="task-sticky-washi-tape"
                      style={{ backgroundColor: activeStationery.tapeColor }}
                    />

                    {/* Top Note Meta & Date */}
                    <div className="task-sticky-note-meta-row">
                      <span
                        className="task-sticky-meta-tab-pip"
                        style={{
                          backgroundColor: activeStationery.tabBg,
                          borderColor: activeStationery.tabBorder,
                          color: activeStationery.tabText,
                        }}
                        aria-hidden="true"
                      >
                        <span
                          className="task-sticky-meta-motif"
                          dangerouslySetInnerHTML={{ __html: activeStationery.motifSvg }}
                        />
                      </span>

                      <span className="task-sticky-timestamp">
                        {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Scattered Top Edge Banner Artwork */}
                    <div
                      className="task-sticky-scattered-top-wrapper"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: activeStationery.topDecorSvg }}
                    />

                    {/* Central Reading Area */}
                    <div className="task-sticky-reading-area">
                      {/* Note Title */}
                      {activeNote.title && (
                        <h4
                          className="task-sticky-note-title"
                          style={{
                            color: activeStationery.titleColor,
                            fontFamily: activeStationery.handwritingFont || "var(--font-sans)",
                          }}
                        >
                          {activeNote.title}
                        </h4>
                      )}

                      {/* Note Body Text */}
                      <div
                        className="task-sticky-note-body"
                        style={{
                          color: activeStationery.textColor,
                          fontFamily: activeStationery.handwritingFont || "var(--font-sans)",
                        }}
                      >
                        {activeNote.body}
                      </div>
                    </div>

                    {/* Scattered Bottom Artwork */}
                    <div
                      className="task-sticky-scattered-bottom-wrapper"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: activeStationery.bottomDecorSvg }}
                    />
                  </div>
                </article>

                {/* Note Card Footer Action Buttons */}
                <div className="task-sticky-viewer-actions">
                  <div className="task-sticky-actions-left">
                    {deleteConfirmId === activeNote.id ? (
                      <div className="task-sticky-confirm-delete-box">
                        <span className="task-sticky-confirm-text">Delete this note?</span>
                        <button
                          type="button"
                          className="task-sticky-confirm-yes-btn"
                          onClick={() => handleDelete(activeNote.id)}
                        >
                          Yes, Delete
                        </button>
                        <button
                          type="button"
                          className="task-sticky-confirm-cancel-btn"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="task-sticky-delete-trigger-btn"
                        onClick={() => setDeleteConfirmId(activeNote.id)}
                        title="Delete this note"
                        aria-label={`Delete note "${activeNote.title || 'Memo'}"`}
                      >
                        🗑️ Delete Note
                      </button>
                    )}
                  </div>

                  <div className="task-sticky-actions-right">
                    <button
                      type="button"
                      className="task-sticky-edit-trigger-btn"
                      onClick={() => handleStartEdit(activeNote)}
                      title="Edit this note's content or stationery"
                    >
                      ✎ Edit Memo
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
