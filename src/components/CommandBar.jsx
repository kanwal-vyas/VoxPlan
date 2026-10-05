import React, { useState } from 'react';

export default function CommandBar({
  onExecuteCommand,
  feedback,
  onDismissFeedback,
  isListening,
  onToggleListening,
}) {
  const [inputVal, setInputVal] = useState('');

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    setInputVal('');
    onExecuteCommand(trimmed);
  };

  const handleHintClick = (hint) => {
    onExecuteCommand(hint);
  };

  return (
    <section style={styles.section} id="command" aria-label="Command Center">
      {/* Editorial Section Eyebrow */}
      <div style={styles.sectionHeader}>
        <div style={styles.titleWithIndex}>
          <span style={styles.sectionIndex}>04</span>
          <h2 style={styles.sectionTitle}>Ask VoxPlan</h2>
        </div>
        <span style={styles.sectionTag}>Voice & Natural Language</span>
      </div>

      <div style={styles.commandContainer}>
        {/* Input Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputRow}>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit(e);
                }
              }}
              placeholder={isListening ? 'Listening via microphone...' : 'What would you like to know about your project?'}
              style={styles.input}
            />

            {/* Subtle Microphone Button */}
            <button
              type="button"
              onClick={onToggleListening}
              style={{
                ...styles.micButton,
                ...(isListening ? styles.micButtonActive : {}),
              }}
              title={isListening ? 'Listening... click to stop' : 'Click or use Wispr Flow to speak commands'}
              aria-label="Toggle voice input"
            >
              {isListening ? (
                <div style={styles.waveGroup}>
                  <span style={{ ...styles.waveBar, animation: 'soundwave 0.8s ease-in-out infinite 0ms' }} />
                  <span style={{ ...styles.waveBar, animation: 'soundwave 0.8s ease-in-out infinite 150ms' }} />
                  <span style={{ ...styles.waveBar, animation: 'soundwave 0.8s ease-in-out infinite 300ms' }} />
                  <span style={{ ...styles.waveBar, animation: 'soundwave 0.8s ease-in-out infinite 150ms' }} />
                </div>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>

            {/* Submit Arrow */}
            <button
              type="submit"
              style={styles.submitBtn}
              title="Execute command"
              aria-label="Execute command"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </form>

        {/* Real-time Feedback Message */}
        {feedback && (
          <div
            role="status"
            style={{
              ...styles.feedbackBanner,
              ...(feedback.type === 'success'
                ? styles.feedbackSuccess
                : feedback.type === 'error'
                ? styles.feedbackError
                : styles.feedbackInfo),
            }}
          >
            <span style={styles.feedbackText}>{feedback.message}</span>
            <button
              type="button"
              onClick={onDismissFeedback}
              style={styles.feedbackCloseBtn}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Suggested Directives */}
        <div style={styles.suggestionsRow}>
          {[
            { label: 'SHOW HIGH RISK TASKS', cmd: 'show high risk tasks' },
            { label: 'EXPLAIN PROJECT RISK', cmd: 'explain project risk' },
            { label: 'TRAIN THE MODEL', cmd: 'train the model' },
            { label: 'SHOW MODEL PERFORMANCE', cmd: 'show model performance' },
          ].map((item) => (
            <button
              key={item.cmd}
              type="button"
              onClick={() => handleHintClick(item.cmd)}
              style={styles.suggestionBtn}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '64px 0 32px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    width: '100%',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  titleWithIndex: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
  },
  sectionIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    fontWeight: '500',
    color: '#7c66dc',
  },
  sectionTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#f6f5f2',
    margin: 0,
  },
  sectionTag: {
    fontSize: '13px',
    color: '#5e6068',
  },
  commandContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  form: {
    width: '100%',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f6f5f2',
    fontFamily: "'Instrument Sans', sans-serif",
    fontSize: '18px',
    fontWeight: '400',
    letterSpacing: '-0.01em',
  },
  micButton: {
    width: '38px',
    height: '38px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#9c9da3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  micButtonActive: {
    backgroundColor: 'rgba(229, 72, 77, 0.15)',
    borderColor: '#e5484d',
    color: '#e5484d',
  },
  waveGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    height: '16px',
  },
  waveBar: {
    width: '2px',
    height: '10px',
    backgroundColor: '#e5484d',
    borderRadius: '1px',
  },
  submitBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#f6f5f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  feedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(62, 163, 112, 0.08)',
    border: '1px solid rgba(62, 163, 112, 0.2)',
    color: '#3ea370',
  },
  feedbackError: {
    backgroundColor: 'rgba(229, 72, 77, 0.08)',
    border: '1px solid rgba(229, 72, 77, 0.2)',
    color: '#e5484d',
  },
  feedbackInfo: {
    backgroundColor: 'rgba(124, 102, 220, 0.08)',
    border: '1px solid rgba(124, 102, 220, 0.2)',
    color: '#7c66dc',
  },
  feedbackText: {
    flex: 1,
    lineHeight: 1.4,
  },
  feedbackCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    opacity: 0.7,
  },
  suggestionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  suggestionBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.04em',
    padding: '6px 12px',
    borderRadius: '3px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#9c9da3',
    cursor: 'pointer',
  },
};
