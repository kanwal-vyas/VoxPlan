/**
 * VoxPlan Independent Statistical Validation Harness (Phase 7.4 Stage 4A.3).
 *
 * Provides a dedicated, deterministic, offline simulation and auditing harness
 * to evaluate the statistical properties, confidence interval coverage, false-eligibility
 * rates, cluster independence assumptions, and composite score trade-offs
 * of VoxPlan's shadow-only activation gate evaluator.
 *
 * Invariant Governance:
 * 1. Independent & Offline: Runs in Node.js test infrastructure without touching real telemetry.
 * 2. Ground-Truth Parameterized: Generates controlled paired observation datasets with
 *    explicit known population/cluster treatment effects (\theta).
 * 3. Seed Reproducibility: Uses Mulberry32 deterministic PRNG schedules for 100% reproducible experiments.
 * 4. Production Isolation: Never activates candidate weights or unlocks adaptation.
 */

import {
  evaluateActivationGate,
  ACTIVATION_GATE_OUTCOMES,
  createMulberry32,
} from '../src/scheduler/activationGateEvaluator.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { computeWilsonScoreInterval } from '../src/scheduler/rankingEvaluator.js';

/**
 * Standard Box-Muller transform for generating standard normal deviates.
 *
 * @param {Function} prng - Uniform PRNG returning [0, 1)
 * @returns {number} Standard normal deviate ~ N(0, 1)
 */
export function sampleStandardNormal(prng) {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = prng();
  while (u2 === 0) u2 = prng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Samples from a Student-t distribution with specified degrees of freedom.
 * Provides heavy-tailed deviate generation for non-normal cluster effect audits.
 *
 * @param {number} df - Degrees of freedom (e.g. 3)
 * @param {Function} prng - Uniform PRNG returning [0, 1)
 * @returns {number}
 */
export function sampleStudentT(df, prng) {
  const z = sampleStandardNormal(prng);
  let v = 0;
  for (let i = 0; i < df; i++) {
    const norm = sampleStandardNormal(prng);
    v += norm * norm;
  }
  return z / Math.sqrt(v / df);
}

/**
 * Samples from a skewed log-normal deviate centered around 0.
 *
 * @param {Function} prng - Uniform PRNG returning [0, 1)
 * @returns {number}
 */
export function sampleSkewedDeviate(prng) {
  const z = sampleStandardNormal(prng);
  // Log-normal with mu=0, sigma=0.5 shifted to mean 0
  const logNorm = Math.exp(0.5 * z);
  const expectedMean = Math.exp(0.5 * 0.5 / 2);
  return logNorm - expectedMean;
}

/**
 * Computes a canonical task-set fingerprint from an observation's task content.
 *
 * @param {Object} observation
 * @returns {string|null}
 */
export function computeTaskSetFingerprint(observation) {
  if (!observation || typeof observation !== 'object') return null;
  if (observation.taskSetFingerprint) return String(observation.taskSetFingerprint);
  if (observation.context?.taskSetFingerprint) return String(observation.context.taskSetFingerprint);

  const rawTasks =
    observation.tasks ||
    observation.context?.tasks ||
    observation.candidateAlternative?.tasks ||
    observation.candidateAlternative?.schedule;

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
 * Generates a synthetic evaluation dataset with precisely known ground-truth parameters.
 *
 * Supported Scenarios:
 * 1. Null effect (\theta = 0)
 * 2. Negative effect (\theta < 0)
 * 3. Sub-threshold effect (0 < \theta < \epsilon)
 * 4. Near-threshold effect (\theta \approx \epsilon)
 * 5. Clearly positive effect (\theta \gg \epsilon)
 * 6. Cluster imbalance (clusters of varying sizes)
 * 7. Within-cluster correlation (random cluster intercepts)
 * 8. Cross-cluster dependence (shared latent factor across clusters)
 * 9. Overlapping backlogs (shared task sets across clusters)
 * 10. Repeated backlogs with changed identifiers (relabelled task sets)
 * 11. Outlier clusters (majority negative, single extreme positive)
 * 12. Heterogeneous effects (mixture of positive and negative cluster means)
 * 13. Non-normal cluster effects (heavy-tailed Student-t, skewed)
 * 14. Sparse clusters (M in {3, 4, 5, 6, 8, 10})
 * 15. Invalid evidence (missing values, non-finite scores, constraint violations)
 * 16. Seed reproducibility (fixed seed verification)
 *
 * @param {Object} config
 * @returns {{
 *   pairs: Array<Object>,
 *   groundTruthEffect: number,
 *   expectedClusterMeans: Record<string, number>,
 *   generationConfig: Object
 * }}
 */
export function generateValidationDataset(config = {}) {
  const {
    groundTruthEffect = 0.0,
    clusterCount = 5,
    clusterSizes = null, // e.g. [10, 10, 10, 10, 10] or null for default balanced
    defaultPairsPerCluster = 5,
    withinClusterVariance = 1.0,
    betweenClusterVariance = 0.5,
    withinClusterCorrelation = 0.0, // ICC rho in [0, 1]
    crossClusterDependence = 0.0, // Shared latent shift across all clusters
    outlierClusterIndex = -1,
    outlierClusterEffect = 0.0,
    heterogeneousClusterEffects = null, // Array of effects per cluster
    distribution = 'normal', // 'normal' | 'heavy_tailed' | 'skewed'
    overlappingBacklogsCount = 0, // Number of clusters sharing identical taskSetId
    repeatedBacklogsRelabeled = false, // Share taskSetFingerprint with different IDs
    invalidEvidenceType = null, // 'non_finite' | 'cycle' | 'unpaired_constraints' | null
    componentMetrics = null, // Custom on-time, delay, util, churn adjustments
    randomSeed = 42,
  } = config;

  const prng = createMulberry32(randomSeed);

  // Compute cluster sizes
  const sizes = Array.isArray(clusterSizes) && clusterSizes.length === clusterCount
    ? [...clusterSizes]
    : Array.from({ length: clusterCount }, () => defaultPairsPerCluster);

  const clusterKeys = Array.from({ length: clusterCount }, (_, idx) => `cluster_${idx + 1}`);

  // Latent shared shock for cross-cluster dependence
  const sharedLatentShock = crossClusterDependence > 0
    ? sampleStandardNormal(prng) * crossClusterDependence
    : 0.0;

  // Generate cluster-level random effects
  const expectedClusterMeans = {};
  const clusterRandomEffects = {};

  for (let c = 0; c < clusterCount; c++) {
    const clKey = clusterKeys[c];
    let clusterBaseEffect = groundTruthEffect;

    if (Array.isArray(heterogeneousClusterEffects) && heterogeneousClusterEffects.length > c) {
      clusterBaseEffect = heterogeneousClusterEffects[c];
    } else if (c === outlierClusterIndex) {
      clusterBaseEffect = outlierClusterEffect;
    }

    let clusterShock = 0;
    if (betweenClusterVariance > 0) {
      if (distribution === 'heavy_tailed') {
        clusterShock = sampleStudentT(3, prng) * Math.sqrt(betweenClusterVariance);
      } else if (distribution === 'skewed') {
        clusterShock = sampleSkewedDeviate(prng) * Math.sqrt(betweenClusterVariance);
      } else {
        clusterShock = sampleStandardNormal(prng) * Math.sqrt(betweenClusterVariance);
      }
    }

    // Combine base effect, between-cluster shock, and shared latent shock
    const clEffect = clusterBaseEffect + clusterShock + sharedLatentShock;
    clusterRandomEffects[clKey] = clEffect;
    expectedClusterMeans[clKey] = Math.round(clEffect * 1000) / 1000;
  }

  const pairs = [];
  let pairCounter = 0;

  for (let c = 0; c < clusterCount; c++) {
    const clKey = clusterKeys[c];
    const nInCluster = sizes[c];
    const clEffect = clusterRandomEffects[clKey];

    // Shared backlog ID across first overlappingBacklogsCount clusters
    const isOverlappingCluster = c < overlappingBacklogsCount;

    for (let i = 0; i < nInCluster; i++) {
      pairCounter++;
      const pairId = `obs_${clKey}_${i + 1}`;

      // Within-cluster residual error
      let residual = 0;
      if (withinClusterVariance > 0) {
        if (distribution === 'heavy_tailed') {
          residual = sampleStudentT(3, prng) * Math.sqrt(withinClusterVariance);
        } else if (distribution === 'skewed') {
          residual = sampleSkewedDeviate(prng) * Math.sqrt(withinClusterVariance);
        } else {
          residual = sampleStandardNormal(prng) * Math.sqrt(withinClusterVariance);
        }
      }

      // If withinClusterCorrelation is high, scale residual by (1 - rho)
      if (withinClusterCorrelation > 0) {
        residual = residual * Math.sqrt(Math.max(0, 1.0 - withinClusterCorrelation));
      }

      const delta = Math.round((clEffect + residual) * 1000) / 1000;
      const baselineScore = 80.0;
      const candidateScore = Math.round((baselineScore + delta) * 1000) / 1000;

      // Backlog identity assignment
      let taskSetId = isOverlappingCluster
        ? 'shared_cross_cluster_backlog'
        : `backlog_${clKey}_${i + 1}`;

      // Task set fingerprint
      let taskIds = null;
      let taskSetFingerprint = null;

      if (repeatedBacklogsRelabeled) {
        // Different taskSetId but identical underlying task fingerprint
        taskSetId = `relabeled_taskset_${clKey}_${i + 1}`;
        taskSetFingerprint = 'canonical_fingerprint_fixed_project';
        taskIds = ['task_alpha', 'task_beta', 'task_gamma'];
      } else if (isOverlappingCluster) {
        taskSetFingerprint = 'overlapping_backlog_fingerprint';
        taskIds = ['shared_task_1', 'shared_task_2'];
      } else {
        taskIds = [`task_${clKey}_${i}_a`, `task_${clKey}_${i}_b`];
        taskSetFingerprint = `fp_${taskIds.join('__')}`;
      }

      // Base observation structure
      const obs = {
        observationId: pairId,
        context: {
          scenario_key: clKey,
          dailyCapacityHours: 6.0,
          planningHorizonDays: 7,
          startDate: '2026-10-18',
          taskSetId,
          taskSetFingerprint,
          taskIds,
        },
        candidateContext: {
          dailyCapacityHours: 6.0,
          planningHorizonDays: 7,
          startDate: '2026-10-18',
        },
        baselineContext: {
          dailyCapacityHours: 6.0,
          planningHorizonDays: 7,
          startDate: '2026-10-18',
        },
        candidateScore,
        baselineScore,
        candidateFeasible: true,
        baselineFeasible: true,
        taskSetId,
        taskSetFingerprint,
        taskIds,
        isSynthetic: false, // In harness testing, marked false to assess statistical decision gates
      };

      // Component-level schedule metrics support
      if (componentMetrics) {
        obs.candidateAlternative = {
          cycleDetected: false,
          infeasiblePlacementsCount: 0,
          metrics: {
            totalTasks: 10,
            onTimeTasksCount: componentMetrics.candidateOnTimeCount ?? 9,
            delayedTasksCount: componentMetrics.candidateDelayedCount ?? 1,
            totalDelayDays: componentMetrics.candidateTotalDelayDays ?? 1.0,
            capacityUtilizationPct: componentMetrics.candidateCapacityUtilPct ?? 75.0,
            churnRate: componentMetrics.candidateChurnRate ?? 0.1,
          },
        };
        obs.baselineAlternative = {
          cycleDetected: false,
          infeasiblePlacementsCount: 0,
          metrics: {
            totalTasks: 10,
            onTimeTasksCount: componentMetrics.baselineOnTimeCount ?? 9,
            delayedTasksCount: componentMetrics.baselineDelayedCount ?? 1,
            totalDelayDays: componentMetrics.baselineTotalDelayDays ?? 1.0,
            capacityUtilizationPct: componentMetrics.baselineCapacityUtilPct ?? 75.0,
            churnRate: componentMetrics.baselineChurnRate ?? 0.1,
          },
        };
      }

      // Inject deliberate invalid evidence types
      if (invalidEvidenceType === 'non_finite' && pairCounter === 1) {
        obs.candidateScore = NaN;
      } else if (invalidEvidenceType === 'cycle' && pairCounter === 1) {
        obs.candidateAlternative = { cycleDetected: true };
        obs.candidateFeasible = false;
      } else if (invalidEvidenceType === 'unpaired_constraints' && pairCounter === 1) {
        obs.baselineContext.dailyCapacityHours = 8.0; // Mismatch
      }

      pairs.push(obs);
    }
  }

  return {
    pairs,
    groundTruthEffect,
    expectedClusterMeans,
    generationConfig: config,
  };
}

/**
 * Executes a repeated Monte Carlo simulation experiment to evaluate confidence-interval
 * coverage, false-eligibility, and statistical power under a given scenario configuration.
 *
 * @param {Object} options
 * @param {Object} options.scenarioConfig - Configuration for generateValidationDataset
 * @param {number} [options.numReplications=100] - Number of Monte Carlo replications
 * @param {number} [options.seedStart=1000] - Starting random seed
 * @param {Object} [options.gateOptions] - Custom options passed to evaluateActivationGate
 * @returns {{
 *   replicationsCount: number,
 *   groundTruthEffect: number,
 *   coveredCount: number,
 *   empiricalCoverage: number,
 *   coverageWilsonCI: Object,
 *   eligibilityCount: number,
 *   eligibilityRate: number,
 *   eligibilityWilsonCI: Object,
 *   outcomes: Record<string, number>,
 *   meanObservedDelta: number,
 *   meanCiWidth: number,
 *   averageStandardError: number
 * }}
 */
export function evaluateCoverageExperiment(options = {}) {
  const {
    scenarioConfig = {},
    numReplications = 100,
    seedStart = 1000,
    gateOptions = {},
  } = options;

  const groundTruthEffect = scenarioConfig.groundTruthEffect ?? 0.0;
  let coveredCount = 0;
  let eligibilityCount = 0;
  let sumObservedDeltas = 0;
  let sumCiWidths = 0;
  let sumStandardErrors = 0;
  let validCiEvaluationsCount = 0;

  const outcomes = {
    [ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW]: 0,
    [ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR]: 0,
    [ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE]: 0,
    [ACTIVATION_GATE_OUTCOMES.INFEASIBLE]: 0,
    [ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY]: 0,
  };

  const readinessReport = {
    status: 'ready',
    isAdaptationUnlocked: false,
    summary: {
      decidedCount: 25,
      eligibleCompletedCount: 20,
      distinctCategoryCount: 4,
      activeDaysCount: 18,
    },
  };

  const rollbackPreflight = {
    success: true,
    verified: true,
    factorySnapshotAvailable: true,
    error: null,
  };

  const candidateWeights = {
    urgencyWeight: 52.0,
    priorityWeight: 105.0,
    unblockWeight: 15.0,
    riskWeight: 26.0,
  };

  for (let r = 0; r < numReplications; r++) {
    const seed = seedStart + r;
    const { pairs } = generateValidationDataset({
      ...scenarioConfig,
      randomSeed: seed,
    });

    const res = evaluateActivationGate({
      candidateWeights,
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      readinessReport,
      rollbackPreflight,
      pairedObservations: pairs,
      randomSeed: seed,
      ...gateOptions,
    });

    outcomes[res.outcome] = (outcomes[res.outcome] || 0) + 1;

    if (res.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW) {
      eligibilityCount++;
    }

    if (res.uncertainty && res.uncertainty.canEstimateUncertainty && res.uncertainty.ciLower != null && res.uncertainty.ciUpper != null) {
      validCiEvaluationsCount++;
      const ciLower = res.uncertainty.ciLower;
      const ciUpper = res.uncertainty.ciUpper;
      const width = ciUpper - ciLower;
      sumCiWidths += width;

      if (res.uncertainty.standardError != null) {
        sumStandardErrors += res.uncertainty.standardError;
      }

      if (res.pairedComparison.meanDelta != null) {
        sumObservedDeltas += res.pairedComparison.meanDelta;
      }

      // Check whether empirical interval covers known ground-truth effect
      if (ciLower <= groundTruthEffect && groundTruthEffect <= ciUpper) {
        coveredCount++;
      }
    }
  }

  const empiricalCoverage = validCiEvaluationsCount > 0
    ? Math.round((coveredCount / validCiEvaluationsCount) * 1000) / 1000
    : 0.0;

  const coverageWilsonCI = computeWilsonScoreInterval(coveredCount, validCiEvaluationsCount, 0.95);

  const eligibilityRate = numReplications > 0
    ? Math.round((eligibilityCount / numReplications) * 1000) / 1000
    : 0.0;

  const eligibilityWilsonCI = computeWilsonScoreInterval(eligibilityCount, numReplications, 0.95);

  const meanObservedDelta = validCiEvaluationsCount > 0
    ? Math.round((sumObservedDeltas / validCiEvaluationsCount) * 1000) / 1000
    : null;

  const meanCiWidth = validCiEvaluationsCount > 0
    ? Math.round((sumCiWidths / validCiEvaluationsCount) * 1000) / 1000
    : null;

  const averageStandardError = validCiEvaluationsCount > 0
    ? Math.round((sumStandardErrors / validCiEvaluationsCount) * 1000) / 1000
    : null;

  return {
    replicationsCount: numReplications,
    validCiEvaluationsCount,
    groundTruthEffect,
    coveredCount,
    empiricalCoverage,
    coverageWilsonCI,
    eligibilityCount,
    eligibilityRate,
    eligibilityWilsonCI,
    outcomes,
    meanObservedDelta,
    meanCiWidth,
    averageStandardError,
  };
}
