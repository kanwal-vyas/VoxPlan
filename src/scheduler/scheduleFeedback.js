/**
 * VoxPlan Schedule Feedback & Outcome Tracking.
 * 
 * Computes transparent, local-first feedback metrics from durable telemetry events
 * to evaluate the real-world usefulness of schedule proposals.
 * 
 * Strict boundary:
 * - This module performs measurement and descriptive analysis only.
 * - It NEVER automatically modifies scheduler weights, retraining pipelines, or rules.
 * - Maintains explicit separation between:
 *     1. Proposal Acceptance Rate (willingness to adopt)
 *     2. Manual Override Rate (adjustments after adoption)
 *     3. Task Completion Timeliness (execution against accepted dates)
 */

/**
 * Parses an ISO date string (YYYY-MM-DD or full ISO) to local midnight Date or timestamp.
 * Returns null if invalid.
 */
function parseDateToMidnight(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(year, month, day, 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Computes calendar day difference (dateB - dateA) in days.
 */
function dayDiff(dateStrA, dateStrB) {
  const a = parseDateToMidnight(dateStrA);
  const b = parseDateToMidnight(dateStrB);
  if (!a || !b) return null;
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Computes schedule feedback metrics from chronological telemetry events and current tasks.
 * 
 * @param {Array<Object>} events - All telemetry events for the current profile.
 * @param {Array<Object>} [tasks=[]] - Current active/completed tasks (for cross-checking deadlines).
 * @returns {Object} Structured feedback evaluation report.
 */
export function computeScheduleFeedback(events = [], tasks = []) {
  // Sort events chronologically to guarantee correct sequence analysis
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const generatedProposals = [];
  const acceptedProposals = [];
  const discardedProposals = [];

  // Group proposal events
  for (const ev of sortedEvents) {
    if (ev.event_type === 'schedule_proposal_generated') {
      generatedProposals.push(ev);
    } else if (ev.event_type === 'schedule_proposal_accepted') {
      acceptedProposals.push(ev);
    } else if (ev.event_type === 'schedule_proposal_discarded') {
      discardedProposals.push(ev);
    }
  }

  const generatedCount = generatedProposals.length;
  const acceptedCount = acceptedProposals.length;
  const discardedCount = discardedProposals.length;
  const decidedCount = acceptedCount + discardedCount;

  // Acceptance rate calculation with explicit denominator
  const acceptanceRate = decidedCount > 0 ? acceptedCount / decidedCount : null;

  // Track applied task placements across all accepted proposals
  // Key: taskId, Value: { scheduleId, acceptedAt, proposedDate, originalDueDate }
  // We keep the most recent accepted proposal for each task
  const activePlacements = new Map();
  // Also track all historical accepted proposals with their placements
  const acceptedProposalDetails = [];

  for (const accEv of acceptedProposals) {
    const p = accEv.payload || {};
    const scheduleId = p.schedule_id;
    const acceptedAt = new Date(accEv.timestamp);
    const placements = Array.isArray(p.applied_placements) ? p.applied_placements : [];

    acceptedProposalDetails.push({
      scheduleId,
      acceptedAt: accEv.timestamp,
      tasksChangedCount: p.tasks_changed_count || 0,
      totalTasksCount: p.total_tasks_count || 0,
      placements,
    });

    for (const pl of placements) {
      if (pl.task_id) {
        activePlacements.set(pl.task_id, {
          scheduleId,
          acceptedAt,
          proposedDate: pl.proposed_date,
          originalDueDate: pl.original_due_date || null,
        });
      }
    }
  }

  // Track overrides and completion outcomes for accepted placements
  // An override is a task_rescheduled event occurring after proposal acceptance,
  // where the new_due_date differs from the proposed_date and reason is not 'adaptive_scheduler'.
  const taskOverrides = [];
  const completedPlacements = [];
  const excludedAmbiguousOutcomes = [];

  // Map to track if a task was overridden after its accepted proposal
  const taskOverrideState = new Map(); // taskId -> { overridden: boolean, overrideEvent, shiftDays }

  for (const ev of sortedEvents) {
    const taskId = ev.task_id;
    if (!taskId || !activePlacements.has(taskId)) continue;

    const placement = activePlacements.get(taskId);
    const eventTime = new Date(ev.timestamp);

    // Event must happen after proposal acceptance
    if (eventTime <= placement.acceptedAt) continue;

    if (ev.event_type === 'task_rescheduled') {
      const p = ev.payload || {};
      const newDueDate = p.new_due_date;
      const reason = p.reason;

      // Ignore scheduler applying its own placement
      if (reason === 'adaptive_scheduler') continue;

      if (newDueDate && newDueDate !== placement.proposedDate) {
        const shiftDays = dayDiff(placement.proposedDate, newDueDate);
        const overrideRecord = {
          taskId,
          scheduleId: placement.scheduleId,
          proposedDate: placement.proposedDate,
          overriddenDate: newDueDate,
          shiftDays,
          shiftDirection: shiftDays > 0 ? 'postponed' : shiftDays < 0 ? 'advanced' : 'same_day',
          timestamp: ev.timestamp,
        };
        taskOverrides.push(overrideRecord);
        taskOverrideState.set(taskId, { overridden: true, overrideRecord });
      }
    } else if (ev.event_type === 'task_completed') {
      // Task was completed. Check if it was preceded by an override
      const overrideInfo = taskOverrideState.get(taskId);
      const isOverridden = !!(overrideInfo && overrideInfo.overridden);

      // Find applicable task metadata from active/completed tasks list
      const taskMeta = tasks.find(t => t.id === taskId);
      const applicableDeadline = placement.proposedDate || (taskMeta && taskMeta.due_date);

      if (!applicableDeadline) {
        // Missing clear deadline to evaluate timeliness
        excludedAmbiguousOutcomes.push({
          taskId,
          reason: 'missing_applicable_deadline',
          completedAt: ev.timestamp,
        });
        continue;
      }

      // Check if completed on or before the proposed date
      // A task due on YYYY-MM-DD is on time if completed before or on the end of that day (23:59:59.999)
      const deadlineDate = parseDateToMidnight(applicableDeadline);
      if (!deadlineDate) {
        excludedAmbiguousOutcomes.push({
          taskId,
          reason: 'invalid_deadline_format',
          completedAt: ev.timestamp,
        });
        continue;
      }

      // End of due date in local time
      const deadlineEndOfDay = new Date(deadlineDate.getTime() + 86400000 - 1);
      const isOnTime = eventTime.getTime() <= deadlineEndOfDay.getTime();

      const outcome = {
        taskId,
        scheduleId: placement.scheduleId,
        proposedDate: placement.proposedDate,
        completedAt: ev.timestamp,
        isOnTime,
        wasOverriddenBeforeCompletion: isOverridden,
      };

      if (isOverridden) {
        // If the task was rescheduled manually before completion,
        // its completion cannot be attributed solely to the scheduler proposal.
        excludedAmbiguousOutcomes.push({
          ...outcome,
          reason: 'overridden_prior_to_completion',
        });
      } else {
        // Pure, reliable outcome attributed directly to accepted schedule
        completedPlacements.push(outcome);
      }
    }
  }

  // Unique accepted proposals that experienced at least one manual override
  const overriddenScheduleIds = new Set(taskOverrides.map(o => o.scheduleId));
  const acceptedProposalsWithOverridesCount = overriddenScheduleIds.size;
  const proposalOverrideRate = acceptedCount > 0
    ? acceptedProposalsWithOverridesCount / acceptedCount
    : null;

  // Task-level override statistics
  const totalPlacedTasksCount = activePlacements.size;
  const uniqueOverriddenTasksCount = new Set(taskOverrides.map(o => o.taskId)).size;
  const taskOverrideRate = totalPlacedTasksCount > 0
    ? uniqueOverriddenTasksCount / totalPlacedTasksCount
    : null;

  // Completion timeliness on unaltered scheduled tasks
  const eligibleCompletedCount = completedPlacements.length;
  const completedOnTimeCount = completedPlacements.filter(o => o.isOnTime).length;
  const onTimeCompletionRate = eligibleCompletedCount > 0
    ? completedOnTimeCount / eligibleCompletedCount
    : null;

  // Directional shifts in manual overrides
  const postponedOverridesCount = taskOverrides.filter(o => o.shiftDirection === 'postponed').length;
  const advancedOverridesCount = taskOverrides.filter(o => o.shiftDirection === 'advanced').length;

  // Data sufficiency check (minimum 3 decided proposals or 3 completed scheduled tasks)
  const isSufficientData = decidedCount >= 3 && (acceptedCount === 0 || eligibleCompletedCount >= 3 || uniqueOverriddenTasksCount >= 3);

  return {
    summary: {
      generatedCount,
      acceptedCount,
      discardedCount,
      decidedCount,
      acceptanceRate,
      proposalOverrideRate,
      taskOverrideRate,
      totalPlacedTasksCount,
      uniqueOverriddenTasksCount,
      eligibleCompletedCount,
      completedOnTimeCount,
      onTimeCompletionRate,
      excludedAmbiguousCount: excludedAmbiguousOutcomes.length,
      postponedOverridesCount,
      advancedOverridesCount,
      isSufficientData,
    },
    proposals: {
      generated: generatedProposals,
      accepted: acceptedProposalDetails,
      discarded: discardedProposals,
    },
    overrides: {
      totalOverrideEvents: taskOverrides.length,
      uniqueTasksOverridden: uniqueOverriddenTasksCount,
      details: taskOverrides,
      shiftSummary: {
        postponed: postponedOverridesCount,
        advanced: advancedOverridesCount,
      },
    },
    completionOutcomes: {
      reliableObservations: completedPlacements,
      excludedObservations: excludedAmbiguousOutcomes,
    },
    cautiousLearningBoundary: {
      status: 'active_measurement_only',
      automaticTuningEnabled: false,
      reason: 'VoxPlan does not alter scheduling weights or heuristics from sparse telemetry. Controlled empirical evidence across multiple independent tasks is required before proposing bounded parameter updates.',
    },
    conceptDistinctions: {
      acceptanceRateNote: 'Acceptance Rate measures user adoption of proposals at creation time, not schedule quality.',
      overrideRateNote: 'Manual overrides reflect evolving user needs, interruptions, or inaccurate initial assumptions; they do not always imply poor scheduling.',
      completionRateNote: 'Timeliness is measured strictly on completed tasks that were NOT manually rescheduled after proposal acceptance.',
    },
  };
}
