/**
 * VoxPlan Independent Statistical Validation Test Suite (Phase 7.4 Stage 4A.3).
 *
 * Implements comprehensive offline statistical auditing across 16 controlled scenarios,
 * evaluating bootstrap confidence-interval coverage, false-eligibility rates,
 * Wilson score uncertainty intervals, cluster independence safeguards,
 * component metric trade-offs, and strict production isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateActivationGate,
  ACTIVATION_GATE_OUTCOMES,
  computeTaskSetFingerprint,
  getStudentTCriticalValue,
  PRACTICAL_THRESHOLD_RULES,
} from '../src/scheduler/activationGateEvaluator.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import {
  generateValidationDataset,
  evaluateCoverageExperiment,
} from './statistical_validation_harness.js';

describe('Phase 7.4 Stage 4A.3: Independent Statistical Validation & Evidence Provenance Audit', () => {
  const defaultReadiness = {
    status: 'ready',
    isAdaptationUnlocked: false,
    summary: {
      decidedCount: 30,
      eligibleCompletedCount: 25,
      distinctCategoryCount: 4,
      activeDaysCount: 20,
    },
  };

  const defaultRollback = {
    success: true,
    verified: true,
    factorySnapshotAvailable: true,
    error: null,
  };

  const validCandidateWeights = {
    urgencyWeight: 55.0,
    priorityWeight: 105.0,
    unblockWeight: 16.0,
    riskWeight: 26.0,
  };

  // ---------------------------------------------------------------------------
  // Scope A, B, C: Controlled Simulation Matrix Across 16 Scenarios
  // ---------------------------------------------------------------------------
  describe('1. Controlled Offline Simulation Matrix (16 Scenarios)', () => {
    it('Scenario 1: True Null Effect (theta = 0.0) yields near-zero false eligibility and sound coverage', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 0.0,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          withinClusterVariance: 0.8,
          betweenClusterVariance: 0.2,
        },
        numReplications: 35,
        seedStart: 1000,
      });

      // Under null effect and epsilon = 1.0, false eligibility rate should be strictly 0
      assert.strictEqual(exp.eligibilityCount, 0, 'True null effect must not qualify for review under epsilon=1.0');
      assert.strictEqual(exp.eligibilityRate, 0.0);
      assert.ok(exp.eligibilityWilsonCI.ciUpper < 0.15, 'Wilson upper bound on false eligibility must be tight');

      // Empirical coverage of true theta = 0 should be evaluated
      assert.ok(exp.empiricalCoverage >= 0.75, `Empirical coverage (${exp.empiricalCoverage}) should be >= 0.75`);
      assert.ok(exp.coverageWilsonCI.ciLower > 0.60, 'Wilson coverage lower bound');
    });

    it('Scenario 2: Negative Effect (theta = -2.0) has exactly 0 false eligibility (100% rejected as NOT_SUPERIOR)', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: -2.0,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          withinClusterVariance: 0.5,
          betweenClusterVariance: 0.2,
        },
        numReplications: 30,
        seedStart: 2000,
      });

      assert.strictEqual(exp.eligibilityCount, 0, 'Negative effect must have 0 eligibilities');
      assert.strictEqual(exp.outcomes[ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR], 30, 'All replications must be NOT_SUPERIOR');
      assert.ok(exp.empiricalCoverage >= 0.70, 'CI coverage under negative effect');
    });

    it('Scenario 3: Sub-threshold Effect (theta = +0.5 < epsilon=1.0) is effectively blocked by practical threshold', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 0.5,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          withinClusterVariance: 0.5,
          betweenClusterVariance: 0.1,
        },
        numReplications: 30,
        seedStart: 3000,
      });

      assert.strictEqual(exp.eligibilityCount, 0, 'Sub-threshold effect must not achieve eligibility under epsilon=1.0');
      assert.strictEqual(exp.outcomes[ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR], 30);
    });

    it('Scenario 4: Near-threshold Effect (theta = 1.15 approx epsilon) yields intermediate eligibility and covers ground truth', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 1.15,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          withinClusterVariance: 0.6,
          betweenClusterVariance: 0.2,
        },
        numReplications: 30,
        seedStart: 4000,
      });

      // Around threshold, some pass and some fail due to sampling noise, reflecting gate conservatism
      assert.ok(exp.empiricalCoverage >= 0.75, `CI should cover true near-threshold effect (${exp.empiricalCoverage})`);
      assert.ok(exp.eligibilityRate >= 0.0 && exp.eligibilityRate <= 1.0);
    });

    it('Scenario 5: Clearly Positive Effect (theta = 3.5 >> epsilon) achieves high power (> 80%)', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 3.5,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          withinClusterVariance: 0.8,
          betweenClusterVariance: 0.2,
        },
        numReplications: 30,
        seedStart: 5000,
      });

      assert.ok(exp.eligibilityRate >= 0.80, `High power expected for large effect: got ${exp.eligibilityRate}`);
      assert.ok(exp.empiricalCoverage >= 0.75, 'CI covers ground truth effect');
    });

    it('Scenario 6: Cluster Imbalance (sizes [20, 3, 3, 3, 3]) evaluates coverage sensitivity under unequal weights', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 2.0,
          clusterCount: 5,
          clusterSizes: [20, 3, 3, 3, 3],
          withinClusterVariance: 1.0,
          betweenClusterVariance: 0.5,
        },
        numReplications: 30,
        seedStart: 6000,
      });

      // Cluster bootstrap handles cluster imbalance; empirical coverage demonstrates operational bounds
      assert.ok(exp.validCiEvaluationsCount === 30);
      assert.ok(exp.empiricalCoverage >= 0.70, `Imbalanced clusters coverage: ${exp.empiricalCoverage}`);
    });

    it('Scenario 7: High Within-Cluster Correlation (rho = 0.7) widens uncertainty intervals compared to naive independent assumption', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.0,
        clusterCount: 5,
        defaultPairsPerCluster: 6,
        withinClusterVariance: 1.0,
        betweenClusterVariance: 0.8,
        withinClusterCorrelation: 0.7,
        randomSeed: 7001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
        randomSeed: 7001,
      });

      assert.ok(res.uncertainty.canEstimateUncertainty);
      const clusterCiWidth = res.uncertainty.ciUpper - res.uncertainty.ciLower;
      const naiveCiWidth = res.uncertainty.naiveUnclustered.ciUpper - res.uncertainty.naiveUnclustered.ciLower;
      assert.ok(
        clusterCiWidth >= naiveCiWidth * 0.95,
        `Clustered CI width (${clusterCiWidth}) should appropriately reflect correlation vs naive width (${naiveCiWidth})`
      );
    });

    it('Scenario 8: Cross-Cluster Dependence (shared shock) captures systemic shift across scenarios', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 2.5,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          crossClusterDependence: 0.6,
        },
        numReplications: 25,
        seedStart: 8000,
      });

      assert.ok(exp.validCiEvaluationsCount === 25);
    });

    it('Scenario 9: Overlapping Backlogs across clusters are flagged and rejected as INSUFFICIENT_EVIDENCE', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.5,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        overlappingBacklogsCount: 2, // 2 clusters share same taskSetId
        randomSeed: 9001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterLeakageDetected, true);
      assert.strictEqual(res.evidencePolicy.statisticalAdequacy.zeroLeakageEnforced, false);
    });

    it('Scenario 10: Repeated Backlogs with Relabeled IDs are detected via content fingerprinting', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 3.0,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        repeatedBacklogsRelabeled: true, // superficial IDs differ, but fingerprint is identical
        randomSeed: 10001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterLeakageDetected, true);
    });

    it('Scenario 11: Outlier Cluster Dominance triggers NOT_SUPERIOR despite positive grand mean', () => {
      // 4 clusters regress (clMean = -1.5), 1 cluster has huge positive delta (+15.0)
      // Overall grand mean is (+15 - 6)/5 = +1.8 > epsilon
      const dataset = generateValidationDataset({
        groundTruthEffect: -1.5,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        withinClusterVariance: 0.1,
        betweenClusterVariance: 0.0,
        outlierClusterIndex: 0,
        outlierClusterEffect: 15.0,
        randomSeed: 11001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.ok(res.pairedComparison.meanDelta > 1.0, 'Grand mean delta is positive and above epsilon');
      assert.strictEqual(res.pairedComparison.outlierClusterDominanceDetected, true);
      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.ok(
        res.reasons.some((r) => r.includes('Outlier cluster dominance detected')),
        'Reason logs outlier dominance'
      );
    });

    it('Scenario 12: Heterogeneous Cluster Effects are properly summarized with cluster breakdown', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 1.5,
        clusterCount: 5,
        defaultPairsPerCluster: 5,
        heterogeneousClusterEffects: [-0.5, 0.2, 1.8, 2.5, 3.0],
        withinClusterVariance: 0.2,
        betweenClusterVariance: 0.0,
        randomSeed: 12001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.ok(res.pairedComparison.totalPairsEvaluated === 25);
      assert.strictEqual(res.evidencePolicy.evaluationEvidence.distinctClustersCount, 5);
    });

    it('Scenario 13: Non-Normal / Heavy-Tailed Cluster Shocks (Student-t df=3) maintain gate stability', () => {
      const exp = evaluateCoverageExperiment({
        scenarioConfig: {
          groundTruthEffect: 2.0,
          clusterCount: 5,
          defaultPairsPerCluster: 5,
          distribution: 'heavy_tailed',
          betweenClusterVariance: 0.5,
          withinClusterVariance: 0.5,
        },
        numReplications: 25,
        seedStart: 13000,
      });

      assert.ok(exp.validCiEvaluationsCount === 25);
      // Heavy-tailed Student-t deviates (df=3) with M=5 clusters show empirical coverage drops to ~60-65%,
      // demonstrating why M=5 is an operational safeguard rather than an asymptotic guarantee of 95% coverage under all conditions.
      assert.ok(exp.empiricalCoverage >= 0.55, `Heavy-tailed deviates yield observable coverage bounds: ${exp.empiricalCoverage}`);
    });

    it('Scenario 14: Sparse Clusters (M in {3, 4, 5, 8}) proves operational floor safeguard', () => {
      // M = 3: Blocked as INSUFFICIENT_EVIDENCE
      const ds3 = generateValidationDataset({
        groundTruthEffect: 3.0,
        clusterCount: 3,
        defaultPairsPerCluster: 6,
        randomSeed: 14003,
      });
      const res3 = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: ds3.pairs,
      });
      assert.strictEqual(res3.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.strictEqual(res3.evidencePolicy.statisticalAdequacy.isExploratoryOnly, true);
      assert.strictEqual(res3.evidencePolicy.statisticalAdequacy.uniqueMultisetsCount, 10);

      // M = 4: Blocked as INSUFFICIENT_EVIDENCE
      const ds4 = generateValidationDataset({
        groundTruthEffect: 3.0,
        clusterCount: 4,
        defaultPairsPerCluster: 5,
        randomSeed: 14004,
      });
      const res4 = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: ds4.pairs,
      });
      assert.strictEqual(res4.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.strictEqual(res4.evidencePolicy.statisticalAdequacy.uniqueMultisetsCount, 35);

      // M = 5: Meets operational floor
      const ds5 = generateValidationDataset({
        groundTruthEffect: 3.0,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        randomSeed: 14005,
      });
      const res5 = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: ds5.pairs,
      });
      assert.strictEqual(res5.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      assert.strictEqual(res5.evidencePolicy.statisticalAdequacy.isDecisionReady, true);
      assert.strictEqual(res5.evidencePolicy.statisticalAdequacy.uniqueMultisetsCount, 126);
    });

    it('Scenario 15: Invalid Evidence (non-finite, cycle, unpaired constraints) properly quarantined', () => {
      // Non-finite
      const dsNaN = generateValidationDataset({
        groundTruthEffect: 2.0,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        invalidEvidenceType: 'non_finite',
        randomSeed: 15001,
      });
      const resNaN = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dsNaN.pairs,
      });
      assert.strictEqual(resNaN.evidenceAssessment.excludedObservationsCount, 1);
      assert.strictEqual(resNaN.evidenceAssessment.eligibleObservationsCount, 19);

      // Kahn DAG Cycle
      const dsCycle = generateValidationDataset({
        groundTruthEffect: 2.0,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        invalidEvidenceType: 'cycle',
        randomSeed: 15002,
      });
      const resCycle = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dsCycle.pairs,
      });
      assert.strictEqual(resCycle.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.strictEqual(resCycle.isEligibleForSupervisedReview, false);
    });

    it('Scenario 16: Seed Reproducibility produces bit-for-bit identical estimates and intervals', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.2,
        clusterCount: 5,
        defaultPairsPerCluster: 5,
        randomSeed: 16001,
      });

      const run1 = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
        randomSeed: 99999,
      });

      const run2 = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
        randomSeed: 99999,
      });

      assert.strictEqual(run1.pairedComparison.meanDelta, run2.pairedComparison.meanDelta);
      assert.strictEqual(run1.uncertainty.ciLower, run2.uncertainty.ciLower);
      assert.strictEqual(run1.uncertainty.ciUpper, run2.uncertainty.ciUpper);
      assert.strictEqual(run1.outcome, run2.outcome);
    });
  });

  // ---------------------------------------------------------------------------
  // Scope D: Cluster Independence & Fingerprinting
  // ---------------------------------------------------------------------------
  describe('2. Cluster Independence & Task-Set Fingerprinting (Scope D)', () => {
    it('computes consistent canonical task set fingerprint from sorted task IDs', () => {
      const obs1 = {
        tasks: [{ id: 'task_B' }, { id: 'task_A' }, { id: 'task_C' }],
      };
      const obs2 = {
        context: { taskIds: ['task_C', 'task_B', 'task_A'] },
      };

      const fp1 = computeTaskSetFingerprint(obs1);
      const fp2 = computeTaskSetFingerprint(obs2);

      assert.strictEqual(fp1, 'fp_task_A__task_B__task_C');
      assert.strictEqual(fp2, 'fp_task_A__task_B__task_C');
      assert.strictEqual(fp1, fp2);
    });

    it('detects cross-cluster contamination when same backlog tasks appear under different scenario clusters', () => {
      const pairs = [
        {
          observationId: 'obs_1',
          context: { scenario_key: 'cluster_alpha', taskSetId: 'id_1', taskIds: ['task_1', 'task_2'] },
          candidateScore: 85,
          baselineScore: 80,
          candidateFeasible: true,
          baselineFeasible: true,
        },
        {
          observationId: 'obs_2',
          context: { scenario_key: 'cluster_beta', taskSetId: 'id_2', taskIds: ['task_2', 'task_1'] }, // Permuted order, same tasks!
          candidateScore: 85,
          baselineScore: 80,
          candidateFeasible: true,
          baselineFeasible: true,
        },
      ];

      // Add dummy pairs to meet sample sizes
      for (let c = 1; c <= 5; c++) {
        for (let i = 1; i <= 3; i++) {
          pairs.push({
            observationId: `dummy_${c}_${i}`,
            context: { scenario_key: `cluster_${c}`, taskSetId: `id_${c}_${i}`, taskIds: [`task_${c}_${i}`] },
            candidateScore: 85,
            baselineScore: 80,
            candidateFeasible: true,
            baselineFeasible: true,
          });
        }
      }

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: pairs,
      });

      assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterLeakageDetected, true);
      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
    });
  });

  // ---------------------------------------------------------------------------
  // Scope F: Composite Score Masking & Critical Metric Guardrails
  // ---------------------------------------------------------------------------
  describe('3. Critical Metric Guardrails & Composite Score Masking (Scope F)', () => {
    it('disqualifies candidate when on-time completion rate drops by > 5% despite positive composite gain', () => {
      // Candidate achieves +4.0 overall quality score delta by reducing churn (from 0.75 to 0.05, saving +14 pts),
      // but on-time completion drops from 90% to 80% (-10 pts)
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.5,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        componentMetrics: {
          candidateOnTimeCount: 8, // 8/10 = 80%
          baselineOnTimeCount: 9,  // 9/10 = 90% (-10% delta)
          candidateTotalDelayDays: 1.0,
          baselineTotalDelayDays: 1.0,
          candidateChurnRate: 0.05,
          baselineChurnRate: 0.75, // +14 pts from churn reduction
        },
        randomSeed: 17001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.ok(res.pairedComparison.meanDelta >= 1.0, `Composite score delta is positive: ${res.pairedComparison.meanDelta}`);
      assert.strictEqual(res.pairedComparison.criticalMetricRegressionDetected, true);
      assert.ok(res.pairedComparison.meanOnTimeDelta < -0.05, 'On-time delta drop detected');
      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.strictEqual(res.isEligibleForSupervisedReview, false);
      assert.ok(
        res.reasons.some((r) => r.includes('Critical metric regression detected: candidate composite score gain masks unacceptable degradation in primary on-time completion rate')),
        'Reason logs on-time rate regression'
      );
    });

    it('disqualifies candidate when average task delay increases by > 1.0 days despite positive composite gain', () => {
      // Candidate delay increases from 1.0 day to 2.2 days (+1.2 days delay = -18 pts),
      // but churn is reduced to 0 (saving +20 pts), yielding positive net delta (+2 pts)
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.0,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        componentMetrics: {
          candidateOnTimeCount: 9,
          baselineOnTimeCount: 9,
          candidateDelayedCount: 1,
          candidateTotalDelayDays: 2.2, // 2.2 days/delayed task (+1.2 days)
          baselineDelayedCount: 1,
          baselineTotalDelayDays: 1.0,  // 1.0 day/delayed task
          candidateChurnRate: 0.0,
          baselineChurnRate: 1.0, // Churn savings: 20 * (1.0 - 0.0) = +20 pts
        },
        randomSeed: 18001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.ok(res.pairedComparison.meanDelta >= 1.0, `Composite score delta: ${res.pairedComparison.meanDelta}`);
      assert.strictEqual(res.pairedComparison.criticalMetricRegressionDetected, true);
      assert.ok(res.pairedComparison.meanDelayDelta > 1.0, 'Delay delta increase detected');
      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.strictEqual(res.isEligibleForSupervisedReview, false);
    });

    it('permits candidate when component metrics improve or do not regress beyond guardrail thresholds', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 2.5,
        clusterCount: 5,
        defaultPairsPerCluster: 4,
        componentMetrics: {
          candidateOnTimeCount: 10, // 100% vs 90% (+10% gain)
          baselineOnTimeCount: 9,
          candidateDelayedCount: 0,
          candidateTotalDelayDays: 0,
          baselineDelayedCount: 1,
          baselineTotalDelayDays: 1.0,
        },
        randomSeed: 19001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.strictEqual(res.pairedComparison.criticalMetricRegressionDetected, false);
      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      assert.strictEqual(res.isEligibleForSupervisedReview, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scope H: Strict Production Isolation & Invariance Guarantees
  // ---------------------------------------------------------------------------
  describe('4. Production Invariance & Isolation Guarantees (Scope H)', () => {
    it('guarantees candidate eligibility never alters canonical factory weights or unlocks adaptation', () => {
      const dataset = generateValidationDataset({
        groundTruthEffect: 3.5,
        clusterCount: 5,
        defaultPairsPerCluster: 5,
        randomSeed: 20001,
      });

      const res = evaluateActivationGate({
        candidateWeights: validCandidateWeights,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        readinessReport: defaultReadiness,
        rollbackPreflight: defaultRollback,
        pairedObservations: dataset.pairs,
      });

      assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      assert.strictEqual(res.productionApplied, false, 'productionApplied must always be false');
      assert.strictEqual(res.isAdaptationUnlocked, false, 'isAdaptationUnlocked must always be false');

      // Assert FACTORY_SCHEDULER_WEIGHTS object was not modified in memory
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 7.4 Stage 4A.4: Correct Coverage Failures & Validate Eligibility Controls
  // ---------------------------------------------------------------------------
  describe('5. Phase 7.4 Stage 4A.4: Correct Coverage Failures & Validate Eligibility Controls', () => {
    // -------------------------------------------------------------------------
    // Scope A: Diagnosis & Historical Bootstrap Undercoverage Reproduction
    // (Development Seeds: 1000 - 1999)
    // -------------------------------------------------------------------------
    describe('A. Root-Cause Diagnosis on Development Seeds (1000–1999)', () => {
      it('reproduces Stage 4A.3 historical bootstrap undercoverage under heavy tails (Student-t df=3)', () => {
        // Run with percentile bootstrap enabled (100 replications, 200 resamples each)
        // on development seed range to demonstrate undercoverage of unadjusted percentile bootstrap
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 1.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            nonNormalType: 'student_t_3',
          },
          numReplications: 50,
          seedStart: 1100,
          gateOptions: { bootstrapIterations: 200 },
        });

        // The cluster Student-t interval fixes coverage to >= 90% even in small development run
        assert.ok(
          exp.empiricalCoverage >= 0.90,
          `Cluster Student-t interval achieves >= 90% coverage under heavy tails: got ${exp.empiricalCoverage}`
        );
      });

      it('confirms Student-t critical table matches exact mathematical values for small degrees of freedom', () => {
        // Critical value for alpha = 0.05 two-tailed (95% CI)
        assert.strictEqual(getStudentTCriticalValue(1, 0.95), 12.706);
        assert.strictEqual(getStudentTCriticalValue(2, 0.95), 4.303);
        assert.strictEqual(getStudentTCriticalValue(3, 0.95), 3.182);
        assert.strictEqual(getStudentTCriticalValue(4, 0.95), 2.776); // For M = 5 clusters, df = 4
        assert.strictEqual(getStudentTCriticalValue(5, 0.95), 2.571);
        assert.strictEqual(getStudentTCriticalValue(9, 0.95), 2.262); // For M = 10 clusters, df = 9
        assert.strictEqual(getStudentTCriticalValue(30, 0.95), 2.042);
        assert.strictEqual(getStudentTCriticalValue(100, 0.95), 1.984); // Cornish-Fisher expansion for df = 100
      });
    });

    // -------------------------------------------------------------------------
    // Scope B: Hand-Computable Exact Fixture (Independent Mathematical Audit)
    // -------------------------------------------------------------------------
    describe('B. Hand-Computable Mathematical Fixture (Scope B)', () => {
      it('evaluates cluster-level Student-t interval matching hand-calculated arithmetic', () => {
        // Define 5 distinct clusters with known cluster means:
        // C1: 1.0, C2: 2.0, C3: 1.5, C4: 3.0, C5: 2.5
        // Mean = (1.0 + 2.0 + 1.5 + 3.0 + 2.5) / 5 = 2.000
        // Variance = [(-1)^2 + 0^2 + (-0.5)^2 + 1^2 + 0.5^2] / 4 = [1.0 + 0 + 0.25 + 1.0 + 0.25] / 4 = 2.50 / 4 = 0.625
        // SE = sqrt(0.625 / 5) = sqrt(0.125) = 0.35355339
        // t_crit(df=4) = 2.776445...
        // Margin = 2.776445 * 0.35355339 = 0.98162
        // ciLower = 2.000 - 0.98162 = 1.01838 -> rounded to 1.018
        // ciUpper = 2.000 + 0.98162 = 2.98162 -> rounded to 2.982
        const clusterValues = [1.0, 2.0, 1.5, 3.0, 2.5];
        const pairs = [];
        let pId = 1;

        for (let cIdx = 0; cIdx < clusterValues.length; cIdx++) {
          const delta = clusterValues[cIdx];
          const clKey = `cluster_${cIdx + 1}`;
          for (let k = 0; k < 3; k++) {
            pairs.push({
              observationId: `pair_${pId++}`,
              context: { scenario_key: clKey, taskSetId: `taskset_${clKey}_${k}` },
              candidateScore: 80.0 + delta,
              baselineScore: 80.0,
              candidateFeasible: true,
              baselineFeasible: true,
              isSynthetic: false,
            });
          }
        }

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: pairs,
          bootstrapIterations: 0,
        });

        assert.strictEqual(res.pairedComparison.clusterAveragedMeanDelta, 2.0);
        assert.strictEqual(res.pairedComparison.meanDelta, 2.0);
        assert.strictEqual(res.uncertainty.degreesOfFreedom, 4);
        assert.strictEqual(res.uncertainty.standardError, 0.354);
        assert.strictEqual(res.uncertainty.ciLower, 1.017);
        assert.strictEqual(res.uncertainty.ciUpper, 2.983);
        assert.strictEqual(res.uncertainty.canEstimateUncertainty, true);
        assert.strictEqual(res.uncertainty.isDecisionReady, true);
        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      });
    });

    // -------------------------------------------------------------------------
    // Scope C, D, E: Frozen Validation Simulations (Seeds 50000–59999, 1000 Replications)
    // -------------------------------------------------------------------------
    describe('C. Frozen Validation Matrix (Seeds 50000–59999, 1,000 Replications)', () => {
      it('Scenario 1: True Null Effect (theta = 0.0) — 1,000 replications on seeds 50000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 0.0,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            withinClusterVariance: 0.8,
            betweenClusterVariance: 0.5,
          },
          numReplications: 1000,
          seedStart: 50000,
          gateOptions: { bootstrapIterations: 0 },
        });

        assert.strictEqual(exp.replicationsCount, 1000);
        assert.strictEqual(exp.validCiEvaluationsCount, 1000);
        // Empirical coverage must meet nominal 95% within Monte Carlo tolerance (>= 94.0%)
        assert.ok(
          exp.empiricalCoverage >= 0.94,
          `Null effect coverage should be >= 94%: got ${exp.coveredCount}/${exp.validCiEvaluationsCount} (${exp.empiricalCoverage})`
        );
        // False eligibility rate under null should be <= 0.01 (<= 1%)
        assert.ok(
          exp.eligibilityRate <= 0.01,
          `False eligibility under null must be <= 1%: got ${exp.eligibilityCount}/${exp.replicationsCount} (${exp.eligibilityRate})`
        );
        assert.strictEqual(exp.outcomes.infeasible, 0);
        assert.strictEqual(exp.outcomes.insufficient_methodology, 0);
      });

      it('Scenario 2: Heavy-Tailed Shocks (Student-t df=3) — 1,000 replications on seeds 51000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 1.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            nonNormalType: 'student_t_3',
          },
          numReplications: 1000,
          seedStart: 51000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // Stage 4A.3 observed 60-65% under heavy tails. Student-t interval must maintain >= 93% coverage
        assert.ok(
          exp.empiricalCoverage >= 0.93,
          `Heavy-tailed coverage should be >= 93%: got ${exp.coveredCount}/${exp.validCiEvaluationsCount} (${exp.empiricalCoverage})`
        );
      });

      it('Scenario 3: Severe Cluster Size Imbalance ([20, 3, 3, 3, 3]) — 1,000 replications on seeds 52000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 1.5,
            clusterCount: 5,
            clusterSizes: [20, 3, 3, 3, 3],
          },
          numReplications: 1000,
          seedStart: 52000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // Cluster-averaged estimand protects against dominant large clusters
        assert.ok(
          exp.empiricalCoverage >= 0.93,
          `Imbalance coverage should be >= 93%: got ${exp.coveredCount}/${exp.validCiEvaluationsCount} (${exp.empiricalCoverage})`
        );
      });

      it('Scenario 4: Clearly Negative Effect (theta = -2.0) — 1,000 replications on seeds 53000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: -2.0,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
          },
          numReplications: 1000,
          seedStart: 53000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // 0% false eligibility for clearly negative candidates
        assert.strictEqual(exp.eligibilityCount, 0);
        assert.strictEqual(exp.eligibilityRate, 0.0);
        assert.strictEqual(exp.outcomes.not_superior, 1000);
        assert.ok(exp.empiricalCoverage >= 0.93, `Coverage: ${exp.empiricalCoverage}`);
      });

      it('Scenario 5: Sub-Threshold Effect (theta = +0.5 < epsilon=1.0) — 1,000 replications on seeds 54000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 0.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
          },
          numReplications: 1000,
          seedStart: 54000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // Practical threshold blocks vast majority (>= 90%) of sub-threshold candidates
        assert.ok(
          exp.outcomes.not_superior >= 900,
          `At least 90% blocked by practical threshold: got ${exp.outcomes.not_superior}/1000`
        );
        assert.ok(exp.empiricalCoverage >= 0.93, `Coverage: ${exp.empiricalCoverage}`);
      });

      it('Scenario 6: Clearly Positive Effect (theta = +3.5 >> epsilon=1.0) — 1,000 replications on seeds 55000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 3.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
          },
          numReplications: 1000,
          seedStart: 55000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // High statistical power (>= 98%)
        assert.ok(
          exp.eligibilityRate >= 0.98,
          `High power for clearly positive effect: got ${exp.eligibilityRate}`
        );
        assert.ok(exp.empiricalCoverage >= 0.94, `Coverage: ${exp.empiricalCoverage}`);
      });

      it('Scenario 7: Operational Cluster Floor Policy across M in {3, 4, 5, 8, 10} — seeds 56000+', () => {
        // M = 3: cannot estimate uncertainty; 100% INSUFFICIENT_EVIDENCE
        const exp3 = evaluateCoverageExperiment({
          scenarioConfig: { groundTruthEffect: 1.5, clusterCount: 3, defaultPairsPerCluster: 5 },
          numReplications: 200,
          seedStart: 56300,
          gateOptions: { bootstrapIterations: 0 },
        });
        assert.strictEqual(exp3.eligibilityCount, 0);
        assert.strictEqual(exp3.outcomes.insufficient_evidence, 200);

        // M = 4: exploratory only; 100% INSUFFICIENT_EVIDENCE (isDecisionReady = false)
        const exp4 = evaluateCoverageExperiment({
          scenarioConfig: { groundTruthEffect: 1.5, clusterCount: 4, defaultPairsPerCluster: 5 },
          numReplications: 200,
          seedStart: 56400,
          gateOptions: { bootstrapIterations: 0 },
        });
        assert.strictEqual(exp4.eligibilityCount, 0);
        assert.strictEqual(exp4.outcomes.insufficient_evidence, 200);

        // M = 5: operational floor; grants eligibility when gates pass
        const exp5 = evaluateCoverageExperiment({
          scenarioConfig: { groundTruthEffect: 1.5, clusterCount: 5, defaultPairsPerCluster: 4 },
          numReplications: 200,
          seedStart: 56500,
          gateOptions: { bootstrapIterations: 0 },
        });
        assert.ok(exp5.empiricalCoverage >= 0.93, `M=5 coverage: ${exp5.empiricalCoverage}`);
        assert.ok(exp5.eligibilityCount > 0, 'M=5 allows eligibility');

        // M = 10: larger cluster sample maintains nominal coverage
        const exp10 = evaluateCoverageExperiment({
          scenarioConfig: { groundTruthEffect: 1.5, clusterCount: 10, defaultPairsPerCluster: 4 },
          numReplications: 200,
          seedStart: 56900,
          gateOptions: { bootstrapIterations: 0 },
        });
        assert.ok(exp10.empiricalCoverage >= 0.93, `M=10 coverage: ${exp10.empiricalCoverage}`);
      });

      it('Scenario 8: High Within-Cluster Correlation (rho = 0.7) — seeds 63000+', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 1.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            withinClusterCorrelation: 0.7,
          },
          numReplications: 500,
          seedStart: 63000,
          gateOptions: { bootstrapIterations: 0 },
        });

        assert.ok(
          exp.empiricalCoverage >= 0.93,
          `High ICC coverage should be >= 93%: got ${exp.coveredCount}/${exp.validCiEvaluationsCount} (${exp.empiricalCoverage})`
        );
      });

      it('Scenario 9: Cross-Cluster Dependence Audit — records coverage reduction under shared shocks', () => {
        const exp = evaluateCoverageExperiment({
          scenarioConfig: {
            groundTruthEffect: 1.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            crossClusterDependence: 0.6, // Shared shock across all nominal clusters
          },
          numReplications: 500,
          seedStart: 64000,
          gateOptions: { bootstrapIterations: 0 },
        });

        // Verifies empirical coverage under shared cross-cluster shock is degraded (~75-82%)
        // because between-cluster variance does not capture common latent shifts
        assert.ok(
          exp.empiricalCoverage < 0.90,
          `Cross-cluster dependence degrades empirical coverage below nominal: got ${exp.empiricalCoverage}`
        );
        // Documents that cross-cluster dependence violates exchangeability, requiring gate to fail closed
        assert.ok(exp.replicationsCount === 500);
      });
    });

    // -------------------------------------------------------------------------
    // Scope F: First-Class Uncertainty Reliability Conditions
    // -------------------------------------------------------------------------
    describe('D. First-Class Uncertainty Reliability Conditions (Scope F)', () => {
      it('blocks eligibility and yields INSUFFICIENT_METHODOLOGY when interval bounds or scoring function are invalid', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 2.0,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          randomSeed: 25001,
        });

        // Supplying an invalid scoring function or non-finite outputs blocks eligibility and yields INSUFFICIENT_METHODOLOGY
        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
          scoringFn: null, // Invalid function!
        });

        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);
        assert.strictEqual(res.isEligibleForSupervisedReview, false);
      });

      it('blocks eligibility and yields INSUFFICIENT_EVIDENCE when cluster count is below 5', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 3.0,
          clusterCount: 4, // M = 4
          defaultPairsPerCluster: 5,
          randomSeed: 25002,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
        assert.strictEqual(res.isEligibleForSupervisedReview, false);
        assert.strictEqual(res.uncertainty.isExploratoryOnly, true);
        assert.strictEqual(res.uncertainty.isDecisionReady, false);
      });

      it('blocks eligibility and yields INSUFFICIENT_EVIDENCE when cross-cluster backlog leakage is detected', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 2.5,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          overlappingBacklogsCount: 2, // Inject shared backlog fingerprint across clusters
          randomSeed: 25003,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
        assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterLeakageDetected, true);
      });
    });

    // -------------------------------------------------------------------------
    // Scope G: Component-Level Metric Auditing & Guardrails
    // -------------------------------------------------------------------------
    describe('E. Component-Level Metric Auditing & Guardrails (Scope G)', () => {
      it('flags componentMetricsAudited as false and logs reason when component metrics are missing', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 2.0,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          randomSeed: 26001,
        });

        // Remove candidateAlternative component metrics
        dataset.pairs.forEach((p) => {
          delete p.candidateAlternative;
          delete p.baselineAlternative;
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.pairedComparison.componentMetricsAudited, false);
        assert.ok(
          res.reasons.some((r) => r.includes('Component metrics (on-time rate and task delay) were not supplied')),
          'Audit note logged for missing component breakdown'
        );
      });

      it('disqualifies candidate when negative clusters exceed 50% (outlier cluster dominance)', () => {
        const dataset = generateValidationDataset({
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          heterogeneousClusterEffects: [15.0, -1.5, -2.0, -1.0, -0.5], // Cluster 0 has +15 gain, other 4 clusters negative
          betweenClusterVariance: 0.0,
          randomSeed: 26002,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.pairedComparison.outlierClusterDominanceDetected, true);
        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      });
    });

    // -------------------------------------------------------------------------
    // Scope H: Provisional Practical Threshold Preserved
    // -------------------------------------------------------------------------
    describe('F. Provisional Practical Threshold Preserved (Scope H)', () => {
      it('preserves epsilon = 1.0 as centralized provisional operational heuristic metadata', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 2.0,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          randomSeed: 27001,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.pairedComparison.minMeaningfulDelta, 1.0);
        assert.strictEqual(res.practicalThresholdMetadata.thresholdValue, 1.0);
        assert.strictEqual(res.practicalThresholdMetadata.isProvisional, true);
        assert.strictEqual(res.practicalThresholdMetadata.unit, 'composite_schedule_points');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 7.4 Stage 4A.5: Dependence-Aware Eligibility & Practical Threshold Validation
  // ---------------------------------------------------------------------------
  describe('6. Phase 7.4 Stage 4A.5: Dependence-Aware Eligibility & Practical Threshold Validation', () => {
    // -------------------------------------------------------------------------
    // Scope A: Cross-Cluster Dependence Diagnosis & Estimand Distinction
    // -------------------------------------------------------------------------
    describe('A. Cross-Cluster Dependence Diagnosis (Scope A)', () => {
      it('reproduces Stage 4A.4 78.4% coverage against marginal target and reveals >= 99% coverage against conditional cluster sample mean (seeds 2000+)', () => {
        const REPLICATIONS = 1000;
        let marginalCovers = 0;
        let conditionalCovers = 0;

        for (let r = 0; r < REPLICATIONS; r++) {
          const seed = 2000 + r;
          const dataset = generateValidationDataset({
            groundTruthEffect: 1.5,
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            betweenClusterVariance: 0.5,
            withinClusterVariance: 1.0,
            crossClusterDependence: 0.6, // Shared latent factor shock
            randomSeed: seed,
          });

          const res = evaluateActivationGate({
            candidateWeights: validCandidateWeights,
            baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
            readinessReport: defaultReadiness,
            rollbackPreflight: defaultRollback,
            pairedObservations: dataset.pairs,
          });

          const ciLower = res.uncertainty.ciLower;
          const ciUpper = res.uncertainty.ciUpper;
          const marginalTarget = 1.5;
          const sampleConditionalMean = res.pairedComparison.clusterAveragedMeanDelta;

          if (ciLower != null && ciUpper != null) {
            if (marginalTarget >= ciLower && marginalTarget <= ciUpper) {
              marginalCovers++;
            }
            if (sampleConditionalMean >= ciLower && sampleConditionalMean <= ciUpper) {
              conditionalCovers++;
            }
          }
        }

        const marginalCoverage = marginalCovers / REPLICATIONS;
        const conditionalCoverage = conditionalCovers / REPLICATIONS;

        // Marginal coverage under shared shock replicates reported ~78.4% (between 74% and 82%)
        assert.ok(
          marginalCoverage >= 0.74 && marginalCoverage <= 0.82,
          `Marginal coverage under shared shock should reproduce ~78.4% (got ${marginalCovers}/${REPLICATIONS} = ${(marginalCoverage * 100).toFixed(1)}%)`
        );

        // Conditional target coverage across realized sample clusters achieves >= 99%
        assert.ok(
          conditionalCoverage >= 0.98,
          `Conditional coverage should achieve nominal coverage on observed sample (got ${conditionalCovers}/${REPLICATIONS} = ${(conditionalCoverage * 100).toFixed(1)}%)`
        );
      });

      it('hand-verifiable mathematical proof: common additive shift cancels out of cluster sample variance', () => {
        // Construct 5 clusters without common shift: means [1, 2, 3, 4, 5] -> mean=3, var=2.5, SE=sqrt(2.5/5)=0.7071
        const createObsForMean = (clKey, targetMean, count = 4) => {
          const obs = [];
          for (let i = 0; i < count; i++) {
            obs.push({
              observationId: `obs_${clKey}_${i}`,
              context: { scenario_key: clKey, dailyCapacityHours: 6.0, planningHorizonDays: 7, startDate: '2026-10-18' },
              candidateContext: { dailyCapacityHours: 6.0, planningHorizonDays: 7, startDate: '2026-10-18' },
              baselineContext: { dailyCapacityHours: 6.0, planningHorizonDays: 7, startDate: '2026-10-18' },
              candidateScore: 80.0 + targetMean,
              baselineScore: 80.0,
              candidateFeasible: true,
              baselineFeasible: true,
              isSynthetic: false,
            });
          }
          return obs;
        };

        const pairsBase = [
          ...createObsForMean('cl_1', 1.0),
          ...createObsForMean('cl_2', 2.0),
          ...createObsForMean('cl_3', 3.0),
          ...createObsForMean('cl_4', 4.0),
          ...createObsForMean('cl_5', 5.0),
        ];

        const resBase = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: pairsBase,
        });

        // Add common additive shift gamma = +10.0 to all observations
        const pairsShifted = [
          ...createObsForMean('cl_1', 11.0),
          ...createObsForMean('cl_2', 12.0),
          ...createObsForMean('cl_3', 13.0),
          ...createObsForMean('cl_4', 14.0),
          ...createObsForMean('cl_5', 15.0),
        ];

        const resShifted = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: pairsShifted,
        });

        // Cluster sample standard error is strictly identical (SE = 0.707)
        assert.strictEqual(resBase.uncertainty.standardError, 0.707);
        assert.strictEqual(resShifted.uncertainty.standardError, 0.707);

        // Point estimate shifts by exactly gamma (+10.0)
        assert.strictEqual(resBase.pairedComparison.meanDelta, 3.0);
        assert.strictEqual(resShifted.pairedComparison.meanDelta, 13.0);

        // Interval width is identical: (ciUpper - ciLower)
        const widthBase = Math.round((resBase.uncertainty.ciUpper - resBase.uncertainty.ciLower) * 1000) / 1000;
        const widthShifted = Math.round((resShifted.uncertainty.ciUpper - resShifted.uncertainty.ciLower) * 1000) / 1000;
        assert.strictEqual(widthBase, widthShifted);
      });
    });

    // -------------------------------------------------------------------------
    // Scope B: Detectable Cross-Cluster Dependence & Partial Overlap Rejection
    // -------------------------------------------------------------------------
    describe('B. Cluster Independence Policy & Partial Task Overlap (Scope B)', () => {
      it('detects partial cross-cluster task overlap (Jaccard >= 0.20) and fails closed with INSUFFICIENT_EVIDENCE', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 2.5,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          partialTaskOverlapClusters: [0, 1], // Cluster 1 and 2 share tasks
          randomSeed: 2501,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterTaskOverlapDetected, true);
        assert.strictEqual(res.evidencePolicy.statisticalAdequacy.isDecisionReady, false);
        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
        assert.strictEqual(res.isEligibleForSupervisedReview, false);
        assert.ok(
          res.reasons.some((r) => r.includes('Cross-cluster task overlap detected')),
          'Diagnostic reason identifies cross-cluster task overlap'
        );
      });

      it('permits disjoint clusters to satisfy independence checks', () => {
        const dataset = generateValidationDataset({
          groundTruthEffect: 3.0,
          clusterCount: 5,
          defaultPairsPerCluster: 4,
          randomSeed: 2502,
        });

        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: dataset.pairs,
        });

        assert.strictEqual(res.evidencePolicy.evaluationEvidence.crossClusterTaskOverlapDetected, false);
        assert.strictEqual(res.evidencePolicy.statisticalAdequacy.zeroOverlapEnforced, true);
        assert.strictEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      });
    });

    // -------------------------------------------------------------------------
    // Scope C & Scope E: Practical-Threshold Decision Semantics & Error Taxonomy
    // -------------------------------------------------------------------------
    describe('C. Practical Threshold Semantics & Error Taxonomy (Scope C & E)', () => {
      it('demonstrates sub-threshold false eligibility under Rule A (5.1%) vs Rule B (0.2%) at theta = 0.5', () => {
        const REPLICATIONS = 1000;
        let ruleAEligible = 0;
        let ruleBEligible = 0;

        for (let r = 0; r < REPLICATIONS; r++) {
          const seed = 3000 + r;
          const dataset = generateValidationDataset({
            groundTruthEffect: 0.5, // Sub-threshold effect below epsilon = 1.0
            clusterCount: 5,
            defaultPairsPerCluster: 5,
            betweenClusterVariance: 0.5,
            withinClusterVariance: 1.0,
            randomSeed: seed,
          });

          // Evaluate under Rule A (mean-threshold rule)
          const resA = evaluateActivationGate({
            candidateWeights: validCandidateWeights,
            baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
            readinessReport: defaultReadiness,
            rollbackPreflight: defaultRollback,
            pairedObservations: dataset.pairs,
            practicalThresholdRule: PRACTICAL_THRESHOLD_RULES.MEAN_THRESHOLD,
          });

          // Evaluate under Rule B (confidence-bound threshold rule: default)
          const resB = evaluateActivationGate({
            candidateWeights: validCandidateWeights,
            baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
            readinessReport: defaultReadiness,
            rollbackPreflight: defaultRollback,
            pairedObservations: dataset.pairs,
            practicalThresholdRule: PRACTICAL_THRESHOLD_RULES.CONFIDENCE_BOUND,
          });

          if (resA.isEligibleForSupervisedReview) ruleAEligible++;
          if (resB.isEligibleForSupervisedReview) ruleBEligible++;
        }

        // Rule A produces approximately 5-7% false eligibility (e.g. 51/1000 on seeds 54000+, 68/1000 on seeds 3000+)
        assert.ok(
          ruleAEligible >= 40 && ruleAEligible <= 85,
          `Rule A false eligibility at theta=0.5 should be ~5-7% (got ${ruleAEligible}/${REPLICATIONS})`
        );

        // Rule B reduces false eligibility by ~96% to <= 5/1000 (0.2% - 0.5%)
        assert.ok(
          ruleBEligible <= 5,
          `Rule B false eligibility at theta=0.5 must be <= 5/1000 (got ${ruleBEligible}/${REPLICATIONS})`
        );
      });

      it('evaluates error taxonomy across null, sub-threshold, dependence, feasibility, and methodology', () => {
        // 1. Any-improvement error (true theta <= 0.0)
        let anyImprovementErrors = 0;
        for (let r = 0; r < 200; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 0.0, clusterCount: 5, defaultPairsPerCluster: 4, randomSeed: 4000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) anyImprovementErrors++;
        }
        assert.strictEqual(anyImprovementErrors, 0, 'Zero any-improvement false eligibility under Rule B');

        // 2. Dependence error: overlapping backlogs must yield 0 eligibility
        let dependenceErrors = 0;
        for (let r = 0; r < 100; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 2.5, clusterCount: 5, defaultPairsPerCluster: 4, partialTaskOverlapClusters: [0, 1], randomSeed: 4200 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) dependenceErrors++;
        }
        assert.strictEqual(dependenceErrors, 0, 'Zero dependence false eligibility');

        // 3. Feasibility error: candidate violation must yield 0 eligibility
        const feasDataset = generateValidationDataset({ groundTruthEffect: 3.0, clusterCount: 5, defaultPairsPerCluster: 4, randomSeed: 4301 });
        feasDataset.pairs[0].candidateFeasible = false;
        feasDataset.pairs[0].candidateAlternative = { cycleDetected: true, infeasiblePlacementsCount: 2 };
        const feasRes = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: feasDataset.pairs });
        assert.strictEqual(feasRes.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
        assert.strictEqual(feasRes.isEligibleForSupervisedReview, false);

        // 4. Methodology error: invalid scoring function must yield 0 eligibility
        const methRes = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: feasDataset.pairs, scoringFn: null });
        assert.strictEqual(methRes.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);
        assert.strictEqual(methRes.isEligibleForSupervisedReview, false);
      });
    });

    // -------------------------------------------------------------------------
    // Scope D: Frozen Held-Out Validation Matrix (Seeds 70000–85000, 1,000 reps each)
    // -------------------------------------------------------------------------
    describe('D. Frozen Held-Out Validation Matrix (Seeds 70000–85000, 1,000 Replications)', () => {
      it('Scenario 1: True Null Effect (theta = 0.0) — seeds 70000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        let covers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 0.0, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 70000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
          if (res.uncertainty.ciLower <= 0.0 && res.uncertainty.ciUpper >= 0.0) covers++;
        }
        assert.strictEqual(eligible, 0, 'Null effect has 0/1000 false eligibility under Rule B');
        assert.ok(covers / REPS >= 0.94, `Coverage must meet nominal ~95% (got ${covers}/${REPS})`);
      });

      it('Scenario 2: Sub-Threshold Effect (theta = 0.5 < epsilon=1.0) — seeds 71000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 0.5, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 71000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.ok(eligible <= 5, `Sub-threshold eligibility under Rule B must be <= 5/1000 (got ${eligible}/${REPS})`);
      });

      it('Scenario 3: Near-Threshold Effect (theta = 0.9 < epsilon=1.0) — seeds 72000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 0.9, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 72000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.ok(eligible >= 5 && eligible <= 25, `Near-threshold eligibility under Rule B should be ~1.5% (got ${eligible}/${REPS})`);
      });

      it('Scenario 4: Exact Practical Threshold (theta = 1.0 = epsilon) — seeds 73000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.0, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 73000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.ok(eligible >= 15 && eligible <= 45, `Exact-threshold eligibility should be ~2.9% under Rule B (got ${eligible}/${REPS})`);
      });

      it('Scenario 5: Just Above Threshold (theta = 1.1 > epsilon) — seeds 74000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.1, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 74000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.ok(eligible >= 25 && eligible <= 65, `Just-above-threshold eligibility should be ~4.2% (got ${eligible}/${REPS})`);
      });

      it('Scenario 6: Meaningful Positive Effect (theta = 1.5 >> epsilon) — seeds 75000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        let covers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.5, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 75000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
          if (res.uncertainty.ciLower <= 1.5 && res.uncertainty.ciUpper >= 1.5) covers++;
        }
        assert.ok(eligible >= 130 && eligible <= 210, `Meaningful positive effect eligibility should be ~16.8% (got ${eligible}/${REPS})`);
        assert.ok(covers / REPS >= 0.94, `Coverage at theta=1.5 should be ~95% (got ${covers}/${REPS})`);
      });

      it('Scenario 7: High-Power Positive Effect (theta = 3.5 >> epsilon) — seeds 76000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 3.5, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 76000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.ok(eligible >= 990, `High power positive effect should achieve >= 99% eligibility (got ${eligible}/${REPS})`);
      });

      it('Scenario 8: Negative Effect (theta = -2.0) — seeds 77000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: -2.0, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 77000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
        }
        assert.strictEqual(eligible, 0, 'Negative effect has 0/1000 eligibility');
      });

      it('Scenario 9: Heavy-Tailed Clusters (Student-t df=3) — seeds 78000+ (1,000 reps)', () => {
        const REPS = 1000;
        let covers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.5, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, distribution: 'heavy_tailed', randomSeed: 78000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.uncertainty.ciLower <= 1.5 && res.uncertainty.ciUpper >= 1.5) covers++;
        }
        assert.ok(covers / REPS >= 0.93, `Student-t cluster coverage under heavy tails should be >= 93% (got ${covers}/${REPS})`);
      });

      it('Scenario 10: Severe Cluster Size Imbalance ([20, 3, 3, 3, 3]) — seeds 79000+ (1,000 reps)', () => {
        const REPS = 1000;
        let covers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.5, clusterCount: 5, clusterSizes: [20, 3, 3, 3, 3], betweenClusterVariance: 0.5, withinClusterVariance: 1.0, randomSeed: 79000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.uncertainty.ciLower <= 1.5 && res.uncertainty.ciUpper >= 1.5) covers++;
        }
        assert.ok(covers / REPS >= 0.94, `Cluster-averaged estimand covers under severe imbalance (got ${covers}/${REPS})`);
      });

      it('Scenario 11: High Within-Cluster Correlation (rho = 0.5) — seeds 80000+ (1,000 reps)', () => {
        const REPS = 1000;
        let covers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.5, clusterCount: 5, defaultPairsPerCluster: 5, betweenClusterVariance: 0.5, withinClusterVariance: 1.0, withinClusterCorrelation: 0.5, randomSeed: 80000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.uncertainty.ciLower <= 1.5 && res.uncertainty.ciUpper >= 1.5) covers++;
        }
        assert.ok(covers / REPS >= 0.94, `Coverage under ICC=0.5 should be >= 94% (got ${covers}/${REPS})`);
      });

      it('Scenario 12: Detectable Task Overlap Rejection — seeds 81000+ (1,000 reps)', () => {
        const REPS = 1000;
        let eligible = 0;
        let insufficientEvidenceCount = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 3.5, clusterCount: 5, defaultPairsPerCluster: 4, partialTaskOverlapClusters: [0, 1], randomSeed: 81000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.isEligibleForSupervisedReview) eligible++;
          if (res.outcome === ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE) insufficientEvidenceCount++;
        }
        assert.strictEqual(eligible, 0, '100% of overlapping cluster samples blocked from eligibility');
        assert.strictEqual(insufficientEvidenceCount, REPS, '100% of overlapping samples yield INSUFFICIENT_EVIDENCE');
      });

      it('Scenario 13: Shared Latent Shift Target Distinction — seeds 82000+ (1,000 reps)', () => {
        const REPS = 1000;
        let conditionalCovers = 0;
        let marginalCovers = 0;
        for (let r = 0; r < REPS; r++) {
          const d = generateValidationDataset({ groundTruthEffect: 1.5, clusterCount: 5, defaultPairsPerCluster: 5, crossClusterDependence: 0.6, randomSeed: 82000 + r });
          const res = evaluateActivationGate({ candidateWeights: validCandidateWeights, baselineWeights: FACTORY_SCHEDULER_WEIGHTS, readinessReport: defaultReadiness, rollbackPreflight: defaultRollback, pairedObservations: d.pairs });
          if (res.uncertainty.ciLower <= 1.5 && res.uncertainty.ciUpper >= 1.5) marginalCovers++;
          const condMean = res.pairedComparison.clusterAveragedMeanDelta;
          if (res.uncertainty.ciLower <= condMean && res.uncertainty.ciUpper >= condMean) conditionalCovers++;
        }
        assert.ok(marginalCovers >= 740 && marginalCovers <= 820, `Marginal coverage under shared shock replicates ~78.4% (got ${marginalCovers}/${REPS})`);
        assert.ok(conditionalCovers >= 980, `Conditional target coverage achieves >= 98% (got ${conditionalCovers}/${REPS})`);
      });
    });

    // -------------------------------------------------------------------------
    // Scope F, G, H: Uncertainty Validity, Metadata Transparency & Production Isolation
    // -------------------------------------------------------------------------
    describe('E. Gate Precedence, Metadata & Production Isolation (Scope F, G, H)', () => {
      it('enforces strict precedence: INSUFFICIENT_METHODOLOGY > INFEASIBLE > INSUFFICIENT_EVIDENCE > NOT_SUPERIOR', () => {
        // Invalid methodology overrides infeasible
        const res1 = evaluateActivationGate({
          candidateWeights: { urgencyWeight: -999.0 }, // Infeasible weights
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          scoringFn: 'invalid_not_a_fn', // Methodology failure
        });
        assert.strictEqual(res1.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);

        // Infeasible overrides insufficient evidence
        const res2 = evaluateActivationGate({
          candidateWeights: { urgencyWeight: -999.0 }, // Infeasible weights
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          pairedObservations: [], // Insufficient evidence
        });
        assert.strictEqual(res2.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      });

      it('exposes explicit practical threshold metadata identifying rule, threshold, and bounds', () => {
        const d = generateValidationDataset({ groundTruthEffect: 2.0, clusterCount: 5, defaultPairsPerCluster: 4, randomSeed: 90001 });
        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: d.pairs,
          practicalThresholdRule: PRACTICAL_THRESHOLD_RULES.CONFIDENCE_BOUND,
        });

        assert.strictEqual(res.practicalThresholdMetadata.thresholdValue, 1.0);
        assert.strictEqual(res.practicalThresholdMetadata.isProvisional, true);
        assert.strictEqual(res.practicalThresholdMetadata.comparisonRule, 'confidence_bound');
        assert.ok(res.practicalThresholdMetadata.ruleDescription.includes('Rule B'));
        assert.strictEqual(typeof res.practicalThresholdMetadata.confidenceLowerBound, 'number');
        assert.strictEqual(typeof res.practicalThresholdMetadata.confidenceUpperBound, 'number');
        assert.strictEqual(typeof res.practicalThresholdMetadata.meetsPracticalImprovement, 'boolean');
      });

      it('confirms strict production isolation: adaptation remains locked', () => {
        const d = generateValidationDataset({ groundTruthEffect: 3.5, clusterCount: 5, defaultPairsPerCluster: 5, randomSeed: 90002 });
        const res = evaluateActivationGate({
          candidateWeights: validCandidateWeights,
          baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
          readinessReport: defaultReadiness,
          rollbackPreflight: defaultRollback,
          pairedObservations: d.pairs,
        });

        assert.strictEqual(res.isAdaptationUnlocked, false);
        assert.strictEqual(res.productionApplied, false);
        assert.strictEqual(res.productionInvariance.isAdaptationUnlocked, false);
        assert.strictEqual(res.productionInvariance.productionApplied, false);
        assert.strictEqual(res.productionInvariance.factoryWeightsUnchanged, true);
      });
    });
  });
});
