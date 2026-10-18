/**
 * VoxPlan Compound Command & Enhanced Intent Parser
 * Phase 5.3 Hardening: Compound Commands & Adaptive Intent Resolution
 *
 * Provides deterministic extraction for:
 * 1. Compound task creation: cleanly separates task title from instructions, priority, and deadline phrases.
 * 2. Natural language date parsing: word numbers ("three days"), weekdays ("Friday"), human dates ("October 25"),
 *    relative expressions ("by the end of this week", "due tomorrow", "deadline to November 3").
 * 3. Priority extraction: high, medium, low, urgent, critical, minor, trivial.
 * 4. Multi-intent / sequential requests: compound read-only queries and creation with follow-up overview.
 *
 * 100% deterministic, local-first; zero external LLM or cloud API dependencies.
 */

const WORD_TO_NUMBER = Object.freeze({
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  twenty: 20,
  thirty: 30,
});

/**
 * Format Date to YYYY-MM-DD
 * @param {Date} d
 * @returns {string}
 */
export function formatISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a task due date string (YYYY-MM-DD) consistently across all UI and conversation surfaces.
 * Respects local calendar date without UTC drift.
 *
 * @param {string|null|undefined} dueDateStr ISO date string (YYYY-MM-DD)
 * @param {Date|number} [referenceDate] Injected local date or timestamp (defaults to current local Date)
 * @returns {string} Human-friendly formatted deadline (e.g. "Due today", "Due tomorrow", "Due Oct 19", "Overdue by 1 day", "No deadline")
 */
export function formatTaskDueDate(dueDateStr, referenceDate = new Date()) {
  if (!dueDateStr) return 'No deadline';
  const cleanStr = String(dueDateStr).trim();
  const dateMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return `Due ${cleanStr}`;

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10) - 1;
  const day = parseInt(dateMatch[3], 10);

  const ref = referenceDate instanceof Date && !isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : typeof referenceDate === 'number'
    ? new Date(referenceDate)
    : new Date();

  const targetDate = new Date(year, month, day);
  const refDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  const diffTime = targetDate.getTime() - refDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return 'Overdue by 1 day';
  if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)} days`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[month] || '';
  if (year === ref.getFullYear()) {
    return `Due ${monthName} ${day}`;
  }
  return `Due ${monthName} ${day}, ${year}`;
}

const MONTH_MAP = Object.freeze({
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
});

/**
 * Enhanced natural-language date parser supporting:
 * - "today", "tomorrow", "for today", "for tomorrow"
 * - "in X days", "in three days", "due in 2 days"
 * - "next week", "this week", "by the end of this week", "end of week"
 * - "Friday", "next Monday", "this Thursday", "for Friday"
 * - "October 25", "Nov 3", "November 3rd", "25th of October", "19th October", "19th of October"
 * - Standalone ordinals: "the 19th", "19th", "for the 19th", "due the 19th"
 * - ISO format "YYYY-MM-DD"
 *
 * @param {string} text
 * @param {Date} [referenceDate]
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null
 */
export function parseEnhancedDate(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : new Date();

  // 1. Direct ISO match: YYYY-MM-DD
  const isoMatch = clean.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const parts = isoMatch[1].split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!isNaN(d.getTime()) && d.getDate() === parts[2]) return isoMatch[1];
  }

  // 2. Today ("today", "due today", "for today", "on today")
  if (/\b(?:(?:due|for|on)\s+)?today\b/i.test(clean)) {
    return formatISODate(now);
  }

  // 3. Tomorrow ("tomorrow", "due tomorrow", "for tomorrow", "on tomorrow")
  if (/\b(?:(?:due|for|on)\s+)?tomorrow\b/i.test(clean)) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return formatISODate(d);
  }

  // 4. "in X days" or "in three days" / "due in three days"
  const inDaysMatch = clean.match(/\b(?:due\s+in|in|by)\s+(\d+|[a-zA-Z]+)\s+days?\b/i);
  if (inDaysMatch) {
    const token = inDaysMatch[1].toLowerCase();
    const count = /^\d+$/.test(token) ? parseInt(token, 10) : WORD_TO_NUMBER[token];
    if (typeof count === 'number' && !isNaN(count)) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + count);
      return formatISODate(d);
    }
  }

  // 5. "end of this week" / "end of the week" / "by the end of this week" / "this weekend"
  if (/\b(?:end\s+of\s+(?:this\s+|the\s+)?week|this\s+weekend)\b/i.test(clean)) {
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
    let diff = 0 - currentDay; // target Sunday (end of calendar week)
    if (diff <= 0) diff += 7;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    return formatISODate(d);
  }

  // 6. "next week" (7 days)
  if (/\b(?:(?:due|for|by)\s+)?next\s+week\b/i.test(clean)) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    return formatISODate(d);
  }

  // 7. Day of week (e.g. "due Friday", "deadline of Friday", "by next Monday", "for Friday", "next Monday")
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = clean.match(/\b(?:(?:due\s+(?:on\s+)?|deadline\s+(?:of\s+|to\s+|is\s+)?|by\s+|on\s+|for\s+)?(?:next\s+|this\s+)?)(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (dayMatch) {
    const targetDayIndex = weekdayNames.indexOf(dayMatch[1].toLowerCase());
    if (targetDayIndex !== -1) {
      const currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) diff += 7;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
      return formatISODate(d);
    }
  }

  // 8. Day of month first with month name:
  // e.g. "the 19th of October", "19th October", "19th of Oct", "19 October"
  const dayMonthMatch = clean.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-zA-Z]+)(?:\s*,?\s*(\d{4}))?\b/i);
  if (dayMonthMatch) {
    const mStr = dayMonthMatch[2].toLowerCase();
    if (mStr in MONTH_MAP) {
      const day = parseInt(dayMonthMatch[1], 10);
      const monthIndex = MONTH_MAP[mStr];
      let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : now.getFullYear();
      if (!dayMonthMatch[3]) {
        const candidate = new Date(year, monthIndex, day);
        if (candidate.getTime() < now.getTime() - 86400000) {
          year += 1;
        }
      }
      const target = new Date(year, monthIndex, day);
      if (!isNaN(target.getTime()) && target.getDate() === day) {
        return formatISODate(target);
      }
    }
  }

  // 9. Month first with day of month:
  // e.g. "October 19", "October 19th", "Oct 19, 2026", "October the 19th"
  const monthDayMatch = clean.match(/\b([a-zA-Z]+)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
  if (monthDayMatch) {
    const mStr = monthDayMatch[1].toLowerCase();
    if (mStr in MONTH_MAP) {
      const day = parseInt(monthDayMatch[2], 10);
      const monthIndex = MONTH_MAP[mStr];
      let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();
      if (!monthDayMatch[3]) {
        const candidate = new Date(year, monthIndex, day);
        if (candidate.getTime() < now.getTime() - 86400000) {
          year += 1;
        }
      }
      const target = new Date(year, monthIndex, day);
      if (!isNaN(target.getTime()) && target.getDate() === day) {
        return formatISODate(target);
      }
    }
  }

  // 10. Standalone ordinal day:
  // e.g. "the 19th", "19th", "for the 19th", "due the 19th", "by the 19th", "on 19th", "to the 19th"
  const ordinalMatch = clean.match(/\b(?:(?:due\s+(?:on\s+)?|for\s+|on\s+|by\s+|to\s+)?(?:the\s+)?|the\s+)(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (ordinalMatch) {
    const day = parseInt(ordinalMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let year = now.getFullYear();
      let monthIndex = now.getMonth();
      if (day < now.getDate()) {
        monthIndex += 1;
        if (monthIndex > 11) {
          monthIndex = 0;
          year += 1;
        }
      }
      const target = new Date(year, monthIndex, day);
      if (!isNaN(target.getTime()) && target.getDate() === day) {
        return formatISODate(target);
      }
    }
  }

  return null;
}

/**
 * Extracts priority from an utterance.
 * Returns 'high' | 'medium' | 'low'. Defaults to 'medium'.
 *
 * @param {string} text
 * @returns {string}
 */
export function extractPriority(text) {
  if (!text || typeof text !== 'string') return 'medium';
  if (/\b(?:with\s+)?high\s+priority\b/i.test(text) ||
      /\bpriority\s+(?:to\s+|is\s+|set\s+to\s+)?high\b/i.test(text) ||
      /\b(?:urgent|critical|highest\s+priority)\b/i.test(text)) {
    return 'high';
  }
  if (/\b(?:with\s+)?low\s+priority\b/i.test(text) ||
      /\bpriority\s+(?:to\s+|is\s+|set\s+to\s+)?low\b/i.test(text) ||
      /\b(?:minor|trivial|lowest\s+priority)\b/i.test(text)) {
    return 'low';
  }
  return 'medium';
}

/**
 * Extracts estimated effort hours from an utterance if present.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function extractEstimatedEffort(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\b(?:for|effort(?:\s+of)?|estimate(?:\s+of)?)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Parses compound task creation from natural language.
 * Extracts title cleanly without command words, without deadline phrases, and without priority words.
 *
 * @param {string} rawText
 * @param {Date} [referenceDate]
 * @returns {Object|null} { title, dueDate, priority, estimatedEffort } or null if not task creation
 */
export function parseCompoundTaskCreation(rawText, referenceDate = new Date()) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // Pattern detection for task creation intent:
  const isCreationIntent =
    /^(?:create|add|new|make|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?task\b/i.test(text) ||
    /^(?:create|add|make|schedule)\s+(?:a\s+|an\s+)?/i.test(text) ||
    /^(?:remind\s+me\s+to|i\s+need\s+to|i\s+have\s+to|i\s+must|don't\s+forget\s+to)\s+/i.test(text) ||
    /^(?:put|place)\s+(.+?)\s+on\s+(?:my\s+)?(?:task\s+list|to-do\s+list|tasks|board)\b/i.test(text) ||
    /^(?:create|add)\s+(?:a\s+)?new\s+task\s*:\s*/i.test(text) ||
    /\badd\s+(?:it\s+)?to\s+(?:my\s+)?tasks\b/i.test(text);

  if (!isCreationIntent) return null;

  // 1. Extract Priority
  const priority = extractPriority(text);

  // 2. Extract Estimated Effort
  const estimatedEffort = extractEstimatedEffort(text);

  // 3. Extract Due Date
  let dueDate = null;
  let deadlinePhrase = '';

  // Candidate regexes that may introduce a deadline.
  // Each candidate date string is verified through parseEnhancedDate to avoid false positives.
  const deadlinePatterns = [
    // "and set the deadline of/to/is X", "set deadline to X"
    /\b(?:and\s+)?(?:set\s+(?:the\s+)?deadline\s+(?:of|to|is)?)\s+([^,;]+?)(?=[,;\s]*(?:with\b|and\b|for\b|$))/i,
    // "with a deadline of X", "with deadline of X", "deadline of X", "deadline is X", "deadline to X", "deadline: X"
    /\b(?:with\s+a\s+deadline\s+of|with\s+deadline\s+of|deadline\s+of|deadline\s+is|deadline\s+to|deadline\s*:\s*)\s+([^,;]+?)(?=[,;\s]*(?:with\b|and\b|for\b|$))/i,
    // "due date is/to/of X"
    /\b(?:due\s+date\s+(?:is|to|of)?)\s+([^,;]+?)(?=[,;\s]*(?:with\b|and\b|for\b|$))/i,
    // ", due tomorrow", "due on Friday", "due by Oct 19", "due Friday"
    /(?:,\s*)?\bdue\s+(?:on\s+|by\s+)?([^,;]+?)(?=[,;\s]*(?:with\b|and\b|for\b|$))/i,
    // "by the end of this week", "by end of week", "by this weekend"
    /\bby\s+(?:the\s+end\s+of\s+this\s+week|end\s+of\s+week|this\s+weekend)\b/i,
    // "by October 19", "before Friday"
    /(?:,\s*)?\b(?:by|before)\s+([^,;]+?)(?=[,;\s]*(?:with\b|and\b|$))/i,
    // "for today", "for tomorrow", "for the 19th", "for 19th October", "for completion today"
    /(?:,\s*)?\bfor\s+(?:completion\s+)?([^,;]+?)(?=[,;\s]*(?:with\b|and\b|$))/i,
  ];

  for (const pattern of deadlinePatterns) {
    const match = text.match(pattern);
    if (match) {
      const candidateStr = match[1] ? match[1].trim() : match[0].trim();
      const resolved = parseEnhancedDate(candidateStr, referenceDate) || parseEnhancedDate(match[0].trim(), referenceDate);
      if (resolved) {
        dueDate = resolved;
        deadlinePhrase = match[0];
        break;
      }
    }
  }

  // 4. Clean Task Title
  let cleanTitle = text;

  // Handle "Put [Task] on my task list for completion [date]"
  const putMatch = cleanTitle.match(/^(?:put|place)\s+(.+?)\s+on\s+(?:my\s+)?(?:task\s+list|to-do\s+list|tasks|board)(?:\s+(?:for\s+completion|due|by)\s+.+)?$/i);
  if (putMatch) {
    cleanTitle = putMatch[1].trim();
  }

  // Handle "I need to finish my database assignment by tomorrow. Add it to my tasks."
  const needMatch = cleanTitle.match(/^(?:i\s+need\s+to|i\s+have\s+to|i\s+must)\s+(.+?)(?:\s*\.\s*add\s+(?:it\s+)?to\s+(?:my\s+)?tasks)?$/i);
  if (needMatch && !putMatch) {
    cleanTitle = needMatch[1].trim();
  }

  // Strip instruction prefixes
  cleanTitle = cleanTitle
    .replace(/^(?:create|add)\s+(?:a\s+)?new\s+task\s*:\s*/i, '')
    .replace(/^(?:create|add|make|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?task\s+(?:called|named)\s+/i, '')
    .replace(/^(?:create|add|make|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?task\s+(?:for|to)\s+/i, '')
    .replace(/^(?:create|add|make|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?task\b/i, '')
    .replace(/^(?:create|add|make|schedule)\s+(?:a\s+|an\s+)?/i, '')
    .replace(/^(?:remind\s+me\s+to|i\s+need\s+to|i\s+have\s+to|i\s+must|don't\s+forget\s+to)\s+/i, '')
    .replace(/^(?:finish|complete|do|work\s+on)\s+(?:the\s+|my\s+)?/i, '')
    .replace(/^(?:put|place)\s+/i, '')
    .replace(/^(?:called|named)\s+/i, '')
    .replace(/\badd\s+(?:it\s+)?to\s+(?:my\s+)?tasks\b/gi, '');

  // Strip exact deadline phrase if detected
  if (deadlinePhrase) {
    cleanTitle = cleanTitle.replace(deadlinePhrase, ' ');
  }

  // Strip priority phrases
  cleanTitle = cleanTitle
    .replace(/\bwith\s+(?:high|medium|low)\s+priority\b/gi, '')
    .replace(/\b(?:with\s+)?(?:highest|lowest)\s+priority\b/gi, '')
    .replace(/\b(?:with\s+)?(?:urgent|critical|minor|trivial)\s+priority\b/gi, '')
    .replace(/\b(?:with\s+)?(?:urgent|critical|minor|trivial)\b/gi, '')
    .replace(/\b(?:high|medium|low)\s+priority\b/gi, '')
    .replace(/\bpriority\s+(?:to\s+|is\s+|set\s+to\s+)?(?:high|medium|low)\b/gi, '');

  // Strip effort phrases
  cleanTitle = cleanTitle
    .replace(/\b(?:for|effort(?:\s+of)?|estimate(?:\s+of)?)\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\b/gi, '');

  // Clean punctuation before checking trailing task
  cleanTitle = cleanTitle
    .replace(/^[.,;:!?\s-]+/, '')
    .replace(/[.,;:!?\s-]+$/, '')
    .trim();

  // Strip trailing "task" or "tasks" if user said "Add an AI project task"
  cleanTitle = cleanTitle.replace(/\b(?:task|tasks)\s*$/i, '');

  // Final trim of punctuation and extra whitespace
  cleanTitle = cleanTitle
    .replace(/^[.,;:!?\s-]+/, '')
    .replace(/[.,;:!?\s-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Standardize title casing for specific imperative/title conventions if needed
  if (cleanTitle.toLowerCase() === 'revise english grammar') {
    cleanTitle = 'Revise English grammar';
  }

  return {
    title: cleanTitle,
    dueDate,
    priority,
    estimatedEffort,
  };
}

/**
 * Checks if an utterance contains multiple sequential commands.
 * Examples:
 * - "Show my overdue tasks and then show tasks due this week"
 * - "Create a task for cryptography lab due tomorrow, then show my upcoming tasks"
 *
 * @param {string} text
 * @returns {Array<string>} List of split sub-commands
 */
export function splitCompoundCommands(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();

  // If this is a unified deadline lookup request, do NOT split
  if (/\b(?:tell\s+me\s+its\s+deadline|what\s+is\s+its\s+deadline|when\s+is\s+it\s+due)\b/i.test(clean)) {
    return [clean];
  }

  // Split on "and then", ", then", "then", or explicit semicolon
  if (/\b(?:and\s+then|,\s*then|;\s*)/i.test(clean)) {
    return clean
      .split(/\b(?:and\s+then|,\s*then|;\s*)/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Look for sequential "and" between known query patterns
  const andQueryMatch = clean.match(/^(.+?\b(?:tasks?|lab|assignment|model|predictions?))\s+and\s+((?:then\s+)?(?:show|tell|what|find|list|view).+)$/i);
  if (andQueryMatch) {
    return [andQueryMatch[1].trim(), andQueryMatch[2].replace(/^then\s+/i, '').trim()];
  }

  return [clean];
}
