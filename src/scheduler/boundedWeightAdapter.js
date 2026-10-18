/**
 * VoxPlan Bounded Heuristic Weight Adaptation & Bayesian Shrinkage (Phase 7, Stage 3).
 *
 * Implements an isolated, mathematically defensible, pure-functional candidate-weight
 * evaluation layer that computes bounded heuristic scheduler weights using empirical-Bayes
 * shrinkage anchored to factory defaults.
 *
 * Strict Scope & Safety Boundaries (Phase 7.3):
 * 1. Shadow-Evaluation Only: Candidate weights are evaluated offline in memory. They NEVER
 *    replace factory weights in production schedule generation.
 * 2. Immutable Factory Defaults: Production scheduling continues using FACTORY_SCHEDULER_WEIGHTS.
 * 3. Authoritative Readiness Gating: When Phase 7.1 readiness is unmet, adaptation remains
 *    strictly locked; no personalized weights are certified.
 * 4. Empirical-Bayes Shrinkage: Anchors candidate weights to baseline prior with K_prior = 10
 *    pseudo-observations. Weak or sparse data shrinks strongly toward factory defaults.
 * 5. Hard Safety Clamp: Candidate weights are strictly clamped to ±20% of their factory baseline:
 *    0.80 * w_0 <= w_candidate <= 1.20 * w_0.
 * 6. Conflict Quarantine: Opposing or contradictory signals safely quarantine affected weights
 *    back to factory baseline.
 * 7. Pure and Local-First: Zero browser storage side-effects, zero telemetry side-effects,
 *    and zero external network requests.
 */

import { FACTORY_SCHEDULER_WEIGHTS } from './adaptiveScheduler.js';
import { EVIDENCE_LEVELS } from './preferenceAnalyzer.js';

/**
 * Prior sample size (pseudo-observations) anchoring empirical evidence to factory baseline.
 * K_prior = 10 represents 10 baseline observations. With N < 10, baseline prior dominates (>50%).
 */
export const DEFAULT_K_PRIOR = 10;

/**
 * Hard parameter clamp: maximum allowable relative change from factory baseline.
 * Guarantees that no adapted weight may deviate by more than ±20% from baseline defaults.
 */
export const MAX_RELATIVE_WEIGHT_DELTA = 0.20;

/**
 * Status enumeration for candidate weight evaluation.
 */
export const ADAPTATION_EVALUATION_STATUS = Object.freeze({
  INSUFFICIENT_READINESS: 'insufficient_readiness',
  READY_FOR_SHADOW_EVALUATION: 'ready_for_shadow_evaluation',
  UNAVAILABLE: 'unavailable',
});

/**
 * Computes precision-weighted Bayesian posterior mean for a scheduler weight.
 *
 * Mathematical Model:
 * Conjugate Normal-Normal / Empirical-Bayes estimator where K_prior represents
 * effective prior observations anchoring to baseline weight w_0:
 *
 *   w_post = (K_prior * w_0 + N * w_empirical) / (K_prior + N)
 *
 * Properties:
 * - When N = 0: w_post = w_0 (100% factory baseline).
 * - When N is small (e.g. N = 3): w_post is heavily shrunk toward w_0 (76.9% baseline).
 * - When N -> inf: w_post -> w_empirical (subject to safety clamp).
 *
 * @param {Object} params
 * @param {number} params.baselineWeight - Factory default weight w_0 (> 0).
 * @param {number} params.empiricalWeight - Implied weight from observed behavioral signal.
 * @param {number} params.observationCount - Number of independent qualifying observations N.
 * @param {number} [params.kPrior=DEFAULT_K_PRIOR] - Prior sample strength K_prior.
 * @returns {number} Shrunk pre-clamp candidate weight.
 */
export function computeBayesianPosteriorWeight({
  baselineWeight,
  empiricalWeight,
  observationCount,
  kPrior = DEFAULT_K_PRIOR,
}) {
  if (typeof baselineWeight !== 'number' || !isFinite(baselineWeight) || baselineWeight <= 0) {
    throw new Error(`Invalid baseline weight: ${baselineWeight}. Must be a finite positive number.`);
  }

  // If no eligible observations or invalid empirical weight, retain baseline exactly
  if (
    typeof observationCount !== 'number' ||
    !isFinite(observationCount) ||
    observationCount <= 0 ||
    typeof empiricalWeight !== 'number' ||
    !isFinite(empiricalWeight) ||
    empiricalWeight <= 0
  ) {
    return baselineWeight;
  }

  const k = typeof kPrior === 'number' && isFinite(kPrior) && kPrior > 0
    ? kPrior
    : DEFAULT_K_PRIOR;

  const numerator = (k * baselineWeight) + (observationCount * empiricalWeight);
  const denominator = k + observationCount;

  return numerator / denominator;
}

/**
 * Clamps a candidate weight to within documented relative bounds against factory baseline.
 *
 * For a positive baseline w_0, enforces:
 *   w_min = w_0 * (1 - maxRelativeDelta)
 *   w_max = w_0 * (1 + maxRelativeDelta)
 *   w_clamped = min(w_max, max(w_min, candidateWeight))
 *
 * @param {Object} params
 * @param {number} params.candidateWeight - Shrunk candidate weight.
 * @param {number} params.baselineWeight - Factory baseline weight.
 * @param {number} [params.maxRelativeDelta=MAX_RELATIVE_WEIGHT_DELTA] - Max fractional change (0.20 = ±20%).
 * @returns {{
 *   postClampValue: number,
 *   isClamped: boolean,
 *   minBound: number,
 *   maxBound: number,
 *   relativeDeltaPct: number,
 * }}
 */
export function clampWeightDelta({
  candidateWeight,
  baselineWeight,
  maxRelativeDelta = MAX_RELATIVE_WEIGHT_DELTA,
}) {
  if (typeof baselineWeight !== 'number' || !isFinite(baselineWeight) || baselineWeight <= 0) {
    throw new Error(`Invalid baseline weight: ${baselineWeight}. Must be a finite positive number.`);
  }

  const delta = typeof maxRelativeDelta === 'number' && isFinite(maxRelativeDelta) && maxRelativeDelta > 0
    ? maxRelativeDelta
    : MAX_RELATIVE_WEIGHT_DELTA;

  const minBound = Math.round(baselineWeight * (1.0 - delta) * 100) / 100;
  const maxBound = Math.round(baselineWeight * (1.0 + delta) * 100) / 100;

  const rawCandidate = typeof candidateWeight === 'number' && isFinite(candidateWeight)
    ? candidateWeight
    : baselineWeight;

  const isClampedBelow = rawCandidate < minBound;
  const isClampedAbove = rawCandidate > maxBound;
  const isClamped = isClampedBelow || isClampedAbove;

  const clamped = Math.min(maxBound, Math.max(minBound, rawCandidate));
  const postClampValue = Math.round(clamped * 100) / 100;
  const relativeDeltaPct = Math.round(((postClampValue - baselineWeight) / baselineWeight) * 1000) / 10;

  return {
    postClampValue,
    isClamped,
    isClampedBelow,
    isClampedAbove,
    minBound,
    maxBound,
    relativeDeltaPct,
  };
}

/**
 * Evaluates candidate scheduler heuristic weights using empirical-Bayes shrinkage
 * and strict parameter bounds, fully isolated from production scheduling.
 *
 * @param {Object} params
 * @param {Object} [params.baselineWeights=FACTORY_SCHEDULER_WEIGHTS] - Factory baseline weights.
 * @param {Object} [params.preferenceReport=null] - Output from analyzePreferenceSignals.
 * @param {Object} [params.readiness=null] - Output from evaluateLearningReadiness.
 * @param {number} [params.kPrior=DEFAULT_K_PRIOR] - Bayesian shrinkage prior constant.
 * @param {number} [params.maxRelativeDelta=MAX_RELATIVE_WEIGHT_DELTA] - Safety clamp bound.
 * @param {boolean} [params.isTestSandbox=false] - When true, computes diagnostic candidate in isolation even if readiness is unmet.
 * @returns {Object} Structured shadow-evaluation candidate report.
 */
export function computeBoundedCandidateWeights({
  baselineWeights = FACTORY_SCHEDULER_WEIGHTS,
  preferenceReport = null,
  readiness = null,
  kPrior = DEFAULT_K_PRIOR,
  maxRelativeDelta = MAX_RELATIVE_WEIGHT_DELTA,
  isTestSandbox = false,
} = {}) {
  const evaluationTimestamp = new Date().toISOString();

  // Validate baseline weights
  const base = {
    urgencyWeight: baselineWeights?.urgencyWeight ?? FACTORY_SCHEDULER_WEIGHTS.urgencyWeight,
    priorityWeight: baselineWeights?.priorityWeight ?? FACTORY_SCHEDULER_WEIGHTS.priorityWeight,
    unblockWeight: baselineWeights?.unblockWeight ?? FACTORY_SCHEDULER_WEIGHTS.unblockWeight,
    riskWeight: baselineWeights?.riskWeight ?? FACTORY_SCHEDULER_WEIGHTS.riskWeight,
  };

  const isReadinessMet = readiness?.status === 'ready';
  const unmetGates = [];
  if (readiness?.gates) {
    if (!readiness.gates.decidedProposals?.passed) unmetGates.push('decidedProposals');
    if (!readiness.gates.verifiedCompletions?.passed) unmetGates.push('verifiedCompletions');
    if (!readiness.gates.taskCategories?.passed) unmetGates.push('taskCategories');
    if (!readiness.gates.activeDuration?.passed) unmetGates.push('activeDuration');
  }

  // Unsupported mappings tracking
  const unsupportedMappings = [
    {
      signalFamily: 'proposal_decision_friction',
      name: 'Proposal Discard Friction',
      reason: 'non_specific_heuristic_friction',
      explanation: 'Discard frequency reflects general proposal adoption friction, but cannot attribute cause to urgency, priority, or capacity without explicit debrief feedback.',
    },
    {
      signalFamily: 'category_effort_underestimation',
      name: 'Category Effort Overrun',
      reason: 'duration_multiplier_not_priority_weight',
      explanation: 'Category underestimation signals an effort duration multiplier (W_friction), not a ready-queue ordering score weight.',
    },
    {
      signalFamily: 'day_of_week_focus_realism',
      name: 'Weekday Completion Velocity Dip',
      reason: 'daily_capacity_not_priority_weight',
      explanation: 'Day-of-week velocity dips map to daily capacity adjustments, not ready-queue heuristic scoring.',
    },
    {
      signalFamily: 'intraday_window_friction',
      name: 'Intraday Time-Window Movement Friction',
      reason: 'missing_intraday_window_provenance',
      explanation: 'Intraday provenance is absent in event store schema; signal is unavailable.',
    },
  ];

  const conflictingSignals = [];

  // Per-weight diagnostics map
  const weightDiagnostics = {
    urgencyWeight: {
      coefficient: 'urgencyWeight',
      baseline: base.urgencyWeight,
      preClamp: base.urgencyWeight,
      postClamp: base.urgencyWeight,
      isClamped: false,
      relativeChangePct: 0.0,
      supported: false,
      reason: 'no_eligible_urgency_friction_signal',
      rationale: 'Urgency weight remains at factory baseline; no verified on-time deadline friction signal is eligible.',
      sampleSize: 0,
      minBound: Math.round(base.urgencyWeight * (1 - maxRelativeDelta) * 100) / 100,
      maxBound: Math.round(base.urgencyWeight * (1 + maxRelativeDelta) * 100) / 100,
    },
    priorityWeight: {
      coefficient: 'priorityWeight',
      baseline: base.priorityWeight,
      preClamp: base.priorityWeight,
      postClamp: base.priorityWeight,
      isClamped: false,
      relativeChangePct: 0.0,
      supported: false,
      reason: 'awaiting_eligible_postponement_friction',
      rationale: 'Priority tier weight remains at factory baseline.',
      sampleSize: 0,
      minBound: Math.round(base.priorityWeight * (1 - maxRelativeDelta) * 100) / 100,
      maxBound: Math.round(base.priorityWeight * (1 + maxRelativeDelta) * 100) / 100,
    },
    unblockWeight: {
      coefficient: 'unblockWeight',
      baseline: base.unblockWeight,
      preClamp: base.unblockWeight,
      postClamp: base.unblockWeight,
      isClamped: false,
      relativeChangePct: 0.0,
      supported: false,
      reason: 'no_dependency_friction_signal',
      rationale: 'Critical path unblocking weight remains at factory baseline; no dependency unblocking friction signal is defined in Phase 7.2.',
      sampleSize: 0,
      minBound: Math.round(base.unblockWeight * (1 - maxRelativeDelta) * 100) / 100,
      maxBound: Math.round(base.unblockWeight * (1 + maxRelativeDelta) * 100) / 100,
    },
    riskWeight: {
      coefficient: 'riskWeight',
      baseline: base.riskWeight,
      preClamp: base.riskWeight,
      postClamp: base.riskWeight,
      isClamped: false,
      relativeChangePct: 0.0,
      supported: false,
      reason: 'no_ml_risk_calibration_signal',
      rationale: 'Secondary guarded risk weight remains at factory baseline.',
      sampleSize: 0,
      minBound: Math.round(base.riskWeight * (1 - maxRelativeDelta) * 100) / 100,
      maxBound: Math.round(base.riskWeight * (1 + maxRelativeDelta) * 100) / 100,
    },
  };

  // If readiness is unmet and not in isolated test sandbox, strictly return factory baseline
  if (!isReadinessMet && !isTestSandbox) {
    return {
      schemaVersion: '1.0.0',
      evaluationTimestamp,
      readinessStatus: ADAPTATION_EVALUATION_STATUS.INSUFFICIENT_READINESS,
      readinessGateStatus: readiness ? readiness.status : 'insufficient_evidence',
      isReadinessMet: false,
      isAdaptationUnlocked: false, // Strict governance: NEVER true
      productionApplied: false,    // Strict governance: NEVER true
      isShadowOnly: true,
      unmetGates,
      baselineWeights: { ...base },
      candidateWeights: { ...base }, // 100% factory baseline
      weightDiagnostics,
      shrinkageParameters: {
        kPrior,
        interpretation: 'Effective prior pseudo-observations anchoring candidate to factory baseline (K_prior = 10)',
        clampRange: '±20% relative to factory baseline',
      },
      unsupportedMappings,
      conflictingSignals,
      governance: {
        noProductionWeightsModified: true,
        shadowEvaluationOnly: true,
        disclosure: 'Adaptation is strictly locked. Phase 7.1 readiness gates are unmet. All candidate weights remain identical to factory baseline.',
      },
    };
  }

  // When readiness is met OR in isolated test sandbox: evaluate eligible candidate signals
  const candidateSignals = Array.isArray(preferenceReport?.candidateSignals)
    ? preferenceReport.candidateSignals
    : [];

  // Evaluate Priority Weight Adaptation from Postponement Friction Signals
  const postponementSignals = candidateSignals.filter(
    (s) => s.family === 'postponement_friction' && (isTestSandbox || (!s.isPreliminary && (s.evidenceLevel === EVIDENCE_LEVELS.REPEATED_OBSERVATION || s.evidenceLevel === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION)))
  );

  if (postponementSignals.length > 0) {
    // Check for conflicting postponement signals (e.g. High priority postponed but Low priority also postponed)
    const highPostponed = postponementSignals.find((s) => s.id.includes('high'));
    const lowPostponed = postponementSignals.find((s) => s.id.includes('low'));

    if (highPostponed && lowPostponed) {
      // Conflicting signals across priority tiers: quarantine to baseline
      conflictingSignals.push({
        weight: 'priorityWeight',
        signalIds: [highPostponed.id, lowPostponed.id],
        reason: 'opposing_tier_postponement_directions',
        action: 'quarantine_to_baseline',
      });
      weightDiagnostics.priorityWeight.reason = 'conflict_quarantine';
      weightDiagnostics.priorityWeight.rationale = 'Conflicting postponement signals across both High and Low priority tiers. Priority weight quarantined to factory baseline.';
    } else if (highPostponed) {
      // High priority tasks are repeatedly postponed: indicates priority tier spacing is too aggressive
      // relative to calendar urgency/feasibility. Implied empirical downward adjustment:
      const N = highPostponed.supportingEvidenceCount || highPostponed.denominator || 3;
      const postponedRate = highPostponed.denominator > 0
        ? (highPostponed.supportingEvidenceCount / highPostponed.denominator)
        : 0.60;

      // Implied empirical weight scales down proportionally to excess postponement:
      // w_empirical = w_0 * (1.0 - (postponedRate - 0.50))
      // e.g. for 70% postponed, factor = 0.80 -> empirical = 80.0
      const empiricalFactor = Math.max(0.70, 1.0 - (postponedRate - 0.50));
      const empiricalWeight = base.priorityWeight * empiricalFactor;

      const preClamp = computeBayesianPosteriorWeight({
        baselineWeight: base.priorityWeight,
        empiricalWeight,
        observationCount: N,
        kPrior,
      });

      const clampResult = clampWeightDelta({
        candidateWeight: preClamp,
        baselineWeight: base.priorityWeight,
        maxRelativeDelta,
      });

      weightDiagnostics.priorityWeight = {
        coefficient: 'priorityWeight',
        baseline: base.priorityWeight,
        preClamp: Math.round(preClamp * 100) / 100,
        postClamp: clampResult.postClampValue,
        isClamped: clampResult.isClamped,
        relativeChangePct: clampResult.relativeDeltaPct,
        supported: true,
        signalId: highPostponed.id,
        sampleSize: N,
        rationale: `Derived from ${N} high-priority forward postponements. Bayesian shrinkage (K=${kPrior}) moderated empirical ${empiricalWeight.toFixed(1)} to candidate ${clampResult.postClampValue}.`,
        minBound: clampResult.minBound,
        maxBound: clampResult.maxBound,
      };
    }
  }

  // Compile candidate weights vector
  const candidateWeights = {
    urgencyWeight: weightDiagnostics.urgencyWeight.postClamp,
    priorityWeight: weightDiagnostics.priorityWeight.postClamp,
    unblockWeight: weightDiagnostics.unblockWeight.postClamp,
    riskWeight: weightDiagnostics.riskWeight.postClamp,
  };

  return {
    schemaVersion: '1.0.0',
    evaluationTimestamp,
    readinessStatus: isReadinessMet
      ? ADAPTATION_EVALUATION_STATUS.READY_FOR_SHADOW_EVALUATION
      : ADAPTATION_EVALUATION_STATUS.INSUFFICIENT_READINESS,
    isReadinessMet,
    isAdaptationUnlocked: false, // Strict governance: NEVER true
    productionApplied: false,    // Strict governance: NEVER true
    isShadowOnly: true,
    unmetGates,
    baselineWeights: { ...base },
    candidateWeights,
    weightDiagnostics,
    shrinkageParameters: {
      kPrior,
      interpretation: 'Effective prior pseudo-observations anchoring candidate to factory baseline (K_prior = 10)',
      clampRange: '±20% relative to factory baseline',
    },
    unsupportedMappings,
    conflictingSignals,
    governance: {
      noProductionWeightsModified: true,
      shadowEvaluationOnly: true,
      disclosure: 'Candidate weights are computed for shadow simulation only. Factory weights remain 100% active in production schedule generation.',
    },
  };
}
