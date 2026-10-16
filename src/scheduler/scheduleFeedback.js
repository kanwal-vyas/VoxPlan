/**
 * VoxPlan Schedule Feedback Integrity & Attribution Engine (Phase 4, Stage 6).
 * 
 * Computes transparent, local-first feedback metrics from durable telemetry events
 * to evaluate the real-world usefulness of schedule proposals.
 * 
 * Attribution & Integrity Rules:
 * 1. Proposal Identity: Every proposal decision is keyed by a unique schedule_id.
 *    Duplicate generation, acceptance, or discard events are deduplicated.
 * 2. Interval-Based Multi-Proposal Attribution:
 *    When a task appears across multiple accepted proposals, each placement is assigned
 *    a distinct active time window [T_accepted, T_superseded). Events are strictly
 *    matched to the proposal actively governing the task at that exact timestamp.
 * 3. Subsequent Manual Override Linking:
 *    A task_rescheduled event is linked as an override only if it occurs within the active
 *    placement window, has reason !== 'adaptive_scheduler', and new_due_date !== proposed_date.
 * 4. Completion Timeliness & Lifecycle Safeguards:
 *    - Reopened tasks with no subsequent completion are marked incomplete and excluded.
 *    - Tasks currently open in the task backlog are excluded from completed outcomes.
 *    - Tasks manually rescheduled before completion are categorized as 'overridden_prior_to_completion'
 *      and excluded from scheduler-attributed completion rates to avoid crediting/penalizing the algorithm
 *      for user manual interventions.
 *    - Repeated completions within a single proposal window evaluate only the final valid completion.
 * 5. Denominator Integrity:
 *    - Acceptance Rate: uniqueAccepted / (uniqueAccepted + uniqueDiscarded). Pending proposals excluded.
 *    - Task Override Rate: uniqueOverriddenTasks / uniquePlacedTasks (tasks not double-counted across proposals).
 *    - Proposal Override Rate: acceptedProposalsWithOverrides / uniqueAcceptedProposals.
 *    - On-Time Completion Rate: completedOnTime / eligibleCompletedUnaltered.
 *    - Never fills missing data with zero. Enforces strict insufficient-data tiers (< 3 observations).
 * 6. Governance Boundary:
 *    - Descriptive and measurement only. Never modifies scheduler weights or rules.
 */

/**
 * Parses an ISO date string (YYYY-MM-DD or full ISO) to local midnight Date.
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
 * Computes schedule feedback metrics with robust multi-proposal attribution,
 * lifecycle integrity, and defensive deduplication.
 * 
 * @param {Array<Object>} events - All telemetry events for the current profile.
 * @param {Array<Object>} [tasks=[]] - Current active/completed tasks (for cross-checking open state).
 * @returns {Object} Structured feedback evaluation report with diagnostics.
 */
export function computeScheduleFeedback(events = [], tasks = []) {
  // Sort events chronologically to guarantee correct sequence analysis
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Diagnostic tracking
  const diagnostics = {
    duplicateEventsFiltered: 0,
    conflictingProposalsCount: 0,
    malformedEventsCount: 0,
    exclusionsByReason: {
      overridden_prior_to_completion: 0,
      reopened_incomplete_lifecycle: 0,
      missing_applicable_deadline: 0,
      invalid_deadline_format: 0,
      task_currently_open: 0,
      missing_proposal_identity: 0,
      conflicting_proposal_decision: 0,
      missing_task_id_in_placement: 0,
    },
    exclusionDetails: [],
  };

  function addExclusion(record) {
    diagnostics.exclusionDetails.push(record);
    if (diagnostics.exclusionsByReason[record.reason] !== undefined) {
      diagnostics.exclusionsByReason[record.reason]++;
    }
  }

  // 1. Deduplicate & categorize proposal lifecycle events
  const generatedMap = new Map(); // scheduleId -> event
  const acceptedMap = new Map();  // scheduleId -> event
  const discardedMap = new Map(); // scheduleId -> event

  for (const ev of sortedEvents) {
    if (
      ev.event_type !== 'schedule_proposal_generated' &&
      ev.event_type !== 'schedule_proposal_accepted' &&
      ev.event_type !== 'schedule_proposal_discarded'
    ) {
      continue;
    }

    const scheduleId = ev.payload?.schedule_id;
    if (!scheduleId || typeof scheduleId !== 'string' || !scheduleId.trim()) {
      diagnostics.malformedEventsCount++;
      addExclusion({
        eventId: ev.event_id,
        eventType: ev.event_type,
        reason: 'missing_proposal_identity',
        timestamp: ev.timestamp,
      });
      continue;
    }

    if (ev.event_type === 'schedule_proposal_generated') {
      if (!generatedMap.has(scheduleId)) {
        generatedMap.set(scheduleId, ev);
      } else {
        diagnostics.duplicateEventsFiltered++;
      }
    } else if (ev.event_type === 'schedule_proposal_accepted') {
      if (!acceptedMap.has(scheduleId)) {
        acceptedMap.set(scheduleId, ev);
      } else {
        diagnostics.duplicateEventsFiltered++;
      }
    } else if (ev.event_type === 'schedule_proposal_discarded') {
      if (!discardedMap.has(scheduleId)) {
        discardedMap.set(scheduleId, ev);
      } else {
        diagnostics.duplicateEventsFiltered++;
      }
    }
  }

  // Identify and isolate conflicting proposal decisions (accepted AND discarded)
  const validAccepted = [];
  const validDiscarded = [];
  const conflictingScheduleIds = new Set();

  for (const [scheduleId, ev] of acceptedMap.entries()) {
    if (discardedMap.has(scheduleId)) {
      conflictingScheduleIds.add(scheduleId);
      diagnostics.conflictingProposalsCount++;
      addExclusion({
        scheduleId,
        reason: 'conflicting_proposal_decision',
        timestamp: ev.timestamp,
      });
    } else {
      validAccepted.push(ev);
    }
  }

  for (const [scheduleId, ev] of discardedMap.entries()) {
    if (!conflictingScheduleIds.has(scheduleId)) {
      validDiscarded.push(ev);
    }
  }

  const generatedCount = generatedMap.size;
  const acceptedCount = validAccepted.length;
  const discardedCount = validDiscarded.length;
  const decidedCount = acceptedCount + discardedCount;
  const pendingCount = Math.max(0, generatedCount - decidedCount);

  // Acceptance rate with explicit decided denominator
  const acceptanceRate = decidedCount > 0 ? acceptedCount / decidedCount : null;

  // 2. Build Chronological Task Placement Intervals
  // For each task, track an array of placement intervals:
  // [{ scheduleId, acceptedAt, windowEnd, taskId, proposedDate, originalDueDate }]
  const taskPlacementIntervals = new Map(); // taskId -> Array<Interval>
  const acceptedProposalDetails = [];
  const allUniquePlacedTaskIds = new Set();

  for (const accEv of validAccepted) {
    const p = accEv.payload || {};
    const scheduleId = p.schedule_id;
    const acceptedAt = new Date(accEv.timestamp);
    const placements = Array.isArray(p.applied_placements) ? p.applied_placements : [];

    acceptedProposalDetails.push({
      scheduleId,
      acceptedAt: accEv.timestamp,
      tasksChangedCount: p.tasks_changed_count || placements.length,
      totalTasksCount: p.total_tasks_count || placements.length,
      placements,
    });

    for (const pl of placements) {
      const taskId = pl.task_id || pl.taskId;
      const proposedDate = pl.proposed_date || pl.proposedDate;
      const originalDueDate = pl.original_due_date || pl.originalDueDate || null;

      if (!taskId) {
        addExclusion({
          scheduleId,
          reason: 'missing_task_id_in_placement',
          timestamp: accEv.timestamp,
        });
        continue;
      }

      allUniquePlacedTaskIds.add(taskId);

      if (!taskPlacementIntervals.has(taskId)) {
        taskPlacementIntervals.set(taskId, []);
      }

      const intervals = taskPlacementIntervals.get(taskId);
      // If there was a previous accepted proposal placing this task, close its active window
      if (intervals.length > 0) {
        intervals[intervals.length - 1].windowEnd = acceptedAt;
      }

      intervals.push({
        scheduleId,
        acceptedAt,
        windowEnd: null, // Open until superseded by next accepted proposal
        taskId,
        proposedDate,
        originalDueDate,
      });
    }
  }

  // 3. Process Task Events against Specific Active Placement Windows
  // Each task event belongs strictly to the interval where acceptedAt < eventTime < windowEnd
  const taskOverrides = [];
  const completedPlacements = [];

  // Group task lifecycle events for rapid interval querying
  const eventsByTask = new Map();
  for (const ev of sortedEvents) {
    if (!ev.task_id) continue;
    if (!eventsByTask.has(ev.task_id)) {
      eventsByTask.set(ev.task_id, []);
    }
    eventsByTask.get(ev.task_id).push(ev);
  }

  // Analyze each placement interval independently
  for (const [taskId, intervals] of taskPlacementIntervals.entries()) {
    const taskEvents = eventsByTask.get(taskId) || [];

    for (const interval of intervals) {
      const { scheduleId, acceptedAt, windowEnd, proposedDate } = interval;

      // Filter events occurring strictly in this interval
      const intervalEvents = taskEvents.filter((ev) => {
        const t = new Date(ev.timestamp);
        if (t <= acceptedAt) return false;
        if (windowEnd !== null && t >= windowEnd) return false;
        return true;
      });

      // Track overrides within this specific interval
      let isOverriddenInInterval = false;
      let latestOverrideTime = null;

      for (const ev of intervalEvents) {
        if (ev.event_type === 'task_rescheduled') {
          const p = ev.payload || {};
          const newDueDate = p.new_due_date || p.newDueDate;
          const reason = p.reason;

          // Ignore scheduler's automated application
          if (reason === 'adaptive_scheduler') continue;

          if (newDueDate && newDueDate !== proposedDate) {
            const shiftDays = dayDiff(proposedDate, newDueDate);
            const overrideRecord = {
              taskId,
              scheduleId,
              proposedDate,
              overriddenDate: newDueDate,
              shiftDays,
              shiftDirection: shiftDays > 0 ? 'postponed' : shiftDays < 0 ? 'advanced' : 'same_day',
              timestamp: ev.timestamp,
              overriddenAt: ev.timestamp,
            };
            taskOverrides.push(overrideRecord);
            isOverriddenInInterval = true;
            latestOverrideTime = new Date(ev.timestamp);
          }
        }
      }

      // Track completion outcomes within this specific interval
      const completionEvents = intervalEvents.filter((ev) => ev.event_type === 'task_completed');
      const reopenEvents = intervalEvents.filter((ev) => ev.event_type === 'task_reopened');

      if (completionEvents.length > 0) {
        // Take the latest completion event in this window
        const latestCompletion = completionEvents[completionEvents.length - 1];
        const latestCompletionTime = new Date(latestCompletion.timestamp);

        // Check if task was reopened after this completion within the interval
        const hasSubsequentReopen = reopenEvents.some(
          (re) => new Date(re.timestamp) > latestCompletionTime
        );

        if (hasSubsequentReopen) {
          // Reopened task with incomplete lifecycle in this interval
          addExclusion({
            taskId,
            scheduleId,
            reason: 'reopened_incomplete_lifecycle',
            completedAt: latestCompletion.timestamp,
          });
          continue;
        }

        // Cross-check with active backlog state (if tasks array is provided)
        const activeTaskMeta = tasks.find((t) => t.id === taskId);
        if (activeTaskMeta && activeTaskMeta.completed === false) {
          addExclusion({
            taskId,
            scheduleId,
            reason: 'task_currently_open',
            completedAt: latestCompletion.timestamp,
          });
          continue;
        }

        // Validate applicable deadline
        const applicableDeadline = proposedDate || (activeTaskMeta && (activeTaskMeta.dueDate || activeTaskMeta.due_date));
        if (!applicableDeadline) {
          addExclusion({
            taskId,
            scheduleId,
            reason: 'missing_applicable_deadline',
            completedAt: latestCompletion.timestamp,
          });
          continue;
        }

        const deadlineDate = parseDateToMidnight(applicableDeadline);
        if (!deadlineDate) {
          addExclusion({
            taskId,
            scheduleId,
            reason: 'invalid_deadline_format',
            completedAt: latestCompletion.timestamp,
          });
          continue;
        }

        // Was task overridden prior to completion?
        const wasOverriddenPrior = isOverriddenInInterval && latestOverrideTime && latestOverrideTime < latestCompletionTime;

        // End of due date (23:59:59.999 local time)
        const deadlineEndOfDay = new Date(deadlineDate.getTime() + 86400000 - 1);
        const isOnTime = latestCompletionTime.getTime() <= deadlineEndOfDay.getTime();

        const outcome = {
          taskId,
          scheduleId,
          proposedDate,
          completedAt: latestCompletion.timestamp,
          isOnTime,
          wasOverriddenBeforeCompletion: Boolean(wasOverriddenPrior),
        };

        if (wasOverriddenPrior) {
          // Exclude from algorithm on-time rate to prevent attributing manual user shifts to the scheduler
          addExclusion({
            ...outcome,
            reason: 'overridden_prior_to_completion',
          });
        } else {
          // Pure, reliable outcome attributed directly to this accepted proposal
          completedPlacements.push(outcome);
        }
      }
    }
  }

  // 4. Compute Aggregate Metrics with Strict Denominators
  // Unique accepted proposals that experienced at least one manual override
  const overriddenScheduleIds = new Set(taskOverrides.map((o) => o.scheduleId));
  const acceptedProposalsWithOverridesCount = overriddenScheduleIds.size;
  const proposalOverrideRate = acceptedCount > 0
    ? acceptedProposalsWithOverridesCount / acceptedCount
    : null;

  // Task-level override statistics (unique tasks, not duplicate placements)
  const totalUniquePlacedTasksCount = allUniquePlacedTaskIds.size;
  const uniqueOverriddenTasksCount = new Set(taskOverrides.map((o) => o.taskId)).size;
  const taskOverrideRate = totalUniquePlacedTasksCount > 0
    ? uniqueOverriddenTasksCount / totalUniquePlacedTasksCount
    : null;

  // Completion timeliness on unaltered scheduled tasks
  const eligibleCompletedCount = completedPlacements.length;
  const completedOnTimeCount = completedPlacements.filter((o) => o.isOnTime).length;
  const onTimeCompletionRate = eligibleCompletedCount > 0
    ? completedOnTimeCount / eligibleCompletedCount
    : null;

  // Directional shifts in manual overrides
  const postponedOverridesCount = taskOverrides.filter((o) => o.shiftDirection === 'postponed').length;
  const advancedOverridesCount = taskOverrides.filter((o) => o.shiftDirection === 'advanced').length;
  const sameDayOverridesCount = taskOverrides.filter((o) => o.shiftDirection === 'same_day').length;

  // Data sufficiency check (minimum 3 decided proposals or 3 completed scheduled tasks)
  const isSufficientData = decidedCount >= 3 && (acceptedCount === 0 || eligibleCompletedCount >= 3 || uniqueOverriddenTasksCount >= 3);

  const finalDiagnostics = {
    ...diagnostics,
    totalExcludedObservations: diagnostics.exclusionDetails.length,
    excludedAmbiguousCount: diagnostics.exclusionDetails.length,
    reopenedIncompleteCount:
      (diagnostics.exclusionsByReason.reopened_incomplete_lifecycle || 0) +
      (diagnostics.exclusionsByReason.task_currently_open || 0),
    conflictingDecisionsCount: conflictingScheduleIds.size,
    conflictingProposalDecisions: Array.from(conflictingScheduleIds),
    overriddenPriorToCompletionCount: diagnostics.exclusionsByReason.overridden_prior_to_completion || 0,
    missingProposalIdentityCount: diagnostics.malformedEventsCount || 0,
  };

  return {
    summary: {
      generatedCount,
      acceptedCount,
      discardedCount,
      decidedCount,
      pendingCount,
      acceptanceRate,
      proposalOverrideRate,
      taskOverrideRate,
      totalPlacedTasksCount: totalUniquePlacedTasksCount,
      totalUniquePlacedTasksCount,
      uniqueOverriddenTasksCount,
      eligibleCompletedCount,
      completedOnTimeCount,
      onTimeCompletionRate,
      excludedAmbiguousCount: diagnostics.exclusionDetails.length,
      postponedOverridesCount,
      advancedOverridesCount,
      sameDayOverridesCount,
      isSufficientData,
    },
    proposals: {
      generated: Array.from(generatedMap.values()),
      accepted: acceptedProposalDetails,
      discarded: validDiscarded,
      conflictingCount: diagnostics.conflictingProposalsCount,
    },
    overrides: {
      totalOverrideEvents: taskOverrides.length,
      uniqueTasksOverridden: uniqueOverriddenTasksCount,
      details: taskOverrides,
      shiftSummary: {
        postponed: postponedOverridesCount,
        advanced: advancedOverridesCount,
        sameDay: sameDayOverridesCount,
      },
    },
    completionOutcomes: {
      reliableObservations: completedPlacements,
      excludedObservations: diagnostics.exclusionDetails,
    },
    diagnostics: finalDiagnostics,
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
