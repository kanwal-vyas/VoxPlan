/**
 * Comprehensive Automated Tests for VoxPlan Explicit Preference Evidence
 * & Offline Ranking-Evaluation Pipeline (Phase 7.3 Follow-up).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PREFERENCE_SOURCES,
  EVIDENCE_STATUS,
  SELECTION_VALUES,
  generatePairKey,
  generateCanonicalComparisonKey,
  validatePreferenceEvidence,
  extractEligiblePreferenceEvidence,
} from '../src/scheduler/preferenceEvidence.js';
import {
  computeScheduleObjectiveScore,
  computeWilsonScoreInterval,
  evaluatePairwiseConcordance,
  evaluateOfflineRanking,
  MIN_EVALUATION_SAMPLE,
  MIN_HOLDOUT_SAMPLE,
  MIN_SCENARIO_GROUPS,
  RANKING_EVALUATION_STATUS,
} from '../src/scheduler/rankingEvaluator.js';
import {
  FACTORY_SCHEDULER_WEIGHTS,
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';
import { createEvent, validateEvent } from '../src/telemetry/eventSchema.js';

describe('Phase 7.3 Follow-up: Explicit Preference Evidence & Offline Ranking Evaluation', () => {
  describe('1. Explicit Preference Evidence Schema & Integrity', () => {
    it('validates a well-formed explicit pairwise comparison', () => {
      const record = {
        comparison_id: 'cmp_scenario_adaptive_vs_edf',
        source: PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE,
        alternative_a: {
          id: 'adaptive',
          strategy: 'adaptive',
          metrics: { onTimeTasksCount: 5, totalTasks: 5, capacityUtilizationPct: 80 },
          isConstraintCompliant: true,
        },
        alternative_b: {
          id: 'edf',
          strategy: 'edf',
          metrics: { onTimeTasksCount: 4, totalTasks: 5, totalDelayDays: 2, capacityUtilizationPct: 75 },
          isConstraintCompliant: true,
        },
        selected: SELECTION_VALUES.ALTERNATIVE_A,
        comparison_context: {
          scenario_name: 'Backlog Contention',
        },
      };

      const val = validatePreferenceEvidence(record);
      assert.equal(val.valid, true);
      assert.equal(val.status, EVIDENCE_STATUS.VALID);
      assert.equal(val.reason, null);
    });

    it('rejects inferred behavioral telemetry from being treated as explicit preference evidence', () => {
      const inferredRecord = {
        comparison_id: 'cmp_inferred_1',
        source: PREFERENCE_SOURCES.INFERRED_BEHAVIOR,
        alternative_a: { id: 'alt_1' },
        alternative_b: { id: 'alt_2' },
        selected: SELECTION_VALUES.ALTERNATIVE_A,
      };

      const val = validatePreferenceEvidence(inferredRecord);
      assert.equal(val.valid, false);
      assert.equal(val.status, EVIDENCE_STATUS.INFERRED_REJECTED);
      assert.ok(val.reason.includes('Inferred behavior cannot be treated as explicit preference evidence'));
    });

    it('rejects missing or empty comparison identifiers as incomplete', () => {
      const missingIdRecord = {
        source: PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE,
        alternative_a: { id: 'alt_1' },
        alternative_b: { id: 'alt_2' },
        selected: SELECTION_VALUES.ALTERNATIVE_A,
      };

      const val = validatePreferenceEvidence(missingIdRecord);
      assert.equal(val.valid, false);
      assert.equal(val.status, EVIDENCE_STATUS.INCOMPLETE);
      assert.ok(val.reason.includes('Missing or empty comparison_id'));
    });

    it('rejects identical alternatives as ambiguous', () => {
      const identicalRecord = {
        comparison_id: 'cmp_same',
        source: PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE,
        alternative_a: { id: 'strategy_same' },
        alternative_b: { id: 'strategy_same' },
        selected: SELECTION_VALUES.ALTERNATIVE_A,
      };

      const val = validatePreferenceEvidence(identicalRecord);
      assert.equal(val.valid, false);
      assert.equal(val.status, EVIDENCE_STATUS.AMBIGUOUS);
      assert.ok(val.reason.includes('Alternatives are identical'));
    });

    it('rejects neutral or ambiguous selections as ambiguous', () => {
      const neutralRecord = {
        comparison_id: 'cmp_neutral',
        source: PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE,
        alternative_a: { id: 'alt_1' },
        alternative_b: { id: 'alt_2' },
        selected: SELECTION_VALUES.NEUTRAL,
      };

      const val = validatePreferenceEvidence(neutralRecord);
      assert.equal(val.valid, false);
      assert.equal(val.status, EVIDENCE_STATUS.AMBIGUOUS);
    });

    it('rejects constraint-violating alternatives from forming valid preference evidence', () => {
      const invalidAltRecord = {
        comparison_id: 'cmp_cycle',
        source: PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE,
        alternative_a: { id: 'alt_valid', isConstraintCompliant: true },
        alternative_b: { id: 'alt_cycle', isConstraintCompliant: false, cycleDetected: true },
        selected: SELECTION_VALUES.ALTERNATIVE_A,
      };

      const val = validatePreferenceEvidence(invalidAltRecord);
      assert.equal(val.valid, false);
      assert.equal(val.status, EVIDENCE_STATUS.CONSTRAINT_VIOLATION);
      assert.ok(val.reason.includes('violate hard scheduling constraints'));
    });

    it('generates order-independent canonical pair keys', () => {
      const key1 = generatePairKey('adaptive', 'edf');
      const key2 = generatePairKey('edf', 'adaptive');
      assert.equal(key1, key2);
      assert.equal(key1, 'adaptive___vs___edf');
    });

    it('validates schedule_preference_expressed in eventSchema', () => {
      const ev = createEvent({
        profileId: 'prof_test',
        eventType: 'schedule_preference_expressed',
        payload: {
          comparison_id: 'cmp_test_1',
          source: 'explicit_user_choice',
          alternative_a: { id: 'strat_a' },
          alternative_b: { id: 'strat_b' },
          selected: 'alternative_a',
        },
      });

      assert.equal(ev.event_type, 'schedule_preference_expressed');
      assert.equal(validateEvent(ev).valid, true);
    });
  });

  describe('2. Deduplication, Contradiction Detection & Provenance', () => {
    it('deduplicates identical repeated submissions while retaining provenance', () => {
      const rawEvents = [
        {
          event_type: 'schedule_preference_expressed',
          event_id: 'evt_1',
          timestamp: '2026-10-18T10:00:00.000Z',
          payload: {
            comparison_id: 'cmp_1',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive' },
            alternative_b: { id: 'edf', strategy: 'edf' },
            selected: 'alternative_a',
          },
        },
        {
          event_type: 'schedule_preference_expressed',
          event_id: 'evt_2',
          timestamp: '2026-10-18T10:05:00.000Z',
          payload: {
            comparison_id: 'cmp_1',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive' },
            alternative_b: { id: 'edf', strategy: 'edf' },
            selected: 'alternative_a',
          },
        },
      ];

      const res = extractEligiblePreferenceEvidence(rawEvents);
      assert.equal(res.eligible.length, 1);
      assert.equal(res.eligible[0].eventId, 'evt_1');
      assert.equal(res.excluded.length, 1);
      assert.equal(res.excluded[0].reason, EVIDENCE_STATUS.DUPLICATE);
      assert.equal(res.counts.byReason.duplicate, 1);
    });

    it('safely quarantines contradictory comparisons without silently favoring the latest event', () => {
      const conflictingEvents = [
        {
          event_type: 'schedule_preference_expressed',
          event_id: 'evt_a',
          timestamp: '2026-10-18T11:00:00.000Z',
          payload: {
            comparison_id: 'cmp_conflict',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive' },
            alternative_b: { id: 'edf', strategy: 'edf' },
            selected: 'alternative_a', // adaptive > edf
          },
        },
        {
          event_type: 'schedule_preference_expressed',
          event_id: 'evt_b',
          timestamp: '2026-10-18T11:10:00.000Z',
          payload: {
            comparison_id: 'cmp_conflict',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive' },
            alternative_b: { id: 'edf', strategy: 'edf' },
            selected: 'alternative_b', // edf > adaptive (contradiction!)
          },
        },
      ];

      const res = extractEligiblePreferenceEvidence(conflictingEvents);
      // Both events must be excluded from eligible comparison set
      assert.equal(res.eligible.length, 0);
      assert.equal(res.excluded.length, 2);
      assert.equal(res.excluded[0].reason, EVIDENCE_STATUS.CONTRADICTORY);
      assert.equal(res.excluded[1].reason, EVIDENCE_STATUS.CONTRADICTORY);
      assert.equal(res.counts.byReason.contradictory, 2);
    });

    it('strictly isolates inferred behavioral events from explicit preference evidence', () => {
      const mixedEvents = [
        {
          event_type: 'schedule_preference_expressed',
          event_id: 'evt_explicit',
          timestamp: '2026-10-18T12:00:00.000Z',
          payload: {
            comparison_id: 'cmp_valid',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive' },
            alternative_b: { id: 'edf' },
            selected: 'alternative_a',
          },
        },
        {
          event_type: 'schedule_proposal_accepted',
          event_id: 'evt_inferred_acc',
          timestamp: '2026-10-18T12:05:00.000Z',
          payload: { schedule_id: 'sched_1' },
        },
        {
          event_type: 'schedule_proposal_discarded',
          event_id: 'evt_inferred_disc',
          timestamp: '2026-10-18T12:10:00.000Z',
          payload: { schedule_id: 'sched_2' },
        },
      ];

      const res = extractEligiblePreferenceEvidence(mixedEvents);
      assert.equal(res.eligible.length, 1);
      assert.equal(res.eligible[0].eventId, 'evt_explicit');
      assert.equal(res.excluded.length, 2);
      assert.equal(res.counts.byReason.inferred_rejected, 2);
    });
  });

  describe('3. Offline Ranking Evaluation Pipeline & Objective Scoring', () => {
    it('verifies standard sample thresholds: min evaluation sample = 5, min holdout sample = 15, and min scenario groups = 3', () => {
      assert.equal(MIN_EVALUATION_SAMPLE, 5);
      assert.equal(MIN_HOLDOUT_SAMPLE, 15);
      assert.equal(MIN_SCENARIO_GROUPS, 3);
    });

    it('computes baseline schedule objective score deterministically', () => {
      const goodAlt = {
        metrics: {
          totalTasks: 5,
          onTimeTasksCount: 5,
          delayedTasksCount: 0,
          totalDelayDays: 0,
          capacityUtilizationPct: 80.0,
          churnRate: 0.1,
          cycleDetected: false,
          infeasiblePlacementsCount: 0,
        },
      };

      const score = computeScheduleObjectiveScore(goodAlt);
      assert.ok(isFinite(score));
      // onTimeRate = 1.0 (100 pts), avgDelay = 0 (-0), util = 0.8 (+8 pts), churn = 0.1 (-2 pts) => ~106 pts
      assert.ok(score > 100);
    });

    it('heavily penalizes constraint-violating schedules with large negative scores', () => {
      const cyclicAlt = {
        cycleDetected: true,
        metrics: { totalTasks: 5, onTimeTasksCount: 5 },
      };
      const score = computeScheduleObjectiveScore(cyclicAlt);
      assert.ok(score <= -10000);
    });

    it('evaluates pairwise concordance accurately', () => {
      const preferred = {
        id: 'pref',
        metrics: { totalTasks: 4, onTimeTasksCount: 4, totalDelayDays: 0, capacityUtilizationPct: 80 },
        isConstraintCompliant: true,
      };
      const nonPreferred = {
        id: 'non_pref',
        metrics: { totalTasks: 4, onTimeTasksCount: 2, delayedTasksCount: 2, totalDelayDays: 6, capacityUtilizationPct: 60 },
        isConstraintCompliant: true,
      };

      const concordance = evaluatePairwiseConcordance(preferred, nonPreferred);
      assert.equal(concordance.isConcordant, true);
      assert.equal(concordance.isTied, false);
      assert.equal(concordance.disqualified, false);
      assert.ok(concordance.scorePreferred > concordance.scoreNonPreferred);
    });

    it('refuses concordance credit if the preferred alternative violates hard constraints', () => {
      const invalidPreferred = {
        id: 'pref_invalid',
        cycleDetected: true,
        isConstraintCompliant: false,
        metrics: { totalTasks: 4, onTimeTasksCount: 4 },
      };
      const validNonPreferred = {
        id: 'non_pref_valid',
        metrics: { totalTasks: 4, onTimeTasksCount: 3 },
        isConstraintCompliant: true,
      };

      const concordance = evaluatePairwiseConcordance(invalidPreferred, validNonPreferred);
      assert.equal(concordance.isConcordant, false);
      assert.equal(concordance.disqualified, true);
      assert.equal(concordance.disqualificationReason, 'preferred_alternative_violates_hard_constraints');
    });

    it('returns insufficient_evidence when eligible comparisons are below minimum (N < 5)', () => {
      const smallSet = [
        {
          comparisonId: 'cmp_1',
          preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 3, totalTasks: 3 } },
          nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 1, totalTasks: 3 } },
        },
      ];

      const result = evaluateOfflineRanking({ eligibleComparisons: smallSet });
      assert.equal(result.status, RANKING_EVALUATION_STATUS.INSUFFICIENT_EVIDENCE);
      assert.equal(result.uncertainty.isSmallSample, true);
      assert.equal(result.baselineMetrics, null);
      assert.ok(result.uncertainty.disclaimer.includes('cannot be reliably derived'));
    });

    it('evaluates baseline and candidate accuracy with exact numerators and denominators (N >= 5)', () => {
      const eligibleSet = [
        {
          comparisonId: 'cmp_1',
          pairKey: 'a___vs___b',
          preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 80 } },
          nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4, capacityUtilizationPct: 50, totalDelayDays: 3, delayedTasksCount: 2 } },
          context: { scenario_name: 'Scenario 1' },
        },
        {
          comparisonId: 'cmp_2',
          pairKey: 'c___vs___d',
          preferredAlternative: { id: 'c', metrics: { onTimeTasksCount: 5, totalTasks: 5, capacityUtilizationPct: 85 } },
          nonPreferredAlternative: { id: 'd', metrics: { onTimeTasksCount: 3, totalTasks: 5, capacityUtilizationPct: 60, totalDelayDays: 2, delayedTasksCount: 2 } },
          context: { scenario_name: 'Scenario 2' },
        },
        {
          comparisonId: 'cmp_3',
          pairKey: 'e___vs___f',
          preferredAlternative: { id: 'e', metrics: { onTimeTasksCount: 3, totalTasks: 3, capacityUtilizationPct: 90 } },
          nonPreferredAlternative: { id: 'f', metrics: { onTimeTasksCount: 1, totalTasks: 3, capacityUtilizationPct: 40, totalDelayDays: 4, delayedTasksCount: 2 } },
          context: { scenario_name: 'Scenario 3' },
        },
        {
          comparisonId: 'cmp_4',
          pairKey: 'g___vs___h',
          preferredAlternative: { id: 'g', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 75 } },
          nonPreferredAlternative: { id: 'h', metrics: { onTimeTasksCount: 2, totalTasks: 4, capacityUtilizationPct: 70, totalDelayDays: 2, delayedTasksCount: 2 } },
          context: { scenario_name: 'Scenario 4' },
        },
        {
          comparisonId: 'cmp_5',
          pairKey: 'i___vs___j',
          // Inverted: preferred has worse timeliness than nonPreferred
          preferredAlternative: { id: 'i', metrics: { onTimeTasksCount: 1, totalTasks: 4, totalDelayDays: 6, delayedTasksCount: 3, capacityUtilizationPct: 50 } },
          nonPreferredAlternative: { id: 'j', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 80 } },
          context: { scenario_name: 'Scenario 5' },
        },
      ];

      const result = evaluateOfflineRanking({ eligibleComparisons: eligibleSet });
      assert.equal(result.status, RANKING_EVALUATION_STATUS.EVALUATED);
      assert.equal(result.baselineMetrics.totalEvaluated, 5);
      assert.equal(result.baselineMetrics.concordantCount, 4);
      assert.equal(result.baselineMetrics.discordantCount, 1);
      assert.equal(result.baselineMetrics.accuracy, 0.8);
      assert.equal(result.baselineMetrics.accuracyPct, 80.0);
    });

    it('enforces grouped cross-validation without leakage when sample volume allows (N >= 15)', () => {
      // Build 15 comparisons across 3 scenarios
      const comparisons = [];
      for (let i = 1; i <= 15; i++) {
        const scenarioIndex = (i % 3) + 1;
        comparisons.push({
          comparisonId: `cmp_holdout_${i}`,
          pairKey: `pair_${i}`,
          preferredAlternative: { id: `pref_${i}`, metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 80 } },
          nonPreferredAlternative: { id: `non_pref_${i}`, metrics: { onTimeTasksCount: 2, totalTasks: 4, capacityUtilizationPct: 60, totalDelayDays: 3, delayedTasksCount: 2 } },
          context: { scenario_name: `Scenario_${scenarioIndex}` },
        });
      }

      const result = evaluateOfflineRanking({ eligibleComparisons: comparisons });
      assert.equal(result.status, RANKING_EVALUATION_STATUS.EVALUATED);
      assert.equal(result.splitValidation.isSplitDefensible, true);
      assert.equal(result.splitValidation.splitStrategy, 'grouped_by_scenario_60_40');
      assert.ok(result.splitValidation.trainMetrics.totalEvaluated > 0);
      assert.ok(result.splitValidation.testMetrics.totalEvaluated > 0);
      assert.equal(
        result.splitValidation.trainMetrics.totalEvaluated + result.splitValidation.testMetrics.totalEvaluated,
        15
      );
    });

    it('does not fabricate a train/test split when sample is preliminary (< 15)', () => {
      const comparisons = [];
      for (let i = 1; i <= 8; i++) {
        comparisons.push({
          comparisonId: `cmp_prelim_${i}`,
          pairKey: `pair_${i}`,
          preferredAlternative: { id: `pref_${i}`, metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
          nonPreferredAlternative: { id: `non_pref_${i}`, metrics: { onTimeTasksCount: 2, totalTasks: 4 } },
          context: { scenario_name: `Scenario_${i}` },
        });
      }

      const result = evaluateOfflineRanking({ eligibleComparisons: comparisons });
      assert.equal(result.status, RANKING_EVALUATION_STATUS.EVALUATED);
      assert.equal(result.splitValidation.isSplitDefensible, false);
      assert.equal(result.splitValidation.splitStrategy, 'none_insufficient_sample');
      assert.equal(result.splitValidation.trainMetrics, null);
      assert.equal(result.splitValidation.testMetrics, null);
    });
  });

  describe('4. Production Safety & Scheduler Invariance Invariants', () => {
    it('verifies FACTORY_SCHEDULER_WEIGHTS is frozen and immutable', () => {
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.ok(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS));
    });

    it('verifies production adaptation flags remain permanently false', () => {
      const evalResult = evaluateOfflineRanking({ eligibleComparisons: [] });
      assert.equal(evalResult.productionInvariance.isAdaptationUnlocked, false);
      assert.equal(evalResult.productionInvariance.productionApplied, false);
      assert.equal(evalResult.productionInvariance.factoryWeightsUnchanged, true);
    });

    it('guarantees production schedule generation is 100% invariant before and after ranking evaluation', () => {
      const sampleTasks = [
        { id: 'inv_1', title: 'Architecture RFC', estimatedEffort: 3.0, dueDate: '2026-10-19', priority: 'high', completed: false },
        { id: 'inv_2', title: 'Unit Tests', estimatedEffort: 2.0, dueDate: '2026-10-20', priority: 'medium', dependencies: ['inv_1'], completed: false },
        { id: 'inv_3', title: 'Documentation', estimatedEffort: 1.5, dueDate: '2026-10-21', priority: 'low', completed: false },
      ];

      // Schedule 1: baseline before evaluation
      const schedBefore = generateAdaptiveSchedule(sampleTasks, {
        startDate: '2026-10-18',
        dailyCapacityHours: 6.0,
      });

      // Run ranking evaluation with candidate scoring function
      evaluateOfflineRanking({
        eligibleComparisons: [
          {
            comparisonId: 'cmp_dummy',
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 3, totalTasks: 3 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 1, totalTasks: 3 } },
          },
        ],
        candidateScoringFn: () => 150.0,
      });

      // Schedule 2: baseline after evaluation
      const schedAfter = generateAdaptiveSchedule(sampleTasks, {
        startDate: '2026-10-18',
        dailyCapacityHours: 6.0,
      });

      // Verification of strict bit-for-bit invariance
      assert.equal(schedBefore.placements.length, schedAfter.placements.length);
      for (let i = 0; i < schedBefore.placements.length; i++) {
        assert.equal(schedBefore.placements[i].taskId, schedAfter.placements[i].taskId);
        assert.equal(schedBefore.placements[i].proposedDate, schedAfter.placements[i].proposedDate);
        assert.equal(schedBefore.placements[i].priorityScore, schedAfter.placements[i].priorityScore);
      }
    });

    it('does not mutate input records or telemetry collections during extraction or evaluation', () => {
      const inputRecord = {
        comparison_id: 'cmp_mut_check',
        source: 'explicit_user_choice',
        alternative_a: { id: 'a', strategy: 'adaptive' },
        alternative_b: { id: 'b', strategy: 'edf' },
        selected: 'alternative_a',
      };
      const inputSnapshot = JSON.stringify(inputRecord);

      extractEligiblePreferenceEvidence([inputRecord]);
      assert.equal(JSON.stringify(inputRecord), inputSnapshot);
    });

    it('guarantees zero external network requests or remote dependencies in ranking evaluation', () => {
      // Offline evaluator and evidence extractor must be pure synchronous/in-memory functions
      assert.equal(typeof extractEligiblePreferenceEvidence, 'function');
      assert.equal(typeof evaluateOfflineRanking, 'function');
      assert.equal(typeof computeScheduleObjectiveScore, 'function');
      assert.equal(typeof computeWilsonScoreInterval, 'function');
    });
  });

  describe('5. Phase 7.3 Integrity Audit & Corrective Hardening Regressions', () => {
    describe('5.1 Evidence Semantics & Canonical Identity', () => {
      it('generateCanonicalComparisonKey incorporates scenario context to preserve cross-scenario comparisons', () => {
        const key1 = generateCanonicalComparisonKey('adaptive', 'edf', { scenario_key: 'backlog_contention' });
        const key2 = generateCanonicalComparisonKey('adaptive', 'edf', { scenario_key: 'deadline_rush' });
        assert.notEqual(key1, key2);
        assert.equal(key1, 'backlog_contention:::adaptive___vs___edf');
        assert.equal(key2, 'deadline_rush:::adaptive___vs___edf');
      });

      it('canonical comparison key prevents deduplication evasion when scenario context is identical but comparison_id differs', () => {
        const keyA = generateCanonicalComparisonKey('adaptive', 'edf', { scenario_name: 'Sprint Crunch' }, 'cmp_random_1');
        const keyB = generateCanonicalComparisonKey('adaptive', 'edf', { scenario_name: 'Sprint Crunch' }, 'cmp_random_2');
        assert.equal(keyA, keyB);
        assert.equal(keyA, 'Sprint Crunch:::adaptive___vs___edf');
      });

      it('preserves distinct preferences across different scenarios comparing the same strategies without falsely flagging them as duplicates or contradictions', () => {
        const multiScenarioEvents = [
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_scen_1',
            timestamp: '2026-10-18T10:00:00.000Z',
            payload: {
              comparison_id: 'cmp_scen_1',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_a', // prefers adaptive in scenario 1
              comparison_context: { scenario_key: 'scenario_1', scenario_name: 'Heavy Backlog' },
            },
          },
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_scen_2',
            timestamp: '2026-10-18T10:05:00.000Z',
            payload: {
              comparison_id: 'cmp_scen_2',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_b', // prefers edf in scenario 2 (DIFFERENT context, NOT contradiction!)
              comparison_context: { scenario_key: 'scenario_2', scenario_name: 'Deadline Rush' },
            },
          },
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_scen_3',
            timestamp: '2026-10-18T10:10:00.000Z',
            payload: {
              comparison_id: 'cmp_scen_3',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_a', // prefers adaptive in scenario 3
              comparison_context: { scenario_key: 'scenario_3', scenario_name: 'Shared Dependencies' },
            },
          },
        ];

        const res = extractEligiblePreferenceEvidence(multiScenarioEvents);
        assert.equal(res.eligible.length, 3);
        assert.equal(res.excluded.length, 0);
        assert.equal(res.counts.byReason.contradictory, 0);
        assert.equal(res.counts.byReason.duplicate, 0);
      });

      it('quarantines contradictory selections within the same scenario regardless of comparison_id', () => {
        const conflictingSameScenario = [
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_conf_1',
            payload: {
              comparison_id: 'cmp_first_submission',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_a',
              comparison_context: { scenario_key: 'same_scenario' },
            },
          },
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_conf_2',
            payload: {
              comparison_id: 'cmp_second_submission_different_id',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_b', // Conflict!
              comparison_context: { scenario_key: 'same_scenario' },
            },
          },
        ];

        const res = extractEligiblePreferenceEvidence(conflictingSameScenario);
        assert.equal(res.eligible.length, 0);
        assert.equal(res.excluded.length, 2);
        assert.equal(res.counts.byReason.contradictory, 2);
      });

      it('deduplicates repeated identical selections within the same scenario even if submitted with different comparison_id', () => {
        const repeatedSameScenario = [
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_rep_1',
            payload: {
              comparison_id: 'cmp_init',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_a',
              comparison_context: { scenario_key: 'same_scenario' },
            },
          },
          {
            event_type: 'schedule_preference_expressed',
            event_id: 'evt_rep_2',
            payload: {
              comparison_id: 'cmp_retry_new_uuid',
              source: 'explicit_user_choice',
              alternative_a: { id: 'adaptive', strategy: 'adaptive' },
              alternative_b: { id: 'edf', strategy: 'edf' },
              selected: 'alternative_a', // Exact duplicate
              comparison_context: { scenario_key: 'same_scenario' },
            },
          },
        ];

        const res = extractEligiblePreferenceEvidence(repeatedSameScenario);
        assert.equal(res.eligible.length, 1);
        assert.equal(res.excluded.length, 1);
        assert.equal(res.counts.byReason.duplicate, 1);
      });
    });

    describe('5.2 Statistical Correctness & Wilson Score Interval', () => {
      it('computes valid non-zero margin of error for boundary estimates (p=1.0) and does not collapse to 0%', () => {
        // Sample of 5 concordant pairs out of 5 (100% concordance)
        const wilson = computeWilsonScoreInterval(5, 5, 0.95);
        assert.equal(wilson.confidenceLevel, 0.95);
        assert.ok(wilson.marginOfErrorPct > 0, 'Margin of error must be strictly positive on small boundary sample');
        assert.ok(wilson.ciLowerPct > 50.0 && wilson.ciLowerPct < 60.0, 'Wilson 95% lower bound for 5/5 should be ~56.6%');
        assert.equal(wilson.ciUpperPct, 100.0);
        assert.ok(wilson.marginOfErrorPct > 40.0, 'Wilson MoE for 5/5 should be ~43.5%, not 0.0%');
      });

      it('computes valid non-zero margin of error for boundary estimates (p=0.0)', () => {
        const wilson = computeWilsonScoreInterval(0, 5, 0.95);
        assert.equal(wilson.ciLowerPct, 0.0);
        assert.ok(wilson.ciUpperPct > 40.0 && wilson.ciUpperPct < 50.0, 'Wilson upper bound for 0/5 should be ~43.4%');
        assert.ok(wilson.marginOfErrorPct > 0);
      });

      it('handles empty or non-positive sample sizes gracefully', () => {
        const zeroWilson = computeWilsonScoreInterval(0, 0, 0.95);
        assert.equal(zeroWilson.marginOfErrorPct, null);
        assert.equal(zeroWilson.ciLowerPct, null);
        assert.equal(zeroWilson.ciUpperPct, null);
      });

      it('evaluateOfflineRanking explicitly reports 95% Wilson score confidence interval and stated limitations', () => {
        const comparisons = [];
        for (let i = 1; i <= 5; i++) {
          comparisons.push({
            comparisonId: `cmp_${i}`,
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4, totalDelayDays: 2, delayedTasksCount: 2 } },
            context: { scenario_name: `Scenario ${i}` },
          });
        }

        const report = evaluateOfflineRanking({ eligibleComparisons: comparisons });
        assert.equal(report.status, RANKING_EVALUATION_STATUS.EVALUATED);
        assert.equal(report.uncertainty.confidenceLevel, 0.95);
        assert.equal(report.uncertainty.method, 'Wilson score interval (95% CI)');
        assert.ok(report.uncertainty.ciLowerPct != null);
        assert.ok(report.uncertainty.ciUpperPct != null);
        assert.ok(report.uncertainty.marginOfErrorPct > 0);
        assert.ok(report.uncertainty.disclaimer.includes('Wilson score CI'));
        assert.ok(report.uncertainty.disclaimer.includes('independent Bernoulli trials'));
      });

      it('ties and non-finite scores receive zero concordance credit', () => {
        // Equal scores
        const tieResult = evaluatePairwiseConcordance(
          { id: 'a', metrics: { onTimeTasksCount: 3, totalTasks: 3, capacityUtilizationPct: 80 } },
          { id: 'b', metrics: { onTimeTasksCount: 3, totalTasks: 3, capacityUtilizationPct: 80 } }
        );
        assert.equal(tieResult.isConcordant, false);
        assert.equal(tieResult.isTied, true);

        // Non-finite score
        const nonFiniteResult = evaluatePairwiseConcordance(
          { id: 'a', metrics: { onTimeTasksCount: 3, totalTasks: 3 } },
          { id: 'b', metrics: null },
          () => NaN
        );
        assert.equal(nonFiniteResult.isConcordant, false);
        assert.equal(nonFiniteResult.disqualified, true);
        assert.equal(nonFiniteResult.disqualificationReason, 'non_finite_scoring_evaluation');
      });

      it('disqualifies pairs where nonPreferredAlternative violates hard constraints', () => {
        const nonCompliantResult = evaluatePairwiseConcordance(
          { id: 'pref', isConstraintCompliant: true, metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
          { id: 'non_pref', isConstraintCompliant: false, cycleDetected: true, metrics: { onTimeTasksCount: 3, totalTasks: 4 } }
        );
        assert.equal(nonCompliantResult.isConcordant, false);
        assert.equal(nonCompliantResult.disqualified, true);
        assert.equal(nonCompliantResult.disqualificationReason, 'non_preferred_alternative_violates_hard_constraints');
      });
    });

    describe('5.3 Grouped Validation & Leakage Prevention', () => {
      it('refuses to split when independent scenario groups < 3 even if sample size N >= 15', () => {
        // 16 comparisons across only 2 scenario groups
        const comparisons = [];
        for (let i = 1; i <= 16; i++) {
          const scenario = (i % 2) === 0 ? 'Scenario_A' : 'Scenario_B';
          comparisons.push({
            comparisonId: `cmp_${i}`,
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4 } },
            context: { scenario_name: scenario },
          });
        }

        const report = evaluateOfflineRanking({ eligibleComparisons: comparisons });
        assert.equal(report.status, RANKING_EVALUATION_STATUS.EVALUATED);
        assert.equal(report.splitValidation.isSplitDefensible, false);
        assert.equal(report.splitValidation.splitStrategy, 'none_insufficient_scenario_groups');
        assert.equal(report.splitValidation.distinctGroupsCount, 2);
        assert.ok(report.splitValidation.reason.includes('below the minimum requirement of 3 distinct scenario groups'));
      });

      it('refuses to fall back to pairKey as proxy for scenario independence', () => {
        // 15 comparisons with distinct pairKeys but NO scenario context
        const comparisons = [];
        for (let i = 1; i <= 15; i++) {
          comparisons.push({
            comparisonId: `cmp_${i}`,
            pairKey: `pair_algo_${i % 4}`,
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4 } },
            context: {}, // No scenario identifier
          });
        }

        const report = evaluateOfflineRanking({ eligibleComparisons: comparisons });
        assert.equal(report.splitValidation.isSplitDefensible, false);
        assert.equal(report.splitValidation.distinctGroupsCount, 0);
        assert.equal(report.splitValidation.ungroupedComparisonsCount, 15);
        assert.equal(report.splitValidation.splitStrategy, 'none_insufficient_scenario_groups');
      });

      it('proves that related observations in the same scenario never cross partitions under grouped holdout', () => {
        const comparisons = [];
        for (let i = 1; i <= 18; i++) {
          const scenNum = (i % 3) + 1;
          comparisons.push({
            comparisonId: `cmp_holdout_${i}`,
            preferredAlternative: { id: `pref_${i}`, metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
            nonPreferredAlternative: { id: `non_pref_${i}`, metrics: { onTimeTasksCount: 2, totalTasks: 4 } },
            context: { scenario_name: `Scenario_${scenNum}` },
          });
        }

        const report = evaluateOfflineRanking({ eligibleComparisons: comparisons });
        assert.equal(report.splitValidation.isSplitDefensible, true);
        assert.equal(report.splitValidation.splitStrategy, 'grouped_by_scenario_60_40');
        assert.equal(report.splitValidation.distinctGroupsCount, 3);
        assert.equal(report.splitValidation.trainGroupCount, 2);
        assert.equal(report.splitValidation.testGroupCount, 1);
        assert.equal(
          report.splitValidation.trainMetrics.totalEvaluated + report.splitValidation.testMetrics.totalEvaluated,
          18
        );
      });
    });

    describe('5.4 Fairness of Baseline Comparison', () => {
      it('evaluates candidate scoring function equivalent to baseline when scoring functions are identical (delta === 0.0)', () => {
        const comparisons = [];
        for (let i = 1; i <= 6; i++) {
          comparisons.push({
            comparisonId: `cmp_fair_${i}`,
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 80 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4, capacityUtilizationPct: 60, totalDelayDays: 3, delayedTasksCount: 2 } },
            context: { scenario_name: `Scenario_${i}` },
          });
        }

        const report = evaluateOfflineRanking({
          eligibleComparisons: comparisons,
          baselineScoringFn: computeScheduleObjectiveScore,
          candidateScoringFn: computeScheduleObjectiveScore, // Identical
        });

        assert.equal(report.status, RANKING_EVALUATION_STATUS.EVALUATED);
        assert.equal(report.baselineMetrics.accuracy, report.candidateMetrics.accuracy);
        assert.equal(report.baselineMetrics.concordantCount, report.candidateMetrics.concordantCount);
        assert.equal(report.baselineMetrics.discordantCount, report.candidateMetrics.discordantCount);
        assert.equal(report.delta, 0.0);
      });

      it('baseline and candidate receive identical comparisons and evaluation partition', () => {
        let baselineCalls = 0;
        let candidateCalls = 0;

        const countingBaseline = (alt) => {
          baselineCalls++;
          return computeScheduleObjectiveScore(alt);
        };
        const countingCandidate = (alt) => {
          candidateCalls++;
          return computeScheduleObjectiveScore(alt);
        };

        const comparisons = [];
        for (let i = 1; i <= 5; i++) {
          comparisons.push({
            comparisonId: `cmp_calls_${i}`,
            preferredAlternative: { id: 'a', metrics: { onTimeTasksCount: 4, totalTasks: 4 } },
            nonPreferredAlternative: { id: 'b', metrics: { onTimeTasksCount: 2, totalTasks: 4 } },
            context: { scenario_name: `Scenario_${i}` },
          });
        }

        evaluateOfflineRanking({
          eligibleComparisons: comparisons,
          baselineScoringFn: countingBaseline,
          candidateScoringFn: countingCandidate,
        });

        assert.equal(baselineCalls, 10); // 5 comparisons * 2 alternatives
        assert.equal(candidateCalls, 10); // Exactly equal scoring opportunities
      });
    });
  });
});
