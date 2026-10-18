/**
 * VoxPlan Empirical Preference Signal Derivation & Friction Profiling (Phase 7, Stage 2).
 *
 * Implements a pure, deterministic, and testable analysis layer that derives candidate
 * scheduling-preference signals and friction patterns from trustworthy local behavioral telemetry.
 *
 * Scope Boundary & Governance (Phase 7.2):
 * - Derives and explains evidence ONLY.
 * - Never adapts scheduler weights, tunes heuristics, or modifies schedule generation.
 * - Pure and read-only: does not mutate inputs or persist side-effects.
 * - Authoritative Gating: Evaluates Phase 7.1 readiness. When readiness is unmet, all signals
 *   are strictly marked as inconclusive / preliminary, and adaptation remains locked.
 * - Deterministic: accepts controlled `now` clock for reproducible testing.
 */

import {
  evaluateLearningReadiness,
  normalizeCategory,
  READINESS_STATUS,
} from './learningReadinessGate.js';
import { computeScheduleFeedback } from './scheduleFeedback.js';
import { computeBehavioralStats } from '../telemetry/behavioralStats.js';

export const EVIDENCE_LEVELS = Object.freeze({
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
  PRELIMINARY: 'preliminary',
  REPEATED_OBSERVATION: 'repeated_observation',
  ELIGIBLE_FOR_LATER_EVALUATION: 'eligible_for_later_evaluation',
  UNAVAILABLE: 'unavailable',
});

export const MIN_OBSERVATIONS_PER_SEGMENT = 3;

/**
 * Calculates the numerical median of an array of numbers.
 * Returns null if the array is empty.
 */
function calculateMedian(values = []) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Analyzes local telemetry and task state to extract candidate preference signals
 * and friction patterns, with strict sample maturity gating and statistical restraint.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.events=[]] - Telemetry events.
 * @param {Array<Object>} [params.tasks=[]] - Current task backlog.
 * @param {Date|string|number} [params.now=new Date()] - Reference evaluation clock.
 * @returns {Object} Structured preference signals and friction profile report.
 */
export function analyzePreferenceSignals({
  events = [],
  tasks = [],
  now = new Date(),
} = {}) {
  const analysisDate = now instanceof Date ? now : new Date(now);
  const analysisTimestamp = !isNaN(analysisDate.getTime())
    ? analysisDate.toISOString()
    : new Date().toISOString();

  // 1. Evaluate Authoritative Phase 7.1 Maturity Gate
  const readiness = evaluateLearningReadiness({ events, tasks, now: analysisDate });
  const isReadinessMet = readiness.status === READINESS_STATUS.READY;

  // Defensive fallback if events is not an array
  if (!Array.isArray(events)) {
    return {
      schemaVersion: '1.0.0',
      analysisTimestamp,
      readiness,
      isAdaptationUnlocked: false,
      frictionProfile: {
        proposals: { decidedCount: 0, acceptedCount: 0, discardedCount: 0, acceptanceRate: null, discardRate: null },
        overrides: { totalOverridesCount: 0, uniqueTasksOverriddenCount: 0, postponedCount: 0, advancedCount: 0, sameDayCount: 0, postponementRatio: null },
        effortAccuracy: { totalPairedCount: 0, medianRatio: null, byCategory: [] },
        weekdayRhythm: { totalCompleted: 0, distribution: [], lowestDay: null, highestDay: null },
      },
      candidateSignals: [],
      unavailableSignalFamilies: [
        {
          family: 'intraday_window_friction',
          name: 'Intraday Time-Window Movement Friction',
          reason: 'missing_intraday_window_provenance',
          explanation: 'Telemetry event store is unavailable.',
        },
      ],
      governance: {
        noSchedulerWeightsModified: true,
        noLearningPerformed: true,
        readOnlyDiagnostics: true,
        disclosure: 'Assessment unavailable. Telemetry event store is invalid or corrupt.',
      },
    };
  }

  // 2. Compute Underlying Engines (Schedule Feedback & Behavioral Stats)
  const feedback = computeScheduleFeedback(events, tasks);
  const stats = computeBehavioralStats(events, tasks);

  // Build task category & priority metadata map
  const taskMetaMap = new Map();
  if (Array.isArray(tasks)) {
    for (const t of tasks) {
      if (t && t.id) {
        taskMetaMap.set(t.id, {
          category: normalizeCategory(t.category) || 'General',
          priority: t.priority || 'medium',
          title: t.title || 'Untitled Task',
        });
      }
    }
  }

  // Backfill from task_created events for removed/archived tasks
  for (const ev of events) {
    if (ev && ev.event_type === 'task_created' && ev.task_id) {
      const p = ev.payload || {};
      if (!taskMetaMap.has(ev.task_id)) {
        taskMetaMap.set(ev.task_id, {
          category: normalizeCategory(p.category) || 'General',
          priority: p.priority || 'medium',
          title: p.title || 'Archived Task',
        });
      }
    }
  }

  // 3. Compile Descriptive Friction Profile

  // A. Proposal Decision Friction
  const decidedCount = feedback.summary.decidedCount || 0;
  const acceptedCount = feedback.summary.acceptedCount || 0;
  const discardedCount = feedback.summary.discardedCount || 0;
  const acceptanceRate = decidedCount > 0 ? acceptedCount / decidedCount : null;
  const discardRate = decidedCount > 0 ? discardedCount / decidedCount : null;

  // B. Override & Postponement Friction
  const overrideDetails = feedback.overrides?.details || [];
  const totalOverridesCount = overrideDetails.length;
  const uniqueTasksOverriddenCount = feedback.overrides?.uniqueTasksOverridden || 0;
  const postponedCount = feedback.summary.postponedOverridesCount || 0;
  const advancedCount = feedback.summary.advancedOverridesCount || 0;
  const sameDayCount = feedback.summary.sameDayOverridesCount || 0;
  const postponementRatio = totalOverridesCount > 0 ? postponedCount / totalOverridesCount : null;

  // Segment overrides by priority tier
  const overridesByPriorityMap = new Map();
  // Segment overrides by category
  const overridesByCategoryMap = new Map();

  for (const ov of overrideDetails) {
    const meta = taskMetaMap.get(ov.taskId) || { priority: 'medium', category: 'General' };
    const prio = meta.priority || 'medium';
    const cat = meta.category || 'General';

    if (!overridesByPriorityMap.has(prio)) {
      overridesByPriorityMap.set(prio, { total: 0, postponed: 0, advanced: 0 });
    }
    const prioData = overridesByPriorityMap.get(prio);
    prioData.total++;
    if (ov.shiftDirection === 'postponed') prioData.postponed++;
    else if (ov.shiftDirection === 'advanced') prioData.advanced++;

    if (!overridesByCategoryMap.has(cat)) {
      overridesByCategoryMap.set(cat, { total: 0, postponed: 0, advanced: 0 });
    }
    const catData = overridesByCategoryMap.get(cat);
    catData.total++;
    if (ov.shiftDirection === 'postponed') catData.postponed++;
    else if (ov.shiftDirection === 'advanced') catData.advanced++;
  }

  const overridesByPriority = Array.from(overridesByPriorityMap.entries()).map(([priority, data]) => ({
    priority,
    total: data.total,
    postponed: data.postponed,
    postponedRate: data.total > 0 ? data.postponed / data.total : 0,
  }));

  const overridesByCategory = Array.from(overridesByCategoryMap.entries()).map(([category, data]) => ({
    category,
    total: data.total,
    postponed: data.postponed,
    postponedRate: data.total > 0 ? data.postponed / data.total : 0,
  }));

  // C. Category Effort Accuracy & Duration Overruns
  // Find completed tasks with paired estimated effort and observed duration
  const pairedTasks = [];
  const categoryRatiosMap = new Map();

  // Inspect completed tasks from telemetry events and backlog
  const completedTaskEvents = events.filter((e) => e.event_type === 'task_completed');
  const reopenedTaskIds = new Set(
    events.filter((e) => e.event_type === 'task_reopened').map((e) => e.task_id)
  );

  for (const compEv of completedTaskEvents) {
    const taskId = compEv.task_id;
    if (!taskId || reopenedTaskIds.has(taskId)) continue;

    const payload = compEv.payload || {};
    const trackedSec = payload.tracked_duration_seconds;
    const reportedSec = payload.self_reported_duration_seconds;
    const actualSec = (typeof trackedSec === 'number' && trackedSec > 0)
      ? trackedSec
      : (typeof reportedSec === 'number' && reportedSec > 0 ? reportedSec : null);

    if (actualSec == null) continue;

    // Look for original estimate from tasks or task_created event
    const activeTask = tasks.find((t) => t.id === taskId);
    const createdEv = events.find((e) => e.event_type === 'task_created' && e.task_id === taskId);
    const estimatedHours = activeTask?.estimatedEffort
      ?? activeTask?.estimated_effort
      ?? createdEv?.payload?.estimated_effort
      ?? null;

    if (typeof estimatedHours === 'number' && estimatedHours > 0) {
      const actualHours = actualSec / 3600;
      const ratio = actualHours / estimatedHours;
      const cat = (activeTask && normalizeCategory(activeTask.category))
        || (createdEv && normalizeCategory(createdEv.payload?.category))
        || 'General';

      pairedTasks.push({ taskId, category: cat, estimatedHours, actualHours, ratio });

      if (!categoryRatiosMap.has(cat)) {
        categoryRatiosMap.set(cat, []);
      }
      categoryRatiosMap.get(cat).push(ratio);
    }
  }

  const overallRatios = pairedTasks.map((p) => p.ratio);
  const overallMedianRatio = calculateMedian(overallRatios);

  const effortByCategory = Array.from(categoryRatiosMap.entries()).map(([category, ratios]) => {
    const medRatio = calculateMedian(ratios);
    const sorted = [...ratios].sort((a, b) => a - b);
    return {
      category,
      count: ratios.length,
      medianRatio: medRatio != null ? Math.round(medRatio * 100) / 100 : null,
      isUnderestimated: medRatio != null && medRatio > 1.2,
      minRatio: sorted.length > 0 ? Math.round(sorted[0] * 100) / 100 : null,
      maxRatio: sorted.length > 0 ? Math.round(sorted[sorted.length - 1] * 100) / 100 : null,
    };
  });

  // D. Weekday Rhythm Distribution
  const weekdayDistribution = stats.weekdayCompletions || [];
  const totalCompleted = stats.totalCompletedCount || 0;

  const weekdayDistributionWithPct = weekdayDistribution.map((item) => ({
    day: item.day,
    count: item.count,
    percentage: totalCompleted > 0 ? Math.round((item.count / totalCompleted) * 100) : 0,
  }));

  const activeWeekdayEntries = weekdayDistributionWithPct.filter((w) => w.count > 0);
  let lowestDay = null;
  let highestDay = null;

  if (activeWeekdayEntries.length > 0) {
    highestDay = [...activeWeekdayEntries].sort((a, b) => b.count - a.count)[0];
    // Lowest day among all 7 days
    lowestDay = [...weekdayDistributionWithPct].sort((a, b) => a.count - b.count)[0];
  }

  // 4. Derive Candidate Preference Signals
  const candidateSignals = [];

  // Helper to determine evidence level
  function determineEvidenceLevel(observationCount) {
    if (!isReadinessMet) {
      return observationCount >= MIN_OBSERVATIONS_PER_SEGMENT
        ? EVIDENCE_LEVELS.PRELIMINARY
        : EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE;
    }
    if (observationCount >= 5) {
      return EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;
    }
    if (observationCount >= MIN_OBSERVATIONS_PER_SEGMENT) {
      return EVIDENCE_LEVELS.REPEATED_OBSERVATION;
    }
    return EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE;
  }

  // Signal Family 1: Category Effort Underestimation
  for (const catEffort of effortByCategory) {
    if (catEffort.count >= MIN_OBSERVATIONS_PER_SEGMENT && catEffort.isUnderestimated) {
      const level = determineEvidenceLevel(catEffort.count);
      const isEligible = level === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;
      const overrunPct = Math.round((catEffort.medianRatio - 1.0) * 100);

      candidateSignals.push({
        id: `cat_underestimation_${catEffort.category.toLowerCase()}`,
        family: 'category_effort_underestimation',
        name: `${catEffort.category} Category Effort Overrun`,
        evidenceLevel: level,
        isPreliminary: !isReadinessMet || level === EVIDENCE_LEVELS.PRELIMINARY,
        isEligibleForLaterEvaluation: isEligible,
        observedBehavior: `Completed ${catEffort.category} tasks consistently overrun estimates by median ${overrunPct}% (${catEffort.medianRatio.toFixed(2)}x duration ratio across ${catEffort.count} observed tasks).`,
        supportingEvidenceCount: catEffort.count,
        denominator: catEffort.count,
        metricValue: `${catEffort.medianRatio.toFixed(2)}x`,
        relevantTimeRange: {
          earliest: readiness.summary.earliestActiveDate,
          latest: readiness.summary.latestActiveDate,
        },
        confounders: [
          'External interruptions or untracked stopwatch pauses.',
          'Initial task descriptions may have been broad or exploratory.',
          'Category contains heterogeneous task complexities.',
        ],
        potentialSchedulingRelevance: `In later Phase 7 stages, this candidate signal could justify a category-specific buffer multiplier (W_friction) to avoid schedule overbooking.`,
        statusStatement: isReadinessMet
          ? 'Candidate pattern observed. Stored for Stage 7.3 Bayesian adaptation review.'
          : 'Preliminary observation. Adaptation gate remains unmet; no scheduler weights will change.',
      });
    }
  }

  // Signal Family 2: Postponement Friction Tendencies (Priority or Category)
  for (const prioOverride of overridesByPriority) {
    if (prioOverride.total >= MIN_OBSERVATIONS_PER_SEGMENT && prioOverride.postponedRate >= 0.6) {
      const level = determineEvidenceLevel(prioOverride.total);
      const isEligible = level === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;
      const pct = Math.round(prioOverride.postponedRate * 100);

      candidateSignals.push({
        id: `postponement_priority_${prioOverride.priority.toLowerCase()}`,
        family: 'postponement_friction',
        name: `${prioOverride.priority.toUpperCase()} Priority Forward Postponement Friction`,
        evidenceLevel: level,
        isPreliminary: !isReadinessMet || level === EVIDENCE_LEVELS.PRELIMINARY,
        isEligibleForLaterEvaluation: isEligible,
        observedBehavior: `${prioOverride.priority.toUpperCase()} priority tasks were postponed forward in ${prioOverride.postponed} of ${prioOverride.total} manual overrides (${pct}%).`,
        supportingEvidenceCount: prioOverride.postponed,
        denominator: prioOverride.total,
        metricValue: `${pct}%`,
        relevantTimeRange: {
          earliest: readiness.summary.earliestActiveDate,
          latest: readiness.summary.latestActiveDate,
        },
        confounders: [
          'Urgent incoming unplanned work overriding scheduled items.',
          'Prerequisite tasks or external stakeholder blockers.',
          'Initial deadline was aspirational rather than binding.',
        ],
        potentialSchedulingRelevance: `In later Phase 7 stages, disproportionate postponement could justify an adjusted priority weight (W_priority) or dynamic deadline buffer.`,
        statusStatement: isReadinessMet
          ? 'Candidate pattern observed. Stored for Stage 7.3 Bayesian adaptation review.'
          : 'Preliminary observation. Adaptation gate remains unmet; no scheduler weights will change.',
      });
    }
  }

  // Signal Family 3: Day-of-Week Focus Realism
  if (totalCompleted >= 8 && lowestDay && lowestDay.count <= 1) {
    const level = determineEvidenceLevel(totalCompleted);
    const isEligible = level === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;

    candidateSignals.push({
      id: `weekday_velocity_dip_${lowestDay.day.toLowerCase()}`,
      family: 'day_of_week_focus_realism',
      name: `${lowestDay.day} Completion Velocity Dip`,
      evidenceLevel: level,
      isPreliminary: !isReadinessMet || level === EVIDENCE_LEVELS.PRELIMINARY,
      isEligibleForLaterEvaluation: isEligible,
      observedBehavior: `Only ${lowestDay.count} of ${totalCompleted} completions (${lowestDay.percentage}%) occurred on ${lowestDay.day}.`,
      supportingEvidenceCount: lowestDay.count,
      denominator: totalCompleted,
      metricValue: `${lowestDay.percentage}%`,
      relevantTimeRange: {
        earliest: readiness.summary.earliestActiveDate,
        latest: readiness.summary.latestActiveDate,
      },
      confounders: [
        'User may have non-working days, classes, or recurring team meetings on this weekday.',
        'Weekend boundary habits or sprint turnover cycles.',
        'Tasks scheduled on this day may be long multi-day projects finishing on later days.',
      ],
      potentialSchedulingRelevance: `In later Phase 7 stages, empirical weekday velocity could tune daily capacity limits without violating hard constraints.`,
      statusStatement: isReadinessMet
        ? 'Candidate pattern observed. Stored for Stage 7.3 Bayesian adaptation review.'
        : 'Preliminary observation. Adaptation gate remains unmet; no scheduler weights will change.',
      });
  }

  // Signal Family 4: Proposal Decision Friction (Discard Tendencies)
  if (decidedCount >= 5 && discardRate != null && discardRate >= 0.4) {
    const level = determineEvidenceLevel(decidedCount);
    const isEligible = level === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;
    const discardPct = Math.round(discardRate * 100);

    candidateSignals.push({
      id: 'proposal_discard_friction',
      family: 'proposal_decision_friction',
      name: 'Elevated Proposal Discard Frequency',
      evidenceLevel: level,
      isPreliminary: !isReadinessMet || level === EVIDENCE_LEVELS.PRELIMINARY,
      isEligibleForLaterEvaluation: isEligible,
      observedBehavior: `${discardedCount} of ${decidedCount} proposal decisions (${discardPct}%) were discarded rather than accepted.`,
      supportingEvidenceCount: discardedCount,
      denominator: decidedCount,
      metricValue: `${discardPct}%`,
      relevantTimeRange: {
        earliest: readiness.summary.earliestActiveDate,
        latest: readiness.summary.latestActiveDate,
      },
      confounders: [
        'User generated exploratory proposals to compare options without intent to adopt.',
        'External changes or schedule changes occurred immediately after generation.',
        'Proposals with tight daily capacities may require looser horizon assumptions.',
      ],
      potentialSchedulingRelevance: `Indicates friction in proposal adoption; does not infer which specific heuristic caused the discard without explicit feedback.`,
      statusStatement: isReadinessMet
        ? 'Candidate pattern observed. Diagnostic only.'
        : 'Preliminary observation. Adaptation gate remains unmet; no scheduler weights will change.',
    });
  }

  // Signal Family 5: Intraday Time-Window Placement Movement (Explicitly Unavailable)
  const unavailableSignalFamilies = [
    {
      family: 'intraday_window_friction',
      name: 'Intraday Time-Window Movement Friction',
      reason: 'missing_intraday_window_provenance',
      explanation: 'VoxPlan records daily task due date shifts, but event telemetry does not yet capture original-vs-shifted intraday time-block identifiers. Intraday shift preferences cannot be inferred without this provenance.',
      requiredTelemetry: 'task_rescheduled payload must record original_window_id and new_window_id when intraday scheduling is active.',
    },
  ];

  return {
    schemaVersion: '1.0.0',
    analysisTimestamp,
    readiness,
    isAdaptationUnlocked: false, // Strict governance boundary
    evidenceLevels: EVIDENCE_LEVELS,
    frictionProfile: {
      proposals: {
        decidedCount,
        acceptedCount,
        discardedCount,
        acceptanceRate: acceptanceRate != null ? Math.round(acceptanceRate * 100) / 100 : null,
        discardRate: discardRate != null ? Math.round(discardRate * 100) / 100 : null,
        hasSufficientDecisions: decidedCount >= MIN_OBSERVATIONS_PER_SEGMENT,
      },
      overrides: {
        totalOverridesCount,
        uniqueTasksOverriddenCount,
        postponedCount,
        advancedCount,
        sameDayCount,
        postponementRatio: postponementRatio != null ? Math.round(postponementRatio * 100) / 100 : null,
        byPriority: overridesByPriority,
        byCategory: overridesByCategory,
      },
      effortAccuracy: {
        totalPairedCount: pairedTasks.length,
        medianRatio: overallMedianRatio != null ? Math.round(overallMedianRatio * 100) / 100 : null,
        byCategory: effortByCategory,
      },
      weekdayRhythm: {
        totalCompleted,
        distribution: weekdayDistributionWithPct,
        lowestDay,
        highestDay,
      },
    },
    candidateSignals,
    unavailableSignalFamilies,
    governance: {
      noSchedulerWeightsModified: true,
      noLearningPerformed: true,
      readOnlyDiagnostics: true,
      disclosure: 'This analysis is local and descriptive. Derived candidate signals are hypotheses for future evaluation; no scheduler weights, priority multipliers, or heuristics have been modified.',
    },
  };
}
