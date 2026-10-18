/**
 * VoxPlan Conversational Plan Explanations & Constraint Debriefing Engine
 * Phase 5, Stage 5.4
 *
 * Implements grounded conversational explanations of:
 * 1. Feature A: Scheduling decisions (why a task was scheduled for a date, capacity limits, prerequisites, deadline urgency).
 * 2. Feature B: Schedule changes (what moved, added, or removed between proposals by stable taskId, with honest causal attribution).
 * 3. Feature C: Planning debriefs (planned vs actual outcomes, on-time completion verification, duration metrics, insufficient-data guards).
 *
 * Guarantees:
 * - 100% Deterministic and local-first (no external cloud LLMs).
 * - Factual grounding in actual scheduler outputs, proposals, telemetry events, and task records.
 * - Non-causal honesty: Distinguishes recorded triggers from unrecorded causal claims.
 * - Pure, read-only evaluation: Never mutates task state, scheduler settings, or stored feedback.
 */

import { formatISODate } from './compoundCommandParser.js';
import {
  formatDateISO,
  parseDateISO,
  addDaysISO,
  isWorkingDay,
  DEFAULT_DAILY_CAPACITY_HOURS,
  DEFAULT_WORKING_DAYS,
  DEFAULT_TASK_FALLBACK_HOURS,
} from '../scheduler/adaptiveScheduler.js';
import { computeScheduleFeedback } from '../scheduler/scheduleFeedback.js';

/**
 * Calculates calendar day difference (dateB - dateA) in days.
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number|null}
 */
function dayDifference(dateA, dateB) {
  const pA = parseDateISO(dateA);
  const pB = parseDateISO(dateB);
  if (!pA || !pB) return null;
  return Math.round((pB.getTime() - pA.getTime()) / (1000 * 3600 * 24));
}

/**
 * Formats day difference into human-friendly relative offset string.
 * @param {number} diff
 * @returns {string}
 */
function formatDayOffset(diff) {
  if (diff === 0) return 'same day';
  if (diff === 1) return '+1 day';
  if (diff === -1) return '-1 day';
  if (diff > 0) return `+${diff} days`;
  return `${diff} days`;
}

/**
 * FEATURE A: Explain scheduling decision for a specific task.
 *
 * @param {Object} params
 * @param {Object} params.targetTask - The task being inquired about
 * @param {string} [params.targetDateQuery] - Optional specific date the user asked about (e.g. "today", "tomorrow", or "2026-10-18")
 * @param {Array<Object>} [params.tasks=[]] - Current active task collection
 * @param {Object|null} [params.activeProposal=null] - Active pending proposal if available
 * @param {Array<Object>} [params.proposalHistory=[]] - Historical proposals
 * @param {Array<Object>} [params.telemetryEvents=[]] - Behavioral telemetry events
 * @param {number} [params.dailyCapacityHours=6.0] - Daily capacity limit
 * @param {Array<number>} [params.workingDays=[1,2,3,4,5]] - Working weekdays
 * @param {Function} [params.clock] - Timestamp generator
 * @returns {Object} Structured explanation result
 */
export function explainScheduleDecision({
  targetTask,
  targetDateQuery = null,
  inquiryType = null,
  tasks = [],
  activeProposal = null,
  proposalHistory = [],
  telemetryEvents = [],
  dailyCapacityHours = DEFAULT_DAILY_CAPACITY_HOURS,
  workingDays = DEFAULT_WORKING_DAYS,
  clock = () => Date.now(),
}) {
  if (!targetTask) {
    return {
      success: false,
      error: 'no_task_specified',
      responseText: 'Please specify which task you would like me to explain the schedule for.',
      spokenSummary: 'Please specify which task you want me to explain.',
    };
  }

  const now = new Date(clock());
  const todayISO = formatISODate(now);

  // 1. Locate relevant placement(s):
  // First check active proposal, then proposalHistory in reverse order (accepted first, then any)
  let placement = null;
  let sourceProposal = null;
  let allPlacements = [];

  if (activeProposal && Array.isArray(activeProposal.proposedPlacements || activeProposal.placements)) {
    const list = activeProposal.proposedPlacements || activeProposal.placements;
    allPlacements = list.filter((p) => (p.taskId || p.task_id) === targetTask.id);
    placement = allPlacements[0] || null;
    if (placement) sourceProposal = activeProposal;
  }

  if (!placement && Array.isArray(proposalHistory) && proposalHistory.length > 0) {
    // Check accepted proposals first
    for (let i = proposalHistory.length - 1; i >= 0; i--) {
      const prop = proposalHistory[i];
      if (prop.status === 'accepted') {
        const list = prop.proposedPlacements || prop.placements || [];
        allPlacements = list.filter((p) => (p.taskId || p.task_id) === targetTask.id);
        if (allPlacements.length > 0) {
          placement = allPlacements[0];
          sourceProposal = prop;
          break;
        }
      }
    }

    // Fallback: check any historical proposal
    if (!placement) {
      for (let i = proposalHistory.length - 1; i >= 0; i--) {
        const prop = proposalHistory[i];
        const list = prop.proposedPlacements || prop.placements || [];
        allPlacements = list.filter((p) => (p.taskId || p.task_id) === targetTask.id);
        if (allPlacements.length > 0) {
          placement = allPlacements[0];
          sourceProposal = prop;
          break;
        }
      }
    }
  }

  const taskTitle = targetTask.title || 'Untitled task';
  const originalDueDate = targetTask.dueDate || placement?.originalDueDate || null;
  const taskPriority = String(targetTask.priority || 'medium').toLowerCase();
  const estimatedHours = typeof targetTask.estimatedEffort === 'number' && targetTask.estimatedEffort > 0
    ? targetTask.estimatedEffort
    : (placement?.parentTotalEffort || placement?.effectiveHours || DEFAULT_TASK_FALLBACK_HOURS);

  const isChunked = allPlacements.length > 1 || placement?.isChunk === true;
  const totalScheduledHours = allPlacements.length > 0
    ? allPlacements.reduce((sum, p) => sum + (p.chunkDuration || p.effectiveHours || 0), 0)
    : 0;
  const unscheduledHours = typeof placement?.unscheduledHours === 'number'
    ? placement.unscheduledHours
    : Math.max(0, estimatedHours - totalScheduledHours);

  // Prerequisites analysis
  const prereqIds = Array.isArray(targetTask.dependencies) ? targetTask.dependencies : [];
  const prereqTasks = tasks.filter((t) => prereqIds.includes(t.id));
  const uncompletedPrereqs = prereqTasks.filter((t) => !t.completed);

  // SPECIAL INQUIRY 1: Why was task split?
  if (inquiryType === 'why_split') {
    const isAccepted = sourceProposal?.status === 'accepted';
    if (isChunked) {
      const daysCount = new Set(allPlacements.map((p) => p.proposedDate || p.proposed_date)).size;
      const sessionsList = allPlacements.map((p) => `${p.proposedDate || p.proposed_date} (${(p.chunkDuration || p.effectiveHours || 0)}h)`).join(', ');
      const responseText = `Task "${taskTitle}" requires ${estimatedHours}h of estimated effort, which exceeds your daily working capacity of ${dailyCapacityHours}h/day. To respect daily capacity limits and existing commitments, it was split across ${daysCount} separate day(s) into ${allPlacements.length} work session(s): ${sessionsList}.`;
      const spokenSummary = `Task "${taskTitle}" was split across ${daysCount} days because its ${estimatedHours}-hour effort exceeds your daily capacity of ${dailyCapacityHours} hours.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: placement?.status || 'on_time',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'task_chunked_exceeds_daily_capacity',
          totalEffort: estimatedHours,
          dailyCapacityHours,
          sessionCount: allPlacements.length,
          sessions: allPlacements.map((p) => ({
            date: p.proposedDate || p.proposed_date,
            duration: p.chunkDuration || p.effectiveHours,
          })),
        },
      };
    } else {
      const responseText = `Task "${taskTitle}" was not split because its estimated effort (${estimatedHours}h) fits within your daily working capacity (${dailyCapacityHours}h/day) in a single session.`;
      const spokenSummary = `"${taskTitle}" was not split as it fits within daily capacity in one session.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: placement?.status || 'on_time',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'task_not_chunked_fits_capacity',
          totalEffort: estimatedHours,
          dailyCapacityHours,
        },
      };
    }
  }

  // SPECIAL INQUIRY 2: How much work is scheduled for this task?
  if (inquiryType === 'work_scheduled') {
    const isAccepted = sourceProposal?.status === 'accepted';
    const responseText = allPlacements.length > 0
      ? `A total of ${totalScheduledHours}h of work is scheduled for task "${taskTitle}" across ${allPlacements.length} session(s)${unscheduledHours > 0 ? ` (${unscheduledHours}h remains unscheduled)` : ''}.`
      : `There is currently 0h of work scheduled for task "${taskTitle}".`;
    const spokenSummary = `${totalScheduledHours} hours of work are scheduled for "${taskTitle}".`;
    return {
      success: true,
      taskId: targetTask.id,
      taskTitle,
      decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
      status: placement?.status || (allPlacements.length > 0 ? 'on_time' : 'unscheduled'),
      responseText,
      spokenSummary,
      evidence: {
        reasonCode: 'work_scheduled_query',
        scheduledHours: totalScheduledHours,
        totalEffort: estimatedHours,
        unscheduledHours,
        sessionCount: allPlacements.length,
      },
    };
  }

  // SPECIAL INQUIRY 3: How much of this task remains unscheduled?
  if (inquiryType === 'work_unscheduled') {
    const isAccepted = sourceProposal?.status === 'accepted';
    const responseText = unscheduledHours > 0
      ? `Task "${taskTitle}" has ${unscheduledHours}h of unscheduled work remaining out of ${estimatedHours}h total estimated effort.`
      : `Task "${taskTitle}" has 0h of unscheduled work remaining; all required effort is fully scheduled.`;
    const spokenSummary = unscheduledHours > 0
      ? `${unscheduledHours} hours remain unscheduled for "${taskTitle}".`
      : `"${taskTitle}" has zero unscheduled hours.`;
    return {
      success: true,
      taskId: targetTask.id,
      taskTitle,
      decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
      status: placement?.status || 'on_time',
      responseText,
      spokenSummary,
      evidence: {
        reasonCode: 'work_unscheduled_query',
        unscheduledHours,
        totalEffort: estimatedHours,
        scheduledHours: totalScheduledHours,
      },
    };
  }

  // SPECIAL INQUIRY 4: Why couldn't you fit the whole task before its deadline?
  if (inquiryType === 'why_not_fit_before_deadline') {
    const isAccepted = sourceProposal?.status === 'accepted';
    const deadlineLabel = originalDueDate || 'its deadline';
    if (unscheduledHours > 0) {
      const responseText = `Task "${taskTitle}" could not be fully fitted before its deadline (${deadlineLabel}) because available daily capacity across eligible working days was insufficient to accommodate the full ${estimatedHours}h effort (${unscheduledHours}h unscheduled). Under scheduling invariants, work is never scheduled past the deadline.`;
      const spokenSummary = `Insufficient daily capacity before ${deadlineLabel} prevented scheduling the full effort for "${taskTitle}".`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: 'partially_allocated',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'deadline_capacity_deficit',
          deadline: originalDueDate,
          totalEffort: estimatedHours,
          scheduledHours: totalScheduledHours,
          unscheduledHours,
        },
      };
    } else {
      const responseText = `Task "${taskTitle}" was successfully fitted before its deadline (${deadlineLabel}), with all ${totalScheduledHours}h scheduled across ${allPlacements.length} session(s).`;
      const spokenSummary = `"${taskTitle}" was fully scheduled before its deadline.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: 'on_time',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'deadline_satisfied',
          deadline: originalDueDate,
          scheduledHours: totalScheduledHours,
        },
      };
    }
  }

  // SPECIAL INQUIRY 5: How many sessions did you propose for this task?
  if (inquiryType === 'session_count') {
    const isAccepted = sourceProposal?.status === 'accepted';
    const sessionCount = allPlacements.length;
    const daysCount = new Set(allPlacements.map((p) => p.proposedDate || p.proposed_date)).size;
    const responseText = sessionCount > 0
      ? `VoxPlan proposed ${sessionCount} work session(s) for task "${taskTitle}", totaling ${totalScheduledHours}h across ${daysCount} day(s).`
      : `No sessions are proposed for task "${taskTitle}".`;
    const spokenSummary = `${sessionCount} session${sessionCount === 1 ? '' : 's'} proposed for "${taskTitle}".`;
    return {
      success: true,
      taskId: targetTask.id,
      taskTitle,
      decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
      status: placement?.status || 'on_time',
      responseText,
      spokenSummary,
      evidence: {
        reasonCode: 'session_count_query',
        sessionCount,
        daysCount,
        scheduledHours: totalScheduledHours,
      },
    };
  }

  // SPECIAL INQUIRY 6: Why was this task scheduled at this specific time / 10 AM?
  if (inquiryType === 'why_at_time') {
    const isAccepted = sourceProposal?.status === 'accepted';
    if (placement?.startTime && placement?.endTime) {
      const timeWindow = `${placement.startTime} – ${placement.endTime}`;
      const focusText = placement.inFocusWindow
        ? ` and aligns with your ${placement.focusWindowLabel || 'focus window'}`
        : '';
      const dayAlloc = Array.isArray(sourceProposal?.dayAllocations)
        ? sourceProposal.dayAllocations.find((d) => d.date === placement.proposedDate)
        : null;
      const blackoutsOnDay = dayAlloc?.blackoutsApplied || [];
      const blackoutNames = blackoutsOnDay.map((b) => b.title || b.label).filter(Boolean);
      const blackoutText = blackoutNames.length > 0
        ? ` avoiding blackouts (${blackoutNames.join(', ')})`
        : ' avoiding meeting blackouts';

      const responseText = `Task "${taskTitle}" was scheduled from ${timeWindow} on ${placement.proposedDate} because this interval was available within your configured working hours,${blackoutText}${focusText}.`;
      const spokenSummary = `"${taskTitle}" was scheduled from ${timeWindow} on ${placement.proposedDate} in an open focus window.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: placement?.status || 'on_time',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'intraday_window_allocated',
          startTime: placement.startTime,
          endTime: placement.endTime,
          date: placement.proposedDate,
          inFocusWindow: Boolean(placement.inFocusWindow),
          focusWindowLabel: placement.focusWindowLabel || null,
        },
      };
    } else {
      const responseText = `Task "${taskTitle}" is scheduled for ${placement?.proposedDate || 'an unassigned date'} at the daily level. Specific intraday start and end times have not been assigned.`;
      const spokenSummary = `"${taskTitle}" is scheduled at the day level without a specific start time.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        status: placement?.status || 'on_time',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'no_intraday_timestamps',
          date: placement?.proposedDate || null,
        },
      };
    }
  }

  // CASE 1: Placement Found in Proposal
  if (placement) {
    const proposedDate = placement.proposedDate || placement.proposed_date || null;
    const status = placement.status || placement.placementStatus || 'on_time';
    const isAccepted = sourceProposal?.status === 'accepted';
    const proposalLabel = isAccepted ? 'your accepted schedule' : 'the proposed schedule';

    // 1a. Blocked by dependencies
    if (status === 'blocked_by_dependency') {
      const names = uncompletedPrereqs.map((p) => `"${p.title}"`).join(', ') || 'uncompleted prerequisite tasks';
      const responseText = `Task "${taskTitle}" is currently blocked by dependencies (${names}). Under topological constraints, a task cannot be scheduled until all prerequisite tasks are completed.`;
      const spokenSummary = `"${taskTitle}" is blocked by prerequisite tasks and cannot be scheduled yet.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        scheduledDate: null,
        status: 'blocked_by_dependency',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'blocked_by_dependency',
          prerequisites: prereqIds,
          uncompletedPrereqs: uncompletedPrereqs.map((p) => ({ id: p.id, title: p.title })),
          conflicts: placement.conflicts || [],
        },
      };
    }

    // 1b. Oversized task exceeding daily capacity
    if (status === 'oversized_exceeds_capacity') {
      const responseText = `Task "${taskTitle}" cannot be automatically scheduled because its estimated effort (${estimatedHours}h) exceeds your daily working capacity (${dailyCapacityHours}h/day). It requires manual breakdown into smaller subtasks or a capacity adjustment.`;
      const spokenSummary = `"${taskTitle}" requires ${estimatedHours} hours, exceeding your daily capacity of ${dailyCapacityHours} hours.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        scheduledDate: null,
        status: 'oversized_exceeds_capacity',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'oversized_exceeds_capacity',
          effectiveHours: estimatedHours,
          dailyCapacityHours,
          conflicts: placement.conflicts || [],
        },
      };
    }

    // 1c. Capacity exhausted / Unscheduled
    if (status === 'unscheduled' || !proposedDate) {
      const responseText = `Task "${taskTitle}" could not fit within the current planning horizon in ${proposalLabel}. All daily working capacity slots (${dailyCapacityHours}h/day) were allocated to higher-priority and earlier-deadline commitments.`;
      const spokenSummary = `"${taskTitle}" could not be scheduled due to full capacity across the planning window.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        scheduledDate: null,
        status: 'unscheduled',
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'capacity_exhausted',
          dailyCapacityHours,
          conflicts: placement.conflicts || [],
        },
      };
    }

    // 1d. Specifically asked why it couldn't fit on an earlier date (e.g. "today")
    if (targetDateQuery && targetDateQuery !== proposedDate) {
      const requestedDate = targetDateQuery === 'today' ? todayISO
        : targetDateQuery === 'tomorrow' ? addDaysISO(todayISO, 1)
        : targetDateQuery;

      const isRequestedWorkDay = isWorkingDay(requestedDate, workingDays);
      let blockingPrereq = null;

      for (const p of prereqTasks) {
        const pDue = p.dueDate ? formatDateISO(p.dueDate) : null;
        if (pDue && pDue >= requestedDate) {
          blockingPrereq = p;
          break;
        }
      }

      if (!isRequestedWorkDay) {
        const responseText = `Task "${taskTitle}" could not be scheduled on ${requestedDate} because it is a non-working day under your schedule settings. It was placed on ${proposedDate}, the earliest open working day.`;
        const spokenSummary = `${requestedDate} is a non-working day, so "${taskTitle}" was placed on ${proposedDate}.`;
        return {
          success: true,
          taskId: targetTask.id,
          taskTitle,
          decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
          scheduledDate: proposedDate,
          status,
          responseText,
          spokenSummary,
          evidence: {
            reasonCode: 'non_working_day',
            requestedDate,
            proposedDate,
          },
        };
      }

      if (blockingPrereq) {
        const responseText = `Task "${taskTitle}" could not be scheduled on ${requestedDate} because prerequisite task "${blockingPrereq.title}" is scheduled for ${blockingPrereq.dueDate}. By topological rule, prerequisites must schedule prior to dependent work. It was placed on ${proposedDate}.`;
        const spokenSummary = `Prerequisite task "${blockingPrereq.title}" must finish before "${taskTitle}" can be scheduled.`;
        return {
          success: true,
          taskId: targetTask.id,
          taskTitle,
          decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
          scheduledDate: proposedDate,
          status,
          responseText,
          spokenSummary,
          evidence: {
            reasonCode: 'prerequisite_ordering',
            blockingPrereq: { id: blockingPrereq.id, title: blockingPrereq.title, dueDate: blockingPrereq.dueDate },
            requestedDate,
            proposedDate,
          },
        };
      }

      // Check daily capacity load on the requested date
      const placementsOnDay = (sourceProposal.proposedPlacements || sourceProposal.placements || []).filter(
        (p) => (p.proposedDate || p.proposed_date) === requestedDate && (p.taskId || p.task_id) !== targetTask.id
      );
      const allocatedHours = placementsOnDay.reduce((sum, p) => sum + (p.effectiveHours || 0), 0);

      const responseText = `On ${requestedDate}, ${allocatedHours.toFixed(1)}h of work are already allocated against your ${dailyCapacityHours}h/day limit. Adding "${taskTitle}" (${estimatedHours}h) would total ${(allocatedHours + estimatedHours).toFixed(1)}h, exceeding daily capacity. Therefore, it was placed on ${proposedDate}, the earliest working day with open capacity.`;
      const spokenSummary = `On ${requestedDate}, daily capacity was full with ${allocatedHours.toFixed(1)} hours of other tasks, so "${taskTitle}" was scheduled for ${proposedDate}.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        scheduledDate: proposedDate,
        status,
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'daily_capacity_limit',
          requestedDate,
          allocatedHours,
          dailyCapacityHours,
          proposedDate,
        },
      };
    }

    // 1e. Standard explanation: Why was it placed on proposedDate?
    if (isChunked && !targetDateQuery) {
      const daysCount = new Set(allPlacements.map((p) => p.proposedDate || p.proposed_date)).size;
      const sessionsList = allPlacements.map((p) => `${p.proposedDate || p.proposed_date} (${(p.chunkDuration || p.effectiveHours || 0)}h)`).join(', ');
      const responseText = `In ${proposalLabel}, "${taskTitle}" was partitioned into ${allPlacements.length} work sessions across ${daysCount} days (${sessionsList}), totaling ${totalScheduledHours}h, to fit within your ${dailyCapacityHours}h/day capacity limit.${unscheduledHours > 0 ? ` Note: ${unscheduledHours}h remains unscheduled due to deadline and capacity limits.` : ''}`;
      const spokenSummary = `"${taskTitle}" was scheduled across ${allPlacements.length} sessions totaling ${totalScheduledHours} hours.`;
      return {
        success: true,
        taskId: targetTask.id,
        taskTitle,
        decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
        scheduledDate: proposedDate,
        status,
        responseText,
        spokenSummary,
        evidence: {
          reasonCode: 'task_chunked',
          totalEffort: estimatedHours,
          scheduledHours: totalScheduledHours,
          unscheduledHours,
          sessionCount: allPlacements.length,
          sessions: allPlacements.map((p) => ({
            date: p.proposedDate || p.proposed_date,
            duration: p.chunkDuration || p.effectiveHours,
          })),
        },
      };
    }

    const reasons = [];

    if (originalDueDate) {
      if (originalDueDate === proposedDate) {
        reasons.push(`aligned with its deadline (${originalDueDate}) within available daily capacity`);
      } else if (proposedDate < originalDueDate) {
        const daysAhead = dayDifference(proposedDate, originalDueDate);
        reasons.push(`scheduled ${daysAhead} day${daysAhead === 1 ? '' : 's'} ahead of its deadline (${originalDueDate}) to balance workload`);
      } else {
        const daysLate = dayDifference(originalDueDate, proposedDate);
        reasons.push(`placed ${daysLate} day${daysLate === 1 ? '' : 's'} past its deadline (${originalDueDate}) because earlier dates reached daily capacity limits (${dailyCapacityHours}h/day)`);
      }
    } else {
      reasons.push(`has no explicit deadline, so it was placed in an available capacity slot on ${proposedDate}`);
    }

    if (taskPriority === 'high') {
      reasons.push('elevated by its high priority tier');
    }

    if (prereqIds.length > 0) {
      reasons.push(`respects completion order for ${prereqIds.length} prerequisite${prereqIds.length > 1 ? 's' : ''}`);
    }

    const durationSourceNote = placement.durationSource === 'personalized'
      ? ` (estimated at ${estimatedHours}h using your personal completion history)`
      : ` (planned for ${estimatedHours}h)`;

    const responseText = `In ${proposalLabel}, "${taskTitle}" was scheduled for ${proposedDate}${durationSourceNote}. Key factors: ${reasons.join(', ')}. Note: Fine-grained slot comparisons were not recorded.`;
    const spokenSummary = `"${taskTitle}" was scheduled for ${proposedDate} based on its ${originalDueDate ? 'deadline' : 'priority'} and daily capacity limits.`;

    return {
      success: true,
      taskId: targetTask.id,
      taskTitle,
      decisionType: isAccepted ? 'accepted_schedule' : 'proposed_placement',
      scheduledDate: proposedDate,
      status,
      responseText,
      spokenSummary,
      evidence: {
        reasonCode: status,
        originalDueDate,
        proposedDate,
        effectiveHours: estimatedHours,
        durationSource: placement.durationSource,
        priority: taskPriority,
        reasons,
        limitations: ['Specific rejected slot alternatives beyond capacity limits were not recorded.'],
      },
    };
  }

  // CASE 2: No Proposal Placement Found (Task Backlog / Direct User Date)
  if (originalDueDate) {
    // Check if user manually rescheduled this task
    const reschedEvent = telemetryEvents
      .filter((e) => e.event_type === 'task_rescheduled' && e.task_id === targetTask.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    let sourceNote = 'as set when created';
    if (reschedEvent) {
      const reason = reschedEvent.payload?.reason || 'user update';
      sourceNote = `based on a direct reschedule (${reason})`;
    }

    const responseText = `Task "${taskTitle}" is currently scheduled for ${originalDueDate} ${sourceNote}. It is not governed by an active automated schedule proposal.`;
    const spokenSummary = `"${taskTitle}" is due on ${originalDueDate} from a direct update, without an active automated proposal.`;

    return {
      success: true,
      taskId: targetTask.id,
      taskTitle,
      decisionType: 'task_backlog',
      scheduledDate: originalDueDate,
      status: 'manual_or_default',
      responseText,
      spokenSummary,
      evidence: {
        reasonCode: 'direct_user_schedule',
        originalDueDate,
        sourceNote,
        limitations: ['No automated scheduler optimization evidence exists for this task.'],
      },
    };
  }

  // CASE 3: Task has no date and no proposal
  const responseText = `Task "${taskTitle}" currently has no deadline and is not part of any schedule proposal. Say "Plan sprint" or "Reschedule ${taskTitle} to [date]" to schedule it.`;
  const spokenSummary = `"${taskTitle}" has no due date and is not part of a schedule proposal.`;

  return {
    success: true,
    taskId: targetTask.id,
    taskTitle,
    decisionType: 'not_scheduled',
    scheduledDate: null,
    status: 'unscheduled',
    responseText,
    spokenSummary,
    evidence: {
      reasonCode: 'no_schedule_data',
      limitations: ['Task has neither a deadline nor a proposal placement.'],
    },
  };
}

/**
 * FEATURE B: Explain schedule changes between proposals or against baseline.
 *
 * @param {Object} params
 * @param {Object|null} [params.activeProposal=null] - Current proposal under review
 * @param {Array<Object>} [params.proposalHistory=[]] - Historical proposals
 * @param {Array<Object>} [params.tasks=[]] - Current active task collection
 * @param {Array<Object>} [params.telemetryEvents=[]] - Behavioral telemetry events
 * @param {string|null} [params.queryTaskId=null] - Specific task ID if asking about a single task's movement
 * @param {Function} [params.clock] - Clock function
 * @returns {Object} Structured changes report
 */
export function explainScheduleChanges({
  activeProposal = null,
  proposalHistory = [],
  tasks = [],
  telemetryEvents = [],
  queryTaskId = null,
  _clock = () => Date.now(),
}) {
  // Determine version B (new) and version A (baseline to compare against)
  let versionB = activeProposal;
  let versionA = null;
  let comparisonLabel = '';

  if (versionB) {
    // If active proposal supersedes an earlier proposal, find it
    if (versionB.supersedesScheduleId && Array.isArray(proposalHistory)) {
      versionA = proposalHistory.find((p) => p.scheduleId === versionB.supersedesScheduleId) || null;
    }
    // Fallback: previous proposal in history
    if (!versionA && Array.isArray(proposalHistory) && proposalHistory.length > 0) {
      versionA = proposalHistory[proposalHistory.length - 1];
    }
    comparisonLabel = versionA ? 'the previous proposal' : 'your current task deadlines';
  } else if (Array.isArray(proposalHistory) && proposalHistory.length > 0) {
    versionB = proposalHistory[proposalHistory.length - 1];
    if (proposalHistory.length >= 2) {
      versionA = proposalHistory[proposalHistory.length - 2];
      comparisonLabel = 'the prior proposal';
    } else {
      comparisonLabel = 'current task deadlines';
    }
  }

  if (!versionB) {
    return {
      success: false,
      hasChanges: false,
      error: 'no_proposals_available',
      responseText: 'No schedule proposals have been generated yet. You can say "Plan sprint" to generate a schedule proposal.',
      spokenSummary: 'No schedule proposals are available to compare.',
    };
  }

  // Build maps of placements for B and A by stable taskId
  const placementsB = versionB.proposedPlacements || versionB.placements || [];
  const mapB = new Map();
  for (const p of placementsB) {
    const id = p.taskId || p.task_id;
    if (id) mapB.set(id, p);
  }

  const mapA = new Map();
  if (versionA) {
    const placementsA = versionA.proposedPlacements || versionA.placements || [];
    for (const p of placementsA) {
      const id = p.taskId || p.task_id;
      if (id) mapA.set(id, p);
    }
  } else {
    // Baseline comparison: current tasks
    for (const t of tasks) {
      mapA.set(t.id, {
        taskId: t.id,
        taskTitle: t.title,
        proposedDate: t.dueDate || null,
        effectiveHours: t.estimatedEffort || DEFAULT_TASK_FALLBACK_HOURS,
        status: 'baseline',
      });
    }
  }

  const movedTasks = [];
  const addedTasks = [];
  const removedTasks = [];
  const statusChanges = [];

  // Compare B against A
  for (const [tId, pB] of mapB.entries()) {
    const pA = mapA.get(tId);
    const dateB = pB.proposedDate || pB.proposed_date || null;
    const title = pB.taskTitle || pB.title || tasks.find((t) => t.id === tId)?.title || 'Task';

    if (!pA) {
      addedTasks.push({ id: tId, title, proposedDate: dateB });
    } else {
      const dateA = pA.proposedDate || pA.proposed_date || null;
      if (dateA !== dateB) {
        const diff = (dateA && dateB) ? dayDifference(dateA, dateB) : null;

        // Check if there is a recorded user trigger for this task move
        const userResched = telemetryEvents.find(
          (e) => e.event_type === 'task_rescheduled' && e.task_id === tId && e.payload?.new_due_date === dateB
        );

        let triggerReason = 'unrecorded';
        let triggerText = '';
        if (userResched) {
          triggerReason = userResched.payload?.reason || 'user_reschedule';
          triggerText = ` (after you requested: ${triggerReason})`;
        } else {
          triggerText = ' (shifted during automated schedule balancing; specific trigger not recorded)';
        }

        movedTasks.push({
          id: tId,
          title,
          fromDate: dateA || 'no date',
          toDate: dateB || 'no date',
          offsetDays: diff,
          triggerReason,
          triggerText,
        });
      }

      if (pA.status && pB.status && pA.status !== pB.status) {
        statusChanges.push({
          id: tId,
          title,
          fromStatus: pA.status,
          toStatus: pB.status,
        });
      }
    }
  }

  for (const [tId, pA] of mapA.entries()) {
    if (!mapB.has(tId)) {
      const title = pA.taskTitle || pA.title || tasks.find((t) => t.id === tId)?.title || 'Task';
      removedTasks.push({ id: tId, title, originalDate: pA.proposedDate || null });
    }
  }

  // 1. If user asked about a specific task ("Why did this task move?", "Why did English move?")
  if (queryTaskId) {
    const moved = movedTasks.find((m) => m.id === queryTaskId);
    const targetTask = tasks.find((t) => t.id === queryTaskId);
    const tTitle = targetTask?.title || 'This task';

    if (moved) {
      const offsetStr = moved.offsetDays !== null ? ` (${formatDayOffset(moved.offsetDays)})` : '';
      const responseText = `"${tTitle}" moved from ${moved.fromDate} to ${moved.toDate}${offsetStr} compared to ${comparisonLabel}.${moved.triggerText}`;
      const spokenSummary = `"${tTitle}" moved from ${moved.fromDate} to ${moved.toDate}.`;
      return {
        success: true,
        hasChanges: true,
        taskId: queryTaskId,
        taskTitle: tTitle,
        moved,
        responseText,
        spokenSummary,
      };
    } else {
      const pB = mapB.get(queryTaskId);
      const currentDate = pB ? (pB.proposedDate || 'no date') : (targetTask?.dueDate || 'no date');
      const responseText = `"${tTitle}" did not move in the latest proposal; it remains scheduled for ${currentDate}.`;
      const spokenSummary = `"${tTitle}" did not move. It remains scheduled for ${currentDate}.`;
      return {
        success: true,
        hasChanges: false,
        taskId: queryTaskId,
        taskTitle: tTitle,
        responseText,
        spokenSummary,
      };
    }
  }

  // 2. General changes summary
  const totalChanges = movedTasks.length + addedTasks.length + removedTasks.length;
  if (totalChanges === 0) {
    const responseText = `No schedule changes detected in the proposal compared to ${comparisonLabel}. Tasks retain their scheduled dates.`;
    const spokenSummary = `No schedule changes detected in the proposal.`;
    return {
      success: true,
      hasChanges: false,
      responseText,
      spokenSummary,
      movedTasks: [],
      addedTasks: [],
      removedTasks: [],
    };
  }

  const lines = [
    `Schedule comparison with ${comparisonLabel}: ${movedTasks.length} task${movedTasks.length === 1 ? '' : 's'} moved${addedTasks.length > 0 ? `, ${addedTasks.length} added` : ''}${removedTasks.length > 0 ? `, ${removedTasks.length} removed` : ''}:`,
  ];

  for (const m of movedTasks) {
    const offsetStr = m.offsetDays !== null ? ` (${formatDayOffset(m.offsetDays)})` : '';
    lines.push(`• "${m.title}": moved from ${m.fromDate} to ${m.toDate}${offsetStr}${m.triggerText}`);
  }

  for (const a of addedTasks) {
    lines.push(`• "${a.title}": newly added to schedule for ${a.proposedDate || 'unscheduled'}`);
  }

  for (const r of removedTasks) {
    lines.push(`• "${r.title}": omitted from proposal (previously on ${r.originalDate || 'unscheduled'})`);
  }

  const responseText = lines.join('\n');
  const spokenSummary = `${movedTasks.length} task${movedTasks.length === 1 ? '' : 's'} moved in the proposal compared to ${comparisonLabel}.`;

  return {
    success: true,
    hasChanges: true,
    comparisonLabel,
    movedTasks,
    addedTasks,
    removedTasks,
    statusChanges,
    responseText,
    spokenSummary,
  };
}

/**
 * FEATURE C: Conversational Planning Debrief (Planned vs Actual Outcomes).
 *
 * @param {Object} params
 * @param {string} [params.period='today'] - 'today', 'yesterday', or 'recent'
 * @param {string|null} [params.targetDate=null] - Optional explicit ISO date YYYY-MM-DD
 * @param {Array<Object>} [params.tasks=[]] - Current task collection
 * @param {Array<Object>} [params.telemetryEvents=[]] - Behavioral telemetry events
 * @param {Array<Object>} [params.proposalHistory=[]] - Historical proposals
 * @param {number} [params.dailyCapacityHours=6.0] - Configured daily capacity
 * @param {Function} [params.clock] - Clock function returning timestamp
 * @returns {Object} Structured planning debrief
 */
export function generatePlanDebrief({
  period = 'today',
  targetDate = null,
  tasks = [],
  telemetryEvents = [],
  _proposalHistory = [],
  dailyCapacityHours = DEFAULT_DAILY_CAPACITY_HOURS,
  clock = () => Date.now(),
}) {
  const now = new Date(clock());
  const todayISO = formatISODate(now);
  const yesterdayISO = addDaysISO(todayISO, -1);

  let periodDate = targetDate;
  let periodLabel = period;

  if (!periodDate) {
    if (period === 'yesterday') {
      periodDate = yesterdayISO;
      periodLabel = 'yesterday';
    } else {
      periodDate = todayISO;
      periodLabel = 'today';
    }
  }

  // 1. Identify tasks scheduled or planned for periodDate
  // Search accepted schedule proposals in telemetryEvents and tasks with dueDate === periodDate
  const scheduledTaskIds = new Set();

  for (const e of telemetryEvents) {
    if (e.event_type === 'schedule_proposal_accepted' && Array.isArray(e.payload?.applied_placements)) {
      for (const p of e.payload.applied_placements) {
        if (p.proposed_date === periodDate) {
          scheduledTaskIds.add(p.task_id);
        }
      }
    }
  }

  // Also include tasks in current task collection with dueDate === periodDate
  for (const t of tasks) {
    if (t.dueDate === periodDate) {
      scheduledTaskIds.add(t.id);
    }
  }

  // Check for task completions recorded on periodDate even if not pre-scheduled
  const completionEventsOnDate = telemetryEvents.filter(
    (e) => e.event_type === 'task_completed' && e.timestamp && e.timestamp.slice(0, 10) === periodDate
  );

  for (const ev of completionEventsOnDate) {
    if (ev.task_id) scheduledTaskIds.add(ev.task_id);
  }

  const candidateIds = Array.from(scheduledTaskIds);

  // INSUFFICIENT DATA GUARD: If no scheduled tasks and no completions on that date
  if (candidateIds.length === 0) {
    const responseText = `Insufficient recorded data: No scheduled tasks or recorded completions were found for ${periodLabel} (${periodDate}). Try planning tasks first with "add task [name] due ${periodLabel}".`;
    const spokenSummary = `No scheduled tasks or outcomes were recorded for ${periodLabel}.`;
    return {
      success: true,
      hasSufficientData: false,
      periodLabel,
      periodDate,
      responseText,
      spokenSummary,
      metrics: {
        scheduledCount: 0,
        completedCount: 0,
        incompleteCount: 0,
      },
    };
  }

  // 2. Measure actual completion outcomes strictly from recorded evidence
  let completedCount = 0;
  let incompleteCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let unverifiedTimingCount = 0;
  let trackedSecondsTotal = 0;
  let selfReportedSecondsTotal = 0;
  let trackedTasksCount = 0;

  const completedDetails = [];
  const incompleteDetails = [];

  for (const tId of candidateIds) {
    const taskObj = tasks.find((t) => t.id === tId) || { id: tId, title: 'Task' };
    const title = taskObj.title || 'Task';
    const isCompleted = Boolean(taskObj.completed);

    // Look for completion event
    const compEvent = telemetryEvents
      .filter((e) => e.event_type === 'task_completed' && e.task_id === tId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    if (isCompleted || compEvent) {
      completedCount++;
      let onTimeStatus = 'unverified';

      if (compEvent && compEvent.timestamp && taskObj.dueDate) {
        const compDate = compEvent.timestamp.slice(0, 10);
        if (compDate <= taskObj.dueDate) {
          onTimeCount++;
          onTimeStatus = 'on_time';
        } else {
          lateCount++;
          onTimeStatus = 'late';
        }
      } else {
        // Missing timestamp or missing deadline: do NOT fabricate punctuality!
        unverifiedTimingCount++;
        onTimeStatus = 'timing_unrecorded';
      }

      if (compEvent) {
        const src = compEvent.payload?.duration_source;
        if (src === 'tracked') {
          const s = compEvent.payload?.tracked_duration_seconds || 0;
          trackedSecondsTotal += s;
          trackedTasksCount++;
        } else if (src === 'self_reported') {
          selfReportedSecondsTotal += compEvent.payload?.self_reported_duration_seconds || 0;
        }
      }

      completedDetails.push({
        id: tId,
        title,
        onTimeStatus,
      });
    } else {
      incompleteCount++;
      incompleteDetails.push({
        id: tId,
        title,
        priority: taskObj.priority || 'medium',
        effort: taskObj.estimatedEffort || null,
      });
    }
  }

  // 3. Integrate schedule feedback integrity metrics
  const feedbackMetrics = computeScheduleFeedback(telemetryEvents, tasks);

  // 4. Formulate evidence-based advice (strictly bounded, non-speculative)
  const suggestions = [];
  const totalPlannedEffort = candidateIds.reduce((sum, id) => {
    const t = tasks.find((x) => x.id === id);
    return sum + (t?.estimatedEffort || 1.0);
  }, 0);

  if (incompleteCount > 0 && totalPlannedEffort > dailyCapacityHours) {
    suggestions.push(
      `Evidence note: Planned workload for ${periodDate} totaled ${totalPlannedEffort.toFixed(1)}h, exceeding your daily capacity limit of ${dailyCapacityHours}h/day, which contributed to incomplete tasks.`
    );
  } else if (incompleteCount === 0 && candidateIds.length > 0) {
    suggestions.push(`All ${candidateIds.length} planned tasks for ${periodLabel} were completed.`);
  }

  if (typeof feedbackMetrics?.rates?.taskOverrideRate === 'number' && feedbackMetrics.rates.taskOverrideRate > 0.3) {
    suggestions.push(
      `Schedule feedback note: ${(feedbackMetrics.rates.taskOverrideRate * 100).toFixed(0)}% of proposed dates were manually rescheduled after acceptance.`
    );
  }

  // 5. Construct user-facing text
  const lines = [
    `Planning Debrief for ${periodLabel.toUpperCase()} (${periodDate}):`,
    `• Planned Tasks: ${candidateIds.length}`,
    `• Completed: ${completedCount} (${completedCount > 0 && candidateIds.length > 0 ? Math.round((completedCount / candidateIds.length) * 100) : 0}%)`,
    `• Incomplete: ${incompleteCount}`,
  ];

  if (onTimeCount > 0 || lateCount > 0) {
    lines.push(`• On-Time Completions: ${onTimeCount} on time, ${lateCount} completed after deadline`);
  }
  if (unverifiedTimingCount > 0) {
    lines.push(`• Unverified Punctuality: ${unverifiedTimingCount} (missing completion timestamp)`);
  }

  if (trackedSecondsTotal > 0 || selfReportedSecondsTotal > 0) {
    const trackedMins = Math.round(trackedSecondsTotal / 60);
    const repMins = Math.round(selfReportedSecondsTotal / 60);
    lines.push(`• Recorded Focus Time: ${trackedMins}m timed${repMins > 0 ? `, ${repMins}m reported` : ''}`);
  } else {
    lines.push(`• Recorded Focus Time: None recorded for this period`);
  }

  if (incompleteDetails.length > 0) {
    lines.push(`\nUnfinished Tasks:`);
    for (const inc of incompleteDetails) {
      lines.push(`- "${inc.title}" (${inc.priority} priority${inc.effort ? `, ${inc.effort}h` : ''})`);
    }
  }

  if (suggestions.length > 0) {
    lines.push(`\n${suggestions.join('\n')}`);
  }

  const responseText = lines.join('\n');
  const spokenSummary = `Planning debrief for ${periodLabel}: ${completedCount} of ${candidateIds.length} tasks completed${incompleteCount > 0 ? `, ${incompleteCount} remaining` : ''}.`;

  return {
    success: true,
    hasSufficientData: true,
    periodLabel,
    periodDate,
    metrics: {
      scheduledCount: candidateIds.length,
      completedCount,
      incompleteCount,
      onTimeCount,
      lateCount,
      unverifiedTimingCount,
      trackedSecondsTotal,
      selfReportedSecondsTotal,
    },
    completedDetails,
    incompleteDetails,
    suggestions,
    responseText,
    spokenSummary,
  };
}
