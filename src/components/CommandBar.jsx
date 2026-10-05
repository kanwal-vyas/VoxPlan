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
    <section style={styles.section} id="command" aria-label="Command Assistant">
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>04</span>
              <span style={styles.badge}>VOICE & NATURAL LANGUAGE</span>
            </div>
            <h2 style={styles.title}>
              TELL <span className="hl hl-peach">VOXPLAN</span> WHAT YOU NEED
            </h2>
            <p style={styles.subtitle}>
              Voice interaction powered by Wispr Flow with direct natural language task execution
            </p>
          </div>
        </div>

        {/* Clean Modern Assistant Box */}
        <div
          style={{
            ...styles.notebookCard,
            borderColor: isListening ? '#FF8F82' : 'rgba(37, 36, 42, 0.08)',
            boxShadow: isListening ? '0 12px 32px rgba(255, 143, 130, 0.2)' : '0 4px 16px rgba(37, 36, 42, 0.04)',
          }}
          className="digital-card"
        >
          {/* Input Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputRow}>
              <span style={styles.promptIcon}>💬</span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e);
                }}
                placeholder={isListening ? 'Listening via Wispr Flow... speak naturally!' : 'What should I work on first?'}
                style={styles.input}
              />

              {/* Wispr Flow Mic Button */}
              <button
                type="button"
                onClick={onToggleListening}
                style={{
                  ...styles.micBtn,
                  backgroundColor: isListening ? '#FF8F82' : '#FFE58A',
                  color: isListening ? '#FFFFFF' : '#25242A',
                }}
                title={isListening ? 'Stop voice listening' : 'Speak command via Wispr Flow'}
                aria-label="Toggle voice listening"
              >
                {isListening ? (
                  <div style={styles.waveBars}>
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 0ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 150ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 300ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 150ms' }} />
                  </div>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
              </button>

              {/* Submit Button */}
              <button
                type="submit"
                style={styles.sendBtn}
                title="Execute command"
                aria-label="Execute command"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </form>

          {/* Feedback Toast Banner */}
          {feedback && (
            <div
              role="status"
              style={{
                ...styles.feedbackBanner,
                backgroundColor: feedback.type === 'success' ? '#EBF8F1' : feedback.type === 'error' ? '#FFE8E5' : '#F3EEFF',
                borderColor: feedback.type === 'success' ? '#BFE8D0' : feedback.type === 'error' ? '#FFB5A7' : '#C9B6FF',
                color: feedback.type === 'success' ? '#166534' : feedback.type === 'error' ? '#991B1B' : '#5B44BA',
              }}
            >
              <span style={styles.feedbackEmoji}>
                {feedback.type === 'success' ? '✓' : feedback.type === 'error' ? '!' : 'i'}
              </span>
              <span style={styles.feedbackMessage}>{feedback.message}</span>
              <button
                type="button"
                onClick={onDismissFeedback}
                style={styles.closeFeedback}
                aria-label="Dismiss feedback"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Prompt Chips */}
          <div style={styles.promptsRow}>
            <span style={styles.promptsLabel}>Quick commands:</span>
            {[
              { label: 'Show high risk tasks', cmd: 'show high risk tasks' },
              { label: 'Explain project risk', cmd: 'explain project risk' },
              { label: 'Train the model', cmd: 'train the model' },
              { label: 'Show model performance', cmd: 'show model performance' },
            ].map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => handleHintClick(item.cmd)}
                style={styles.promptChip}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '36px 0 64px 0',
  },
  container: {
    backgroundColor: '#FFEFEA',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: '0 8px 24px rgba(255, 181, 167, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    border: '1px solid rgba(255, 181, 167, 0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#D9483B',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#C92A1D',
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '32px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#706D73',
    margin: 0,
    fontWeight: '500',
  },
  notebookCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    position: 'relative',
  },
  form: {
    width: '100%',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  promptIcon: {
    fontSize: '20px',
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '17px',
    fontWeight: '600',
    color: '#25242A',
  },
  micBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(37, 36, 42, 0.08)',
  },
  waveBars: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    height: '18px',
  },
  bar: {
    width: '3px',
    height: '12px',
    backgroundColor: '#FFFFFF',
    borderRadius: '9999px',
  },
  sendBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(37, 36, 42, 0.12)',
  },
  feedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 16px',
    borderRadius: '12px',
    border: '1px solid',
    fontSize: '13px',
    fontWeight: '600',
  },
  feedbackEmoji: {
    fontSize: '14px',
    fontWeight: '800',
  },
  feedbackMessage: {
    flex: 1,
  },
  closeFeedback: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0 4px',
  },
  promptsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    paddingTop: '10px',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
  },
  promptsLabel: {
    fontSize: '13px',
    color: '#706D73',
    fontWeight: '600',
  },
  promptChip: {
    backgroundColor: '#FFF8EF',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    padding: '6px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#25242A',
    cursor: 'pointer',
  },
};
