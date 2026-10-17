import React, { useState, useEffect, useRef } from 'react';

export default function CommandBar({
  onExecuteCommand,
  feedback,
  onDismissFeedback,
  isListening = false,
  recognitionState = 'IDLE',
  interimTranscript = '',
  onToggleListening,
  speechOutputEnabled = false,
  isSpeaking = false,
  onToggleSpeechOutput,
  onStopSpeech,
  conversationState = 'IDLE',
  onConfirm,
  onCancel,
  activeSubjectTask = null,
  activeProposal = null,
  onAcceptProposal,
  onDiscardProposal,
}) {
  const [inputVal, setInputVal] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const liveAnnouncement =
    recognitionState === 'LISTENING'
      ? 'Microphone active. Listening for voice command.'
      : recognitionState === 'PROCESSING'
      ? 'Processing spoken command.'
      : recognitionState === 'ERROR'
      ? 'Voice recognition error.'
      : isSpeaking
      ? 'Assistant is speaking response.'
      : feedback?.message || '';

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

  const placeholderText =
    recognitionState === 'LISTENING' || isListening
      ? 'Listening via microphone... speak clearly! (Press Esc to stop)'
      : recognitionState === 'PROCESSING'
      ? 'Processing spoken command...'
      : conversationState === 'AWAITING_CONFIRMATION'
      ? 'Type or say "yes" to confirm or "no" to cancel...'
      : conversationState === 'AWAITING_CLARIFICATION'
      ? 'Type or speak your answer (or "cancel")...'
      : conversationState === 'AWAITING_PROPOSAL_DECISION'
      ? 'Type or say "accept" to apply, "discard" to cancel, or ask "what if..."'
      : 'Ask or command (e.g. "Move my database assignment to tomorrow", "Spread tasks over 3 days")...';

  return (
    <section ref={sectionRef} style={styles.section} id="command" aria-label="Command Assistant">
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>06</span>
              <span style={styles.badge}>VOICE & NATURAL LANGUAGE</span>
              {conversationState === 'AWAITING_CONFIRMATION' && (
                <span style={styles.stateBadgeConfirmation}>⚠️ CONFIRMATION REQUIRED</span>
              )}
              {conversationState === 'AWAITING_CLARIFICATION' && (
                <span style={styles.stateBadgeClarification}>💬 CLARIFYING DETAILS</span>
              )}
              {conversationState === 'AWAITING_PROPOSAL_DECISION' && (
                <span style={styles.stateBadgeProposal}>📋 PROPOSAL PENDING REVIEW</span>
              )}
            </div>
            <h2 style={styles.title}>
              <span className="command-title-word">TELL </span>
              <span className={`command-title-word command-word-voxplan hl hl-peach ${isVisible ? 'hl-sweep' : ''}`}>VOXPLAN </span>
              <span className="command-title-word">WHAT YOU NEED</span>
            </h2>
            <p style={styles.subtitle}>
              Voice input powered by browser Speech Recognition with deterministic multi-turn planning context
            </p>
          </div>
        </div>

        {/* Clean Modern Assistant Box */}
        <div
          style={{
            ...styles.notebookCard,
            borderColor: isListening ? '#FF8F82' : conversationState === 'AWAITING_CONFIRMATION' ? '#FFB5A7' : conversationState === 'AWAITING_PROPOSAL_DECISION' ? '#BFE8D0' : 'rgba(37, 36, 42, 0.08)',
            boxShadow: isListening ? '0 12px 32px rgba(255, 143, 130, 0.2)' : conversationState === 'AWAITING_PROPOSAL_DECISION' ? '0 8px 24px rgba(64, 145, 108, 0.12)' : '0 4px 16px rgba(37, 36, 42, 0.04)',
          }}
          className="digital-card command-notebook-card"
        >
          {/* Active Context Indicator */}
          {activeSubjectTask && (
            <div style={styles.contextBar} title="Follow-up commands like 'mark it done' or 'move it to Friday' apply to this task">
              <span style={styles.contextDot} />
              <span style={styles.contextText}>
                Active Task Focus: <strong>{activeSubjectTask.title}</strong>
              </span>
            </div>
          )}

          {/* Persistent Active Voice Session Banner */}
          {(recognitionState === 'LISTENING' || isListening || recognitionState === 'PROCESSING') && (
            <div
              id="voice-active-indicator"
              style={{
                ...styles.voiceSessionCard,
                backgroundColor: recognitionState === 'PROCESSING' ? '#F4F0FF' : '#FFF0EE',
                borderColor: recognitionState === 'PROCESSING' ? '#C9B6FF' : '#FF8F82',
              }}
              aria-label="Active Voice Recognition Session"
            >
              <div style={styles.voiceSessionLeft}>
                <div style={styles.voiceIndicatorBadge}>
                  <span
                    style={{
                      ...styles.voicePulseDot,
                      backgroundColor: recognitionState === 'PROCESSING' ? '#5B44BA' : '#E5484D',
                    }}
                  />
                  <span style={styles.voiceSessionStateText}>
                    {recognitionState === 'PROCESSING' ? 'PROCESSING AUDIO...' : 'LISTENING (MIC ACTIVE)'}
                  </span>
                </div>

                <div style={styles.voiceTranscriptArea}>
                  {interimTranscript ? (
                    <span style={styles.voiceInterimDraft} aria-label="Draft speech transcript">
                      Draft: <em>"{interimTranscript}"</em>
                    </span>
                  ) : (
                    <span style={styles.voiceListeningHint}>
                      {recognitionState === 'PROCESSING'
                        ? 'Analyzing captured command...'
                        : 'Speak clearly into your microphone... (e.g. "Add a database assignment due tomorrow")'}
                    </span>
                  )}
                </div>
              </div>

              <div style={styles.voiceSessionActions}>
                <button
                  id="voice-stop-listening-btn"
                  type="button"
                  onClick={onToggleListening}
                  style={styles.stopListeningBtn}
                  title="Stop voice recognition (or press Esc)"
                  aria-label="Stop listening"
                >
                  ■ Stop Listening
                </button>
              </div>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputRow}>
              <span style={styles.promptIcon}>
                {conversationState === 'AWAITING_CONFIRMATION' ? '⚠️' : conversationState === 'AWAITING_PROPOSAL_DECISION' ? '📋' : '💬'}
              </span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e);
                }}
                id="command-input"
                placeholder={placeholderText}
                style={styles.input}
              />

              {/* Spoken Responses Toggle (Speaker Button) */}
              <button
                id="speech-toggle-btn"
                type="button"
                onClick={onToggleSpeechOutput}
                style={{
                  ...styles.speakerBtn,
                  backgroundColor: speechOutputEnabled ? '#D1F2D9' : '#F3F0EC',
                  color: speechOutputEnabled ? '#166534' : '#706D73',
                  borderColor: speechOutputEnabled ? '#BFE8D0' : 'rgba(37, 36, 42, 0.12)',
                }}
                title={
                  speechOutputEnabled
                    ? isSpeaking
                      ? 'Assistant is speaking... Click to mute or press Esc to stop'
                      : 'Spoken responses: ON (Click to mute)'
                    : 'Spoken responses: OFF (Click to unmute)'
                }
                aria-label={speechOutputEnabled ? 'Mute spoken responses' : 'Enable spoken responses'}
              >
                {speechOutputEnabled ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>

              {/* Stop Speech Quick Button (visible when assistant is speaking) */}
              {isSpeaking && (
                <button
                  id="stop-speech-btn"
                  type="button"
                  onClick={onStopSpeech}
                  style={styles.stopSpeechBtn}
                  title="Stop speaking (or press Esc)"
                  aria-label="Stop speaking"
                >
                  ■ Stop
                </button>
              )}

              {/* Browser Speech Dictation Mic Button (5 Lifecycle States) */}
              <button
                id="voice-mic-btn"
                type="button"
                disabled={recognitionState === 'UNSUPPORTED'}
                onClick={onToggleListening}
                style={{
                  ...styles.micBtn,
                  backgroundColor:
                    recognitionState === 'LISTENING' || isListening
                      ? '#FF8F82'
                      : recognitionState === 'PROCESSING'
                      ? '#E4DAFF'
                      : recognitionState === 'ERROR'
                      ? '#FFE8E5'
                      : recognitionState === 'UNSUPPORTED'
                      ? '#EAE8E4'
                      : '#FFE58A',
                  color:
                    recognitionState === 'LISTENING' || isListening
                      ? '#FFFFFF'
                      : recognitionState === 'ERROR'
                      ? '#991B1B'
                      : '#25242A',
                  cursor: recognitionState === 'UNSUPPORTED' ? 'not-allowed' : 'pointer',
                  opacity: recognitionState === 'UNSUPPORTED' ? 0.6 : 1,
                }}
                title={
                  recognitionState === 'LISTENING' || isListening
                    ? 'Listening via microphone... click to stop (or press Esc)'
                    : recognitionState === 'PROCESSING'
                    ? 'Processing voice command...'
                    : recognitionState === 'ERROR'
                    ? 'Microphone error. Click to retry.'
                    : recognitionState === 'UNSUPPORTED'
                    ? 'Speech recognition not supported in this browser'
                    : 'Dictate command using browser speech recognition'
                }
                aria-label={
                  recognitionState === 'LISTENING' || isListening
                    ? 'Stop voice listening'
                    : recognitionState === 'PROCESSING'
                    ? 'Processing voice command'
                    : recognitionState === 'ERROR'
                    ? 'Microphone error. Click to retry'
                    : recognitionState === 'UNSUPPORTED'
                    ? 'Speech recognition not supported in this browser'
                    : 'Toggle voice listening'
                }
              >
                {recognitionState === 'LISTENING' || isListening ? (
                  <div style={styles.waveBars}>
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 0ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 150ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 300ms' }} />
                    <span style={{ ...styles.bar, animation: 'waveBar 0.6s infinite ease-in-out 150ms' }} />
                  </div>
                ) : recognitionState === 'PROCESSING' ? (
                  <div style={styles.waveBars}>
                    <span style={{ ...styles.bar, backgroundColor: '#5B44BA', animation: 'waveBar 0.4s infinite ease-in-out 0ms' }} />
                    <span style={{ ...styles.bar, backgroundColor: '#5B44BA', animation: 'waveBar 0.4s infinite ease-in-out 100ms' }} />
                    <span style={{ ...styles.bar, backgroundColor: '#5B44BA', animation: 'waveBar 0.4s infinite ease-in-out 200ms' }} />
                  </div>
                ) : recognitionState === 'UNSUPPORTED' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                    <path d="M5 10v2a7 7 0 0 0 12 5" />
                    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
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
                id="command-submit-btn"
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

          {/* Accessible Screen-Reader Live Region */}
          <div role="status" aria-live="polite" style={styles.srOnly}>
            {liveAnnouncement}
          </div>

          {/* Voice Privacy & Browser Compatibility Notice */}
          <div style={styles.privacyNote} aria-label="Voice privacy notice">
            <span style={styles.privacyLockIcon}>🔒</span>
            <span style={styles.privacyText}>
              <strong>Voice Privacy:</strong> Spoken commands use your browser's native Web Speech API. Audio recognition is performed by your browser vendor (e.g. Google or Apple) and is never sent to third-party AI services or stored on VoxPlan servers.
            </span>
          </div>

          {/* Feedback Toast Banner */}
          {feedback && (
            <div
              role="status"
              style={{
                ...styles.feedbackBanner,
                backgroundColor: feedback.type === 'success' ? '#EBF8F1' : feedback.type === 'error' ? '#FFE8E5' : feedback.type === 'warning' ? '#FFF4E5' : '#F3EEFF',
                borderColor: feedback.type === 'success' ? '#BFE8D0' : feedback.type === 'error' ? '#FFB5A7' : feedback.type === 'warning' ? '#FFE0B2' : '#C9B6FF',
                color: feedback.type === 'success' ? '#166534' : feedback.type === 'error' ? '#991B1B' : feedback.type === 'warning' ? '#B45309' : '#5B44BA',
              }}
            >
              <span style={styles.feedbackEmoji}>
                {feedback.type === 'success' ? '✓' : feedback.type === 'error' ? '!' : feedback.type === 'warning' ? '⚠️' : 'i'}
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

          {/* Schedule Proposal Review Card */}
          {activeProposal && (
            <div style={styles.proposalCard} aria-label="Schedule Proposal Details">
              <div style={styles.proposalHeader}>
                <div style={styles.proposalBadgeGroup}>
                  <span style={styles.proposalPill}>PROPOSAL REVIEW</span>
                  <span style={styles.strategyPill}>
                    {activeProposal.strategy === 'conversational_reschedule'
                      ? 'Task Move'
                      : activeProposal.strategy === 'balanced_pace'
                      ? 'Workload Spread'
                      : activeProposal.strategy || 'Adaptive Proposal'}
                  </span>
                  <span
                    style={{
                      ...styles.feasibilityPill,
                      backgroundColor:
                        activeProposal.summary?.feasibilityStatus === 'infeasible_dependency'
                          ? '#FFE8E5'
                          : activeProposal.summary?.feasibilityStatus === 'capacity_warning'
                          ? '#FFF4E5'
                          : '#EBF8F1',
                      color:
                        activeProposal.summary?.feasibilityStatus === 'infeasible_dependency'
                          ? '#991B1B'
                          : activeProposal.summary?.feasibilityStatus === 'capacity_warning'
                          ? '#B45309'
                          : '#166534',
                    }}
                  >
                    {activeProposal.summary?.feasibilityStatus === 'infeasible_dependency'
                      ? '🚫 Dependency Conflict'
                      : activeProposal.summary?.feasibilityStatus === 'capacity_warning'
                      ? '⚠️ Capacity Alert'
                      : '✓ Feasible'}
                  </span>
                </div>
                <span style={styles.proposalIdText} title={activeProposal.scheduleId}>
                  ID: {activeProposal.scheduleId.substring(0, 18)}...
                </span>
              </div>

              {/* Placements Diff List */}
              <div style={styles.placementsList}>
                {(activeProposal.proposedPlacements || activeProposal.placements || []).map((p) => (
                  <div key={p.taskId} style={styles.placementItem}>
                    <div style={styles.placementLeft}>
                      <span style={styles.placementTitle}>{p.taskTitle || p.taskId}</span>
                      <span style={styles.placementDates}>
                        <span style={styles.origDate}>{p.originalDueDate || 'No deadline'}</span>
                        <span style={styles.arrowIcon}> ➜ </span>
                        <strong style={styles.propDate}>{p.proposedDate || 'Unscheduled'}</strong>
                      </span>
                    </div>
                    <div style={styles.placementRight}>
                      <span style={styles.effortTag}>{p.effectiveHours || 2.0}h</span>
                      <span
                        style={{
                          ...styles.statusTag,
                          backgroundColor:
                            p.status === 'blocked_by_dependency'
                              ? '#FFE8E5'
                              : p.status === 'capacity_warning'
                              ? '#FFF4E5'
                              : '#EBF8F1',
                          color:
                            p.status === 'blocked_by_dependency'
                              ? '#991B1B'
                              : p.status === 'capacity_warning'
                              ? '#B45309'
                              : '#166534',
                        }}
                      >
                        {p.status === 'blocked_by_dependency'
                          ? 'Blocked'
                          : p.status === 'capacity_warning'
                          ? 'Over Capacity'
                          : 'On Time'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={styles.proposalActionsRow}>
                <button
                  id="proposal-apply-btn"
                  type="button"
                  onClick={() => onAcceptProposal && onAcceptProposal(activeProposal)}
                  style={styles.acceptProposalBtn}
                  aria-label="Accept schedule proposal"
                >
                  ✓ Apply Schedule
                </button>
                <button
                  id="proposal-discard-btn"
                  type="button"
                  onClick={() => onDiscardProposal && onDiscardProposal(activeProposal, 'user_discard')}
                  style={styles.discardProposalBtn}
                  aria-label="Discard schedule proposal"
                >
                  ✕ Discard
                </button>
                <span style={styles.proposalHelpHint}>
                  Say "Accept" to apply, "Discard" to cancel, or ask "What if..." to revise.
                </span>
              </div>
            </div>
          )}

          {/* Confirmation Controls Bar */}
          {conversationState === 'AWAITING_CONFIRMATION' && (
            <div style={styles.confirmationRow} aria-label="Confirmation Controls">
              <span style={styles.confirmationPrompt}>Explicit confirmation required:</span>
              <button
                type="button"
                onClick={onConfirm}
                style={styles.confirmBtn}
                aria-label="Confirm pending action"
              >
                ✓ Confirm
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={styles.cancelBtn}
                aria-label="Cancel pending action"
              >
                ✕ Cancel
              </button>
            </div>
          )}

          {/* Quick Prompt Chips */}
          <div style={styles.promptsRow}>
            <span style={styles.promptsLabel}>Try saying:</span>
            {[
              { label: 'Spread tasks over 3 days', cmd: 'spread tasks across next 3 days' },
              { label: 'Show high risk tasks', cmd: 'show high risk tasks' },
              { label: 'Explain project risk', cmd: 'explain project risk' },
              { label: 'Plan sprint', cmd: 'plan sprint' },
              { label: 'Train model', cmd: 'train the model' },
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
  stateBadgeConfirmation: {
    backgroundColor: '#FFE8E5',
    color: '#991B1B',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    border: '1px solid #FFB5A7',
  },
  stateBadgeClarification: {
    backgroundColor: '#FFF4E5',
    color: '#B45309',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    border: '1px solid #FFE0B2',
  },
  contextBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: '#FFF8EF',
    borderRadius: '10px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    fontSize: '12px',
    color: '#555259',
  },
  contextDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#40916C',
  },
  contextText: {
    fontWeight: '500',
  },
  confirmationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#FFF5F3',
    borderRadius: '12px',
    border: '1px solid #FFB5A7',
  },
  confirmationPrompt: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#991B1B',
    flex: 1,
  },
  stateBadgeProposal: {
    backgroundColor: '#EBF8F1',
    color: '#166534',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    border: '1px solid #BFE8D0',
  },
  proposalCard: {
    backgroundColor: '#FAF9F6',
    border: '1.5px solid #BFE8D0',
    borderRadius: '14px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: '0 4px 12px rgba(64, 145, 108, 0.08)',
  },
  proposalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
  },
  proposalBadgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  proposalPill: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: '800',
    padding: '3px 8px',
    borderRadius: '6px',
    letterSpacing: '0.04em',
  },
  strategyPill: {
    backgroundColor: '#FFF4E5',
    color: '#B45309',
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid #FFE0B2',
  },
  feasibilityPill: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(0,0,0,0.06)',
  },
  proposalIdText: {
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#706D73',
  },
  placementsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  placementItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#FFFFFF',
    borderRadius: '10px',
    border: '1px solid rgba(37, 36, 42, 0.06)',
    gap: '12px',
    flexWrap: 'wrap',
  },
  placementLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  placementTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#25242A',
  },
  placementDates: {
    fontSize: '12px',
    color: '#706D73',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  origDate: {
    color: '#94A3B8',
    textDecoration: 'line-through',
  },
  arrowIcon: {
    color: '#166534',
    fontWeight: '700',
  },
  propDate: {
    color: '#166534',
    fontWeight: '700',
  },
  placementRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  effortTag: {
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: '600',
    color: '#555259',
    backgroundColor: '#F1F5F9',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  statusTag: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  proposalActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    paddingTop: '6px',
  },
  acceptProposalBtn: {
    backgroundColor: '#40916C',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(64, 145, 108, 0.3)',
    transition: 'all 0.15s ease',
  },
  discardProposalBtn: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  proposalHelpHint: {
    fontSize: '12px',
    color: '#706D73',
    fontStyle: 'italic',
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: '#FF8F82',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(255, 143, 130, 0.3)',
  },
  cancelBtn: {
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  speakerBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 2px 6px rgba(37, 36, 42, 0.06)',
    transition: 'all 0.15s ease',
  },
  stopSpeechBtn: {
    backgroundColor: '#FFE8E5',
    color: '#991B1B',
    border: '1px solid #FFB5A7',
    borderRadius: '9999px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    boxShadow: '0 2px 6px rgba(255, 143, 130, 0.2)',
  },
  privacyNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '11px',
    color: '#706D73',
    lineHeight: '1.4',
    padding: '4px 8px',
    borderRadius: '8px',
    backgroundColor: 'rgba(37, 36, 42, 0.02)',
  },
  privacyLockIcon: {
    fontSize: '12px',
    marginTop: '1px',
    flexShrink: 0,
  },
  privacyText: {
    flex: 1,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  voiceSessionCard: {
    borderRadius: '12px',
    border: '1.5px solid',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    transition: 'all 0.2s ease',
  },
  voiceSessionLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  voiceIndicatorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  voicePulseDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
    boxShadow: '0 0 0 3px rgba(229, 72, 77, 0.25)',
  },
  voiceSessionStateText: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    color: '#25242A',
  },
  voiceTranscriptArea: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: '#4B4850',
    minHeight: '20px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  voiceInterimDraft: {
    color: '#D9483B',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  voiceListeningHint: {
    color: '#706D73',
    fontSize: '12px',
  },
  voiceSessionActions: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  stopListeningBtn: {
    backgroundColor: '#FFE8E5',
    color: '#991B1B',
    border: '1px solid #FFB5A7',
    borderRadius: '8px',
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s ease',
  },
};
