/**
 * VoxPlan Shadow-Only Activation-Gate Evaluator (Phase 7.4 Stage 4A).
 *
 * Implements a pure, deterministic, read-only evaluator that tests whether
 * a candidate scheduler-weight configuration satisfies VoxPlan's documented
 * evidence, quality, feasibility, and rollback-readiness criteria.
 *
 * Strict Production Safety & Invariants (Scope 9):
 * 1. Read-Only & Shadow Only: Evaluates candidate configurations purely in memory.
 *    Never mutates production scheduler weights, active configuration, or storage.
 * 2. Immutable Factory Baseline: Baseline evaluation always uses FACTORY_SCHEDULER_WEIGHTS.
 * 3. Invariants Preserved: isAdaptationUnlocked === false, productionApplied === false.
 * 4. Eligibility != Deployment: Returning 'eligible_for_supervised_review' means ONLY
 *    that documented audit checks passed. It must NEVER activate learned weights automatically.
 * 5. Methodological Honesty: Distinguishes operational exposure heuristics from formal
 *    statistical inference; uses cluster-aware bootstrap resampling instead of naive
 *    uncorrelated intervals; and never equates concordance with user satisfaction.
 */

import { FACTORY_SCHEDULER_WEIGHTS } from './adaptiveScheduler.js';
import { validateCandidateWeights, SIMULATION_WEIGHT_BOUNDS } from './scheduleSimulator.js';
import { computeScheduleObjectiveScore, MIN_HOLDOUT_SAMPLE, MIN_SCENARIO_GROUPS } from './rankingEvaluator.js';
import { validateConfigurationSnapshot } from './configurationSnapshot.js';
import { READINESS_THRESHOLDS } from './learningReadinessGate.js';

/**
 * Outcome vocabulary for activation gate evaluation.
 */
export const ACTIVATION_GATE_OUTCOMES = Object.freeze({
  ELIGIBLE_FOR_SUPERVISED_REVIEW: 'eligible_for_supervised_review',
  NOT_SUPERIOR: 'not_superior',
  INFEASIBLE: 'infeasible',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
  INSUFFICIENT_METHODOLOGY: 'insufficient_methodology',
});

/**
 * Default practical improvement threshold (\epsilon) on the 100-point schedule objective scale.
 * 1.0 point represents an additional 1% on-time placement rate or ~1.6 hours reduction in average task delay.
 */
export const DEFAULT_MIN_MEANINGFUL_DELTA = 1.0;

/**
 * Minimum sample requirements for statistical inference.
 */
export const MIN_PAIRED_OBSERVATIONS = MIN_HOLDOUT_SAMPLE; // 15
export const MIN_INDEPENDENT_CLUSTERS = MIN_SCENARIO_GROUPS; // 3
export const DEFAULT_BOOTSTRAP_ITERATIONS = 300;

/**
 * Methodological disclosures and limitations documentation.
 */
export const METHODOLOGY_DISCLOSURES = Object.freeze([
  'Pairwise concordance with an objective formula measures proxy alignment, NOT proof of superior user satisfaction.',
  'Observations from a single user on task backlogs are correlated; naive unclustered intervals inflate false-positive rates.',
  'A positive point estimate alone does not establish superiority without uncertainty estimation.',
  'Operational exposure heuristics (>= 20 decisions, >= 15 completions) ensure interaction diversity, not asymptotic statistical power.',
  'Eligibility for supervised review authorizes human review only; production activation remains disabled.',
]);

/**
 * Deterministic PRNG implementation (Mulberry32) for reproducible clustered resampling.
 *
 * @param {number} seed
 * @returns {() => number} Returns float in [0, 1)
 */
export function createMulberry32(seed = 1337) {
  let s = Math.floor(Math.abs(Number(seed) || 1337)) >>> 0;
  return function nextRandom() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extracts a normalized scenario or cluster identifier from an observation or its context.
 *
 * @param {Object} observation
 * @returns {string|null}
 */
export function extractClusterKey(observation) {
  if (!observation || typeof observation !== 'object') return null;

  const rawKey =
    observation.clusterKey ||
    observation.cluster_key ||
    observation.scenario_key ||
    observation.scenarioKey ||
    observation.scenario_id ||
    observation.scenarioId ||
    observation.context?.scenario_key ||
    observation.context?.scenarioKey ||
    observation.context?.scenario_id ||
    observation.context?.scenarioId ||
    observation.context?.scenarioName ||
    observation.context?.scenario_name ||
    observation.context?.project_id ||
    observation.context?.projectId ||
    null;

  if (rawKey == null) return null;
  const str = String(rawKey).trim();
  return str.length > 0 ? str : null;
}

/**
 * Validates a single paired evaluation observation.
 * Ensures that candidate and baseline alternatives were evaluated on the same backlog and constraints.
 *
 * @param {Object} observation
 * @param {Function} scoringFn
 * @returns {{
 *   valid: boolean,
 *   reason: string|null,
 *   clusterKey: string|null,
 *   candidateScore: number|null,
 *   baselineScore: number|null,
 *   delta: number|null,
 *   candidateFeasible: boolean,
 *   baselineFeasible: boolean,
 *   feasibilityViolations: string[]
 * }}
 */
export function evaluateSinglePairedObservation(observation, scoringFn = computeScheduleObjectiveScore) {
  if (!observation || typeof observation !== 'object') {
    return {
      valid: false,
      reason: 'Observation must be a valid non-null object.',
      clusterKey: null,
      candidateScore: null,
      baselineScore: null,
      delta: null,
      candidateFeasible: false,
      baselineFeasible: false,
      feasibilityViolations: ['malformed_observation'],
    };
  }

  // 1. Synthetic data exclusion
  if (
    observation.isSynthetic === true ||
    observation.isSyntheticData === true ||
    observation.source === 'synthetic_fixture' ||
    observation.provenance === 'synthetic_sandbox'
  ) {
    return {
      valid: false,
      reason: 'Synthetic demonstration data is excluded from real-user activation evaluation.',
      clusterKey: null,
      candidateScore: null,
      baselineScore: null,
      delta: null,
      candidateFeasible: false,
      baselineFeasible: false,
      feasibilityViolations: [],
    };
  }

  // 2. Cluster key extraction
  const clusterKey = extractClusterKey(observation);
  if (!clusterKey) {
    return {
      valid: false,
      reason: 'Observation is missing scenario or cluster provenance identifier.',
      clusterKey: null,
      candidateScore: null,
      baselineScore: null,
      delta: null,
      candidateFeasible: false,
      baselineFeasible: false,
      feasibilityViolations: ['missing_cluster_provenance'],
    };
  }

  // 3. Pairing verification (same backlog and constraints)
  if (observation.candidateContext && observation.baselineContext) {
    const cCtx = observation.candidateContext;
    const bCtx = observation.baselineContext;
    if (
      cCtx.dailyCapacityHours !== bCtx.dailyCapacityHours ||
      cCtx.planningHorizonDays !== bCtx.planningHorizonDays ||
      cCtx.startDate !== bCtx.startDate
    ) {
      return {
        valid: false,
        reason: 'Observation candidate and baseline constraints do not match (unpaired constraints).',
        clusterKey,
        candidateScore: null,
        baselineScore: null,
        delta: null,
        candidateFeasible: false,
        baselineFeasible: false,
        feasibilityViolations: ['unpaired_constraints'],
      };
    }
  }

  if (observation.candidateTaskSetId && observation.baselineTaskSetId) {
    if (observation.candidateTaskSetId !== observation.baselineTaskSetId) {
      return {
        valid: false,
        reason: 'Observation candidate and baseline task backlog sets do not match (unpaired backlogs).',
        clusterKey,
        candidateScore: null,
        baselineScore: null,
        delta: null,
        candidateFeasible: false,
        baselineFeasible: false,
        feasibilityViolations: ['unpaired_task_backlog'],
      };
    }
  }

  // 4. Resolve candidate and baseline metrics/alternatives
  const candAlt = observation.candidateAlternative || observation.candidateSchedule || observation.candidate;
  const baseAlt = observation.baselineAlternative || observation.baselineSchedule || observation.baseline;

  let candScore = null;
  let baseScore = null;
  let candFeasible = true;
  let baseFeasible = true;
  const violations = [];

  if (candAlt && typeof candAlt === 'object') {
    // Check hard constraints for candidate
    const hasCycle = Boolean(candAlt.cycleDetected || candAlt.metrics?.cycleDetected);
    const infeasiblePlacements = Number(candAlt.infeasiblePlacementsCount ?? candAlt.metrics?.infeasiblePlacementsCount ?? 0);
    const oversizedCount = Number(candAlt.oversizedCount ?? candAlt.metrics?.oversizedCount ?? 0);
    const hasConstraintViolation = candAlt.isConstraintCompliant === false || candAlt.isFeasible === false;

    if (hasCycle || infeasiblePlacements > 0 || oversizedCount > 0 || hasConstraintViolation) {
      candFeasible = false;
      if (hasCycle) violations.push('candidate_dependency_cycle');
      if (infeasiblePlacements > 0) violations.push(`candidate_infeasible_placements_${infeasiblePlacements}`);
      if (oversizedCount > 0) violations.push(`candidate_capacity_overrun_${oversizedCount}`);
    }

    candScore = scoringFn(candAlt);
  } else if (typeof observation.candidateScore === 'number' && isFinite(observation.candidateScore)) {
    candScore = observation.candidateScore;
    if (observation.candidateFeasible === false) {
      candFeasible = false;
      violations.push('candidate_hard_constraint_failure');
    }
  }

  if (baseAlt && typeof baseAlt === 'object') {
    // Check hard constraints for baseline
    const hasCycle = Boolean(baseAlt.cycleDetected || baseAlt.metrics?.cycleDetected);
    const infeasiblePlacements = Number(baseAlt.infeasiblePlacementsCount ?? baseAlt.metrics?.infeasiblePlacementsCount ?? 0);
    const oversizedCount = Number(baseAlt.oversizedCount ?? baseAlt.metrics?.oversizedCount ?? 0);
    const hasConstraintViolation = baseAlt.isConstraintCompliant === false || baseAlt.isFeasible === false;

    if (hasCycle || infeasiblePlacements > 0 || oversizedCount > 0 || hasConstraintViolation) {
      baseFeasible = false;
      if (hasCycle) violations.push('baseline_dependency_cycle');
      if (infeasiblePlacements > 0) violations.push(`baseline_infeasible_placements_${infeasiblePlacements}`);
      if (oversizedCount > 0) violations.push(`baseline_capacity_overrun_${oversizedCount}`);
    }

    baseScore = scoringFn(baseAlt);
  } else if (typeof observation.baselineScore === 'number' && isFinite(observation.baselineScore)) {
    baseScore = observation.baselineScore;
    if (observation.baselineFeasible === false) {
      baseFeasible = false;
      violations.push('baseline_hard_constraint_failure');
    }
  }

  if (typeof candScore !== 'number' || !isFinite(candScore) || typeof baseScore !== 'number' || !isFinite(baseScore)) {
    return {
      valid: false,
      reason: 'Non-finite or missing objective score for candidate or baseline.',
      clusterKey,
      candidateScore: isFinite(candScore) ? candScore : null,
      baselineScore: isFinite(baseScore) ? baseScore : null,
      delta: null,
      candidateFeasible: candFeasible,
      baselineFeasible: baseFeasible,
      feasibilityViolations: violations.concat(['non_finite_scoring']),
    };
  }

  const delta = Math.round((candScore - baseScore) * 1000) / 1000;

  return {
    valid: true,
    reason: null,
    clusterKey,
    candidateScore: candScore,
    baselineScore: baseScore,
    delta,
    candidateFeasible: candFeasible,
    baselineFeasible: baseFeasible,
    feasibilityViolations: violations,
  };
}

/**
 * Runs clustered bootstrap resampling to estimate uncertainty in mean paired score difference.
 *
 * @param {Map<string, Array<{ delta: number }>>} clustersMap - Map of clusterKey -> observations.
 * @param {number} [iterations=DEFAULT_BOOTSTRAP_ITERATIONS] - Number of bootstrap resamples.
 * @param {Function} [prng] - Random number generator returning [0, 1).
 * @returns {{
 *   ciLower: number,
 *   ciUpper: number,
 *   standardError: number,
 *   bootstrapMeans: number[],
 *   iterations: number
 * }}
 */
export function runClusteredBootstrap(
  clustersMap,
  iterations = DEFAULT_BOOTSTRAP_ITERATIONS,
  prng = createMulberry32(42)
) {
  const clusterKeys = Array.from(clustersMap.keys());
  const numClusters = clusterKeys.length;

  if (numClusters < MIN_INDEPENDENT_CLUSTERS) {
    throw new Error(
      `Clustered bootstrap requires at least ${MIN_INDEPENDENT_CLUSTERS} distinct clusters. Received ${numClusters}.`
    );
  }

  const bootstrapMeans = [];

  for (let b = 0; b < iterations; b++) {
    let sumDeltas = 0;
    let countDeltas = 0;

    // Resample clusters with replacement
    for (let c = 0; c < numClusters; c++) {
      const randIdx = Math.floor(prng() * numClusters);
      const chosenClusterKey = clusterKeys[randIdx];
      const clusterObservations = clustersMap.get(chosenClusterKey) || [];

      for (let i = 0; i < clusterObservations.length; i++) {
        sumDeltas += clusterObservations[i].delta;
        countDeltas++;
      }
    }

    const meanB = countDeltas > 0 ? sumDeltas / countDeltas : 0.0;
    bootstrapMeans.push(meanB);
  }

  bootstrapMeans.sort((a, b) => a - b);

  // 95% empirical percentile confidence interval
  const lowerIdx = Math.max(0, Math.floor(0.025 * iterations));
  const upperIdx = Math.min(iterations - 1, Math.floor(0.975 * iterations));

  const ciLower = Math.round(bootstrapMeans[lowerIdx] * 1000) / 1000;
  const ciUpper = Math.round(bootstrapMeans[upperIdx] * 1000) / 1000;

  // Sample standard error of bootstrap estimates
  const grandMean = bootstrapMeans.reduce((acc, v) => acc + v, 0) / iterations;
  const variance = bootstrapMeans.reduce((acc, v) => acc + Math.pow(v - grandMean, 2), 0) / (iterations - 1);
  const standardError = Math.round(Math.sqrt(Math.max(0, variance)) * 1000) / 1000;

  return {
    ciLower,
    ciUpper,
    standardError,
    bootstrapMeans,
    iterations,
  };
}

/**
 * Shadow-only activation-gate evaluator for candidate scheduler weights.
 *
 * @param {Object} params
 * @param {Object} params.candidateWeights - Candidate heuristic weights to evaluate.
 * @param {Object} [params.baselineWeights=FACTORY_SCHEDULER_WEIGHTS] - Authoritative factory weights.
 * @param {Object} [params.candidateSnapshot=null] - Optional configuration snapshot for candidate.
 * @param {Array<Object>} [params.pairedObservations=[]] - Paired comparison observations.
 * @param {Object} [params.readinessReport=null] - Optional output from evaluateLearningReadiness.
 * @param {Object} [params.rollbackPreflight=null] - Optional rollback preflight check result.
 * @param {number} [params.minMeaningfulDelta=DEFAULT_MIN_MEANINGFUL_DELTA] - Minimum effect size epsilon.
 * @param {Function} [params.scoringFn=computeScheduleObjectiveScore] - Schedule objective scoring function.
 * @param {boolean} [params.isSyntheticData=false] - If true, marks evidence synthetic and halts review eligibility.
 * @param {number} [params.randomSeed=42] - Seed for deterministic clustered bootstrap resampling.
 * @returns {Object} Comprehensive, structured activation gate assessment report.
 */
export function evaluateActivationGate({
  candidateWeights,
  baselineWeights = FACTORY_SCHEDULER_WEIGHTS,
  candidateSnapshot = null,
  pairedObservations = [],
  readinessReport = null,
  rollbackPreflight = null,
  minMeaningfulDelta = DEFAULT_MIN_MEANINGFUL_DELTA,
  scoringFn = computeScheduleObjectiveScore,
  isSyntheticData = false,
  randomSeed = 42,
} = {}) {
  const reasons = [];

  // -------------------------------------------------------------------------
  // 1. Candidate Configuration Validation (Audit Boundary)
  // -------------------------------------------------------------------------
  const weightValidation = validateCandidateWeights(candidateWeights);
  const candidateWeightsValid = weightValidation.isValid;

  if (!candidateWeightsValid) {
    reasons.push(
      `Candidate weights failed validation: ${(weightValidation.errors || []).join('; ') || 'Invalid weights'}`
    );
  }

  // Verify baseline weights match factory source of truth
  let factoryBaselineValid = true;
  for (const k of Object.keys(SIMULATION_WEIGHT_BOUNDS)) {
    if (baselineWeights?.[k] !== FACTORY_SCHEDULER_WEIGHTS[k]) {
      factoryBaselineValid = false;
      reasons.push(
        `Baseline weights do not match canonical factory weights: ${k} is ${baselineWeights?.[k]}, expected ${FACTORY_SCHEDULER_WEIGHTS[k]}`
      );
      break;
    }
  }

  // If candidate snapshot is provided, validate its schema and checksum
  let snapshotValid = true;
  if (candidateSnapshot) {
    const snapRes = validateConfigurationSnapshot(candidateSnapshot);
    if (!snapRes.valid) {
      snapshotValid = false;
      reasons.push(`Candidate configuration snapshot failed validation: ${snapRes.error}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Operational Evidence Sufficiency Assessment
  // -------------------------------------------------------------------------
  let operationalReadinessPassed = true;
  let decidedCount = 0;
  let verifiedCompletionsCount = 0;
  let distinctCategoryCount = 0;
  let activeDaysCount = 0;

  if (isSyntheticData) {
    operationalReadinessPassed = false;
    reasons.push('Synthetic demonstration data cannot satisfy real-user readiness or activation gates.');
  } else if (readinessReport) {
    decidedCount = readinessReport.summary?.decidedCount ?? 0;
    verifiedCompletionsCount = readinessReport.summary?.eligibleCompletedCount ?? 0;
    distinctCategoryCount = readinessReport.summary?.distinctCategoryCount ?? 0;
    activeDaysCount = readinessReport.summary?.activeDaysCount ?? 0;

    if (decidedCount < READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS) {
      operationalReadinessPassed = false;
      reasons.push(
        `Decided proposals (${decidedCount}) below operational heuristic threshold of ${READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS}.`
      );
    }
    if (verifiedCompletionsCount < READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS) {
      operationalReadinessPassed = false;
      reasons.push(
        `Verified completions (${verifiedCompletionsCount}) below operational heuristic threshold of ${READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS}.`
      );
    }
    if (distinctCategoryCount < READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES) {
      operationalReadinessPassed = false;
      reasons.push(
        `Distinct task categories (${distinctCategoryCount}) below operational heuristic threshold of ${READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES}.`
      );
    }
    if (activeDaysCount < READINESS_THRESHOLDS.MIN_ACTIVE_DAYS) {
      operationalReadinessPassed = false;
      reasons.push(
        `Active telemetry days (${activeDaysCount}) below operational heuristic threshold of ${READINESS_THRESHOLDS.MIN_ACTIVE_DAYS}.`
      );
    }
  } else {
    // If no readiness report was supplied, mark operational readiness unmet
    operationalReadinessPassed = false;
    reasons.push('Operational learning readiness report was not provided or unavailable.');
  }

  // -------------------------------------------------------------------------
  // 3. Paired Observation Quality & Feasibility Processing
  // -------------------------------------------------------------------------
  const rawPairs = Array.isArray(pairedObservations) ? pairedObservations : [];
  const eligiblePairs = [];
  const excludedPairs = [];
  const candidateViolations = [];
  const baselineViolations = [];
  const clustersMap = new Map();
  const seenPairKeys = new Set();

  let concordantCount = 0;
  let discordantCount = 0;
  let tiedCount = 0;
  let sumDelta = 0;
  let sumCandScore = 0;
  let sumBaseScore = 0;

  for (let i = 0; i < rawPairs.length; i++) {
    const rawObs = rawPairs[i];
    const pairId = rawObs.observationId || rawObs.id || `pair_${i}`;

    // Deduplication check
    if (seenPairKeys.has(pairId)) {
      excludedPairs.push({
        pairId,
        reason: 'duplicate_observation',
      });
      continue;
    }
    seenPairKeys.add(pairId);

    const evalRes = evaluateSinglePairedObservation(rawObs, scoringFn);

    if (!evalRes.valid) {
      excludedPairs.push({
        pairId,
        reason: evalRes.reason,
      });
      continue;
    }

    if (!evalRes.candidateFeasible) {
      candidateViolations.push(...evalRes.feasibilityViolations);
    }
    if (!evalRes.baselineFeasible) {
      baselineViolations.push(...evalRes.feasibilityViolations);
    }

    eligiblePairs.push(evalRes);
    sumDelta += evalRes.delta;
    sumCandScore += evalRes.candidateScore;
    sumBaseScore += evalRes.baselineScore;

    if (evalRes.delta > 0) {
      concordantCount++;
    } else if (evalRes.delta < 0) {
      discordantCount++;
    } else {
      tiedCount++;
    }

    if (!clustersMap.has(evalRes.clusterKey)) {
      clustersMap.set(evalRes.clusterKey, []);
    }
    clustersMap.get(evalRes.clusterKey).push(evalRes);
  }

  const eligibleCount = eligiblePairs.length;
  const distinctClustersCount = clustersMap.size;
  const meanDelta = eligibleCount > 0 ? Math.round((sumDelta / eligibleCount) * 1000) / 1000 : null;
  const candidateMeanScore = eligibleCount > 0 ? Math.round((sumCandScore / eligibleCount) * 1000) / 1000 : null;
  const baselineMeanScore = eligibleCount > 0 ? Math.round((sumBaseScore / eligibleCount) * 1000) / 1000 : null;
  const concordanceProportion = eligibleCount > 0 ? Math.round((concordantCount / eligibleCount) * 1000) / 1000 : null;

  // -------------------------------------------------------------------------
  // 4. Hard Feasibility Gate
  // -------------------------------------------------------------------------
  const candidateHasViolations = candidateViolations.length > 0;
  const baselineHasViolations = baselineViolations.length > 0;
  const feasibilityPassed = !candidateHasViolations && !baselineHasViolations;

  if (candidateHasViolations) {
    reasons.push(
      `Candidate configuration produces hard constraint violations: ${Array.from(new Set(candidateViolations)).join(', ')}`
    );
  }
  if (baselineHasViolations) {
    reasons.push(
      `Baseline configuration produced hard constraint violations on evaluation backlog: ${Array.from(new Set(baselineViolations)).join(', ')}`
    );
  }

  // -------------------------------------------------------------------------
  // 5. Rollback Readiness Gate
  // -------------------------------------------------------------------------
  let rollbackPreflightPassed = true;
  let rollbackDetails = 'Rollback preflight verified.';

  if (!rollbackPreflight) {
    rollbackPreflightPassed = false;
    rollbackDetails = 'Rollback preflight check was not executed or not provided.';
    reasons.push(rollbackDetails);
  } else {
    if (rollbackPreflight.success === false || rollbackPreflight.verified === false) {
      rollbackPreflightPassed = false;
      rollbackDetails = rollbackPreflight.error || 'Rollback preflight check failed.';
      reasons.push(`Rollback preflight failure: ${rollbackDetails}`);
    }
    if (rollbackPreflight.factorySnapshotAvailable === false) {
      rollbackPreflightPassed = false;
      reasons.push('Factory baseline snapshot is missing or unavailable in persistent storage.');
    }
  }

  // -------------------------------------------------------------------------
  // 6. Practical Significance & Uncertainty Estimation
  // -------------------------------------------------------------------------
  const epsilon = typeof minMeaningfulDelta === 'number' && isFinite(minMeaningfulDelta) && minMeaningfulDelta > 0
    ? minMeaningfulDelta
    : DEFAULT_MIN_MEANINGFUL_DELTA;

  const meetsPracticalImprovement = meanDelta != null && meanDelta >= epsilon;

  let canEstimateUncertainty = false;
  let bootstrapResult = null;
  let ciLower = null;
  let ciUpper = null;
  let isCiPositive = false;
  let uncertaintyDisclaimer = '';

  if (eligibleCount < MIN_PAIRED_OBSERVATIONS) {
    uncertaintyDisclaimer = `Eligible paired observations (${eligibleCount}) below minimum required (${MIN_PAIRED_OBSERVATIONS}) for clustered uncertainty estimation.`;
    reasons.push(uncertaintyDisclaimer);
  } else if (distinctClustersCount < MIN_INDEPENDENT_CLUSTERS) {
    uncertaintyDisclaimer = `Distinct scenario clusters (${distinctClustersCount}) below minimum required (${MIN_INDEPENDENT_CLUSTERS}) to adjust for scenario correlation.`;
    reasons.push(uncertaintyDisclaimer);
  } else {
    try {
      const prng = createMulberry32(randomSeed);
      bootstrapResult = runClusteredBootstrap(clustersMap, DEFAULT_BOOTSTRAP_ITERATIONS, prng);
      canEstimateUncertainty = true;
      ciLower = bootstrapResult.ciLower;
      ciUpper = bootstrapResult.ciUpper;
      isCiPositive = ciLower > 0;
      uncertaintyDisclaimer = `Deterministic clustered bootstrap (${DEFAULT_BOOTSTRAP_ITERATIONS} resamples across ${distinctClustersCount} clusters). 95% CI on mean paired difference is [${ciLower}, ${ciUpper}]. Assumes cluster-level exchangeability.`;
    } catch (err) {
      uncertaintyDisclaimer = `Failed to estimate clustered uncertainty: ${err.message}`;
      reasons.push(uncertaintyDisclaimer);
    }
  }

  // Check statistical superiority conditions
  if (meanDelta != null && !meetsPracticalImprovement) {
    reasons.push(
      `Mean paired score improvement (${meanDelta}) is below the practical significance threshold (epsilon = ${epsilon}).`
    );
  }
  if (canEstimateUncertainty && !isCiPositive) {
    reasons.push(
      `Uncertainty interval lower bound (${ciLower}) does not exceed zero; statistically significant superiority not established.`
    );
  }

  // -------------------------------------------------------------------------
  // 7. Outcome Determination
  // -------------------------------------------------------------------------
  let outcome;

  // Rule 1: Infeasible candidates are immediately disqualified
  if (!feasibilityPassed || !candidateWeightsValid || !factoryBaselineValid) {
    outcome = ACTIVATION_GATE_OUTCOMES.INFEASIBLE;
  }
  // Rule 2: Insufficient evidence (operational or paired sample)
  else if (
    !operationalReadinessPassed ||
    eligibleCount < MIN_PAIRED_OBSERVATIONS ||
    distinctClustersCount < MIN_INDEPENDENT_CLUSTERS
  ) {
    outcome = ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE;
  }
  // Rule 3: Rollback readiness failure
  else if (!rollbackPreflightPassed || !snapshotValid) {
    outcome = ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE;
  }
  // Rule 4: Not superior (mean delta < epsilon or CI lower bound <= 0)
  else if (!meetsPracticalImprovement || !canEstimateUncertainty || !isCiPositive) {
    outcome = ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR;
  }
  // Rule 5: Eligible for supervised review (all criteria met)
  else {
    outcome = ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW;
  }

  const isEligibleForSupervisedReview = outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW;

  return {
    outcome,
    isEligibleForSupervisedReview,
    reasons,
    candidateIdentity: candidateSnapshot?.snapshotId || 'candidate_slider_parameters',
    factoryBaselineIdentity: 'canonical_factory_weights_v1',
    evidenceAssessment: {
      operationalReadinessPassed,
      isSyntheticData,
      decidedProposalsCount: decidedCount,
      verifiedCompletionsCount,
      distinctCategoriesCount: distinctCategoryCount,
      activeDaysCount,
      totalObservationsSupplied: rawPairs.length,
      eligibleObservationsCount: eligibleCount,
      excludedObservationsCount: excludedPairs.length,
      excludedPairs,
      distinctClustersCount,
    },
    pairedComparison: {
      primaryEndpoint: 'paired_schedule_quality_score_difference',
      meanDelta,
      minMeaningfulDelta: epsilon,
      meetsPracticalImprovement,
      candidateMeanScore,
      baselineMeanScore,
      concordantCount,
      discordantCount,
      tiedCount,
      concordanceProportion,
      totalPairsEvaluated: eligibleCount,
    },
    uncertainty: {
      method: canEstimateUncertainty ? 'clustered_bootstrap_percentile_95' : null,
      clusterUnit: 'scenario_or_project_group',
      bootstrapIterations: canEstimateUncertainty ? DEFAULT_BOOTSTRAP_ITERATIONS : null,
      ciLower,
      ciUpper,
      confidenceLevel: 0.95,
      isCiPositive,
      canEstimateUncertainty,
      disclaimer: uncertaintyDisclaimer,
    },
    feasibilityGate: {
      passed: feasibilityPassed,
      candidateViolations: Array.from(new Set(candidateViolations)),
      baselineViolations: Array.from(new Set(baselineViolations)),
    },
    rollbackReadinessGate: {
      passed: rollbackPreflightPassed && snapshotValid && candidateWeightsValid,
      candidateWeightsValid,
      factorySnapshotValid: rollbackPreflight?.factorySnapshotAvailable !== false,
      snapshotValid,
      rollbackPreflightVerified: rollbackPreflightPassed,
      details: rollbackDetails,
    },
    methodologyDisclosures: METHODOLOGY_DISCLOSURES,
    productionInvariance: {
      isAdaptationUnlocked: false,
      productionApplied: false,
      factoryWeightsUnchanged: true,
      activeWeights: FACTORY_SCHEDULER_WEIGHTS,
      notice: 'Production scheduling remains strictly invariant. Evaluator is shadow-only.',
    },
  };
}
