/**
 * VoxPlan Longitudinal Sample Maturity Gating & Readiness Diagnostics (Phase 7, Stage 1).
 *
 * Provides a pure, deterministic, local-first gatekeeper that answers:
 * Does VoxPlan currently have enough recent, trustworthy, sufficiently diverse
 * behavioral evidence to justify beginning preference learning?
 *
 * Strict Scope Boundary (Phase 7.1):
 * - Diagnostic and gating evaluation ONLY.
 * - Never adapts scheduler weights, tunes heuristics, or updates user models.
 * - Pure and read-only: does not mutate inputs or persist side-effects.
 * - Deterministic: accepts controlled `now` clock for reproducible testing.
 *
 * Authoritative Maturity Gate Thresholds (PROJECT_PLAN.md):
 * 1. decidedCount >= 20 (decided proposals: accepted or discarded, conflicts excluded)
 * 2. eligibleCompletedCount >= 15 (verified unaltered scheduled completions)
 * 3. distinctCategoryCount >= 3 (distinct valid categories among verified completed tasks)
 * 4. activeDaysCount >= 14 (distinct active calendar days of eligible behavioral telemetry)
 */

import { computeScheduleFeedback } from './scheduleFeedback.js';

export const READINESS_THRESHOLDS = Object.freeze({
  MIN_DECIDED_PROPOSALS: 20,
  MIN_VERIFIED_COMPLETIONS: 15,
  MIN_DISTINCT_CATEGORIES: 3,
  MIN_ACTIVE_DAYS: 14,
});

export const READINESS_STATUS = Object.freeze({
  READY: 'ready',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
  UNAVAILABLE: 'unavailable',
});

const INVALID_CATEGORY_VALUES = new Set([
  '',
  'unknown',
  'none',
  'n/a',
  'na',
  'null',
  'undefined',
  'unspecified',
  'placeholder',
  'temp',
  'test',
]);

/**
 * Normalizes a raw category string.
 * Returns null if blank, malformed, or a placeholder.
 */
export function normalizeCategory(category) {
  if (category == null) return null;
  const str = String(category).trim();
  if (!str) return null;
  if (INVALID_CATEGORY_VALUES.has(str.toLowerCase())) return null;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Eligible event types for active behavioral telemetry day counting.
 * Excludes passive system events or background logs.
 */
const ELIGIBLE_BEHAVIORAL_EVENT_TYPES = new Set([
  'schedule_proposal_accepted',
  'schedule_proposal_discarded',
  'task_completed',
  'task_started',
  'task_paused',
  'task_rescheduled',
  'task_reopened',
  'task_created',
  'task_priority_changed',
  'task_effort_revised',
  'task_reordered',
  'recommendation_accepted',
  'recommendation_rejected',
]);

/**
 * Formats a Date to a local calendar date string 'YYYY-MM-DD'.
 */
function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Evaluates the longitudinal sample maturity of local schedule feedback.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.events=[]] - Telemetry events.
 * @param {Array<Object>} [params.tasks=[]] - Current task backlog.
 * @param {Date|string|number} [params.now=new Date()] - Evaluation reference clock.
 * @returns {Object} Structured readiness assessment report.
 */
export function evaluateLearningReadiness({
  events = [],
  tasks = [],
  now = new Date(),
} = {}) {
  const assessmentDate = now instanceof Date ? now : new Date(now);
  const assessmentTimestamp = !isNaN(assessmentDate.getTime())
    ? assessmentDate.toISOString()
    : new Date().toISOString();

  // Defensive validation of input data
  if (!Array.isArray(events)) {
    return {
      schemaVersion: '1.0.0',
      assessmentTimestamp,
      status: READINESS_STATUS.UNAVAILABLE,
      isAdaptationUnlocked: false,
      readinessRatio: 0,
      summary: {
        decidedCount: 0,
        eligibleCompletedCount: 0,
        distinctCategoryCount: 0,
        activeDaysCount: 0,
        earliestActiveDate: null,
        latestActiveDate: null,
      },
      gates: {
        decidedProposals: {
          id: 'decided_proposals',
          name: 'Decided Schedule Proposals',
          current: 0,
          required: READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS,
          passed: false,
          progressRatio: 0,
          explanation: 'Telemetry event store is unavailable or corrupt.',
        },
        verifiedCompletions: {
          id: 'verified_completions',
          name: 'Verified Unaltered Completions',
          current: 0,
          required: READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS,
          passed: false,
          progressRatio: 0,
          explanation: 'Telemetry event store is unavailable or corrupt.',
        },
        taskCategories: {
          id: 'task_categories',
          name: 'Distinct Task Categories',
          current: 0,
          required: READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES,
          categories: [],
          passed: false,
          progressRatio: 0,
          explanation: 'Telemetry event store is unavailable or corrupt.',
        },
        activeDuration: {
          id: 'active_duration',
          name: 'Active Telemetry Days',
          current: 0,
          required: READINESS_THRESHOLDS.MIN_ACTIVE_DAYS,
          passed: false,
          progressRatio: 0,
          earliestActiveDate: null,
          latestActiveDate: null,
          explanation: 'Telemetry event store is unavailable or corrupt.',
        },
      },
      warnings: ['Telemetry event store is unavailable or invalid.'],
      exclusions: {
        conflictingProposals: 0,
        malformedEvents: 0,
        excludedCompletions: 0,
        futureEventsIgnored: 0,
        invalidTimestampsIgnored: 0,
      },
      governance: {
        noLearningPerformed: true,
        schedulerWeightsModified: false,
        readOnlyDiagnostics: true,
        disclosure:
          'Assessment unavailable. Preference learning is strictly locked and scheduler weights are unmodified.',
      },
    };
  }

  // 1. Run Schedule Feedback Attribution Engine
  const feedback = computeScheduleFeedback(events, tasks);
  const decidedCount = feedback.summary.decidedCount || 0;
  const eligibleCompletedCount = feedback.summary.eligibleCompletedCount || 0;
  const completedPlacements = feedback.completionOutcomes?.reliableObservations || [];

  // 2. Resolve Distinct Task Categories for Verified Completions
  // Build a lookup map of taskId -> category from tasks backlog, task_created telemetry, and placements
  const taskCategoryMap = new Map();

  // From active tasks array
  if (Array.isArray(tasks)) {
    for (const t of tasks) {
      if (t && t.id) {
        const norm = normalizeCategory(t.category);
        if (norm) taskCategoryMap.set(t.id, norm);
      }
    }
  }

  // From task_created telemetry events (preserves historical categories even if task was removed)
  for (const ev of events) {
    if (ev && ev.event_type === 'task_created' && ev.task_id) {
      const cat = ev.payload?.category;
      const norm = normalizeCategory(cat);
      if (norm && !taskCategoryMap.has(ev.task_id)) {
        taskCategoryMap.set(ev.task_id, norm);
      }
    }
  }

  // Collect distinct categories from verified completions
  const qualifyingCategoriesSet = new Set();
  for (const placement of completedPlacements) {
    const taskId = placement.taskId;
    const cat = taskCategoryMap.get(taskId);
    if (cat) {
      qualifyingCategoriesSet.add(cat);
    }
  }

  const distinctCategoryCount = qualifyingCategoriesSet.size;
  const distinctCategoriesList = Array.from(qualifyingCategoriesSet).sort();

  // 3. Compute Active Behavioral Telemetry Days & Timestamps
  const nowMs = assessmentDate.getTime();
  const maxFutureAllowedMs = nowMs + 86400000; // 24-hour future sanity horizon

  const activeDaysSet = new Set();
  let earliestActiveDate = null;
  let latestActiveDate = null;
  let futureEventsIgnored = 0;
  let invalidTimestampsIgnored = 0;

  for (const ev of events) {
    if (!ev || !ELIGIBLE_BEHAVIORAL_EVENT_TYPES.has(ev.event_type)) {
      continue;
    }

    if (!ev.timestamp || typeof ev.timestamp !== 'string') {
      invalidTimestampsIgnored++;
      continue;
    }

    const evDate = new Date(ev.timestamp);
    const evMs = evDate.getTime();

    if (isNaN(evMs)) {
      invalidTimestampsIgnored++;
      continue;
    }

    // Future timestamp sanity check
    if (evMs > maxFutureAllowedMs) {
      futureEventsIgnored++;
      continue;
    }

    const dayKey = toLocalDateKey(evDate);
    activeDaysSet.add(dayKey);

    if (!earliestActiveDate || evMs < new Date(earliestActiveDate).getTime()) {
      earliestActiveDate = evDate.toISOString();
    }
    if (!latestActiveDate || evMs > new Date(latestActiveDate).getTime()) {
      latestActiveDate = evDate.toISOString();
    }
  }

  const activeDaysCount = activeDaysSet.size;

  // 4. Evaluate Gates
  const gate1Passed = decidedCount >= READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS;
  const gate2Passed = eligibleCompletedCount >= READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS;
  const gate3Passed = distinctCategoryCount >= READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES;
  const gate4Passed = activeDaysCount >= READINESS_THRESHOLDS.MIN_ACTIVE_DAYS;

  const passedGatesCount = [gate1Passed, gate2Passed, gate3Passed, gate4Passed].filter(Boolean).length;
  const readinessRatio = Math.round((passedGatesCount / 4) * 100) / 100;

  const allGatesPassed = gate1Passed && gate2Passed && gate3Passed && gate4Passed;
  const status = allGatesPassed ? READINESS_STATUS.READY : READINESS_STATUS.INSUFFICIENT_EVIDENCE;
  const isAdaptationUnlocked = allGatesPassed;

  // Build Explanations
  const gate1Explanation = gate1Passed
    ? `${decidedCount} explicit proposal decisions recorded (${READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS} required). Deduplicated and conflict-free.`
    : `Requires at least ${READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS} decided proposals (currently ${decidedCount}). Accept or discard proposals to mature this gate.`;

  const gate2Explanation = gate2Passed
    ? `${eligibleCompletedCount} verified unaltered completions recorded (${READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS} required).`
    : eligibleCompletedCount === 0
    ? `No verified unaltered completions yet. Complete tasks scheduled by accepted proposals without manual date overrides.`
    : `Requires at least ${READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS} verified unaltered completions (currently ${eligibleCompletedCount}).`;

  const gate3Explanation = gate3Passed
    ? `Completed tasks span ${distinctCategoryCount} distinct valid categories: ${distinctCategoriesList.join(', ')}.`
    : distinctCategoryCount === 0
    ? `Requires verified completions across at least ${READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES} distinct categories (currently 0).`
    : `Requires verified completions across at least ${READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES} distinct categories (currently ${distinctCategoryCount}: ${distinctCategoriesList.join(', ')}).`;

  const gate4Explanation = gate4Passed
    ? `Behavioral telemetry spans ${activeDaysCount} active calendar days (${READINESS_THRESHOLDS.MIN_ACTIVE_DAYS} required).`
    : `Requires at least ${READINESS_THRESHOLDS.MIN_ACTIVE_DAYS} distinct active calendar days of telemetry (currently ${activeDaysCount} days). Empty days are excluded.`;

  // 5. Diagnostics & Quality Warnings
  const warnings = [];
  if (feedback.diagnostics.conflictingProposalsCount > 0) {
    warnings.push(
      `${feedback.diagnostics.conflictingProposalsCount} conflicting proposal decision(s) were isolated and excluded from decided counts.`
    );
  }
  if (feedback.diagnostics.malformedEventsCount > 0) {
    warnings.push(
      `${feedback.diagnostics.malformedEventsCount} malformed proposal event(s) were excluded due to missing identifiers.`
    );
  }
  if (feedback.diagnostics.totalExcludedObservations > 0) {
    warnings.push(
      `${feedback.diagnostics.totalExcludedObservations} task outcome observation(s) excluded (manually rescheduled prior to completion, reopened incomplete, or currently open).`
    );
  }
  if (futureEventsIgnored > 0) {
    warnings.push(
      `${futureEventsIgnored} event(s) with future timestamps beyond the 24h sanity horizon were ignored.`
    );
  }
  if (invalidTimestampsIgnored > 0) {
    warnings.push(
      `${invalidTimestampsIgnored} event(s) with unparseable timestamps were ignored.`
    );
  }
  if (eligibleCompletedCount === 0 && decidedCount > 0) {
    warnings.push(
      'Accepted schedule proposals exist, but no scheduled tasks have been verified completed on their proposed dates yet.'
    );
  }

  return {
    schemaVersion: '1.0.0',
    assessmentTimestamp,
    status,
    isAdaptationUnlocked,
    readinessRatio,
    summary: {
      decidedCount,
      eligibleCompletedCount,
      distinctCategoryCount,
      activeDaysCount,
      earliestActiveDate,
      latestActiveDate,
    },
    gates: {
      decidedProposals: {
        id: 'decided_proposals',
        name: 'Decided Schedule Proposals',
        current: decidedCount,
        required: READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS,
        passed: gate1Passed,
        progressRatio: Math.min(1.0, decidedCount / READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS),
        explanation: gate1Explanation,
      },
      verifiedCompletions: {
        id: 'verified_completions',
        name: 'Verified Unaltered Completions',
        current: eligibleCompletedCount,
        required: READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS,
        passed: gate2Passed,
        progressRatio: Math.min(1.0, eligibleCompletedCount / READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS),
        explanation: gate2Explanation,
      },
      taskCategories: {
        id: 'task_categories',
        name: 'Distinct Task Categories',
        current: distinctCategoryCount,
        required: READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES,
        categories: distinctCategoriesList,
        passed: gate3Passed,
        progressRatio: Math.min(1.0, distinctCategoryCount / READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES),
        explanation: gate3Explanation,
      },
      activeDuration: {
        id: 'active_duration',
        name: 'Active Telemetry Days',
        current: activeDaysCount,
        required: READINESS_THRESHOLDS.MIN_ACTIVE_DAYS,
        passed: gate4Passed,
        progressRatio: Math.min(1.0, activeDaysCount / READINESS_THRESHOLDS.MIN_ACTIVE_DAYS),
        earliestActiveDate,
        latestActiveDate,
        explanation: gate4Explanation,
      },
    },
    warnings,
    exclusions: {
      conflictingProposals: feedback.diagnostics.conflictingProposalsCount || 0,
      malformedEvents: feedback.diagnostics.malformedEventsCount || 0,
      excludedCompletions: feedback.diagnostics.totalExcludedObservations || 0,
      futureEventsIgnored,
      invalidTimestampsIgnored,
    },
    governance: {
      noLearningPerformed: true,
      schedulerWeightsModified: false,
      readOnlyDiagnostics: true,
      disclosure:
        'This assessment is local and read-only. It does not modify scheduler weights or train models. Reaching readiness permits evaluation of a later learning stage; it does not automatically enable learning.',
    },
  };
}
