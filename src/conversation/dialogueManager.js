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
import {
  parseCompoundTaskCreation,
  splitCompoundCommands,
  parseEnhancedDate,
  formatISODate,
  formatTaskDueDate,
} from './compoundCommandParser.js';
import {
  explainScheduleDecision,
  explainScheduleChanges,
  generatePlanDebrief,
} from './scheduleDebrief.js';
import {
  parseTimeToMinutes,
  minutesToTimeString,
  formatTimeAmPm,
  computeAvailableWindowsForDate,
  loadTimeBlockSettings,
  saveTimeBlockSettings,
} from '../scheduler/timeBlockScheduler.js';
import { parseDateISO } from '../scheduler/adaptiveScheduler.js';

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
  CHANGE_PRIORITY: 'CHANGE_PRIORITY',
  QUERY_TASKS: 'QUERY_TASKS',
  CLEAR_COMPLETED: 'CLEAR_COMPLETED',
  CLEAR_HISTORY: 'CLEAR_HISTORY',
  DESCRIBE_TASK: 'DESCRIBE_TASK',
  RESCHEDULE_TASK: 'RESCHEDULE_TASK',
  REVISE_EFFORT: 'REVISE_EFFORT',
  RENAME_TASK: 'RENAME_TASK',
  TRAIN_MODEL: 'TRAIN_MODEL',
  PREDICT_RISK: 'PREDICT_RISK',
  OPEN_SCHEDULER: 'OPEN_SCHEDULER',
  FILTER_HIGH_RISK: 'FILTER_HIGH_RISK',
  SHOW_METRICS: 'SHOW_METRICS',
  SHOW_IMPORTANCE: 'SHOW_IMPORTANCE',
  EXPLAIN_RISK: 'EXPLAIN_RISK',
  EXPLAIN_SCHEDULE_DECISION: 'EXPLAIN_SCHEDULE_DECISION',
  EXPLAIN_SCHEDULE_CHANGES: 'EXPLAIN_SCHEDULE_CHANGES',
  PLAN_DEBRIEF: 'PLAN_DEBRIEF',
  SCHEDULE_NEGOTIATION: 'SCHEDULE_NEGOTIATION',
  ACCEPT_PROPOSAL: 'ACCEPT_PROPOSAL',
  DISCARD_PROPOSAL: 'DISCARD_PROPOSAL',
  SIMULATE_SCHEDULE: 'SIMULATE_SCHEDULE',
  QUERY_CAPACITY: 'QUERY_CAPACITY',
  SET_WORKING_HOURS: 'SET_WORKING_HOURS',
  ADD_BLACKOUT: 'ADD_BLACKOUT',
  SET_FOCUS_WINDOW: 'SET_FOCUS_WINDOW',
  CONFIRM: 'CONFIRM',
  CANCEL: 'CANCEL',
  HELP: 'HELP',
  UNKNOWN: 'UNKNOWN',
});

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  AMBIGUOUS: 'ambiguous',
  NOT_FOUND: 'not_found',
  NEEDS_CLARIFICATION: 'needs_clarification',
});

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Natural language relative and absolute date parser.
 * Deterministic helper converting common date expressions into ISO YYYY-MM-DD format.
 * Delegates to parseEnhancedDate for unified, single-source-of-truth date resolution.
 *
 * @param {string} text
 * @param {Date} [referenceDate]
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null
 */
export function parseDateExpression(text, referenceDate = new Date()) {
  return parseEnhancedDate(text, referenceDate);
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
   * 1. Pronoun/anaphoric reference ("it", "this", "that", "this task", "my task") -> resolves to activeSubjectTaskId
   * 2. Ordinal / position references ("the first one", "the second one", "1", "2") against candidateTasks
   * 3. Anaphoric contrast references ("the other one", "the other task", "the other English task")
   * 4. Exact match (case-insensitive and whitespace normalized)
   * 5. Exact stripped match (omitting leading 'the', 'my', 'a', 'an' and trailing 'task')
   * 6. Token overlap and distinctive word matching with transparent scoring
   * 7. Ambiguity detection: returns all plausible matches when multiple tasks qualify
   *
   * @param {string} query
   * @param {Array<Object>} tasks
   * @param {Object} [options]
   * @param {Array<Object>} [options.candidateTasks] Specific candidates from active clarification
   * @returns {Object} Resolution result:
   *   { status: 'exact', task, isContextual: boolean }
   *   { status: 'ambiguous', matches: Array<Object> }
   *   { status: 'not_found' }
   *   { status: 'missing_context', reason: string }
   */
  resolveTaskReference(query, tasks = [], options = {}) {
    if (!query || typeof query !== 'string') {
      return { status: RESOLUTION_STATUS.NOT_FOUND, query: '' };
    }
    const cleanRaw = query.trim();
    const cleanLower = cleanRaw.toLowerCase();

    const candidatePool = Array.isArray(options.candidateTasks) && options.candidateTasks.length > 0
      ? options.candidateTasks
      : (this.pendingClarification?.matches || this.pendingClarification?.candidateTasks || null);

    // 1. Direct stable task ID match (e.g. from UI candidate card click or exact ID input)
    if (candidatePool && candidatePool.length > 0) {
      const idMatchInPool = candidatePool.find(
        (t) => t.id === cleanRaw || (typeof t.id === 'string' && t.id.toLowerCase() === cleanLower)
      );
      if (idMatchInPool) {
        const verified = tasks.find((t) => t.id === idMatchInPool.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
    }

    const idMatchInTasks = tasks.find(
      (t) => t.id === cleanRaw || (typeof t.id === 'string' && t.id.toLowerCase() === cleanLower)
    );
    if (idMatchInTasks) {
      return { status: RESOLUTION_STATUS.RESOLVED, task: idMatchInTasks, isContextual: false };
    }

    // 2. Check for pronoun or contextual reference
    const isPronoun = /^(?:it|this|that|this\s+task|that\s+task|the\s+task|my\s+task|its)$/i.test(cleanLower);
    if (isPronoun) {
      if (!this.activeSubjectTaskId) {
        if (tasks.length === 1) {
          return { status: RESOLUTION_STATUS.RESOLVED, task: tasks[0], isContextual: true };
        }
        return { status: RESOLUTION_STATUS.NEEDS_CLARIFICATION, reason: 'no_active_subject' };
      }
      const contextualTask = tasks.find((t) => t.id === this.activeSubjectTaskId);
      if (!contextualTask) {
        this.activeSubjectTaskId = null;
        return { status: RESOLUTION_STATUS.NEEDS_CLARIFICATION, reason: 'task_deleted' };
      }
      return { status: RESOLUTION_STATUS.RESOLVED, task: contextualTask, isContextual: true };
    }

    const now = new Date(this.clock());
    const todayISO = formatISODate(now);
    const tomorrowD = new Date(this.clock());
    tomorrowD.setDate(tomorrowD.getDate() + 1);
    const tomorrowISO = formatISODate(tomorrowD);

    // 3. If answering clarification, evaluate against candidates in pool FIRST
    if (candidatePool && candidatePool.length > 0) {
      // 3a. Ordinal / position selection against stable displayed ordering
      if (/^(?:the\s+)?(?:first(?:\s+one|\s+task)?|1st|number\s+1|1)$/i.test(cleanLower)) {
        const candidate = candidatePool[0];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?(?:second(?:\s+one|\s+task)?|2nd|number\s+2|2)$/i.test(cleanLower) && candidatePool.length >= 2) {
        const candidate = candidatePool[1];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?(?:third(?:\s+one|\s+task)?|3rd|number\s+3|3)$/i.test(cleanLower) && candidatePool.length >= 3) {
        const candidate = candidatePool[2];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?(?:fourth(?:\s+one|\s+task)?|4th|number\s+4|4)$/i.test(cleanLower) && candidatePool.length >= 4) {
        const candidate = candidatePool[3];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?(?:fifth(?:\s+one|\s+task)?|5th|number\s+5|5)$/i.test(cleanLower) && candidatePool.length >= 5) {
        const candidate = candidatePool[4];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?last(?:\s+one|\s+task)?$/i.test(cleanLower) && candidatePool.length > 0) {
        const candidate = candidatePool[candidatePool.length - 1];
        const verified = tasks.find((t) => t.id === candidate.id);
        if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
        return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
      }
      if (/^(?:the\s+)?other(?:\s+one|\s+task)?$/i.test(cleanLower)) {
        if (candidatePool.length === 2) {
          const targetCandidate = candidatePool.find((c) => c.id !== this.activeSubjectTaskId) || candidatePool[1];
          const verified = tasks.find((t) => t.id === targetCandidate.id);
          if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
        }
      }

      // 3b. Relative deadline disambiguation ("the one due tomorrow", "due tomorrow", "tomorrow", "due today", "today", "the one with no deadline")
      const isTomorrow = /\b(?:(?:due|for|on)\s+)?tomorrow\b/i.test(cleanLower);
      const isToday = /\b(?:(?:due|for|on)\s+)?today\b/i.test(cleanLower);
      const isNoDeadline = /\b(?:with\s+)?(?:no\s+deadline|without\s+(?:a\s+)?deadline|unscheduled)\b/i.test(cleanLower);

      if (isTomorrow) {
        const tomorrowMatches = candidatePool.filter((t) => t.dueDate === tomorrowISO);
        if (tomorrowMatches.length === 1) {
          const verified = tasks.find((t) => t.id === tomorrowMatches[0].id);
          if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
        }
        if (tomorrowMatches.length > 1) {
          const titleFiltered = tomorrowMatches.filter((t) => {
            const strippedTitle = t.title.toLowerCase();
            return cleanLower.includes(strippedTitle) || strippedTitle.includes(cleanLower.replace(/\b(?:the|my|a|an|task|for|due|on|tomorrow)\b/gi, '').trim());
          });
          if (titleFiltered.length === 1) {
            const verified = tasks.find((t) => t.id === titleFiltered[0].id);
            if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          }
          return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: titleFiltered.length > 0 ? titleFiltered : tomorrowMatches };
        }
      }

      if (isToday) {
        const todayMatches = candidatePool.filter((t) => t.dueDate === todayISO);
        if (todayMatches.length === 1) {
          const verified = tasks.find((t) => t.id === todayMatches[0].id);
          if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
        }
        if (todayMatches.length > 1) {
          const titleFiltered = todayMatches.filter((t) => {
            const strippedTitle = t.title.toLowerCase();
            return cleanLower.includes(strippedTitle) || strippedTitle.includes(cleanLower.replace(/\b(?:the|my|a|an|task|for|due|on|today)\b/gi, '').trim());
          });
          if (titleFiltered.length === 1) {
            const verified = tasks.find((t) => t.id === titleFiltered[0].id);
            if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          }
          return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: titleFiltered.length > 0 ? titleFiltered : todayMatches };
        }
      }

      if (isNoDeadline) {
        const noDeadlineMatches = candidatePool.filter((t) => !t.dueDate);
        if (noDeadlineMatches.length === 1) {
          const verified = tasks.find((t) => t.id === noDeadlineMatches[0].id);
          if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
        }
        if (noDeadlineMatches.length > 1) {
          const titleFiltered = noDeadlineMatches.filter((t) => {
            const strippedTitle = t.title.toLowerCase();
            return cleanLower.includes(strippedTitle) || strippedTitle.includes(cleanLower.replace(/\b(?:the|my|a|an|task|no|without|a|deadline|unscheduled)\b/gi, '').trim());
          });
          if (titleFiltered.length === 1) {
            const verified = tasks.find((t) => t.id === titleFiltered[0].id);
            if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          }
          return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: titleFiltered.length > 0 ? titleFiltered : noDeadlineMatches };
        }
      }

      // 3c. Substring / Distinctive token matching inside candidatePool
      const poolStripped = cleanLower
        .replace(/^(?:the|my|a|an)\s+/i, '')
        .replace(/^(?:task\s+(?:about|for|called|named)\s+)/i, '')
        .replace(/\s+task$/i, '')
        .replace(/\b(?:one)\b/i, '')
        .trim();

      if (poolStripped) {
        const poolMatches = candidatePool.filter((t) => {
          const titleNorm = t.title.toLowerCase();
          return titleNorm.includes(poolStripped) || poolStripped.includes(titleNorm) ||
            titleNorm.split(/\s+/).some((w) => w === poolStripped);
        });
        if (poolMatches.length === 1) {
          const verified = tasks.find((t) => t.id === poolMatches[0].id);
          if (verified) return { status: RESOLUTION_STATUS.RESOLVED, task: verified, isContextual: true };
          return { status: RESOLUTION_STATUS.NOT_FOUND, reason: 'task_deleted' };
        }
        if (poolMatches.length > 1) {
          return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: poolMatches };
        }
      }
    }

    // 4. Contrast reference: "the other [X] task" or "what about the other [X] task"
    const otherMatch = cleanLower.match(/^(?:what\s+about\s+)?(?:the\s+)?other\s+(.+?)(?:\s+task)?$/i);
    if (otherMatch) {
      const topic = otherMatch[1].trim();
      const topicMatches = tasks.filter((t) => t.title && t.title.toLowerCase().includes(topic));
      if (topicMatches.length > 0) {
        const otherTask = topicMatches.find((t) => t.id !== this.activeSubjectTaskId) || topicMatches[0];
        if (otherTask) {
          return { status: RESOLUTION_STATUS.RESOLVED, task: otherTask, isContextual: true };
        }
      }
    }

    // 5. Extract identifying attributes from query (explicit deadlines, relative dates, "no deadline")
    let targetDeadlineISO = undefined; // undefined = not specified; null = explicitly unscheduled (no deadline); string = specific ISO date
    let queryWithoutAttr = cleanLower;

    // 5a. Check for "no deadline" / "unscheduled"
    const noDeadlineRegex = /\b(?:with\s+)?(?:no\s+deadline|without\s+(?:a\s+)?deadline|unscheduled)\b/i;
    if (noDeadlineRegex.test(cleanLower)) {
      targetDeadlineISO = null;
      queryWithoutAttr = queryWithoutAttr.replace(noDeadlineRegex, ' ').trim();
    } else {
      // 5b. Check for explicit deadline / date attributes
      // e.g.: "due today", "for today", "on today", "due tomorrow", "for tomorrow", "today's", "tomorrow's", "due 2026-10-18", "for 18th October", "on Friday", "due Friday"
      const duePattern = /\b(?:due\s+(?:on\s+|by\s+|at\s+)?|scheduled\s+(?:for|on)\s+)(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2}|next\s+\w+|\w+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+\w+)\b/i;
      const forDatePattern = /\b(?:for|on)\s+(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2}|next\s+\w+|\w+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+\w+)\b/i;
      const possessiveDatePattern = /\b(today|tomorrow|yesterday)'s\b/i;
      const trailingDatePattern = /\b(?:task\s+)?(today|tomorrow|yesterday)$/i;

      let dateMatch = queryWithoutAttr.match(duePattern);
      let matchedPhrase = dateMatch ? dateMatch[0] : null;
      let matchedDateStr = dateMatch ? dateMatch[1] : null;

      if (!dateMatch) {
        dateMatch = queryWithoutAttr.match(forDatePattern);
        if (dateMatch) {
          matchedPhrase = dateMatch[0];
          matchedDateStr = dateMatch[1];
        }
      }

      if (!dateMatch) {
        dateMatch = queryWithoutAttr.match(possessiveDatePattern);
        if (dateMatch) {
          matchedPhrase = dateMatch[0];
          matchedDateStr = dateMatch[1];
        }
      }

      if (!dateMatch) {
        dateMatch = queryWithoutAttr.match(trailingDatePattern);
        if (dateMatch) {
          matchedPhrase = dateMatch[0];
          matchedDateStr = dateMatch[1];
        }
      }

      if (matchedDateStr) {
        const lowerDate = matchedDateStr.toLowerCase();
        if (lowerDate === 'today') {
          targetDeadlineISO = todayISO;
        } else if (lowerDate === 'tomorrow') {
          targetDeadlineISO = tomorrowISO;
        } else if (lowerDate === 'yesterday') {
          const yest = new Date(this.clock());
          yest.setDate(yest.getDate() - 1);
          targetDeadlineISO = formatISODate(yest);
        } else {
          targetDeadlineISO = parseEnhancedDate(matchedDateStr, new Date(this.clock())) ||
                              parseDateExpression(matchedDateStr, new Date(this.clock()));
        }

        if (targetDeadlineISO !== undefined && targetDeadlineISO !== null) {
          queryWithoutAttr = queryWithoutAttr.replace(matchedPhrase, ' ').trim();
        }
      }
    }

    // 5. Strip conversational noise words for clean matching
    let stripped = (queryWithoutAttr || cleanLower)
      .replace(/^(?:the|my|a|an)\s+/i, '')
      .replace(/^(?:task\s+(?:about|for|called|named)\s+|task\s+)/i, '')
      .replace(/\s+task$/i, '')
      .replace(/['’]s$/i, '')
      .trim();

    if (!stripped) {
      return { status: RESOLUTION_STATUS.NOT_FOUND, query };
    }

    // 6. Full Matching across all available tasks
    // Step 6a: Exact title matches
    const cleanNoPossessive = cleanLower.replace(/['’]s$/i, '').trim();
    const queryNoPossessive = (queryWithoutAttr || '').replace(/['’]s$/i, '').trim();
    const exactTitleMatches = tasks.filter((t) => {
      if (!t.title) return false;
      const tClean = t.title.trim().toLowerCase();
      return (
        tClean === cleanLower ||
        tClean === cleanNoPossessive ||
        tClean === queryWithoutAttr ||
        tClean === queryNoPossessive ||
        tClean === stripped
      );
    });

    // Step 6b: Exact stripped title matches
    const strippedMatches = tasks.filter((t) => {
      if (!t.title) return false;
      const tStripped = t.title.trim().toLowerCase()
        .replace(/^(?:the|my|a|an)\s+/i, '')
        .replace(/^(?:task\s+(?:about|for|called|named)\s+|task\s+)/i, '')
        .replace(/\s+task$/i, '')
        .replace(/['’]s$/i, '')
        .trim();
      return tStripped === stripped || tStripped === cleanNoPossessive;
    });

    // Step 6c: Word and token overlap matches
    const STOP_WORDS = new Set(['the', 'my', 'a', 'an', 'task', 'tasks', 'called', 'named', 'about', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'and', 'is']);
    const normalize = (s) => s.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const qNorm = normalize(stripped);
    const qTokens = qNorm.split(' ').filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok) && tok !== 's');

    const candidateMap = new Map();

    for (const t of exactTitleMatches) {
      candidateMap.set(t.id, t);
    }
    for (const t of strippedMatches) {
      candidateMap.set(t.id, t);
    }

    if (qTokens.length > 0) {
      for (const t of tasks) {
        if (!t.title) continue;
        const tNorm = normalize(t.title);
        const tTokens = tNorm.split(' ').filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));

        const hasWord = new RegExp(`\\b${escapeRegex(qNorm)}\\b`, 'i').test(tNorm);
        const hasAllTokens = (qTokens.length > 0 && qTokens.every((qt) =>
          tTokens.some((tt) => tt === qt || tt.startsWith(qt) || qt.startsWith(tt))
        ));

        if (hasWord || hasAllTokens) {
          candidateMap.set(t.id, t);
        }
      }
    }

    const allCandidates = Array.from(candidateMap.values());

    if (allCandidates.length === 0) {
      // Fallback: check partial token overlap for typos or longer descriptions
      const partials = [];
      for (const t of tasks) {
        if (!t.title) continue;
        const tNorm = normalize(t.title);
        const tTokens = tNorm.split(' ').filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));
        if (qTokens.length > 0 && qTokens.some((qt) => qt.length >= 4 && tTokens.some((tt) => tt.startsWith(qt.slice(0, 4)) || qt.startsWith(tt.slice(0, 4))))) {
          partials.push(t);
        }
      }
      if (partials.length === 1) {
        if (targetDeadlineISO !== undefined) {
          const matched = targetDeadlineISO === null ? !partials[0].dueDate : partials[0].dueDate === targetDeadlineISO;
          if (matched) {
            return { status: RESOLUTION_STATUS.RESOLVED, task: partials[0], isContextual: false };
          }
          return { status: RESOLUTION_STATUS.NOT_FOUND, query, reason: 'deadline_mismatch' };
        }
        return { status: RESOLUTION_STATUS.RESOLVED, task: partials[0], isContextual: false };
      }
      if (partials.length > 1) {
        if (targetDeadlineISO !== undefined) {
          const deadlineFilteredPartials = partials.filter((t) => targetDeadlineISO === null ? !t.dueDate : t.dueDate === targetDeadlineISO);
          if (deadlineFilteredPartials.length === 1) {
            return { status: RESOLUTION_STATUS.RESOLVED, task: deadlineFilteredPartials[0], isContextual: false };
          }
          if (deadlineFilteredPartials.length > 1) {
            return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: deadlineFilteredPartials };
          }
          return { status: RESOLUTION_STATUS.NOT_FOUND, query, reason: 'deadline_mismatch' };
        }
        return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: partials };
      }
      return { status: RESOLUTION_STATUS.NOT_FOUND, query };
    }

    // 7. Apply identifying deadline attribute to narrow candidates if specified
    if (targetDeadlineISO !== undefined) {
      const deadlineFiltered = allCandidates.filter((t) => {
        if (targetDeadlineISO === null) {
          return !t.dueDate;
        }
        return t.dueDate === targetDeadlineISO;
      });

      if (deadlineFiltered.length === 1) {
        return { status: RESOLUTION_STATUS.RESOLVED, task: deadlineFiltered[0], isContextual: false };
      }
      if (deadlineFiltered.length > 1) {
        return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: deadlineFiltered };
      }
      if (allCandidates.length > 0 && deadlineFiltered.length === 0) {
        return {
          status: RESOLUTION_STATUS.NOT_FOUND,
          query,
          reason: 'deadline_mismatch',
          candidates: allCandidates,
        };
      }
    }

    // CRITICAL MUTATION SAFETY INVARIANT:
    // If more than 1 candidate matches the query, it is ALWAYS ambiguous.
    // Never pick one arbitrarily, even if one candidate is an exact title match.
    if (allCandidates.length > 1) {
      return { status: RESOLUTION_STATUS.AMBIGUOUS, matches: allCandidates };
    }

    // Exactly 1 candidate uniquely matches
    return { status: RESOLUTION_STATUS.RESOLVED, task: allCandidates[0], isContextual: false };
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
    const isNegative = /^(?:no|n|cancel|stop|abort|never\s*mind|don't|do\s+not)$/i.test(text);
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
    if (/^(?:cancel|stop|abort|never\s*mind|exit)$/i.test(text)) {
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
      const candidates = clarification.matches || clarification.candidateTasks || tasks;
      const resolution = this.resolveTaskReference(text, tasks, { candidateTasks: candidates });

      if (resolution.reason === 'task_deleted') {
        this.state = CONVERSATION_STATES.IDLE;
        this.pendingClarification = null;
        this.pendingIntent = null;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: pendingIntent.intent,
          targetTask: null,
          responseText: 'Referenced task is no longer available. Action cancelled.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'task_not_found',
        };
      }

      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const target = resolution.task;
        // Verify target task still exists in the latest task collection (deletion/mutation safeguard)
        const currentTask = tasks.find((t) => t.id === target.id);
        if (!currentTask) {
          this.state = CONVERSATION_STATES.IDLE;
          this.pendingClarification = null;
          this.pendingIntent = null;
          return {
            state: CONVERSATION_STATES.IDLE,
            intent: pendingIntent.intent,
            targetTask: null,
            responseText: `Task "${target.title}" is no longer available. Action cancelled.`,
            feedbackType: 'error',
            requiresConfirmation: false,
            isAuthorized: false,
            action: null,
            error: 'task_not_found',
          };
        }

        this.state = CONVERSATION_STATES.IDLE;
        this.pendingClarification = null;
        this.pendingIntent = null;
        this.activeSubjectTaskId = currentTask.id;

        if (clarification.schedIntent) {
          clarification.schedIntent.params.targetTaskQuery = currentTask.title;
          return this._handleScheduleIntent(clarification.schedIntent, text, tasks, context);
        }

        // Resume the pending intent with the resolved target task
        return this._dispatchIntentWithTarget(pendingIntent.intent, currentTask, pendingIntent.params, tasks);
      }

      if (resolution.status === RESOLUTION_STATUS.AMBIGUOUS || resolution.status === 'ambiguous') {
        clarification.matches = resolution.matches;
        const count = resolution.matches.length;
        const countWord = count === 2 ? 'two' : count === 3 ? 'three' : count === 4 ? 'four' : `${count}`;
        const verb = pendingIntent.intent === CONVERSATION_INTENTS.COMPLETE_TASK ? 'mark complete'
          : pendingIntent.intent === CONVERSATION_INTENTS.DELETE_TASK ? 'delete'
          : pendingIntent.intent === CONVERSATION_INTENTS.RESCHEDULE_TASK ? 'reschedule'
          : pendingIntent.intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION ? 'explain'
          : pendingIntent.intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES ? 'check changes for'
          : 'modify';

        const now = new Date(this.clock());

        const formattedCandidates = resolution.matches.map((t, idx) => {
          const meta = [];
          if (t.dueDate) {
            meta.push(formatTaskDueDate(t.dueDate, now).toLowerCase());
          } else {
            meta.push('no deadline');
          }
          if (t.category && t.category !== 'General') {
            meta.push(t.category);
          }
          const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
          return `${idx + 1}. "${t.title}"${metaStr}`;
        }).join(', ');

        const responseText = `I still found ${countWord} matching tasks. Which one should I ${verb}? ${formattedCandidates}`;
        clarification.prompt = responseText;

        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: pendingIntent.intent,
          targetTask: null,
          candidateTasks: resolution.matches,
          clarificationQuery: clarification.query || '',
          responseText,
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'ambiguous_reference',
        };
      }

      const notFoundPrompt = `Could not find a task matching "${text}". Please specify the full task title or say "cancel".`;
      clarification.prompt = notFoundPrompt;

      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent: pendingIntent.intent,
        targetTask: null,
        candidateTasks: clarification.matches || clarification.candidateTasks || [],
        clarificationQuery: clarification.query || '',
        responseText: notFoundPrompt,
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

      const savedParams = pendingIntent?.params || {};
      const dueDate = savedParams.dueDate || parseEnhancedDate(rawTitle, new Date(this.clock())) || parseDateExpression(rawTitle, new Date(this.clock())) || null;
      const priority = savedParams.priority || 'medium';
      const estimatedEffort = savedParams.estimatedEffort || null;

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
          dueDate,
          priority,
          estimatedEffort,
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
    if (/^(?:cancel|never\s*mind|exit|stop)$/i.test(text)) {
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

    // 4b. Planning Debrief Query while reviewing proposal
    if (
      /^(?:how\s+did\s+(?:my\s+plan\s+go|i\s+do|today'?s\s+plan\s+go|yesterday'?s\s+plan\s+go|things\s+go|my\s+day\s+go)|plan\s+debrief|debrief(?:\s+(?:today|yesterday))?|what\s+should\s+i\s+review\s+from\s+(?:yesterday'?s|today'?s)\s+(?:plan|schedule)|which\s+tasks?\s+did\s+i\s+complete(?:\s+as\s+planned)?|what\s+remains\s+unfinished)\b/i.test(text)
    ) {
      const period = /yesterday/i.test(text) ? 'yesterday' : 'today';
      const debriefRes = generatePlanDebrief({
        period,
        tasks,
        telemetryEvents: context.telemetryEvents || [],
        proposalHistory: this.proposalHistory,
        clock: this.clock,
      });
      return {
        state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
        intent: CONVERSATION_INTENTS.PLAN_DEBRIEF,
        targetTask: null,
        proposal: activeProp,
        responseText: debriefRes.responseText,
        spokenSummary: debriefRes.spokenSummary,
        metrics: debriefRes.metrics,
        completedDetails: debriefRes.completedDetails,
        incompleteDetails: debriefRes.incompleteDetails,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 4c. General Schedule Changes Query while reviewing proposal
    if (
      /^(?:what\s+(?:has\s+)?changed(?:\s+in\s+my\s+schedule|\s+in\s+the\s+proposal|\s+since\s+(?:the\s+)?last\s+proposal|\s+after\s+i\s+accepted\s+(?:the\s+)?(?:new\s+)?schedule)?\??|what\s+moved(?:\s+since\s+(?:the\s+)?last\s+proposal|\s+in\s+my\s+schedule)?\??|compare\s+(?:this\s+plan\s+with\s+(?:the\s+)?previous\s+one|schedule\s+with\s+previous\s+proposal)\??)$/i.test(text)
    ) {
      const changeRes = explainScheduleChanges({
        activeProposal: activeProp,
        proposalHistory: this.proposalHistory,
        tasks,
        telemetryEvents: context.telemetryEvents || [],
        clock: this.clock,
      });
      return {
        state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
        intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES,
        targetTask: null,
        proposal: activeProp,
        responseText: changeRes.responseText,
        spokenSummary: changeRes.spokenSummary,
        movedTasks: changeRes.movedTasks,
        addedTasks: changeRes.addedTasks,
        removedTasks: changeRes.removedTasks,
        statusChanges: changeRes.statusChanges,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: changeRes.error || null,
      };
    }

    // 4d. Single Task Move Inquiry while reviewing proposal
    const taskMoveInPropMatch = text.match(/^(?:why\s+did\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+move\??)$/i) ||
                                text.match(/^(?:why\s+was\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+moved\??)$/i);
    if (taskMoveInPropMatch) {
      const taskQuery = taskMoveInPropMatch[1].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const changeRes = explainScheduleChanges({
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          tasks,
          telemetryEvents: context.telemetryEvents || [],
          queryTaskId: resolution.task.id,
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: changeRes.responseText,
          spokenSummary: changeRes.spokenSummary,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    // 4e. Explain Scheduling Decision while reviewing proposal
    const explainSchedDateInProp = text.match(
      /^(?:why\s+(?:was|is)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+scheduled\s+(?:for|on)\s+(.+?)\??)$/i
    );
    if (explainSchedDateInProp) {
      const taskQuery = explainSchedDateInProp[1].trim();
      const targetDateQuery = explainSchedDateInProp[2].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          targetDateQuery,
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const explainFitInProp = text.match(
      /^(?:why\s+(?:couldn't|could\s+not|can't|can\s+not|wasn't|was\s+not)\s+(?:you\s+)?(?:fit\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:in|on|for)\s+(.+?)\??)$/i
    );
    if (explainFitInProp) {
      const taskQuery = explainFitInProp[1].trim();
      const targetDateQuery = explainFitInProp[2].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          targetDateQuery,
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const explainBlockedInProp = text.match(
      /^(?:why\s+is\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+blocked\??|what\s+is\s+blocking\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (explainBlockedInProp) {
      const taskQuery = (explainBlockedInProp[1] || explainBlockedInProp[2]).trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const explainSplitInProp = text.match(
      /^(?:why\s+(?:was|is|did\s+you\s+split)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:split|partitioned|divided)(?:\s+across\s+.+?)?\??)$/i
    ) || text.match(
      /^(?:why\s+(?:did\s+you\s+)?split\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)(?:\s+across\s+.+?)?\??)$/i
    );
    if (explainSplitInProp) {
      const taskQuery = explainSplitInProp[1].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'why_split',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const workScheduledInProp = text.match(
      /^(?:how\s+much\s+(?:work|effort|time|hours?)\s+(?:is|was)\s+scheduled\s+(?:for|on)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (workScheduledInProp) {
      const taskQuery = workScheduledInProp[1].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'work_scheduled',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const workUnscheduledInProp = text.match(
      /^(?:how\s+much\s+(?:of\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+remains?\s+unscheduled\??|how\s+much\s+unscheduled\s+work\s+(?:remains\s+for|is\s+left\s+for)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (workUnscheduledInProp) {
      const taskQuery = (workUnscheduledInProp[1] || workUnscheduledInProp[2]).trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'work_unscheduled',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const fitBeforeDeadlineInProp = text.match(
      /^(?:why\s+(?:couldn't|could\s+not|can't|can\s+not)\s+(?:you\s+)?fit\s+(?:the\s+whole\s+|all\s+of\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:before|by)\s+(?:its\s+|the\s+)?deadline\??)$/i
    );
    if (fitBeforeDeadlineInProp) {
      const taskQuery = fitBeforeDeadlineInProp[1].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'why_not_fit_before_deadline',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const sessionCountInProp = text.match(
      /^(?:how\s+many\s+sessions?\s+(?:did\s+you\s+propose|are\s+proposed|were\s+proposed)\s+(?:for\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (sessionCountInProp) {
      const taskQuery = sessionCountInProp[1].trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'session_count',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

    const explainTimeInProp = text.match(
      /^(?:why\s+(?:was|is)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:scheduled\s+at|at)\s+(.+?)\??|why\s+(?:at\s+|scheduled\s+at\s+)(.+?)\??)$/i
    );
    if (explainTimeInProp) {
      const taskQuery = (explainTimeInProp[1] || '').trim();
      const resolution = this.resolveTaskReference(taskQuery, tasks);
      if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
        const explRes = explainScheduleDecision({
          targetTask: resolution.task,
          inquiryType: 'why_at_time',
          tasks,
          activeProposal: activeProp,
          proposalHistory: this.proposalHistory,
          telemetryEvents: context.telemetryEvents || [],
          clock: this.clock,
        });
        return {
          state: CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION,
          intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
          targetTask: resolution.task,
          proposal: activeProp,
          responseText: explRes.responseText,
          spokenSummary: explRes.spokenSummary,
          evidence: explRes.evidence,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
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
        clarificationType: negotiation.clarificationType || null,
        candidateTasks: negotiation.candidateTasks || null,
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
   * Handle compound sequential or multi-intent commands deterministically.
   * If any sub-command requires clarification or confirmation, stops and presents that safeguard.
   * If all sub-commands are authorized or informational queries, executes them safely and combines results.
   * @private
   */
  _handleCompoundCommands(subCommands, tasks, context) {
    const results = [];
    let currentTasks = [...tasks];
    let compoundActions = [];
    let combinedResponses = [];
    let feedbackType = 'info';
    let completedCount = 0;

    for (let i = 0; i < subCommands.length; i++) {
      const subCmd = subCommands[i];
      const res = this.processInput(subCmd, { ...context, tasks: currentTasks });
      results.push(res);

      // If any subCommand triggers clarification or confirmation, preserve completed actions
      if (
        res.state === CONVERSATION_STATES.AWAITING_CONFIRMATION ||
        res.state === CONVERSATION_STATES.AWAITING_CLARIFICATION ||
        res.state === CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION
      ) {
        if (compoundActions.length > 0) {
          const summaryPrefix = `Completed ${completedCount} operation${completedCount === 1 ? '' : 's'}.`;
          return {
            ...res,
            completedCount,
            responseText: `${summaryPrefix} ${res.responseText}`,
            action: compoundActions.length === 1 ? compoundActions[0] : {
              type: 'COMPOUND_ACTIONS',
              actions: compoundActions,
            },
            isAuthorized: true,
          };
        }
        return res;
      }

      if (res.error) {
        return {
          ...res,
          responseText: combinedResponses.length > 0
            ? `${combinedResponses.join(' ')} Then encountered error: ${res.responseText}`
            : res.responseText,
          action: compoundActions.length > 0 ? (compoundActions.length === 1 ? compoundActions[0] : {
            type: 'COMPOUND_ACTIONS',
            actions: compoundActions,
          }) : null,
          isAuthorized: compoundActions.length > 0,
        };
      }

      if (res.responseText) {
        combinedResponses.push(res.responseText);
      }
      if (res.feedbackType === 'success' || res.feedbackType === 'warning' || res.feedbackType === 'error') {
        feedbackType = res.feedbackType;
      }

      if (res.action) {
        completedCount++;
        // If it created a task or mutated tasks in memory, update currentTasks for subsequent commands
        if (res.action.type === CONVERSATION_INTENTS.CREATE_TASK) {
          const taskId = res.action.taskId || `task-${this.clock()}-${Math.random().toString(36).substring(2, 6)}`;
          res.action.taskId = taskId;
          const simulatedTask = {
            id: taskId,
            title: res.action.title,
            dueDate: res.action.dueDate,
            priority: res.action.priority,
            estimatedEffort: res.action.estimatedEffort,
            completed: false,
          };
          currentTasks.push(simulatedTask);
          this.activeSubjectTaskId = taskId;
        } else if (res.action.taskId) {
          currentTasks = currentTasks.map((t) => {
            if (t.id !== res.action.taskId) return t;
            const updated = { ...t };
            if (res.action.type === CONVERSATION_INTENTS.CHANGE_PRIORITY) updated.priority = res.action.priority;
            if (res.action.type === CONVERSATION_INTENTS.RESCHEDULE_TASK) updated.dueDate = res.action.newDueDate;
            if (res.action.type === CONVERSATION_INTENTS.RENAME_TASK) updated.title = res.action.newTitle;
            if (res.action.type === CONVERSATION_INTENTS.COMPLETE_TASK) updated.completed = true;
            if (res.action.type === CONVERSATION_INTENTS.REOPEN_TASK) updated.completed = false;
            return updated;
          });
          this.activeSubjectTaskId = res.action.taskId;
        }
        compoundActions.push(res.action);
      }
    }

    const lastResult = results[results.length - 1] || {};
    const summaryPrefix = compoundActions.length > 1 ? `Executed ${compoundActions.length} operations.` : '';
    const finalResponseText = summaryPrefix
      ? `${summaryPrefix} ${combinedResponses.join(' ')}`
      : combinedResponses.join(' ');

    return {
      state: this.state,
      intent: 'COMPOUND_COMMANDS',
      targetTask: lastResult.targetTask || null,
      responseText: finalResponseText,
      feedbackType,
      requiresConfirmation: false,
      isAuthorized: compoundActions.length > 0,
      action: compoundActions.length === 1 ? compoundActions[0] : (compoundActions.length > 1 ? {
        type: 'COMPOUND_ACTIONS',
        actions: compoundActions,
      } : null),
      error: null,
    };
  }

  /**
   * Handle command parsing from IDLE state.
   * @private
   */
  _handleIdleState(text, tasks, context) {
    // 0. Compound Sequential / Multi-Intent Requests
    const subCommands = splitCompoundCommands(text);
    if (subCommands.length > 1) {
      return this._handleCompoundCommands(subCommands, tasks, context);
    }

    // 0a. Conversational Planning Debrief (Feature C)
    if (
      /^(?:how\s+did\s+(?:my\s+plan\s+go|i\s+do|today'?s\s+plan\s+go|yesterday'?s\s+plan\s+go|things\s+go|my\s+day\s+go)|plan\s+debrief|debrief(?:\s+(?:today|yesterday))?|what\s+should\s+i\s+review\s+from\s+(?:yesterday'?s|today'?s)\s+(?:plan|schedule)|which\s+tasks?\s+did\s+i\s+complete(?:\s+as\s+planned)?|what\s+remains\s+unfinished)\b/i.test(text)
    ) {
      const period = /yesterday/i.test(text) ? 'yesterday' : 'today';
      const debriefRes = generatePlanDebrief({
        period,
        tasks,
        telemetryEvents: context.telemetryEvents || [],
        proposalHistory: this.proposalHistory,
        clock: this.clock,
      });

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.PLAN_DEBRIEF,
        targetTask: null,
        responseText: debriefRes.responseText,
        spokenSummary: debriefRes.spokenSummary,
        metrics: debriefRes.metrics,
        completedDetails: debriefRes.completedDetails,
        incompleteDetails: debriefRes.incompleteDetails,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 0b. Single Task Movement Inquiry (Feature B)
    const taskMoveMatch = text.match(/^(?:why\s+did\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+move\??)$/i) ||
                          text.match(/^(?:why\s+was\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+moved\??)$/i);
    if (taskMoveMatch) {
      const taskQuery = taskMoveMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES, taskQuery, {
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // 0c. General Schedule Changes / Proposal Comparison (Feature B)
    if (
      /^(?:what\s+(?:has\s+)?changed(?:\s+in\s+my\s+schedule|\s+in\s+the\s+proposal|\s+since\s+(?:the\s+)?last\s+proposal|\s+after\s+i\s+accepted\s+(?:the\s+)?(?:new\s+)?schedule)?\??|what\s+moved(?:\s+since\s+(?:the\s+)?last\s+proposal|\s+in\s+my\s+schedule)?\??|compare\s+(?:this\s+plan\s+with\s+(?:the\s+)?previous\s+one|schedule\s+with\s+previous\s+proposal)\??)$/i.test(text)
    ) {
      const changeRes = explainScheduleChanges({
        activeProposal: this.activeProposal,
        proposalHistory: this.proposalHistory,
        tasks,
        telemetryEvents: context.telemetryEvents || [],
        clock: this.clock,
      });

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES,
        targetTask: null,
        responseText: changeRes.responseText,
        spokenSummary: changeRes.spokenSummary,
        movedTasks: changeRes.movedTasks,
        addedTasks: changeRes.addedTasks,
        removedTasks: changeRes.removedTasks,
        statusChanges: changeRes.statusChanges,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: changeRes.error || null,
      };
    }

    // 0d. Explain Scheduling Decision (Feature A)
    // Pattern 1: Why was [task] scheduled for [date]?
    const explainSchedDateMatch = text.match(
      /^(?:why\s+(?:was|is)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+scheduled\s+(?:for|on)\s+(.+?)\??)$/i
    );
    if (explainSchedDateMatch) {
      const taskQuery = explainSchedDateMatch[1].trim();
      const targetDateQuery = explainSchedDateMatch[2].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        targetDateQuery,
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 2: Why couldn't you fit [task] in [date]?
    const explainFitMatch = text.match(
      /^(?:why\s+(?:couldn't|could\s+not|can't|can\s+not|wasn't|was\s+not)\s+(?:you\s+)?(?:fit\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:in|on|for)\s+(.+?)\??)$/i
    );
    if (explainFitMatch) {
      const taskQuery = explainFitMatch[1].trim();
      const targetDateQuery = explainFitMatch[2].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        targetDateQuery,
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 3: Why is [task] blocked? / What is blocking [task]?
    const explainBlockedMatch = text.match(
      /^(?:why\s+is\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+blocked\??|what\s+is\s+blocking\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (explainBlockedMatch) {
      const taskQuery = (explainBlockedMatch[1] || explainBlockedMatch[2]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 4: Explain schedule for [task]
    const explainGeneralMatch = text.match(
      /^(?:explain\s+(?:the\s+)?(?:schedule|scheduling(?:\s+decision)?)\s+(?:for|of)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (explainGeneralMatch) {
      const taskQuery = explainGeneralMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 5: Why was [task] split?
    const explainSplitMatch = text.match(
      /^(?:why\s+(?:was|is|did\s+you\s+split)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:split|partitioned|divided)(?:\s+across\s+.+?)?\??)$/i
    ) || text.match(
      /^(?:why\s+(?:did\s+you\s+)?split\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)(?:\s+across\s+.+?)?\??)$/i
    );
    if (explainSplitMatch) {
      const taskQuery = explainSplitMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'why_split',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 6: How much work is scheduled for [task]?
    const workScheduledMatch = text.match(
      /^(?:how\s+much\s+(?:work|effort|time|hours?)\s+(?:is|was)\s+scheduled\s+(?:for|on)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (workScheduledMatch) {
      const taskQuery = workScheduledMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'work_scheduled',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 7: How much of [task] remains unscheduled?
    const workUnscheduledMatch = text.match(
      /^(?:how\s+much\s+(?:of\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+remains?\s+unscheduled\??|how\s+much\s+unscheduled\s+work\s+(?:remains\s+for|is\s+left\s+for)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (workUnscheduledMatch) {
      const taskQuery = (workUnscheduledMatch[1] || workUnscheduledMatch[2]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'work_unscheduled',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 8: Why couldn't you fit the whole task before its deadline?
    const fitBeforeDeadlineMatch = text.match(
      /^(?:why\s+(?:couldn't|could\s+not|can't|can\s+not)\s+(?:you\s+)?fit\s+(?:the\s+whole\s+|all\s+of\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:before|by)\s+(?:its\s+|the\s+)?deadline\??)$/i
    );
    if (fitBeforeDeadlineMatch) {
      const taskQuery = fitBeforeDeadlineMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'why_not_fit_before_deadline',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 9: How many sessions did you propose for [task]?
    const sessionCountMatch = text.match(
      /^(?:how\s+many\s+sessions?\s+(?:did\s+you\s+propose|are\s+proposed|were\s+proposed)\s+(?:for\s+)?(?:the\s+task\s+|my\s+task\s+)?(.+?)\??)$/i
    );
    if (sessionCountMatch) {
      const taskQuery = sessionCountMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'session_count',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Pattern 10: Why was [task] scheduled at [time]?
    const explainTimeMatch = text.match(
      /^(?:why\s+(?:was|is)\s+(?:the\s+task\s+|my\s+task\s+)?(.+?)\s+(?:scheduled\s+at|at)\s+(.+?)\??|why\s+(?:at\s+|scheduled\s+at\s+)(.+?)\??)$/i
    );
    if (explainTimeMatch) {
      const taskQuery = (explainTimeMatch[1] || '').trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION, taskQuery, {
        inquiryType: 'why_at_time',
        telemetryEvents: context.telemetryEvents || [],
      }, tasks);
    }

    // Command: Set working hours (e.g. "set my working hours to 9 AM to 5 PM", "set work hours 09:00 - 17:00")
    const workHoursMatch = text.match(
      /^(?:set\s+(?:my\s+)?(?:working|work)\s+hours\s+(?:to|from)\s+|my\s+(?:working|work)\s+hours\s+are\s+)(.+?)(?:\s+to\s+|\s*-\s*|\s+until\s+)(.+?)$/i
    );
    if (workHoursMatch) {
      const startM = parseTimeToMinutes(workHoursMatch[1]);
      const endM = parseTimeToMinutes(workHoursMatch[2]);
      if (startM !== null && endM !== null && startM < endM) {
        const startStr = minutesToTimeString(startM);
        const endStr = minutesToTimeString(endM);
        const currentSettings = loadTimeBlockSettings();
        saveTimeBlockSettings({
          ...currentSettings,
          workingHours: { start: startStr, end: endStr },
        });
        const resp = `Your working hours have been set to ${startStr} (${formatTimeAmPm(startM)}) – ${endStr} (${formatTimeAmPm(endM)}).`;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.SET_WORKING_HOURS,
          action: {
            type: 'SET_WORKING_HOURS',
            payload: { start: startStr, end: endStr },
          },
          responseText: resp,
          spokenSummary: `Working hours set to ${formatTimeAmPm(startM)} to ${formatTimeAmPm(endM)}.`,
          feedbackType: 'success',
          requiresConfirmation: false,
          isAuthorized: true,
          error: null,
        };
      } else {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.SET_WORKING_HOURS,
          action: null,
          responseText: `Invalid working hours range: "${workHoursMatch[1]}" to "${workHoursMatch[2]}". Please provide a valid start and end time (e.g. "9 AM to 5 PM").`,
          spokenSummary: 'Invalid working hours range.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          error: 'invalid_time_range',
        };
      }
    }

    // Command: Add meeting / blackout event
    const addMeetingMatch = text.match(
      /^(?:add\s+(?:meeting|blackout|event)\s+(.+?)\s+from\s+(.+?)(?:\s+to\s+|\s*-\s*)(.+?)(?:\s+on\s+(.+?))?|block\s+(?:time\s+for\s+)?(.+?)\s+from\s+(.+?)(?:\s+to\s+|\s*-\s*)(.+?)(?:\s+on\s+(.+?))?)$/i
    );
    if (addMeetingMatch) {
      const rawLabel = (addMeetingMatch[1] || addMeetingMatch[5] || 'Meeting').trim();
      const rawStart = (addMeetingMatch[2] || addMeetingMatch[6] || '').trim();
      const rawEnd = (addMeetingMatch[3] || addMeetingMatch[7] || '').trim();
      const rawDate = (addMeetingMatch[4] || addMeetingMatch[8] || '').trim();

      const startM = parseTimeToMinutes(rawStart);
      const endM = parseTimeToMinutes(rawEnd);

      if (startM !== null && endM !== null && startM < endM) {
        const startStr = minutesToTimeString(startM);
        const endStr = minutesToTimeString(endM);
        const label = rawLabel;
        const currentSettings = loadTimeBlockSettings();
        const newBlackout = {
          id: `bo_${Date.now()}`,
          title: label,
          label,
          start: startStr,
          end: endStr,
          startTime: startStr,
          endTime: endStr,
          date: rawDate || undefined,
          recurring: !rawDate ? 'daily' : undefined,
        };
        saveTimeBlockSettings({
          ...currentSettings,
          blackouts: [...currentSettings.blackouts, newBlackout],
        });
        const resp = `Marked ${label} (${startStr} to ${endStr}${rawDate ? ` on ${rawDate}` : ''}) as a blackout interval. VoxPlan will not schedule work during this time.`;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.ADD_BLACKOUT,
          action: {
            type: 'ADD_BLACKOUT',
            payload: newBlackout,
          },
          responseText: resp,
          spokenSummary: `Added blackout for ${label} from ${formatTimeAmPm(startM)} to ${formatTimeAmPm(endM)}.`,
          feedbackType: 'success',
          requiresConfirmation: false,
          isAuthorized: true,
          error: null,
        };
      }
    }

    // Command: Add blackout (e.g. "keep 1 PM to 2 PM free for lunch", "block 10 AM to 11 AM", "keep 13:00 to 14:00 free")
    const blackoutMatch = text.match(
      /^(?:keep\s+(.+?)(?:\s+to\s+|\s*-\s*)(.+?)\s+free(?:\s+for\s+(.+?))?|block\s+(.+?)(?:\s+to\s+|\s*-\s*)(.+?)(?:\s+for\s+(.+?))?|don't\s+schedule\s+(?:work\s+)?(?:from\s+)?(.+?)(?:\s+to\s+|\s*-\s*)(.+?)(?:\s+for\s+(.+?))?|add\s+blackout\s+(.+?)(?:\s+to\s+|\s*-\s*)(.+?)(?:\s+for\s+(.+?))?)$/i
    );
    if (blackoutMatch) {
      const rawStart = blackoutMatch[1] || blackoutMatch[4] || blackoutMatch[7] || blackoutMatch[10];
      const rawEnd = blackoutMatch[2] || blackoutMatch[5] || blackoutMatch[8] || blackoutMatch[11];
      const rawLabel = blackoutMatch[3] || blackoutMatch[6] || blackoutMatch[9] || blackoutMatch[12] || 'Unavailable';

      const startM = parseTimeToMinutes(rawStart);
      const endM = parseTimeToMinutes(rawEnd);

      if (startM !== null && endM !== null && startM < endM) {
        const startStr = minutesToTimeString(startM);
        const endStr = minutesToTimeString(endM);
        const label = rawLabel.trim();
        const currentSettings = loadTimeBlockSettings();
        const newBlackout = {
          id: `bo_${Date.now()}`,
          title: label,
          label,
          start: startStr,
          end: endStr,
          startTime: startStr,
          endTime: endStr,
          recurring: 'daily',
        };
        saveTimeBlockSettings({
          ...currentSettings,
          blackouts: [...currentSettings.blackouts, newBlackout],
        });
        const resp = `Marked ${startStr} – ${endStr} (${formatTimeAmPm(startM)} – ${formatTimeAmPm(endM)}) as unavailable (${label}). VoxPlan will not schedule work during this interval.`;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.ADD_BLACKOUT,
          action: {
            type: 'ADD_BLACKOUT',
            payload: newBlackout,
          },
          responseText: resp,
          spokenSummary: `Marked ${formatTimeAmPm(startM)} to ${formatTimeAmPm(endM)} as unavailable for ${label}.`,
          feedbackType: 'success',
          requiresConfirmation: false,
          isAuthorized: true,
          error: null,
        };
      } else {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.ADD_BLACKOUT,
          action: null,
          responseText: `Invalid blackout interval: "${rawStart}" to "${rawEnd}". Please provide valid start and end times (e.g. "keep 1 PM to 2 PM free for lunch").`,
          spokenSummary: 'Invalid blackout interval.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          error: 'invalid_interval',
        };
      }
    }

    // Command: Set focus window (e.g. "prefer focused work in the morning", "prefer morning focus", "set focus window 9 AM to 12 PM")
    const focusMatch = text.match(
      /^(?:prefer\s+(?:focused\s+work\s+in\s+the\s+|focus\s+in\s+the\s+|morning\s+focus|afternoon\s+focus)(.+)?|set\s+focus\s+window\s+(?:(.+?)\s+from\s+|from\s+)?(.+?)(?:\s+to\s+|\s*-\s*)(.+?)|prefer\s+focus\s+(?:(.+?)\s+from\s+|from\s+)?(.+?)(?:\s+to\s+|\s*-\s*)(.+?))$/i
    );
    if (focusMatch || /prefer\s+morning\s+focus|prefer\s+focused\s+work\s+in\s+the\s+morning/i.test(text)) {
      let startStr = '09:00';
      let endStr = '12:00';
      let label = 'Morning Deep Work';

      if (/afternoon/i.test(text)) {
        startStr = '13:00';
        endStr = '16:00';
        label = 'Afternoon Focus';
      } else if (focusMatch && (focusMatch[3] || focusMatch[6])) {
        const titleCandidate = (focusMatch[2] || focusMatch[5] || '').trim();
        if (titleCandidate) label = titleCandidate;
        const s = parseTimeToMinutes(focusMatch[3] || focusMatch[6]);
        const e = parseTimeToMinutes(focusMatch[4] || focusMatch[7]);
        if (s !== null && e !== null && s < e) {
          startStr = minutesToTimeString(s);
          endStr = minutesToTimeString(e);
        }
      }

      const currentSettings = loadTimeBlockSettings();
      const newFw = {
        id: `fw_${Date.now()}`,
        title: label,
        label,
        start: startStr,
        end: endStr,
        startTime: startStr,
        endTime: endStr,
        preferred: true,
      };
      saveTimeBlockSettings({
        ...currentSettings,
        focusWindows: [...currentSettings.focusWindows, newFw],
      });

      const resp = `Focus preference set: VoxPlan will prioritize scheduling tasks during ${startStr} to ${endStr} (${formatTimeAmPm(startStr)} – ${formatTimeAmPm(endStr)}) (${label}).`;
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.SET_FOCUS_WINDOW,
        action: {
          type: 'SET_FOCUS_WINDOW',
          payload: newFw,
        },
        responseText: resp,
        spokenSummary: `Focus window set for ${formatTimeAmPm(startStr)} to ${formatTimeAmPm(endStr)}.`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        error: null,
      };
    }

    // Command: Query available time on a day (e.g. "how much time is available on Tuesday?", "how much time do I have tomorrow?")
    const capacityQueryMatch = text.match(
      /^(?:how\s+much\s+(?:available\s+)?(?:time|capacity|hours?)\s+(?:is\s+available\s+|do\s+I\s+have\s+)?(?:on|for)\s+(.+?)\??)$/i
    );
    if (capacityQueryMatch) {
      const dateText = capacityQueryMatch[1].trim();
      const parsedDate = parseEnhancedDate(dateText, new Date(this.clock()));
      if (parsedDate) {
        const targetDate = parseDateISO(parsedDate);
        const dayOfWeek = targetDate ? targetDate.getDay() : 1;
        const timeSettings = context.timeBlockSettings || null;
        const avail = computeAvailableWindowsForDate(parsedDate, dayOfWeek, {
          workingHours: timeSettings?.workingHours,
          blackouts: timeSettings?.blackouts,
          dailyCapacityHours: context.dailyCapacityHours || 6.0,
        });

        const resp = `On ${parsedDate}, you have ${avail.totalAvailableHours.toFixed(1)}h of available working time across ${avail.availableWindows.length} window(s) (scheduled capacity limit: ${avail.schedulableCapacityHours.toFixed(1)}h/day)${avail.blackoutsApplied.length > 0 ? ` after ${avail.blackoutsApplied.length} blackout(s)` : ''}.`;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.QUERY_CAPACITY,
          responseText: resp,
          spokenSummary: `You have ${avail.totalAvailableHours.toFixed(1)} hours of available time on ${parsedDate}.`,
          evidence: {
            date: parsedDate,
            availableHours: avail.totalAvailableHours,
            schedulableCapacityHours: avail.schedulableCapacityHours,
            windowsCount: avail.availableWindows.length,
          },
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
    }

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

    // 10. Overdue Tasks Query ("Show my overdue tasks", "What tasks are overdue?", "List overdue tasks", "What is overdue?")
    if (/\b(?:show|list|what\s+are|view)\s+(?:my\s+)?overdue\s+tasks?\b/i.test(text) || /^what(?:'s|\s+is)\s+overdue\b/i.test(text)) {
      const todayISO = formatISODate(new Date(this.clock()));
      const overdue = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < todayISO);
      if (overdue.length === 0) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.QUERY_TASKS,
          targetTask: null,
          responseText: 'You have no overdue tasks! All active tasks are on track.',
          feedbackType: 'success',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
      const list = overdue.map((t) => `"${t.title}" (Due: ${t.dueDate})`).join(', ');
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.QUERY_TASKS,
        targetTask: overdue[0],
        responseText: `Found ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}: ${list}.`,
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 11. Upcoming Tasks Query ("Show tasks due this week", "Show upcoming tasks", "What's due this week?", "What's due tomorrow?")
    if (/\b(?:show|list|view)\s+(?:my\s+)?(?:upcoming|tasks?\s+due\s+this\s+week)\s*(?:tasks?)?\b/i.test(text) || /^what(?:'s|\s+is)\s+due\s+(?:today|tomorrow|this\s+week)\b/i.test(text)) {
      const todayISO = formatISODate(new Date(this.clock()));
      const nextWeekD = new Date(this.clock());
      nextWeekD.setDate(nextWeekD.getDate() + 7);
      const nextWeekISO = formatISODate(nextWeekD);
      const upcoming = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate >= todayISO && t.dueDate <= nextWeekISO);
      if (upcoming.length === 0) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.QUERY_TASKS,
          targetTask: null,
          responseText: 'No tasks scheduled in the next 7 days.',
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: null,
        };
      }
      const list = upcoming.map((t) => `"${t.title}" (Due: ${t.dueDate})`).join(', ');
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.QUERY_TASKS,
        targetTask: upcoming[0],
        responseText: `Tasks due in the next 7 days (${upcoming.length}): ${list}.`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 12. Task Deadline Inquiry on active or referenced task ("When is it due?", "What is its deadline?", "And what is its deadline?")
    if (/^(?:(?:and\s+)?what\s+is\s+(?:its|the)\s+deadline\??|when\s+is\s+it\s+due\??|tell\s+me\s+its\s+deadline\??)$/i.test(text)) {
      const activeTask = this.activeSubjectTaskId ? tasks.find((t) => t.id === this.activeSubjectTaskId) : null;
      if (!activeTask) {
        return {
          state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
          intent: CONVERSATION_INTENTS.DESCRIBE_TASK,
          targetTask: null,
          responseText: 'Which task would you like to check the deadline for?',
          feedbackType: 'warning',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'missing_context',
        };
      }
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.DESCRIBE_TASK,
        targetTask: activeTask,
        responseText: `"${activeTask.title}" is due on ${activeTask.dueDate || 'no deadline set'} (${activeTask.priority || 'medium'} priority).`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: { type: CONVERSATION_INTENTS.DESCRIBE_TASK, targetTask: activeTask },
        error: null,
      };
    }

    // 12b. Direct Task Deadline Inquiry ("When is my English task due?", "When is English due?", "What is the deadline for English?")
    const directTaskDeadlineMatch = text.match(/^(?:when\s+is|what\s+is\s+the\s+deadline\s+(?:for|of))\s+(?:my\s+|the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+due)?\??$/i);
    if (directTaskDeadlineMatch) {
      const taskName = directTaskDeadlineMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DESCRIBE_TASK, taskName, {}, tasks);
    }

    // 13. Find task and tell deadline ("Find my network lab and tell me its deadline")
    const findDeadlineMatch = text.match(/^(?:find|lookup|search(?:\s+for)?)\s+(?:my\s+|the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+and\s+(?:tell\s+me\s+its\s+deadline|what\s+is\s+its\s+deadline|when\s+is\s+it\s+due)$/i);
    if (findDeadlineMatch) {
      const taskName = findDeadlineMatch[1].trim();
      const resolution = this.resolveTaskReference(taskName, tasks);
      if (resolution.status === 'exact') {
        const target = resolution.task;
        this.activeSubjectTaskId = target.id;
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.DESCRIBE_TASK,
          targetTask: target,
          responseText: `"${target.title}" is due on ${target.dueDate || 'no deadline set'} (${target.priority || 'medium'} priority).`,
          feedbackType: 'info',
          requiresConfirmation: false,
          isAuthorized: true,
          action: { type: CONVERSATION_INTENTS.DESCRIBE_TASK, targetTask: target },
          error: null,
        };
      }
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DESCRIBE_TASK, taskName, {}, tasks);
    }

    // 14. Priority Change Command
    // e.g. "Change XYZ's priority to high", "Set the priority of task DEF to low", "Make it high priority", "Set DEF's priority to low"
    const prioOfMatch = text.match(/^(?:change|set|update)\s+(?:the\s+)?priority\s+(?:of|for)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:to|as|of)?\s+(.+)$/i);
    const prioPossMatch = text.match(/^(?:change|set|update)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:'s|’s)\s+priority\s+(?:to|as|of)?\s+(.+)$/i);
    const prioDirectMatch = text.match(/^(?:change|set|update)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+priority\s+(?:to|as|of)?\s+(.+)$/i);
    const prioMakeMatch = text.match(/^(?:make)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:to\s+|as\s+)?(high|medium|low|urgent|critical|minor|trivial)(?:\s+priority)?$/i);
    const prioPronounMatch = text.match(/^(?:make\s+(?:it|this|that|this\s+task|that\s+task)|set\s+(?:it|that|this)\s+(?:to|as|of)?|set\s+priority\s+(?:to|as|of)|change\s+(?:to|as|of)|change\s+priority\s+(?:to|as|of))\s+(.+)$/i);

    let priorityTarget = null;
    let priorityValue = null;

    if (prioOfMatch) {
      priorityTarget = prioOfMatch[1].trim();
      priorityValue = prioOfMatch[2].trim();
    } else if (prioPossMatch) {
      priorityTarget = prioPossMatch[1].trim();
      priorityValue = prioPossMatch[2].trim();
    } else if (prioDirectMatch) {
      priorityTarget = prioDirectMatch[1].trim();
      priorityValue = prioDirectMatch[2].trim();
    } else if (prioMakeMatch) {
      priorityTarget = prioMakeMatch[1].trim();
      priorityValue = prioMakeMatch[2].trim();
    } else if (prioPronounMatch) {
      priorityTarget = 'it';
      priorityValue = prioPronounMatch[1].trim();
    }

    if (priorityTarget && priorityValue) {
      const cleanVal = priorityValue.toLowerCase().replace(/\s+priority$/i, '').trim();
      let priority = null;
      if (['high', 'urgent', 'critical', 'highest'].includes(cleanVal)) priority = 'high';
      else if (['medium', 'normal'].includes(cleanVal)) priority = 'medium';
      else if (['low', 'minor', 'trivial', 'lowest'].includes(cleanVal)) priority = 'low';

      if (!priority) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.CHANGE_PRIORITY,
          targetTask: null,
          responseText: `Invalid priority "${priorityValue}". Priority must be high, medium, or low.`,
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'invalid_priority',
        };
      }

      return this._resolveAndDispatch(CONVERSATION_INTENTS.CHANGE_PRIORITY, priorityTarget, { priority }, tasks);
    }

    // 14b. Rename Task Command ("Rename XYZ to Prepare report", "Change title of DEF to Review code", "Rename it to ...")
    const rnMatch1 = text.match(/^rename\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i);
    const rnMatch2 = text.match(/^(?:change|update)\s+(?:the\s+)?(?:title|name)\s+(?:of|for)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i);
    const rnMatch3 = text.match(/^(?:change|update)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:'s|’s)\s+(?:title|name)\s+to\s+(.+)$/i);
    const rnMatch4 = text.match(/^(?:rename\s+(?:it|that|this)|change\s+its\s+(?:title|name))\s+to\s+(.+)$/i);

    const renameMatch = rnMatch1 || rnMatch2 || rnMatch3 || rnMatch4;
    if (renameMatch) {
      const targetName = rnMatch4 ? 'it' : renameMatch[1].trim();
      const newTitle = (rnMatch4 ? rnMatch4[1] : renameMatch[2]).trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '');
      if (!newTitle) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.RENAME_TASK,
          targetTask: null,
          responseText: 'New task title cannot be empty.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'invalid_title',
        };
      }
      return this._resolveAndDispatch(CONVERSATION_INTENTS.RENAME_TASK, targetName, { newTitle }, tasks);
    }

    // 14c. Task Assignment Command ("Assign XYZ to ABC" - truthful local-first explanation)
    const assignMatch = text.match(/^assign\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i);
    if (assignMatch) {
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: 'ASSIGN_TASK',
        targetTask: null,
        responseText: "Task assignment is not supported in VoxPlan's local-first single-user workspace. Active tasks remain assigned to you.",
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: null,
      };
    }

    // 15. Task Inquiry / Inspection ("Tell me about...", "Describe task...", "Show task...", "Find...", "Lookup...", "What about the other English task?")
    const describeMatch = text.match(/^(?:tell\s+me\s+about|describe|show(?:\s+details\s+of)?|what\s+is|what\s+about|inspect|find|lookup|search(?:\s+for)?)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (describeMatch) {
      const taskName = describeMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DESCRIBE_TASK, taskName, {}, tasks);
    }

    // 16. Task Command: Uncomplete / Mark as pending / Reopen
    const markPendingMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+as\s+(?:pending|incomplete|uncompleted|not\s+done|open)$/i);
    const uncompleteMatch = text.match(/^(?:uncomplete|uncheck|reopen)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (markPendingMatch || uncompleteMatch) {
      const taskName = (markPendingMatch ? markPendingMatch[1] : uncompleteMatch[1]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.REOPEN_TASK, taskName, {}, tasks);
    }

    // 17. Task Command: Complete / Mark as completed / "Mark it done"
    const markCompletedMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:as\s+)?(?:completed|complete|done|finished)$/i);
    const completeMatch = text.match(/^(?:complete|finish|check(?:\s+off)?)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (markCompletedMatch || completeMatch) {
      const taskName = (markCompletedMatch ? markCompletedMatch[1] : completeMatch[1]).trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.COMPLETE_TASK, taskName, {}, tasks);
    }

    // 18. Consequential Command: Delete task (requires confirmation!)
    const deleteMatch = text.match(/^(?:delete|remove)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (deleteMatch) {
      const taskName = deleteMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.DELETE_TASK, taskName, {}, tasks);
    }

    // 19. Task Command: Reschedule task / Deadline updates
    const reschedDirectMatch = text.match(/^reschedule\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+to(?:\s+(.+))?)?$/i) ||
                               text.match(/^(?:change|update|set)\s+(?:the\s+)?deadline\s+(?:of|for)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+to(?:\s+(.+))?)?$/i) ||
                               text.match(/^(?:change|update|set)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:'s|’s)\s+deadline(?:\s+to(?:\s+(.+))?)?$/i) ||
                               text.match(/^(?:change|set|update|reschedule)\s+(?:its|it|that|this)\s+(?:deadline\s+)?to(?:\s+(.+))?$/i);

    const clearDeadlineMatch = text.match(/^(?:remove|clear|delete)\s+(?:the\s+)?deadline\s+(?:of|for)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i) ||
                               text.match(/^(?:remove|clear|delete)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:'s|’s)\s+deadline$/i);

    if (clearDeadlineMatch) {
      const taskName = clearDeadlineMatch[1].trim();
      return this._resolveAndDispatch(CONVERSATION_INTENTS.RESCHEDULE_TASK, taskName, { newDueDate: null, rawDate: 'none' }, tasks);
    }

    if (reschedDirectMatch) {
      const isPronounResched = /^(?:change|set|update|reschedule)\s+(?:its|it|that|this)/i.test(reschedDirectMatch[0]);
      const taskName = isPronounResched ? 'it' : reschedDirectMatch[1].trim();
      const rawDate = (isPronounResched ? reschedDirectMatch[1] : reschedDirectMatch[2])?.trim() || '';
      let parsedDate = null;
      if (rawDate) {
        if (/^(?:none|no\s+deadline|clear|remove)$/i.test(rawDate)) {
          parsedDate = null;
        } else {
          parsedDate = parseEnhancedDate(rawDate, new Date(this.clock())) || parseDateExpression(rawDate, new Date(this.clock()));
          if (!parsedDate) {
            return {
              state: CONVERSATION_STATES.IDLE,
              intent: CONVERSATION_INTENTS.RESCHEDULE_TASK,
              targetTask: null,
              responseText: `Could not determine a valid date from "${rawDate}". Please specify a date like "tomorrow", "Friday", or "2026-10-25".`,
              feedbackType: 'error',
              requiresConfirmation: false,
              isAuthorized: false,
              action: null,
              error: 'invalid_date',
            };
          }
        }
      }
      return this._resolveAndDispatch(CONVERSATION_INTENTS.RESCHEDULE_TASK, taskName, { newDueDate: parsedDate, rawDate }, tasks);
    }

    // 19b. Effort Revision Command ("Change effort of XYZ to 3 hours", "Revise its effort to 2h")
    const effMatch1 = text.match(/^(?:change|set|update|revise)\s+(?:the\s+)?(?:effort|estimate|estimated\s+effort)\s+(?:of|for)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i);
    const effMatch2 = text.match(/^(?:change|set|update|revise)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)(?:'s|’s)\s+(?:effort|estimate|estimated\s+effort)\s+to\s+(.+)$/i);
    const effMatch3 = text.match(/^(?:change|set|update|revise)\s+its\s+(?:effort|estimate|estimated\s+effort)\s+to\s+(.+)$/i);

    const effMatch = effMatch1 || effMatch2 || effMatch3;
    if (effMatch) {
      const taskName = effMatch3 ? 'it' : effMatch[1].trim();
      const rawEffort = effMatch3 ? effMatch3[1] : effMatch[2];
      const parsedNum = parseFloat(rawEffort.replace(/[^\d.]/g, ''));
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.REVISE_EFFORT,
          targetTask: null,
          responseText: 'Estimated effort must be a positive number of hours.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'invalid_effort',
        };
      }
      return this._resolveAndDispatch(CONVERSATION_INTENTS.REVISE_EFFORT, taskName, { newEffort: parsedNum }, tasks);
    }

    // 20. Task Command: Create / Add task (handles simple and compound requests)
    const isCreateIntent = /^(?:create|add|new|make|schedule)\b/i.test(text) ||
      /^(?:another\s+task|another\s+called|another\s+named|another)\b/i.test(text) ||
      /^(?:remind\s+me\s+to|i\s+need\s+to|i\s+have\s+to|i\s+must|put|place)\b/i.test(text) ||
      /\badd\s+(?:it\s+)?to\s+(?:my\s+)?tasks\b/i.test(text);
    if (isCreateIntent) {
      return this._handleCreateTaskIntent(text);
    }

    // 21. Fallback: Unrecognized input
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

    if (resolution.status === RESOLUTION_STATUS.RESOLVED || resolution.status === 'exact') {
      const target = resolution.task;
      // HARD MUTATION SAFETY INVARIANT: Task must exist in current tasks with valid ID
      if (!target || !target.id || !tasks.some((t) => t.id === target.id)) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent,
          targetTask: null,
          responseText: `Referenced task is no longer available.`,
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'task_not_found',
        };
      }
      this.activeSubjectTaskId = target.id;
      return this._dispatchIntentWithTarget(intent, target, params, tasks);
    }

    if (resolution.status === RESOLUTION_STATUS.AMBIGUOUS || resolution.status === 'ambiguous') {
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = { intent, params };
      this.pendingClarification = {
        missingField: 'targetTask',
        query: taskNameQuery,
        matches: resolution.matches,
      };

      const now = new Date(this.clock());

      const count = resolution.matches.length;
      const countWord = count === 2 ? 'two' : count === 3 ? 'three' : count === 4 ? 'four' : `${count}`;
      const verb = intent === CONVERSATION_INTENTS.COMPLETE_TASK ? 'mark complete'
        : intent === CONVERSATION_INTENTS.DELETE_TASK ? 'delete'
        : intent === CONVERSATION_INTENTS.RESCHEDULE_TASK ? 'reschedule'
        : intent === CONVERSATION_INTENTS.CHANGE_PRIORITY ? 'update'
        : intent === CONVERSATION_INTENTS.REOPEN_TASK ? 'reopen'
        : intent === CONVERSATION_INTENTS.DESCRIBE_TASK ? 'check'
        : intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION ? 'explain'
        : intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES ? 'check changes for'
        : 'modify';

      // Check if duplicate titles exist across matching candidates
      const titleCounts = {};
      for (const m of resolution.matches) {
        const norm = m.title.trim().toLowerCase();
        titleCounts[norm] = (titleCounts[norm] || 0) + 1;
      }
      const hasDuplicateTitles = Object.values(titleCounts).some((c) => c > 1);

      // Distinguishing labels for candidates with stable numbers
      const formattedCandidates = resolution.matches.map((t, idx) => {
        const meta = [];
        if (t.dueDate) {
          meta.push(formatTaskDueDate(t.dueDate, now).toLowerCase());
        } else {
          meta.push('no deadline');
        }
        if (t.category && t.category !== 'General') {
          meta.push(t.category);
        }
        const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
        return `${idx + 1}. "${t.title}"${metaStr}`;
      }).join(', ');

      let responseText = '';
      if (hasDuplicateTitles || count > 2) {
        responseText = `I found ${countWord} matching tasks. Which one should I ${verb}? ${formattedCandidates}`;
      } else {
        responseText = `I found ${countWord} matching tasks: ${resolution.matches[0].title} and ${resolution.matches[1].title}. Which one should I ${verb}?`;
      }

      this.pendingClarification.prompt = responseText;

      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent,
        targetTask: null,
        candidateTasks: resolution.matches,
        clarificationQuery: taskNameQuery,
        responseText,
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'ambiguous_reference',
      };
    }

    if (resolution.status === 'missing_context' || resolution.status === RESOLUTION_STATUS.NEEDS_CLARIFICATION) {
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = { intent, params };
      const verb = intent === CONVERSATION_INTENTS.COMPLETE_TASK ? 'mark as done'
        : intent === CONVERSATION_INTENTS.DELETE_TASK ? 'delete'
        : intent === CONVERSATION_INTENTS.REOPEN_TASK ? 'reopen'
        : intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION ? 'explain'
        : intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES ? 'check changes for'
        : 'inspect';
      const prompt = `I'm not sure which task you mean by "${taskNameQuery}". Which task would you like to ${verb}?`;
      this.pendingClarification = {
        missingField: 'targetTask',
        query: taskNameQuery,
        matches: [],
        prompt,
      };
      return {
        state: CONVERSATION_STATES.AWAITING_CLARIFICATION,
        intent,
        targetTask: null,
        candidateTasks: [],
        clarificationQuery: taskNameQuery,
        responseText: prompt,
        feedbackType: 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: 'missing_context',
      };
    }

    // status: not_found
    let notFoundMsg = `Task not found: "${taskNameQuery}"`;
    if (resolution.reason === 'deadline_mismatch') {
      notFoundMsg = `No task matching "${taskNameQuery}" was found with that deadline.`;
    }
    return {
      state: CONVERSATION_STATES.IDLE,
      intent,
      targetTask: null,
      responseText: notFoundMsg,
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

    // 6. Change Priority
    if (intent === CONVERSATION_INTENTS.CHANGE_PRIORITY) {
      const priority = params?.priority || 'medium';
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.CHANGE_PRIORITY,
        targetTask: target,
        responseText: `Setting priority of "${target.title}" to ${priority}.`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: CONVERSATION_INTENTS.CHANGE_PRIORITY,
          taskId: target.id,
          targetTask: target,
          priority,
        },
        error: null,
      };
    }

    // 6b. Rename Task
    if (intent === CONVERSATION_INTENTS.RENAME_TASK) {
      const newTitle = params?.newTitle;
      if (!newTitle || typeof newTitle !== 'string' || !newTitle.trim()) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.RENAME_TASK,
          targetTask: target,
          responseText: 'New task title cannot be empty.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'invalid_title',
        };
      }
      const cleanTitle = newTitle.trim();
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.RENAME_TASK,
        targetTask: target,
        responseText: `Renamed task "${target.title}" to "${cleanTitle}".`,
        feedbackType: 'success',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: CONVERSATION_INTENTS.RENAME_TASK,
          taskId: target.id,
          targetTask: target,
          newTitle: cleanTitle,
        },
        error: null,
      };
    }

    // 6c. Revise Effort
    if (intent === CONVERSATION_INTENTS.REVISE_EFFORT) {
      const newEffort = params?.newEffort;
      if (typeof newEffort !== 'number' || isNaN(newEffort) || newEffort <= 0) {
        return {
          state: CONVERSATION_STATES.IDLE,
          intent: CONVERSATION_INTENTS.REVISE_EFFORT,
          targetTask: target,
          responseText: 'Estimated effort must be a positive number of hours.',
          feedbackType: 'error',
          requiresConfirmation: false,
          isAuthorized: false,
          action: null,
          error: 'invalid_effort',
        };
      }
      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.REVISE_EFFORT,
        targetTask: target,
        responseText: `Updated effort estimate for "${target.title}" to ${newEffort}h.`,
        feedbackType: 'info',
        requiresConfirmation: false,
        isAuthorized: true,
        action: {
          type: CONVERSATION_INTENTS.REVISE_EFFORT,
          taskId: target.id,
          targetTask: target,
          newEffort,
        },
        error: null,
      };
    }

    // 7. Explain Scheduling Decision (Read-only -> no mutation!)
    if (intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION) {
      const res = explainScheduleDecision({
        targetTask: target,
        targetDateQuery: params?.targetDateQuery || null,
        inquiryType: params?.inquiryType || null,
        tasks: _tasks,
        activeProposal: this.activeProposal,
        proposalHistory: this.proposalHistory,
        telemetryEvents: params?.telemetryEvents || [],
        clock: this.clock,
      });

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION,
        targetTask: target,
        responseText: res.responseText,
        spokenSummary: res.spokenSummary,
        evidence: res.evidence,
        feedbackType: res.success ? 'info' : 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: res.error || null,
      };
    }

    // 8. Explain Schedule Changes for specific task (Read-only -> no mutation!)
    if (intent === CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES) {
      const changeRes = explainScheduleChanges({
        activeProposal: this.activeProposal,
        proposalHistory: this.proposalHistory,
        tasks: _tasks,
        telemetryEvents: params?.telemetryEvents || [],
        queryTaskId: target.id,
        clock: this.clock,
      });

      return {
        state: CONVERSATION_STATES.IDLE,
        intent: CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_CHANGES,
        targetTask: target,
        responseText: changeRes.responseText,
        spokenSummary: changeRes.spokenSummary,
        feedbackType: changeRes.success ? 'info' : 'warning',
        requiresConfirmation: false,
        isAuthorized: false,
        action: null,
        error: changeRes.error || null,
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
   * Leverages parseCompoundTaskCreation to cleanly separate title from deadline and priority phrases.
   * @private
   */
  _handleCreateTaskIntent(text) {
    const parsed = parseCompoundTaskCreation(text, new Date(this.clock()));

    if (!parsed || !parsed.title) {
      // Missing title -> transition to AWAITING_CLARIFICATION
      this.state = CONVERSATION_STATES.AWAITING_CLARIFICATION;
      this.pendingIntent = {
        intent: CONVERSATION_INTENTS.CREATE_TASK,
        params: {
          priority: parsed?.priority || 'medium',
          estimatedEffort: parsed?.estimatedEffort || null,
          dueDate: parsed?.dueDate || null,
        },
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

    const priority = parsed.priority || 'medium';
    const dueDate = parsed.dueDate || null;
    const estimatedEffort = parsed.estimatedEffort || null;
    const rawTitle = parsed.title;

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
