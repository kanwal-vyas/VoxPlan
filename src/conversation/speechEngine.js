/**
 * VoxPlan Voice Interaction & Speech Synthesis Engine (Phase 5, Stage 5.3)
 *
 * Implements deterministic browser-native Web Speech API controllers for:
 * 1. Speech Recognition Lifecycle: IDLE, LISTENING, PROCESSING, ERROR, UNSUPPORTED
 * 2. Speech Synthesis: Accessible, user-controlled spoken feedback with honest status summaries
 * 3. Privacy-Preserving: 0 cloud LLMs, 0 external speech providers, 0 audio telemetry
 */

export const RECOGNITION_STATES = Object.freeze({
  IDLE: 'IDLE',
  STARTING: 'STARTING',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
});

export const SPEECH_STORAGE_KEY = 'voxplan_speech_output_enabled';

/**
 * Strips markdown, emojis, HTML, and extra whitespace to produce clean speech text.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeForSpeech(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove code ticks and formatting markers
    .replace(/[`*_~#]/g, '')
    // Remove common emojis and non-speech symbols
    .replace(/[^\w\s.,!?'"–—:;()-]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates an honest, concise spoken summary for dialogue results.
 * Distinguishes proposed schedule changes from applied changes.
 * Never claims an action succeeded when it was only proposed or rejected.
 *
 * @param {Object} result - Result from dialogueManager.processInput
 * @param {Object} [options]
 * @param {string} [options.event] - Context override ('PROPOSAL_ACCEPTED', 'PROPOSAL_DISCARDED')
 * @returns {string} Clean, concise spoken text
 */
export function generateSpokenSummary(result, options = {}) {
  if (!result && !options.event) return '';

  if (options.event === 'PROPOSAL_ACCEPTED') {
    const count = options.proposal?.summary?.dateChangesCount ||
      options.proposal?.proposedPlacements?.length ||
      1;
    return `Schedule proposal applied. Updated ${count} task ${count === 1 ? 'deadline' : 'deadlines'}.`;
  }

  if (options.event === 'PROPOSAL_DISCARDED') {
    return 'Schedule proposal discarded. Your current schedule remains unchanged.';
  }

  const { state, responseText, action, proposal, isAuthorized, requiresConfirmation, requiresClarification } = result;

  // 1. Clarification Request
  if (state === 'AWAITING_CLARIFICATION' || requiresClarification) {
    if (result.clarificationType === 'AMBIGUOUS_TASK') {
      const count = result.candidateTasks?.length || 'multiple';
      return `Found ${count} matching tasks. Which task would you like to select?`;
    }
    if (result.clarificationType === 'MISSING_DATE') {
      const taskTitle = result.targetTask?.title ? `"${result.targetTask.title}"` : 'this task';
      return `What date should I reschedule ${taskTitle} to?`;
    }
    return sanitizeForSpeech(responseText) || 'Please clarify your request.';
  }

  // 2. Consequential Action Confirmation Request
  if (state === 'AWAITING_CONFIRMATION' || requiresConfirmation) {
    const clean = sanitizeForSpeech(responseText);
    return `${clean} Say yes to confirm, or no to cancel.`;
  }

  // 2b. Explicit Concise Spoken Summary (Conversational Explanations & Debriefs)
  if (result.spokenSummary) {
    return sanitizeForSpeech(result.spokenSummary);
  }

  // 3. Schedule Proposal Pending Review (CRITICAL: Never claim schedule was applied!)
  if (state === 'AWAITING_PROPOSAL_DECISION' || proposal) {
    const prop = proposal || result.action?.proposal;
    const status = prop?.summary?.feasibilityStatus;
    const count = prop?.summary?.dateChangesCount || prop?.proposedPlacements?.length || 1;

    if (status === 'infeasible_dependency') {
      return `Dependency conflict detected. A prerequisite task is scheduled after the proposed date. Say discard or choose another date.`;
    }
    if (status === 'capacity_warning') {
      return `Proposed schedule exceeds daily capacity on some days. Say accept to apply anyway, or discard to cancel.`;
    }
    return `Proposed schedule change for ${count} ${count === 1 ? 'task' : 'tasks'}. Say accept to apply, or discard to cancel.`;
  }

  // 4. Executed Action Outcomes
  if (isAuthorized && action) {
    if (action.type === 'DELETE_TASK') {
      return `Task deleted.`;
    }
    if (action.type === 'COMPLETE_TASK') {
      return `Marked task complete.`;
    }
    if (action.type === 'CREATE_TASK') {
      const title = action.title ? `"${action.title}"` : 'task';
      return `Created new ${title}.`;
    }
    if (action.type === 'REOPEN_TASK') {
      return `Reopened task.`;
    }
  }

  // 5. Standard Informative Response
  return sanitizeForSpeech(responseText);
}

/**
 * Controller managing browser speech recognition lifecycle.
 */
export class VoiceRecognitionController {
  constructor({
    getSpeechRecognition = null,
    onStateChange = () => {},
    onResult = () => {},
    onInterimResult = () => {},
    onError = () => {},
    lang = 'en-US',
    continuous = false,
    silenceTimeoutMs = 1200,
  } = {}) {
    this._getSpeechRecognition =
      getSpeechRecognition ||
      (() => {
        if (typeof window === 'undefined') return null;
        return window.SpeechRecognition || window.webkitSpeechRecognition || null;
      });
    this._onStateChange = onStateChange;
    this._onResult = onResult;
    this._onInterimResult = onInterimResult;
    this._onError = onError;
    this.lang = lang;
    this.continuous = continuous;
    this.silenceTimeoutMs = silenceTimeoutMs;

    this.state = RECOGNITION_STATES.IDLE;
    this.activeSession = null;
    this.sessionId = 0;
    this._isStarting = false;
    this._visibilityHandler = null;
    this._silenceTimer = null;

    this._initVisibilityListener();
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  _initVisibilityListener() {
    if (typeof document !== 'undefined' && document.addEventListener) {
      this._visibilityHandler = () => {
        if (document.hidden && (this.state === RECOGNITION_STATES.LISTENING || this.state === RECOGNITION_STATES.STARTING || this._isStarting)) {
          this.stop();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  isSupported() {
    const SpeechRecognition = this._getSpeechRecognition();
    return Boolean(SpeechRecognition);
  }

  getState() {
    return this.state;
  }

  _setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this._onStateChange(newState);
    }
  }

  /**
   * Starts a speech recognition session if not already listening.
   * Never starts automatically; requires explicit user action.
   */
  start() {
    const SpeechRecognition = this._getSpeechRecognition();
    if (!SpeechRecognition) {
      this._setState(RECOGNITION_STATES.UNSUPPORTED);
      this._onError({
        code: 'unsupported',
        message: 'Speech recognition is not supported in this browser. Please use keyboard input.',
      });
      return false;
    }

    // Prevent duplicate sessions or race condition on rapid clicks
    if (this._isStarting || this.state === RECOGNITION_STATES.LISTENING || this.state === RECOGNITION_STATES.STARTING || this.state === RECOGNITION_STATES.PROCESSING) {
      return false;
    }

    this._isStarting = true;
    this.sessionId += 1;
    const currentSessionId = this.sessionId;
    let dispatchedInSession = false;
    let hasReceivedInterim = false;

    this._clearSilenceTimer();
    this._setState(RECOGNITION_STATES.STARTING);

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = this.continuous;
      recognition.interimResults = true;
      recognition.lang = this.lang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (this.sessionId !== currentSessionId) return;
        this._isStarting = false;
        this._setState(RECOGNITION_STATES.LISTENING);
      };

      // Native browser speech-end detection: fires when speaker finishes utterance
      recognition.onspeechend = () => {
        if (this.sessionId !== currentSessionId) return;
        if (this.activeSession && !dispatchedInSession) {
          try {
            this.activeSession.stop();
          } catch {}
        }
      };

      recognition.onsoundend = () => {
        if (this.sessionId !== currentSessionId) return;
        if (this.activeSession && !dispatchedInSession && hasReceivedInterim) {
          try {
            this.activeSession.stop();
          } catch {}
        }
      };

      recognition.onresult = (event) => {
        if (this.sessionId !== currentSessionId) return;
        if (dispatchedInSession) return;
        this._isStarting = false;

        let hasFinalResult = false;
        let finalTranscript = '';
        let interimTranscript = '';

        if (event.results && event.results.length > 0) {
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              hasFinalResult = true;
              finalTranscript += (res[0]?.transcript || '') + ' ';
            } else {
              interimTranscript += (res[0]?.transcript || '') + ' ';
            }
          }
        }

        // Notify draft transcript for non-executable UI preview
        const trimmedInterim = interimTranscript.trim();
        if (trimmedInterim) {
          hasReceivedInterim = true;
          this._onInterimResult(trimmedInterim);

          // Bounded silence debounce: finalize turn if no new results arrive within silenceTimeoutMs
          this._clearSilenceTimer();
          this._silenceTimer = setTimeout(() => {
            if (this.sessionId === currentSessionId && this.activeSession && !dispatchedInSession) {
              try {
                this.activeSession.stop();
              } catch {}
            }
          }, this.silenceTimeoutMs);
        }

        const trimmedFinal = finalTranscript.trim();
        if (!trimmedFinal) {
          if (hasFinalResult && !trimmedInterim) {
            this._clearSilenceTimer();
            this._setState(RECOGNITION_STATES.IDLE);
          }
          return;
        }

        // Single dispatch: guarantee utterance is processed exactly once
        dispatchedInSession = true;
        this._clearSilenceTimer();
        this._setState(RECOGNITION_STATES.PROCESSING);
        this._onInterimResult('');

        try {
          // Stop further recording so this utterance is finalized
          if (this.activeSession) {
            try {
              this.activeSession.stop();
            } catch {}
          }
          this._onResult(trimmedFinal);
        } finally {
          this._setState(RECOGNITION_STATES.IDLE);
          this.activeSession = null;
        }
      };

      recognition.onerror = (event) => {
        if (this.sessionId !== currentSessionId) return;
        this._clearSilenceTimer();
        this._isStarting = false;

        const errorType = event.error || 'unknown';
        if (errorType === 'no-speech' || errorType === 'aborted') {
          // Normal timeout with no speech detected or cleanly aborted; transition quietly to IDLE
          this._onInterimResult('');
          this._setState(RECOGNITION_STATES.IDLE);
          if (errorType === 'no-speech') {
            this._onError({
              code: 'no-speech',
              message: 'No speech was detected. Please try speaking again or type your command.',
            });
          }
          return;
        }

        this._onInterimResult('');
        this._setState(RECOGNITION_STATES.ERROR);
        let userMessage = `Voice recognition error: ${errorType}`;
        if (errorType === 'not-allowed') {
          userMessage = 'Microphone permission was denied. Please allow microphone access or type your command.';
        } else if (errorType === 'network') {
          userMessage = 'Speech recognition network connection failed. You can type your command.';
        } else if (errorType === 'audio-capture') {
          userMessage = 'No microphone was detected. Please connect a microphone or use keyboard input.';
        }

        this._onError({
          code: errorType,
          message: userMessage,
        });
      };

      recognition.onend = () => {
        if (this.sessionId !== currentSessionId) return;
        this._clearSilenceTimer();
        this._isStarting = false;
        this._onInterimResult('');
        if (this.state === RECOGNITION_STATES.LISTENING || this.state === RECOGNITION_STATES.STARTING || this.state === RECOGNITION_STATES.PROCESSING) {
          this._setState(RECOGNITION_STATES.IDLE);
        }
        this.activeSession = null;
      };

      this.activeSession = recognition;
      recognition.start();
      return true;
    } catch (err) {
      this._clearSilenceTimer();
      this._isStarting = false;
      this._onInterimResult('');
      this._setState(RECOGNITION_STATES.ERROR);
      this._onError({
        code: 'start_failed',
        message: `Could not start voice recognition: ${err.message}`,
      });
      return false;
    }
  }

  /**
   * Stops the active speech recognition session immediately.
   */
  stop() {
    this.sessionId += 1; // Invalidate current session callbacks
    this._clearSilenceTimer();
    this._isStarting = false;
    this._onInterimResult('');
    if (this.activeSession) {
      try {
        if (typeof this.activeSession.abort === 'function') {
          this.activeSession.abort();
        } else {
          this.activeSession.stop();
        }
      } catch {}
      this.activeSession = null;
    }
    this._setState(RECOGNITION_STATES.IDLE);
  }

  /**
   * Cleans up all listeners and aborts any active session.
   */
  destroy() {
    this.stop();
    if (this._visibilityHandler && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }
}

/**
 * Controller managing browser speech synthesis (text-to-speech).
 */
export class SpeechSynthesisController {
  constructor({
    getSpeechSynthesis = null,
    getSpeechSynthesisUtterance = null,
    storage = null,
    onSpeakingChange = () => {},
  } = {}) {
    this._getSpeechSynthesis =
      getSpeechSynthesis ||
      (() => {
        if (typeof window === 'undefined') return null;
        return window.speechSynthesis || null;
      });

    this._getSpeechSynthesisUtterance =
      getSpeechSynthesisUtterance ||
      (() => {
        if (typeof window === 'undefined') return null;
        return window.SpeechSynthesisUtterance || null;
      });

    this._storage =
      storage ||
      (typeof localStorage !== 'undefined' ? localStorage : null);

    this._onSpeakingChange = onSpeakingChange;
    this.isSpeaking = false;
    this.lastSpokenText = null;
    this.lastSpokenTimestamp = 0;

    // Load initial preference (default: false for conservative, non-intrusive behavior)
    this.isEnabled = this._loadPreference();
  }

  _loadPreference() {
    try {
      if (this._storage) {
        const stored = this._storage.getItem(SPEECH_STORAGE_KEY);
        return stored === 'true';
      }
    } catch {}
    return false;
  }

  isSupported() {
    const synth = this._getSpeechSynthesis();
    const Utterance = this._getSpeechSynthesisUtterance();
    return Boolean(synth && Utterance);
  }

  setEnabled(enabled) {
    this.isEnabled = Boolean(enabled);
    try {
      if (this._storage) {
        this._storage.setItem(SPEECH_STORAGE_KEY, String(this.isEnabled));
      }
    } catch {}

    if (!this.isEnabled) {
      this.stop();
    }
  }

  getEnabled() {
    return this.isEnabled;
  }

  _setSpeaking(speaking) {
    if (this.isSpeaking !== speaking) {
      this.isSpeaking = speaking;
      this._onSpeakingChange(speaking);
    }
  }

  /**
   * Speaks the provided text if speech output is enabled.
   * Cancels any previously queued or active speech to avoid overlaps.
   *
   * @param {string} text - The text to speak
   * @param {Object} [options]
   * @param {boolean} [options.force] - Speak even if normally disabled (e.g. preview)
   * @returns {boolean} Whether speech was initiated
   */
  speak(text, { force = false } = {}) {
    if (!text || (!this.isEnabled && !force)) {
      return false;
    }

    const cleanText = sanitizeForSpeech(text);
    if (!cleanText) return false;

    // Prevent immediate duplicate utterance within 800ms
    const now = Date.now();
    if (cleanText === this.lastSpokenText && now - this.lastSpokenTimestamp < 800) {
      return false;
    }

    const synth = this._getSpeechSynthesis();
    const Utterance = this._getSpeechSynthesisUtterance();
    if (!synth || !Utterance) {
      return false;
    }

    // Cancel existing speech immediately
    try {
      synth.cancel();
    } catch {}

    try {
      const utterance = new Utterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        this._setSpeaking(true);
      };

      utterance.onend = () => {
        this._setSpeaking(false);
      };

      utterance.onerror = () => {
        this._setSpeaking(false);
      };

      this.lastSpokenText = cleanText;
      this.lastSpokenTimestamp = now;

      synth.speak(utterance);
      return true;
    } catch {
      this._setSpeaking(false);
      return false;
    }
  }

  /**
   * Cancels any currently active or queued speech.
   */
  stop() {
    const synth = this._getSpeechSynthesis();
    if (synth) {
      try {
        synth.cancel();
      } catch {}
    }
    this._setSpeaking(false);
  }

  destroy() {
    this.stop();
  }
}
