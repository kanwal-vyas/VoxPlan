/**
 * VoxPlan Shadow Scheduler Evaluator (Phase 7, Stage 3).
 *
 * Runs isolated, non-mutating comparative evaluations between the production
 * factory baseline schedule and candidate-weight schedules.
 *
 * Safety & Isolation Invariants:
 * 1. Shadow Evaluation Only: Never writes to production task due dates or persists proposals.
 * 2. Identical Inputs: Both baseline and candidate runs evaluate identical task collections,
 *    calendar horizons, daily capacities, and dependency graphs.
 * 3. Regression Gate: Strictly verifies that candidate weights do not introduce cycle violations,
 *    increase infeasible placements, or degrade schedule feasibility.
 * 4. Honest Evidence Gating: When real-user verified completions are insufficient (< 15),
 *    the outcome is strictly reported as `not_evaluable_insufficient_real_evidence` rather than
 *    claiming proven personal optimization.
 */

import {
  generateAdaptiveSchedule,
  FACTORY_SCHEDULER_WEIGHTS,
  parseDateISO,
} from './adaptiveScheduler.js';

/**
 * Computes calendar day difference (dateB - dateA) in days.
 */
function dayDifference(dateStrA, dateStrB) {
  const a = parseDateISO(dateStrA);
  const b = parseDateISO(dateStrB);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 3600 * 24));
}

/**
 * Extracts standard schedule quality metrics from a schedule output.
 */
function extractScheduleMetrics(scheduleResult) {
  const placements = scheduleResult?.placements || [];
  const summary = scheduleResult?.summary || {};
  const dayAllocations = scheduleResult?.dayAllocations || [];

  let onTimeTasksCount = 0;
  let delayedTasksCount = 0;
  let totalDelayDays = 0;
  let infeasiblePlacementsCount = 0;

  for (const pl of placements) {
    if (pl.status === 'blocked_by_dependency' || pl.status === 'oversized_exceeds_capacity') {
      infeasiblePlacementsCount++;
      continue;
    }

    if (pl.proposedDate && pl.originalDueDate) {
      const diff = dayDifference(pl.originalDueDate, pl.proposedDate);
      if (diff > 0) {
        delayedTasksCount++;
        totalDelayDays += diff;
      } else {
        onTimeTasksCount++;
      }
    } else if (pl.proposedDate) {
      onTimeTasksCount++; // Tasks without original deadline placed successfully
    }
  }

  // Calculate average daily capacity utilization across active working days
  let totalCapacity = 0;
  let totalAllocated = 0;
  for (const day of dayAllocations) {
    if (day.isWorkingDay && day.capacityHours > 0) {
      totalCapacity += day.capacityHours;
      totalAllocated += (day.capacityHours - (day.remainingHours || 0));
    }
  }
  const capacityUtilizationPct = totalCapacity > 0
    ? Math.round((totalAllocated / totalCapacity) * 1000) / 10
    : 0.0;

  return {
    totalTasks: placements.length,
    scheduledTasks: summary.scheduledTasksCount ?? summary.scheduledCount ?? summary.totalTasksScheduled ?? 0,
    cycleDetected: Boolean(scheduleResult?.cycleDetected),
    infeasiblePlacementsCount,
    onTimeTasksCount,
    delayedTasksCount,
    totalDelayDays,
    capacityUtilizationPct,
    placementsMap: new Map(placements.map((p) => [p.taskId, p.proposedDate])),
  };
}

/**
 * Runs an isolated shadow comparison between baseline and candidate weights.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.tasks=[]] - Task backlog to evaluate.
 * @param {Object} [params.options={}] - Standard scheduler options.
 * @param {Object} [params.candidateWeights=null] - Candidate weights to evaluate.
 * @param {Object} [params.baselineWeights=FACTORY_SCHEDULER_WEIGHTS] - Factory baseline weights.
 * @param {number} [params.verifiedCompletionsCount=0] - Number of verified real-user completions.
 * @returns {Object} Structured comparative evaluation report.
 */
export function evaluateShadowSchedule({
  tasks = [],
  options = {},
  candidateWeights = null,
  baselineWeights = FACTORY_SCHEDULER_WEIGHTS,
  verifiedCompletionsCount = 0,
} = {}) {
  const evaluationTimestamp = new Date().toISOString();

  // 1. Run Baseline Schedule (Factory Defaults)
  const baselineSchedule = generateAdaptiveSchedule(tasks, {
    ...options,
    weights: baselineWeights,
  });
  const baselineMetrics = extractScheduleMetrics(baselineSchedule);

  // 2. Run Candidate Schedule in Isolated Shadow Path
  const effectiveCandidateWeights = candidateWeights || baselineWeights;
  const candidateSchedule = generateAdaptiveSchedule(tasks, {
    ...options,
    weights: effectiveCandidateWeights,
  });
  const candidateMetrics = extractScheduleMetrics(candidateSchedule);

  // 3. Compute Schedule Churn & Placements Delta
  let scheduleChurnCount = 0;
  const shiftedTaskIds = [];

  for (const [taskId, baseDate] of baselineMetrics.placementsMap.entries()) {
    const candDate = candidateMetrics.placementsMap.get(taskId);
    if (baseDate !== candDate) {
      scheduleChurnCount++;
      shiftedTaskIds.push(taskId);
    }
  }

  // 4. Evaluate Hard Constraint & Quality Regression Gate
  const violations = [];

  if (candidateMetrics.cycleDetected && !baselineMetrics.cycleDetected) {
    violations.push('regression_cycle_introduced: Candidate weights introduced circular dependency failure.');
  }

  if (candidateMetrics.infeasiblePlacementsCount > baselineMetrics.infeasiblePlacementsCount) {
    violations.push(`regression_infeasible_placements: Infeasible placements increased from ${baselineMetrics.infeasiblePlacementsCount} to ${candidateMetrics.infeasiblePlacementsCount}.`);
  }

  if (
    candidateMetrics.delayedTasksCount > baselineMetrics.delayedTasksCount &&
    candidateMetrics.totalDelayDays > baselineMetrics.totalDelayDays
  ) {
    violations.push(`regression_delayed_tasks: Delayed tasks increased from ${baselineMetrics.delayedTasksCount} to ${candidateMetrics.delayedTasksCount} (+${candidateMetrics.totalDelayDays - baselineMetrics.totalDelayDays} delay days).`);
  }

  const regressionGatePassed = violations.length === 0;

  // 5. Real Evidence Sufficiency Check
  const isRealEvidenceSufficient = typeof verifiedCompletionsCount === 'number' && verifiedCompletionsCount >= 15;
  const evaluationOutcome = !isRealEvidenceSufficient
    ? 'not_evaluable_insufficient_real_evidence'
    : (regressionGatePassed ? 'candidate_safe' : 'candidate_regressed');

  return {
    schemaVersion: '1.0.0',
    evaluationTimestamp,
    isShadowOnly: true,
    productionApplied: false,
    evaluationOutcome,
    isRealEvidenceSufficient,
    disclaimer: !isRealEvidenceSufficient
      ? `Real-user verified completions (current: ${verifiedCompletionsCount}/15) are insufficient to claim an empirical optimization. Comparison metrics reflect synthetic sandbox simulation only.`
      : 'Real-user evidence threshold met. Candidate weights evaluated across test scenarios.',
    regressionGate: {
      passed: regressionGatePassed,
      violations,
    },
    baselineMetrics: {
      totalTasks: baselineMetrics.totalTasks,
      scheduledTasks: baselineMetrics.scheduledTasks,
      onTimeTasksCount: baselineMetrics.onTimeTasksCount,
      delayedTasksCount: baselineMetrics.delayedTasksCount,
      totalDelayDays: baselineMetrics.totalDelayDays,
      capacityUtilizationPct: baselineMetrics.capacityUtilizationPct,
      infeasiblePlacementsCount: baselineMetrics.infeasiblePlacementsCount,
    },
    candidateMetrics: {
      totalTasks: candidateMetrics.totalTasks,
      scheduledTasks: candidateMetrics.scheduledTasks,
      onTimeTasksCount: candidateMetrics.onTimeTasksCount,
      delayedTasksCount: candidateMetrics.delayedTasksCount,
      totalDelayDays: candidateMetrics.totalDelayDays,
      capacityUtilizationPct: candidateMetrics.capacityUtilizationPct,
      infeasiblePlacementsCount: candidateMetrics.infeasiblePlacementsCount,
    },
    comparison: {
      scheduleChurnCount,
      shiftedTaskIds,
      onTimeDelta: candidateMetrics.onTimeTasksCount - baselineMetrics.onTimeTasksCount,
      delayedDelta: candidateMetrics.delayedTasksCount - baselineMetrics.delayedTasksCount,
      delayDaysDelta: candidateMetrics.totalDelayDays - baselineMetrics.totalDelayDays,
      utilizationDeltaPct: Math.round((candidateMetrics.capacityUtilizationPct - baselineMetrics.capacityUtilizationPct) * 10) / 10,
    },
  };
}
