import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateActivationGate,
  ACTIVATION_GATE_OUTCOMES,
  evaluateSinglePairedObservation,
} from '../src/scheduler/activationGateEvaluator.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { createConfigurationSnapshot } from '../src/scheduler/configurationSnapshot.js';

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

  // Helper to create synthetic or realistic paired observations across clusters
  function createPairedObservations({
    count = 18,
    clusters = ['scenario_sprint_alpha', 'scenario_sprint_beta', 'scenario_sprint_gamma'],
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
        pairedObservations: pairs,
        minMeaningfulDelta: 1.0,
      });

      assert.equal(res.outcome, ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR);
      assert.equal(res.isEligibleForSupervisedReview, false);
      assert.equal(res.pairedComparison.meetsPracticalImprovement, false);
      assert.ok(res.reasons.some((r) => r.includes('below the practical significance threshold')));
    });

    it('2.4 returns NOT_SUPERIOR when clustered uncertainty interval lower bound crosses zero', () => {
      // Pairs with high variance where delta is sometimes negative, pulling CI lower bound <= 0
      const highVariancePairs = [];
      const clusters = ['c1', 'c2', 'c3', 'c4'];
      for (let i = 0; i < 20; i++) {
        const cluster = clusters[i % 4];
        // cluster c4 has negative deltas
        const delta = cluster === 'c4' ? -5.0 : 3.0;
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
      // 24 pairs across 4 clusters, candidate consistently superior (+4.0 pts)
      const pairs = createPairedObservations({
        count: 24,
        clusters: ['cluster_a', 'cluster_b', 'cluster_c', 'cluster_d'],
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
});
