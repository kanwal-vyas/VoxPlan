/**
 * VoxPlan Interactive Schedule Proposal Editing Engine (Phase 6, Stage 6.3).
 *
 * Implements deterministic proposal inspection, live editing, constraint validation,
 * draft isolation, live metric recomputation, and undo/revert capabilities.
 *
 * Key Invariants:
 * 1. Draft Isolation: Editing an active proposal operates strictly on a draft clone.
 *    Saved tasks, accepted schedule records, durable feedback, and telemetry remain
 *    100% unmutated until explicit user acceptance.
 * 2. Stable Placement Identification: Edits reference stable, unique `placementId` values
 *    rather than task titles or array indexes, guaranteeing precision even when task titles
 *    are duplicated or tasks are split into multi-day chunks.
 * 3. Hard-Constraint Validation:
 *    - Working Hours: Session start/end must remain within configured working bounds.
 *    - Meeting Blackouts: Session cannot overlap configured blackout/unavailable windows.
 *    - Continuous Window Availability: Session must fit continuously in an open window.
 *    - Daily Capacity: Total scheduled hours on a date cannot exceed daily capacity.
 *    - Session Conflicts: No two sessions may overlap in time on the same date.
 *    - Topological Dependencies: Prerequisites must be completed before dependents start;
 *      sequential chunks of the same task maintain non-overlapping chronological order.
 *    - Deadlines: Reject placements past deadline when strict deadline enforcement is active.
 * 4. Grounded Live Recalculation:
 *    - Live recomputation of scheduled vs unscheduled workload, daily capacity utilization,
 *      feasibility status, shift counts, focus window alignment, and placement explanations.
 * 5. Undo & Revert:
 *    - Pure stack-based undo for sequential edits and one-click revert to initial proposal.
 */

import {
  parseTimeToMinutes,
  minutesToTimeString,
  intervalsOverlap,
  getBlackoutsForDate,
  computeAvailableWindowsForDate,
  normalizeWorkingHours,
  DEFAULT_WORK_DAY_START,
} from './timeBlockScheduler.js';

import {
  parseDateISO,
  DEFAULT_DAILY_CAPACITY_HOURS,
} from './adaptiveScheduler.js';

import { DEFAULT_MIN_CHUNK_HOURS } from './taskChunker.js';

export const DEFAULT_MIN_SESSION_HOURS = 0.5;

/**
 * Ensures all placements in a proposal have unique, stable placementId values.
 * Preserves existing placementId or chunkId if present.
 *
 * @param {object} proposal Adaptive schedule proposal
 * @returns {object} Proposal with guaranteed placementId on all placements
 */
export function ensurePlacementIds(proposal) {
  if (!proposal) return proposal;
  const placements = proposal.proposedPlacements || proposal.placements || [];
  const seenIds = new Set();

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (!p) continue;

    if (!p.placementId) {
      if (p.isChunk || p.chunkIndex !== undefined) {
        p.placementId = p.chunkId || `chunk_${p.taskId}_seg_${p.chunkIndex ?? i}`;
      } else {
        p.placementId = `placement_${p.taskId}`;
      }
    }

    let finalId = p.placementId;
    let suffix = 1;
    while (seenIds.has(finalId)) {
      finalId = `${p.placementId}_${suffix++}`;
    }
    p.placementId = finalId;
    seenIds.add(finalId);
  }

  proposal.proposedPlacements = placements;
  proposal.placements = placements;
  return proposal;
}

/**
 * Validates a proposed edit to a specific placement against all scheduling hard constraints.
 *
 * @param {object} proposal The schedule proposal (or draft)
 * @param {string} placementId Stable placement identifier
 * @param {object} changes Edit changes { proposedDate, startTime, endTime, durationHours }
 * @param {object} [context={}] Additional context (tasks, workingHours, blackouts, focusWindows, dailyCapacityHours, enforceDeadlines)
 * @returns {{
 *   valid: boolean,
 *   reason?: string,
 *   message?: string,
 *   conflictData?: object,
 *   details?: object,
 * }}
 */
export function validatePlacementEdit(proposal, placementId, changes = {}, context = {}) {
  if (!proposal) {
    return { valid: false, reason: 'missing_proposal', message: 'No schedule proposal provided.' };
  }

  const placements = proposal.proposedPlacements || proposal.placements || [];
  const target = placements.find((p) => p.placementId === placementId);

  if (!target) {
    return {
      valid: false,
      reason: 'placement_not_found',
      message: `Placement "${placementId}" was not found in the schedule proposal.`,
    };
  }

  const tasks = context.tasks || [];
  const targetTask = tasks.find((t) => t.id === target.taskId) || {
    id: target.taskId,
    title: target.taskTitle,
    dependencies: target.dependencies || [],
    dueDate: target.originalDueDate,
  };

  const newProposedDate =
    changes.proposedDate !== undefined ? changes.proposedDate : target.proposedDate;

  // Unschedule request: clearing date and times is valid
  if (newProposedDate === null) {
    return {
      valid: true,
      details: {
        newProposedDate: null,
        startTime: null,
        endTime: null,
        startMinutes: null,
        endMinutes: null,
        durationHours: target.effectiveHours,
        unscheduled: true,
      },
    };
  }

  // Validate ISO date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newProposedDate) || !parseDateISO(newProposedDate)) {
    return {
      valid: false,
      reason: 'invalid_date_format',
      message: `Invalid proposed date format "${newProposedDate}". Expected YYYY-MM-DD.`,
    };
  }

  // Determine session duration in hours
  let targetHours = target.effectiveHours;
  if (typeof changes.durationHours === 'number' && changes.durationHours > 0) {
    targetHours = changes.durationHours;
  }

  // Minimum session duration check
  const minSessionHours = target.isChunk
    ? (context.minChunkHours || DEFAULT_MIN_CHUNK_HOURS)
    : DEFAULT_MIN_SESSION_HOURS;

  if (targetHours < minSessionHours) {
    return {
      valid: false,
      reason: 'duration_too_short',
      message: `Session duration cannot be less than ${minSessionHours}h.`,
    };
  }

  // Time calculations
  const enableIntraday = context.enableIntraday ?? proposal.summary?.enableIntraday ?? true;
  let startMinutes = null;
  let endMinutes = null;

  const rawStartTime =
    changes.startTime !== undefined
      ? changes.startTime
      : target.startTime || context.workingHours?.start || DEFAULT_WORK_DAY_START;

  const rawEndTime =
    changes.endTime !== undefined ? changes.endTime : target.endTime;

  if (enableIntraday && rawStartTime) {
    startMinutes = parseTimeToMinutes(rawStartTime);
    if (startMinutes === null) {
      return {
        valid: false,
        reason: 'invalid_time_format',
        message: `Invalid start time format "${rawStartTime}".`,
      };
    }

    if (rawEndTime) {
      endMinutes = parseTimeToMinutes(rawEndTime);
      if (endMinutes === null) {
        return {
          valid: false,
          reason: 'invalid_time_format',
          message: `Invalid end time format "${rawEndTime}".`,
        };
      }
    } else {
      endMinutes = startMinutes + Math.round(targetHours * 60);
    }

    if (startMinutes >= endMinutes) {
      return {
        valid: false,
        reason: 'invalid_time_range',
        message: 'Session start time must be before end time.',
      };
    }

    // Recalculate targetHours from start and end times if both explicit
    if (changes.startTime && changes.endTime) {
      targetHours = Math.round(((endMinutes - startMinutes) / 60) * 10) / 10;
    }
  }

  // Constraint 1: Working Hours
  if (enableIntraday && startMinutes !== null && endMinutes !== null) {
    const normWork = normalizeWorkingHours(context.workingHours);
    if (startMinutes < normWork.startMinutes || endMinutes > normWork.endMinutes) {
      return {
        valid: false,
        reason: 'outside_working_hours',
        message: 'This time falls outside your working hours.',
        conflictData: {
          session: { start: minutesToTimeString(startMinutes), end: minutesToTimeString(endMinutes) },
          workingHours: normWork,
        },
      };
    }

    // Constraint 2: Meeting Blackouts
    const blackouts = getBlackoutsForDate(context.blackouts || [], newProposedDate);
    const sessionInterval = { startMinutes, endMinutes };

    for (const b of blackouts) {
      if (intervalsOverlap(sessionInterval, b)) {
        return {
          valid: false,
          reason: 'overlaps_blackout',
          message: 'This session overlaps a meeting blackout.',
          conflictData: {
            blackout: b,
            blackoutLabel: b.label || b.title || 'Meeting Blackout',
          },
        };
      }
    }

    // Constraint 3: Continuous Window Availability
    const winInfo = computeAvailableWindowsForDate(newProposedDate, {
      workingHours: context.workingHours,
      blackouts: context.blackouts || [],
    });

    const fitsInOpenWindow = (winInfo.availableWindows || []).some(
      (w) => w.startMinutes <= startMinutes && w.endMinutes >= endMinutes
    );

    if (!fitsInOpenWindow) {
      return {
        valid: false,
        reason: 'insufficient_continuous_window',
        message: 'There is not enough continuous availability for this session.',
        conflictData: {
          availableWindows: winInfo.availableWindows,
        },
      };
    }

    // Constraint 4: Intraday Session Overlaps on Same Date
    for (const other of placements) {
      if (
        other.placementId !== placementId &&
        other.proposedDate === newProposedDate &&
        other.status !== 'unscheduled' &&
        other.status !== 'blocked_by_dependency' &&
        other.status !== 'oversized_exceeds_capacity' &&
        other.startTime &&
        other.endTime
      ) {
        const oStart = parseTimeToMinutes(other.startTime);
        const oEnd = parseTimeToMinutes(other.endTime);

        if (
          oStart !== null &&
          oEnd !== null &&
          intervalsOverlap({ startMinutes, endMinutes }, { startMinutes: oStart, endMinutes: oEnd })
        ) {
          return {
            valid: false,
            reason: 'session_conflict',
            message: 'This placement conflicts with another session.',
            conflictData: {
              conflictingPlacement: other,
              conflictingTaskTitle: other.taskTitle,
            },
          };
        }
      }
    }
  }

  // Constraint 5: Daily Capacity Limit
  const dailyCapacityLimit =
    Number(context.dailyCapacityHours) ||
    Number(proposal.summary?.dailyCapacityHours) ||
    DEFAULT_DAILY_CAPACITY_HOURS;

  const existingHoursOnDate = placements
    .filter(
      (p) =>
        p.placementId !== placementId &&
        p.proposedDate === newProposedDate &&
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity'
    )
    .reduce((sum, p) => sum + (Number(p.effectiveHours) || 0), 0);

  const newTotalDailyHours = Math.round((existingHoursOnDate + targetHours) * 10) / 10;

  if (newTotalDailyHours > dailyCapacityLimit + 0.001) {
    return {
      valid: false,
      reason: 'exceeds_daily_capacity',
      message: 'This change would exceed the daily capacity.',
      conflictData: {
        newTotalHours: newTotalDailyHours,
        dailyCapacityLimit,
      },
    };
  }

  // Constraint 6: Deadlines (when enforceDeadlines is requested)
  const taskDeadline = target.originalDueDate || targetTask.dueDate;
  if (context.enforceDeadlines && taskDeadline) {
    if (newProposedDate > taskDeadline) {
      return {
        valid: false,
        reason: 'violates_deadline',
        message: "This placement would violate the task's deadline.",
        conflictData: { deadline: taskDeadline, proposedDate: newProposedDate },
      };
    }
  }

  // Constraint 7: Topological Task Dependencies
  // 7a. Prerequisites must complete on or before target session starts
  const prereqIds = Array.isArray(targetTask.dependencies) ? targetTask.dependencies : [];
  for (const prereqId of prereqIds) {
    const prereqPlacements = placements.filter(
      (p) =>
        p.taskId === prereqId &&
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity' &&
        p.proposedDate !== null
    );

    for (const pp of prereqPlacements) {
      if (pp.proposedDate > newProposedDate) {
        return {
          valid: false,
          reason: 'violates_dependency',
          message: `Dependency violation: "${target.taskTitle}" cannot be scheduled before prerequisite "${pp.taskTitle}".`,
          conflictData: { prerequisite: pp },
        };
      }
      if (pp.proposedDate === newProposedDate && pp.endTime && startMinutes !== null) {
        const ppEnd = parseTimeToMinutes(pp.endTime);
        if (ppEnd !== null && startMinutes < ppEnd) {
          return {
            valid: false,
            reason: 'violates_dependency',
            message: `Dependency violation: "${target.taskTitle}" cannot be scheduled before prerequisite "${pp.taskTitle}".`,
            conflictData: { prerequisite: pp },
          };
        }
      }
    }
  }

  // 7b. Dependents must start on or after target session ends
  for (const t of tasks) {
    if (Array.isArray(t.dependencies) && t.dependencies.includes(target.taskId)) {
      const depPlacements = placements.filter(
        (p) =>
          p.taskId === t.id &&
          p.status !== 'unscheduled' &&
          p.status !== 'blocked_by_dependency' &&
          p.status !== 'oversized_exceeds_capacity' &&
          p.proposedDate !== null
      );

      for (const dp of depPlacements) {
        if (dp.proposedDate < newProposedDate) {
          return {
            valid: false,
            reason: 'violates_dependency',
            message: `Dependency violation: "${target.taskTitle}" cannot be scheduled after dependent task "${dp.taskTitle}".`,
            conflictData: { dependentTask: dp },
          };
        }
        if (dp.proposedDate === newProposedDate && dp.startTime && endMinutes !== null) {
          const dpStart = parseTimeToMinutes(dp.startTime);
          if (dpStart !== null && endMinutes > dpStart) {
            return {
              valid: false,
              reason: 'violates_dependency',
              message: `Dependency violation: "${target.taskTitle}" cannot be scheduled after dependent task "${dp.taskTitle}".`,
              conflictData: { dependentTask: dp },
            };
          }
        }
      }
    }
  }

  // 7c. Sibling chunks of the same parent task must preserve sequential order
  if (target.isChunk || target.chunkIndex !== undefined) {
    const curIdx = target.chunkIndex ?? 0;
    const siblingChunks = placements.filter(
      (p) =>
        p.taskId === target.taskId &&
        p.placementId !== placementId &&
        p.proposedDate !== null &&
        p.status !== 'unscheduled'
    );

    for (const sib of siblingChunks) {
      const sibIdx = sib.chunkIndex ?? 0;
      if (sibIdx < curIdx) {
        // Earlier session must be on or before newProposedDate
        if (sib.proposedDate > newProposedDate) {
          return {
            valid: false,
            reason: 'chunk_order_violation',
            message: `Session ${curIdx + 1} cannot be scheduled before Session ${sibIdx + 1} of the same task.`,
          };
        }
        if (sib.proposedDate === newProposedDate && sib.endTime && startMinutes !== null) {
          const sibEnd = parseTimeToMinutes(sib.endTime);
          if (sibEnd !== null && startMinutes < sibEnd) {
            return {
              valid: false,
              reason: 'chunk_order_violation',
              message: `Session ${curIdx + 1} cannot be scheduled before Session ${sibIdx + 1} of the same task.`,
            };
          }
        }
      } else if (sibIdx > curIdx) {
        // Later session must be on or after newProposedDate
        if (sib.proposedDate < newProposedDate) {
          return {
            valid: false,
            reason: 'chunk_order_violation',
            message: `Session ${curIdx + 1} cannot be scheduled after Session ${sibIdx + 1} of the same task.`,
          };
        }
        if (sib.proposedDate === newProposedDate && sib.startTime && endMinutes !== null) {
          const sibStart = parseTimeToMinutes(sib.startTime);
          if (sibStart !== null && endMinutes > sibStart) {
            return {
              valid: false,
              reason: 'chunk_order_violation',
              message: `Session ${curIdx + 1} cannot be scheduled after Session ${sibIdx + 1} of the same task.`,
            };
          }
        }
      }
    }
  }

  return {
    valid: true,
    details: {
      newProposedDate,
      startMinutes,
      endMinutes,
      startTime: startMinutes !== null ? minutesToTimeString(startMinutes) : null,
      endTime: endMinutes !== null ? minutesToTimeString(endMinutes) : null,
      durationHours: targetHours,
    },
  };
}

/**
 * Recomputes all derived metrics, day allocations, and feasibility summary on a proposal draft.
 *
 * @param {object} proposal Cloned schedule proposal
 * @param {object} [context={}] Context configuration
 * @returns {object} Updated proposal with recalculated summary and allocations
 */
export function recalculateProposalSummary(proposal, context = {}) {
  if (!proposal) return proposal;

  const placements = proposal.proposedPlacements || proposal.placements || [];
  const focusWindows = context.focusWindows || [];

  // Update focus window alignment and explanation for all placements
  for (const p of placements) {
    if (p.proposedDate && p.startTime && p.endTime) {
      const pStart = parseTimeToMinutes(p.startTime);
      const pEnd = parseTimeToMinutes(p.endTime);
      let matchedFocus = null;

      if (pStart !== null && pEnd !== null) {
        for (const fw of focusWindows) {
          const fwStart = parseTimeToMinutes(fw.startTime ?? fw.start);
          const fwEnd = parseTimeToMinutes(fw.endTime ?? fw.end);
          if (
            fwStart !== null &&
            fwEnd !== null &&
            intervalsOverlap({ startMinutes: pStart, endMinutes: pEnd }, { startMinutes: fwStart, endMinutes: fwEnd })
          ) {
            matchedFocus = fw.title || fw.label || 'Focus Window';
            break;
          }
        }
      }

      p.inFocusWindow = Boolean(matchedFocus);
      p.focusWindowLabel = matchedFocus;
    } else {
      p.inFocusWindow = false;
      p.focusWindowLabel = null;
    }

    // Refresh isDateChanged
    if (p.originalDueDate && p.proposedDate) {
      p.isDateChanged = p.proposedDate !== p.originalDueDate;
    }
  }

  // Recalculate day allocations
  const dayAllocations = Array.isArray(proposal.dayAllocations)
    ? [...proposal.dayAllocations]
    : [];

  const existingDatesSet = new Set(dayAllocations.map((d) => d.date));
  for (const p of placements) {
    if (p.proposedDate && !existingDatesSet.has(p.proposedDate)) {
      dayAllocations.push({
        date: p.proposedDate,
        dayOfWeek: new Date(p.proposedDate + 'T12:00:00Z').getUTCDay(),
        isWorkingDay: true,
        capacityHours: Number(context.dailyCapacityHours) || DEFAULT_DAILY_CAPACITY_HOURS,
        totalHours: 0,
        remainingHours: Number(context.dailyCapacityHours) || DEFAULT_DAILY_CAPACITY_HOURS,
        utilizationPercent: 0,
        tasks: [],
      });
      existingDatesSet.add(p.proposedDate);
    }
  }

  for (const day of dayAllocations) {
    const dayPlacements = placements.filter(
      (p) =>
        p.proposedDate === day.date &&
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity'
    );

    const totalHours = Math.round(
      dayPlacements.reduce((sum, p) => sum + (Number(p.effectiveHours) || 0), 0) * 10
    ) / 10;

    day.totalHours = totalHours;
    day.remainingHours = Math.max(0, Math.round((day.capacityHours - totalHours) * 10) / 10);
    day.utilizationPercent =
      day.capacityHours > 0 ? Math.min(100, Math.round((totalHours / day.capacityHours) * 100)) : 0;
    day.tasks = dayPlacements;
  }

  // Workload and summary calculations
  const scheduledWorkloadHours = Math.round(
    dayAllocations.reduce((sum, d) => sum + (d.totalHours || 0), 0) * 10
  ) / 10;

  const totalCapacityHours = Math.round(
    dayAllocations
      .filter((d) => d.isWorkingDay)
      .reduce((sum, d) => sum + (d.capacityHours || 0), 0) * 10
  ) / 10;

  const averageUtilizationPercent =
    totalCapacityHours > 0
      ? Math.min(100, Math.round((scheduledWorkloadHours / totalCapacityHours) * 100))
      : 0;

  const scheduledTaskIds = new Set(
    placements
      .filter(
        (p) =>
          p.status === 'on_time' ||
          p.status === 'deadline_missed' ||
          p.status === 'overdue_at_start'
      )
      .map((p) => p.taskId)
  );

  const scheduledCount = scheduledTaskIds.size;

  const unscheduledCount = new Set(
    placements.filter((p) => p.status === 'unscheduled').map((p) => p.taskId)
  ).size;

  const blockedCount = new Set(
    placements.filter((p) => p.status === 'blocked_by_dependency').map((p) => p.taskId)
  ).size;

  const oversizedCount = new Set(
    placements.filter((p) => p.status === 'oversized_exceeds_capacity').map((p) => p.taskId)
  ).size;

  const partiallyScheduledCount = new Set(
    placements.filter((p) => p.status === 'partially_allocated').map((p) => p.taskId)
  ).size;

  const onTimeCount = new Set(
    placements.filter((p) => p.status === 'on_time').map((p) => p.taskId)
  ).size;

  const missedDeadlineCount = new Set(
    placements.filter((p) => p.status === 'deadline_missed').map((p) => p.taskId)
  ).size;

  const overdueAtStartCount = new Set(
    placements.filter((p) => p.status === 'overdue_at_start').map((p) => p.taskId)
  ).size;

  const totalChunksScheduled = placements.filter(
    (p) => p.proposedDate !== null && (p.isChunk || p.chunkIndex !== undefined)
  ).length;

  const dateChangesCount = new Set(
    placements
      .filter((p) => p.isDateChanged && p.proposedDate !== null)
      .map((p) => p.taskId)
  ).size;

  let feasibilityStatus = 'feasible';
  const cycles = proposal.summary?.cycles || [];
  if (cycles.length > 0 || blockedCount > 0) {
    feasibilityStatus = 'dependency_cycle';
  } else if (oversizedCount > 0 || unscheduledCount > 0 || partiallyScheduledCount > 0) {
    feasibilityStatus = 'capacity_exceeded';
  } else if (missedDeadlineCount > 0 || overdueAtStartCount > 0) {
    feasibilityStatus = 'infeasible_deadlines';
  }

  proposal.dayAllocations = dayAllocations;
  proposal.summary = {
    ...(proposal.summary || {}),
    scheduledCount,
    scheduledTasksCount: scheduledCount,
    totalChunksScheduled,
    partiallyScheduledCount,
    unscheduledCount,
    blockedCount,
    oversizedCount,
    onTimeCount,
    missedDeadlineCount,
    missedDeadlinesCount: missedDeadlineCount,
    overdueAtStartCount,
    dateChangesCount,
    dateShiftsCount: dateChangesCount,
    scheduledWorkloadHours,
    totalCapacityHours,
    averageUtilizationPercent,
    utilizationRatio: averageUtilizationPercent / 100,
    feasibilityStatus,
    feasibility: feasibilityStatus,
  };

  proposal.proposedPlacements = placements;
  proposal.placements = placements;

  return proposal;
}

/**
 * Applies an edit to a placement in a draft proposal, validating constraints
 * and updating all derived summaries and metrics.
 *
 * @param {object} proposal Schedule proposal
 * @param {string} placementId Stable placement identifier
 * @param {object} changes Edit changes { proposedDate, startTime, endTime, durationHours }
 * @param {object} [context={}] Validation and recalculation context
 * @returns {{
 *   success: boolean,
 *   proposal?: object,
 *   error?: object,
 * }}
 */
export function applyPlacementEdit(proposal, placementId, changes = {}, context = {}) {
  // 1. Ensure placement IDs exist
  const ensuredProposal = ensurePlacementIds(proposal);

  // 2. Validate requested edit
  const validation = validatePlacementEdit(ensuredProposal, placementId, changes, context);
  if (!validation.valid) {
    return {
      success: false,
      error: validation,
      proposal: ensuredProposal,
    };
  }

  // 3. Clone draft proposal immutably
  const cloned = JSON.parse(JSON.stringify(ensuredProposal));
  const placements = cloned.proposedPlacements || cloned.placements || [];
  const target = placements.find((p) => p.placementId === placementId);

  if (!target) {
    return {
      success: false,
      error: { valid: false, reason: 'placement_not_found', message: 'Target placement not found.' },
      proposal: cloned,
    };
  }

  // 4. Apply changes
  const details = validation.details || {};
  target.proposedDate = details.newProposedDate;
  target.startTime = details.startTime;
  target.endTime = details.endTime;
  target.startDateTime =
    details.newProposedDate && details.startTime
      ? `${details.newProposedDate}T${details.startTime}`
      : null;
  target.endDateTime =
    details.newProposedDate && details.endTime
      ? `${details.newProposedDate}T${details.endTime}`
      : null;

  if (typeof details.durationHours === 'number') {
    target.effectiveHours = details.durationHours;
  }

  if (details.newProposedDate === null) {
    target.status = 'unscheduled';
    target.placementStatus = 'unscheduled';
    target.isDateChanged = false;
    target.explanation = 'Unscheduled manually';
  } else {
    // Check status relative to originalDueDate
    if (target.originalDueDate) {
      if (details.newProposedDate <= target.originalDueDate) {
        target.status = 'on_time';
        target.placementStatus = 'on_time';
        target.explanation = `Manual placement • Fits before deadline (${target.originalDueDate})`;
      } else {
        const delayDays = Math.round(
          (parseDateISO(details.newProposedDate) - parseDateISO(target.originalDueDate)) / 86400000
        );
        target.status = 'deadline_missed';
        target.placementStatus = 'deadline_missed';
        target.explanation = `Manual placement • Pushed ${delayDays}d past deadline (${target.originalDueDate})`;
      }
      target.isDateChanged = details.newProposedDate !== target.originalDueDate;
    } else {
      target.status = 'on_time';
      target.placementStatus = 'on_time';
      target.isDateChanged = false;
      target.explanation = 'Manual placement • Scheduled in available capacity';
    }
  }

  // 5. Recalculate derived proposal metrics
  const updatedProposal = recalculateProposalSummary(cloned, context);

  return {
    success: true,
    proposal: updatedProposal,
  };
}

/**
 * Validates the entire proposal immediately before acceptance to ensure no blocking
 * hard constraint violations remain.
 *
 * @param {object} proposal Complete schedule proposal draft
 * @param {object} [context={}] Context options
 * @returns {{
 *   valid: boolean,
 *   errors: Array<object>,
 * }}
 */
export function validateFullProposal(proposal, context = {}) {
  if (!proposal) {
    return { valid: false, errors: [{ message: 'No proposal to validate.' }] };
  }

  const placements = proposal.proposedPlacements || proposal.placements || [];
  const errors = [];
  const dailyCapacityLimit =
    Number(context.dailyCapacityHours) ||
    Number(proposal.summary?.dailyCapacityHours) ||
    DEFAULT_DAILY_CAPACITY_HOURS;

  // 1. Check daily capacity across all dates
  const hoursByDate = new Map();
  for (const p of placements) {
    if (
      p.proposedDate &&
      p.status !== 'unscheduled' &&
      p.status !== 'blocked_by_dependency' &&
      p.status !== 'oversized_exceeds_capacity'
    ) {
      const cur = hoursByDate.get(p.proposedDate) || 0;
      hoursByDate.set(p.proposedDate, cur + (Number(p.effectiveHours) || 0));
    }
  }

  for (const [date, totalH] of hoursByDate.entries()) {
    if (totalH > dailyCapacityLimit + 0.001) {
      errors.push({
        type: 'capacity_exceeded',
        date,
        message: `Date ${date} exceeds daily capacity limit (${totalH.toFixed(1)}h / ${dailyCapacityLimit.toFixed(1)}h).`,
      });
    }
  }

  // 2. Check session conflicts on each date
  const enableIntraday = context.enableIntraday ?? proposal.summary?.enableIntraday ?? true;
  if (enableIntraday) {
    const sessionsByDate = new Map();
    for (const p of placements) {
      if (
        p.proposedDate &&
        p.startTime &&
        p.endTime &&
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity'
      ) {
        const list = sessionsByDate.get(p.proposedDate) || [];
        list.push(p);
        sessionsByDate.set(p.proposedDate, list);
      }
    }

    for (const [date, list] of sessionsByDate.entries()) {
      for (let i = 0; i < list.length; i++) {
        const sA = list[i];
        const aStart = parseTimeToMinutes(sA.startTime);
        const aEnd = parseTimeToMinutes(sA.endTime);
        if (aStart === null || aEnd === null) continue;

        for (let j = i + 1; j < list.length; j++) {
          const sB = list[j];
          const bStart = parseTimeToMinutes(sB.startTime);
          const bEnd = parseTimeToMinutes(sB.endTime);
          if (bStart === null || bEnd === null) continue;

          if (intervalsOverlap({ startMinutes: aStart, endMinutes: aEnd }, { startMinutes: bStart, endMinutes: bEnd })) {
            errors.push({
              type: 'session_conflict',
              date,
              message: `Placement conflict between "${sA.taskTitle}" and "${sB.taskTitle}" on ${date}.`,
            });
          }
        }
      }
    }
  }

  // 3. Check topological dependencies
  const tasks = context.tasks || [];
  for (const t of tasks) {
    const prereqIds = Array.isArray(t.dependencies) ? t.dependencies : [];
    const tPlacements = placements.filter(
      (p) =>
        p.taskId === t.id &&
        p.proposedDate !== null &&
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency'
    );

    for (const prereqId of prereqIds) {
      const pPlacements = placements.filter(
        (p) =>
          p.taskId === prereqId &&
          p.proposedDate !== null &&
          p.status !== 'unscheduled' &&
          p.status !== 'blocked_by_dependency'
      );

      for (const tp of tPlacements) {
        for (const pp of pPlacements) {
          if (pp.proposedDate > tp.proposedDate) {
            errors.push({
              type: 'dependency_violation',
              message: `Dependency violation: "${tp.taskTitle}" is scheduled before prerequisite "${pp.taskTitle}".`,
            });
          } else if (pp.proposedDate === tp.proposedDate && pp.endTime && tp.startTime) {
            const ppEnd = parseTimeToMinutes(pp.endTime);
            const tpStart = parseTimeToMinutes(tp.startTime);
            if (ppEnd !== null && tpStart !== null && tpStart < ppEnd) {
              errors.push({
                type: 'dependency_violation',
                message: `Dependency violation: "${tp.taskTitle}" starts before prerequisite "${pp.taskTitle}" completes.`,
              });
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates an interactive editing session managing draft isolation, undo stack,
 * and revert capabilities.
 *
 * @param {object} initialProposal The freshly generated adaptive schedule proposal
 * @param {object} [context={}] Scheduling context options
 * @returns {object} Interactive proposal editing session
 */
export function createProposalEditSession(initialProposal, context = {}) {
  const normalizedInitial = ensurePlacementIds(JSON.parse(JSON.stringify(initialProposal || {})));
  let currentDraft = JSON.parse(JSON.stringify(normalizedInitial));
  const undoStack = [];
  const editHistory = [];

  return {
    getDraft() {
      return currentDraft;
    },
    getInitial() {
      return normalizedInitial;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRevert() {
      return editHistory.length > 0;
    },
    applyEdit(placementId, changes) {
      const result = applyPlacementEdit(currentDraft, placementId, changes, context);
      if (!result.success) {
        return result;
      }
      undoStack.push(JSON.parse(JSON.stringify(currentDraft)));
      currentDraft = result.proposal;
      editHistory.push({ placementId, changes, timestamp: Date.now() });
      return { success: true, proposal: currentDraft };
    },
    undo() {
      if (undoStack.length === 0) {
        return { success: false, reason: 'no_undo_available', proposal: currentDraft };
      }
      currentDraft = undoStack.pop();
      editHistory.pop();
      return { success: true, proposal: currentDraft };
    },
    revert() {
      currentDraft = JSON.parse(JSON.stringify(normalizedInitial));
      undoStack.length = 0;
      editHistory.length = 0;
      return { success: true, proposal: currentDraft };
    },
    validate() {
      return validateFullProposal(currentDraft, context);
    },
    isModified() {
      return editHistory.length > 0;
    },
  };
}
