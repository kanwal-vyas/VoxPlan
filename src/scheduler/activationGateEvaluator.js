/**
 * VoxPlan Shadow-Only Activation-Gate Evaluator (Phase 7.4 Stage 4A, 4A.1, & 4A.2 Hardening).
 *
 * Implements a pure, deterministic, read-only evaluator that tests whether
 * a candidate scheduler-weight configuration satisfies VoxPlan's documented
 * evidence, quality, feasibility, and rollback-readiness criteria.
 *
 * Strict Production Safety & Invariants (Scope 9 & 10):
 * 1. Read-Only & Shadow Only: Evaluates candidate configurations purely in memory.
 *    Never mutates production scheduler weights, active configuration, or storage.
 * 2. Immutable Factory Baseline: Baseline evaluation always uses FACTORY_SCHEDULER_WEIGHTS.
 * 3. Invariants Preserved: isAdaptationUnlocked === false, productionApplied === false.
 * 4. Eligibility != Deployment: Returning 'eligible_for_supervised_review' means ONLY
 *    that documented audit checks passed. It must NEVER activate learned weights automatically.
 * 5. Methodological Honesty: Distinguishes operational exposure heuristics from formal
 *    statistical inference; uses cluster-aware bootstrap resampling instead of naive
 *    uncorrelated intervals; and never equates concordance with user satisfaction.
 * 6. Minimum-Evidence Policy (Stage 4A.2 Hardening):
 *    - Separates Operational Exposure, Evaluation Evidence, and Statistical Adequacy.
 *    - Enforces MIN_DECISION_CLUSTERS = 5. Small cluster samples (M < 5) provide restricted
 *      combinatorial support (10 multisets for M=3, 35 for M=4) and CANNOT qualify for
 *      supervised review (strictly return INSUFFICIENT_EVIDENCE).
 *    - When 3 <= M < 5, bootstrap interval is computed strictly for exploratory simulation
 *      diagnostics (flagged as isExploratoryOnly: true, isDecisionReady: false).
 *    - Cross-cluster backlog leakage and duplicate backlogs across clusters trigger
 *      conservative INSUFFICIENT_EVIDENCE and invalidate decision readiness.
 *    - Threshold epsilon = 1.0 is explicitly identified as a provisional operational heuristic.
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
 * Status definition for practical improvement threshold.
 */
export const THRESHOLD_STATUS = Object.freeze({
  PROVISIONAL_OPERATIONAL_HEURISTIC: 'provisional_operational_heuristic',
});

/**
 * Default practical improvement threshold (\epsilon) on the 100-point schedule objective scale.
 * Note: 1.0 point is a composite scalarization combining timeliness (+100), delay (-15),
 * utilization (+10), and churn (-20); it must not be conflated with a uniform 1% on-time gain.
 */
export const DEFAULT_MIN_MEANINGFUL_DELTA = 1.0;

export const DEFAULT_THRESHOLD_DISCLAIMER =
  'Threshold epsilon = 1.0 is a provisional operational heuristic combining timeliness, delay, utilization, and churn; it is NOT an empirically validated minimum clinically important difference (MCID) and does not guarantee user satisfaction.';

/**
 * Minimum sample policy constants for statistical evaluation.
 *
 * Operational Heuristics vs Statistical Decision Floors:
 * - MIN_PAIRED_OBSERVATIONS: Operational floor (15 pairs) for paired sample size.
 * - MIN_EXPLORATORY_CLUSTERS: Absolute mathematical floor (3 clusters) to execute exploratory resampling.
 * - MIN_DECISION_CLUSTERS: Conservative decision-readiness floor (5 clusters). When M < 5,
 *   the multiset combinatorics (10 multisets for M=3, 35 for M=4) provide insufficient empirical
 *   resolution for 95% CI coverage, strictly preventing candidate qualification for supervised review.
 */
export const MIN_PAIRED_OBSERVATIONS = MIN_HOLDOUT_SAMPLE; // 15
export const MIN_EXPLORATORY_CLUSTERS = MIN_SCENARIO_GROUPS; // 3
export const MIN_DECISION_CLUSTERS = 5;
export const MIN_INDEPENDENT_CLUSTERS = MIN_DECISION_CLUSTERS; // Exported for backward compatibility
export const DEFAULT_BOOTSTRAP_ITERATIONS = 1000;

/**
 * Methodological disclosures and limitations documentation.
 */
export const METHODOLOGY_DISCLOSURES = Object.freeze([
  'Pairwise concordance with an objective formula measures proxy alignment, NOT proof of superior user satisfaction.',
  'Observations from a single user on task backlogs are correlated; naive unclustered intervals inflate false-positive rates.',
  'A positive point estimate alone does not establish superiority without uncertainty estimation.',
  'Operational exposure heuristics (>= 20 decisions, >= 15 completions) ensure interaction diversity, not asymptotic statistical power.',
  'Eligibility for supervised review authorizes human review only; production activation remains disabled.',
  'A 1.0-point composite score difference (\u03b5 = 1.0) is a provisional multi-attribute operational heuristic combining timeliness, delay, utilization, and churn; it is NOT an empirically validated minimum clinically important difference (MCID).',
  'Decision-readiness requires at least 5 independent clusters (M >= 5). Cluster counts below 5 (e.g. M=3 yields only 10 unique multisets, M=4 yields 35) provide restricted empirical resolution; any bootstrap interval computed with M < 5 is strictly exploratory and disqualified from activation decisions.',
  'Cross-cluster backlog leakage occurs when identical or overlapping backlogs appear under disparate scenario labels, violating cluster exchangeability and invalidating decision readiness.',
  'Nominal 95% bootstrap percentile coverage is a property of repeated sampling under ideal cluster exchangeability; it does not guarantee 95% empirical coverage when cluster sizes are heavily imbalanced or when cluster effects are heavy-tailed or correlated.',
  'The five-cluster threshold (M >= 5) is an operational safeguard against extreme small-sample degeneracy, not an asymptotic statistical guarantee of nominal 95% confidence interval coverage.',
  'Candidate eligibility requires consistency across scenario clusters; positive grand mean deltas driven by an outlier cluster while the majority of clusters regress are disqualified from supervised review.',
  'Composite score gains must not mask critical metric regressions: candidates that cause an unacceptable degradation in primary on-time completion (> 5%) or task delay are disqualified.',
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
 * Computes a canonical task-set fingerprint from an observation's task content.
 *
 * @param {Object} observation
 * @returns {string|null}
 */
export function computeTaskSetFingerprint(observation) {
  if (!observation || typeof observation !== 'object') return null;
  if (observation.taskSetFingerprint) return String(observation.taskSetFingerprint).trim();
  if (observation.context?.taskSetFingerprint) return String(observation.context.taskSetFingerprint).trim();

  const rawTasks =
    observation.tasks ||
    observation.context?.tasks ||
    observation.candidateAlternative?.tasks ||
    observation.candidateAlternative?.schedule ||
    observation.baselineAlternative?.tasks ||
    observation.baselineAlternative?.schedule;

  if (Array.isArray(rawTasks) && rawTasks.length > 0) {
    const ids = rawTasks
      .map((t) => (t && typeof t === 'object' ? (t.id ?? t.taskId ?? t.title) : t))
      .filter((id) => id != null)
      .map(String)
      .sort();
    if (ids.length > 0) {
      return `fp_${ids.join('__')}`;
    }
  }

  const taskIds = observation.taskIds || observation.context?.taskIds;
  if (Array.isArray(taskIds) && taskIds.length > 0) {
    const sorted = taskIds.filter((id) => id != null).map(String).sort();
    if (sorted.length > 0) {
      return `fp_${sorted.join('__')}`;
    }
  }

  return null;
}

/**
 * Validates a single paired evaluation observation.
 * Ensures that candidate and baseline alternatives were evaluated on the same backlog and constraints.
 *
 * @param {Object} observation
 * @param {Function} [scoringFn=computeScheduleObjectiveScore]
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

  const candTaskSet = observation.candidateTaskSetId ?? observation.taskSetId ?? null;
  const baseTaskSet = observation.baselineTaskSetId ?? observation.taskSetId ?? null;
  if (candTaskSet && baseTaskSet && candTaskSet !== baseTaskSet) {
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
    const hasConstraintViolation =
      candAlt.isConstraintCompliant === false ||
      candAlt.isFeasible === false ||
      candAlt.metrics?.isConstraintCompliant === false ||
      candAlt.metrics?.isFeasible === false;

    if (hasCycle || infeasiblePlacements > 0 || oversizedCount > 0 || hasConstraintViolation) {
      candFeasible = false;
      if (hasCycle) violations.push('candidate_dependency_cycle');
      if (infeasiblePlacements > 0) violations.push(`candidate_infeasible_placements_${infeasiblePlacements}`);
      if (oversizedCount > 0) violations.push(`candidate_capacity_overrun_${oversizedCount}`);
      if (hasConstraintViolation && !hasCycle && infeasiblePlacements === 0 && oversizedCount === 0) {
        violations.push('candidate_hard_constraint_failure');
      }
    }

    try {
      candScore = typeof scoringFn === 'function' ? scoringFn(candAlt) : NaN;
    } catch {
      candScore = NaN;
    }
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
    const hasConstraintViolation =
      baseAlt.isConstraintCompliant === false ||
      baseAlt.isFeasible === false ||
      baseAlt.metrics?.isConstraintCompliant === false ||
      baseAlt.metrics?.isFeasible === false;

    if (hasCycle || infeasiblePlacements > 0 || oversizedCount > 0 || hasConstraintViolation) {
      baseFeasible = false;
      if (hasCycle) violations.push('baseline_dependency_cycle');
      if (infeasiblePlacements > 0) violations.push(`baseline_infeasible_placements_${infeasiblePlacements}`);
      if (oversizedCount > 0) violations.push(`baseline_capacity_overrun_${oversizedCount}`);
      if (hasConstraintViolation && !hasCycle && infeasiblePlacements === 0 && oversizedCount === 0) {
        violations.push('baseline_hard_constraint_failure');
      }
    }

    try {
      baseScore = typeof scoringFn === 'function' ? scoringFn(baseAlt) : NaN;
    } catch {
      baseScore = NaN;
    }
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
 *   iterations: number,
 *   numClusters: number,
 *   isSmallClusterSample: boolean,
 *   uniqueMultisetsCount: number|null
 * }}
 */
export function runClusteredBootstrap(
  clustersMap,
  iterations = DEFAULT_BOOTSTRAP_ITERATIONS,
  prng = createMulberry32(42)
) {
  if (!clustersMap || typeof clustersMap.keys !== 'function') {
    throw new Error('clustersMap must be a valid Map instance.');
  }

  const clusterKeys = Array.from(clustersMap.keys());
  const numClusters = clusterKeys.length;

  if (numClusters < MIN_EXPLORATORY_CLUSTERS) {
    throw new Error(
      `Clustered bootstrap requires at least ${MIN_EXPLORATORY_CLUSTERS} distinct clusters. Received ${numClusters}.`
    );
  }

  // Validate that all clusters have non-empty arrays with finite deltas
  for (const k of clusterKeys) {
    const obs = clustersMap.get(k);
    if (!Array.isArray(obs) || obs.length === 0) {
      throw new Error(`Cluster "${k}" is empty or not an array.`);
    }
    for (const item of obs) {
      if (typeof item?.delta !== 'number' || !isFinite(item.delta)) {
        throw new Error(`Cluster "${k}" contains non-finite delta: ${item?.delta}`);
      }
    }
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

  const isSmallClusterSample = numClusters < MIN_DECISION_CLUSTERS;
  const uniqueMultisetsCount =
    numClusters === 3 ? 10 : numClusters === 4 ? 35 : numClusters === 5 ? 126 : null;

  return {
    ciLower,
    ciUpper,
    standardError,
    bootstrapMeans,
    iterations,
    numClusters,
    isSmallClusterSample,
    uniqueMultisetsCount,
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
  // 1. Scoring & Methodology Specification Validation (Scope D & Scope E)
  // -------------------------------------------------------------------------
  const scoringValid = typeof scoringFn === 'function';
  const epsilonValid = typeof minMeaningfulDelta === 'number' && isFinite(minMeaningfulDelta) && minMeaningfulDelta > 0;
  const epsilon = epsilonValid ? minMeaningfulDelta : DEFAULT_MIN_MEANINGFUL_DELTA;

  if (!scoringValid) {
    reasons.push('Invalid schedule objective scoring function provided (must be an executable function).');
  }
  if (!epsilonValid) {
    reasons.push(
      `Invalid practical significance threshold (epsilon = ${minMeaningfulDelta}); must be a finite positive number.`
    );
  }

  const methodologyValid = scoringValid && epsilonValid;

  // -------------------------------------------------------------------------
  // 2. Candidate Configuration Validation (Audit Boundary)
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
  // 3. Operational Evidence Sufficiency Assessment (Policy Pillar 1)
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
  // 4. Paired Observation Quality & Feasibility Processing (Policy Pillar 2)
  // -------------------------------------------------------------------------
  const rawPairs = Array.isArray(pairedObservations) ? pairedObservations : [];
  const eligiblePairs = [];
  const excludedPairs = [];
  const candidateViolations = [];
  const baselineViolations = [];
  const clustersMap = new Map();
  const seenPairKeys = new Set();
  const seenContentKeys = new Set();
  const taskSetClusterMap = new Map();
  let crossClusterLeakageDetected = false;

  let concordantCount = 0;
  let discordantCount = 0;
  let tiedCount = 0;
  let sumDelta = 0;
  let sumCandScore = 0;
  let sumBaseScore = 0;

  // Component-level tracking for non-regression guardrails
  let pairsWithComponentsCount = 0;
  let sumOnTimeDelta = 0;
  let sumDelayDelta = 0;

  for (let i = 0; i < rawPairs.length; i++) {
    const rawObs = rawPairs[i];
    const pairId = rawObs.observationId || rawObs.id || `pair_${i}`;

    // Deduplication check by explicit ID
    if (seenPairKeys.has(pairId)) {
      excludedPairs.push({
        pairId,
        reason: 'duplicate_observation',
      });
      continue;
    }
    seenPairKeys.add(pairId);

    // Cluster key and backlog key extraction
    const clusterKey = extractClusterKey(rawObs);
    const comparisonId =
      rawObs.comparison_id ||
      rawObs.comparisonId ||
      rawObs.context?.comparison_id ||
      rawObs.context?.comparisonId ||
      null;
    const taskSetId =
      rawObs.taskSetId ||
      rawObs.candidateTaskSetId ||
      rawObs.context?.taskSetId ||
      rawObs.backlogId ||
      rawObs.context?.backlogId ||
      null;
    const taskSetFingerprint =
      rawObs.taskSetFingerprint ||
      rawObs.context?.taskSetFingerprint ||
      computeTaskSetFingerprint(rawObs);

    const effectiveBacklogKey = taskSetFingerprint || taskSetId;

    // Deduplication by underlying comparison ID if provided with different superficial observationId
    if (comparisonId) {
      if (seenPairKeys.has(comparisonId)) {
        excludedPairs.push({
          pairId,
          reason: 'duplicate_observation',
        });
        continue;
      }
      seenPairKeys.add(comparisonId);
    }

    // Deduplication by identical backlog task set or fingerprint within cluster (Audit F.5 & Scope D)
    if (effectiveBacklogKey) {
      const clusterBacklogKey = `${clusterKey || 'no_cluster'}::${effectiveBacklogKey}`;
      if (seenContentKeys.has(clusterBacklogKey)) {
        excludedPairs.push({
          pairId,
          reason: 'duplicate_backlog_in_cluster',
        });
        continue;
      }
      seenContentKeys.add(clusterBacklogKey);
    }

    // Cross-cluster backlog leakage detection by taskSetId or task content fingerprint
    if (effectiveBacklogKey && clusterKey) {
      if (taskSetClusterMap.has(effectiveBacklogKey)) {
        const prevCluster = taskSetClusterMap.get(effectiveBacklogKey);
        if (prevCluster !== clusterKey) {
          crossClusterLeakageDetected = true;
          reasons.push(
            `Cross-cluster backlog leakage detected: backlog or fingerprint "${effectiveBacklogKey}" appears in both cluster "${prevCluster}" and "${clusterKey}".`
          );
        }
      } else {
        taskSetClusterMap.set(effectiveBacklogKey, clusterKey);
      }
    }

    const evalRes = evaluateSinglePairedObservation(rawObs, scoringFn);

    if (!evalRes.valid) {
      excludedPairs.push({
        pairId,
        reason: evalRes.reason,
      });
      continue;
    }

    // Feasibility quarantine: Infeasible observations MUST NOT pollute eligible pairs or continuous score metrics!
    if (!evalRes.candidateFeasible || !evalRes.baselineFeasible) {
      if (!evalRes.candidateFeasible) {
        candidateViolations.push(...evalRes.feasibilityViolations);
      }
      if (!evalRes.baselineFeasible) {
        baselineViolations.push(...evalRes.feasibilityViolations);
      }
      excludedPairs.push({
        pairId,
        reason: 'infeasible_schedule_violation',
        violations: evalRes.feasibilityViolations,
      });
      continue;
    }

    eligiblePairs.push(evalRes);
    sumDelta += evalRes.delta;
    sumCandScore += evalRes.candidateScore;
    sumBaseScore += evalRes.baselineScore;

    // Component metric tracking if schedule alternatives provide breakdown
    const candAlt = rawObs.candidateAlternative || rawObs.candidateSchedule || rawObs.candidate;
    const baseAlt = rawObs.baselineAlternative || rawObs.baselineSchedule || rawObs.baseline;
    const candMetrics = candAlt?.metrics || candAlt?.summary;
    const baseMetrics = baseAlt?.metrics || baseAlt?.summary;

    if (candMetrics && baseMetrics) {
      const candTotal = Number(candMetrics.totalTasks ?? 0);
      const candOnTime = Number(candMetrics.onTimeTasksCount ?? 0);
      const candDelayed = Number(candMetrics.delayedTasksCount ?? 0);
      const candDelayDays = candDelayed > 0 ? Number(candMetrics.totalDelayDays ?? 0) / candDelayed : 0;

      const baseTotal = Number(baseMetrics.totalTasks ?? 0);
      const baseOnTime = Number(baseMetrics.onTimeTasksCount ?? 0);
      const baseDelayed = Number(baseMetrics.delayedTasksCount ?? 0);
      const baseDelayDays = baseDelayed > 0 ? Number(baseMetrics.totalDelayDays ?? 0) / baseDelayed : 0;

      if (candTotal > 0 && baseTotal > 0) {
        const candRate = Math.max(0, Math.min(1, candOnTime / candTotal));
        const baseRate = Math.max(0, Math.min(1, baseOnTime / baseTotal));
        sumOnTimeDelta += (candRate - baseRate);
        sumDelayDelta += (candDelayDays - baseDelayDays);
        pairsWithComponentsCount++;
      }
    }

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

  const meanOnTimeDelta = pairsWithComponentsCount > 0
    ? Math.round((sumOnTimeDelta / pairsWithComponentsCount) * 1000) / 1000
    : null;
  const meanDelayDelta = pairsWithComponentsCount > 0
    ? Math.round((sumDelayDelta / pairsWithComponentsCount) * 1000) / 1000
    : null;

  // Critical metric regression guardrail (Scope F):
  // If candidate drops on-time rate by >5% or increases average delay by >1.0 days despite composite gain, flag regression
  let criticalMetricRegressionDetected = false;
  if (pairsWithComponentsCount >= 5) {
    if (meanOnTimeDelta != null && meanOnTimeDelta < -0.05) {
      criticalMetricRegressionDetected = true;
      reasons.push(
        `Critical metric regression detected: candidate composite score gain masks unacceptable degradation in primary on-time completion rate (drop of ${Math.round(Math.abs(meanOnTimeDelta) * 1000) / 10}%).`
      );
    } else if (meanDelayDelta != null && meanDelayDelta > 1.0) {
      criticalMetricRegressionDetected = true;
      reasons.push(
        `Critical metric regression detected: candidate composite score gain masks unacceptable increase in average task delay (+${Math.round(meanDelayDelta * 10) / 10} days).`
      );
    }
  }

  // Outlier cluster dominance guardrail (Scope F):
  // If overall meanDelta is positive but >50% of distinct clusters regress, disqualify candidate
  let outlierClusterDominanceDetected = false;
  if (distinctClustersCount >= MIN_DECISION_CLUSTERS && meanDelta != null && meanDelta > 0) {
    let negativeClusterCount = 0;
    for (const [, clObs] of clustersMap.entries()) {
      const clSum = clObs.reduce((acc, o) => acc + o.delta, 0);
      const clMean = clObs.length > 0 ? clSum / clObs.length : 0;
      if (clMean < 0) {
        negativeClusterCount++;
      }
    }
    if (negativeClusterCount > distinctClustersCount / 2) {
      outlierClusterDominanceDetected = true;
      reasons.push(
        `Outlier cluster dominance detected: positive overall improvement (+${meanDelta}) is driven by outlier cluster(s), while the majority (${negativeClusterCount}/${distinctClustersCount}) of distinct scenario clusters experience quality regression.`
      );
    }
  }

  // Evaluation evidence check under minimum-evidence policy
  const evaluationEvidencePassed =
    eligibleCount >= MIN_PAIRED_OBSERVATIONS &&
    distinctClustersCount >= MIN_DECISION_CLUSTERS &&
    !crossClusterLeakageDetected &&
    !isSyntheticData;

  // -------------------------------------------------------------------------
  // 5. Hard Feasibility Gate
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
  // 6. Rollback Readiness Gate
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
  // 7. Practical Significance & Uncertainty Estimation (Policy Pillar 3)
  // -------------------------------------------------------------------------
  const meetsPracticalImprovement = meanDelta != null && meanDelta >= epsilon;

  let canEstimateUncertainty = false;
  let bootstrapResult = null;
  let ciLower = null;
  let ciUpper = null;
  let isCiPositive = false;
  let uncertaintyDisclaimer = '';

  // Naive unclustered interval for methodology comparison (Audit F.16)
  let naiveStandardError = null;
  let naiveCiLower = null;
  let naiveCiUpper = null;
  if (eligibleCount > 1 && meanDelta != null) {
    const sampleVar = eligiblePairs.reduce((acc, p) => acc + Math.pow(p.delta - meanDelta, 2), 0) / (eligibleCount - 1);
    naiveStandardError = Math.round((Math.sqrt(sampleVar) / Math.sqrt(eligibleCount)) * 1000) / 1000;
    naiveCiLower = Math.round((meanDelta - 1.96 * naiveStandardError) * 1000) / 1000;
    naiveCiUpper = Math.round((meanDelta + 1.96 * naiveStandardError) * 1000) / 1000;
  }

  if (eligibleCount < MIN_PAIRED_OBSERVATIONS) {
    uncertaintyDisclaimer = `Eligible paired observations (${eligibleCount}) below minimum required (${MIN_PAIRED_OBSERVATIONS}) for clustered uncertainty estimation.`;
    reasons.push(uncertaintyDisclaimer);
  }
  if (distinctClustersCount < MIN_EXPLORATORY_CLUSTERS) {
    const clusterDisclaimer = `Distinct scenario clusters (${distinctClustersCount}) below minimum required (${MIN_EXPLORATORY_CLUSTERS}) to adjust for scenario correlation.`;
    reasons.push(clusterDisclaimer);
    if (!uncertaintyDisclaimer) {
      uncertaintyDisclaimer = clusterDisclaimer;
    }
  } else if (distinctClustersCount < MIN_DECISION_CLUSTERS) {
    const smallClusterDisclaimer = `Distinct scenario clusters (${distinctClustersCount}) below decision eligibility minimum (${MIN_DECISION_CLUSTERS}); small cluster count has restricted combinatorial support and cannot support supervised review qualification.`;
    reasons.push(smallClusterDisclaimer);
  }

  if (crossClusterLeakageDetected) {
    reasons.push(
      'Cross-cluster backlog leakage detected; overlapping backlogs violate cluster independence and invalidate decision readiness.'
    );
  }

  // Exploratory bootstrap can run if eligibleCount >= MIN_PAIRED_OBSERVATIONS and distinctClustersCount >= MIN_EXPLORATORY_CLUSTERS
  if (eligibleCount >= MIN_PAIRED_OBSERVATIONS && distinctClustersCount >= MIN_EXPLORATORY_CLUSTERS) {
    try {
      const prng = createMulberry32(randomSeed);
      bootstrapResult = runClusteredBootstrap(clustersMap, DEFAULT_BOOTSTRAP_ITERATIONS, prng);
      canEstimateUncertainty = true;
      ciLower = bootstrapResult.ciLower;
      ciUpper = bootstrapResult.ciUpper;
      isCiPositive = ciLower > 0;

      const isDecisionClusterCount = distinctClustersCount >= MIN_DECISION_CLUSTERS;
      const isDecisionReadyForBootstrap = isDecisionClusterCount && !crossClusterLeakageDetected;

      if (!isDecisionReadyForBootstrap) {
        uncertaintyDisclaimer = `Deterministic clustered bootstrap (${DEFAULT_BOOTSTRAP_ITERATIONS} resamples across ${distinctClustersCount} clusters). 95% CI on mean paired difference is [${ciLower}, ${ciUpper}] (EXPLORATORY ONLY — Not Decision-Ready). Warning: Small cluster count (M=${distinctClustersCount} < ${MIN_DECISION_CLUSTERS}) or cross-cluster leakage restricts combinatorial support (${bootstrapResult.uniqueMultisetsCount ?? 'restricted'} multisets); empirical percentile coverage cannot be guaranteed.`;
      } else {
        uncertaintyDisclaimer = `Deterministic clustered bootstrap (${DEFAULT_BOOTSTRAP_ITERATIONS} resamples across ${distinctClustersCount} clusters). 95% CI on mean paired difference is [${ciLower}, ${ciUpper}]. Assumes cluster-level exchangeability. Decision-ready under minimum-evidence policy.`;
      }
    } catch (err) {
      uncertaintyDisclaimer = `Failed to estimate clustered uncertainty: ${err.message}`;
      reasons.push(uncertaintyDisclaimer);
    }
  }

  const isDecisionReady =
    canEstimateUncertainty &&
    distinctClustersCount >= MIN_DECISION_CLUSTERS &&
    !crossClusterLeakageDetected &&
    eligibleCount >= MIN_PAIRED_OBSERVATIONS &&
    operationalReadinessPassed &&
    rollbackPreflightPassed &&
    snapshotValid &&
    !isSyntheticData;

  // Check statistical superiority conditions (applicable when decision evidence is met)
  if (evaluationEvidencePassed && meanDelta != null && !meetsPracticalImprovement) {
    reasons.push(
      `Mean paired score improvement (${meanDelta}) is below the practical significance threshold (epsilon = ${epsilon}).`
    );
  }
  if (evaluationEvidencePassed && canEstimateUncertainty && !isCiPositive) {
    reasons.push(
      `Uncertainty interval lower bound (${ciLower}) does not exceed zero; statistically significant superiority not established.`
    );
  }

  // -------------------------------------------------------------------------
  // 8. Outcome Determination (Scope E: Strict Order of Precedence)
  // -------------------------------------------------------------------------
  let outcome;

  // Rule 1: Invalid evaluation methodology / scoring / parameters
  if (
    !methodologyValid ||
    (rawPairs.length > 0 && eligibleCount === 0 && excludedPairs.every((p) => p.reason?.includes('Non-finite')))
  ) {
    outcome = ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY;
  }
  // Rule 2: Hard feasibility failures (candidate violations, out-of-bounds weights, baseline violations)
  else if (!feasibilityPassed || !candidateWeightsValid || !factoryBaselineValid) {
    outcome = ACTIVATION_GATE_OUTCOMES.INFEASIBLE;
  }
  // Rule 3: Insufficient evidence under minimum-evidence policy (Scope B & Scope E)
  else if (
    !operationalReadinessPassed ||
    !evaluationEvidencePassed ||
    !rollbackPreflightPassed ||
    !snapshotValid
  ) {
    outcome = ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE;
  }
  // Rule 4: Not superior (evidence is sufficient and candidate is feasible, but superiority criteria are not met)
  else if (
    !meetsPracticalImprovement ||
    !isCiPositive ||
    (meanDelta != null && meanDelta <= 0) ||
    criticalMetricRegressionDetected ||
    outlierClusterDominanceDetected
  ) {
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
    productionApplied: false,
    isAdaptationUnlocked: false,
    evidencePolicy: {
      operationalExposurePassed: operationalReadinessPassed,
      evaluationEvidencePassed,
      statisticalAdequacyPassed: isDecisionReady,
      operationalExposure: {
        passed: operationalReadinessPassed,
        decidedProposalsCount: decidedCount,
        minDecidedRequired: READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS,
        verifiedCompletionsCount,
        minCompletionsRequired: READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS,
        distinctCategoriesCount: distinctCategoryCount,
        minCategoriesRequired: READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES,
        activeDaysCount,
        minActiveDaysRequired: READINESS_THRESHOLDS.MIN_ACTIVE_DAYS,
        purpose: 'Longitudinal interaction diversity and exposure heuristic, NOT formal statistical power.',
      },
      evaluationEvidence: {
        passed: evaluationEvidencePassed,
        totalObservationsSupplied: rawPairs.length,
        eligibleObservationsCount: eligibleCount,
        minPairedObservationsRequired: MIN_PAIRED_OBSERVATIONS,
        distinctClustersCount,
        minDecisionClustersRequired: MIN_DECISION_CLUSTERS,
        minExploratoryClustersRequired: MIN_EXPLORATORY_CLUSTERS,
        excludedObservationsCount: excludedPairs.length,
        excludedPairs,
        crossClusterLeakageDetected,
        isSyntheticData,
      },
      statisticalAdequacy: {
        isDecisionReady,
        isExploratoryOnly: !isDecisionReady && canEstimateUncertainty,
        isSmallClusterSample: distinctClustersCount < MIN_DECISION_CLUSTERS,
        uniqueMultisetsCount: bootstrapResult?.uniqueMultisetsCount ?? null,
        meetsClusterThreshold: distinctClustersCount >= MIN_DECISION_CLUSTERS,
        meetsSampleThreshold: eligibleCount >= MIN_PAIRED_OBSERVATIONS,
        zeroLeakageEnforced: !crossClusterLeakageDetected,
        uncertaintyMethod: canEstimateUncertainty ? 'clustered_bootstrap_percentile_95' : null,
        bootstrapIterations: canEstimateUncertainty ? (bootstrapResult?.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS) : null,
        ciLower,
        ciUpper,
        isCiPositive,
      },
    },
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
      minDecisionClustersRequired: MIN_DECISION_CLUSTERS,
      minExploratoryClustersRequired: MIN_EXPLORATORY_CLUSTERS,
      hasSufficientPairs: eligibleCount >= MIN_PAIRED_OBSERVATIONS,
      hasSufficientClusters: distinctClustersCount >= MIN_DECISION_CLUSTERS,
      crossClusterLeakageDetected,
      isDecisionReady,
    },
    thresholdPolicy: {
      status: THRESHOLD_STATUS.PROVISIONAL_OPERATIONAL_HEURISTIC,
      disclaimer: DEFAULT_THRESHOLD_DISCLAIMER,
      epsilon,
    },
    pairedComparison: {
      primaryEndpoint: 'paired_schedule_quality_score_difference',
      meanDelta,
      minMeaningfulDelta: epsilon,
      thresholdStatus: THRESHOLD_STATUS.PROVISIONAL_OPERATIONAL_HEURISTIC,
      thresholdDisclaimer: DEFAULT_THRESHOLD_DISCLAIMER,
      meetsPracticalImprovement,
      candidateMeanScore,
      baselineMeanScore,
      concordantCount,
      discordantCount,
      tiedCount,
      concordanceProportion,
      totalPairsEvaluated: eligibleCount,
      meanOnTimeDelta,
      meanDelayDelta,
      criticalMetricRegressionDetected,
      outlierClusterDominanceDetected,
    },
    uncertainty: {
      method: canEstimateUncertainty ? 'clustered_bootstrap_percentile_95' : null,
      clusterUnit: 'scenario_or_project_group',
      bootstrapIterations: canEstimateUncertainty ? (bootstrapResult?.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS) : null,
      ciLower,
      ciUpper,
      confidenceLevel: 0.95,
      isCiPositive,
      canEstimateUncertainty,
      isDecisionReady,
      isExploratoryOnly: !isDecisionReady && canEstimateUncertainty,
      isSmallClusterSample: distinctClustersCount < MIN_DECISION_CLUSTERS,
      uniqueMultisetsCount: bootstrapResult?.uniqueMultisetsCount ?? null,
      distinctClustersCount,
      minDecisionClustersRequired: MIN_DECISION_CLUSTERS,
      minExploratoryClustersRequired: MIN_EXPLORATORY_CLUSTERS,
      standardError: bootstrapResult?.standardError ?? null,
      naiveUnclustered: {
        standardError: naiveStandardError,
        ciLower: naiveCiLower,
        ciUpper: naiveCiUpper,
      },
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
