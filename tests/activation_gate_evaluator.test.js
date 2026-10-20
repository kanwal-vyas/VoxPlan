import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateActivationGate,
  ACTIVATION_GATE_OUTCOMES,
  SAMPLING_ASSURANCE_STATUS,
  THRESHOLD_STATUS,
  evaluateSinglePairedObservation,
} from '../src/scheduler/activationGateEvaluator.js';
import { computeScheduleObjectiveScore } from '../src/scheduler/rankingEvaluator.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { createConfigurationSnapshot } from '../src/scheduler/configurationSnapshot.js';
import { createSyntheticAssuranceRecord } from './statistical_validation_harness.js';

describe('Phase 7.4 Stage 4A: Shadow-Only Activation-Gate Evaluator', () => {
  // Helper to build a standard passing readiness report
  function createPassingReadinessReport() {
    return {
      status: 'ready',
      isAdaptationUnlocked: false,
      summary: {
        decidedCount: 25,
        eligibleCompletedCount: 20,
        distinctCategoryCount: 4,
        activeDaysCount: 18,
      },
    };
  }

  // Helper to build a standard passing rollback preflight
  function createPassingRollbackPreflight() {
    return {
      success: true,
      verified: true,
      factorySnapshotAvailable: true,
      error: null,
    };
  }

  // Helper to build a standard passing sampling assurance declaration (Stage 4A.8 Path 1)
  function createPassingSamplingAssurance(pairsOrClusters) {
    let clusterKeys = [
      'scenario_sprint_alpha',
      'scenario_sprint_beta',
      'scenario_sprint_gamma',
      'scenario_sprint_delta',
      'scenario_sprint_epsilon',
    ];
    if (Array.isArray(pairsOrClusters)) {
      if (pairsOrClusters.length > 0 && typeof pairsOrClusters[0] === 'object' && pairsOrClusters[0] !== null) {
        clusterKeys = Array.from(new Set(pairsOrClusters.map((p) => p.context?.scenario_key).filter(Boolean))).sort();
      } else {
        clusterKeys = Array.from(new Set(pairsOrClusters.map(String))).sort();
      }
    }
    return createSyntheticAssuranceRecord({ clusterKeys });
  }

  // Helper to create synthetic or realistic paired observations across clusters
  function createPairedObservations({
    count = 20,
    clusters = [
      'scenario_sprint_alpha',
      'scenario_sprint_beta',
      'scenario_sprint_gamma',
      'scenario_sprint_delta',
      'scenario_sprint_epsilon',
    ],
    candScoreBase = 85.0,
    baseScoreBase = 80.0,
    variance = 1.0,
    isSynthetic = false,
  } = {}) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const clusterKey = clusters[i % clusters.length];
      const offset = (i % 3) * variance;
      list.push({
        observationId: `obs_${i}_${clusterKey}`,
        context: {
          scenario_key: clusterKey,
          dailyCapacityHours: 6.0,
          planningHorizonDays: 7,
          startDate: '2026-10-18',
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
        candidateScore: candScoreBase + offset,
        baselineScore: baseScoreBase + offset,
        candidateFeasible: true,
        baselineFeasible: true,
        isSynthetic,
      });
    }
    return list;
  }

  describe('1. Input & Evidence Validation', () => {
    it('1.1 validates candidate weights within bounds and rejects out-of-bounds weights as infeasible', () => {
      // Valid candidate (+10% urgency, -10% priority)
      const validWeights = {
        urgencyWeight: 55.0,
        priorityWeight: 90.0,
        unblockWeight: 15.0,
        riskWeight: 25.0,
      };

      const pairs = createPairedObservations();
      const res = evaluateActivationGate({
        candidateWeights: validWeights,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });

      assert.equal(res.feasibilityGate.passed, true);
      assert.notEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);

      // Invalid candidate exceeding +20% bound (urgency max is 60.0)
      const invalidWeights = {
        urgencyWeight: 75.0,
        priorityWeight: 100.0,
        unblockWeight: 15.0,
        riskWeight: 25.0,
      };

      const resInvalid = evaluateActivationGate({
        candidateWeights: invalidWeights,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });

      assert.equal(resInvalid.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.equal(resInvalid.isEligibleForSupervisedReview, false);
      assert.ok(resInvalid.reasons.some((r) => r.includes('Candidate weights failed validation')));
    });

    it('1.2 rejects altered baseline weights that do not match canonical factory source of truth', () => {
      const tamperedBaseline = {
        ...FACTORY_SCHEDULER_WEIGHTS,
        urgencyWeight: 99.0, // Tampered!
      };

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        baselineWeights: tamperedBaseline,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.ok(res.reasons.some((r) => r.includes('Baseline weights do not match canonical factory weights')));
    });

    it('1.3 rejects candidate configuration snapshot if checksum or schema validation fails', () => {
      const snap = createConfigurationSnapshot({
        weights: { ...FACTORY_SCHEDULER_WEIGHTS },
        provenance: 'candidate_tuning',
      });
      // Corrupt checksum on shallow copy because snap is frozen
      const corruptedSnap = { ...snap, integrityChecksum: 'deadbeef' };

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        candidateSnapshot: corruptedSnap,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.rollbackReadinessGate.snapshotValid, false);
      assert.ok(res.reasons.some((r) => r.includes('Candidate configuration snapshot failed validation')));
    });

    it('1.4 excludes synthetic demonstration data from counting toward real-user readiness', () => {
      // Pass isSyntheticData flag
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations({ isSynthetic: true }),
        isSyntheticData: true,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.isSyntheticData, true);
      assert.equal(res.evidenceAssessment.operationalReadinessPassed, false);
      assert.ok(res.reasons.some((r) => r.includes('Synthetic demonstration data')));
    });

    it('1.5 rejects unpaired observations where backlogs or constraints differ', () => {
      const mismatchedPairs = [
        {
          observationId: 'mismatched_cap',
          candidateContext: { dailyCapacityHours: 6.0, planningHorizonDays: 7, startDate: '2026-10-18' },
          baselineContext: { dailyCapacityHours: 8.0, planningHorizonDays: 7, startDate: '2026-10-18' }, // Mismatched!
          candidateScore: 85,
          baselineScore: 80,
          context: { scenario_key: 'scen_1' },
        },
        {
          observationId: 'mismatched_backlog',
          candidateTaskSetId: 'taskset_A',
          baselineTaskSetId: 'taskset_B', // Mismatched!
          candidateScore: 85,
          baselineScore: 80,
          context: { scenario_key: 'scen_2' },
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: mismatchedPairs,
      });

      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 0);
      assert.equal(res.evidenceAssessment.excludedObservationsCount, 2);
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
    });

    it('1.6 deduplicates repeated observations with identical identifiers', () => {
      const duplicatePairs = [
        {
          observationId: 'duplicate_pair_key',
          context: { scenario_key: 'scen_1' },
          candidateScore: 85,
          baselineScore: 80,
        },
        {
          observationId: 'duplicate_pair_key', // Duplicate ID
          context: { scenario_key: 'scen_1' },
          candidateScore: 85,
          baselineScore: 80,
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: duplicatePairs,
      });

      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedPairs[0].reason, 'duplicate_observation');
    });

    it('1.7 excludes observations missing scenario or cluster provenance identifier', () => {
      const ungroupedPair = {
        observationId: 'pair_without_context',
        candidateScore: 85,
        baselineScore: 80,
      };

      const evalRes = evaluateSinglePairedObservation(ungroupedPair);
      assert.equal(evalRes.valid, false);
      assert.equal(evalRes.reason, 'Observation is missing scenario or cluster provenance identifier.');
    });

    it('1.8 flags insufficient evidence when operational readiness heuristics are unmet', () => {
      const sparseReadiness = {
        status: 'insufficient_evidence',
        isAdaptationUnlocked: false,
        summary: {
          decidedCount: 12, // < 20
          eligibleCompletedCount: 8, // < 15
          distinctCategoryCount: 2, // < 3
          activeDaysCount: 6, // < 14
        },
      };

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: sparseReadiness,
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.operationalReadinessPassed, false);
      assert.ok(res.reasons.some((r) => r.includes('Decided proposals (12) below operational heuristic threshold')));
    });

    it('1.9 flags insufficient evidence when distinct scenario clusters are fewer than 3', () => {
      // 20 observations, but all from only 2 scenario clusters
      const twoClusterPairs = createPairedObservations({
        count: 20,
        clusters: ['only_cluster_1', 'only_cluster_2'],
      });

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: twoClusterPairs,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.distinctClustersCount, 2);
      assert.equal(res.uncertainty.canEstimateUncertainty, false);
      assert.ok(res.reasons.some((r) => r.includes('Distinct scenario clusters (2) below minimum required (3)')));
    });
  });

  describe('2. Paired Evaluation & Uncertainty Estimation', () => {
    it('2.1 accurately computes mean paired difference and concordance across eligible pairs', () => {
      const pairs = [
        {
          observationId: 'p1',
          context: { scenario_key: 'c1' },
          candidateScore: 90,
          baselineScore: 80, // +10
        },
        {
          observationId: 'p2',
          context: { scenario_key: 'c2' },
          candidateScore: 85,
          baselineScore: 85, // 0 (tie)
        },
        {
          observationId: 'p3',
          context: { scenario_key: 'c3' },
          candidateScore: 78,
          baselineScore: 80, // -2 (discordant)
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });

      // Mean delta = (10 + 0 - 2) / 3 = 2.667
      assert.equal(res.pairedComparison.meanDelta, 2.667);
      assert.equal(res.pairedComparison.concordantCount, 1);
      assert.equal(res.pairedComparison.tiedCount, 1);
      assert.equal(res.pairedComparison.discordantCount, 1);
      assert.equal(res.pairedComparison.concordanceProportion, 0.333);
    });

    it('2.2 evaluates complex schedule alternative objects using computeScheduleObjectiveScore', () => {
      const complexPair = {
        observationId: 'complex_1',
        context: { scenario_key: 'cluster_complex' },
        candidateAlternative: {
          metrics: {
            totalTasks: 10,
            onTimeTasksCount: 9,
            delayedTasksCount: 1,
            totalDelayDays: 2,
            capacityUtilizationPct: 80.0,
            churnRate: 0.1,
          },
        },
        baselineAlternative: {
          metrics: {
            totalTasks: 10,
            onTimeTasksCount: 7,
            delayedTasksCount: 3,
            totalDelayDays: 6,
            capacityUtilizationPct: 80.0,
            churnRate: 0.1,
          },
        },
      };

      const evalRes = evaluateSinglePairedObservation(complexPair);
      assert.equal(evalRes.valid, true);
      assert.ok(evalRes.candidateScore > evalRes.baselineScore);
      assert.ok(evalRes.delta > 0);
    });

    it('2.3 returns NOT_SUPERIOR when mean delta is below practical improvement threshold (epsilon)', () => {
      // Baseline 80.0, Candidate 80.3 -> Delta = +0.3, below default epsilon = 1.0
      const pairs = createPairedObservations({
        count: 18,
        candScoreBase: 80.3,
        baseScoreBase: 80.0,
        variance: 0.1,
      });

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.isEligibleForSupervisedReview, false);
      assert.equal(res.pairedComparison.meetsPracticalImprovement, false);
      assert.ok(res.reasons.some((r) => r.includes('below the practical significance threshold')));
    });

    it('2.4 returns NOT_SUPERIOR when clustered uncertainty interval lower bound crosses zero', () => {
      // Pairs across 5 clusters with high variance where delta is sometimes negative, pulling CI lower bound <= 0
      const highVariancePairs = [];
      const clusters = ['c1', 'c2', 'c3', 'c4', 'c5'];
      for (let i = 0; i < 25; i++) {
        const cluster = clusters[i % 5];
        // cluster c5 has negative deltas
        const delta = cluster === 'c5' ? -7.0 : 3.0;
        highVariancePairs.push({
          observationId: `var_${i}`,
          context: { scenario_key: cluster },
          candidateScore: 80 + delta,
          baselineScore: 80,
        });
      }

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(highVariancePairs),
        pairedObservations: highVariancePairs,
        minMeaningfulDelta: 0.5,
        randomSeed: 42,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.uncertainty.canEstimateUncertainty, true);
      assert.ok(res.uncertainty.ciLower <= 0);
      assert.equal(res.uncertainty.isCiPositive, false);
      assert.ok(res.reasons.some((r) => r.includes('lower bound') && r.includes('does not exceed zero')));
    });

    it('2.5 produces 100% deterministic bootstrap confidence bounds for fixed random seed', () => {
      const pairs = createPairedObservations({
        count: 24,
        candScoreBase: 85.0,
        baseScoreBase: 80.0,
        variance: 0.5,
      });

      const res1 = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        randomSeed: 9999,
      });

      const res2 = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        randomSeed: 9999,
      });

      assert.equal(res1.uncertainty.ciLower, res2.uncertainty.ciLower);
      assert.equal(res1.uncertainty.ciUpper, res2.uncertainty.ciUpper);
      assert.equal(res1.pairedComparison.meanDelta, res2.pairedComparison.meanDelta);
    });
  });

  describe('3. Hard Feasibility Gate', () => {
    it('3.1 rejects candidate with Kahn DAG dependency cycle as INFEASIBLE', () => {
      const cyclicPairs = [
        {
          observationId: 'cyclic_pair',
          context: { scenario_key: 'cluster_cycle' },
          candidateAlternative: {
            cycleDetected: true,
            infeasiblePlacementsCount: 0,
            metrics: { totalTasks: 5, onTimeTasksCount: 5 },
          },
          baselineAlternative: {
            cycleDetected: false,
            infeasiblePlacementsCount: 0,
            metrics: { totalTasks: 5, onTimeTasksCount: 5 },
          },
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: cyclicPairs,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.equal(res.feasibilityGate.passed, false);
      assert.ok(res.feasibilityGate.candidateViolations.includes('candidate_dependency_cycle'));
    });

    it('3.2 rejects candidate with capacity overruns or infeasible placements as INFEASIBLE', () => {
      const overrunPairs = [
        {
          observationId: 'overrun_pair',
          context: { scenario_key: 'cluster_overrun' },
          candidateAlternative: {
            cycleDetected: false,
            infeasiblePlacementsCount: 2,
            oversizedCount: 1,
            metrics: { totalTasks: 5, onTimeTasksCount: 3 },
          },
          baselineAlternative: {
            cycleDetected: false,
            infeasiblePlacementsCount: 0,
            oversizedCount: 0,
            metrics: { totalTasks: 5, onTimeTasksCount: 4 },
          },
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: overrunPairs,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.equal(res.feasibilityGate.passed, false);
      assert.ok(res.reasons.some((r) => r.includes('candidate_infeasible_placements')));
    });

    it('3.3 rejects candidate if baseline itself produced hard constraint violations on evaluation backlog', () => {
      const baselineFailedPairs = [
        {
          observationId: 'base_fail_pair',
          context: { scenario_key: 'cluster_base_fail' },
          candidateAlternative: {
            cycleDetected: false,
            infeasiblePlacementsCount: 0,
            metrics: { totalTasks: 5, onTimeTasksCount: 5 },
          },
          baselineAlternative: {
            cycleDetected: true, // Baseline cyclic!
            infeasiblePlacementsCount: 0,
            metrics: { totalTasks: 5, onTimeTasksCount: 5 },
          },
        },
      ];

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: baselineFailedPairs,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.equal(res.feasibilityGate.passed, false);
      assert.ok(res.reasons.some((r) => r.includes('Baseline configuration produced hard constraint violations')));
    });
  });

  describe('4. Rollback Readiness Gate', () => {
    it('4.1 rejects eligibility when rollback preflight was omitted or failed', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: { success: false, verified: false, error: 'Storage timeout' },
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.rollbackReadinessGate.passed, false);
      assert.ok(res.reasons.some((r) => r.includes('Rollback preflight failure')));
    });

    it('4.2 rejects eligibility when factory baseline snapshot is missing in persistent storage', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: { success: true, verified: true, factorySnapshotAvailable: false },
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.rollbackReadinessGate.factorySnapshotValid, false);
      assert.ok(res.reasons.some((r) => r.includes('Factory baseline snapshot is missing')));
    });
  });

  describe('5. Full Eligibility & Production Isolation', () => {
    it('5.1 grants ELIGIBLE_FOR_SUPERVISED_REVIEW when all gates pass with significant positive delta', () => {
      // 25 pairs across 5 clusters, candidate consistently superior (+4.0 pts)
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['cluster_a', 'cluster_b', 'cluster_c', 'cluster_d', 'cluster_e'],
        candScoreBase: 88.0,
        baseScoreBase: 84.0,
        variance: 0.2,
      });

      const res = evaluateActivationGate({
        candidateWeights: {
          urgencyWeight: 52.0,
          priorityWeight: 105.0,
          unblockWeight: 15.0,
          riskWeight: 26.0,
        },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
        randomSeed: 42,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      assert.equal(res.isEligibleForSupervisedReview, true);
      assert.equal(res.feasibilityGate.passed, true);
      assert.equal(res.rollbackReadinessGate.passed, true);
      assert.equal(res.evidenceAssessment.operationalReadinessPassed, true);
      assert.equal(res.pairedComparison.meetsPracticalImprovement, true);
      assert.equal(res.uncertainty.isCiPositive, true);
      assert.ok(res.uncertainty.ciLower > 0);
    });

    it('5.1b blocks ELIGIBLE_FOR_SUPERVISED_REVIEW when samplingAssurance is omitted or unverified (Path 2 Production Invariant)', () => {
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['cluster_a', 'cluster_b', 'cluster_c', 'cluster_d', 'cluster_e'],
        candScoreBase: 88.0,
        baseScoreBase: 84.0,
        variance: 0.2,
      });

      const res = evaluateActivationGate({
        candidateWeights: {
          urgencyWeight: 52.0,
          priorityWeight: 105.0,
          unblockWeight: 15.0,
          riskWeight: 26.0,
        },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        // samplingAssurance omitted: defaults to unverified
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
        randomSeed: 42,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.isEligibleForSupervisedReview, false);
      assert.equal(res.evidenceAssessment.clusterSamplingIndependenceVerified, false);
      assert.equal(res.evidenceAssessment.clusterIndependenceStatus, SAMPLING_ASSURANCE_STATUS.UNVERIFIED);
      assert.ok(res.reasons.some((r) => r.includes('Cluster sampling independence is unverified')));
    });

    it('5.2 strictly enforces production invariance guarantees throughout evaluation', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });

      assert.equal(res.productionInvariance.isAdaptationUnlocked, false);
      assert.equal(res.productionInvariance.productionApplied, false);
      assert.equal(res.productionInvariance.factoryWeightsUnchanged, true);
      assert.deepEqual(res.productionInvariance.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
    });

    it('5.3 includes all documented methodology disclosures in evaluation output', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });

      assert.ok(Array.isArray(res.methodologyDisclosures));
      assert.ok(res.methodologyDisclosures.length >= 4);
      assert.ok(res.methodologyDisclosures.some((d) => d.includes('Pairwise concordance')));
      assert.ok(res.methodologyDisclosures.some((d) => d.includes('correlated')));
    });
  });

  describe('6. Phase 7.4 Stage 4A.1: Adversarial & Synthetic Statistical Validation Matrix (Audit F)', () => {
    // Scenario 1: No evidence
    it('F.1 handles no evidence by returning INSUFFICIENT_EVIDENCE', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: [],
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 0);
      assert.equal(res.isEligibleForSupervisedReview, false);
    });

    // Scenario 2: Too few eligible pairs
    it('F.2 handles too few eligible pairs (N < 15) by returning INSUFFICIENT_EVIDENCE', () => {
      const pairs = createPairedObservations({ count: 10 });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 10);
      assert.ok(res.reasons.some((r) => r.includes('below minimum required (15)')));
    });

    // Scenario 3: Enough pairs but too few usable clusters
    it('F.3 handles enough pairs but too few usable clusters (M < 3) by returning INSUFFICIENT_EVIDENCE', () => {
      const pairs = createPairedObservations({
        count: 20,
        clusters: ['cluster_1', 'cluster_2'],
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.distinctClustersCount, 2);
      assert.ok(res.reasons.some((r) => r.includes('below minimum required (3)')));
    });

    // Scenario 4: Repeated observations from one underlying backlog
    it('F.4 excludes repeated observations from one underlying backlog in the same cluster', () => {
      const pairs = [
        {
          observationId: 'pair_backlog_a',
          taskSetId: 'shared_backlog_123',
          context: { scenario_key: 'cluster_x' },
          candidateScore: 85,
          baselineScore: 80,
        },
        {
          observationId: 'pair_backlog_b',
          taskSetId: 'shared_backlog_123', // Same backlog in same cluster
          context: { scenario_key: 'cluster_x' },
          candidateScore: 85,
          baselineScore: 80,
        },
      ];
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedPairs[0].reason, 'duplicate_backlog_in_cluster');
    });

    // Scenario 5: Duplicated observations with different superficial identifiers
    it('F.5 excludes duplicated observations with different superficial identifiers sharing same comparison ID', () => {
      const pairs = [
        {
          observationId: 'superficial_id_1',
          comparison_id: 'canonical_comparison_99',
          context: { scenario_key: 'cluster_alpha' },
          candidateScore: 90,
          baselineScore: 85,
        },
        {
          observationId: 'superficial_id_2', // Different observationId
          comparison_id: 'canonical_comparison_99', // Identical comparisonId!
          context: { scenario_key: 'cluster_alpha' },
          candidateScore: 90,
          baselineScore: 85,
        },
      ];
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedObservationsCount, 1);
      assert.equal(res.evidenceAssessment.excludedPairs[0].reason, 'duplicate_observation');
    });

    // Scenario 6: Overlapping project or task groups (Cross-cluster leakage)
    it('F.6 detects cross-cluster backlog leakage when identical task set appears under distinct clusters', () => {
      const pairs = [
        {
          observationId: 'leak_obs_1',
          taskSetId: 'project_backlog_core',
          context: { scenario_key: 'cluster_sprint_1' },
          candidateScore: 85,
          baselineScore: 80,
        },
        {
          observationId: 'leak_obs_2',
          taskSetId: 'project_backlog_core', // Same backlog claimed under different cluster!
          context: { scenario_key: 'cluster_sprint_2' },
          candidateScore: 85,
          baselineScore: 80,
        },
      ];
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.evidenceAssessment.crossClusterLeakageDetected, true);
      assert.ok(res.reasons.some((r) => r.includes('Cross-cluster backlog leakage detected')));
    });

    // Scenario 7: Candidate with a positive point estimate but uncertainty crossing zero
    it('F.7 returns NOT_SUPERIOR when point estimate is positive but 95% CI lower bound crosses zero', () => {
      // 25 pairs across 5 clusters, mean delta ~ +1.5, but high inter-cluster variance pulling lower bound <= 0
      const pairs = [];
      const clusters = ['cl_a', 'cl_b', 'cl_c', 'cl_d', 'cl_e'];
      for (let i = 0; i < 25; i++) {
        const cl = clusters[i % 5];
        const delta = cl === 'cl_e' ? -6.0 : 3.0; // Cluster cl_e regresses
        pairs.push({
          observationId: `p_ci_zero_${i}`,
          context: { scenario_key: cl },
          candidateScore: 80 + delta,
          baselineScore: 80,
        });
      }
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.ok((res.pairedComparison.meanDelta ?? 0) > 0);
      assert.ok(res.uncertainty.ciLower <= 0);
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
    });

    // Scenario 8: Candidate with a negative point estimate
    it('F.8 returns NOT_SUPERIOR when candidate mean paired delta is negative', () => {
      const pairs = createPairedObservations({
        count: 20,
        candScoreBase: 75.0,
        baseScoreBase: 82.0, // Candidate is 7 points worse
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.ok((res.pairedComparison.meanDelta ?? 0) < 0);
    });

    // Scenario 9: Candidate with a practically negligible effect
    it('F.9 returns NOT_SUPERIOR when delta is positive but practically negligible (delta < epsilon)', () => {
      const pairs = createPairedObservations({
        count: 20,
        candScoreBase: 80.4,
        baseScoreBase: 80.0, // Delta = +0.4 pts < epsilon (1.0)
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.pairedComparison.meetsPracticalImprovement, false);
    });

    // Scenario 10: Candidate with large apparent effect but small clusters (M < 5 flagged)
    it('F.10 flags small cluster warning and yields INSUFFICIENT_EVIDENCE when 3 <= M < 5 clusters are used', () => {
      const pairs = createPairedObservations({
        count: 21,
        clusters: ['cl_1', 'cl_2', 'cl_3'], // M = 3
        candScoreBase: 90.0,
        baseScoreBase: 80.0,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.uncertainty.isSmallClusterSample, true);
      assert.equal(res.uncertainty.isExploratoryOnly, true);
      assert.equal(res.uncertainty.isDecisionReady, false);
      assert.equal(res.uncertainty.uniqueMultisetsCount, 10);
      assert.ok(res.uncertainty.disclaimer.includes('Small cluster count'));
    });

    // Scenario 11: Candidate with a hard feasibility violation
    it('F.11 rejects candidate with hard feasibility violation even if objective score delta is huge', () => {
      const pairs = [
        {
          observationId: 'infeasible_pair_1',
          context: { scenario_key: 'cl_inf' },
          candidateAlternative: {
            cycleDetected: true, // Hard cycle!
            metrics: { totalTasks: 10, onTimeTasksCount: 10, capacityUtilizationPct: 100 },
          },
          baselineAlternative: {
            cycleDetected: false,
            metrics: { totalTasks: 10, onTimeTasksCount: 8, capacityUtilizationPct: 75 },
          },
        },
      ];
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
      assert.equal(res.feasibilityGate.passed, false);
      assert.ok(res.feasibilityGate.candidateViolations.includes('candidate_dependency_cycle'));
    });

    // Scenario 12: Invalid or stale candidate snapshot
    it('F.12 rejects evaluation when candidate snapshot has corrupted checksum or schema', () => {
      const corruptedSnapshot = {
        snapshotId: 'snap_corrupt',
        timestamp: Date.now(),
        integrityChecksum: 'bad_hash',
      };
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        candidateSnapshot: corruptedSnapshot,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.rollbackReadinessGate.snapshotValid, false);
    });

    // Scenario 13: Invalid factory snapshot or failed rollback preflight
    it('F.13 rejects evaluation when rollback preflight fails or factory snapshot is missing', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: {
          success: false,
          verified: false,
          factorySnapshotAvailable: false,
          error: 'Persistent factory snapshot not found',
        },
        pairedObservations: createPairedObservations(),
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.rollbackReadinessGate.rollbackPreflightVerified, false);
    });

    // Scenario 14: Non-finite or inconsistent score components (INSUFFICIENT_METHODOLOGY)
    it('F.14 assigns INSUFFICIENT_METHODOLOGY when scoring function is invalid or produces non-finite outputs', () => {
      const resInvalidScoring = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
        scoringFn: null, // Invalid function!
      });
      assert.equal(resInvalidScoring.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);
      assert.ok(resInvalidScoring.reasons.some((r) => r.includes('Invalid schedule objective scoring function')));

      const resInvalidEpsilon = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
        minMeaningfulDelta: -1.0, // Non-positive epsilon!
      });
      assert.equal(resInvalidEpsilon.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);
    });

    // Scenario 15: Deterministic repeat evaluation with the same seed
    it('F.15 produces exact identical bootstrap bounds and statistics on repeat evaluation with same seed', () => {
      const pairs = createPairedObservations({ count: 24 });
      const runA = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        randomSeed: 42,
      });
      const runB = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        randomSeed: 42,
      });
      assert.equal(runA.uncertainty.ciLower, runB.uncertainty.ciLower);
      assert.equal(runA.uncertainty.ciUpper, runB.uncertainty.ciUpper);
      assert.equal(runA.uncertainty.standardError, runB.uncertainty.standardError);
    });

    // Scenario 16: Naive unclustered analysis appears more confident than cluster-aware analysis
    it('F.16 demonstrates that naive unclustered CI is narrower than cluster-aware bootstrap under correlated data', () => {
      // Create cluster-correlated observations where within-cluster observations are identical
      // but across clusters the effect differs:
      // Cluster A: delta = +10 (all 8 observations)
      // Cluster B: delta = +5 (all 8 observations)
      // Cluster C: delta = -1 (all 8 observations)
      const correlatedPairs = [];
      const clusterDeltas = { cl_a: 10, cl_b: 5, cl_c: -1 };
      for (const [cl, delta] of Object.entries(clusterDeltas)) {
        for (let j = 0; j < 8; j++) {
          correlatedPairs.push({
            observationId: `${cl}_obs_${j}`,
            context: { scenario_key: cl },
            candidateScore: 80 + delta,
            baselineScore: 80,
          });
        }
      }

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: correlatedPairs,
        randomSeed: 42,
      });

      assert.equal(res.uncertainty.canEstimateUncertainty, true);
      const naiveSE = res.uncertainty.naiveUnclustered.standardError;
      const clusterSE = res.uncertainty.standardError;

      // Cluster-aware standard error accounts for cluster dependence and is larger than naive SE
      assert.ok(clusterSE > naiveSE, `Expected cluster SE (${clusterSE}) > naive SE (${naiveSE})`);

      const naiveWidth = res.uncertainty.naiveUnclustered.ciUpper - res.uncertainty.naiveUnclustered.ciLower;
      const clusterWidth = res.uncertainty.ciUpper - res.uncertainty.ciLower;
      assert.ok(clusterWidth > naiveWidth, `Expected cluster CI width (${clusterWidth}) > naive CI width (${naiveWidth})`);
    });

    // Additional Objective Validity & Normalization Checks (Audit A)
    it('Audit A: computeScheduleObjectiveScore returns 0.0 for empty task sets, clamps rates, and handles non-finite metrics', () => {
      // Empty task set
      const emptySchedule = { metrics: { totalTasks: 0, onTimeTasksCount: 0 } };
      assert.equal(computeScheduleObjectiveScore(emptySchedule), 0.0);

      // Non-object
      assert.equal(computeScheduleObjectiveScore(null), -Infinity);

      // Clamp rates when corrupted metrics exceed [0, 1]
      const overflowSchedule = {
        metrics: {
          totalTasks: 10,
          onTimeTasksCount: 15, // > totalTasks!
          capacityUtilizationPct: 150, // > 100%!
          churnRate: 2.5, // > 1.0!
        },
      };
      const score = computeScheduleObjectiveScore(overflowSchedule);
      // onTimeRate clamped to 1.0 (100 pts), utilFraction clamped to 1.0 (+10 pts), churn clamped to 1.0 (-20 pts) => 90 pts
      assert.equal(score, 90.0);
    });
  });

  describe('7. Phase 7.4 Stage 4A.2: Minimum-Evidence Policy & Statistical Gate Hardening', () => {
    // G.1: Rejects candidate with N < 15 paired observations as INSUFFICIENT_EVIDENCE
    it('G.1 rejects candidate with N < 15 paired observations as INSUFFICIENT_EVIDENCE even if clusters >= 5', () => {
      const pairs = createPairedObservations({
        count: 14,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
        candScoreBase: 90,
        baseScoreBase: 80,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.eligibleObservationsCount, 14);
      assert.equal(res.evidenceAssessment.hasSufficientPairs, false);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, false);
      assert.ok(res.reasons.some((r) => r.includes('below minimum required (15)')));
    });

    // G.2: Rejects candidate with M = 3 clusters as INSUFFICIENT_EVIDENCE even when delta > epsilon and bootstrap CI is strictly positive
    it('G.2 rejects candidate with M = 3 clusters as INSUFFICIENT_EVIDENCE despite large delta and positive CI', () => {
      const pairs = createPairedObservations({
        count: 24,
        clusters: ['c1', 'c2', 'c3'],
        candScoreBase: 92,
        baseScoreBase: 80, // delta ~ +12.0
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.distinctClustersCount, 3);
      assert.equal(res.evidenceAssessment.hasSufficientClusters, false);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, false);
      assert.equal(res.uncertainty.isDecisionReady, false);
      assert.equal(res.uncertainty.isExploratoryOnly, true);
      assert.equal(res.uncertainty.isSmallClusterSample, true);
    });

    // G.3: Rejects candidate with M = 4 clusters as INSUFFICIENT_EVIDENCE even when all 4 clusters show positive deltas
    it('G.3 rejects candidate with M = 4 clusters as INSUFFICIENT_EVIDENCE even when all clusters show positive improvement', () => {
      const pairs = createPairedObservations({
        count: 24,
        clusters: ['c1', 'c2', 'c3', 'c4'],
        candScoreBase: 88,
        baseScoreBase: 80,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.distinctClustersCount, 4);
      assert.equal(res.evidenceAssessment.hasSufficientClusters, false);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, false);
      assert.equal(res.uncertainty.isDecisionReady, false);
      assert.equal(res.uncertainty.isExploratoryOnly, true);
      assert.ok(res.reasons.some((r) => r.includes('below decision eligibility minimum')));
    });

    // G.4: Rejects candidate when cross-cluster backlog leakage is present
    it('G.4 rejects candidate when cross-cluster backlog leakage is present as INSUFFICIENT_EVIDENCE', () => {
      const pairs = createPairedObservations({
        count: 20,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
      });
      // Inject identical taskSetId across c1 and c2
      pairs[0].taskSetId = 'shared_project_leakage';
      pairs[1].taskSetId = 'shared_project_leakage';
      pairs[0].context.scenario_key = 'c1';
      pairs[1].context.scenario_key = 'c2';

      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.crossClusterLeakageDetected, true);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, false);
      assert.ok(res.reasons.some((r) => r.includes('Cross-cluster backlog leakage detected')));
    });

    // G.5: Allows exploratory bootstrap simulation when 3 <= M < 5
    it('G.5 allows exploratory bootstrap simulation when 3 <= M < 5, setting isExploratoryOnly=true and isDecisionReady=false', () => {
      const pairs = createPairedObservations({
        count: 21,
        clusters: ['c1', 'c2', 'c3'],
        candScoreBase: 86,
        baseScoreBase: 80,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.uncertainty.canEstimateUncertainty, true);
      assert.equal(res.uncertainty.isExploratoryOnly, true);
      assert.equal(res.uncertainty.isDecisionReady, false);
      assert.equal(res.uncertainty.isSmallClusterSample, true);
      assert.equal(res.uncertainty.uniqueMultisetsCount, 10);
      assert.ok(res.uncertainty.disclaimer.includes('Small cluster count'));
    });

    // G.6: Rejects exploratory bootstrap simulation when M < 3
    it('G.6 rejects exploratory bootstrap simulation when M < 3, setting canEstimateUncertainty=false', () => {
      const pairs = createPairedObservations({
        count: 20,
        clusters: ['c1', 'c2'],
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.uncertainty.canEstimateUncertainty, false);
      assert.equal(res.uncertainty.isDecisionReady, false);
      assert.equal(res.uncertainty.isExploratoryOnly, false);
      assert.ok(res.uncertainty.disclaimer.includes('below minimum required (3)'));
    });

    // G.7: Grants ELIGIBLE_FOR_SUPERVISED_REVIEW when all criteria pass
    it('G.7 grants ELIGIBLE_FOR_SUPERVISED_REVIEW when N >= 15, M >= 5, no leakage, all gates pass, delta > epsilon, and CI lower > 0', () => {
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
        candScoreBase: 89,
        baseScoreBase: 82,
        variance: 0.2,
      });
      const res = evaluateActivationGate({
        candidateWeights: {
          urgencyWeight: 52.0,
          priorityWeight: 105.0,
          unblockWeight: 15.0,
          riskWeight: 26.0,
        },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
        randomSeed: 42,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW);
      assert.equal(res.isEligibleForSuperVISED_REVIEW ?? res.isEligibleForSupervisedReview, true);
      assert.equal(res.evidencePolicy.operationalExposurePassed, true);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, true);
      assert.equal(res.evidencePolicy.statisticalAdequacyPassed, true);
      assert.equal(res.uncertainty.isDecisionReady, true);
      assert.equal(res.uncertainty.isExploratoryOnly, false);
      assert.ok(res.uncertainty.ciLower > 0);
    });

    // G.8: Strict outcome precedence: INSUFFICIENT_METHODOLOGY takes precedence over INFEASIBLE and INSUFFICIENT_EVIDENCE
    it('G.8 enforces precedence: INSUFFICIENT_METHODOLOGY takes precedence over INFEASIBLE and INSUFFICIENT_EVIDENCE', () => {
      const res = evaluateActivationGate({
        candidateWeights: { urgencyWeight: 999.0 }, // Out of bounds
        scoringFn: null, // Invalid methodology
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY);
    });

    // G.9: Strict outcome precedence: INFEASIBLE takes precedence over INSUFFICIENT_EVIDENCE and NOT_SUPERIOR
    it('G.9 enforces precedence: INFEASIBLE takes precedence over INSUFFICIENT_EVIDENCE and NOT_SUPERIOR', () => {
      const res = evaluateActivationGate({
        candidateWeights: { urgencyWeight: 999.0 }, // Out of bounds
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations({ count: 2 }), // Sparse
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
    });

    // G.10: Strict outcome precedence: INSUFFICIENT_EVIDENCE takes precedence over NOT_SUPERIOR
    it('G.10 enforces precedence: INSUFFICIENT_EVIDENCE takes precedence over NOT_SUPERIOR (sparse data never labeled NOT_SUPERIOR)', () => {
      const pairs = createPairedObservations({
        count: 20,
        clusters: ['c1', 'c2'],
        candScoreBase: 75,
        baseScoreBase: 80,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.notEqual(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
    });

    // G.11: Returns NOT_SUPERIOR when N >= 15, M >= 5, all gates pass, but delta < epsilon
    it('G.11 returns NOT_SUPERIOR when N >= 15, M >= 5, all gates pass, but delta < epsilon', () => {
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
        candScoreBase: 80.5,
        baseScoreBase: 80.0, // delta = +0.5 < epsilon 1.0
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.pairedComparison.meetsPracticalImprovement, false);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, true);
    });

    // G.12: Returns NOT_SUPERIOR when N >= 15, M >= 5, all gates pass, delta >= epsilon, but CI lower <= 0
    it('G.12 returns NOT_SUPERIOR when N >= 15, M >= 5, all gates pass, delta >= epsilon, but CI lower crosses zero', () => {
      const pairs = [];
      const clusters = ['c1', 'c2', 'c3', 'c4', 'c5'];
      for (let i = 0; i < 25; i++) {
        const cl = clusters[i % 5];
        const delta = cl === 'c5' ? -8.0 : 3.5;
        pairs.push({
          observationId: `obs_ci_cross_${i}`,
          context: { scenario_key: cl },
          candidateScore: 80 + delta,
          baselineScore: 80,
        });
      }
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
        randomSeed: 42,
      });
      assert.ok((res.pairedComparison.meanDelta ?? 0) >= 1.0);
      assert.ok(res.uncertainty.ciLower <= 0);
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, true);
    });

    // G.13: Validates three-pillar minimum-evidence policy outputs
    it('G.13 outputs three distinct evidence pillars with clear boolean status and diagnostics', () => {
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        samplingAssurance: createPassingSamplingAssurance(pairs),
        pairedObservations: pairs,
      });
      assert.ok(res.evidencePolicy);
      assert.equal(typeof res.evidencePolicy.operationalExposurePassed, 'boolean');
      assert.equal(typeof res.evidencePolicy.evaluationEvidencePassed, 'boolean');
      assert.equal(typeof res.evidencePolicy.statisticalAdequacyPassed, 'boolean');
      assert.equal(res.evidencePolicy.operationalExposurePassed, true);
      assert.equal(res.evidencePolicy.evaluationEvidencePassed, true);
    });

    // G.14: Verifies threshold metadata is flagged as provisional operational heuristic
    it('G.14 declares threshold epsilon metadata explicitly as provisional operational heuristic', () => {
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: createPairedObservations(),
      });
      assert.ok(res.thresholdPolicy);
      assert.equal(res.thresholdPolicy.status, THRESHOLD_STATUS.PROVISIONAL_OPERATIONAL_HEURISTIC);
      assert.ok(res.thresholdPolicy.disclaimer.includes('provisional operational heuristic'));
      assert.ok(res.methodologyDisclosures.some((d) => d.includes('provisional multi-attribute operational heuristic')));
    });

    // G.15: Verifies Monte Carlo stability across multiple random seeds
    it('G.15 produces consistent decision outcome across different random seeds on decision-ready sample', () => {
      const pairs = createPairedObservations({
        count: 30,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
        candScoreBase: 89,
        baseScoreBase: 82, // Robust +7 delta
        variance: 0.1,
      });
      const candidateWeights = {
        urgencyWeight: 52.0,
        priorityWeight: 105.0,
        unblockWeight: 15.0,
        riskWeight: 26.0,
      };
      const seeds = [42, 101, 202, 999];
      const outcomes = seeds.map((seed) => {
        const res = evaluateActivationGate({
          candidateWeights,
          readinessReport: createPassingReadinessReport(),
          rollbackPreflight: createPassingRollbackPreflight(),
          samplingAssurance: createPassingSamplingAssurance(pairs),
          pairedObservations: pairs,
          randomSeed: seed,
        });
        return res.outcome;
      });
      assert.ok(outcomes.every((o) => o === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW));
    });

    // G.16: Verifies cluster multiset combinatorial count calculation
    it('G.16 correctly calculates cluster multiset combinatorial capacity for M=3 (10), M=4 (35), M=5 (126)', () => {
      const checkM = (mCount, expectedMultisets) => {
        const clusters = Array.from({ length: mCount }, (_, idx) => `cl_${idx}`);
        const pairs = createPairedObservations({ count: 20, clusters });
        const res = evaluateActivationGate({
          candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
          readinessReport: createPassingReadinessReport(),
          rollbackPreflight: createPassingRollbackPreflight(),
          pairedObservations: pairs,
        });
        assert.equal(res.uncertainty.uniqueMultisetsCount, expectedMultisets);
      };
      checkM(3, 10);
      checkM(4, 35);
      checkM(5, 126);
    });

    // G.17: Verifies production isolation: candidate eligibility does not modify factory baseline weights or unlock adaptation
    it('G.17 enforces strict production isolation: candidate eligibility never mutates factory weights or unlocks adaptation', () => {
      const pairs = createPairedObservations({
        count: 25,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
        candScoreBase: 88,
        baseScoreBase: 82,
      });
      const candidateWeights = {
        urgencyWeight: 55.0,
        priorityWeight: 95.0,
        unblockWeight: 15.0,
        riskWeight: 25.0,
      };
      const factoryBefore = JSON.stringify(FACTORY_SCHEDULER_WEIGHTS);
      const res = evaluateActivationGate({
        candidateWeights,
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
      });
      const factoryAfter = JSON.stringify(FACTORY_SCHEDULER_WEIGHTS);
      assert.equal(factoryBefore, factoryAfter);
      assert.equal(res.productionApplied, false);
      assert.equal(res.isAdaptationUnlocked, false);
    });

    // G.18: Disqualifies synthetic demonstration data from real-user eligibility
    it('G.18 disqualifies synthetic demonstration data from meeting real-user activation criteria', () => {
      const pairs = createPairedObservations({
        count: 30,
        clusters: ['c1', 'c2', 'c3', 'c4', 'c5'],
        candScoreBase: 95,
        baseScoreBase: 80,
        isSynthetic: true,
      });
      const res = evaluateActivationGate({
        candidateWeights: { ...FACTORY_SCHEDULER_WEIGHTS },
        readinessReport: createPassingReadinessReport(),
        rollbackPreflight: createPassingRollbackPreflight(),
        pairedObservations: pairs,
        isSyntheticData: true,
      });
      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_EVIDENCE);
      assert.equal(res.evidenceAssessment.isSyntheticData, true);
      assert.equal(res.evidencePolicy.operationalExposurePassed, false);
      assert.ok(res.reasons.some((r) => r.includes('Synthetic demonstration data')));
    });
  });
});
