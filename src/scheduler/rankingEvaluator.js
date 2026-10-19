/**
 * VoxPlan Offline Ranking-Evaluation Pipeline (Phase 7.3 Follow-up).
 *
 * Implements a pure, deterministic offline evaluation module that tests whether
 * explicit pairwise preferences can support a future ranking model.
 *
 * Scope & Safety Governance:
 * 1. Offline & Shadow Only: Evaluates candidate and baseline ranking functions purely in memory.
 *    Never activates or mutates production scheduler weights.
 * 2. Unbiased Baseline Comparison: Always compares candidate ranking performance against
 *    the unmodified factory baseline scoring objective.
 * 3. Hard-Constraint Decoupling: A ranking model NEVER receives credit for a preference match
 *    that requires an invalid or constraint-violating schedule.
 * 4. Honest Sample & Uncertainty Reporting: Reports exact numerators and denominators.
 *    Small-sample point estimates are clearly flagged with statistical uncertainty disclaimers.
 * 5. Leakage Prevention: When sample volume permits (N >= 15), uses a grouped split strategy
 *    (grouped by scenario or context identifier) to prevent correlated leakage between train/test partitions.
 */

import { FACTORY_SCHEDULER_WEIGHTS } from './adaptiveScheduler.js';

export const MIN_EVALUATION_SAMPLE = 5;
export const MIN_HOLDOUT_SAMPLE = 15;
export const MIN_SCENARIO_GROUPS = 3;

export const RANKING_EVALUATION_STATUS = Object.freeze({
  EVALUATED: 'evaluated',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
});

/**
 * Default factory objective scoring function for a schedule proposal alternative.
 * Evaluates schedule quality across timeliness, delay minimization, capacity utilization,
 * and schedule churn.
 *
 * @param {Object} alternative - A schedule proposal or strategy metrics object.
 * @returns {number} Continuous objective score (higher is better).
 */
export function computeScheduleObjectiveScore(alternative) {
  if (!alternative || typeof alternative !== 'object') {
    return -Infinity;
  }

  // Extract metrics from standard summary or strategy object
  const metrics = alternative.metrics || alternative.summary || alternative;

  const totalTasks = Number(metrics.totalTasks ?? metrics.scheduledTasksCount ?? metrics.totalEligibleTasks ?? 0);
  const onTimeTasks = Number(metrics.onTimeTasksCount ?? metrics.onTimeCount ?? 0);
  const delayedTasks = Number(metrics.delayedTasksCount ?? metrics.delayedCount ?? 0);
  const totalDelayDays = Number(metrics.totalDelayDays ?? 0);
  const capacityUtilPct = Number(metrics.capacityUtilizationPct ?? metrics.capacityUtilization ?? 50.0);
  const churnRate = Number(metrics.churnRate ?? 0.0);

  // Feasibility penalty
  const hasCycle = Boolean(metrics.cycleDetected || alternative.cycleDetected);
  const infeasibleCount = Number(metrics.infeasiblePlacementsCount ?? alternative.infeasiblePlacementsCount ?? 0);
  if (hasCycle || infeasibleCount > 0) {
    return -10000 - (infeasibleCount * 100);
  }

  const onTimeRate = totalTasks > 0 ? (onTimeTasks / totalTasks) : 1.0;
  const avgDelayDays = delayedTasks > 0 ? (totalDelayDays / delayedTasks) : 0.0;
  const utilFraction = Math.max(0, Math.min(1.0, capacityUtilPct / 100.0));

  // Balanced schedule objective utility
  // +100 for on-time rate, -15 per avg delay day, +10 for balanced utilization, -20 for churn
  const score = (100.0 * onTimeRate) - (15.0 * avgDelayDays) + (10.0 * utilFraction) - (20.0 * churnRate);

  return isFinite(score) ? score : -Infinity;
}

export function computeWilsonScoreInterval(successes, total, confidence = 0.95) {
  if (typeof total !== 'number' || total <= 0 || !isFinite(total)) {
    return {
      ciLower: null,
      ciUpper: null,
      ciLowerPct: null,
      ciUpperPct: null,
      marginOfErrorPct: null,
      method: 'Wilson score interval (95% CI)',
      confidenceLevel: confidence,
    };
  }

  const k = Math.max(0, Math.min(total, Number(successes) || 0));
  const n = total;
  const pHat = k / n;

  // Two-sided normal quantile: for 0.95, z ≈ 1.959964
  const z = confidence === 0.99 ? 2.575829 : confidence === 0.90 ? 1.644853 : 1.959964;
  const zSq = z * z;

  const denom = 1 + zSq / n;
  const center = (pHat + zSq / (2 * n)) / denom;
  const varianceTerm = (pHat * (1 - pHat)) / n + zSq / (4 * n * n);
  const halfWidth = (z / denom) * Math.sqrt(Math.max(0, varianceTerm));

  const lower = Math.max(0.0, center - halfWidth);
  const upper = Math.min(1.0, center + halfWidth);

  // Maximum distance between point estimate and bounds as margin of error
  const moe = Math.max(pHat - lower, upper - pHat);

  return {
    ciLower: Math.round(lower * 1000) / 1000,
    ciUpper: Math.round(upper * 1000) / 1000,
    ciLowerPct: Math.round(lower * 1000) / 10,
    ciUpperPct: Math.round(upper * 1000) / 10,
    marginOfErrorPct: Math.round(moe * 1000) / 10,
    method: `Wilson score interval (${Math.round(confidence * 100)}% CI)`,
    confidenceLevel: confidence,
  };
}

/**
 * Checks concordance between an explicitly preferred alternative and a non-preferred alternative
 * under a given scoring function.
 *
 * @param {Object} preferredAlt - The alternative the user explicitly chose.
 * @param {Object} nonPreferredAlt - The alternative the user did not choose.
 * @param {Function} [scoringFn=computeScheduleObjectiveScore] - Scoring function.
 * @returns {Object} Pair evaluation result.
 */
export function evaluatePairwiseConcordance(preferredAlt, nonPreferredAlt, scoringFn = computeScheduleObjectiveScore) {
  // Hard-constraint gate: preferred alternative must not violate hard constraints
  const isPCompliant = preferredAlt?.isConstraintCompliant !== false &&
    !preferredAlt?.cycleDetected &&
    (preferredAlt?.infeasiblePlacementsCount ?? 0) === 0;

  if (!isPCompliant) {
    return {
      isConcordant: false,
      isTied: false,
      disqualified: true,
      disqualificationReason: 'preferred_alternative_violates_hard_constraints',
      scorePreferred: null,
      scoreNonPreferred: null,
    };
  }

  // Hard-constraint gate: non-preferred alternative must also satisfy hard constraints
  const isQCompliant = nonPreferredAlt?.isConstraintCompliant !== false &&
    !nonPreferredAlt?.cycleDetected &&
    (nonPreferredAlt?.infeasiblePlacementsCount ?? 0) === 0;

  if (!isQCompliant) {
    return {
      isConcordant: false,
      isTied: false,
      disqualified: true,
      disqualificationReason: 'non_preferred_alternative_violates_hard_constraints',
      scorePreferred: null,
      scoreNonPreferred: null,
    };
  }

  const scoreP = scoringFn(preferredAlt);
  const scoreQ = scoringFn(nonPreferredAlt);

  if (!isFinite(scoreP) || !isFinite(scoreQ)) {
    return {
      isConcordant: false,
      isTied: false,
      disqualified: true,
      disqualificationReason: 'non_finite_scoring_evaluation',
      scorePreferred: isFinite(scoreP) ? scoreP : null,
      scoreNonPreferred: isFinite(scoreQ) ? scoreQ : null,
    };
  }

  if (scoreP === scoreQ) {
    return {
      isConcordant: false,
      isTied: true,
      disqualified: false,
      disqualificationReason: null,
      scorePreferred: scoreP,
      scoreNonPreferred: scoreQ,
    };
  }

  return {
    isConcordant: scoreP > scoreQ,
    isTied: false,
    disqualified: false,
    disqualificationReason: null,
    scorePreferred: scoreP,
    scoreNonPreferred: scoreQ,
  };
}

/**
 * Evaluates pairwise ranking accuracy of a scoring function over an array of eligible comparisons.
 *
 * @param {Array<Object>} comparisons - Eligible comparison records.
 * @param {Function} scoringFn - Scoring function.
 * @returns {Object} Concordance metrics.
 */
function evaluatePairsAccuracy(comparisons = [], scoringFn = computeScheduleObjectiveScore) {
  let concordantCount = 0;
  let discordantCount = 0;
  let tiedCount = 0;
  let disqualifiedCount = 0;

  for (const cmp of comparisons) {
    const res = evaluatePairwiseConcordance(cmp.preferredAlternative, cmp.nonPreferredAlternative, scoringFn);
    if (res.disqualified) {
      disqualifiedCount++;
    } else if (res.isConcordant) {
      concordantCount++;
    } else if (res.isTied) {
      tiedCount++;
    } else {
      discordantCount++;
    }
  }

  const totalEvaluated = comparisons.length;
  const accuracy = totalEvaluated > 0 ? (concordantCount / totalEvaluated) : 0.0;
  const accuracyPct = Math.round(accuracy * 1000) / 10;

  return {
    concordantCount,
    discordantCount,
    tiedCount,
    disqualifiedCount,
    totalEvaluated,
    accuracy,
    accuracyPct,
  };
}

/**
 * Evaluates offline ranking performance on a dataset of explicit preference comparisons.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.eligibleComparisons=[]] - Cleaned eligible comparisons from preferenceEvidence.
 * @param {Function} [params.baselineScoringFn=computeScheduleObjectiveScore] - Baseline scoring function.
 * @param {Function} [params.candidateScoringFn=null] - Candidate scoring function.
 * @param {Object} [params.evidenceCounts=null] - Precomputed evidence counts.
 * @returns {Object} Comprehensive offline ranking evaluation report.
 */
export function evaluateOfflineRanking({
  eligibleComparisons = [],
  baselineScoringFn = computeScheduleObjectiveScore,
  candidateScoringFn = null,
  evidenceCounts = null,
} = {}) {
  const comparisons = Array.isArray(eligibleComparisons) ? eligibleComparisons : [];
  const sampleSize = comparisons.length;

  const baseSummary = evidenceCounts || {
    totalObserved: sampleSize,
    eligibleCount: sampleSize,
    excludedCount: 0,
    byReason: {},
  };

  // 1. Check sample sufficiency
  if (sampleSize < MIN_EVALUATION_SAMPLE) {
    return {
      status: RANKING_EVALUATION_STATUS.INSUFFICIENT_EVIDENCE,
      reason: 'insufficient_sample_size',
      message: `Eligible explicit comparisons (${sampleSize}) are below the minimum threshold of ${MIN_EVALUATION_SAMPLE} required for statistical evaluation.`,
      evidenceSummary: baseSummary,
      baselineMetrics: null,
      candidateMetrics: null,
      delta: null,
      uncertainty: {
        sampleSize,
        minRequired: MIN_EVALUATION_SAMPLE,
        isSmallSample: true,
        marginOfErrorPct: null,
        disclaimer: 'Point estimates cannot be reliably derived from sparse explicit comparisons (< 5).',
      },
      splitValidation: {
        isSplitDefensible: false,
        splitStrategy: 'none_insufficient_sample',
        distinctGroupsCount: 0,
        trainMetrics: null,
        testMetrics: null,
      },
      productionInvariance: {
        isAdaptationUnlocked: false,
        productionApplied: false,
        factoryWeightsUnchanged: true,
        activeWeights: FACTORY_SCHEDULER_WEIGHTS,
        notice: 'Production scheduling remains strictly invariant. Evaluation is offline only.',
      },
    };
  }

  // 2. Evaluate Baseline Pairwise Concordance
  const baselineMetrics = evaluatePairsAccuracy(comparisons, baselineScoringFn);

  // 3. Evaluate Candidate Pairwise Concordance (if candidate scoring function provided)
  let candidateMetrics = null;
  let delta = null;

  if (typeof candidateScoringFn === 'function') {
    candidateMetrics = evaluatePairsAccuracy(comparisons, candidateScoringFn);
    delta = Math.round((candidateMetrics.accuracy - baselineMetrics.accuracy) * 1000) / 1000;
  }

  // 4. Uncertainty Estimation via Wilson Score Interval (95% CI)
  // Replaces flawed asymptotic Wald formula which collapses to 0.0% on boundary estimates (p=1 or p=0)
  // and is statistically invalid on small samples.
  const wilsonInterval = computeWilsonScoreInterval(
    baselineMetrics.concordantCount,
    baselineMetrics.totalEvaluated,
    0.95
  );

  // 5. Grouped Cross-Validation / Holdout Split (Leakage Prevention)
  // Requires genuine scenario/context identifiers. Never falls back to algorithm pairKey,
  // which would leak comparisons on the same underlying scenario across partitions.
  const groupsMap = new Map();
  let ungroupedCount = 0;

  for (const cmp of comparisons) {
    const groupKey =
      cmp.context?.scenario_key ||
      cmp.context?.scenarioKey ||
      cmp.context?.scenario_name ||
      cmp.context?.scenarioName ||
      cmp.context?.scenario_id ||
      cmp.context?.scenarioId ||
      null;

    if (!groupKey) {
      ungroupedCount++;
      continue;
    }

    const normalizedKey = String(groupKey).trim();
    if (!groupsMap.has(normalizedKey)) {
      groupsMap.set(normalizedKey, []);
    }
    groupsMap.get(normalizedKey).push(cmp);
  }

  const distinctGroups = Array.from(groupsMap.keys());
  let splitValidation = {
    isSplitDefensible: false,
    splitStrategy: sampleSize < MIN_HOLDOUT_SAMPLE ? 'none_insufficient_sample' : 'none_insufficient_scenario_groups',
    distinctGroupsCount: distinctGroups.length,
    ungroupedComparisonsCount: ungroupedCount,
    trainMetrics: null,
    testMetrics: null,
    reason: sampleSize < MIN_HOLDOUT_SAMPLE
      ? `Sample size (${sampleSize}) below minimum threshold of ${MIN_HOLDOUT_SAMPLE} required for grouped holdout partitioning.`
      : `Identified ${distinctGroups.length} independent scenario group(s), below the minimum requirement of ${MIN_SCENARIO_GROUPS} distinct scenario groups to prevent cross-partition leakage.`,
  };

  if (sampleSize >= MIN_HOLDOUT_SAMPLE && distinctGroups.length >= MIN_SCENARIO_GROUPS) {
    // Deterministic 60/40 grouped split
    const sortedGroups = [...distinctGroups].sort();
    const trainGroupCount = Math.max(1, Math.min(sortedGroups.length - 1, Math.round(sortedGroups.length * 0.6)));
    const trainGroupKeys = new Set(sortedGroups.slice(0, trainGroupCount));

    const trainPairs = [];
    const testPairs = [];

    for (const [key, pairs] of groupsMap.entries()) {
      if (trainGroupKeys.has(key)) {
        trainPairs.push(...pairs);
      } else {
        testPairs.push(...pairs);
      }
    }

    if (trainPairs.length > 0 && testPairs.length > 0) {
      splitValidation = {
        isSplitDefensible: true,
        splitStrategy: 'grouped_by_scenario_60_40',
        distinctGroupsCount: distinctGroups.length,
        ungroupedComparisonsCount: ungroupedCount,
        trainGroupCount,
        testGroupCount: sortedGroups.length - trainGroupCount,
        trainMetrics: evaluatePairsAccuracy(trainPairs, candidateScoringFn || baselineScoringFn),
        testMetrics: evaluatePairsAccuracy(testPairs, candidateScoringFn || baselineScoringFn),
        reason: `Deterministic 60/40 grouped holdout across ${distinctGroups.length} independent scenario groups (${trainPairs.length} train, ${testPairs.length} test comparisons). No scenario crosses partitions.`,
      };
    }
  }

  return {
    status: RANKING_EVALUATION_STATUS.EVALUATED,
    reason: null,
    message: `Successfully evaluated ${sampleSize} eligible pairwise comparisons against baseline objective scoring.`,
    evidenceSummary: baseSummary,
    baselineMetrics,
    candidateMetrics,
    delta,
    uncertainty: {
      sampleSize,
      minRequired: MIN_EVALUATION_SAMPLE,
      isSmallSample: sampleSize < MIN_HOLDOUT_SAMPLE,
      confidenceLevel: wilsonInterval.confidenceLevel,
      method: wilsonInterval.method,
      ciLower: wilsonInterval.ciLower,
      ciUpper: wilsonInterval.ciUpper,
      ciLowerPct: wilsonInterval.ciLowerPct,
      ciUpperPct: wilsonInterval.ciUpperPct,
      marginOfErrorPct: wilsonInterval.marginOfErrorPct,
      disclaimer: sampleSize < MIN_HOLDOUT_SAMPLE
        ? `Preliminary sample size (N = ${sampleSize}). 95% Wilson score CI is [${wilsonInterval.ciLowerPct}%, ${wilsonInterval.ciUpperPct}%] (±${wilsonInterval.marginOfErrorPct}%). Assumes independent Bernoulli trials; does NOT account for inter-scenario dependence, selection bias, or distribution shift. Grouped holdout requires N >= ${MIN_HOLDOUT_SAMPLE} across >= ${MIN_SCENARIO_GROUPS} distinct scenario groups.`
        : `Evaluated sample size (N = ${sampleSize}). 95% Wilson score CI is [${wilsonInterval.ciLowerPct}%, ${wilsonInterval.ciUpperPct}%] (±${wilsonInterval.marginOfErrorPct}%). Assumes independent trials; does not adjust for selection bias or non-response.`,
    },
    splitValidation,
    productionInvariance: {
      isAdaptationUnlocked: false,
      productionApplied: false,
      factoryWeightsUnchanged: true,
      activeWeights: FACTORY_SCHEDULER_WEIGHTS,
      notice: 'Production scheduling remains strictly invariant. Evaluation is offline only.',
    },
  };
}
