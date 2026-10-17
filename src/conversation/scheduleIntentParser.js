/**
 * VoxPlan Conversational Schedule Intent Parser
 * Phase 5, Stage 5.2: Natural-Language Schedule Negotiation & Rescheduling
 *
 * Deterministic natural language parsing for scheduling intents:
 * - Direct task rescheduling ("Move my database assignment to tomorrow", "Reschedule task X to Friday")
 * - Relative-date offsets ("Push low-priority tasks by 2 days", "Delay database assignment by 3 days")
 * - Capacity negotiation & spreading ("Tomorrow looks overloaded. Spread it out", "Spread tasks across next 3 days")
 * - Capacity queries ("Do I have capacity for a 4-hour task on Thursday?", "Find a day with more capacity")
 * - Hypothetical simulations ("What happens if I move this task to Friday?", "What if I delay task X by 3 days?")
 * - Dependency scheduling ("Schedule this after my database assignment")
 * - Acceptance & Discard ("Accept proposal", "Apply", "Discard", "Reject")
 *
 * Pure, deterministic rules without external cloud LLM dependencies.
 */

import { parseDateExpression } from './dialogueManager.js';
import { parseEnhancedDate } from './compoundCommandParser.js';

export const SCHEDULE_INTENTS = Object.freeze({
  DIRECT_RESCHEDULE: 'DIRECT_RESCHEDULE',
  RELATIVE_SHIFT: 'RELATIVE_SHIFT',
  SPREAD_TASKS: 'SPREAD_TASKS',
  CAPACITY_QUERY: 'CAPACITY_QUERY',
  HYPOTHETICAL_SIMULATION: 'HYPOTHETICAL_SIMULATION',
  SCHEDULE_AFTER: 'SCHEDULE_AFTER',
  ACCEPT_PROPOSAL: 'ACCEPT_PROPOSAL',
  DISCARD_PROPOSAL: 'DISCARD_PROPOSAL',
  INCOMPLETE_REQUEST: 'INCOMPLETE_REQUEST',
  UNSUPPORTED: 'UNSUPPORTED',
});

/**
 * Parses schedule-specific intents and parameters from raw text.
 *
 * @param {string} rawText User input
 * @param {Object} options
 * @param {Object|null} [options.activeSubjectTask] Currently focused task from recent turns
 * @param {Array<Object>} [options.tasks] Available tasks
 * @param {Function} [options.clock] Clock returning current timestamp in ms
 * @returns {Object} Structured schedule intent descriptor
 */
export function parseScheduleIntent(rawText, options = {}) {
  const text = typeof rawText === 'string' ? rawText.trim().replace(/[.!?]+$/, '') : '';
  const now = options.clock ? new Date(options.clock()) : new Date();
  const activeSubject = options.activeSubjectTask || null;

  if (!text) {
    return {
      intent: SCHEDULE_INTENTS.UNSUPPORTED,
      confidence: 0,
      params: {},
      rawText,
    };
  }

  // Guard: Exclude general commands like creating tasks or opening sprint scheduler
  if (/^(?:plan\s+sprint|schedule\s+sprint|adaptive\s+schedule|open\s+scheduler|suggest\s+schedule)$/i.test(text) ||
      /^(?:create|add|new|make)\b/i.test(text) ||
      /^schedule\s+(?:a\s+)?new\b/i.test(text) ||
      /^reschedule\s+.+\s+to\s*$/i.test(text)) {
    return {
      intent: SCHEDULE_INTENTS.UNSUPPORTED,
      confidence: 0,
      params: {},
      rawText,
    };
  }

  // 1. Explicit Acceptance of Active Proposal
  if (/^(?:accept(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|apply(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|confirm\s+(?:schedule|proposal)|looks?\s+good|proceed\s+with\s+(?:schedule|proposal))$/i.test(text)) {
    return {
      intent: SCHEDULE_INTENTS.ACCEPT_PROPOSAL,
      confidence: 1.0,
      params: {},
      rawText,
    };
  }

  // 2. Explicit Discard of Active Proposal
  if (/^(?:discard(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|reject(?:\s+(?:the\s+)?(?:schedule|proposal|changes?))?|cancel\s+(?:schedule|proposal)|keep\s+(?:existing|current)\s+schedule|don't\s+apply)$/i.test(text)) {
    return {
      intent: SCHEDULE_INTENTS.DISCARD_PROPOSAL,
      confidence: 1.0,
      params: {},
      rawText,
    };
  }

  // 3a. Conversational Revision on Active Subject: "What about Monday instead?", "How about Friday?", "What about tomorrow?", "To Monday instead", "Monday instead", "Change that to Friday instead"
  const whatAboutDateMatch =
    text.match(/^(?:what\s+about|how\s+about)\s+(.+?)(?:\s+instead)?$/i) ||
    text.match(/^(?:change|move|shift|set)\s+(?:that|it|this)\s+(?:to|on)\s+(.+?)(?:\s+instead)?$/i) ||
    text.match(/^(?:to|on)\s+(.+?)\s+instead$/i) ||
    text.match(/^([a-zA-Z]+|\d{4}-\d{2}-\d{2})\s+instead$/i);
  if (whatAboutDateMatch) {
    const rawDatePart = whatAboutDateMatch[1].trim();
    const parsedDate = parseEnhancedDate(rawDatePart, now) || parseDateExpression(rawDatePart, now);
    if (parsedDate) {
      return {
        intent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
        confidence: 0.95,
        params: {
          targetTaskQuery: activeSubject ? activeSubject.title : 'it',
          targetDate: parsedDate,
          rawDateString: rawDatePart,
        },
        rawText,
      };
    }
  }

  // 3b. Conversational Relative Extension: "Give it two more days", "Give it 3 days", "Give it another day"
  const giveMoreMatch = text.match(/^(?:give\s+(?:it|this\s+task)\s+(\d+|[a-zA-Z]+)\s+more\s+days?|give\s+(?:it|this\s+task)\s+another\s+day)$/i);
  if (giveMoreMatch) {
    let days = 1;
    if (giveMoreMatch[1]) {
      const token = giveMoreMatch[1].toLowerCase();
      days = /^\d+$/.test(token) ? parseInt(token, 10) : token === 'two' ? 2 : token === 'three' ? 3 : 1;
    }
    return {
      intent: SCHEDULE_INTENTS.RELATIVE_SHIFT,
      confidence: 0.95,
      params: {
        isBatch: false,
        targetTaskQuery: activeSubject ? activeSubject.title : 'it',
        offsetDays: days,
      },
      rawText,
    };
  }

  // 3c. Hypothetical Simulation / "What if" Questions
  // Examples:
  // "What happens if I move this task to Friday?"
  // "What if I delay the database migration by 3 days?"
  // "What if I move it to Saturday instead?"
  // "Can I move this to next week?"
  const whatIfMatch = text.match(/^(?:what\s+happens\s+if|what\s+if|can\s+i(?:\s+safely)?\s+(?:move|reschedule|shift|delay)|how\s+does\s+it\s+look\s+if)\s+(.+)$/i);
  if (whatIfMatch) {
    const subQuery = whatIfMatch[1].trim();
    const parsedSub = _parseActionBody(subQuery, activeSubject, now);
    return {
      intent: SCHEDULE_INTENTS.HYPOTHETICAL_SIMULATION,
      confidence: 0.95,
      params: {
        ...parsedSub,
        isSimulationOnly: true,
      },
      rawText,
    };
  }

  // 4. Capacity Negotiation / Workload Spreading
  // Examples:
  // "Tomorrow looks overloaded. Spread it out."
  // "Spread my tasks across the next 3 days"
  // "Balance workload over next week"
  // "Spread tasks over 4 days"
  const spreadMatch = text.match(/(?:spread|balance|distribute)\s+(?:my\s+|the\s+)?(?:tasks?|workload|work)?(?:\s+(?:out|across|over)\s+(?:the\s+next\s+)?(\d+)\s+days?)?/i) ||
    text.match(/(?:too\s+much\s+work|overloaded|heavy\s+load)(?:.+?(?:spread|balance)\s+(?:it\s+)?out)?/i);

  if (spreadMatch) {
    let horizonDays = 3;
    const daysMatch = text.match(/\b(\d+)\s+days?\b/i);
    if (daysMatch) {
      horizonDays = Math.max(1, Math.min(30, parseInt(daysMatch[1], 10)));
    } else if (/\bnext\s+week\b/i.test(text)) {
      horizonDays = 7;
    }

    return {
      intent: SCHEDULE_INTENTS.SPREAD_TASKS,
      confidence: 0.9,
      params: {
        horizonDays,
        reason: 'workload_smoothing',
      },
      rawText,
    };
  }

  // 5. Capacity Query / Feasibility Check
  // Examples:
  // "Do I have capacity for a 4-hour task on Thursday?"
  // "Can you fit this into my existing schedule?"
  // "Find a day with more available capacity"
  // "Do I have free capacity tomorrow?"
  if (/\b(?:do\s+i\s+have(?:\s+enough|\s+available|\s+free)?\s+capacity|is\s+there\s+(?:available\s+)?capacity|can\s+you\s+fit\s+(?:this|a\s+task)|find\s+a\s+day\s+with\s+more\s+capacity)\b/i.test(text)) {
    let requestedHours = null;
    const hoursMatch = text.match(/\b(\d+(?:\.\d+)?)[-\s]*(?:hours?|hrs?|h)\b/i);
    if (hoursMatch) {
      requestedHours = parseFloat(hoursMatch[1]);
    }

    let targetDate = null;
    const onDateMatch = text.match(/\b(?:on|for)\s+(.+)$/i);
    if (onDateMatch) {
      targetDate = parseDateExpression(onDateMatch[1], now);
    }

    return {
      intent: SCHEDULE_INTENTS.CAPACITY_QUERY,
      confidence: 0.9,
      params: {
        requestedHours: requestedHours ?? (activeSubject?.estimatedEffort || 2.0),
        targetDate,
        targetTask: activeSubject,
      },
      rawText,
    };
  }

  // 6. Dependency-related scheduling ("Schedule this after my database assignment")
  const afterMatch = text.match(/^(?:schedule|move|place|put)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+after\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
  if (afterMatch) {
    const targetTaskQuery = afterMatch[1].trim();
    const prerequisiteTaskQuery = afterMatch[2].trim();
    return {
      intent: SCHEDULE_INTENTS.SCHEDULE_AFTER,
      confidence: 0.95,
      params: {
        targetTaskQuery,
        prerequisiteTaskQuery,
      },
      rawText,
    };
  }

  // 7. Relative-Date Shifts across tasks (e.g. "Push low-priority tasks by 2 days", "Delay high risk tasks by 1 day")
  const batchShiftMatch = text.match(/^(?:push|delay|postpone|advance|shift|move)\s+(all\s+)?(low[- ]priority|medium[- ]priority|high[- ]priority|low|medium|high)\s+(?:tasks?\s+)?(?:by|forward|back)?\s*(\d+)\s+days?$/i);
  if (batchShiftMatch) {
    const priorityRaw = batchShiftMatch[2].toLowerCase();
    const priority = priorityRaw.includes('high') ? 'high' : priorityRaw.includes('low') ? 'low' : 'medium';
    const offsetDays = parseInt(batchShiftMatch[3], 10);
    const isForward = !/\b(?:earlier|advance|forward|back)\b/i.test(text) || /\b(?:forward|by)\b/i.test(text);
    const effectiveOffset = isForward ? offsetDays : -offsetDays;

    return {
      intent: SCHEDULE_INTENTS.RELATIVE_SHIFT,
      confidence: 0.95,
      params: {
        isBatch: true,
        priorityFilter: priority,
        offsetDays: effectiveOffset,
      },
      rawText,
    };
  }

  // 8. Single Task Relative Shift (e.g. "Push database assignment by 2 days", "Move it earlier by 1 day")
  const singleShiftMatch = text.match(/^(?:push|delay|postpone|advance|shift|move)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:by\s+)?(\d+)\s+days?\s*(later|earlier|forward|back)?$/i);
  if (singleShiftMatch) {
    const targetQuery = singleShiftMatch[1].trim();
    const days = parseInt(singleShiftMatch[2], 10);
    const direction = (singleShiftMatch[3] || '').toLowerCase();
    const isEarlier = direction === 'earlier' || direction === 'back' || /\bearlier\b/i.test(text);
    const offsetDays = isEarlier ? -days : days;

    return {
      intent: SCHEDULE_INTENTS.RELATIVE_SHIFT,
      confidence: 0.9,
      params: {
        isBatch: false,
        targetTaskQuery: targetQuery,
        offsetDays,
      },
      rawText,
    };
  }

  // 9a. Explicit Deadline Modification ("Change the deadline for English to the 19th", "Set the English assignment deadline to tomorrow", "Change the deadline for the task about preparing my presentation")
  const deadlineWithDateMatch =
    text.match(/^(?:change|set|update)\s+(?:the\s+)?deadline\s+(?:for|of)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:about\s+|called\s+|named\s+)?(.+?)\s+(?:to|on)\s+(.+)$/i) ||
    text.match(/^(?:set|change|update)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+deadline\s+(?:to|on)\s+(.+)$/i);
  const deadlineWithoutDateMatch = !deadlineWithDateMatch
    ? text.match(/^(?:change|set|update)\s+(?:the\s+)?deadline\s+(?:for|of)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:about\s+|called\s+|named\s+)?(.+)$/i)
    : null;

  const deadlineChangeMatch = deadlineWithDateMatch || deadlineWithoutDateMatch;

  if (deadlineChangeMatch) {
    let targetTaskQuery = deadlineChangeMatch[1].trim();
    // Normalize target query: remove trailing noise words
    targetTaskQuery = targetTaskQuery.replace(/^(?:the\s+|my\s+)?(?:task\s+)?(?:about\s+)?/i, '').trim();
    const rawDatePart = deadlineWithDateMatch ? deadlineWithDateMatch[2].trim() : '';
    const parsedDate = rawDatePart ? (parseEnhancedDate(rawDatePart, now) || parseDateExpression(rawDatePart, now)) : null;

    if (!rawDatePart) {
      return {
        intent: SCHEDULE_INTENTS.INCOMPLETE_REQUEST,
        confidence: 0.9,
        params: {
          missingField: 'targetDate',
          targetTaskQuery,
        },
        rawText,
      };
    }

    return {
      intent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
      confidence: 0.95,
      params: {
        targetTaskQuery,
        targetDate: parsedDate,
        rawDateString: rawDatePart,
      },
      rawText,
    };
  }

  // 9b. Direct Task Rescheduling (e.g. "Move my database assignment to Friday", "Reschedule task X to tomorrow", "Move English to the 19th")
  const directWithDateMatch = text.match(/^(?:move|reschedule|shift|schedule|put|postpone)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+(?:to|on)\s+(.+)$/i);
  const directWithoutDateMatch = !directWithDateMatch
    ? text.match(/^(?:move|reschedule|shift|schedule|put|postpone)\s+(?:the\s+|my\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i)
    : null;
  const directMatch = directWithDateMatch || directWithoutDateMatch;
  if (directMatch) {
    let targetTaskQuery = directMatch[1].trim();
    targetTaskQuery = targetTaskQuery.replace(/^(?:the\s+|my\s+)?(?:task\s+)?(?:about\s+)?/i, '').replace(/\s+task$/i, '').trim();
    const rawDatePart = directWithDateMatch ? directWithDateMatch[2].trim() : '';
    const parsedDate = rawDatePart ? (parseEnhancedDate(rawDatePart, now) || parseDateExpression(rawDatePart, now)) : null;

    if (!rawDatePart) {
      return {
        intent: SCHEDULE_INTENTS.INCOMPLETE_REQUEST,
        confidence: 0.85,
        params: {
          missingField: 'targetDate',
          targetTaskQuery,
        },
        rawText,
      };
    }

    return {
      intent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
      confidence: 0.9,
      params: {
        targetTaskQuery,
        targetDate: parsedDate,
        rawDateString: rawDatePart,
      },
      rawText,
    };
  }

  return {
    intent: SCHEDULE_INTENTS.UNSUPPORTED,
    confidence: 0,
    params: {},
    rawText,
  };
}

/**
 * Internal helper to parse the action body of hypothetical or relative queries.
 * @private
 */
function _parseActionBody(actionText, activeSubject, now) {
  const text = actionText.trim();

  // Check for relative shift in sub-query: "delay the database migration by 3 days"
  const relMatch = text.match(/(?:delay|push|postpone|advance|shift|move)\s+(?:the\s+)?(.+?)\s+by\s+(\d+)\s+days?/i);
  if (relMatch) {
    const targetQuery = relMatch[1].trim();
    const days = parseInt(relMatch[2], 10);
    const isEarlier = /\bearlier\b/i.test(text);
    return {
      subIntent: SCHEDULE_INTENTS.RELATIVE_SHIFT,
      targetTaskQuery: targetQuery,
      offsetDays: isEarlier ? -days : days,
    };
  }

  // Check for direct move: "move it to Saturday", "move this task to Friday", "move Database Assignment to next week"
  const moveMatch = text.match(/(?:move|reschedule|shift|schedule)\s+(?:the\s+)?(.+?)\s+(?:to|on)\s+(.+)$/i);
  if (moveMatch) {
    const targetQuery = moveMatch[1].trim();
    const rawDate = moveMatch[2].trim();
    const parsedDate = parseEnhancedDate(rawDate, now) || parseDateExpression(rawDate, now);
    return {
      subIntent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
      targetTaskQuery: targetQuery,
      targetDate: parsedDate,
      rawDateString: rawDate,
    };
  }

  // If input is simply a date (e.g. after a prior move): "to Saturday instead", "on Friday", "Monday instead"
  const dateOnlyMatch = text.match(/^(?:to|on|what\s+about|how\s+about)\s+(.+?)(?:\s+instead)?$/i) || text.match(/^(.+?)\s+instead$/i);
  if (dateOnlyMatch) {
    const rawDate = dateOnlyMatch[1].trim();
    const parsedDate = parseEnhancedDate(rawDate, now) || parseDateExpression(rawDate, now);
    if (parsedDate) {
      return {
        subIntent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
        targetTaskQuery: activeSubject ? (activeSubject.title || 'it') : 'it',
        targetDate: parsedDate,
        rawDateString: rawDate,
      };
    }
  }

  return {
    subIntent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
    raw: text,
  };
}
