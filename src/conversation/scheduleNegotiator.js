/**
 * VoxPlan Conversational Schedule Negotiation Engine
 * Phase 5, Stage 5.2: Natural-Language Schedule Negotiation & Rescheduling
 *
 * Integrates natural-language scheduling requests with the authoritative
 * deterministic adaptive scheduler (src/scheduler/adaptiveScheduler.js).
 *
 * Guarantees:
 * - Deterministic: 100% predictable schedule proposal generation.
 * - Non-destructive: Proposing never silently modifies persisted tasks.
 * - Explicit Acceptance: Changes only apply when user explicitly confirms.
 * - Proposal Lifecycle: Tracks active proposal; revised requests supersede prior
 *   proposals with clear attribution; superseded or discarded proposals cannot be accepted.
 * - Dependency & Capacity Enforcement: Respects DAG order, working days, and daily limits.
 * - Local-First & Zero AI Telemetry: No external cloud LLM or remote API dependencies.
 */

import {
  generateAdaptiveSchedule,
  analyzeTaskDependencies,
  formatDateISO,
  parseDateISO,
  addDaysISO,
  isWorkingDay,
  DEFAULT_DAILY_CAPACITY_HOURS,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_WORKING_DAYS,
  DEFAULT_TASK_FALLBACK_HOURS,
} from '../scheduler/adaptiveScheduler.js';
import { SCHEDULE_INTENTS } from './scheduleIntentParser.js';

/**
 * Normalizes text for fuzzy token matching against task titles.
 * @param {string} str
 * @returns {string}
 */
function normalizeQuery(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds candidate tasks matching a query string or active subject task.
 * @param {string} query
 * @param {Array<Object>} tasks
 * @param {Object|null} activeSubjectTask
 * @returns {Array<Object>} Candidate tasks
 */
export function findMatchingTasks(query, tasks = [], activeSubjectTask = null) {
  if (!query || typeof query !== 'string') {
    return activeSubjectTask ? [activeSubjectTask] : [];
  }

  const clean = query.trim();
  const lower = clean.toLowerCase();

  // Pronoun references
  if (['it', 'this', 'that', 'this task', 'the task', 'my task'].includes(lower)) {
    return activeSubjectTask ? [activeSubjectTask] : [];
  }

  // Exact ID match
  const byId = tasks.find((t) => t.id === clean || t.id.toLowerCase() === lower);
  if (byId) return [byId];

  // Exact title match (case-insensitive)
  const exactTitles = tasks.filter((t) => t.title && t.title.toLowerCase() === lower);
  if (exactTitles.length > 0) return exactTitles;

  // Stripped title match (without 'my', 'the', 'a', 'an', 'task about', etc. or trailing 'task')
  const strippedClean = clean
    .replace(/^(?:my|the|a|an)\s+/i, '')
    .replace(/^(?:task\s+(?:about|for|called|named)\s+)/i, '')
    .replace(/\s+task$/i, '')
    .trim();
  const strippedLower = strippedClean.toLowerCase();
  const strippedExact = tasks.filter((t) => t.title && t.title.toLowerCase() === strippedLower);
  if (strippedExact.length > 0) return strippedExact;

  // Normalized token subset match (ignoring stop words)
  const STOP_WORDS = new Set(['my', 'the', 'a', 'an', 'task', 'tasks', 'called', 'named', 'about', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'and', 'is']);
  const normQ = normalizeQuery(strippedClean);
  const qTokens = normQ.split(' ').filter((tok) => tok.length > 1 && !STOP_WORDS.has(tok));

  if (qTokens.length === 0) {
    return activeSubjectTask ? [activeSubjectTask] : [];
  }

  const matched = tasks.filter((t) => {
    if (!t.title) return false;
    const normTitle = normalizeQuery(t.title);
    return qTokens.every((tok) => normTitle.includes(tok) || normTitle.split(' ').some((tt) => (tt.length >= 4 && tok.length >= 4 && (tt.startsWith(tok.slice(0, 4)) || tok.startsWith(tt.slice(0, 4))))));
  });

  if (matched.length > 0) return matched;

  // Partial match: at least one substantial token matches
  const partials = tasks.filter((t) => {
    if (!t.title) return false;
    const normTitle = normalizeQuery(t.title);
    return qTokens.some((tok) => tok.length > 3 && (normTitle.includes(tok) || normTitle.split(' ').some((tt) => (tt.length >= 4 && (tt.startsWith(tok.slice(0, 4)) || tok.startsWith(tt.slice(0, 4)))))));
  });

  return partials;
}

/**
 * Calculates current scheduled hours on a given ISO date for uncompleted tasks.
 * @param {string} dateStr ISO date YYYY-MM-DD
 * @param {Array<Object>} tasks
 * @param {string|null} [excludeTaskId] Task ID to exclude from summation
 * @returns {number}
 */
export function calculateDateWorkloadHours(dateStr, tasks = [], excludeTaskId = null) {
  if (!dateStr) return 0;
  return tasks
    .filter((t) => !t.completed && t.dueDate === dateStr && t.id !== excludeTaskId)
    .reduce((sum, t) => {
      const effort = typeof t.estimatedEffort === 'number' && t.estimatedEffort > 0
        ? t.estimatedEffort
        : DEFAULT_TASK_FALLBACK_HOURS;
      return sum + effort;
    }, 0);
}

/**
 * Finds the earliest working day in the planning horizon with sufficient capacity.
 * @param {number} requiredHours
 * @param {string} startDateStr
 * @param {Array<Object>} tasks
 * @param {Object} options
 * @returns {{ date: string, availableHours: number, dayName: string }|null}
 */
export function findFirstDayWithCapacity(requiredHours, startDateStr, tasks = [], options = {}) {
  const dailyCapacityHours = options.dailyCapacityHours || DEFAULT_DAILY_CAPACITY_HOURS;
  const workingDays = options.workingDays || DEFAULT_WORKING_DAYS;
  const horizonDays = options.horizonDays || DEFAULT_HORIZON_DAYS;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let curDate = startDateStr;
  for (let i = 0; i < horizonDays; i++) {
    if (isWorkingDay(curDate, workingDays)) {
      const used = calculateDateWorkloadHours(curDate, tasks);
      const remaining = Math.max(0, dailyCapacityHours - used);
      if (remaining >= requiredHours) {
        const parsed = parseDateISO(curDate);
        return {
          date: curDate,
          availableHours: Math.round(remaining * 10) / 10,
          dayName: parsed ? dayNames[parsed.getDay()] : '',
        };
      }
    }
    curDate = addDaysISO(curDate, 1);
  }
  return null;
}

/**
 * Negotiates a schedule proposal or answers a schedule feasibility query.
 *
 * @param {Object} params
 * @param {Object} params.intentResult Output from parseScheduleIntent
 * @param {Array<Object>} params.tasks Current active task list
 * @param {Object|null} [params.activeProposal] Currently active proposal in dialogue context
 * @param {Object|null} [params.activeSubjectTask] Currently focused task in dialogue context
 * @param {Object} [params.options] Scheduler and clock configuration
 * @returns {Object} Negotiation outcome descriptor
 */
export function negotiateScheduleProposal({
  intentResult,
  tasks = [],
  activeProposal = null,
  activeSubjectTask = null,
  options = {},
}) {
  const clock = options.clock || (() => Date.now());
  const nowMs = clock();
  const todayISO = formatDateISO(new Date(nowMs));
  const dailyCapacityHours = options.dailyCapacityHours || DEFAULT_DAILY_CAPACITY_HOURS;
  const workingDays = options.workingDays || DEFAULT_WORKING_DAYS;
  const horizonDays = options.horizonDays || DEFAULT_HORIZON_DAYS;
  const personalDurationModel = options.personalDurationModel || null;

  const { intent, params = {} } = intentResult;

  // 1. ACCEPT ACTIVE PROPOSAL
  if (intent === SCHEDULE_INTENTS.ACCEPT_PROPOSAL) {
    if (!activeProposal) {
      return {
        handled: true,
        success: false,
        responseText: 'There is no active schedule proposal to accept. Ask me to reschedule a task or spread your workload first.',
        feedbackType: 'warning',
      };
    }

    if (activeProposal.status === 'superseded') {
      return {
        handled: true,
        success: false,
        responseText: 'This schedule proposal was superseded by a newer proposal. Please review and accept the latest proposal.',
        feedbackType: 'warning',
      };
    }

    if (activeProposal.status === 'discarded') {
      return {
        handled: true,
        success: false,
        responseText: 'This schedule proposal was already discarded. You can make a new scheduling request anytime.',
        feedbackType: 'warning',
      };
    }

    if (activeProposal.status === 'accepted') {
      return {
        handled: true,
        success: false,
        responseText: 'This schedule proposal has already been applied.',
        feedbackType: 'info',
      };
    }

    return {
      handled: true,
      success: true,
      isActionable: true,
      action: {
        type: 'ACCEPT_SCHEDULE_PROPOSAL',
        proposal: activeProposal,
      },
      responseText: `Applying schedule proposal (${activeProposal.summary?.dateChangesCount || 1} task changes).`,
      feedbackType: 'success',
    };
  }

  // 2. DISCARD ACTIVE PROPOSAL
  if (intent === SCHEDULE_INTENTS.DISCARD_PROPOSAL) {
    if (!activeProposal || activeProposal.status !== 'active') {
      return {
        handled: true,
        success: false,
        responseText: 'No active schedule proposal to discard.',
        feedbackType: 'info',
      };
    }

    const discardedProposal = {
      ...activeProposal,
      status: 'discarded',
      discardedAt: nowMs,
      discardReason: 'user_discard',
    };

    return {
      handled: true,
      success: true,
      discardedProposal,
      action: {
        type: 'DISCARD_SCHEDULE_PROPOSAL',
        proposal: discardedProposal,
        reason: 'user_discard',
      },
      responseText: 'Schedule proposal discarded. Your current schedule remains unchanged.',
      feedbackType: 'info',
    };
  }

  // 3. INCOMPLETE REQUEST (Missing Target Date)
  if (intent === SCHEDULE_INTENTS.INCOMPLETE_REQUEST) {
    const candidates = findMatchingTasks(params.targetTaskQuery, tasks, activeSubjectTask);
    const targetTask = candidates.length === 1 ? candidates[0] : null;

    if (candidates.length > 1) {
      return {
        handled: true,
        requiresClarification: true,
        clarificationType: 'AMBIGUOUS_TASK',
        candidateTasks: candidates,
        pendingIntent: intentResult,
        responseText: `I found ${candidates.length} tasks matching "${params.targetTaskQuery}". Which one did you mean? (${candidates.map((t) => `"${t.title}"`).join(', ')})`,
        feedbackType: 'info',
      };
    }

    if (!targetTask) {
      return {
        handled: true,
        success: false,
        responseText: `Could not find any task matching "${params.targetTaskQuery}".`,
        feedbackType: 'warning',
      };
    }

    return {
      handled: true,
      requiresClarification: true,
      clarificationType: 'MISSING_DATE',
      targetTask,
      pendingIntent: intentResult,
      responseText: `When would you like to reschedule "${targetTask.title}" to? (e.g. "tomorrow", "Friday", or "2026-10-25")`,
      feedbackType: 'info',
    };
  }

  // 4. CAPACITY QUERY / FIT CHECK
  if (intent === SCHEDULE_INTENTS.CAPACITY_QUERY) {
    const targetDate = params.targetDate || todayISO;
    const targetTask = params.targetTask || activeSubjectTask;
    const requiredHours = params.requestedHours || (targetTask?.estimatedEffort ?? 2.0);

    const parsedDate = parseDateISO(targetDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = parsedDate ? dayNames[parsedDate.getDay()] : '';
    const isWorkDay = isWorkingDay(targetDate, workingDays);

    const usedHours = calculateDateWorkloadHours(targetDate, tasks, targetTask?.id);
    const availableHours = Math.max(0, dailyCapacityHours - usedHours);
    const fits = isWorkDay && availableHours >= requiredHours;

    let responseText = '';
    if (!isWorkDay) {
      const bestDay = findFirstDayWithCapacity(requiredHours, targetDate, tasks, { dailyCapacityHours, workingDays, horizonDays });
      responseText = `${dayName} (${targetDate}) is a non-working day under your schedule settings. ${bestDay ? `Earliest available working day with capacity is ${bestDay.dayName} (${bestDay.date}, ${bestDay.availableHours}h free).` : 'No open capacity within the planning window.'}`;
    } else if (fits) {
      responseText = `Yes, you have ${availableHours.toFixed(1)}h available capacity on ${dayName} (${targetDate}) with ${usedHours.toFixed(1)}h scheduled (daily limit: ${dailyCapacityHours}h). A ${requiredHours.toFixed(1)}h task fits comfortably.`;
    } else {
      const bestDay = findFirstDayWithCapacity(requiredHours, targetDate, tasks, { dailyCapacityHours, workingDays, horizonDays });
      responseText = `On ${dayName} (${targetDate}), you have ${usedHours.toFixed(1)}h scheduled out of ${dailyCapacityHours}h (${availableHours.toFixed(1)}h remaining). A ${requiredHours.toFixed(1)}h task would exceed daily capacity by ${(requiredHours - availableHours).toFixed(1)}h. ${bestDay ? `Next available day with sufficient capacity is ${bestDay.dayName} (${bestDay.date}, ${bestDay.availableHours}h free).` : ''}`;
    }

    return {
      handled: true,
      success: true,
      isFeasibilityQuery: true,
      queryResult: {
        targetDate,
        dayName,
        usedHours,
        availableHours,
        requiredHours,
        fits,
      },
      responseText,
      feedbackType: fits ? 'info' : 'warning',
    };
  }

  // 5. CAPACITY NEGOTIATION / WORKLOAD SPREADING
  if (intent === SCHEDULE_INTENTS.SPREAD_TASKS) {
    const spreadHorizon = params.horizonDays || 3;
    const scheduleResult = generateAdaptiveSchedule(tasks, {
      startDate: todayISO,
      horizonDays: spreadHorizon,
      dailyCapacityHours,
      workingDays,
      personalDurationModel,
      strategy: 'balanced_pace',
    });

    const changedPlacements = scheduleResult.proposedPlacements.filter(
      (p) => p.isDateChanged && p.proposedDate !== null && p.status !== 'blocked_by_dependency'
    );

    const proposalId = `conv-prop-spread-${nowMs}-${Math.random().toString(36).substring(2, 6)}`;
    const newProposal = {
      scheduleId: proposalId,
      strategy: 'balanced_pace',
      createdAt: nowMs,
      status: 'active',
      proposedPlacements: scheduleResult.proposedPlacements,
      placements: scheduleResult.proposedPlacements,
      dayAllocations: scheduleResult.dayAllocations,
      summary: {
        ...scheduleResult.summary,
        scheduleId: proposalId,
        dateChangesCount: changedPlacements.length,
        strategy: 'balanced_pace',
      },
      supersedesScheduleId: activeProposal?.scheduleId || null,
    };

    let responseText = '';
    if (changedPlacements.length === 0) {
      responseText = `Evaluated workload across the next ${spreadHorizon} days. Tasks are already evenly balanced within daily capacity limits.`;
    } else {
      responseText = `Generated schedule proposal spreading tasks across the next ${spreadHorizon} days: ${changedPlacements.length} task${changedPlacements.length === 1 ? '' : 's'} shifted to smooth daily workload. Say "Accept" to apply or "Discard" to cancel.`;
    }

    return {
      handled: true,
      success: true,
      proposal: newProposal,
      supersededProposal: activeProposal ? { ...activeProposal, status: 'superseded', supersededBy: proposalId } : null,
      responseText,
      feedbackType: 'info',
    };
  }

  // 6. DEPENDENCY SCHEDULING ("Schedule task A after task B")
  if (intent === SCHEDULE_INTENTS.SCHEDULE_AFTER) {
    const targetCandidates = findMatchingTasks(params.targetTaskQuery, tasks, activeSubjectTask);
    const prereqCandidates = findMatchingTasks(params.prerequisiteTaskQuery, tasks, null);

    if (targetCandidates.length === 0) {
      return {
        handled: true,
        success: false,
        responseText: `Could not find target task matching "${params.targetTaskQuery}".`,
        feedbackType: 'warning',
      };
    }
    if (prereqCandidates.length === 0) {
      return {
        handled: true,
        success: false,
        responseText: `Could not find prerequisite task matching "${params.prerequisiteTaskQuery}".`,
        feedbackType: 'warning',
      };
    }

    const targetTask = targetCandidates[0];
    const prereqTask = prereqCandidates[0];

    const prereqDate = prereqTask.dueDate || todayISO;
    let targetDate = addDaysISO(prereqDate, 1);
    while (!isWorkingDay(targetDate, workingDays)) {
      targetDate = addDaysISO(targetDate, 1);
    }

    // Treat as direct reschedule to the computed targetDate
    return _createDirectRescheduleProposal({
      targetTask,
      targetDate,
      tasks,
      activeProposal,
      dailyCapacityHours,
      workingDays,
      nowMs,
      todayISO,
      explanationPrefix: `Scheduled after prerequisite "${prereqTask.title}" (${prereqDate})`,
    });
  }

  // 7. RELATIVE SHIFTS (Batch or Single)
  if (intent === SCHEDULE_INTENTS.RELATIVE_SHIFT) {
    if (params.isBatch) {
      const priority = params.priorityFilter;
      const offsetDays = params.offsetDays;
      const matchingTasks = tasks.filter((t) => !t.completed && (t.priority || 'medium').toLowerCase() === priority);

      if (matchingTasks.length === 0) {
        return {
          handled: true,
          success: false,
          responseText: `No uncompleted ${priority}-priority tasks found to shift.`,
          feedbackType: 'info',
        };
      }

      const proposalId = `conv-prop-batch-${nowMs}-${Math.random().toString(36).substring(2, 6)}`;
      const placements = [];
      let dateChangesCount = 0;

      for (const t of matchingTasks) {
        const baseDate = t.dueDate || todayISO;
        const proposedDate = addDaysISO(baseDate, offsetDays);
        const isChanged = proposedDate !== t.dueDate;
        if (isChanged) dateChangesCount++;

        placements.push({
          taskId: t.id,
          taskTitle: t.title,
          originalDueDate: t.dueDate || null,
          proposedDate,
          isDateChanged: isChanged,
          status: 'on_time',
          effectiveHours: t.estimatedEffort || DEFAULT_TASK_FALLBACK_HOURS,
          conflicts: [],
          explanation: `Shifted by ${offsetDays > 0 ? `+${offsetDays}` : offsetDays} days due to priority filter (${priority})`,
        });
      }

      const proposal = {
        scheduleId: proposalId,
        strategy: 'relative_priority_shift',
        createdAt: nowMs,
        status: 'active',
        proposedPlacements: placements,
        placements,
        summary: {
          scheduleId: proposalId,
          dateChangesCount,
          feasibilityStatus: 'feasible',
          strategy: 'relative_priority_shift',
        },
        supersedesScheduleId: activeProposal?.scheduleId || null,
      };

      return {
        handled: true,
        success: true,
        proposal,
        supersededProposal: activeProposal ? { ...activeProposal, status: 'superseded', supersededBy: proposalId } : null,
        responseText: `Proposed shifting ${matchingTasks.length} ${priority}-priority task${matchingTasks.length === 1 ? '' : 's'} by ${Math.abs(offsetDays)} day${Math.abs(offsetDays) === 1 ? '' : 's'} ${offsetDays >= 0 ? 'forward' : 'earlier'}. Say "Accept" to apply or "Discard" to cancel.`,
        feedbackType: 'info',
      };
    } else {
      // Single task relative shift
      const candidates = findMatchingTasks(params.targetTaskQuery, tasks, activeSubjectTask);
      if (candidates.length === 0) {
        return {
          handled: true,
          success: false,
          responseText: `Could not find task matching "${params.targetTaskQuery}".`,
          feedbackType: 'warning',
        };
      }
      if (candidates.length > 1) {
        return {
          handled: true,
          requiresClarification: true,
          clarificationType: 'AMBIGUOUS_TASK',
          candidateTasks: candidates,
          pendingIntent: intentResult,
          responseText: `Multiple tasks match "${params.targetTaskQuery}". Which one did you mean? (${candidates.map((t) => `"${t.title}"`).join(', ')})`,
          feedbackType: 'info',
        };
      }

      const targetTask = candidates[0];
      const baseDate = targetTask.dueDate || todayISO;
      const targetDate = addDaysISO(baseDate, params.offsetDays);

      return _createDirectRescheduleProposal({
        targetTask,
        targetDate,
        tasks,
        activeProposal,
        dailyCapacityHours,
        workingDays,
        nowMs,
        todayISO,
        explanationPrefix: `Shifted by ${params.offsetDays > 0 ? `+${params.offsetDays}` : params.offsetDays} days`,
      });
    }
  }

  // 8. HYPOTHETICAL SIMULATION ("What if I move this task to Friday?")
  if (intent === SCHEDULE_INTENTS.HYPOTHETICAL_SIMULATION) {
    const subParams = params;
    const targetQuery = subParams.targetTaskQuery || (activeSubjectTask ? 'it' : null);
    const candidates = findMatchingTasks(targetQuery, tasks, activeSubjectTask);

    if (candidates.length === 0) {
      return {
        handled: true,
        success: false,
        responseText: `Could not determine which task to simulate for "${targetQuery}".`,
        feedbackType: 'warning',
      };
    }

    const targetTask = candidates[0];
    let targetDate = subParams.targetDate;
    if (!targetDate && typeof subParams.offsetDays === 'number') {
      targetDate = addDaysISO(targetTask.dueDate || todayISO, subParams.offsetDays);
    }

    if (!targetDate) {
      return {
        handled: true,
        success: false,
        responseText: `Please specify the date or offset you would like to test moving "${targetTask.title}" to.`,
        feedbackType: 'info',
      };
    }

    return _simulateReschedule({
      targetTask,
      targetDate,
      tasks,
      dailyCapacityHours,
      workingDays,
      todayISO,
    });
  }

  // 9. DIRECT RESCHEDULE ("Move database assignment to Friday")
  if (intent === SCHEDULE_INTENTS.DIRECT_RESCHEDULE) {
    const candidates = findMatchingTasks(params.targetTaskQuery, tasks, activeSubjectTask);

    if (candidates.length === 0) {
      return {
        handled: true,
        success: false,
        responseText: `Could not find any task matching "${params.targetTaskQuery}".`,
        feedbackType: 'warning',
      };
    }

    if (candidates.length > 1) {
      return {
        handled: true,
        requiresClarification: true,
        clarificationType: 'AMBIGUOUS_TASK',
        candidateTasks: candidates,
        pendingIntent: intentResult,
        responseText: `Found ${candidates.length} matching tasks. Which one would you like to move? (${candidates.map((t) => `"${t.title}"`).join(', ')})`,
        feedbackType: 'info',
      };
    }

    const targetTask = candidates[0];
    const targetDate = params.targetDate;

    if (!targetDate) {
      return {
        handled: true,
        requiresClarification: true,
        clarificationType: 'MISSING_DATE',
        targetTask,
        pendingIntent: intentResult,
        responseText: `What date should I reschedule "${targetTask.title}" to? (e.g. tomorrow, Friday, or YYYY-MM-DD)`,
        feedbackType: 'info',
      };
    }

    return _createDirectRescheduleProposal({
      targetTask,
      targetDate,
      tasks,
      activeProposal,
      dailyCapacityHours,
      workingDays,
      nowMs,
      todayISO,
    });
  }

  return {
    handled: false,
  };
}

/**
 * Creates and validates a proposal for directly rescheduling a single task.
 * @private
 */
function _createDirectRescheduleProposal({
  targetTask,
  targetDate,
  tasks,
  activeProposal,
  dailyCapacityHours,
  workingDays,
  nowMs,
  todayISO,
  explanationPrefix = '',
}) {
  const isPast = targetDate < todayISO;
  const isWorkDay = isWorkingDay(targetDate, workingDays);
  const taskEffort = typeof targetTask.estimatedEffort === 'number' && targetTask.estimatedEffort > 0
    ? targetTask.estimatedEffort
    : DEFAULT_TASK_FALLBACK_HOURS;

  const currentWorkload = calculateDateWorkloadHours(targetDate, tasks, targetTask.id);
  const newDayWorkload = currentWorkload + taskEffort;
  const exceedsCapacity = newDayWorkload > dailyCapacityHours;

  // Dependency constraint validation
  const depAnalysis = analyzeTaskDependencies(tasks);
  const prereqIds = depAnalysis.validDependencies.get(targetTask.id) || [];
  const prereqTasks = tasks.filter((t) => prereqIds.includes(t.id));
  const conflictingPrereqs = prereqTasks.filter((p) => p.dueDate && p.dueDate > targetDate);

  const warnings = [];
  const conflicts = [];
  let feasibilityStatus = 'feasible';

  if (isPast) {
    warnings.push(`Warning: ${targetDate} is in the past.`);
    conflicts.push(`Proposed date ${targetDate} is before today (${todayISO}).`);
    feasibilityStatus = 'past_date_warning';
  }

  if (!isWorkDay) {
    warnings.push(`Note: ${targetDate} falls on a non-working day.`);
  }

  if (conflictingPrereqs.length > 0) {
    const names = conflictingPrereqs.map((p) => `"${p.title}" (due ${p.dueDate})`).join(', ');
    conflicts.push(`Violates dependency ordering: prerequisite task ${names} is scheduled after ${targetDate}.`);
    feasibilityStatus = 'infeasible_dependency';
  }

  if (exceedsCapacity) {
    warnings.push(`Capacity alert: ${newDayWorkload.toFixed(1)}h scheduled on ${targetDate} exceeds daily limit of ${dailyCapacityHours}h.`);
    conflicts.push(`Exceeds daily capacity limit (${newDayWorkload.toFixed(1)}h / ${dailyCapacityHours}h)`);
    if (feasibilityStatus === 'feasible') feasibilityStatus = 'capacity_warning';
  }

  const proposalId = `conv-prop-move-${nowMs}-${Math.random().toString(36).substring(2, 6)}`;
  const originalDueDate = targetTask.dueDate || null;
  const isDateChanged = targetDate !== originalDueDate;

  const placement = {
    taskId: targetTask.id,
    taskTitle: targetTask.title,
    taskPriority: targetTask.priority || 'medium',
    taskCategory: targetTask.category || '',
    originalDueDate,
    proposedDate: targetDate,
    assignedDayIndex: -1,
    effectiveHours: taskEffort,
    durationSource: targetTask.estimatedEffort ? 'original_estimate' : 'default_fallback',
    appliedRatio: 1.0,
    isDateChanged,
    status: conflictingPrereqs.length > 0
      ? 'blocked_by_dependency'
      : exceedsCapacity
      ? 'capacity_warning'
      : 'on_time',
    placementStatus: conflictingPrereqs.length > 0 ? 'blocked_by_dependency' : 'on_time',
    placementReason: `${explanationPrefix ? `${explanationPrefix}. ` : ''}Proposed move to ${targetDate}`,
    explanation: `${explanationPrefix ? `${explanationPrefix}. ` : ''}Reschedule "${targetTask.title}" from ${originalDueDate || 'no deadline'} to ${targetDate} (${taskEffort}h)`,
    conflicts,
  };

  const proposal = {
    scheduleId: proposalId,
    strategy: 'conversational_reschedule',
    createdAt: nowMs,
    status: 'active',
    proposedPlacements: [placement],
    placements: [placement],
    dayAllocations: [],
    summary: {
      scheduleId: proposalId,
      strategy: 'conversational_reschedule',
      startDate: todayISO,
      totalEligibleTasks: 1,
      totalTasksEvaluated: 1,
      scheduledCount: conflictingPrereqs.length > 0 ? 0 : 1,
      scheduledTasksCount: conflictingPrereqs.length > 0 ? 0 : 1,
      unscheduledCount: 0,
      blockedCount: conflictingPrereqs.length > 0 ? 1 : 0,
      oversizedCount: 0,
      onTimeCount: conflictingPrereqs.length === 0 && !exceedsCapacity ? 1 : 0,
      missedDeadlineCount: 0,
      overdueAtStartCount: 0,
      dateChangesCount: isDateChanged ? 1 : 0,
      dateShiftsCount: isDateChanged ? 1 : 0,
      scheduledWorkloadHours: taskEffort,
      totalCapacityHours: dailyCapacityHours,
      averageUtilizationPercent: Math.round((taskEffort / dailyCapacityHours) * 100),
      feasibilityStatus,
      feasibility: feasibilityStatus,
      warnings,
      conflicts,
    },
    supersedesScheduleId: activeProposal?.scheduleId || null,
  };

  let responseText = `Proposed moving "${targetTask.title}" to ${targetDate}.`;
  if (warnings.length > 0) {
    responseText += ` ${warnings.join(' ')}`;
  }
  if (conflictingPrereqs.length > 0) {
    responseText += ` ${conflicts[0]}`;
  }
  responseText += ' Say "Accept" to apply or "Discard" to cancel.';

  return {
    handled: true,
    success: true,
    targetTask,
    proposal,
    supersededProposal: activeProposal ? { ...activeProposal, status: 'superseded', supersededBy: proposalId } : null,
    responseText,
    feedbackType: conflictingPrereqs.length > 0 ? 'error' : exceedsCapacity ? 'warning' : 'info',
  };
}

/**
 * Pure hypothetical simulation of a task move without creating an actionable proposal.
 * @private
 */
function _simulateReschedule({
  targetTask,
  targetDate,
  tasks,
  dailyCapacityHours,
  workingDays,
  todayISO,
}) {
  const isPast = targetDate < todayISO;
  const isWorkDay = isWorkingDay(targetDate, workingDays);
  const taskEffort = typeof targetTask.estimatedEffort === 'number' && targetTask.estimatedEffort > 0
    ? targetTask.estimatedEffort
    : DEFAULT_TASK_FALLBACK_HOURS;

  const currentWorkload = calculateDateWorkloadHours(targetDate, tasks, targetTask.id);
  const newDayWorkload = currentWorkload + taskEffort;
  const exceedsCapacity = newDayWorkload > dailyCapacityHours;

  const depAnalysis = analyzeTaskDependencies(tasks);
  const prereqIds = depAnalysis.validDependencies.get(targetTask.id) || [];
  const prereqTasks = tasks.filter((t) => prereqIds.includes(t.id));
  const conflictingPrereqs = prereqTasks.filter((p) => p.dueDate && p.dueDate > targetDate);

  const parsedDate = parseDateISO(targetDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = parsedDate ? dayNames[parsedDate.getDay()] : '';

  let responseText = '';
  if (conflictingPrereqs.length > 0) {
    const names = conflictingPrereqs.map((p) => `"${p.title}" (${p.dueDate})`).join(', ');
    responseText = `Simulation: Moving "${targetTask.title}" to ${dayName ? `${dayName} ` : ''}(${targetDate}) is INFEASIBLE due to dependency conflict: prerequisite ${names} would be due after it.`;
  } else if (exceedsCapacity) {
    responseText = `Simulation: Moving "${targetTask.title}" to ${dayName ? `${dayName} ` : ''}(${targetDate}) would exceed your daily capacity: ${newDayWorkload.toFixed(1)}h total workload vs. ${dailyCapacityHours}h capacity (${(newDayWorkload - dailyCapacityHours).toFixed(1)}h over limit).`;
  } else if (!isWorkDay) {
    responseText = `Simulation: ${dayName ? `${dayName} ` : ''}(${targetDate}) is a non-working day under your configured settings. Workload on that day would be ${taskEffort}h.`;
  } else {
    responseText = `Simulation: Moving "${targetTask.title}" to ${dayName ? `${dayName} ` : ''}(${targetDate}) is FEASIBLE. It would take ${taskEffort}h, bringing ${targetDate}'s workload to ${newDayWorkload.toFixed(1)}h / ${dailyCapacityHours}h capacity with zero dependency conflicts.`;
  }

  return {
    handled: true,
    success: true,
    isSimulationOnly: true,
    simulationResult: {
      targetTaskId: targetTask.id,
      targetDate,
      isFeasible: conflictingPrereqs.length === 0 && !exceedsCapacity && !isPast,
      exceedsCapacity,
      conflictingPrereqs: conflictingPrereqs.map((p) => p.id),
      newDayWorkload,
    },
    responseText,
    feedbackType: conflictingPrereqs.length > 0 ? 'error' : exceedsCapacity ? 'warning' : 'info',
  };
}
