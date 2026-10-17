/**
 * VoxPlan Conversational Planning Dialogue Manager
 * Phase 5, Stage 5.1: Conversational Planning State Machine & Turn Management
 *
 * Implements a deterministic, finite-state dialogue manager for multi-turn task interactions.
 * - Ephemeral in-memory state tracking: active subject task, pending intent, clarification stack, and pending confirmation.
 * - Deterministic pronoun / context resolution ("it", "this task", etc.).
 * - Explicit confirmation protocols for consequential actions (deletion, bulk clear, history reset).
 * - Ambiguous task references trigger clarification questions rather than arbitrary choices.
 * - Inactivity timeout (default: 5 minutes) with injectable clock for deterministic testing.
 * - Clean separation: dialogue interpretation and state transitions return structured contracts,
 *   while persistent task mutations remain strictly within domain lifecycle handlers.
 * - Zero external LLM calls; zero telemetry storage of transcripts.
 */

import { parseScheduleIntent, SCHEDULE_INTENTS } from './scheduleIntentParser.js';
import { negotiateScheduleProposal } from './scheduleNegotiator.js';

export const CONVERSATION_STATES = Object.freeze({
  IDLE: 'IDLE',
  AWAITING_CLARIFICATION: 'AWAITING_CLARIFICATION',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  AWAITING_PROPOSAL_DECISION: 'AWAITING_PROPOSAL_DECISION',
});

export const CONVERSATION_INTENTS = Object.freeze({
  CREATE_TASK: 'CREATE_TASK',
  COMPLETE_TASK: 'COMPLETE_TASK',
  REOPEN_TASK: 'REOPEN_TASK',
  DELETE_TASK: 'DELETE_TASK',
  CLEAR_COMPLETED: 'CLEAR_COMPLETED',
  CLEAR_HISTORY: 'CLEAR_HISTORY',
  DESCRIBE_TASK: 'DESCRIBE_TASK',
  RESCHEDULE_TASK: 'RESCHEDULE_TASK',
  REVISE_EFFORT: 'REVISE_EFFORT',
  TRAIN_MODEL: 'TRAIN_MODEL',
  PREDICT_RISK: 'PREDICT_RISK',
  OPEN_SCHEDULER: 'OPEN_SCHEDULER',
  FILTER_HIGH_RISK: 'FILTER_HIGH_RISK',
  SHOW_METRICS: 'SHOW_METRICS',
  SHOW_IMPORTANCE: 'SHOW_IMPORTANCE',
  EXPLAIN_RISK: 'EXPLAIN_RISK',
  SCHEDULE_NEGOTIATION: 'SCHEDULE_NEGOTIATION',
  ACCEPT_PROPOSAL: 'ACCEPT_PROPOSAL',
  DISCARD_PROPOSAL: 'DISCARD_PROPOSAL',
  SIMULATE_SCHEDULE: 'SIMULATE_SCHEDULE',
  QUERY_CAPACITY: 'QUERY_CAPACITY',
  CONFIRM: 'CONFIRM',
  CANCEL: 'CANCEL',
  HELP: 'HELP',
  UNKNOWN: 'UNKNOWN',
});

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Natural language relative and absolute date parser.
 * Deterministic helper converting common date expressions into ISO YYYY-MM-DD format.
 */
export function parseDateExpression(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : new Date();

  const formatISO = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Direct ISO match YYYY-MM-DD
  const isoMatch = clean.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const d = new Date(isoMatch[1] + 'T00:00:00');
    if (!isNaN(d.getTime())) return isoMatch[1];
  }

  // Today
  if (/\b(?:due\s+)?today\b/i.test(clean)) {
    return formatISO(now);
  }

  // Tomorrow
  if (/\b(?:due\s+)?tomorrow\b/i.test(clean)) {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    return formatISO(d);
  }

  // in X days
  const inDaysMatch = clean.match(/\b(?:due\s+in|in)\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(now);
    d.setDate(now.getDate() + days);
    return formatISO(d);
  }

  // Next week (7 days)
  if (/\b(?:due\s+)?next\s+week\b/i.test(clean)) {
    const d = new Date(now);
    d.setDate(now.getDate() + 7);
    return formatISO(d);
  }

  // Day of week (e.g., "due Friday", "next Monday")
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = clean.match(/\b(?:due\s+(?:on\s+)?)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (dayMatch) {
    const targetDayIndex = weekdayNames.indexOf(dayMatch[1].toLowerCase());
    if (targetDayIndex !== -1) {
      const currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) diff += 7;
      if (/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(clean) && diff < 7) {
        diff += 7;
      }
      const d = new Date(now);
      d.setDate(now.getDate() + diff);
      return formatISO(d);
    }
  }

  // Human date like "October 25" or "Oct 25, 2026"
  const humanDateMatch = clean.match(/\b(?:due\s+(?:on\s+)?)?([a-zA-Z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?)\b/i);
  if (humanDateMatch) {
    const cleanDateStr = humanDateMatch[1].replace(/(?:st|nd|rd|th)/gi, '');
    const parsed = new Date(cleanDateStr);
    if (!isNaN(parsed.getTime())) {
      if (!cleanDateStr.match(/\d{4}/)) {
        parsed.setFullYear(now.getFullYear());
        if (parsed.getTime() < now.getTime() - 86400000) {
          parsed.setFullYear(now.getFullYear() + 1);
        }
      }
      return formatISO(parsed);
    }
  }

  return null;
}

/**
 * Deterministic Dialogue Manager Class
 */
export class DialogueManager {
  /**
   * @param {Object} options
   * @param {number} [options.timeoutMs] Inactivity timeout in ms (default: 300000 = 5 min)
   * @param {Function} [options.clock] Clock function returning current timestamp in ms
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.clock = typeof options.clock === 'function' ? options.clock : () => Date.now();

    this.state = CONVERSATION_STATES.IDLE;
    this.activeSubjectTaskId = null;
    this.pendingIntent = null;
    this.pendingAction = null;
    this.pendingClarification = null;
    this.activeProposal = null;
    this.proposalHistory = [];
    this.lastActivityTimestamp = this.clock();
  }

  /**
   * Check if dialogue context has expired due to inactivity.
   * If expired, resets context to IDLE.
   * @returns {boolean} True if state was reset due to timeout
   */
  checkTimeout() {
    const now = this.clock();
    if (this.state !== CONVERSATION_STATES.IDLE || this.activeSubjectTaskId !== null || this.activeProposal !== null) {
      if (now - this.lastActivityTimestamp >= this.timeoutMs) {
        this.reset();
        return true;
      }
    }
    return false;
  }

  /**
   * Ephemeral reset to IDLE state.
   */
  reset() {
    this.state = CONVERSATION_STATES.IDLE;
    this.activeSubjectTaskId = null;
    this.pendingIntent = null;
    this.pendingAction = null;
    this.pendingClarification = null;
    this.activeProposal = null;
    this.lastActivityTimestamp = this.clock();
  }

  /**
   * Returns a snapshot of current conversation context.
   */
  getContext() {
    this.checkTimeout();
    return {
      state: this.state,
      activeSubjectTaskId: this.activeSubjectTaskId,
      pendingIntent: this.pendingIntent ? { ...this.pendingIntent } : null,
      pendingAction: this.pendingAction ? { ...this.pendingAction } : null,
      pendingClarification: this.pendingClarification ? { ...this.pendingClarification } : null,
      activeProposal: this.activeProposal ? { ...this.activeProposal } : null,
      lastActivityTimestamp: this.lastActivityTimestamp,
    };
  }

  /**
   * Invalidate any context that refers to a specific task (e.g. after deletion).
   * @param {string} taskId
   */
  invalidateTask(taskId) {
    if (!taskId) return;
    if (this.activeSubjectTaskId === taskId) {
      this.activeSubjectTaskId = null;
    }
    if (this.pendingAction && this.pendingAction.targetTaskId === taskId) {
      this.pendingAction = null;
      if (this.state === CONVERSATION_STATES.AWAITING_CONFIRMATION) {
        this.state = CONVERSATION_STATES.IDLE;
      }
    }
    if (this.pendingClarification && (this.pendingClarification.targetTaskId === taskId || this.pendingClarification.targetTask?.id === taskId)) {
      this.pendingClarification = null;
      if (this.state === CONVERSATION_STATES.AWAITING_CLARIFICATION) {
        this.state = CONVERSATION_STATES.IDLE;
      }
    }
    if (this.pendingIntent && (this.pendingIntent.targetTaskId === taskId || this.pendingIntent.targetTask?.id === taskId)) {
      this.pendingIntent = null;
      this.state = CONVERSATION_STATES.IDLE;
    }
    if (this.activeProposal) {
      const placements = this.activeProposal.proposedPlacements || this.activeProposal.placements || [];
      if (placements.some((p) => p.taskId === taskId)) {
        this.activeProposal = null;
        if (this.state === CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION) {
          this.state = CONVERSATION_STATES.IDLE;
        }
      }
    }
  }

  /**
   * Synchronize active context with available tasks.
   * Clears context if the active subject task no longer exists.
   * @param {Array<Object>} tasks
   */
  syncTasks(tasks = []) {
    if (this.activeSubjectTaskId) {
      const exists = tasks.some((t) => t.id === this.activeSubjectTaskId);
      if (!exists) {
        this.activeSubjectTaskId = null;
      }
    }
  }

  /**
   * Explicitly set the active subject task (e.g., after task creation or selection).
   * @param {string|Object} taskOrId
   */
  setActiveSubject(taskOrId) {
    if (!taskOrId) {
      this.activeSubjectTaskId = null;
      return;
    }
    const id = typeof taskOrId === 'object' ? taskOrId.id : taskOrId;
    this.activeSubjectTaskId = id || null;
    this.lastActivityTimestamp = this.clock();
  }

  /**
   * Resolve a task name or reference deterministically against the provided task list.
   * Supports:
   * 1. Pronoun/anaphoric reference ("it", "this", "that", "this task") -> resolves to activeSubjectTaskId
   * 2. Exact match (case-insensitive)
   * 3. Exact stripped match (omitting leading 'the', 'a', 'an')
   * 4. Substring / keyword matches with ambiguity detection (returns all matches if > 1)
   *
   * @param {string} query
   * @param {Array<Object>} tasks
   * @returns {Object} Resolution result:
   *   { status: 'exact', task, isContextual: boolean }
   *   { status: 'ambiguous', matches: Array<Object> }
   *   { status: 'not_found' }
   *   { status: 'missing_context', reason: string }
   */
  resolveTaskReference(query, tasks = []) {
    if (!query || typeof query !== 'string') {
      return { status: 'not_found' };
    }
    const clean = query.trim().toLowerCase();

    // Check for pronoun or contextual reference
    const isPronoun = /^(?:it|this|that|this\s+task|that\s+task|the\s+task)$/i.test(clean);
    if (isPronoun) {
      if (!this.activeSubjectTaskId) {
        return { status: 'missing_context', reason: 'no_active_subject' };
      }
      const contextualTask = tasks.find((t) => t.id === this.activeSubjectTaskId);
      if (!contextualTask) {
        this.activeSubjectTaskId = null;
        return { status: 'missing_context', reason: 'task_deleted' };
      }
      return { status: 'exact', task: contextualTask, isContextual: true };
    }

    // Exact title match (case-insensitive)
    const exact = tasks.find((t) => t.title.trim().toLowerCase() === clean);
    if (exact) {
      return { status: 'exact', task: exact, isContextual: false };
    }

    // Exact stripped title match (omitting 'the', 'a', 'an')
    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
    const strippedMatches = tasks.filter(
      (t) => t.title.trim().toLowerCase().replace(/^(?:the|a|an)\s+/i, '') === stripped
    );
    if (strippedMatches.length === 1) {
      return { status: 'exact', task: strippedMatches[0], isContextual: false };
    }
    if (strippedMatches.length > 1) {
      return { status: 'ambiguous', matches: strippedMatches };
    }

    // Substring / keyword matches
    const substringMatches = tasks.filter((t) => {
      const titleLower = t.title.trim().toLowerCase();
      return titleLower.includes(clean) || clean.includes(titleLower);
    });

    if (substringMatches.length === 1) {
      return { status: 'exact', task: substringMatches[0], isContextual: false };
    }
    if (substringMatches.length > 1) {
      return { status: 'ambiguous', matches: substringMatches };
    }

    return { status: 'not_found' };
  }

  /**
   * Main interaction entry point. Processes raw text input deterministically.
   *
   * @param {string} rawText User input (typed or recognized voice text)
   * @param {Object} context Context object containing tasks and helper state
   * @param {Array<Object>} context.tasks Active task list
   * @param {Object} [context.riskStats] Optional project risk stats
   * @param {Object} [context.modelStatus] Optional ML model status
   * @returns {Object} Structured DialogueResult:
   *   {
   *     state: string,
   *     intent: string,
   *     targetTask: Object|null,
   *     responseText: string,
   *     feedbackType: 'info'|'success'|'error'|'warning',
   *     requiresConfirmation: boolean,
   *     isAuthorized: boolean,
   *     action: Object|null,
   *     error: string|null
   *   }
   */
  processInput(rawText, context = {}) {
    const tasks = Array.isArray(context.tasks) ? context.tasks : [];

    // First check timeout
    this.checkTimeout();
    this.syncTasks(tasks);

    const text = typeof rawText === 'string' ? rawText.trim().replace(/[.!?]+$/, '') : '';
    if (!text) {
      return {
        state: this.state,
        intent: null,
        targetTask: null,
        responseText: 'Please enter a command or task question.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // Update activity timestamp on valid input
    this.lastActivityTimestamp = this.clock();

    // Route based on current finite dialogue state
    if (this.state === CONVERSATION_STATES.AWAITING_CONFIRMATION) {
      return this._handleAwaitingConfirmation(text, tasks);
    }

    if (this.state === CONVERSATION_STATES.AWAITING_CLARIFICATION) {
      return this._handleAwaitingClarification(text, tasks, context);
    }

    if (this.state === CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION) {
      return this._handleAwaitingProposalDecision(text, tasks, context);
    }

    // Check if input is a schedule negotiation intent
    let activeSubjectTask = null;
    if (this.activeSubjectTaskId) {
      activeSubjectTask = tasks.find((t) => t.id === this.activeSubjectTaskId) || null;
    }
    if (!activeSubjectTask && this.activeProposal && this.activeProposal.proposedPlacements?.length > 0) {
      const pId = this.activeProposal.proposedPlacements[0].taskId;
      activeSubjectTask = tasks.find((t) => t.id === pId) || null;
    }

    const schedIntent = parseScheduleIntent(text, {
      activeSubjectTask,
      tasks,
      clock: this.clock,
    });

    if (schedIntent.intent !== SCHEDULE_INTENTS.UNSUPPORTED) {
      return this._handleScheduleIntent(schedIntent, text, tasks, context);
    }

    // Otherwise state is IDLE -> parse standard commands
    return this._handleIdleState(text, tasks, context);
  }

  /**
   * Handle confirmation input while in AWAITING_CONFIRMATION state.
   * @private
   */
  _handleAwaitingConfirmation(text, tasks) {
    const pending = this.pendingAction;
    if (!pending) {
      this.state = CONVERSATION_STATES.IDLE;
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CANCEL,
        targetTask: null,
        responseText: 'No pending action awaiting confirmation.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // Verify target task still exists if task-bound
    if (pending.targetTaskId) {
      const taskExists = tasks.some((t) => t.id === pending.targetTaskId);
      if (!taskExists) {
        this.state = CONVERSATION_STATES.IDLE;
        this.pendingAction = null;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.CANCEL,
          targetTask: null,
          responseText: 'The referenced task is no longer available. Action cancelled.',
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'task_unavailable',
        };
      }
    }

    // Affirmative confirmation check
    const isAffirmative = /^(?:yes|y|confirm|proceed|sure|ok|okay|do\s+it|affirmative|yep|yeah)$/i.test(text);
    if (isAffirmative) {
      const authorizedAction = { ...pending };
      // Prevent duplicate execution by clearing pending action immediately
      this.pendingAction = null;
      this.state = CONVERSATION_STATES.IDLE;

      // Invalidate active subject if deleting that task
      if (authorizedAction.type === CONVERSATION_INTENTS.DELETE_TASK && authorizedAction.targetTaskId) {
        this.invalidateTask(authorizedAction.targetTaskId);
      }

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: authorizedAction.type,
        targetTask: authorizedAction.targetTask || null,
        responseText: authorizedAction.confirmMessage || 'Action confirmed and executed.',
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: authorizedAction,
        error: null,
      };
    }

    // Explicit cancellation check
    const isNegative = /^(?:no|n|cancel|stop|abort|nevermind|don't|do\s+not)$/i.test(text);
    if (isNegative) {
      this.pendingAction = null;
      this.state = CONVERSATION_STATES.IDLE;
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CANCEL,
        targetTask: null,
        responseText: 'Action cancelled. No changes were made.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // Unrelated / invalid input: do NOT execute. Keep awaiting confirmation.
    return {
      state: CONVERSATION_STATES.AWAITING_CONFIRMATION,
      intent: null,
      targetTask: pending.targetTask || null,
      responseText: `Pending confirmation: ${pending.prompt} Please reply "yes" to confirm or "no" to cancel.`,
      feedbackType: 'warning',
      requiresConfirmation: true,
      isAuthorized: false,
      action: null,
      error: 'invalid_confirmation_response',
    };
  }

  /**
   * Handle clarification input while in AWAITING_CLARIFICATION state.
   * @private
   */
  _handleAwaitingClarification(text, tasks, context) {
    const clarification = this.pendingClarification;
    const pendingIntent = this.pendingIntent;

    // Check for explicit cancellation
    if (/^(?:cancel|stop|abort|nevermind|exit)$/i.test(text)) {
      this.state = CONVERSATION_STATES.IDLE;
      this.pendingClarification = null;
      this.pendingIntent = null;
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CANCEL,
        targetTask: null,
        responseText: 'Clarification cancelled. Dialogue reset to idle.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    if (!clarification || !pendingIntent) {
      this.state = CONVERSATION_STATES.IDLE;
      return this._handleIdleState(text, tasks, context);
    }

    // 1. Missing target task resolution
    if (clarification.missingField === 'targetTask') {
      if (clarification.schedIntent) {
        const resolution = this.resolveTaskReference(text, clarification.candidateTasks || tasks);
        if (resolution.status === 'exact') {
          const target = resolution.task;
          this.state = CONVERSATION_STATES.IDLE;
          this.pendingClarification = null;
          this.pendingIntent = null;
          this.activeSubjectTaskId = target.id;
          clarification.schedIntent.params.targetTaskQuery = target.title;
          return this._handleScheduleIntent(clarification.schedIntent, text, tasks, context);
        }
        if (resolution.status === 'ambiguous') {
          const titleList = resolution.matches.map((m) => `"${m.title}"`).join(', ');
          return {
            state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
            intent: pendingIntent.intent,
            targetTask: null,
            responseText: `Multiple tasks matched "${text}": ${titleList}. Which one did you mean? (or say "cancel")`,
            feedbackType: 'warning',
            requiresConfirmation: false,
            isAuthorized: false,
            action: null,
            error: 'ambiguous_reference',
          };
        }
        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: pendingIntent.intent,
          targetTask: null,
          responseText: `Could not find a task matching "${text}". Please specify the full task title or say "cancel".`,
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'task_not_found',
        };
      }

      const resolution = this.resolveTaskReference(text, tasks);
      if (resolution.status === 'exact') {
        const target = resolution.task;
        this.state = CONVERSATION_STATES.IDLE;
        this.pendingClarification = null;
        this.pendingIntent = null;
        this.activeSubjectTaskId = target.id;

        // Resume the pending intent with the resolved target task
        return this._dispatchIntentWithTarget(pendingIntent.intent, target, pendingIntent.params, tasks);
      }

      if (resolution.status === 'ambiguous') {
        const titleList = resolution.matches.map((m) => `"${m.title}"`).join(', ');
        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: pendingIntent.intent,
          targetTask: null,
          responseText: `Multiple tasks matched "${text}": ${titleList}. Which one did you mean? (or say "cancel")`,
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'ambiguous_reference',
        };
      }

      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent: pendingIntent.intent,
        targetTask: null,
        responseText: `Could not find a task matching "${text}". Please specify the full task title or say "cancel".`,
        feedbackType: 'error',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'task_not_found',
      };
    }

    // 2. Missing due date resolution
    if (clarification.missingField === 'dueDate') {
      const parsedDate = parseDateExpression(text, new Date(this.clock()));
      if (parsedDate) {
        if (clarification.schedIntent) {
          const target = clarification.targetTask;
          this.state = CONVERSATION_STATES.IDLE;
          this.pendingClarification = null;
          this.pendingIntent = null;
          if (target) this.activeSubjectTaskId = target.id;
          clarification.schedIntent.intent = SCHEDULE_INTENTS.DIRECT_RESCHEDULE;
          clarification.schedIntent.params.targetDate = parsedDate;
          return this._handleScheduleIntent(clarification.schedIntent, text, tasks, context);
        }

        const target = clarification.targetTask;
        this.state = CONVERSATION_STATES.IDLE;
        this.pendingClarification = null;
        this.pendingIntent = null;
        this.activeSubjectTaskId = target.id;

        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.RESCHEDULE_TASK,
          targetTask: target,
          responseText: `Rescheduling "${target.title}" to ${parsedDate}.`,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: true,
          action: {
            type: CONVERSATION_INTENTS.RESCHEDULE_TASK,
            taskId: target.id,
            targetTask: target,
            newDueDate: parsedDate,
          },
          error: null,
        };
      }

      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent: pendingIntent.intent,
        targetTask: clarification.targetTask,
        responseText: `Could not understand the date "${text}". Please provide a date like "tomorrow", "next Monday", or "YYYY-MM-DD" (or say "cancel").`,
        feedbackType: 'error',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'invalid_date',
      };
    }

    // 3. Missing task title for creation
    if (clarification.missingField === 'taskTitle') {
      const rawTitle = text.trim();
      if (!rawTitle) {
        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: CONVERSATION_INTENTS.CREATE_TASK,
          targetTask: null,
          responseText: 'Please provide a non-empty task name (or say "cancel").',
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'empty_title',
        };
      }

      this.state = CONVERSATION_STATES.IDLE;
      this.pendingClarification = null;
      this.pendingIntent = null;

      const parsedDate = parseDateExpression(rawTitle, new Date(this.clock()));
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CREATE_TASK,
        targetTask: null,
        responseText: `Creating task: "${rawTitle}"`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: CONVERSATION_INTENTS.CREATE_TASK,
          title: rawTitle,
          dueDate: parsedDate || null,
          priority: 'medium',
          estimatedEffort: null,
        },
        error: null,
      };
    }

    // Fallback: reset to IDLE and process text normally
    this.state = CONVERSATION_STATES.IDLE;
    return this._handleIdleState(text, tasks, context);
  }

  /**
   * Handle user response when a schedule proposal is actively awaiting decision.
   * @private
   */
  _handleAwaitingProposalDecision(text, tasks, context) {
    const activeProp = this.activeProposal;

    // 1. Explicit Cancellation
    if (/^(?:cancel|nevermind|exit|stop)$/i.test(text)) {
      const discarded = activeProp ? {
        ...activeProp,
        status: 'discarded',
        discardedAt: this.clock(),
        discardReason: 'user_cancel',
      } : null;
      if (discarded) this.proposalHistory.push(discarded);
      this.activeProposal = null;
      this.state = CONVERSATION_STATES.IDLE;

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CANCEL,
        targetTask: null,
        proposal: discarded,
        responseText: 'Schedule proposal cancelled. Schedule remains unchanged.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: discarded ? {
          type: 'DISCARD_SCHEDULE_PROPOSAL',
          proposal: discarded,
          reason: 'user_cancel',
        } : null,
        error: null,
      };
    }

    // 2. Explicit Acceptance
    if (/^(?:accept(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|apply(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|yes|confirm(?:\s+proposal)?|looks?\s+good|proceed)$/i.test(text)) {
      if (!activeProp) {
        this.state = CONVERSATION_STATES.IDLE;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.ACCEPT_PROPOSAL,
          targetTask: null,
          responseText: 'No active schedule proposal to accept.',
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'no_active_proposal',
        };
      }

      const accepted = {
        ...activeProp,
        status: 'accepted',
        acceptedAt: this.clock(),
      };
      this.proposalHistory.push(accepted);
      this.activeProposal = null;
      this.state = CONVERSATION_STATES.IDLE;

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.ACCEPT_PROPOSAL,
        targetTask: null,
        proposal: accepted,
        responseText: `Applying schedule proposal (${accepted.summary?.dateChangesCount || 1} task changes).`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: 'ACCEPT_SCHEDULE_PROPOSAL',
          proposal: accepted,
        },
        error: null,
      };
    }

    // 3. Explicit Discard
    if (/^(?:discard(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|reject(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|no|keep\s+(?:existing|current)\s+schedule|don't\s+apply)$/i.test(text)) {
      if (!activeProp) {
        this.state = CONVERSATION_STATES.IDLE;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.DISCARD_PROPOSAL,
          targetTask: null,
          responseText: 'No active schedule proposal to discard.',
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }

      const discarded = {
        ...activeProp,
        status: 'discarded',
        discardedAt: this.clock(),
        discardReason: 'user_discard',
      };
      this.proposalHistory.push(discarded);
      this.activeProposal = null;
      this.state = CONVERSATION_STATES.IDLE;

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.DISCARD_PROPOSAL,
        targetTask: null,
        proposal: discarded,
        responseText: 'Schedule proposal discarded. Your current schedule remains unchanged.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: {
          type: 'DISCARD_SCHEDULE_PROPOSAL',
          proposal: discarded,
          reason: 'user_discard',
        },
        error: null,
      };
    }

    // 4. Revision or New Schedule Request
    let targetSubject = null;
    if (this.activeSubjectTaskId) {
      targetSubject = tasks.find((t) => t.id === this.activeSubjectTaskId) || null;
    }
    if (!targetSubject && activeProp && activeProp.proposedPlacements && activeProp.proposedPlacements.length > 0) {
      const primaryTaskId = activeProp.proposedPlacements[0].taskId;
      targetSubject = tasks.find((t) => t.id === primaryTaskId) || null;
    }

    const schedIntent = parseScheduleIntent(text, {
      activeSubjectTask: targetSubject,
      tasks,
      clock: this.clock,
    });

    if (schedIntent.intent !== SCHEDULE_INTENTS.UNSUPPORTED) {
      return this._handleScheduleIntent(schedIntent, text, tasks, context);
    }

    // 5. Unrelated command entered: supersede active proposal cleanly, reset, and execute
    if (activeProp) {
      const superseded = {
        ...activeProp,
        status: 'superseded',
        supersededAt: this.clock(),
        supersededReason: 'superseded_by_new_command',
      };
      this.proposalHistory.push(superseded);
      this.activeProposal = null;
    }
    this.state = CONVERSATION_STATES.IDLE;
    return this._handleIdleState(text, tasks, context);
  }

  /**
   * Handle scheduling intent execution, proposal generation, and negotiation.
   * @private
   */
  _handleScheduleIntent(schedIntent, text, tasks, context) {
    let activeSubjectTask = null;
    if (this.activeSubjectTaskId) {
      activeSubjectTask = tasks.find((t) => t.id === this.activeSubjectTaskId) || null;
    }
    if (!activeSubjectTask && this.activeProposal && this.activeProposal.proposedPlacements?.length > 0) {
      const pId = this.activeProposal.proposedPlacements[0].taskId;
      activeSubjectTask = tasks.find((t) => t.id === pId) || null;
    }

    const negotiation = negotiateScheduleProposal({
      intentResult: schedIntent,
      tasks,
      activeProposal: this.activeProposal,
      activeSubjectTask,
      options: {
        clock: this.clock,
        dailyCapacityHours: context.dailyCapacityHours,
        workingDays: context.workingDays,
        horizonDays: context.horizonDays,
        personalDurationModel: context.personalDurationModel,
      },
    });

    if (negotiation.requiresClarification) {
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingClarification = {
        clarificationType: negotiation.clarificationType,
        targetTask: negotiation.targetTask || null,
        targetTaskId: negotiation.targetTask?.id || null,
        candidateTasks: negotiation.candidateTasks || null,
        missingField: negotiation.clarificationType === 'MISSING_DATE' ? 'dueDate' : 'targetTask',
        schedIntent,
      };
      this.pendingIntent = {
        intent: schedIntent.intent,
        schedIntent,
      };
      if (negotiation.targetTask) {
        this.activeSubjectTaskId = negotiation.targetTask.id;
      }
      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent: schedIntent.intent,
        targetTask: negotiation.targetTask || null,
        responseText: negotiation.responseText,
        feedbackType: negotiation.feedbackType || 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: negotiation.clarificationType === 'AMBIGUOUS_TASK' ? 'ambiguous_reference' : 'missing_date',
      };
    }

    if (negotiation.proposal) {
      this.activeProposal = negotiation.proposal;
      this.state = CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION;

      if (negotiation.supersededProposal) {
        this.proposalHistory.push(negotiation.supersededProposal);
      }

      if (negotiation.targetTask) {
        this.activeSubjectTaskId = negotiation.targetTask.id;
      }

      return {
        state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
        intent: schedIntent.intent,
        targetTask: negotiation.targetTask || activeSubjectTask,
        proposal: negotiation.proposal,
        supersededProposal: negotiation.supersededProposal || null,
        responseText: negotiation.responseText,
        feedbackType: negotiation.feedbackType || 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    if (negotiation.isSimulationOnly || negotiation.isFeasibilityQuery) {
      if (negotiation.targetTask) {
        this.activeSubjectTaskId = negotiation.targetTask.id;
      }
      return {
        state: this.state,
        intent: schedIntent.intent,
        targetTask: negotiation.targetTask || activeSubjectTask,
        isSimulationOnly: negotiation.isSimulationOnly || false,
        isFeasibilityQuery: negotiation.isFeasibilityQuery || false,
        simulationResult: negotiation.simulationResult || null,
        queryResult: negotiation.queryResult || null,
        responseText: negotiation.responseText,
        feedbackType: negotiation.feedbackType || 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    if (negotiation.action) {
      if (negotiation.action.type === 'ACCEPT_SCHEDULE_PROPOSAL') {
        const propToApply = this.activeProposal || negotiation.action.proposal;
        if (propToApply) {
          this.proposalHistory.push({ ...propToApply, status: 'accepted', acceptedAt: this.clock() });
        }
        this.activeProposal = null;
        this.state = CONVERSATION_STATES.IDLE;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.ACCEPT_PROPOSAL,
          targetTask: activeSubjectTask,
          proposal: propToApply,
          responseText: negotiation.responseText,
          feedbackType: negotiation.feedbackType || 'success',
          requiresConfirmation: false,
          isAuthorized: true,
          action: {
            type: 'ACCEPT_SCHEDULE_PROPOSAL',
            proposal: propToApply,
          },
          error: null,
        };
      }

      if (negotiation.action.type === 'DISCARD_SCHEDULE_PROPOSAL') {
        const propToDiscard = this.activeProposal || negotiation.discardedProposal;
        if (propToDiscard) {
          this.proposalHistory.push({ ...propToDiscard, status: 'discarded', discardedAt: this.clock() });
        }
        this.activeProposal = null;
        this.state = CONVERSATION_STATES.IDLE;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.DISCARD_PROPOSAL,
          targetTask: activeSubjectTask,
          responseText: negotiation.responseText,
          feedbackType: negotiation.feedbackType || 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: {
            type: 'DISCARD_SCHEDULE_PROPOSAL',
            proposal: propToDiscard,
            reason: negotiation.action.reason || 'user_discard',
          },
          error: null,
        };
      }
    }

    return {
      state: this.state,
      intent: schedIntent.intent,
      targetTask: activeSubjectTask,
      responseText: negotiation.responseText || 'Could not process scheduling request.',
      feedbackType: negotiation.feedbackType || 'warning',
      requiresConfirmation: false,
      isAuthorized: false,
      action: null,
      error: negotiation.success ? null : 'scheduling_error',
    };
  }

  /**
   * Handle command parsing from IDLE state.
   * @private
   */
  _handleIdleState(text, tasks, context) {
    // 1. ML Command: Train/Retrain model
    if (/^(?:train|retrain|re-train)\s+(?:the\s+)?(?:ml\s+)?(?:model|random\s*forest|classifier)?$/i.test(text)) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.TRAIN_MODEL,
        targetTask: null,
        responseText: 'Training delay risk prediction model...',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.TRAIN_MODEL },
        error: null,
      };
    }

    // 2. ML Command: Predict delay risk
    if (/^(?:predict(?:\s+(?:delay\s+)?risk)?|run\s+predictions?|analyze\s+(?:project\s+)?risk|compute\s+risk|check\s+delays?)$/i.test(text)) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.PREDICT_RISK,
        targetTask: null,
        responseText: 'Computing delay risk predictions across all tasks...',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.PREDICT_RISK },
        error: null,
      };
    }

    // 3. Scheduler Command: Open Adaptive Sprint Scheduler
    if (/^(?:plan\s+sprint|adaptive\s+schedule|schedule\s+sprint|open\s+scheduler|suggest\s+schedule)$/i.test(text)) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.OPEN_SCHEDULER,
        targetTask: null,
        responseText: 'Opening Adaptive Sprint Scheduler proposal...',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.OPEN_SCHEDULER },
        error: null,
      };
    }

    // 4. ML Command: Filter / Show high risk tasks
    if (/^(?:show|filter|find|list|view)\s+(?:me\s+)?(?:the\s+)?(?:highest\s+risk|high\s+risk|delayed|at\s*risk)\s*(?:tasks?)?$/i.test(text) ||
        /^(?:which\s+tasks?\s+are\s+(?:most\s+likely\s+to\s+be\s+delayed|at\s+(?:the\s+)?highest\s+risk))$/i.test(text)) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.FILTER_HIGH_RISK,
        targetTask: null,
        responseText: 'Filtered view to highest delay-risk tasks.',
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.FILTER_HIGH_RISK },
        error: null,
      };
    }

    // 5. ML Command: Show model performance / metrics
    if (/^(?:show|view|display)\s+(?:model\s+)?(?:performance|metrics|accuracy|f1|status)$/i.test(text)) {
      const modelStatus = context.modelStatus || {};
      const statusMsg = modelStatus.is_trained
        ? `Model Accuracy: ${((modelStatus.accuracy || 0) * 100).toFixed(1)}%, F1: ${((modelStatus.f1_score || 0) * 100).toFixed(1)}%`
        : 'Model is not trained yet. Click "Train Model" to evaluate.';
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.SHOW_METRICS,
        targetTask: null,
        responseText: statusMsg,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.SHOW_METRICS },
        error: null,
      };
    }

    // 6. ML Command: Show feature importance
    if (/^(?:show|view|what\s+drives)\s+(?:feature\s+importance|risk|delays?)$/i.test(text)) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.SHOW_IMPORTANCE,
        targetTask: null,
        responseText: 'Feature importance: Days remaining, Workload pressure, and Effort-to-time ratio are the top predictors.',
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.SHOW_IMPORTANCE },
        error: null,
      };
    }

    // 7. ML Command: Explain risk
    if (/^(?:explain|breakdown)\s+(?:the\s+)?(?:project\s+)?risk$/i.test(text)) {
      const riskStats = context.riskStats || { highCount: 0, mediumCount: 0 };
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.EXPLAIN_RISK,
        targetTask: null,
        responseText: `Project Risk Analysis: ${riskStats.highCount || 0} high-risk, ${riskStats.mediumCount || 0} medium-risk tasks. Click any task risk pill for details.`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.EXPLAIN_RISK },
        error: null,
      };
    }

    // 8. Consequential Command: Clear history / Reset behavioral data
    if (/^(?:clear|reset|purge)\s+(?:all\s+)?(?:behavioral\s+)?(?:telemetry\s+)?(?:history|data|tracking(?:\s+data)?)$/i.test(text) ||
        /^(?:clear|reset|purge)\s+(?:all\s+)?(?:behavioral\s+telemetry\s+history)$/i.test(text)) {
      this.state = CONVERSATION_STATES.AWAITING_CONFIRMATION;
      this.pendingAction = {
        type: CONVERSATION_INTENTS.CLEAR_HISTORY,
        prompt: 'Are you sure you want to permanently clear all behavioral tracking history?',
        confirmMessage: 'Behavioral tracking history cleared and reset to cold start.',
        actionPayload: {},
      };
      return {
        state: CONVERSATION_STATES.AWAITING_CONFIRMATION,
        intent: CONVERSATION_INTENTS.CLEAR_HISTORY,
        targetTask: null,
        responseText: 'Are you sure you want to permanently clear all behavioral tracking history? Please reply "yes" to confirm or "no" to cancel.',
        feedbackType: 'warning',
        requiresConfirmation: true,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 9. Consequential Command: Clear completed tasks
    if (/^(?:clear|remove|delete)\s+(?:all\s+)?completed(?:\s+tasks?)?$/i.test(text)) {
      const completedTasks = tasks.filter((t) => t.completed);
      if (completedTasks.length === 0) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.CLEAR_COMPLETED,
          targetTask: null,
          responseText: 'No completed tasks to clear.',
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }

      this.state = CONVERSATION_STATES.AWAITING_CONFIRMATION;
      this.pendingAction = {
        type: CONVERSATION_INTENTS.CLEAR_COMPLETED,
        count: completedTasks.length,
        prompt: `Are you sure you want to delete all ${completedTasks.length} completed tasks?`,
        confirmMessage: `Cleared ${completedTasks.length} completed task${completedTasks.length > 1 ? 's' : ''}.`,
        actionPayload: { completedTaskIds: completedTasks.map((t) => t.id) },
      };
      return {
        state: CONVERSATION_STATES.AWAITING_CONFIRMATION,
        intent: CONVERSATION_INTENTS.CLEAR_COMPLETED,
        targetTask: null,
        responseText: `Are you sure you want to delete all ${completedTasks.length} completed tasks? Please reply "yes" to confirm or "no" to cancel.`,
        feedbackType: 'warning',
        requiresConfirmation: true,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 10. Task Inquiry / Inspection ("Tell me about...", "Describe task...", "Show task...")
    const describeMatch = text.match(/^(?:tell\s+me\s+about|describe|show(?:\s+details\s+of)?|what\s+is|inspect)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (describeMatch) {
      const taskName = describeMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DESCRIBE_TASK, taskName, {}, tasks);
    }

    // 11. Task Command: Uncomplete / Mark as pending / Reopen
    const markPendingMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+as\s+(?:pending|incomplete|uncompleted|not\s+done|open)$/i);
    const uncompleteMatch = text.match(/^(?:uncomplete|uncheck|reopen)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (markPendingMatch || uncompleteMatch) {
      const taskName = (markPendingMatch ? markPendingMatch[1] : uncompleteMatch[1]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.REOPEN_TASK, taskName, {}, tasks);
    }

    // 12. Task Command: Complete / Mark as completed / "Mark it done"
    const markCompletedMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:as\s+)?(?:completed|complete|done|finished)$/i);
    const completeMatch = text.match(/^(?:complete|finish|check(?:\s+off)?)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (markCompletedMatch || completeMatch) {
      const taskName = (markCompletedMatch ? markCompletedMatch[1] : completeMatch[1]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.COMPLETE_TASK, taskName, {}, tasks);
    }

    // 13. Consequential Command: Delete task (requires confirmation!)
    const deleteMatch = text.match(/^(?:delete|remove)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (deleteMatch) {
      const taskName = deleteMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DELETE_TASK, taskName, {}, tasks);
    }

    // 14. Task Command: Reschedule task
    const rescheduleMatch = text.match(/^reschedule\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+to(?:\s+(.+))?)?$/i);
    if (rescheduleMatch) {
      const taskName = rescheduleMatch[1].trim();
      const rawDate = rescheduleMatch[2] ? rescheduleMatch[2].trim() : '';
      const parsedDate = rawDate ? parseDateExpression(rawDate, new Date(this.clock())) : null;
      return this._resolveAndDispatch(CONVERSATION_INTENTS.RESCHEDULE_TASK, taskName, { newDueDate: parsedDate, rawDate }, tasks);
    }

    // 15. Task Command: Create / Add task
    const isCreateIntent = /^(?:create|add|new|make|schedule)\b/i.test(text);
    if (isCreateIntent) {
      return this._handleCreateTaskIntent(text);
    }

    // 16. Fallback: Unrecognized input
    return {
      state: CONVERSATION_STATES.IDLE,
      intent: CONVERSATION_INTENTS.UNKNOWN,
      targetTask: null,
      responseText: 'Command not recognized. Try: "add task [name] due tomorrow", "tell me about [task]", "mark it done", or "train the model".',
      feedbackType: 'error',
      requiresConfirmation: false,
      isAuthorized: false,
      action: null,
      error: 'unrecognized_command',
    };
  }

  /**
   * Helper to resolve target task from name/pronoun and dispatch intent.
   * If missing or ambiguous, triggers AWAITING_CLARIFICATION.
   * @private
   */
  _resolveAndDispatch(intent, taskNameQuery, params, tasks) {
    const resolution = this.resolveTaskReference(taskNameQuery, tasks);

    if (resolution.status === 'exact') {
      const target = resolution.task;
      this.activeSubjectTaskId = target.id;
      return this._dispatchIntentWithTarget(intent, target, params, tasks);
    }

    if (resolution.status === 'ambiguous') {
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = { intent, params };
      this.pendingClarification = {
        missingField: 'targetTask',
        query: taskNameQuery,
        matches: resolution.matches,
      };
      const titleList = resolution.matches.map((m) => `"${m.title}"`).join(', ');
      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent,
        targetTask: null,
        responseText: `Multiple tasks matched "${taskNameQuery}": ${titleList}. Which one did you mean?`,
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'ambiguous_reference',
      };
    }

    if (resolution.status === 'missing_context') {
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = { intent, params };
      this.pendingClarification = {
        missingField: 'targetTask',
        query: taskNameQuery,
      };
      const verb = intent === CONVERSATION_INTENTS.COMPLETE_TASK ? 'mark as done'
        : intent === CONVERSATION_INTENTS.DELETE_TASK ? 'delete'
        : intent === CONVERSATION_INTENTS.REOPEN_TASK ? 'reopen'
        : 'inspect';
      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent,
        targetTask: null,
        responseText: `I'm not sure which task you mean by "${taskNameQuery}". Which task would you like to ${verb}?`,
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'missing_context',
      };
    }

    // status: not_found
    return {
      state: CONVERSATION_STATES.IDLE,
      intent,
      targetTask: null,
      responseText: `Task not found: "${taskNameQuery}"`,
      feedbackType: 'error',
      requiresConfirmation: false,
      isAuthorized: false,
      action: null,
      error: 'task_not_found',
    };
  }

  /**
   * Dispatch intent once target task is deterministically identified.
   * @private
   */
  _dispatchIntentWithTarget(intent, target, params, _tasks) {
    this.activeSubjectTaskId = target.id;

    // 1. Task Description
    if (intent === CONVERSATION_INTENTS.DESCRIBE_TASK) {
      const details = [
        `"${target.title}"`,
        `Priority: ${target.priority || 'medium'}`,
        `Due: ${target.dueDate || 'none'}`,
        `Status: ${target.completed ? 'Completed' : 'Pending'}`,
      ];
      if (target.estimatedEffort) details.push(`Effort: ${target.estimatedEffort}h`);
      if (Array.isArray(target.dependencies) && target.dependencies.length > 0) {
        details.push(`Dependencies: ${target.dependencies.length}`);
      }

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.DESCRIBE_TASK,
        targetTask: target,
        responseText: details.join(' | '),
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.DESCRIBE_TASK, targetTask: target },
        error: null,
      };
    }

    // 2. Complete Task
    if (intent === CONVERSATION_INTENTS.COMPLETE_TASK) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.COMPLETE_TASK,
        targetTask: target,
        responseText: `Completing task: "${target.title}"`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.COMPLETE_TASK, taskId: target.id, targetTask: target },
        error: null,
      };
    }

    // 3. Reopen Task
    if (intent === CONVERSATION_INTENTS.REOPEN_TASK) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.REOPEN_TASK,
        targetTask: target,
        responseText: `Reopening task: "${target.title}"`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.REOPEN_TASK, taskId: target.id, targetTask: target },
        error: null,
      };
    }

    // 4. Delete Task (Consequential -> requires explicit confirmation!)
    if (intent === CONVERSATION_INTENTS.DELETE_TASK) {
      this.state = CONVERSATION_STATES.AWAITING_CONFIRMATION;
      this.pendingAction = {
        type: CONVERSATION_INTENTS.DELETE_TASK,
        targetTaskId: target.id,
        targetTask: target,
        prompt: `Are you sure you want to delete task "${target.title}"?`,
        confirmMessage: `Deleted task: "${target.title}"`,
        actionPayload: { taskId: target.id },
      };
      return {
        state: CONVERSATION_STATES.AWAITING_CONFIRMATION,
        intent: CONVERSATION_INTENTS.DELETE_TASK,
        targetTask: target,
        responseText: `Are you sure you want to delete task "${target.title}"? Please reply "yes" to confirm or "no" to cancel.`,
        feedbackType: 'warning',
        requiresConfirmation: true,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 5. Reschedule Task
    if (intent === CONVERSATION_INTENTS.RESCHEDULE_TASK) {
      const newDueDate = params?.newDueDate;
      if (!newDueDate) {
        // Missing date information -> transition to clarification
        this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
        this.pendingIntent = { intent, params, targetTaskId: target.id };
        this.pendingClarification = {
          missingField: 'dueDate',
          targetTask: target,
        };
        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: CONVERSATION_INTENTS.RESCHEDULE_TASK,
          targetTask: target,
          responseText: `When would you like to reschedule "${target.title}" to? (e.g. "tomorrow", "next Monday", YYYY-MM-DD)`,
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'missing_due_date',
        };
      }

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.RESCHEDULE_TASK,
        targetTask: target,
        responseText: `Rescheduling "${target.title}" to ${newDueDate}.`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: CONVERSATION_INTENTS.RESCHEDULE_TASK,
          taskId: target.id,
          targetTask: target,
          newDueDate,
        },
        error: null,
      };
    }

    // Fallback
    return {
      state: CONVERSATION_STATES.IDLE,
      intent,
      targetTask: target,
      responseText: `Processed ${intent} for "${target.title}".`,
      feedbackType: 'info',
      requiresConfirmation: false,
      isAuthorized: true,
      action: { type: intent, targetTask: target },
      error: null,
    };
  }

  /**
   * Parse task creation parameters or request clarification if title is missing.
   * @private
   */
  _handleCreateTaskIntent(text) {
    let priority = 'medium';
    if (/\b(?:high\s+priority|priority\s+high|urgent|critical)\b/i.test(text)) {
      priority = 'high';
    } else if (/\b(?:low\s+priority|priority\s+low|trivial|minor)\b/i.test(text)) {
      priority = 'low';
    } else if (/\b(?:medium\s+priority|priority\s+medium|normal\s+priority)\b/i.test(text)) {
      priority = 'medium';
    }

    // Extract effort if mentioned
    let estimatedEffort = null;
    const effortMatch = text.match(/\b(?:for|effort(?:\s+of)?|estimate(?:\s+of)?)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    if (effortMatch) {
      estimatedEffort = parseFloat(effortMatch[1]);
    }

    // Extract due date
    const dueDate = parseDateExpression(text, new Date(this.clock()));

    // Clean title
    let rawTitle = text
      .replace(/^(?:create|add|new|make|schedule)\s+/i, '')
      .replace(/^(?:a|an)\s+/i, '')
      .replace(/\bwith\s+(?:high|medium|low)\s+priority\b/gi, '')
      .replace(/\b(?:high|medium|low)\s+priority\b/gi, '')
      .replace(/\bpriority\s+(?:high|medium|low)\b/gi, '')
      .replace(/^task(?:\s+|$)/i, '')
      .replace(/^(?:called|named)\s+/i, '')
      .replace(/\b(?:called|named)\s+/gi, '')
      .replace(/\b(?:for|effort(?:\s+of)?|estimate(?:\s+of)?)\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\b/gi, '')
      .replace(/\b(?:due\s+today|due\s+tomorrow|due\s+in\s+\d+\s+days?|due\s+next\s+week)\b/gi, '')
      .replace(/\bdue\s+(?:on\s+)?\d{4}-\d{2}-\d{2}\b/gi, '')
      .replace(/\bdue\s+(?:on\s+)?[a-zA-Z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?\b/gi, '')
      .replace(/\bdue\s+(?:on\s+)?(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .trim();

    rawTitle = rawTitle
      .replace(/\s+(?:with\s+)?(?:high|medium|low)\s+priority$/i, '')
      .replace(/\s+priority\s+(?:high|medium|low)$/i, '')
      .trim();

    if (!rawTitle) {
      // Missing title -> transition to AWAITING_CLARIFICATION
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = {
        intent: CONVERSATION_INTENTS.CREATE_TASK,
        params: { priority, estimatedEffort, dueDate },
      };
      this.pendingClarification = {
        missingField: 'taskTitle',
      };
      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent: CONVERSATION_INTENTS.CREATE_TASK,
        targetTask: null,
        responseText: 'What is the title of the task you would like to create?',
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'missing_title',
      };
    }

    return {
      state: CONVERSATION_STATES.IDLE,
      intent: CONVERSATION_INTENTS.CREATE_TASK,
      targetTask: null,
      responseText: `Creating task: "${rawTitle}"${dueDate ? ` (Due: ${dueDate})` : ''}`,
      feedbackType: 'success',
      requiresConfirmation: false,
      isAuthorized: true,
      action: {
        type: CONVERSATION_INTENTS.CREATE_TASK,
        title: rawTitle,
        priority,
        dueDate,
        estimatedEffort,
      },
      error: null,
    };
  }

  /**
   * Programmatic confirm helper for UI buttons.
   * @param {Array<Object>} tasks
   */
  confirm(tasks = []) {
    return this.processInput('yes', { tasks });
  }

  /**
   * Programmatic cancel helper for UI buttons.
   * @param {Array<Object>} tasks
   */
  cancel(tasks = []) {
    return this.processInput('cancel', { tasks });
  }
}

// Default singleton instance for standard app usage
export const dialogueManager = new DialogueManager();
