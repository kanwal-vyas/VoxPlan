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
    <section style={styles.commandSection} id="section-command" aria-label="Command Center">
      {/* Editorial Section Eyebrow */}
      <div style={styles.headerRow}>
        <div style={styles.titleGroup}>
          <span style={styles.sectionIndex}>04 // INTELLIGENCE INTERFACE</span>
          <h2 style={styles.sectionTitle}>COMMAND VOXPLAN</h2>
        </div>
        <span style={styles.sectionTag}>VOICE & NATURAL LANGUAGE</span>
      </div>

      <div style={{
        ...styles.commandConsole,
        ...(isListening ? styles.consoleListening : {}),
      }}>
        {/* Top telemetry bar */}
        <div style={styles.consoleBar}>
          <div style={styles.consoleStatus}>
            <span style={{
              ...styles.statusLight,
              backgroundColor: isListening ? '#f43f5e' : '#7c5cfc',
              boxShadow: isListening ? '0 0 10px #f43f5e' : '0 0 10px #7c5cfc',
            }} />
            <span style={styles.statusText}>
              {isListening ? 'WISPR FLOW LISTENING MODE ACTIVE' : 'AWAITING NATURAL LANGUAGE COMMAND'}
            </span>
          </div>
          <span style={styles.consoleShortcut}>ENTER ↵ TO EXECUTE</span>
        </div>

        {/* Input area */}
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
              placeholder={isListening ? 'Speak your command clearly...' : 'Ask VoxPlan what you want to know or execute...'}
              style={styles.input}
            />

            {/* Mic / Wispr Button */}
            <button
              type="button"
              onClick={onToggleListening}
              style={{
                ...styles.micButton,
                ...(isListening ? styles.micButtonActive : {}),
              }}
              title={isListening ? 'Listening via Wispr Flow... click to stop' : 'Click or use Wispr Flow to speak commands'}
              aria-label="Toggle voice command input"
            >
              {isListening ? (
                <div style={styles.waveGroup}>
                  <span style={{ ...styles.waveBar, animationDelay: '0ms' }} />
                  <span style={{ ...styles.waveBar, animationDelay: '150ms' }} />
                  <span style={{ ...styles.waveBar, animationDelay: '300ms' }} />
                  <span style={{ ...styles.waveBar, animationDelay: '150ms' }} />
                  <span style={{ ...styles.waveBar, animationDelay: '0ms' }} />
                </div>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>

            {/* Submit Arrow Button */}
            <button
              type="submit"
              style={styles.submitBtn}
              title="Execute command"
              aria-label="Execute command"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </form>

        {/* Real-time Feedback Banner */}
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
            <div style={styles.feedbackIcon}>
              {feedback.type === 'success' && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {feedback.type === 'error' && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {feedback.type === 'info' && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>
            <span style={styles.feedbackText}>{feedback.message}</span>
            <button
              type="button"
              onClick={onDismissFeedback}
              style={styles.feedbackCloseBtn}
              aria-label="Dismiss feedback"
            >
              ×
            </button>
          </div>
        )}

        {/* Interactive Quick Command Suggestions */}
        <div style={styles.chipsSection}>
          <span style={styles.chipsPrompt}>RECOMMENDED DIRECTIVES</span>
          <div style={styles.chipsGrid}>
            <button
              type="button"
              onClick={() => handleHintClick('show high risk tasks')}
              style={styles.chip}
            >
              SHOW HIGH RISK TASKS
            </button>
            <button
              type="button"
              onClick={() => handleHintClick('explain project risk')}
              style={styles.chip}
            >
              EXPLAIN PROJECT RISK
            </button>
            <button
              type="button"
              onClick={() => handleHintClick('train the model')}
              style={styles.chip}
            >
              TRAIN THE MODEL
            </button>
            <button
              type="button"
              onClick={() => handleHintClick('show model performance')}
              style={styles.chip}
            >
              SHOW MODEL PERFORMANCE
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  commandSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    width: '100%',
    padding: '40px 0 20px 0',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sectionIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    color: '#7c5cfc',
  },
  sectionTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#ffffff',
    margin: 0,
    textTransform: 'uppercase',
  },
  sectionTag: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#5e6473',
    letterSpacing: '0.08em',
  },
  commandConsole: {
    backgroundColor: '#101218',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    overflow: 'hidden',
    transition: 'all 0.25s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  consoleListening: {
    borderColor: 'rgba(244, 63, 94, 0.5)',
    boxShadow: '0 0 32px rgba(244, 63, 94, 0.15)',
  },
  consoleBar: {
    padding: '12px 20px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
  },
  consoleStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusLight: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    transition: 'all 0.2s ease',
  },
  statusText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    color: '#868b98',
  },
  consoleShortcut: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#5e6473',
    letterSpacing: '0.08em',
  },
  form: {
    width: '100%',
    padding: '18px 20px',
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
    color: '#ffffff',
    fontFamily: "'Instrument Sans', sans-serif",
    fontSize: '18px',
    fontWeight: '500',
    letterSpacing: '-0.01em',
  },
  micButton: {
    width: '46px',
    height: '46px',
    borderRadius: '12px',
    backgroundColor: 'rgba(124, 92, 252, 0.12)',
    border: '1px solid rgba(124, 92, 252, 0.3)',
    color: '#7c5cfc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.2s ease',
  },
  micButtonActive: {
    backgroundColor: '#f43f5e',
    borderColor: '#fb7185',
    color: '#ffffff',
    boxShadow: '0 0 20px rgba(244, 63, 94, 0.6)',
  },
  waveGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    height: '18px',
  },
  waveBar: {
    width: '3px',
    height: '14px',
    backgroundColor: '#ffffff',
    borderRadius: '2px',
    animation: 'pulse 0.8s ease-in-out infinite alternate',
  },
  submitBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#d0d4dc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  },
  feedbackBanner: {
    margin: '0 20px 16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontFamily: "'Instrument Sans', sans-serif",
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
  },
  feedbackError: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    border: '1px solid rgba(244, 63, 94, 0.3)',
    color: '#fb7185',
  },
  feedbackInfo: {
    backgroundColor: 'rgba(124, 92, 252, 0.1)',
    border: '1px solid rgba(124, 92, 252, 0.3)',
    color: '#a78bfa',
  },
  feedbackIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    fontSize: '18px',
    lineHeight: 1,
    padding: '0 4px',
    opacity: 0.7,
  },
  chipsSection: {
    padding: '14px 20px 18px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  chipsPrompt: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.14em',
    color: '#5e6473',
  },
  chipsGrid: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  chip: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    padding: '7px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#9da3b4',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};

